// POST /api/upload — 上传文件到飞书 Bitable 附件字段
// 前端用 multipart/form-data 传 file
// 返回 { file_token, name, size }

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readCreds, getTenantAccessToken, uploadToBitable } from '$lib/feishu';

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/gif',
	'image/webp',
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'text/plain',
	'text/csv'
];

export const POST: RequestHandler = async ({ request, platform }) => {
	const creds = readCreds(platform?.env as any);
	if (!creds) {
		throw error(503, '飞书凭证未配置。请管理员设置 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BITABLE_APP_TOKEN / FEISHU_BITABLE_TABLE_ID');
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw error(400, '请用 multipart/form-data 上传');
	}

	const file = form.get('file') as unknown as File | null;
	if (!file) throw error(400, '缺少 file 字段');

	if (file.size > MAX_UPLOAD_SIZE) {
		throw error(413, `文件过大，最大 ${MAX_UPLOAD_SIZE / 1024 / 1024}MB`);
	}

	if (file.type && !ALLOWED_TYPES.includes(file.type)) {
		// 允许但提示
		console.warn(`[upload] unusual type: ${file.type}`);
	}

	try {
		const { token } = await getTenantAccessToken(creds);
		const { file_token, size } = await uploadToBitable(
			token,
			creds.bitable_app_token,
			file,
			file.name
		);

		return json({
			ok: true,
			file_token,
			name: file.name,
			size,
			mime: file.type
		});
	} catch (e: any) {
		console.error('[upload] failed:', e);
		throw error(500, e.message || '上传失败');
	}
};
