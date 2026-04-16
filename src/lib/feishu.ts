// 飞书 OpenAPI 客户端 — 只保留当前需要的能力：
//   1. 获取 tenant_access_token
//   2. 上传附件到 Bitable 附件字段（parent_type=bitable_file）
//   3. 写入 Bitable 记录

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

export interface FeishuCreds {
	app_id: string;
	app_secret: string;
	bitable_app_token: string; // 存档数据的多维表格 app_token
	bitable_table_id: string; // 存档表的 table_id
}

export async function getTenantAccessToken(
	creds: FeishuCreds
): Promise<{ token: string; expires_in: number }> {
	const resp = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ app_id: creds.app_id, app_secret: creds.app_secret })
	});
	const data: any = await resp.json();
	if (data.code !== 0) {
		throw new Error(`Feishu token error: ${data.msg}`);
	}
	return { token: data.tenant_access_token, expires_in: data.expire };
}

/**
 * 上传附件到 Bitable 附件字段
 * parent_type=bitable_file 表示文件归属于某个 Bitable
 */
export async function uploadToBitable(
	token: string,
	bitableAppToken: string,
	file: File,
	fileName?: string
): Promise<{ file_token: string; size: number }> {
	const form = new FormData();
	form.append('file_name', fileName || file.name || 'upload');
	form.append('parent_type', 'bitable_file');
	form.append('parent_node', bitableAppToken);
	form.append('size', String(file.size));
	form.append('file', file);

	const resp = await fetch(`${FEISHU_BASE}/drive/v1/medias/upload_all`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` },
		body: form
	});
	const data: any = await resp.json();
	if (data.code !== 0) {
		throw new Error(`Feishu upload error: ${data.msg}`);
	}
	return { file_token: data.data.file_token, size: file.size };
}

/**
 * 在 Bitable 表里创建一条记录
 * fields 对象的 key 必须是表的字段名，附件字段的 value 格式: [{file_token: "..."}]
 */
export async function createBitableRecord(
	token: string,
	appToken: string,
	tableId: string,
	fields: Record<string, any>
): Promise<{ record_id: string }> {
	const resp = await fetch(
		`${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ fields })
		}
	);
	const data: any = await resp.json();
	if (data.code !== 0) {
		throw new Error(`Feishu bitable create error: ${data.msg} | ${JSON.stringify(fields).slice(0, 200)}`);
	}
	return { record_id: data.data.record.record_id };
}

/**
 * 更新 Bitable 记录
 */
export async function updateBitableRecord(
	token: string,
	appToken: string,
	tableId: string,
	recordId: string,
	fields: Record<string, any>
): Promise<void> {
	const resp = await fetch(
		`${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
		{
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ fields })
		}
	);
	const data: any = await resp.json();
	if (data.code !== 0) {
		throw new Error(`Feishu bitable update error: ${data.msg}`);
	}
}

/**
 * 读取 Feishu 凭证 — 从 Platform env
 */
export function readCreds(env: {
	FEISHU_APP_ID?: string;
	FEISHU_APP_SECRET?: string;
	FEISHU_BITABLE_APP_TOKEN?: string;
	FEISHU_BITABLE_TABLE_ID?: string;
}): FeishuCreds | null {
	if (
		!env.FEISHU_APP_ID ||
		!env.FEISHU_APP_SECRET ||
		!env.FEISHU_BITABLE_APP_TOKEN ||
		!env.FEISHU_BITABLE_TABLE_ID
	) {
		return null;
	}
	return {
		app_id: env.FEISHU_APP_ID,
		app_secret: env.FEISHU_APP_SECRET,
		bitable_app_token: env.FEISHU_BITABLE_APP_TOKEN,
		bitable_table_id: env.FEISHU_BITABLE_TABLE_ID
	};
}
