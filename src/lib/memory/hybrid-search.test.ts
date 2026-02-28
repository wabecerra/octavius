import { describe, it, expect } from 'vitest'
import { reciprocalRankFusion } from './hybrid-search'

describe('reciprocalRankFusion', () => {
  it('merges two ranked lists with RRF scoring', () => {
    const list1 = [
      { memoryId: 'a', score: 10 },
      { memoryId: 'b', score: 8 },
      { memoryId: 'c', score: 5 },
    ]
    const list2 = [
      { memoryId: 'b', score: 0.9 },
      { memoryId: 'a', score: 0.7 },
      { memoryId: 'd', score: 0.5 },
    ]

    const fused = reciprocalRankFusion([list1, list2])

    // Both 'a' and 'b' appear in both lists, should have higher scores
    const aScore = fused.find((f) => f.memoryId === 'a')!.score
    const bScore = fused.find((f) => f.memoryId === 'b')!.score
    const cScore = fused.find((f) => f.memoryId === 'c')!.score
    const dScore = fused.find((f) => f.memoryId === 'd')!.score

    // Items in both lists should score higher than items in one list
    expect(aScore).toBeGreaterThan(cScore)
    expect(bScore).toBeGreaterThan(dScore)
  })

  it('applies top-rank bonus: #1 gets +0.05, #2-3 get +0.02', () => {
    const list1 = [{ memoryId: 'top', score: 10 }]
    const list2 = [{ memoryId: 'other', score: 10 }]

    const fused = reciprocalRankFusion([list1, list2])
    const topScore = fused.find((f) => f.memoryId === 'top')!.score
    const otherScore = fused.find((f) => f.memoryId === 'other')!.score

    // Both are #1 in their respective lists, both get +0.05
    // RRF base: 1/(60+0+1) = ~0.01639
    // With bonus: ~0.01639 + 0.05 = ~0.06639
    expect(topScore).toBeGreaterThan(0.05)
    expect(otherScore).toBeGreaterThan(0.05)
  })

  it('returns results sorted by score descending', () => {
    const list1 = [
      { memoryId: 'a', score: 10 },
      { memoryId: 'b', score: 5 },
    ]
    const list2 = [
      { memoryId: 'b', score: 0.9 },
      { memoryId: 'c', score: 0.5 },
    ]

    const fused = reciprocalRankFusion([list1, list2])
    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1].score).toBeGreaterThanOrEqual(fused[i].score)
    }
  })

  it('handles empty lists gracefully', () => {
    expect(reciprocalRankFusion([])).toEqual([])
    expect(reciprocalRankFusion([[], []])).toEqual([])
  })

  it('handles single list', () => {
    const list = [{ memoryId: 'a', score: 1 }]
    const fused = reciprocalRankFusion([list])
    expect(fused).toHaveLength(1)
    expect(fused[0].memoryId).toBe('a')
  })

  it('uses custom k parameter', () => {
    const list = [{ memoryId: 'a', score: 1 }]
    const k10 = reciprocalRankFusion([list], 10)
    const k100 = reciprocalRankFusion([list], 100)

    // Lower k = higher individual scores
    expect(k10[0].score).toBeGreaterThan(k100[0].score)
  })
})
