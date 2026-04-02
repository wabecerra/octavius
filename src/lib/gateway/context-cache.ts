/**
 * Ephemeral Context Cache for Stable Agent Prompts
 *
 * Caches stable parts of agent context (system instructions, tool definitions,
 * environment snapshots, user profile) to reduce redundant token computation.
 * Each entry has a TTL; stale entries are lazily evicted on access.
 */

export const CACHE_TTL = {
  SYSTEM_INSTRUCTIONS: 300_000,
  ENVIRONMENT_SNAPSHOT: 30_000,
  TOOL_DEFINITIONS: 600_000,
  USER_PROFILE: 120_000,
} as const

interface CachedContext {
  key: string
  content: string
  cachedAt: number
  ttlMs: number
  tokenEstimate: number
  hits: number
}

export interface ContextCacheStats {
  entries: number
  totalTokenEstimate: number
  hitRate: number
  oldestEntryAge: number
}

export class ContextCache {
  private cache = new Map<string, CachedContext>()
  private hits = 0
  private misses = 0

  getOrCompute(
    key: string,
    ttlMs: number,
    compute: () => string,
  ): { content: string; fromCache: boolean } {
    const now = Date.now()
    const existing = this.cache.get(key)

    if (existing && now - existing.cachedAt < existing.ttlMs) {
      existing.hits++
      this.hits++
      return { content: existing.content, fromCache: true }
    }

    this.misses++
    const content = compute()
    this.cache.set(key, {
      key,
      content,
      cachedAt: now,
      ttlMs,
      tokenEstimate: Math.ceil(content.length / 4),
      hits: 0,
    })
    return { content, fromCache: false }
  }

  invalidate(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  getStats(): ContextCacheStats {
    const now = Date.now()
    let totalTokenEstimate = 0
    let oldestAge = 0

    for (const entry of this.cache.values()) {
      totalTokenEstimate += entry.tokenEstimate
      const age = now - entry.cachedAt
      if (age > oldestAge) oldestAge = age
    }

    const total = this.hits + this.misses
    return {
      entries: this.cache.size,
      totalTokenEstimate,
      hitRate: total > 0 ? this.hits / total : 0,
      oldestEntryAge: oldestAge,
    }
  }

  buildAgentContext(
    sections: Array<{ key: string; ttlMs: number; compute: () => string }>,
  ): {
    fullContext: string
    sections: Array<{ key: string; fromCache: boolean; tokenEstimate: number }>
    totalTokenEstimate: number
    cacheHitRate: number
  } {
    const results: Array<{ key: string; fromCache: boolean; tokenEstimate: number }> = []
    const parts: string[] = []
    let totalTokenEstimate = 0

    for (const section of sections) {
      const { content, fromCache } = this.getOrCompute(section.key, section.ttlMs, section.compute)
      const tokenEstimate = Math.ceil(content.length / 4)
      totalTokenEstimate += tokenEstimate
      results.push({ key: section.key, fromCache, tokenEstimate })
      parts.push(content)
    }

    const total = this.hits + this.misses
    return {
      fullContext: parts.join('\n\n'),
      sections: results,
      totalTokenEstimate,
      cacheHitRate: total > 0 ? this.hits / total : 0,
    }
  }
}

let instance: ContextCache | undefined

export function getContextCache(): ContextCache {
  if (!instance) {
    instance = new ContextCache()
  }
  return instance
}
