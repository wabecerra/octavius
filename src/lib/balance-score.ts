export interface QuadrantCounts {
  health: number
  career: number
  relationships: number
  soul: number
}

/**
 * Normalizes quadrant entry counts to [0, 1] relative to the maximum count
 * across all quadrants. If all counts are 0, returns all zeros.
 */
export function computeBalanceScore(counts: QuadrantCounts): QuadrantCounts {
  const max = Math.max(counts.health, counts.career, counts.relationships, counts.soul)

  if (max === 0) {
    return { health: 0, career: 0, relationships: 0, soul: 0 }
  }

  return {
    health: counts.health / max,
    career: counts.career / max,
    relationships: counts.relationships / max,
    soul: counts.soul / max,
  }
}
