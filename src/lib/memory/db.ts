import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { AGENT_SEED_CONFIGS } from '@/lib/models'

/** Default database file path — uses process.cwd() for stable resolution across Next.js routes. */
const DEFAULT_DB_PATH = resolve(process.cwd(), '.data/memory.sqlite')

/**
 * Opens (or creates) a SQLite database at the given path, enables WAL mode
 * and foreign keys, and ensures the full schema exists.
 *
 * Pass `:memory:` for an in-memory database (useful in tests).
 */
export function getDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  // Ensure the parent directory exists for file-based databases
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }

  const db = new Database(dbPath)

  // Enable WAL mode for concurrent reads
  db.pragma('journal_mode = WAL')

  // Enable foreign key enforcement
  db.pragma('foreign_keys = ON')

  // Create schema inside a transaction for atomicity
  createSchema(db)

  return db
}

/** Closes a database connection cleanly. */
export function closeDatabase(db: Database.Database): void {
  db.close()
}

// ---------------------------------------------------------------------------
// Schema creation
// ---------------------------------------------------------------------------

function createSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL)
  // --- Migrations for existing databases ---
  migrateTaskColumns(db)
  migrateTaskCompletedSync(db)
  seedDefaults(db)
}

/** Add quadrant + project columns to dashboard_tasks if they don't exist yet. */
function migrateTaskColumns(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(dashboard_tasks)").all() as { name: string }[]
  const names = new Set(cols.map(c => c.name))
  if (!names.has('quadrant')) {
    db.exec("ALTER TABLE dashboard_tasks ADD COLUMN quadrant TEXT NOT NULL DEFAULT '' ")
  }
  if (!names.has('project')) {
    db.exec("ALTER TABLE dashboard_tasks ADD COLUMN project TEXT NOT NULL DEFAULT '' ")
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_quadrant ON dashboard_tasks(quadrant)")
}

/** Fix completed field for tasks whose status is 'done' but completed=0. */
function migrateTaskCompletedSync(db: Database.Database): void {
  db.prepare(
    "UPDATE dashboard_tasks SET completed = 1 WHERE status = 'done' AND completed = 0"
  ).run()
}

/** Seed default agent configs and cron jobs on fresh install. */
function seedDefaults(db: Database.Database): void {
  const now = new Date().toISOString()

  // Seed agent model configs (openrouter default) — INSERT OR IGNORE so it only runs on fresh install
  const agentSeeds = AGENT_SEED_CONFIGS

  const insertAgent = db.prepare(
    'INSERT OR IGNORE INTO agent_model_config (agent_id, provider, model, updated_at) VALUES (?, ?, ?, ?)'
  )
  for (const [agentId, provider, model] of agentSeeds) {
    insertAgent.run(agentId, provider, model, now)
  }

}

const SCHEMA_SQL = /* sql */ `
-- Main memory items table
CREATE TABLE IF NOT EXISTS memory_items (
  memory_id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('episodic','semantic','procedural','entity_profile')),
  layer TEXT NOT NULL CHECK(layer IN ('life_directory','daily_notes','tacit_knowledge')),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  agent_id TEXT,
  created_at TEXT NOT NULL,
  last_accessed TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0),
  importance REAL NOT NULL CHECK(importance >= 0.0 AND importance <= 1.0),
  tags TEXT NOT NULL DEFAULT '[]',
  embedding_ref TEXT,
  consolidated_into TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_items(type);
CREATE INDEX IF NOT EXISTS idx_memory_layer ON memory_items(layer);
CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_items(created_at);
CREATE INDEX IF NOT EXISTS idx_memory_accessed ON memory_items(last_accessed);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_items(importance);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_items(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_source ON memory_items(source_type);
CREATE INDEX IF NOT EXISTS idx_memory_archived ON memory_items(archived);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  text,
  tags,
  content='memory_items',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_items BEGIN
  INSERT INTO memory_fts(rowid, text, tags) VALUES (new.rowid, new.text, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_items BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, text, tags) VALUES ('delete', old.rowid, old.text, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory_items BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, text, tags) VALUES ('delete', old.rowid, old.text, old.tags);
  INSERT INTO memory_fts(rowid, text, tags) VALUES (new.rowid, new.text, new.tags);
END;

-- Graph edges table
CREATE TABLE IF NOT EXISTS memory_edges (
  edge_id TEXT PRIMARY KEY,
  source_memory_id TEXT NOT NULL REFERENCES memory_items(memory_id) ON DELETE CASCADE,
  target_memory_id TEXT NOT NULL REFERENCES memory_items(memory_id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0 CHECK(weight >= 0.0 AND weight <= 1.0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edge_source ON memory_edges(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_edge_target ON memory_edges(target_memory_id);
CREATE INDEX IF NOT EXISTS idx_edge_type ON memory_edges(relationship_type);

-- Optional embeddings table
CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT PRIMARY KEY REFERENCES memory_items(memory_id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Job run log
CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  success INTEGER,
  details TEXT DEFAULT '{}',
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_name ON job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_started ON job_runs(started_at);

-- Heartbeat processes
CREATE TABLE IF NOT EXISTS heartbeat_processes (
  process_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','stalled','completed','failed')),
  started_at TEXT NOT NULL,
  last_heartbeat TEXT NOT NULL,
  completed_at TEXT,
  heartbeat_interval_ms INTEGER NOT NULL
);

-- Configuration
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Workflow definitions
CREATE TABLE IF NOT EXISTS workflow_definitions (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  steps TEXT NOT NULL,
  trigger_conditions TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Agent context file versions (for evolution audit trail)
CREATE TABLE IF NOT EXISTS agent_context_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('agents_md','user_md','soul_md','tools_md')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  evolution_run_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_context_agent ON agent_context_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_context_created ON agent_context_versions(created_at);

-- Gateway tokens (encrypted)
CREATE TABLE IF NOT EXISTS gateway_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encrypted_token TEXT NOT NULL,
  gateway_address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Agent registrations
CREATE TABLE IF NOT EXISTS agent_registrations (
  agent_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  registration_status TEXT NOT NULL CHECK(
    registration_status IN ('registered', 'pending', 'failed')
  ),
  registered_at TEXT,
  last_verified_at TEXT,
  error TEXT
);

-- Scheduled agent jobs
CREATE TABLE IF NOT EXISTS scheduled_agent_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cron_expression TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_template TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON scheduled_agent_jobs(enabled);

-- Heartbeat action configuration
CREATE TABLE IF NOT EXISTS heartbeat_actions (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  memory_api_endpoint TEXT NOT NULL,
  query_params TEXT NOT NULL DEFAULT '{}',
  condition_logic TEXT NOT NULL,
  notification_template TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Gateway event log (fallback events, status transitions)
CREATE TABLE IF NOT EXISTS gateway_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gateway_events_type ON gateway_events(event_type);
CREATE INDEX IF NOT EXISTS idx_gateway_events_ts ON gateway_events(timestamp);

-- ============================================================
-- Dashboard State Tables (SQLite-backed, API-accessible)
-- These replace localStorage for tasks, check-ins, connections,
-- journal entries, goals, and gratitude — enabling agent access.
-- ============================================================

CREATE TABLE IF NOT EXISTS dashboard_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','in-progress','done')),
  due_date TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON dashboard_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON dashboard_tasks(priority);

CREATE TABLE IF NOT EXISTS dashboard_checkins (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  mood INTEGER NOT NULL CHECK(mood >= 1 AND mood <= 5),
  energy INTEGER NOT NULL CHECK(energy >= 1 AND energy <= 5),
  stress INTEGER NOT NULL CHECK(stress >= 1 AND stress <= 5)
);

CREATE INDEX IF NOT EXISTS idx_checkins_ts ON dashboard_checkins(timestamp);

CREATE TABLE IF NOT EXISTS dashboard_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  last_contact_date TEXT NOT NULL,
  reminder_frequency_days INTEGER NOT NULL DEFAULT 14
);

CREATE TABLE IF NOT EXISTS dashboard_journal (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_ts ON dashboard_journal(timestamp);

CREATE TABLE IF NOT EXISTS dashboard_goals (
  id TEXT PRIMARY KEY,
  quadrant TEXT NOT NULL CHECK(quadrant IN ('health','career','relationships','soul')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  target_date TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK(progress_pct >= 0 AND progress_pct <= 100),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_gratitude (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS dashboard_profile (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_focus_goals (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_focus_date ON dashboard_focus_goals(date);

CREATE TABLE IF NOT EXISTS dashboard_schedule (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_schedule_date ON dashboard_schedule(date);

-- ============================================================
-- Heartbeat Configuration & Run History
-- ============================================================

CREATE TABLE IF NOT EXISTS heartbeat_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeat_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  summary TEXT NOT NULL,
  task_count INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  actionable INTEGER NOT NULL DEFAULT 0,
  checks_run TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_ts ON heartbeat_runs(timestamp);

-- ============================================================
-- Agent Model Configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_model_config (
  agent_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'openrouter',
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================================
-- Task Activity Log — tracks what agents did on each task
-- ============================================================

CREATE TABLE IF NOT EXISTS task_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  model TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_ts ON task_activity_log(timestamp);

-- ============================================================
-- Phase 3: Self-Evolution Layer — Execution Traces
-- ============================================================

CREATE TABLE IF NOT EXISTS execution_traces (
  trace_id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  permission_level INTEGER NOT NULL,
  tool_scope TEXT NOT NULL DEFAULT '[]',
  prompt_hash TEXT NOT NULL,
  prompt_summary TEXT NOT NULL DEFAULT '',
  task_id TEXT,
  task_title TEXT,
  tool_calls TEXT NOT NULL DEFAULT '[]',
  llm_responses TEXT NOT NULL DEFAULT '[]',
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','timeout','aborted','partial')),
  outcome_reason TEXT,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  compaction_count INTEGER NOT NULL DEFAULT 0,
  hooks_aborted TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  model TEXT,
  provider TEXT
);

CREATE INDEX IF NOT EXISTS idx_traces_agent_type ON execution_traces(agent_type);
CREATE INDEX IF NOT EXISTS idx_traces_outcome ON execution_traces(outcome);
CREATE INDEX IF NOT EXISTS idx_traces_started ON execution_traces(started_at);

-- ============================================================
-- Phase 3: Self-Evolution Layer — Evolution Policies
-- ============================================================

CREATE TABLE IF NOT EXISTS evolution_policies (
  policy_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  policy_type TEXT NOT NULL,
  target TEXT NOT NULL,
  payload TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed',
  proposed_at TEXT NOT NULL,
  reviewed_at TEXT,
  activated_at TEXT,
  rolled_back_at TEXT,
  impact_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_policies_status ON evolution_policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_type ON evolution_policies(policy_type);

-- ============================================================
-- Phase 3: Self-Evolution Layer — Proposer Runs
-- ============================================================

CREATE TABLE IF NOT EXISTS proposer_runs (
  run_id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  traces_analyzed INTEGER NOT NULL DEFAULT 0,
  proposals_generated INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  error TEXT
);

-- ============================================================
-- Provider API Keys — encrypted storage for LLM/service keys
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_keys (
  provider_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  encrypted_key TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- ============================================================
-- Subtasks — child tasks for multi-step agent workflows
-- ============================================================

CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  parent_task_id TEXT NOT NULL REFERENCES dashboard_tasks(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  step_order INTEGER NOT NULL DEFAULT 0,
  agent_id TEXT,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  output TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subtasks_parent ON subtasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_status ON subtasks(status);

-- ============================================================
-- Model Catalog — cached from OpenRouter /api/v1/models
-- ============================================================

CREATE TABLE IF NOT EXISTS model_catalog (
  model_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  context_length INTEGER NOT NULL DEFAULT 0,
  price_input_per_m REAL NOT NULL DEFAULT 0,
  price_output_per_m REAL NOT NULL DEFAULT 0,
  supports_tools INTEGER NOT NULL DEFAULT 0,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
`
