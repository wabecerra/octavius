import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  setContext,
  removeContext,
  listContexts,
  resolveContexts,
  seedDefaultContexts,
} from './context-annotations'

describe('context-annotations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  describe('setContext / listContexts', () => {
    it('creates a context annotation', () => {
      const ctx = setContext(db, 'quadrant:lifeforce', 'Health data')
      expect(ctx.path).toBe('quadrant:lifeforce')
      expect(ctx.description).toBe('Health data')
      expect(ctx.updated_at).toBeTruthy()
    })

    it('lists all contexts', () => {
      setContext(db, 'a', 'first')
      setContext(db, 'b', 'second')
      const all = listContexts(db)
      expect(all).toHaveLength(2)
      expect(all[0].path).toBe('a')
      expect(all[1].path).toBe('b')
    })

    it('upserts on same path', () => {
      setContext(db, 'key', 'original')
      setContext(db, 'key', 'updated')
      const all = listContexts(db)
      expect(all).toHaveLength(1)
      expect(all[0].description).toBe('updated')
    })
  })

  describe('removeContext', () => {
    it('removes an existing context', () => {
      setContext(db, 'to-remove', 'temp')
      expect(removeContext(db, 'to-remove')).toBe(true)
      expect(listContexts(db)).toHaveLength(0)
    })

    it('returns false for non-existent path', () => {
      expect(removeContext(db, 'nope')).toBe(false)
    })
  })

  describe('resolveContexts', () => {
    it('resolves contexts by specificity order', () => {
      setContext(db, 'agent:agent-lifeforce', 'Lifeforce agent context')
      setContext(db, 'quadrant:lifeforce', 'Health quadrant')
      setContext(db, 'source:device_sync', 'Wearable data')
      setContext(db, '/', 'Global context')

      const resolved = resolveContexts(db, {
        agent_id: 'agent-lifeforce',
        source_type: 'device_sync',
        tags: ['quadrant:lifeforce'],
        layer: 'daily_notes',
        type: 'episodic',
      })

      // Should return most specific first
      expect(resolved[0].path).toBe('agent:agent-lifeforce')
      expect(resolved[1].path).toBe('source:device_sync')
      expect(resolved[2].path).toBe('quadrant:lifeforce')
      expect(resolved[3].path).toBe('/')
    })

    it('returns empty array when no contexts match', () => {
      const resolved = resolveContexts(db, { agent_id: 'unknown' })
      expect(resolved).toHaveLength(0)
    })

    it('handles items with no agent_id', () => {
      setContext(db, 'source:user_input', 'User input')
      const resolved = resolveContexts(db, {
        agent_id: null,
        source_type: 'user_input',
      })
      expect(resolved).toHaveLength(1)
      expect(resolved[0].path).toBe('source:user_input')
    })
  })

  describe('seedDefaultContexts', () => {
    it('seeds default contexts', () => {
      seedDefaultContexts(db)
      const all = listContexts(db)
      expect(all.length).toBeGreaterThanOrEqual(10)

      // Check a few known defaults
      const paths = all.map((c) => c.path)
      expect(paths).toContain('quadrant:lifeforce')
      expect(paths).toContain('quadrant:industry')
      expect(paths).toContain('source:device_sync')
      expect(paths).toContain('layer:tacit_knowledge')
    })

    it('is idempotent', () => {
      seedDefaultContexts(db)
      const count1 = listContexts(db).length
      seedDefaultContexts(db)
      const count2 = listContexts(db).length
      expect(count1).toBe(count2)
    })
  })
})
