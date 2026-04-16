// 完成度评估器 — 每轮 4 题后评估，决定继续深挖/切换目标/收工

import { callGemini, extractJson } from './llm';
import {
	RESEARCH_GOALS,
	type GoalId,
	GOAL_ROUND_CONFIG,
	COVERAGE_THRESHOLD,
	GOAL_ORDER
} from './research-goals';
import type { AnswerHistory } from './question-generator';

export type Decision =
	| { action: 'continue'; mode: 'normal' | 'deeper' | 'clarify'; reason: string }
	| { action: 'switch_goal'; next_goal: GoalId; reason: string }
	| { action: 'wrap_up'; reason: string };

export interface Evaluation {
	coverage_score: number; // 0-100
	decision: Decision;
}

const SYSTEM_PROMPT = `你是品牌调研质量评估专家。你要判断：对于当前调研目标，我们获得的信息是否足够写出一份高质量的品牌圣经章节。

评估标准：
- 0-40 分：信息太少，关键维度空白多，需要继续深挖
- 40-79 分：有基础但不够完整，还需要探更多角度
- 80-100 分：关键维度都覆盖到了，可以切换下个目标

注意：不要过度追求 100 分，80 分就可以切换了。`;

export async function evaluateCompletion(
	apiKey: string,
	currentGoal: GoalId,
	currentRound: number,
	allHistory: AnswerHistory[]
): Promise<Evaluation> {
	const goal = RESEARCH_GOALS[currentGoal];
	const sameGoalHistory = allHistory.filter((h) => h.goal === currentGoal);
	const { min: MIN_ROUNDS, max: MAX_ROUNDS } = GOAL_ROUND_CONFIG[currentGoal];

	// 硬规则 1：未达最低轮数 → 无条件继续
	if (currentRound < MIN_ROUNDS) {
		// 仍然调 LLM 评估覆盖度，但决定强制 continue
		const score = await quickScore(apiKey, currentGoal, sameGoalHistory);
		return {
			coverage_score: score,
			decision: {
				action: 'continue',
				mode: 'normal',
				reason: `未达保底轮数 ${MIN_ROUNDS}，当前第 ${currentRound} 轮，继续。`
			}
		};
	}

	// 硬规则 2：达到最高轮数 → 无条件切换
	if (currentRound >= MAX_ROUNDS) {
		const nextGoal = getNextGoal(currentGoal);
		return {
			coverage_score: 100,
			decision: nextGoal
				? {
						action: 'switch_goal',
						next_goal: nextGoal,
						reason: `达到上限 ${MAX_ROUNDS} 轮，强制切换。`
					}
				: { action: 'wrap_up', reason: `最后一个目标也达到上限，收工。` }
		};
	}

	// 中间区间：LLM 评估
	const historyText = sameGoalHistory
		.map((h, i) => `${i + 1}. ${h.question}\n   → ${h.custom_text || h.selected}`)
		.join('\n');

	const userPrompt = `## 当前调研目标
${goal.name} — ${goal.description}

## 这个目标下需要弄清楚的子维度
${goal.sub_goals.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 关键问题清单
${goal.key_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## 用户已答内容
${historyText}

## 进度
- 已问 ${currentRound} 轮（共 ${sameGoalHistory.length} 题）
- 保底 ${MIN_ROUNDS} 轮已达成，可选择切换

## 评估任务
1. 给出覆盖度 0-100 分
2. 决定下一步：
   - "continue_normal"：继续按正常节奏问下一轮
   - "continue_deeper"：继续但要更深挖（用户答得太泛）
   - "continue_clarify"：继续但要澄清矛盾（前后不一致）
   - "switch_goal"：切换到下个目标（覆盖度 ≥ 80）

## 输出 JSON 格式
{
  "coverage_score": 0-100 整数,
  "action": "continue_normal" | "continue_deeper" | "continue_clarify" | "switch_goal",
  "reason": "一句话说明为什么这样决定"
}`;

	// 评估是分类任务，用 flash-lite + 禁 thinking
	const text = await callGemini(apiKey, 'gemini-2.5-flash-lite', SYSTEM_PROMPT, userPrompt, {
		jsonMode: true,
		maxTokens: 500,
		temperature: 0.3,
		disableThinking: true
	});
	const parsed = extractJson<{
		coverage_score: number;
		action: string;
		reason: string;
	}>(text);

	const score = Math.max(0, Math.min(100, parsed.coverage_score));

	// 若 LLM 说可以切换但覆盖度没到 80，强制继续
	if (parsed.action === 'switch_goal' && score < COVERAGE_THRESHOLD) {
		return {
			coverage_score: score,
			decision: {
				action: 'continue',
				mode: 'normal',
				reason: `LLM 建议切换但覆盖度仅 ${score}，继续深挖。`
			}
		};
	}

	if (parsed.action === 'switch_goal') {
		const nextGoal = getNextGoal(currentGoal);
		return {
			coverage_score: score,
			decision: nextGoal
				? { action: 'switch_goal', next_goal: nextGoal, reason: parsed.reason }
				: { action: 'wrap_up', reason: '所有目标都够了，收工。' }
		};
	}

	const mode =
		parsed.action === 'continue_deeper'
			? 'deeper'
			: parsed.action === 'continue_clarify'
				? 'clarify'
				: 'normal';

	return {
		coverage_score: score,
		decision: { action: 'continue', mode, reason: parsed.reason }
	};
}

async function quickScore(
	apiKey: string,
	goal: GoalId,
	history: AnswerHistory[]
): Promise<number> {
	if (history.length === 0) return 0;
	// 简单估分：基于回答数量和每个子目标的覆盖
	const g = RESEARCH_GOALS[goal];
	return Math.min(100, Math.round((history.length / g.sub_goals.length) * 15));
}

function getNextGoal(current: GoalId): GoalId | null {
	const idx = GOAL_ORDER.indexOf(current);
	return idx < GOAL_ORDER.length - 1 ? GOAL_ORDER[idx + 1] : null;
}
