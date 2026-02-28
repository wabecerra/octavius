import type Database from 'better-sqlite3'

/**
 * Context Annotations — adds descriptive metadata to memory sources and paths,
 * helping agents understand what kind of memories they're looking at.
 * Inspired by QMD's context tree feature.
 *
 * Contexts are hierarchical: a context on "quadrant:lifeforce" applies to all
 * memories tagged with that quadrant. More specific contexts override general ones.
 */

export interface ContextAnnotation {
  path: string       // e.g. "quadrant:lifeforce", "source:device_sync", "agent:agent-lifeforce"
  description: string // human-written context, e.g. "Health biometrics from RingConn smart ring"
  updated_at: string
}

/**
 * Ensure the context_annotations table exists.
 */
function ensureTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_annotations (
      path TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

/**
 * Add or update a context annotation for a path.
 */
export function setContext(
  db: Database.Database,
  path: string,
  description: string,
): ContextAnnotation {
  ensureTable(db)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR REPLACE INTO context_annotations (path, description, updated_at)
     VALUES (?, ?, ?)`,
  ).run(path, description, now)
  return { path, description, updated_at: now }
}

/**
 * Remove a context annotation.
 */
export function removeContext(db: Database.Database, path: string): boolean {
  ensureTable(db)
  const result = db.prepare('DELETE FROM context_annotations WHERE path = ?').run(path)
  return result.changes > 0
}

/**
 * List all context annotations.
 */
export function listContexts(db: Database.Database): ContextAnnotation[] {
  ensureTable(db)
  return db.prepare('SELECT * FROM context_annotations ORDER BY path').all() as ContextAnnotation[]
}

/**
 * Resolve the most specific context for a memory item based on its properties.
 * Checks in order of specificity:
 *   1. agent:{agent_id}
 *   2. source:{source_type}
 *   3. quadrant:{quadrant}
 *   4. layer:{layer}
 *   5. type:{type}
 *   6. "/" (global fallback)
 *
 * Returns all matching contexts, most specific first.
 */
export function resolveContexts(
  db: Database.Database,
  item: {
    agent_id?: string | null
    source_type?: string
    tags?: string[]
    layer?: string
    type?: string
  },
): ContextAnnotation[] {
  ensureTable(db)

  const paths: string[] = []

  // Build candidate paths from most to least specific
  if (item.agent_id) paths.push(`agent:${item.agent_id}`)
  if (item.source_type) paths.push(`source:${item.source_type}`)

  // Extract quadrant from tags
  if (item.tags) {
    for (const tag of item.tags) {
      if (tag.startsWith('quadrant:')) {
        paths.push(tag) // already in "quadrant:xxx" format
      }
    }
  }

  if (item.layer) paths.push(`layer:${item.layer}`)
  if (item.type) paths.push(`type:${item.type}`)
  paths.push('/') // global fallback

  if (paths.length === 0) return []

  const placeholders = paths.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT * FROM context_annotations WHERE path IN (${placeholders})`)
    .all(...paths) as ContextAnnotation[]

  // Sort by specificity (match order in paths array)
  const pathOrder = new Map(paths.map((p, i) => [p, i]))
  rows.sort((a, b) => (pathOrder.get(a.path) ?? 999) - (pathOrder.get(b.path) ?? 999))

  return rows
}

/**
 * Seed default context annotations for the Octavius quadrant system.
 * Idempotent — only inserts if the path doesn't already exist.
 */
export function seedDefaultContexts(db: Database.Database): void {
  ensureTable(db)

  const defaults: Array<[string, string]> = [
    ['quadrant:lifeforce', 'Health, biometrics, sleep, fitness, and nutrition data'],
    ['quadrant:industry', 'Tasks, projects, focus goals, and productivity tracking'],
    ['quadrant:fellowship', 'Relationships, social connections, and contact tracking'],
    ['quadrant:essence', 'Journaling, gratitude, reflection, and meaning'],
    ['source:device_sync', 'Biometric data synced from wearable devices (RingConn, Apple Health)'],
    ['source:user_input', 'Direct user input from dashboard or chat'],
    ['source:agent_output', 'AI agent task results and observations'],
    ['source:consolidation', 'Consolidated summaries from daily notes'],
    ['source:evolution', 'Learned behavioral patterns from the nightly evolution job'],
    ['layer:life_directory', 'Long-term consolidated knowledge and facts'],
    ['layer:daily_notes', 'Recent daily observations and events'],
    ['layer:tacit_knowledge', 'Learned patterns and implicit knowledge'],
  ]

  const insert = db.prepare(
    `INSERT OR IGNORE INTO context_annotations (path, description, updated_at)
     VALUES (?, ?, ?)`,
  )

  const now = new Date().toISOString()
  const run = db.transaction(() => {
    for (const [path, desc] of defaults) {
      insert.run(path, desc, now)
    }
  })
  run()
}
