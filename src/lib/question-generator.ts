// 出题引擎 — 基于当前目标 + 已答内容，生成下一轮 4 题

import { callGemini, extractJson } from './llm';
import {
	RESEARCH_GOALS,
	type GoalId,
	QUESTIONS_PER_ROUND,
	type QuestionInputType
} from './research-goals';
import { SOCIAL_MEDIA_KNOWLEDGE } from './social-media-knowledge';

export interface Question {
	question: string;
	input_type: QuestionInputType; // single_choice / multi_choice / text / url / email / tel
	options: string[]; // 对 choice 类有效；对 text/url/email/tel 空数组或填占位提示
	placeholder?: string; // 文本输入题的占位符
	rationale: string;
}

export interface AnswerHistory {
	goal: GoalId;
	question: string;
	selected: string;
	custom_text?: string | null;
}

const SYSTEM_PROMPT = `你是一位资深的社媒营销顾问 + 品牌定位专家，精通薛辉短视频创作圣经、抖音/小红书/IG 等平台算法，为创业者/内容创作者做深度访谈，最终生成可执行的品牌圣经。

${SOCIAL_MEDIA_KNOWLEDGE}

---

## 你的访谈风格

1. **像行家聊天，不像填表** — 题干要用行业术语，不是"你觉得该怎么做"这种白板问题
2. **每题挖到痛处** — 让用户产生"哦！这个角度我没想过"的惊喜感
3. **题干口语化但专业** — 比如："你的内容更偏晒过程（在做什么给大家看）还是讲故事（我经历过什么）？"
4. **选项要基于真实行业分类** — 不要"差不多都行"式的模糊选项
5. **rationale 要体现内行视角** — 说清"我问这题是为了判断你的 XX（引用行业概念）"
6. **根据已答判断用户所处阶段**（冷启动/增长/成熟），后续问题针对性更强
7. **本轮 4 题互补，不同质化**

## 题型选择

- **single_choice**：单选（默认）
- **multi_choice**：多选（问"你会用到哪些平台/哪些元素"）
- **text / url / email / tel**：硬信息输入

## 好题 vs 坏题对照

❌ 坏题："你主要卖什么？" 选项：[产品, 服务, 课程, 其他]
✅ 好题："你的主力变现路径是薛辉说的哪一类？" 选项：[卖货-直接成交, 引流-导到私域/门店, 广告-靠粉丝量接推广, 打赏-靠情感共鸣, 其他]

❌ 坏题："你的内容风格是？" 选项：[正式, 活泼, 专业, 其他]
✅ 好题："你最擅长/最想做的核心脚本类型是？" 选项：[晒过程-流量和成交利器, 讲故事-立人设建信任, 教知识-精准引流成本最低, 说观点-筛选真粉差异化, 还没想好]`;

