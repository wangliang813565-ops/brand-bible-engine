// POST /api/answer — 提交一道题的答案
// 输入: { answer_id, selected_index, selected_option, custom_text? }

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordAnswer } from '$lib/db';

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) throw error(500, 'D1 not bound');

	const body = (await request.json()) as any;
	const { answer_id, selected_index, selected_option, custom_text, attachments } = body;

	if (!answer_id || selected_index === undefined || !selected_option) {
		throw error(400, 'missing fields');
	}

	await recordAnswer(
		platform.env.DB,
		answer_id,
		selected_index,
		selected_option,
		custom_text || null,
		attachments ? JSON.stringify(attachments) : null
	);

	return json({ ok: true });
};
