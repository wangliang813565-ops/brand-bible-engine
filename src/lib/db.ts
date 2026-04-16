// D1 数据访问层

import { GOAL_ORDER, type GoalId } from './research-goals';

export interface Session {
	id: string;
	email: string | null;
	brand_name: string | null;
	current_goal: GoalId;
	current_goal_round: number;
	total_rounds: number;
	total_questions: number;
	goal_coverage: string; // JSON
	status: 'active' | 'completed' | 'abandoned';
	bible_markdown: string | null;
	created_at: number;
	updated_at: number;
	completed_at: number | null;
	feishu_record_id?: string | null;
	feishu_synced_at?: number | null;
}

export interface AnswerRow {
	id: number;
	session_id: string;
	goal: GoalId;
	round_index: number;
	question_index: number;
	question: string;
	input_type: string; // single_choice/multi_choice/text/url/email/tel
	options: string; // JSON array
	placeholder: string | null;
	rationale: string | null;
	selected_option: string | null;
	selected_index: number | null;
	custom_text: string | null;
	attachments: string | null; // JSON
	shown_at: number;
	answered_at: number | null;
}

export async function createSession(
	db: D1Database,
	sessionId: string,
	brandName: string | null = null
): Promise<Session> {
	const now = Date.now();
	// 初始 goal_coverage 包含所有 goal
	const initialCoverage: Record<string, number> = {};
	for (const g of GOAL_ORDER) initialCoverage[g] = 0;

	const session: Session = {
		id: sessionId,
		email: null,
		brand_name: brandName,
		current_goal: GOAL_ORDER[0], // 从第一个 goal 开始（profile 硬档案）
		current_goal_round: 0,
		total_rounds: 0,
		total_questions: 0,
		goal_coverage: JSON.stringify(initialCoverage),
		status: 'active',
		bible_markdown: null,
		created_at: now,
		updated_at: now,
		completed_at: null
	};

	await db
		.prepare(
			`INSERT INTO sessions (id, email, brand_name, current_goal, current_goal_round, total_rounds, total_questions, goal_coverage, status, bible_markdown, created_at, updated_at, completed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			session.id,
			session.email,
			session.brand_name,
			session.current_goal,
			session.current_goal_round,
			session.total_rounds,
			session.total_questions,
			session.goal_coverage,
			session.status,
			session.bible_markdown,
			session.created_at,
			session.updated_at,
			session.completed_at
		)
		.run();

	return session;
}

export async function getSession(db: D1Database, sessionId: string): Promise<Session | null> {
	const result = await db
		.prepare('SELECT * FROM sessions WHERE id = ?')
		.bind(sessionId)
		.first<Session>();
	return result || null;
}

export async function updateSession(
	db: D1Database,
	sessionId: string,
	patch: Partial<Session>
): Promise<void> {
	const fields: string[] = [];
	const values: any[] = [];

	for (const [key, val] of Object.entries(patch)) {
		if (val !== undefined) {
			fields.push(`${key} = ?`);
			values.push(val);
		}
	}
	fields.push('updated_at = ?');
	values.push(Date.now());
	values.push(sessionId);

	await db
		.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`)
		.bind(...values)
		.run();
}

export async function getAnswers(db: D1Database, sessionId: string): Promise<AnswerRow[]> {
	const result = await db
		.prepare('SELECT * FROM answers WHERE session_id = ? ORDER BY id ASC')
		.bind(sessionId)
		.all<AnswerRow>();
	return result.results || [];
}

export async function insertQuestions(
	db: D1Database,
	sessionId: string,
	goal: GoalId,
	roundIndex: number,
	questions: {
		question: string;
		input_type: string;
		options: string[];
		placeholder?: string;
		rationale: string;
	}[]
): Promise<void> {
	const now = Date.now();
	const statements = questions.map((q, i) =>
		db
			.prepare(
				`INSERT INTO answers (session_id, goal, round_index, question_index, question, input_type, options, placeholder, rationale, shown_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				sessionId,
				goal,
				roundIndex,
				i + 1,
				q.question,
				q.input_type,
				JSON.stringify(q.options),
				q.placeholder || null,
				q.rationale,
				now
			)
	);
	await db.batch(statements);
}

export async function recordAnswer(
	db: D1Database,
	answerId: number,
	selectedIndex: number,
	selectedOption: string,
	customText: string | null = null,
	attachments: string | null = null
): Promise<void> {
	await db
		.prepare(
			`UPDATE answers SET selected_index = ?, selected_option = ?, custom_text = ?, attachments = ?, answered_at = ? WHERE id = ?`
		)
		.bind(selectedIndex, selectedOption, customText, attachments, Date.now(), answerId)
		.run();
}

export async function getPendingQuestionsForRound(
	db: D1Database,
	sessionId: string,
	goal: GoalId,
	roundIndex: number
): Promise<AnswerRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM answers WHERE session_id = ? AND goal = ? AND round_index = ? ORDER BY question_index ASC`
		)
		.bind(sessionId, goal, roundIndex)
		.all<AnswerRow>();
	return result.results || [];
}
