import type Database from 'better-sqlite3'

/**
 * Search Result Cache — caches query expansion, reranking, and hybrid search
 * results in SQLite to avoid redundant LLM calls. Inspired by QMD's llm_cache.
 *
 * Cache entries expire after a configurable TTL (default 1 hour).
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Ensure the search_cache table exists. Called lazily on first use.
 */
function ensureTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_cache (
      cache_key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      ttl_ms INTEGER NOT NULL DEFAULT ${DEFAULT_TTL_MS}
    )
  `)
}

/**
 * Get a cached result by key. Returns null if not found or expired.
 */
export function getCachedResult<T = unknown>(db: Database.Database, key: string): T | null {
  ensureTable(db)

  const row = db
    .prepare('SELECT value, created_at, ttl_ms FROM search_cache WHERE cache_key = ?')
    .get(key) as { value: string; created_at: string; ttl_ms: number } | undefined

  if (!row) return null

  // Check expiry
  const createdMs = new Date(row.created_at).getTime()
  if (Date.now() - createdMs > row.ttl_ms) {
    // Expired — clean up
    db.prepare('DELETE FROM search_cache WHERE cache_key = ?').run(key)
    return null
  }

  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

/**
 * Store a result in the cache.
 */
export function setCachedResult(
  db: Database.Database,
  key: string,
  value: unknown,
  ttlMs = DEFAULT_TTL_MS,
): void {
  ensureTable(db)

  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR REPLACE INTO search_cache (cache_key, value, created_at, ttl_ms)
     VALUES (?, ?, ?, ?)`,
  ).run(key, JSON.stringify(value), now, ttlMs)
}

/**
 * Evict all expired entries. Call periodically (e.g. from scheduled jobs).
 */
export function evictExpired(db: Database.Database): number {
  ensureTable(db)

  // Delete entries where created_at + ttl_ms < now
  // SQLite doesn't have great date math, so we do it in JS
  const rows = db
    .prepare('SELECT cache_key, created_at, ttl_ms FROM search_cache')
    .all() as Array<{ cache_key: string; created_at: string; ttl_ms: number }>

  const now = Date.now()
  const expired = rows.filter((r) => now - new Date(r.created_at).getTime() > r.ttl_ms)

  if (expired.length > 0) {
    const placeholders = expired.map(() => '?').join(', ')
    db.prepare(`DELETE FROM search_cache WHERE cache_key IN (${placeholders})`)
      .run(...expired.map((r) => r.cache_key))
  }

  return expired.length
}

/**
 * Clear the entire cache.
 */
export function clearCache(db: Database.Database): void {
  ensureTable(db)
  db.exec('DELETE FROM search_cache')
}
