/**
 * LCM Bridge — Read-only client for the lossless-claw SQLite database.
 *
 * Octavius reads directly from LCM's SQLite DB (same machine, WAL mode
 * supports concurrent readers) to surface conversation history, summary
 * DAG stats, and cross-search results in the dashboard without requiring
 * the OpenClaw gateway to be running.
 *
 * This is a read-only bridge. All writes go through OpenClaw → lossless-claw.
 *
 * LCM schema reference (from lossless-claw/src/db/migration.ts):
 *   conversations: conversation_id (PK), session_id, session_key, created_at
 *   messages: message_id (PK), conversation_id (FK), seq, role, content, token_count, created_at
 *   summaries: summary_id (PK), conversation_id (FK), kind, depth, content, token_count,
 *              earliest_at, latest_at, created_at, file_ids
 *   large_files: file_id (PK), conversation_id (FK)
 */
import Database from 'better-sqlite3'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── Types ──

export interface LcmConversation {
  id: number
  sessionId: string
  sessionKey: string | null
  messageCount: number
  createdAt: string
  lastMessageAt: string | null
}

export interface LcmSummaryStats {
  totalSummaries: number
  leafSummaries: number
  condensedSummaries: number
  maxDepth: number
  totalSummaryTokens: number
}

export interface LcmStatus {
  available: boolean
  dbPath: string
  conversations: number
  totalMessages: number
  summaryStats: LcmSummaryStats
  largeFiles: number
  dbSizeBytes: number
}

export interface LcmSearchHit {
  type: 'message' | 'summary'
  id: number | string
  conversationId: number
  content: string
  createdAt: string
  depth?: number
  kind?: string
  role?: string
}

export interface LcmConversationDetail {
  conversation: LcmConversation
  summaries: Array<{
    summaryId: string
    depth: number
    kind: string
    tokenCount: number
    earliestAt: string | null
    latestAt: string | null
    contentPreview: string
  }>
  recentMessages: Array<{
    id: number
    role: string
    content: string
    createdAt: string
    tokenCount: number
  }>
}

// ── Default DB path ──

function defaultLcmDbPath(): string {
  return (
    process.env.LCM_DATABASE_PATH ??
    join(process.env.HOME ?? '~', '.openclaw', 'lcm.db')
  )
}

// ── Client ──

