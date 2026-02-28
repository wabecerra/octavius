import type Database from 'better-sqlite3'
import type { MemoryConfig } from './models'

/**
 * Compute an embedding vector for the given text using the configured endpoint.
 * Calls local Ollama (default) or a remote API.
 *
 * Returns null on failure (graceful fallback — logs warning, does not throw).
 */
export async function computeEmbedding(
  text: string,
  config: MemoryConfig,
): Promise<Float32Array | null> {
  if (!config.embedding_enabled) return null

  try {
    const response = await fetch(`${config.embedding_endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.embedding_model, prompt: text }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      console.warn(`Embedding API returned ${response.status}: ${response.statusText}`)
      return null
    }

    const data = (await response.json()) as { embedding?: number[] }
    if (!data.embedding || !Array.isArray(data.embedding)) {
      console.warn('Embedding API returned unexpected format')
      return null
    }

    return new Float32Array(data.embedding)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`Embedding computation failed: ${message}`)
    return null
  }
}

/**
 * Store an embedding vector in the memory_embeddings table.
 */
export function storeEmbedding(
  db: Database.Database,
  memoryId: string,
  embedding: Float32Array,
  model: string,
): void {
  const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
  const now = new Date().toISOString()

  db.prepare(
    `INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding, model, dimensions, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(memoryId, buffer, model, embedding.length, now)
}

/**
 * Cosine similarity between two Float32Array vectors.
 * Returns a value in [-1, 1]. Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  if (magnitude === 0) return 0

  return dotProduct / magnitude
}

/** Row shape from memory_embeddings table. */
interface EmbeddingRow {
  memory_id: string
  embedding: Buffer
  dimensions: number
}

/**
 * Find the most similar memory items to a query embedding using brute-force cosine similarity.
 * Returns results sorted by descending similarity score.
 */
export function findSimilar(
  db: Database.Database,
  queryEmbedding: Float32Array,
  limit: number,
): Array<{ memoryId: string; score: number }> {
  const rows = db
    .prepare('SELECT memory_id, embedding, dimensions FROM memory_embeddings')
    .all() as EmbeddingRow[]

  const scored: Array<{ memoryId: string; score: number }> = []

  for (const row of rows) {
    const stored = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.dimensions,
    )
    const score = cosineSimilarity(queryEmbedding, stored)
    scored.push({ memoryId: row.memory_id, score })
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, limit)
}
