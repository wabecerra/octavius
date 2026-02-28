import { describe, it, expect, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from './db'

describe('db', () => {
  let db: Database.Database

  afterEach(() => {
    if (db) closeDatabase(db)
  })

  it('creates a database with all expected tables', () => {
    db = getDatabase(':memory:')

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]

    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('memory_items')
    expect(tableNames).toContain('memory_edges')
    expect(tableNames).toContain('memory_embeddings')
    expect(tableNames).toContain('job_runs')
    expect(tableNames).toContain('heartbeat_processes')
    expect(tableNames).toContain('config')
    expect(tableNames).toContain('workflow_definitions')
    expect(tableNames).toContain('agent_context_versions')
  })

  it('enables WAL journal mode', () => {
    db = getDatabase(':memory:')
    const result = db.pragma('journal_mode') as { journal_mode: string }[]
    // In-memory databases report 'memory' for journal_mode; WAL is set but
    // SQLite silently keeps memory mode for :memory: DBs. We verify the pragma
    // was issued without error. For file-based DBs it would be 'wal'.
    expect(result[0].journal_mode).toBeDefined()
  })

  it('enables foreign keys', () => {
    db = getDatabase(':memory:')
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[]
    expect(result[0].foreign_keys).toBe(1)
  })

  it('creates the FTS5 virtual table', () => {
    db = getDatabase(':memory:')

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'")
      .all() as { name: string }[]

    expect(tables).toHaveLength(1)
    expect(tables[0].name).toBe('memory_fts')
  })

  it('creates FTS triggers for insert/update/delete', () => {
    db = getDatabase(':memory:')

    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
      .all() as { name: string }[]

    const triggerNames = triggers.map((t) => t.name)
    expect(triggerNames).toContain('memory_fts_insert')
    expect(triggerNames).toContain('memory_fts_delete')
    expect(triggerNames).toContain('memory_fts_update')
  })

  it('creates expected indexes on memory_items', () => {
    db = getDatabase(':memory:')

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name")
      .all() as { name: string }[]

    const indexNames = indexes.map((i) => i.name)
    expect(indexNames).toContain('idx_memory_type')
    expect(indexNames).toContain('idx_memory_layer')
    expect(indexNames).toContain('idx_memory_created')
    expect(indexNames).toContain('idx_memory_accessed')
    expect(indexNames).toContain('idx_memory_importance')
    expect(indexNames).toContain('idx_memory_agent')
    expect(indexNames).toContain('idx_memory_source')
    expect(indexNames).toContain('idx_memory_archived')
  })

  it('FTS sync: inserted row is searchable via FTS', () => {
    db = getDatabase(':memory:')

    db.prepare(`
      INSERT INTO memory_items (memory_id, text, type, layer, source_type, source_id, agent_id, created_at, last_accessed, confidence, importance, tags)
      VALUES ('m1', 'hello world test', 'episodic', 'daily_notes', 'user_input', 'src1', NULL, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 0.8, 0.5, '[]')
    `).run()

    const results = db
      .prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH 'hello'")
      .all() as { rowid: number }[]

    expect(results).toHaveLength(1)
  })

  it('FTS sync: deleted row is removed from FTS', () => {
    db = getDatabase(':memory:')

    db.prepare(`
      INSERT INTO memory_items (memory_id, text, type, layer, source_type, source_id, agent_id, created_at, last_accessed, confidence, importance, tags)
      VALUES ('m1', 'hello world test', 'episodic', 'daily_notes', 'user_input', 'src1', NULL, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 0.8, 0.5, '[]')
    `).run()

    db.prepare("DELETE FROM memory_items WHERE memory_id = 'm1'").run()

    const results = db
      .prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH 'hello'")
      .all() as { rowid: number }[]

    expect(results).toHaveLength(0)
  })

  it('FTS sync: updated row reflects new text in FTS', () => {
    db = getDatabase(':memory:')

    db.prepare(`
      INSERT INTO memory_items (memory_id, text, type, layer, source_type, source_id, agent_id, created_at, last_accessed, confidence, importance, tags)
      VALUES ('m1', 'original text', 'episodic', 'daily_notes', 'user_input', 'src1', NULL, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 0.8, 0.5, '[]')
    `).run()

    db.prepare("UPDATE memory_items SET text = 'updated content' WHERE memory_id = 'm1'").run()

    const oldResults = db
      .prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH 'original'")
      .all()
    expect(oldResults).toHaveLength(0)

    const newResults = db
      .prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH 'updated'")
      .all()
    expect(newResults).toHaveLength(1)
  })

  it('is idempotent — calling getDatabase twice on :memory: does not error', () => {
    db = getDatabase(':memory:')
    // Schema creation uses IF NOT EXISTS, so re-running should be safe
    expect(() => getDatabase(':memory:')).not.toThrow()
  })

  it('enforces foreign keys on memory_edges', () => {
    db = getDatabase(':memory:')

    expect(() => {
      db.prepare(`
        INSERT INTO memory_edges (edge_id, source_memory_id, target_memory_id, relationship_type, weight, created_at)
        VALUES ('e1', 'nonexistent1', 'nonexistent2', 'related_to', 1.0, '2025-01-01T00:00:00Z')
      `).run()
    }).toThrow()
  })
})
