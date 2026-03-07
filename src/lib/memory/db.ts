import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Default database file path relative to the octavius project root. */
const DEFAULT_DB_PATH = resolve(import.meta.dirname ?? __dirname, '../../../../.data/memory.sqlite')

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
`
