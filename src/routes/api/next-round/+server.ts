// POST /api/next-round — 生成下一轮 4 题
// 输入: { session_id }
// 输出: { questions: [{id, question, options, rationale}], goal, round_index }

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getAnswers, updateSession, insertQuestions, getPendingQuestionsForRound } from '$lib/db';
import { generateQuestions } from '$lib/question-generator';
import { evaluateCompletion } from '$lib/completion-evaluator';
import { composeBible } from '$lib/bible-composer';
import { RESEARCH_GOALS, type GoalId } from '$lib/research-goals';

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) throw error(500, 'D1 not bound');
	if (!platform.env.GEMINI_API_KEY) throw error(500, 'GEMINI_API_KEY not set');

	const body = await request.json().catch(() => ({}));
	const sessionId = (body as any).session_id;
	if (!sessionId) throw error(400, 'missing session_id');

	const session = await getSession(platform.env.DB, sessionId);
	if (!session) throw error(404, 'session not found');

	if (session.status === 'completed') {
		return json({
			done: true,
			bible_markdown: session.bible_markdown,
			goal_coverage: JSON.parse(session.goal_coverage)
		});
	}

	const allAnswers = await getAnswers(platform.env.DB, sessionId);

	// 转为 AnswerHistory 格式（只包括已回答的）
	const answeredHistory = allAnswers
		.filter((a) => a.selected_option !== null)
		.map((a) => ({
			goal: a.goal as GoalId,
			question: a.question,
			selected: a.selected_option || '',
			custom_text: a.custom_text
		}));

	// 检查当前 round 是不是已经出过题了（前端刷新 / 返回时）
	const pendingThisRound = await getPendingQuestionsForRound(
		platform.env.DB,
		sessionId,
		session.current_goal as GoalId,
		session.current_goal_round + 1
	);

	if (pendingThisRound.length > 0) {
		return json({
			done: false,
			goal: session.current_goal,
			goal_name: RESEARCH_GOALS[session.current_goal as GoalId].name,
			round_index: session.current_goal_round + 1,
			total_questions: session.total_questions,
			goal_coverage: JSON.parse(session.goal_coverage),
			questions: pendingThisRound.map((q) => ({
				id: q.id,
				question: q.question,
				input_type: q.input_type,
				options: JSON.parse(q.options),
				placeholder: q.placeholder,
				rationale: q.rationale,
				selected_option: q.selected_option,
				selected_index: q.selected_index,
				custom_text: q.custom_text
			}))
		});
	}

	// ====== 评估上一轮后决定下一步 ======
	let mode: 'normal' | 'deeper' | 'clarify' = 'normal';
	let nextGoal: GoalId = session.current_goal as GoalId;
	let nextRoundIndex = session.current_goal_round + 1;

	if (session.current_goal_round > 0) {
		const evaluation = await evaluateCompletion(
			platform.env.GEMINI_API_KEY,
			session.current_goal as GoalId,
			session.current_goal_round,
			answeredHistory
		);

		// 更新覆盖度
		const coverage = JSON.parse(session.goal_coverage);
		coverage[session.current_goal] = evaluation.coverage_score;

		if (evaluation.decision.action === 'wrap_up') {
			// 所有目标都够了 → 生成品牌圣经
			const bible = await composeBible(platform.env.GEMINI_API_KEY, {
				brand_name: session.brand_name || '（未命名品牌）',
				all_answers: answeredHistory,
				goal_coverage: coverage
			});
			await updateSession(platform.env.DB, sessionId, {
				status: 'completed',
				bible_markdown: bible,
				goal_coverage: JSON.stringify(coverage),
				completed_at: Date.now()
			});
			return json({
				done: true,
				bible_markdown: bible,
				goal_coverage: coverage
			});
		}

		if (evaluation.decision.action === 'switch_goal') {
			nextGoal = evaluation.decision.next_goal;
			nextRoundIndex = 1;
			await updateSession(platform.env.DB, sessionId, {
				current_goal: nextGoal,
				current_goal_round: 0, // 会在下面递增
				goal_coverage: JSON.stringify(coverage)
			});
		} else {
			mode = evaluation.decision.mode;
			await updateSession(platform.env.DB, sessionId, {
				goal_coverage: JSON.stringify(coverage)
			});
		}
	}

	// ====== 生成 4 题 ======
	const questions = await generateQuestions(
		platform.env.GEMINI_API_KEY,
		nextGoal,
		nextRoundIndex - 1, // 传入已经问过的轮数
		answeredHistory,
		mode
	);

	// 存入数据库
	await insertQuestions(platform.env.DB, sessionId, nextGoal, nextRoundIndex, questions);

	// 更新 session
	await updateSession(platform.env.DB, sessionId, {
		current_goal: nextGoal,
		current_goal_round: nextRoundIndex,
		total_rounds: session.total_rounds + 1,
		total_questions: session.total_questions + 4
	});

	// 取回刚插入的带 id 的题目
	const insertedQuestions = await getPendingQuestionsForRound(
		platform.env.DB,
		sessionId,
		nextGoal,
		nextRoundIndex
	);

	return json({
		done: false,
		goal: nextGoal,
		goal_name: RESEARCH_GOALS[nextGoal].name,
		round_index: nextRoundIndex,
		total_questions: session.total_questions + 4,
		goal_coverage: JSON.parse(session.goal_coverage),
		mode,
		questions: insertedQuestions.map((q) => ({
			id: q.id,
			question: q.question,
			input_type: q.input_type,
			options: JSON.parse(q.options),
			placeholder: q.placeholder,
			rationale: q.rationale
		}))
	});
};
