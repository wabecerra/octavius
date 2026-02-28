import { describe, it, expect } from 'vitest'
import { expandQuery } from './query-expansion'
import type { MemoryConfig } from './models'

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

describe('expandQuery', () => {
  it('returns original query when embeddings are disabled', async () => {
    const result = await expandQuery('test query', disabledConfig)
    expect(result).toEqual(['test query'])
  })

  it('returns original query on network failure', async () => {
    const config = { ...disabledConfig, embedding_enabled: true }
    // Will fail because no server is running
    const result = await expandQuery('test query', config)
    expect(result).toEqual(['test query'])
  })

  it('always includes the original query as first element', async () => {
    const result = await expandQuery('my search', disabledConfig)
    expect(result[0]).toBe('my search')
  })
})
