import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync, unlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LcmBridgeClient } from './client'

/**
 * Tests for the LCM Bridge Client.
 *
 * Creates a temporary SQLite database with the LCM schema and verifies
 * that the read-only bridge correctly queries conversations, messages,
 * summaries, and search results.
 */

const TEST_DIR = join(tmpdir(), `octavius-lcm-test-${Date.now()}`)
const TEST_DB_PATH = join(TEST_DIR, 'lcm.db')

function createTestDb(): Database.Database {
  mkdirSync(TEST_DIR, { recursive: true })
  const db = new Database(TEST_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Minimal LCM schema matching lossless-claw/src/db/migration.ts
  db.exec(`
    CREATE TABLE conversations (
      conversation_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      session_key TEXT,
      title TEXT,
      bootstrapped_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE messages (
      message_id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(conversation_id),
      seq INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (conversation_id, seq)
    );

    CREATE TABLE summaries (
      summary_id TEXT PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(conversation_id),
      kind TEXT NOT NULL CHECK (kind IN ('leaf', 'condensed')),
      depth INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      earliest_at TEXT,
      latest_at TEXT,
      descendant_count INTEGER NOT NULL DEFAULT 0,
      descendant_token_count INTEGER NOT NULL DEFAULT 0,
      source_message_token_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      file_ids TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE large_files (
      file_id TEXT PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(conversation_id),
      file_name TEXT,
      mime_type TEXT,
      byte_size INTEGER,
      storage_uri TEXT NOT NULL,
      exploration_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  return db
}

function seedTestData(db: Database.Database): void {
  // Insert conversations
  db.prepare(`
    INSERT INTO conversations (session_id, session_key, created_at)
    VALUES (?, ?, ?)
  `).run('sess-001', 'agent:main:chat', '2026-03-01T10:00:00Z')

  db.prepare(`
    INSERT INTO conversations (session_id, session_key, created_at)
    VALUES (?, ?, ?)
  `).run('sess-002', 'agent:lifeforce:task:health-review', '2026-03-02T14:00:00Z')

  // Insert messages into conversation 1
  const insertMsg = db.prepare(`
    INSERT INTO messages (conversation_id, seq, role, content, token_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  insertMsg.run(1, 1, 'user', 'Help me plan my week', 10, '2026-03-01T10:00:00Z')
  insertMsg.run(1, 2, 'assistant', 'Here is your weekly plan with focus goals', 20, '2026-03-01T10:00:05Z')
  insertMsg.run(1, 3, 'user', 'Add a task for the deployment review', 12, '2026-03-01T10:01:00Z')

  // Insert messages into conversation 2
  insertMsg.run(2, 1, 'user', 'Check my sleep patterns from last week', 15, '2026-03-02T14:00:00Z')
  insertMsg.run(2, 2, 'assistant', 'Your HRV has been declining. Consider earlier bedtimes.', 25, '2026-03-02T14:00:10Z')

  // Insert summaries
  db.prepare(`
    INSERT INTO summaries (summary_id, conversation_id, kind, depth, content, token_count, earliest_at, latest_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sum_abc123def456', 1, 'leaf', 0,
    'User planned their week focusing on deployment review and health goals. Discussed task prioritization strategy.',
    50, '2026-03-01T10:00:00Z', '2026-03-01T10:01:00Z', '2026-03-01T10:02:00Z',
  )

  db.prepare(`
    INSERT INTO summaries (summary_id, conversation_id, kind, depth, content, token_count, earliest_at, latest_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sum_789ghi012jkl', 1, 'condensed', 1,
    'High-level overview: weekly planning session covering deployment and health.',
    30, '2026-03-01T10:00:00Z', '2026-03-01T10:01:00Z', '2026-03-01T10:05:00Z',
  )

  // Insert a large file
  db.prepare(`
    INSERT INTO large_files (file_id, conversation_id, file_name, storage_uri, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('file_test001', 1, 'config.yaml', '/tmp/lcm-files/1/file_test001.yaml', '2026-03-01T10:00:30Z')
}

describe('LcmBridgeClient', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedTestData(db)
    db.close()
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('reports unavailable when DB does not exist', () => {
    const client = new LcmBridgeClient('/nonexistent/path/lcm.db')
    expect(client.isAvailable()).toBe(false)
    const status = client.getStatus()
    expect(status.available).toBe(false)
    expect(status.conversations).toBe(0)
    client.close()
  })

  it('reports available and correct stats', () => {
    const client = new LcmBridgeClient(TEST_DB_PATH)
    expect(client.isAvailable()).toBe(true)

    const status = client.getStatus()
    expect(status.available).toBe(true)
    expect(status.conversations).toBe(2)
    expect(status.totalMessages).toBe(5)
    expect(status.summaryStats.totalSummaries).toBe(2)
    expect(status.summaryStats.leafSummaries).toBe(1)
    expect(status.summaryStats.condensedSummaries).toBe(1)
    expect(status.summaryStats.maxDepth).toBe(1)
    expect(status.summaryStats.totalSummaryTokens).toBe(80)
    expect(status.largeFiles).toBe(1)
    expect(status.dbSizeBytes).toBeGreaterThan(0)
    client.close()
  })

  it('lists conversations ordered by last message', () => {
    const client = new LcmBridgeClient(TEST_DB_PATH)
    const convs = client.listConversations()

    expect(convs).toHaveLength(2)
    // Conversation 2 has the most recent message
    expect(convs[0].id).toBe(2)
    expect(convs[0].sessionKey).toBe('agent:lifeforce:task:health-review')
    expect(convs[0].messageCount).toBe(2)
    expect(convs[1].id).toBe(1)
    expect(convs[1].messageCount).toBe(3)
    client.close()
  })

  it('returns conversation detail with summaries and messages', () => {
    const client = new LcmBridgeClient(TEST_DB_PATH)
    const detail = client.getConversationDetail(1)

    expect(detail).not.toBeNull()
    expect(detail!.conversation.id).toBe(1)
    expect(detail!.conversation.messageCount).toBe(3)
    expect(detail!.summaries).toHaveLength(2)
    // Summaries ordered by depth DESC
    expect(detail!.summaries[0].depth).toBe(1)
    expect(detail!.summaries[0].kind).toBe('condensed')
    expect(detail!.summaries[1].depth).toBe(0)
    expect(detail!.summaries[1].kind).toBe('leaf')
    // Recent messages ordered by seq ASC (reversed from DESC query)
    expect(detail!.recentMessages).toHaveLength(3)
    expect(detail!.recentMessages[0].role).toBe('user')
    expect(detail!.recentMessages[2].role).toBe('user')
    client.close()
  })

  it('returns null for nonexistent conversation', () => {
    const client = new LcmBridgeClient(TEST_DB_PATH)
    expect(client.getConversationDetail(999)).toBeNull()
    client.close()
  })

  it('searches messages and summaries', () => {
    const client = new LcmBridgeClient(TEST_DB_PATH)

    const results = client.search('deployment')
    expect(results.length).toBeGreaterThan(0)
    // Should find the message and the summary mentioning deployment
    const types = results.map((r) => r.type)
    expect(types).toContain('message')
    expect(types).toContain('summary')
    client.close()
  })

  it('search returns empty for no matches', () => {
    const client = new LcmBridgeClient(TEST_DB_PATH)
    const results = client.search('xyznonexistent')
    expect(results).toHaveLength(0)
    client.close()
  })

  it('search returns empty for empty query', () => {
    const client = new LcmBridgeClient(TEST_DB_PATH)
    expect(client.search('')).toHaveLength(0)
    expect(client.search('   ')).toHaveLength(0)
    client.close()
  })

  it('gets recent summaries for evolution', () => {
    const client = new LcmBridgeClient(TEST_DB_PATH)
    const summaries = client.getRecentSummariesForEvolution(10)

    expect(summaries).toHaveLength(2)
    // Most recent first
    expect(summaries[0].summaryId).toBe('sum_789ghi012jkl')
    expect(summaries[0].sessionKey).toBe('agent:main:chat')
    expect(summaries[0].depth).toBe(1)
    expect(summaries[1].summaryId).toBe('sum_abc123def456')
    client.close()
  })

  it('returns empty arrays when DB is unavailable', () => {
    const client = new LcmBridgeClient('/nonexistent/lcm.db')
    expect(client.listConversations()).toEqual([])
    expect(client.getConversationDetail(1)).toBeNull()
    expect(client.search('test')).toEqual([])
    expect(client.getRecentSummariesForEvolution()).toEqual([])
    client.close()
  })
})