export async function generateQuestions(
	apiKey: string,
	currentGoal: GoalId,
	currentRound: number, // 当前目标已问的轮数 (0-based 时为 0 表示第 1 轮)
	allHistory: AnswerHistory[],
	clarifyMode: 'normal' | 'deeper' | 'clarify' = 'normal'
): Promise<Question[]> {
	const goal = RESEARCH_GOALS[currentGoal];

	// 压缩历史：只保留当前大目标 + 其他目标摘要
	const sameGoalHistory = allHistory.filter((h) => h.goal === currentGoal);
	const otherGoalsHistory = allHistory.filter((h) => h.goal !== currentGoal);

	const sameGoalText = sameGoalHistory
		.map(
			(h, i) =>
				`${i + 1}. Q: ${h.question}\n   A: ${h.custom_text || h.selected}`
		)
		.join('\n');

	const otherGoalsText = otherGoalsHistory
		.slice(-10) // 只取最近 10 条其他目标的回答作为上下文
		.map((h) => `[${h.goal}] ${h.question} → ${h.custom_text || h.selected}`)
		.join('\n');

	const modeHint =
		clarifyMode === 'deeper'
			? '用户的回答有些泛泛，这一轮要更具体、更深挖细节。'
			: clarifyMode === 'clarify'
				? '用户之前的回答有矛盾或不一致，这一轮专门用来澄清矛盾。'
				: '按正常节奏推进，探索这个目标下还没覆盖的角度。';

	// 针对不同目标的题型指引
	const typeHint =
		currentGoal === 'profile'
			? `【硬档案板块】用户在填客户档案卡。这些是必填的客观信息（Logo URL、官网、邮箱、电话、税号、执照号等），**绝大多数题应该用 text/url/email/tel 题型**，让用户直接填写。只有"法人姓氏"等可以列几个常见选项。占位符 placeholder 要具体（如 "https://yourbrand.com" 或 "VAT123456789"）。`
			: currentGoal === 'documents'
				? `【日常文书板块】在摸排用户日常用到什么文书，以便后续对接 AI 自动生成。第一轮建议用 multi_choice 让用户勾选常用文书类型（报价单/发票/合同等）。后续轮次深挖细节（比如多久开一次、用什么工具、要不要双语）。`
				: `【品牌定位板块】按正常的单选卡片题 single_choice，每题 3-5 个选项 + 最后一项"其他（自填）"。`;

	const userPrompt = `## 当前调研大目标
${goal.name} — ${goal.description}

## 这个目标下需要弄清楚的子维度
${goal.sub_goals.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 这个目标下需要回答的关键问题
${goal.key_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## 当前进度
- 这是本目标第 ${currentRound + 1} 轮（每轮 ${QUESTIONS_PER_ROUND} 题）
- 本目标已累积 ${sameGoalHistory.length} 个答案

## 本目标已有的回答
${sameGoalText || '（还没问过题）'}

## 其他目标最近的回答（作为背景参考）
${otherGoalsText || '（无）'}

## 本轮节奏
${modeHint}

## 板块题型指引
${typeHint}

## 你的任务
生成本轮 ${QUESTIONS_PER_ROUND} 道题。

硬性要求：
1. 题目数量：恰好 ${QUESTIONS_PER_ROUND} 道
2. 每题必须标注 input_type（single_choice/multi_choice/text/url/email/tel）
3. 单选/多选题：3-5 个正常选项 + 1 个"其他（自填）"
4. text/url/email/tel 题：options 为空数组 []，用 placeholder 给占位提示
5. 本轮 4 题必须从 4 个不同角度探测，不能同质化
6. 不能重复本目标已问过的角度
7. 题干口语化，rationale 要透明

## 输出 JSON 格式（严格遵守）
{
  "questions": [
    {
      "question": "题干文本",
      "input_type": "single_choice" | "multi_choice" | "text" | "url" | "email" | "tel",
      "options": ["选项1", "选项2", "其他（自填）"],  // text/url/email/tel 时为 []
      "placeholder": "输入框占位符（仅 text/url/email/tel 需要）",
      "rationale": "我问这题是因为..."
    },
    ... 共 ${QUESTIONS_PER_ROUND} 题
  ]
}`;

	// 出题用 Gemini 3 Flash（社媒术语专业）+ 禁 thinking + 降 maxTokens
	const text = await callGemini(apiKey, 'gemini-3-flash-preview', SYSTEM_PROMPT, userPrompt, {
		jsonMode: true,
		maxTokens: 2500,
		temperature: 0.85,
		disableThinking: true
	});
	const parsed = extractJson<{ questions: Question[] }>(text);

	if (!parsed.questions || parsed.questions.length !== QUESTIONS_PER_ROUND) {
		throw new Error(
			`LLM 没返回 ${QUESTIONS_PER_ROUND} 题，收到 ${parsed.questions?.length || 0} 题`
		);
	}

	// 补齐默认值 + 确保选择题有"其他"选项
	for (const q of parsed.questions) {
		if (!q.input_type) q.input_type = 'single_choice';
		if (!q.options) q.options = [];

		if (q.input_type === 'single_choice' || q.input_type === 'multi_choice') {
			const hasOther = q.options.some(
				(o) => o.includes('其他') || o.toLowerCase().includes('other')
			);
			if (!hasOther) q.options.push('其他（自填）');
		}
	}

	return parsed.questions;
}
