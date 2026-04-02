import { getDatabase } from '@/lib/memory/db'
import { createHash } from 'node:crypto'

/**
 * Dashboard-Memory Bridge
 *
 * Automatically creates memory items from dashboard actions (journal entries,
 * check-ins, task completions) to ensure all life events are captured in the
 * unified memory system.
 *
 * All functions use INSERT OR IGNORE with deterministic IDs to prevent duplicates
 * and wrap in try/catch to ensure memory writes never break API responses.
 */

interface JournalEntry {
  id: string
  text: string
  timestamp: string
}

interface CheckIn {
  id: string
  timestamp: string
  mood: number
  energy: number
  stress: number
}

interface Task {
  id: string
  title: string
  description?: string
  quadrant?: string
  status: string
  priority?: string
  completed?: boolean
}

/**
 * Creates a deterministic memory ID from source type and source ID
 */
function createMemoryId(sourceType: string, sourceId: string): string {
  return createHash('sha256')
    .update(`${sourceType}:${sourceId}`)
    .digest('hex')
    .substring(0, 16)
}

/**
 * Maps quadrant to appropriate tag
 */
function quadrantToTag(quadrant?: string): string {
  const map: Record<string, string> = {
    health: 'lifeforce',
    career: 'industry',
    relationships: 'fellowship',
    soul: 'essence',
  }
  return map[quadrant || ''] || 'general'
}

/**
 * Converts a journal entry to an episodic memory item with essence quadrant tag.
 * Uses INSERT OR IGNORE to prevent duplicates.
 */
export function journalToMemory(entry: JournalEntry): void {
  try {
    const db = getDatabase()
    const memoryId = createMemoryId('journal', entry.id)
    const now = new Date().toISOString()

    // Essence quadrant — journal entries are reflections on soul/meaning
    const tags = JSON.stringify(['essence', 'journal', 'reflection'])

    db.prepare(`
      INSERT OR IGNORE INTO memory_items (
        memory_id, text, type, layer, source_type, source_id,
        created_at, last_accessed, confidence, importance, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memoryId,
      entry.text,
      'episodic',
      'daily_notes',
      'journal',
      entry.id,
      entry.timestamp,
      now,
      1.0, // high confidence — direct user input
      0.7, // medium-high importance — journal entries are meaningful
      tags
    )
  } catch (error) {
    console.error('[dashboard-memory-bridge] Failed to create memory from journal entry:', error)
    // Never throw — memory writes must be fire-and-forget
  }
}

/**
 * Converts a wellness check-in to an episodic memory item with lifeforce quadrant tag.
 * Uses INSERT OR IGNORE to prevent duplicates.
 */
export function checkinToMemory(checkin: CheckIn): void {
  try {
    const db = getDatabase()
    const memoryId = createMemoryId('checkin', checkin.id)
    const now = new Date().toISOString()

    // Lifeforce quadrant — check-ins track physical/mental wellness
    const tags = JSON.stringify(['lifeforce', 'wellness', 'check-in'])

    const text = `Wellness check-in: mood ${checkin.mood}/5, energy ${checkin.energy}/5, stress ${checkin.stress}/5`

    db.prepare(`
      INSERT OR IGNORE INTO memory_items (
        memory_id, text, type, layer, source_type, source_id,
        created_at, last_accessed, confidence, importance, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memoryId,
      text,
      'episodic',
      'daily_notes',
      'checkin',
      checkin.id,
      checkin.timestamp,
      now,
      1.0, // high confidence — direct user input
      0.6, // medium importance — regular wellness tracking
      tags
    )
  } catch (error) {
    console.error('[dashboard-memory-bridge] Failed to create memory from check-in:', error)
    // Never throw — memory writes must be fire-and-forget
  }
}

/**
 * Converts a completed task to an episodic memory item with appropriate quadrant tag.
 * Uses INSERT OR IGNORE to prevent duplicates.
 * Only creates memory for tasks that are marked as 'done'.
 */
export function taskCompletionToMemory(task: Task): void {
  // Only create memory for completed tasks
  if (task.status !== 'done') return

  try {
    const db = getDatabase()
    const memoryId = createMemoryId('task_completion', task.id)
    const now = new Date().toISOString()

    // Map quadrant to appropriate tag
    const quadrantTag = quadrantToTag(task.quadrant)
    const tags = JSON.stringify([quadrantTag, 'task', 'completion'])

    const text = task.description
      ? `Completed task: ${task.title} — ${task.description}`
      : `Completed task: ${task.title}`

    db.prepare(`
      INSERT OR IGNORE INTO memory_items (
        memory_id, text, type, layer, source_type, source_id,
        created_at, last_accessed, confidence, importance, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memoryId,
      text,
      'episodic',
      'daily_notes',
      'task_completion',
      task.id,
      now,
      now,
      1.0, // high confidence — direct user action
      task.priority === 'high' ? 0.8 : 0.6, // importance varies by priority
      tags
    )
  } catch (error) {
    console.error('[dashboard-memory-bridge] Failed to create memory from task completion:', error)
    // Never throw — memory writes must be fire-and-forget
  }
}
