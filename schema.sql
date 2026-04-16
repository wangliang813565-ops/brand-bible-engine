-- Brand Bible Engine — D1 Schema
-- 简单至上：只有两张表

-- ============ sessions 表 ============
-- 每个访客一个 session，通过 URL 的 session_id 恢复
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,                    -- UUID
    email TEXT,                             -- 可选，用户留邮箱收结果
    brand_name TEXT,                        -- 用户给自己品牌起的名

    -- 调研进度
    current_goal TEXT NOT NULL DEFAULT 'profile',   -- profile/identity/product/acquisition/production/documents
    current_goal_round INTEGER NOT NULL DEFAULT 0,   -- 当前目标已问了几轮
    total_rounds INTEGER NOT NULL DEFAULT 0,         -- 总轮数
    total_questions INTEGER NOT NULL DEFAULT 0,      -- 总题数

    -- 各目标完成度（JSON）
    goal_coverage TEXT NOT NULL DEFAULT '{"profile":0,"identity":0,"product":0,"acquisition":0,"production":0,"documents":0}',

    -- 状态
    status TEXT NOT NULL DEFAULT 'active',  -- active / completed / abandoned
    bible_markdown TEXT,                    -- 最终生成的品牌圣经

    -- 时间戳
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,

    -- 飞书 Bitable 归档（可选）
    feishu_record_id TEXT,                  -- 完成时在飞书创建的记录 ID
    feishu_synced_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

-- ============ answers 表 ============
-- 每条记录 = 一道题 + 一个答案
CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),

    -- 定位
    goal TEXT NOT NULL,                     -- profile/identity/product/acquisition/production/documents
    round_index INTEGER NOT NULL,           -- 本目标的第几轮（1-20）
    question_index INTEGER NOT NULL,        -- 本轮第几题（1-4）

    -- 题目（AI 生成，存下来便于回放）
    question TEXT NOT NULL,
    input_type TEXT NOT NULL DEFAULT 'single_choice',  -- single_choice/multi_choice/text/url/email/tel
    options TEXT NOT NULL,                  -- JSON: ["opt1", "opt2", ...]（text 类为 []）
    placeholder TEXT,                       -- text 类的占位符
    rationale TEXT,                         -- AI 解释为什么问这题

    -- 答案
    selected_option TEXT,                   -- 选中的选项文本
    selected_index INTEGER,                 -- 选中的 index (0-based)
    custom_text TEXT,                       -- 用户选"其他（自填）"时的内容
    attachments TEXT,                       -- JSON: [{file_token, name, size}]，飞书 Bitable 附件

    -- 时间
    shown_at INTEGER NOT NULL,
    answered_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id, round_index, question_index);
