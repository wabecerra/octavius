import type { CreateMemoryItemInput, MemoryItem } from './models'

export interface NoveltyResult {
  isDuplicate: boolean
  matchingItem?: MemoryItem
  score: number
}

/**
 * Tokenize text: lowercase, split on whitespace and punctuation, filter empties.
 */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[\s.,;:!?'"()\[\]{}<>\/\\@#$%^&*_+=|~`\-]+/)
    .filter((t) => t.length > 0)
  return new Set(tokens)
}

/**
 * Jaccard similarity: |intersection| / |union| of two token sets.
 * Returns 0.0 if both sets are empty.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0.0

  let intersection = 0
  a.forEach((token) => {
    if (b.has(token)) intersection++
  })

  const union = a.size + b.size - intersection
  return union === 0 ? 0.0 : intersection / union
}

export class NoveltyDetector {
  constructor(public readonly threshold: number = 0.9) {}

  checkNovelty(item: CreateMemoryItemInput, existingItems: MemoryItem[]): NoveltyResult {
    // Only compare against items of the same type and layer (Req 5.1)
    const candidates = existingItems.filter((e) => e.type === item.type && e.layer === item.layer)

    if (candidates.length === 0) {
      return { isDuplicate: false, score: 0.0 }
    }

    const inputTokens = tokenize(item.text)

    let highestScore = 0.0
    let bestMatch: MemoryItem | undefined

    for (const candidate of candidates) {
      const candidateTokens = tokenize(candidate.text)
      const score = jaccardSimilarity(inputTokens, candidateTokens)

      if (score > highestScore) {
        highestScore = score
        bestMatch = candidate
      }
    }

    if (highestScore >= this.threshold) {
      return { isDuplicate: true, matchingItem: bestMatch, score: highestScore }
    }

    return { isDuplicate: false, score: highestScore }
  }
}