export class LcmBridgeClient {
  private db: Database.Database | null = null
  private readonly dbPath: string

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? defaultLcmDbPath()
  }

  /** Check if the LCM database file exists and is readable. */
  isAvailable(): boolean {
    return existsSync(this.dbPath)
  }

  /** Open a read-only connection to the LCM database. */
  private open(): Database.Database {
    if (this.db) return this.db
    if (!this.isAvailable()) {
      throw new Error(`LCM database not found at ${this.dbPath}`)
    }
    this.db = new Database(this.dbPath, { readonly: true })
    this.db.pragma('journal_mode = WAL')
    return this.db
  }

  /** Close the connection. */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /** Get overall LCM status for the dashboard. */
  getStatus(): LcmStatus {
    if (!this.isAvailable()) {
      return {
        available: false,
        dbPath: this.dbPath,
        conversations: 0,
        totalMessages: 0,
        summaryStats: { totalSummaries: 0, leafSummaries: 0, condensedSummaries: 0, maxDepth: 0, totalSummaryTokens: 0 },
        largeFiles: 0,
        dbSizeBytes: 0,
      }
    }

    try {
      const db = this.open()
      const fileStats = statSync(this.dbPath)

      const convCount = (db.prepare('SELECT COUNT(*) as c FROM conversations').get() as { c: number }).c
      const msgCount = (db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number }).c

      let summaryStats: LcmSummaryStats = { totalSummaries: 0, leafSummaries: 0, condensedSummaries: 0, maxDepth: 0, totalSummaryTokens: 0 }
      try {
        const total = (db.prepare('SELECT COUNT(*) as c FROM summaries').get() as { c: number }).c
        const leaf = (db.prepare("SELECT COUNT(*) as c FROM summaries WHERE kind = 'leaf'").get() as { c: number }).c
        const condensed = (db.prepare("SELECT COUNT(*) as c FROM summaries WHERE kind = 'condensed'").get() as { c: number }).c
        const maxDepth = (db.prepare('SELECT COALESCE(MAX(depth), 0) as d FROM summaries').get() as { d: number }).d
        const totalTokens = (db.prepare('SELECT COALESCE(SUM(token_count), 0) as t FROM summaries').get() as { t: number }).t
        summaryStats = { totalSummaries: total, leafSummaries: leaf, condensedSummaries: condensed, maxDepth, totalSummaryTokens: totalTokens }
      } catch { /* summaries table may not exist yet */ }

      let largeFiles = 0
      try {
        largeFiles = (db.prepare('SELECT COUNT(*) as c FROM large_files').get() as { c: number }).c
      } catch { /* table may not exist */ }

      return {
        available: true,
        dbPath: this.dbPath,
        conversations: convCount,
        totalMessages: msgCount,
        summaryStats,
        largeFiles,
        dbSizeBytes: fileStats.size,
      }
    } catch {
      return {
        available: false,
        dbPath: this.dbPath,
        conversations: 0,
        totalMessages: 0,
        summaryStats: { totalSummaries: 0, leafSummaries: 0, condensedSummaries: 0, maxDepth: 0, totalSummaryTokens: 0 },
        largeFiles: 0,
        dbSizeBytes: 0,
      }
    }
  }

  /** List all conversations with message counts. */
  listConversations(): LcmConversation[] {
    if (!this.isAvailable()) return []
    try {
      const db = this.open()
      const rows = db.prepare(`
        SELECT
          c.conversation_id AS id,
          c.session_id AS sessionId,
          c.session_key AS sessionKey,
          c.created_at AS createdAt,
          COUNT(m.message_id) AS messageCount,
          MAX(m.created_at) AS lastMessageAt
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.conversation_id
        GROUP BY c.conversation_id
        ORDER BY MAX(m.created_at) DESC
        LIMIT 100
      `).all() as LcmConversation[]
      return rows
    } catch {
      return []
    }
  }

  /** Get detail for a single conversation (summaries + recent messages). */
  getConversationDetail(conversationId: number): LcmConversationDetail | null {
    if (!this.isAvailable()) return null
    try {
      const db = this.open()

      const conv = db.prepare(`
        SELECT
          c.conversation_id AS id,
          c.session_id AS sessionId,
          c.session_key AS sessionKey,
          c.created_at AS createdAt,
          COUNT(m.message_id) AS messageCount,
          MAX(m.created_at) AS lastMessageAt
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.conversation_id
        WHERE c.conversation_id = ?
        GROUP BY c.conversation_id
      `).get(conversationId) as LcmConversation | undefined

      if (!conv) return null

      const summaries = db.prepare(`
        SELECT
          summary_id AS summaryId, depth, kind,
          token_count AS tokenCount,
          earliest_at AS earliestAt, latest_at AS latestAt,
          SUBSTR(content, 1, 200) AS contentPreview
        FROM summaries
        WHERE conversation_id = ?
        ORDER BY depth DESC, created_at DESC
        LIMIT 50
      `).all(conversationId) as LcmConversationDetail['summaries']

      const recentMessages = db.prepare(`
        SELECT message_id AS id, role, SUBSTR(content, 1, 500) AS content,
               created_at AS createdAt, token_count AS tokenCount
        FROM messages
        WHERE conversation_id = ?
        ORDER BY seq DESC
        LIMIT 20
      `).all(conversationId) as LcmConversationDetail['recentMessages']

      return { conversation: conv, summaries, recentMessages: recentMessages.reverse() }
    } catch {
      return null
    }
  }

  /**
   * Search across LCM messages and summaries using LIKE pattern matching.
   * This is a simple bridge search — the full lcm_grep tool in OpenClaw
   * supports regex and FTS5, but for the dashboard we use LIKE for safety.
   */
  search(query: string, limit = 20): LcmSearchHit[] {
    if (!this.isAvailable() || !query.trim()) return []
    try {
      const db = this.open()
      const pattern = `%${query.replace(/%/g, '\\%')}%`
      const results: LcmSearchHit[] = []

      // Search messages
      try {
        const msgs = db.prepare(`
          SELECT message_id AS id, conversation_id AS conversationId, role,
                 SUBSTR(content, 1, 300) AS content, created_at AS createdAt
          FROM messages
          WHERE content LIKE ? ESCAPE '\\'
          ORDER BY created_at DESC
          LIMIT ?
        `).all(pattern, limit) as Array<{
          id: number; conversationId: number; role: string; content: string; createdAt: string
        }>
        for (const m of msgs) {
          results.push({ type: 'message', id: m.id, conversationId: m.conversationId, content: m.content, createdAt: m.createdAt, role: m.role })
        }
      } catch { /* messages table may not exist */ }

      // Search summaries
      try {
        const sums = db.prepare(`
          SELECT summary_id AS id, conversation_id AS conversationId,
                 SUBSTR(content, 1, 300) AS content, created_at AS createdAt,
                 depth, kind
          FROM summaries
          WHERE content LIKE ? ESCAPE '\\'
          ORDER BY created_at DESC
          LIMIT ?
        `).all(pattern, limit) as Array<{
          id: string; conversationId: number; content: string; createdAt: string; depth: number; kind: string
        }>
        for (const s of sums) {
          results.push({ type: 'summary', id: s.id, conversationId: s.conversationId, content: s.content, createdAt: s.createdAt, depth: s.depth, kind: s.kind })
        }
      } catch { /* summaries table may not exist */ }

      results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return results.slice(0, limit)
    } catch {
      return []
    }
  }

  /**
   * Get recent conversation context for the evolution job.
   * Returns the most recent summaries across all conversations,
   * which the evolution job can use to extract behavioral patterns.
   */
  getRecentSummariesForEvolution(limit = 30): Array<{
    summaryId: string
    conversationId: number
    sessionKey: string | null
    depth: number
    content: string
    earliestAt: string | null
    latestAt: string | null
  }> {
    if (!this.isAvailable()) return []
    try {
      const db = this.open()
      return db.prepare(`
        SELECT
          s.summary_id AS summaryId,
          s.conversation_id AS conversationId,
          c.session_key AS sessionKey,
          s.depth,
          s.content,
          s.earliest_at AS earliestAt,
          s.latest_at AS latestAt
        FROM summaries s
        JOIN conversations c ON c.conversation_id = s.conversation_id
        ORDER BY s.created_at DESC
        LIMIT ?
      `).all(limit) as Array<{
        summaryId: string; conversationId: number; sessionKey: string | null
        depth: number; content: string; earliestAt: string | null; latestAt: string | null
      }>
    } catch {
      return []
    }
  }
}
