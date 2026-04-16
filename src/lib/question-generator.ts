// 出题引擎 — 基于当前目标 + 已答内容，生成下一轮 4 题

import { callGemini, extractJson } from './llm';
import {
	RESEARCH_GOALS,
	type GoalId,
	QUESTIONS_PER_ROUND,
	type QuestionInputType
} from './research-goals';

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

const SYSTEM_PROMPT = `你是一位经验丰富的品牌定位顾问，正在通过卡片问答形式深度调研一位创业者/内容创作者，最终为 TA 生成专属的"品牌圣经"。

你的调研风格：
- 像真人采访，不像考试
- 题干口语化，有点人味
- 选项有明确区分度，避免含糊选项
- 根据用户之前的回答，本轮 4 题要互补
- 如果用户答了很多"其他（自填）"说明题问偏了

支持多种题型，根据问题性质选择：
- single_choice：单选（默认，大多数问题用这个）
- multi_choice：多选（问"你会用到哪些..."这类问题）
- text：纯文本输入（问"税号/执照编号"等具体信息）
- url：URL 输入（问"官网/Logo 链接"）
- email：邮箱输入
- tel：电话输入

你不是在出题库，你是在"聊天调研"。`;

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

	// 出题要创意但也要快 — flash + 禁 thinking + 降 maxTokens
	const text = await callGemini(apiKey, 'gemini-2.5-flash', SYSTEM_PROMPT, userPrompt, {
		jsonMode: true,
		maxTokens: 2500,
		temperature: 0.9,
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
