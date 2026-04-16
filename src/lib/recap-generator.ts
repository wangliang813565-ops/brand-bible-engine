// Recap 生成器 — 对上一轮 4 个答案的互动点评（30-80 字，有温度）
// 作用：让 AI 感觉在"听"用户，不是冷冰冰的出题机器

import { callGemini } from './llm';
import { RESEARCH_GOALS, type GoalId } from './research-goals';
import type { AnswerHistory } from './question-generator';
import { SOCIAL_MEDIA_KNOWLEDGE_LITE } from './social-media-knowledge';

const SYSTEM_PROMPT = `你是资深社媒营销顾问（薛辉圣经方法论），刚听完用户回答了 4 道题，给一句有温度 + 有洞察的"口头回应"。

${SOCIAL_MEDIA_KNOWLEDGE_LITE}

规则：
- 30-80 字，两三句话
- 必须引用用户答的**具体内容**至少一处，证明你在听
- 可以用行业术语（晒过程/情绪波点/铁粉等），让用户感受到你是内行
- 不要总结所有 4 题，挑最有意思的 1-2 个点回应即可
- 口语化，不要"根据您的回答可以看出..."这种公文腔
- 不要空洞鼓励（"很棒"、"不错"），要有真实反应
- 可以小小惊讶、好奇、共鸣，像真实的对话反应
- 不要问题，不要引导下一题

好例子:
  "嗯—'晒过程' + 'FOMO 紧迫感' 这组合很薛辉路数。你选了卖货变现路径，后面能看出你的钩子选型偏意外验证还是金钱钩。"
  "你的用户画像是 GCC 零售商，又说主打'反差'爆款元素 — 我猜你会做'迪拜老板 vs 想象'那套对比？"

坏例子:
  "感谢您的回答！您的品牌定位非常清晰..."（公文腔）
  "好的，我明白了。接下来我会问..."（没有实质回应）`;

export async function generateRecap(
	apiKey: string,
	goal: GoalId,
	lastRoundAnswers: AnswerHistory[]
): Promise<string> {
	if (lastRoundAnswers.length === 0) return '';

	const goalName = RESEARCH_GOALS[goal].name;
	const qa = lastRoundAnswers
		.map(
			(a, i) =>
				`${i + 1}. ${a.question}\n   → ${a.custom_text || a.selected}`
		)
		.join('\n');

	const userPrompt = `本轮调研板块：【${goalName}】

用户刚答的 4 道题：

${qa}

输出一句 30-80 字的口头回应（纯文本，不用引号包裹）：`;

	try {
		// 点评用 Gemini 3.1 Flash Lite — 最快（1.5s），带行业术语
		const text = await callGemini(apiKey, 'gemini-3.1-flash-lite-preview', SYSTEM_PROMPT, userPrompt, {
			jsonMode: false,
			maxTokens: 300,
			temperature: 0.85,
			disableThinking: true
		});
		// 清理：去掉可能的引号/Markdown
		return text
			.replace(/^["'「『]/, '')
			.replace(/["'」』]$/, '')
			.replace(/^```[a-z]*\n?/i, '')
			.replace(/\n?```$/, '')
			.trim()
			.slice(0, 200); // 安全截断
	} catch (e) {
		console.error('[recap] generation failed:', e);
		return ''; // 失败静默，不阻塞主流程
	}
}
