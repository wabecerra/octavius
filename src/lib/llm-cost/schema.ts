// src/lib/llm-cost/schema.ts
// SQL schema for LLM logging & cost tracking tables

export const LLM_COST_SCHEMA = /* sql */ `
-- ═══════════════════════════════════════════════════════
-- MODEL REGISTRY
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_models (
  model_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  family TEXT,
  mode TEXT NOT NULL DEFAULT 'chat',
  max_input_tokens INTEGER,
  max_output_tokens INTEGER,
  supports_streaming INTEGER NOT NULL DEFAULT 1,
  supports_function_calling INTEGER NOT NULL DEFAULT 0,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  -- Pricing (per 1M tokens, stored as real for precision)
  input_cost_per_million REAL NOT NULL DEFAULT 0,
  output_cost_per_million REAL NOT NULL DEFAULT 0,
  cached_input_cost_per_million REAL,
  cache_write_cost_per_million REAL,
  image_cost_per_image REAL,
  audio_cost_per_minute REAL,
  batch_input_cost_per_million REAL,
  batch_output_cost_per_million REAL,
  pricing_effective_from TEXT,
  -- Metadata
  aliases TEXT NOT NULL DEFAULT '[]', -- JSON array
  is_deprecated INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider);
CREATE INDEX IF NOT EXISTS idx_llm_models_mode ON llm_models(mode);

-- Pricing change history (audit trail)
CREATE TABLE IF NOT EXISTS llm_pricing_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  input_cost_per_million REAL NOT NULL,
  output_cost_per_million REAL NOT NULL,
  effective_from TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pricing_hist_model ON llm_pricing_history(model_id);

-- ═══════════════════════════════════════════════════════
-- LLM REQUEST LOGS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_logs (
  id TEXT PRIMARY KEY,
  trace_id TEXT,
  session_id TEXT,
  request_id TEXT,

  timestamp TEXT NOT NULL,
  timestamp_response TEXT,

  provider TEXT NOT NULL,
  provider_raw TEXT,
  model TEXT NOT NULL,
  model_raw TEXT,

  request_type TEXT NOT NULL DEFAULT 'chat',
  streaming INTEGER NOT NULL DEFAULT 0,
  temperature REAL,
  max_tokens INTEGER,

  -- Token counts
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_total INTEGER NOT NULL DEFAULT 0,
  tokens_cached_input INTEGER NOT NULL DEFAULT 0,
  tokens_reasoning INTEGER NOT NULL DEFAULT 0,
  tokens_image INTEGER NOT NULL DEFAULT 0,
  tokens_audio INTEGER NOT NULL DEFAULT 0,

  -- Cost (stored in USD, 6 decimal precision)
  cost_input_usd REAL NOT NULL DEFAULT 0,
  cost_output_usd REAL NOT NULL DEFAULT 0,
  cost_total_usd REAL NOT NULL DEFAULT 0,
  cost_cached_discount_usd REAL NOT NULL DEFAULT 0,
  pricing_version TEXT,
  cost_is_estimated INTEGER NOT NULL DEFAULT 0,

  -- Latency
  latency_total_ms INTEGER NOT NULL DEFAULT 0,
  latency_ttft_ms INTEGER,
  latency_queue_ms INTEGER DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'success',
  error_code TEXT,
  error_message TEXT,

  -- Content hashes (privacy-preserving)
  prompt_hash TEXT,
  response_hash TEXT,
  finish_reason TEXT,

  -- Context
  project_id TEXT,
  user_id TEXT,
  agent_id TEXT,
  environment TEXT,

  -- Tags (JSON object)
  tags TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_llm_logs_ts ON llm_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_llm_logs_model ON llm_logs(model);
CREATE INDEX IF NOT EXISTS idx_llm_logs_provider ON llm_logs(provider);
CREATE INDEX IF NOT EXISTS idx_llm_logs_status ON llm_logs(status);
CREATE INDEX IF NOT EXISTS idx_llm_logs_project ON llm_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_session ON llm_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_trace ON llm_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_agent ON llm_logs(agent_id);

-- ═══════════════════════════════════════════════════════
-- COST AGGREGATES (materialized, updated periodically)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_cost_hourly (
  hour TEXT NOT NULL,           -- ISO datetime truncated to hour
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  project_id TEXT DEFAULT '__all__',
  request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  cost_total_usd REAL NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  max_latency_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, model, provider, project_id)
);

CREATE TABLE IF NOT EXISTS llm_cost_daily (
  day TEXT NOT NULL,             -- ISO date YYYY-MM-DD
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  project_id TEXT DEFAULT '__all__',
  request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  cost_total_usd REAL NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  unique_sessions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, model, provider, project_id)
);

-- ═══════════════════════════════════════════════════════
-- BUDGETS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_budgets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('hourly','daily','weekly','monthly')),
  limit_usd REAL NOT NULL,
  enforcement TEXT NOT NULL DEFAULT 'monitor_only'
    CHECK(enforcement IN ('monitor_only','soft_limit','hard_limit')),
  project_id TEXT,
  model TEXT,
  provider TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ═══════════════════════════════════════════════════════
-- ALERT RULES & EVENTS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_alert_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL,
  condition_json TEXT NOT NULL,  -- JSON: { metric, operator, threshold, window_minutes }
  severity TEXT NOT NULL DEFAULT 'warning',
  last_triggered_at TEXT,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_alert_events (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  triggered_at TEXT NOT NULL,
  resolved_at TEXT,
  severity TEXT NOT NULL,
  metric_value REAL NOT NULL,
  threshold_value REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_events_rule ON llm_alert_events(rule_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_ts ON llm_alert_events(triggered_at);
`
