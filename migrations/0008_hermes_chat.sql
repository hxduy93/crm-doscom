-- Hermes chat agent — port sang CRM Doscom (2026-06-24)
-- Tạo bảng cho khung chat Hermes trên CRM:
--   1. hermes_sessions     — mỗi conversation 1 row
--   2. hermes_messages     — message list (user/assistant/tool)
--   3. hermes_messages_fts — FTS5 virtual table search lịch sử chat
--   4. hermes_user_prefs   — preference học theo thời gian
--
-- Multi-user: phân chia theo user_email (getIdentity từ Cloudflare Access; CRM
-- giai đoạn public dùng chung khoá "public@crm-doscom").
-- Bind D1: env.DB (database crm-doscom-db).

-- ====================================================================
-- 1. Sessions
-- ====================================================================
CREATE TABLE IF NOT EXISTS hermes_sessions (
  id            TEXT PRIMARY KEY,                  -- uuid v4
  user_email    TEXT NOT NULL,                     -- owner
  title         TEXT,                              -- auto-gen từ first user message
  created_at    INTEGER NOT NULL,                  -- unix ms
  updated_at    INTEGER NOT NULL,                  -- unix ms
  message_count INTEGER NOT NULL DEFAULT 0,
  tokens_in     INTEGER NOT NULL DEFAULT 0,        -- cumulative input
  tokens_out    INTEGER NOT NULL DEFAULT 0,        -- cumulative output
  cost_usd_e6   INTEGER NOT NULL DEFAULT 0         -- cost × 1_000_000 (tránh float)
);

CREATE INDEX IF NOT EXISTS idx_hermes_sessions_user
  ON hermes_sessions (user_email, updated_at DESC);

-- ====================================================================
-- 2. Messages
-- ====================================================================
CREATE TABLE IF NOT EXISTS hermes_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES hermes_sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('user','assistant','tool_call','tool_result')),
  content    TEXT NOT NULL,                        -- text user/assistant; JSON cho tool_call/result
  tool_name  TEXT,                                 -- chỉ với tool_call/result
  tokens_in  INTEGER,
  tokens_out INTEGER,
  cost_usd_e6 INTEGER,
  created_at INTEGER NOT NULL                      -- unix ms
);

CREATE INDEX IF NOT EXISTS idx_hermes_messages_session
  ON hermes_messages (session_id, id);

-- ====================================================================
-- 3. FTS5 search trên content + auto-sync triggers
-- ====================================================================
CREATE VIRTUAL TABLE IF NOT EXISTS hermes_messages_fts USING fts5(
  content,
  session_id UNINDEXED,
  user_email UNINDEXED,
  role UNINDEXED,
  content='hermes_messages',
  content_rowid='id'
);

-- Insert: ghép user_email từ session để query "search trong chat của tôi" nhanh
CREATE TRIGGER IF NOT EXISTS hermes_msg_fts_insert AFTER INSERT ON hermes_messages BEGIN
  INSERT INTO hermes_messages_fts(rowid, content, session_id, user_email, role)
  SELECT new.id, new.content, new.session_id,
         (SELECT user_email FROM hermes_sessions WHERE id = new.session_id),
         new.role;
END;

CREATE TRIGGER IF NOT EXISTS hermes_msg_fts_delete AFTER DELETE ON hermes_messages BEGIN
  INSERT INTO hermes_messages_fts(hermes_messages_fts, rowid, content)
  VALUES ('delete', old.id, old.content);
END;

-- ====================================================================
-- 4. User preferences (Hermes-style "learn over time")
-- ====================================================================
CREATE TABLE IF NOT EXISTS hermes_user_prefs (
  user_email TEXT NOT NULL,
  key        TEXT NOT NULL,                        -- vd "report_style", "default_staff"
  value      TEXT NOT NULL,
  learned_at INTEGER NOT NULL,
  source     TEXT,                                 -- "user_explicit" | "auto_mined"
  PRIMARY KEY (user_email, key)
);
