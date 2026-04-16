// Gemini API 客户端 — 用 fetch 直接调 REST API
// 不依赖 SDK，保持 Cloudflare Workers 兼容

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiModel =
	| 'gemini-2.5-flash-lite' // 最快，用于简单分类/点评
	| 'gemini-2.5-flash' // 快，用于出题（需要创意）
	| 'gemini-2.5-pro'; // 慢，用于最终生成品牌圣经

export interface CallOptions {
	jsonMode?: boolean;
	maxTokens?: number;
	temperature?: number;
	/** 关掉 thinking 能把延迟砍掉一半以上，适合不需要深度推理的任务 */
	disableThinking?: boolean;
}

export async function callGemini(
	apiKey: string,
	model: GeminiModel,
	systemPrompt: string,
	userPrompt: string,
	opts: CallOptions = {}
): Promise<string> {
	const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

	const generationConfig: any = {
		temperature: opts.temperature ?? 0.9,
		maxOutputTokens:
			opts.maxTokens ?? (model === 'gemini-2.5-pro' ? 16000 : model === 'gemini-2.5-flash' ? 3000 : 1500)
	};

	if (opts.jsonMode ?? true) {
		generationConfig.responseMimeType = 'application/json';
	}

	if (opts.disableThinking) {
		// 禁用 thinking tokens，让响应走最短路径
		generationConfig.thinkingConfig = { thinkingBudget: 0 };
	}

	const body = {
		system_instruction: { parts: [{ text: systemPrompt }] },
		contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
		generationConfig
	};

	const resp = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!resp.ok) {
		const err = await resp.text();
		throw new Error(`Gemini API error ${resp.status}: ${err}`);
	}

	const data: any = await resp.json();
	const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

	if (!text) {
		throw new Error(`Gemini returned no text: ${JSON.stringify(data).slice(0, 500)}`);
	}

	return text;
}

export function extractJson<T = any>(text: string): T {
	// 优先从 ```json ... ``` 块提取
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	if (fenced) {
		return JSON.parse(fenced[1]);
	}
	// 否则按整段 JSON 处理
	return JSON.parse(text);
}
