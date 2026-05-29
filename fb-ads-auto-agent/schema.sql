-- D1 schema for fb_agent_decisions
-- Run: npm run d1:init        (local)
--      npm run d1:init:remote (production)

CREATE TABLE IF NOT EXISTS runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  status          TEXT NOT NULL,          -- 'running' | 'success' | 'error' | 'killswitch' | 'shadow'
  ad_account_id   TEXT NOT NULL,
  campaigns_seen  INTEGER NOT NULL DEFAULT 0,
  decisions_made  INTEGER NOT NULL DEFAULT 0,
  actions_executed INTEGER NOT NULL DEFAULT 0,
  daily_spend_usd REAL,
  error_message   TEXT,
  haiku_tokens_in  INTEGER,
  haiku_tokens_out INTEGER,
  haiku_cost_usd   REAL
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

CREATE TABLE IF NOT EXISTS decisions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL,
  created_at      TEXT NOT NULL,
  campaign_id     TEXT NOT NULL,
  campaign_name   TEXT,
  adset_id        TEXT,
  ad_id           TEXT,
  action_type     TEXT NOT NULL,          -- 'pause' | 'scale_budget' | 'reallocate' | 'rotate_creative' | 'noop'
  action_payload  TEXT,                   -- JSON: { budget_old, budget_new, ... }
  reasoning       TEXT NOT NULL,          -- Haiku's reasoning text
  executed        INTEGER NOT NULL DEFAULT 0,  -- 0 = blocked/shadow, 1 = executed
  blocked_reason  TEXT,                   -- e.g. 'spend_cap_hit', 'delta_too_large', 'shadow_mode'
  meta_response   TEXT,                   -- raw response from Meta API
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_decisions_campaign ON decisions(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_spend (
  date_ymd        TEXT PRIMARY KEY,       -- YYYY-MM-DD in ICT
  spend_usd       REAL NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              TEXT NOT NULL,
  level           TEXT NOT NULL,          -- 'info' | 'warn' | 'error'
  event           TEXT NOT NULL,
  details         TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
