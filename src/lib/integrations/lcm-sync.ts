/**
 * LCM Integration — Automatic sync from LosslessClaw Memory to Octavius QMD
 * 
 * Zero-config: Auto-detects LCM database and imports conversations as memories.
 * Runs on startup and can be triggered via API.
 * 
 * Features:
 * - Detects ~/.openclaw/lcm.db automatically
 * - Imports conversations as episodic memories
 * - Tags with conversation ID for traceability
 * - Prevents duplicates via source_id tracking
 * - Summarizes long conversations before storing
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { MemoryService } from '../memory/service'

/** Default LCM database path */
const LCM_DB_PATH = resolve(process.env.HOME || '~', '.openclaw/lcm.db')

/** Check if LCM database exists */
export function hasLCM(): boolean {
  return existsSync(LCM_DB_PATH)
}

/** Get LCM database connection (read-only) */
export function getLCMDatabase(): Database.Database | null {
  if (!hasLCM()) return null
  
  try {
    const db = new Database(LCM_DB_PATH, { readonly: true })
    db.pragma('journal_mode = WAL')
    return db
  } catch {
    return null
  }
}

/** Conversation row from LCM */
interface LCMConversation {
  conversation_id: string
  session_key: string
  created_at: string
}

/** Message row from LCM */
interface LCMMessage {
  role: string
  content: string
  created_at: string
}

/**
 * Import conversations from LCM to Octavius memory.
 * 
 * Strategy:
 * 1. Get all conversations from last N days (default 7)
 * 2. For each conversation, fetch messages
 * 3. Summarize into a single episodic memory
 * 4. Tag with conversation_id for traceability
 * 5. Skip if already imported (check source_id)
 */
export function importLCMConversations(
  memoryService: MemoryService,
  options: { days?: number; limit?: number } = {},
): { imported: number; skipped: number; errors: number } {
  const lcmDb = getLCMDatabase()
  if (!lcmDb) {
    console.log('[LCM] No LCM database found — skipping import')
    return { imported: 0, skipped: 0, errors: 0 }
  }

  const { days = 7, limit = 50 } = options
  const now = new Date()
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const cutoffStr = cutoff.toISOString()

  console.log(`[LCM] Importing conversations since ${cutoffStr}...`)

  // Get conversations - LCM uses conversation_id only (no session_key in messages table)
  const conversations = lcmDb
    .prepare(
      `SELECT DISTINCT conversation_id, conversation_id as session_key, MIN(created_at) as created_at
       FROM messages 
       WHERE created_at >= ? 
       GROUP BY conversation_id
       ORDER BY created_at DESC 
       LIMIT ?`,
    )
    .all(cutoffStr, limit) as LCMConversation[]

  let imported = 0
  let skipped = 0
  let errors = 0

  for (const conv of conversations) {
    try {
      // Check if already imported
      const existing = memoryService.list({
        tags: [`conversation:${conv.conversation_id}`],
      })

      if (existing.items.length > 0) {
        console.log(`[LCM] Skipping ${conv.conversation_id} — already imported`)
        skipped++
        continue
      }

      // Fetch messages
      const messages = lcmDb
        .prepare(
          `SELECT role, content, created_at 
           FROM messages 
           WHERE conversation_id = ? 
           ORDER BY created_at ASC`,
        )
        .all(conv.conversation_id) as LCMMessage[]

      if (messages.length === 0) {
        continue
      }

      // Summarize conversation
      const summary = summarizeConversation(messages, conv)

      // Store as episodic memory
      memoryService.create({
        text: summary,
        type: 'episodic',
        layer: 'daily_notes',
        provenance: {
          source_type: 'user_input' as const,
          source_id: `lcm-${conv.conversation_id}`,
          agent_id: null,
        },
        confidence: 0.9,
        importance: 0.6,
        tags: [
          'lcm-import',
          `conversation:${conv.conversation_id}`,
          `session:${conv.session_key}`,
        ],
      })

      console.log(`[LCM] Imported ${conv.conversation_id} (${messages.length} messages)`)
      imported++
    } catch (err) {
      console.error(`[LCM] Error importing ${conv.conversation_id}:`, err)
      errors++
    }
  }

  lcmDb.close()

  console.log(`[LCM] Import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`)
  return { imported, skipped, errors }
}

/**
 * Summarize a conversation into a single text block.
 * 
 * For short conversations (< 10 messages), include full transcript.
 * For longer ones, extract key exchanges and decisions.
 */
function summarizeConversation(messages: LCMMessage[], conv: LCMConversation): string {
  const header = [
    `# Conversation: ${conv.session_key}`,
    `**Conversation ID:** ${conv.conversation_id}`,
    `**Started:** ${conv.created_at}`,
    `**Messages:** ${messages.length}`,
    '',
    '---',
    '',
  ].join('\n')

  // Short conversation: include everything
  if (messages.length <= 10) {
    const transcript = messages
      .map((m) => `### ${m.role.toUpperCase()} — ${m.created_at}\n\n${m.content}`)
      .join('\n\n---\n\n')

    return header + transcript
  }

  // Long conversation: summarize
  const userMessages = messages.filter((m) => m.role === 'user')
  const assistantMessages = messages.filter((m) => m.role === 'assistant')

  const firstUserMsg = userMessages[0]?.content?.slice(0, 500) || 'Unknown'
  const lastAssistantMsg = assistantMessages[assistantMessages.length - 1]?.content?.slice(0, 500) || 'Unknown'

  return [
    header,
    `## Summary`,
    `This conversation had **${messages.length} messages** (${userMessages.length} user, ${assistantMessages.length} assistant).`,
    '',
    `**Opening:** "${firstUserMsg}..."`,
    '',
    `**Final response:** "${lastAssistantMsg}..."`,
    '',
    `**Full transcript:** ${messages.length} messages (truncated for brevity)`,
    '',
    '---',
    '',
    `## Key Exchanges`,
    '',
    // Include first 3 and last 3 exchanges
    ...messages.slice(0, 6).map((m) => `### ${m.role.toUpperCase()}\n\n${m.content.slice(0, 300)}...`),
    '',
    '...\n',
    '',
    ...messages.slice(-3).map((m) => `### ${m.role.toUpperCase()}\n\n${m.content.slice(0, 300)}...`),
  ].join('\n')
}

/**
 * Trigger LCM import via API endpoint.
 * 
 * POST /api/integrations/lcm/import
 * Body: { days?: number; limit?: number }
 */
export function createLCMImportEndpoint(memoryService: MemoryService) {
  return async (request: Request) => {
    try {
      const body = (await request.json().catch(() => ({}))) as { days?: number; limit?: number }
      const result = importLCMConversations(memoryService, body)
      return Response.json({ success: true, ...result })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ success: false, error: message }, { status: 500 })
    }
  }
}

/**
 * Auto-run LCM import on startup if LCM is detected.
 * 
 * Call this from your main server initialization.
 */
export function autoImportLCM(memoryService: MemoryService): void {
  if (!hasLCM()) {
    console.log('[LCM Integration] LCM not detected — skipping auto-import')
    return
  }

  console.log('[LCM Integration] LCM detected — importing recent conversations...')
  
  // Run in next tick to not block startup
  setTimeout(() => {
    try {
      importLCMConversations(memoryService, { days: 7, limit: 20 })
      console.log('[LCM Integration] Auto-import complete')
    } catch (err) {
      console.error('[LCM Integration] Auto-import failed:', err)
    }
  }, 1000)
}
