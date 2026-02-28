import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { getCachedResult, setCachedResult, evictExpired, clearCache } from './search-cache'

describe('search-cache', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  describe('setCachedResult / getCachedResult', () => {
    it('stores and retrieves a cached result', () => {
      setCachedResult(db, 'test-key', { items: [1, 2, 3] })
      const result = getCachedResult(db, 'test-key')
      expect(result).toEqual({ items: [1, 2, 3] })
    })

    it('returns null for missing key', () => {
      expect(getCachedResult(db, 'nonexistent')).toBeNull()
    })

    it('overwrites existing entry on same key', () => {
      setCachedResult(db, 'key', 'first')
      setCachedResult(db, 'key', 'second')
      expect(getCachedResult(db, 'key')).toBe('second')
    })

    it('stores numeric values', () => {
      setCachedResult(db, 'score', 0.85)
      expect(getCachedResult(db, 'score')).toBe(0.85)
    })

    it('stores null values', () => {
      setCachedResult(db, 'empty', null)
      expect(getCachedResult(db, 'empty')).toBeNull()
    })
  })

  describe('TTL expiry', () => {
    it('returns null for expired entries', () => {
      // Store with 1ms TTL
      setCachedResult(db, 'short-lived', 'data', 1)

      // Wait for expiry
      const start = Date.now()
      while (Date.now() - start < 5) { /* spin */ }

      expect(getCachedResult(db, 'short-lived')).toBeNull()
    })

    it('returns value for non-expired entries', () => {
      setCachedResult(db, 'long-lived', 'data', 60_000)
      expect(getCachedResult(db, 'long-lived')).toBe('data')
    })
  })

  describe('evictExpired', () => {
    it('removes expired entries and returns count', () => {
      setCachedResult(db, 'expired-1', 'a', 1)
      setCachedResult(db, 'expired-2', 'b', 1)
      setCachedResult(db, 'valid', 'c', 60_000)

      const start = Date.now()
      while (Date.now() - start < 5) { /* spin */ }

      const count = evictExpired(db)
      expect(count).toBe(2)
      expect(getCachedResult(db, 'valid')).toBe('c')
    })

    it('returns 0 when nothing is expired', () => {
      setCachedResult(db, 'fresh', 'data', 60_000)
      expect(evictExpired(db)).toBe(0)
    })
  })

  describe('clearCache', () => {
    it('removes all entries', () => {
      setCachedResult(db, 'a', 1)
      setCachedResult(db, 'b', 2)
      clearCache(db)
      expect(getCachedResult(db, 'a')).toBeNull()
      expect(getCachedResult(db, 'b')).toBeNull()
    })
  })
})
