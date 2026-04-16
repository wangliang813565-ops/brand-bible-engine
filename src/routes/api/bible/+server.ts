// GET /api/bible?id=xxx — 下载品牌圣经 Markdown

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession } from '$lib/db';

export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.DB) throw error(500, 'D1 not bound');

	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'missing id');

	const session = await getSession(platform.env.DB, id);
	if (!session) throw error(404, 'session not found');
	if (!session.bible_markdown) throw error(409, 'bible not generated yet');

	const brandName = session.brand_name || 'brand';
	const date = new Date().toISOString().slice(0, 10);
	const filename = `${brandName.replace(/[^a-zA-Z0-9-_]/g, '')}-bible-${date}.md`;

	return new Response(session.bible_markdown, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
