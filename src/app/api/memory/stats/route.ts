import { NextResponse } from 'next/server'
import { authenticateRequest, getDb } from '../auth'

/**
 * GET /api/memory/stats — Aggregate counts for the memory dashboard.
 *
 * Returns: { total, byType, byLayer, byQuadrant, embeddingCoverage }
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const db = getDb()

  const total =
    (db.prepare('SELECT COUNT(*) as c FROM memory_items WHERE archived = 0').get() as { c: number }).c

  // By type
  const typeRows = db
    .prepare(
      'SELECT type, COUNT(*) as c FROM memory_items WHERE archived = 0 GROUP BY type',
    )
    .all() as Array<{ type: string; c: number }>
  const byType: Record<string, number> = {
    episodic: 0,
    semantic: 0,
    procedural: 0,
    entity_profile: 0,
  }
  for (const r of typeRows) byType[r.type] = r.c

  // By layer
  const layerRows = db
    .prepare(
      'SELECT layer, COUNT(*) as c FROM memory_items WHERE archived = 0 GROUP BY layer',
    )
    .all() as Array<{ layer: string; c: number }>
  const byLayer: Record<string, number> = {
    life_directory: 0,
    daily_notes: 0,
    tacit_knowledge: 0,
  }
  for (const r of layerRows) byLayer[r.layer] = r.c

  // By quadrant (from tags JSON array)
  const allItems = db
    .prepare('SELECT tags FROM memory_items WHERE archived = 0')
    .all() as Array<{ tags: string }>

  const byQuadrant: Record<string, number> = {
    lifeforce: 0,
    industry: 0,
    fellowship: 0,
    essence: 0,
    untagged: 0,
  }

  for (const row of allItems) {
    try {
      const tags: string[] = JSON.parse(row.tags)
      const qTag = tags.find((t) => t.startsWith('quadrant:'))
      if (qTag) {
        const q = qTag.replace('quadrant:', '')
        if (q in byQuadrant) byQuadrant[q]++
        else byQuadrant.untagged++
      } else {
        byQuadrant.untagged++
      }
    } catch {
      byQuadrant.untagged++
    }
  }

  // Embedding coverage
  const withEmbedding =
    (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM memory_items WHERE archived = 0 AND embedding_ref IS NOT NULL AND embedding_ref != ''",
        )
        .get() as { c: number }
    ).c

  const embeddingCoverage = total > 0 ? withEmbedding / total : 0

  return NextResponse.json({
    total,
    byType,
    byLayer,
    byQuadrant,
    embeddingCoverage,
  })
}
