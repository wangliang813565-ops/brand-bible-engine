// Gemini API 客户端 — 用 fetch 直接调 REST API
// 不依赖 SDK，保持 Cloudflare Workers 兼容

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiMessage {
	role: 'user' | 'model';
	parts: { text: string }[];
}

export async function callGemini(
	apiKey: string,
	model: 'gemini-2.5-flash' | 'gemini-2.5-pro',
	systemPrompt: string,
	userPrompt: string,
	jsonMode = true
): Promise<string> {
	const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

	const body: any = {
		system_instruction: { parts: [{ text: systemPrompt }] },
		contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
		generationConfig: {
			temperature: 0.9,
			maxOutputTokens: model === 'gemini-2.5-pro' ? 16000 : 4000
		}
	};

	if (jsonMode) {
		body.generationConfig.responseMimeType = 'application/json';
	}

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
