// POST /api/skip-profile — 用户选择跳过整个档案板块，直接走 wrap_up 生成圣经
// 只在 current_goal === 'profile' 时有效

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getAnswers, updateSession } from '$lib/db';
import { composeBible } from '$lib/bible-composer';
import { readCreds, getTenantAccessToken, createBitableRecord } from '$lib/feishu';
import type { GoalId } from '$lib/research-goals';

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) throw error(500, 'D1 not bound');
	if (!platform.env.GEMINI_API_KEY) throw error(500, 'GEMINI_API_KEY not set');

	const body = await request.json().catch(() => ({}));
	const sessionId = (body as any).session_id;
	if (!sessionId) throw error(400, 'missing session_id');

	const session = await getSession(platform.env.DB, sessionId);
	if (!session) throw error(404, 'session not found');
	if (session.current_goal !== 'profile') {
		throw error(409, '不在档案板块，无法跳过');
	}
	if (session.status === 'completed') {
		return json({ ok: true, bible_markdown: session.bible_markdown });
	}

	const allAnswers = await getAnswers(platform.env.DB, sessionId);
	const answeredHistory = allAnswers
		.filter((a) => a.selected_option !== null)
		.map((a) => ({
			goal: a.goal as GoalId,
			question: a.question,
			selected: a.selected_option || '',
			custom_text: a.custom_text
		}));

	const coverage = JSON.parse(session.goal_coverage);
	coverage.profile = 0; // 明确标记"跳过"

	// 生成圣经
	const bible = await composeBible(platform.env.GEMINI_API_KEY, {
		brand_name: session.brand_name || '（未命名品牌）',
		all_answers: answeredHistory,
		goal_coverage: coverage
	});

	// 同步飞书
	let feishuRecordId: string | null = null;
	const feishuCreds = readCreds(platform.env as any);
	if (feishuCreds) {
		try {
			const { token } = await getTenantAccessToken(feishuCreds);
			const allAttachments: { file_token: string }[] = [];
			for (const a of allAnswers) {
				if (a.attachments) {
					try {
						const list = JSON.parse(a.attachments) as any[];
						for (const att of list) if (att.file_token) allAttachments.push({ file_token: att.file_token });
					} catch {}
				}
			}
			const fullQA = answeredHistory
				.map((a, i) => `[${a.goal}] Q${i + 1}: ${a.question}\n  → ${a.custom_text || a.selected}`)
				.join('\n\n');
			const result = await createBitableRecord(
				token,
				feishuCreds.bitable_app_token,
				feishuCreds.bitable_table_id,
				{
					session_id: sessionId,
					品牌名: session.brand_name || '（未命名）',
					答题总数: answeredHistory.length,
					完成时间: Date.now(),
					附件: allAttachments,
					硬档案: '（用户跳过了档案板块）',
					完整问答记录: fullQA.slice(0, 50000),
					品牌圣经Markdown: bible.slice(0, 50000)
				}
			);
			feishuRecordId = result.record_id;
		} catch (e: any) {
			console.error('[feishu sync] failed:', e.message);
		}
	}

	await updateSession(platform.env.DB, sessionId, {
		status: 'completed',
		bible_markdown: bible,
		goal_coverage: JSON.stringify(coverage),
		completed_at: Date.now(),
		...(feishuRecordId ? { feishu_record_id: feishuRecordId, feishu_synced_at: Date.now() } : {})
	});

	return json({
		done: true,
		bible_markdown: bible,
		goal_coverage: coverage,
		feishu_record_id: feishuRecordId
	});
};
