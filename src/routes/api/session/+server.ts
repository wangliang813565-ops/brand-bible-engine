// POST /api/session — 创建新 session
// GET /api/session?id=xxx — 获取 session 状态

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSession, getSession, getAnswers } from '$lib/db';

function uuid() {
	// Cloudflare Workers 支持 crypto.randomUUID()
	return crypto.randomUUID();
}

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) throw error(500, 'D1 not bound');

	const body = await request.json().catch(() => ({}));
	const brandName = (body as any).brand_name || null;

	const sessionId = uuid();
	const session = await createSession(platform.env.DB, sessionId, brandName);

	return json({ session_id: sessionId, session });
};

export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.DB) throw error(500, 'D1 not bound');

	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'missing id');

	const session = await getSession(platform.env.DB, id);
	if (!session) throw error(404, 'session not found');

	const answers = await getAnswers(platform.env.DB, id);

	return json({ session, answers });
};
