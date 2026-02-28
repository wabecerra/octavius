import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cosineSimilarity, storeEmbedding, findSimilar, computeEmbedding } from './embeddings'
import { getDatabase, closeDatabase } from './db'
import type Database from 'better-sqlite3'
import type { MemoryConfig } from './models'

describe('embeddings', () => {
  let db: Database.Database

  beforeEach(() => {
    db = getDatabase(':memory:')
    // Insert a memory item so FK constraints pass
    db.prepare(
      `INSERT INTO memory_items (memory_id, text, type, layer, source_type, source_id, agent_id, created_at, last_accessed, confidence, importance, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('mem-1', 'test item', 'episodic', 'daily_notes', 'user_input', 'src-1', null, new Date().toISOString(), new Date().toISOString(), 0.8, 0.5, '[]')
    db.prepare(
      `INSERT INTO memory_items (memory_id, text, type, layer, source_type, source_id, agent_id, created_at, last_accessed, confidence, importance, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('mem-2', 'another item', 'episodic', 'daily_notes', 'user_input', 'src-2', null, new Date().toISOString(), new Date().toISOString(), 0.8, 0.5, '[]')
  })

  afterEach(() => {
    closeDatabase(db)
  })

  describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => {
      const a = new Float32Array([1, 2, 3])
      expect(cosineSimilarity(a, a)).toBeCloseTo(1.0)
    })

    it('returns 0 for orthogonal vectors', () => {
      const a = new Float32Array([1, 0])
      const b = new Float32Array([0, 1])
      expect(cosineSimilarity(a, b)).toBeCloseTo(0)
    })

    it('returns -1 for opposite vectors', () => {
      const a = new Float32Array([1, 0])
      const b = new Float32Array([-1, 0])
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1)
    })

    it('returns 0 for zero vectors', () => {
      const a = new Float32Array([0, 0])
      const b = new Float32Array([1, 2])
      expect(cosineSimilarity(a, b)).toBe(0)
    })

    it('throws on dimension mismatch', () => {
      const a = new Float32Array([1, 2])
      const b = new Float32Array([1, 2, 3])
      expect(() => cosineSimilarity(a, b)).toThrow('dimension mismatch')
    })
  })

  describe('storeEmbedding + findSimilar', () => {
    it('stores and retrieves embeddings', () => {
      const emb1 = new Float32Array([1, 0, 0])
      const emb2 = new Float32Array([0, 1, 0])

      storeEmbedding(db, 'mem-1', emb1, 'test-model')
      storeEmbedding(db, 'mem-2', emb2, 'test-model')

      const query = new Float32Array([1, 0, 0])
      const results = findSimilar(db, query, 10)

      expect(results).toHaveLength(2)
      expect(results[0].memoryId).toBe('mem-1')
      expect(results[0].score).toBeCloseTo(1.0)
      expect(results[1].memoryId).toBe('mem-2')
      expect(results[1].score).toBeCloseTo(0)
    })

    it('respects limit parameter', () => {
      storeEmbedding(db, 'mem-1', new Float32Array([1, 0]), 'test-model')
      storeEmbedding(db, 'mem-2', new Float32Array([0, 1]), 'test-model')

      const results = findSimilar(db, new Float32Array([1, 0]), 1)
      expect(results).toHaveLength(1)
    })
  })

  describe('computeEmbedding', () => {
    it('returns null when embedding is disabled', async () => {
      const config = { embedding_enabled: false } as MemoryConfig
      const result = await computeEmbedding('test', config)
      expect(result).toBeNull()
    })

    it('returns null on network failure (graceful fallback)', async () => {
      const config = {
        embedding_enabled: true,
        embedding_endpoint: 'http://localhost:99999',
        embedding_model: 'test-model',
      } as MemoryConfig
      const result = await computeEmbedding('test', config)
      expect(result).toBeNull()
    })
  })
})
