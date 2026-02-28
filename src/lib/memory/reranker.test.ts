import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { rerankResults } from './reranker'
import type { MemoryConfig, MemoryItem } from './models'

function makeItem(id: string, text: string): MemoryItem {
  return {
    memory_id: id,
    text,
    type: 'episodic',
    layer: 'daily_notes',
    provenance: { source_type: 'user_input', source_id: 'test', agent_id: null },
    created_at: '2025-01-01T00:00:00.000Z',
    last_accessed: '2025-01-01T00:00:00.000Z',
    confidence: 0.8,
    importance: 0.5,
    tags: [],
    embedding_ref: null,
    consolidated_into: null,
    archived: false,
  }
}

const disabledConfig: MemoryConfig = {
  consolidation_schedule: '0 2 * * *',
  decay_schedule: '0 3 * * *',
  evolution_schedule: '0 4 * * *',
  decay_archive_threshold: 0.2,
  decay_deletion_threshold: 0.05,
  novelty_similarity_threshold: 0.9,
  quality_gate_min_confidence: 0.3,
  embedding_enabled: false,
  embedding_endpoint: 'http://localhost:11434',
  embedding_model: 'nomic-embed-text',
  api_secret_token: 'test',
  context_retrieval_top_n: 10,
  reranking_enabled: false,
  query_expansion_enabled: false,
  smart_chunking_target_tokens: 900,
}

describe('rerankResults', () => {
  it('returns items with fusionScore as blendedScore when embeddings disabled', async () => {
    const db = new Database(':memory:')
    const candidates = [
      { item: makeItem('a', 'hello'), fusionScore: 0.9 },
      { item: makeItem('b', 'world'), fusionScore: 0.5 },
    ]

    const results = await rerankResults('query', candidates, disabledConfig, db)

    expect(results).toHaveLength(2)
    expect(results[0].blendedScore).toBe(0.9)
    expect(results[1].blendedScore).toBe(0.5)
    db.close()
  })

  it('handles empty candidates', async () => {
    const db = new Database(':memory:')
    const results = await rerankResults('query', [], disabledConfig, db)
    expect(results).toHaveLength(0)
    db.close()
  })

  it('preserves all items in output', async () => {
    const db = new Database(':memory:')
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      item: makeItem(`item-${i}`, `text ${i}`),
      fusionScore: 1 - i * 0.05,
    }))

    const results = await rerankResults('query', candidates, disabledConfig, db)
    expect(results).toHaveLength(20)

    const ids = new Set(results.map((r) => r.item.memory_id))
    expect(ids.size).toBe(20)
    db.close()
  })
})
