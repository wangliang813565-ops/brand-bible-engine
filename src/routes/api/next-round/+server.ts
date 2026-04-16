// POST /api/next-round — 生成下一轮 4 题
// 输入: { session_id }
// 输出: { questions: [{id, question, options, rationale}], goal, round_index }

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getAnswers, updateSession, insertQuestions, getPendingQuestionsForRound } from '$lib/db';
import { generateQuestions } from '$lib/question-generator';
import { evaluateCompletion } from '$lib/completion-evaluator';
import { composeBible } from '$lib/bible-composer';
import { RESEARCH_GOALS, type GoalId } from '$lib/research-goals';
import { readCreds, getTenantAccessToken, createBitableRecord } from '$lib/feishu';
import { generateRecap } from '$lib/recap-generator';

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) throw error(500, 'D1 not bound');
	if (!platform.env.GEMINI_API_KEY) throw error(500, 'GEMINI_API_KEY not set');

	const body = await request.json().catch(() => ({}));
	const sessionId = (body as any).session_id;
	if (!sessionId) throw error(400, 'missing session_id');

	const session = await getSession(platform.env.DB, sessionId);
	if (!session) throw error(404, 'session not found');

	if (session.status === 'completed') {
		return json({
			done: true,
			bible_markdown: session.bible_markdown,
			goal_coverage: JSON.parse(session.goal_coverage)
		});
	}

	const allAnswers = await getAnswers(platform.env.DB, sessionId);

	// 转为 AnswerHistory 格式（只包括已回答的）
	const answeredHistory = allAnswers
		.filter((a) => a.selected_option !== null)
		.map((a) => ({
			goal: a.goal as GoalId,
			question: a.question,
			selected: a.selected_option || '',
			custom_text: a.custom_text
		}));

	// 检查当前 round 是不是已经出过题了（前端刷新 / 返回时）
	const pendingThisRound = await getPendingQuestionsForRound(
		platform.env.DB,
		sessionId,
		session.current_goal as GoalId,
		session.current_goal_round + 1
	);

	if (pendingThisRound.length > 0) {
		return json({
			done: false,
			goal: session.current_goal,
			goal_name: RESEARCH_GOALS[session.current_goal as GoalId].name,
			round_index: session.current_goal_round + 1,
			total_questions: session.total_questions,
			goal_coverage: JSON.parse(session.goal_coverage),
			questions: pendingThisRound.map((q) => ({
				id: q.id,
				question: q.question,
				input_type: q.input_type,
				options: JSON.parse(q.options),
				placeholder: q.placeholder,
				rationale: q.rationale,
				selected_option: q.selected_option,
				selected_index: q.selected_index,
				custom_text: q.custom_text
			}))
		});
	}

	// ====== 评估上一轮后决定下一步 ======
	let mode: 'normal' | 'deeper' | 'clarify' = 'normal';
	let nextGoal: GoalId = session.current_goal as GoalId;
	let nextRoundIndex = session.current_goal_round + 1;
	let lastRoundRecap = '';

	if (session.current_goal_round > 0) {
		// 上一轮的 4 个答案
		const lastRoundAnswers = answeredHistory.filter(
			(a) => a.goal === (session.current_goal as GoalId)
		).slice(-4);

		// 并行：评估完成度 + 生成点评（两个都要调 Gemini Flash）
		const [evaluation, recap] = await Promise.all([
			evaluateCompletion(
				platform.env.GEMINI_API_KEY,
				session.current_goal as GoalId,
				session.current_goal_round,
				answeredHistory
			),
			generateRecap(
				platform.env.GEMINI_API_KEY,
				session.current_goal as GoalId,
				lastRoundAnswers
			)
		]);
		lastRoundRecap = recap;

		// 更新覆盖度
		const coverage = JSON.parse(session.goal_coverage);
		coverage[session.current_goal] = evaluation.coverage_score;

		if (evaluation.decision.action === 'wrap_up') {
			// 所有目标都够了 → 生成品牌圣经
			const bible = await composeBible(platform.env.GEMINI_API_KEY, {
				brand_name: session.brand_name || '（未命名品牌）',
				all_answers: answeredHistory,
				goal_coverage: coverage
			});

			// 同步到飞书 Bitable（异步，不阻塞响应）
			let feishuRecordId: string | null = null;
			const feishuCreds = readCreds(platform.env as any);
			if (feishuCreds) {
				try {
					const { token } = await getTenantAccessToken(feishuCreds);

					// 收集所有附件的 file_token
					const allAttachments: { file_token: string }[] = [];
					for (const a of allAnswers) {
						if (a.attachments) {
							try {
								const list = JSON.parse(a.attachments) as any[];
								for (const att of list) {
									if (att.file_token) allAttachments.push({ file_token: att.file_token });
								}
							} catch {}
						}
					}

					// 整理硬档案（profile 板块的答案）
					const profileAnswers = answeredHistory
						.filter((a) => a.goal === 'profile')
						.map((a) => `${a.question}\n  → ${a.custom_text || a.selected}`)
						.join('\n\n');

					// 整理完整问答记录
					const fullQA = answeredHistory
						.map(
							(a, i) =>
								`[${a.goal}] Q${i + 1}: ${a.question}\n  → ${a.custom_text || a.selected}`
						)
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
							硬档案: profileAnswers || '（无 profile 答案）',
							完整问答记录: fullQA.slice(0, 50000), // 飞书文本字段上限保守估计
							品牌圣经Markdown: bible.slice(0, 50000)
						}
					);
					feishuRecordId = result.record_id;
				} catch (e: any) {
					console.error('[feishu sync] failed:', e.message);
					// 失败不阻塞，D1 里的数据仍然完整
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
				feishu_record_id: feishuRecordId,
				last_round_recap: lastRoundRecap
			});
		}

		if (evaluation.decision.action === 'switch_goal') {
			nextGoal = evaluation.decision.next_goal;
			nextRoundIndex = 1;
			await updateSession(platform.env.DB, sessionId, {
				current_goal: nextGoal,
				current_goal_round: 0, // 会在下面递增
				goal_coverage: JSON.stringify(coverage)
			});
		} else {
			mode = evaluation.decision.mode;
			await updateSession(platform.env.DB, sessionId, {
				goal_coverage: JSON.stringify(coverage)
			});
		}
	}

	// ====== 生成 4 题 ======
	const questions = await generateQuestions(
		platform.env.GEMINI_API_KEY,
		nextGoal,
		nextRoundIndex - 1, // 传入已经问过的轮数
		answeredHistory,
		mode
	);

	// 存入数据库
	await insertQuestions(platform.env.DB, sessionId, nextGoal, nextRoundIndex, questions);

	// 更新 session
	await updateSession(platform.env.DB, sessionId, {
		current_goal: nextGoal,
		current_goal_round: nextRoundIndex,
		total_rounds: session.total_rounds + 1,
		total_questions: session.total_questions + 4
	});

	// 取回刚插入的带 id 的题目
	const insertedQuestions = await getPendingQuestionsForRound(
		platform.env.DB,
		sessionId,
		nextGoal,
		nextRoundIndex
	);

	return json({
		done: false,
		goal: nextGoal,
		goal_name: RESEARCH_GOALS[nextGoal].name,
		round_index: nextRoundIndex,
		total_questions: session.total_questions + 4,
		goal_coverage: JSON.parse(session.goal_coverage),
		mode,
		last_round_recap: lastRoundRecap,
		questions: insertedQuestions.map((q) => ({
			id: q.id,
			question: q.question,
			input_type: q.input_type,
			options: JSON.parse(q.options),
			placeholder: q.placeholder,
			rationale: q.rationale
		}))
	});
};
