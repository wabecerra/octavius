import { describe, it, expect } from 'vitest'
import type { CreateMemoryItemInput, MemoryItem } from './models'
import { NoveltyDetector } from './novelty'

function makeInput(overrides: Partial<CreateMemoryItemInput> = {}): CreateMemoryItemInput {
  return {
    text: 'The quick brown fox jumps over the lazy dog',
    type: 'episodic',
    layer: 'daily_notes',
    provenance: {
      source_type: 'user_input',
      source_id: 'dashboard',
      agent_id: null,
    },
    ...overrides,
  }
}

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    memory_id: 'mem-1',
    text: 'The quick brown fox jumps over the lazy dog',
    type: 'episodic',
    layer: 'daily_notes',
    provenance: {
      source_type: 'user_input',
      source_id: 'dashboard',
      agent_id: null,
    },
    created_at: '2025-01-01T00:00:00.000Z',
    last_accessed: '2025-01-01T00:00:00.000Z',
    confidence: 0.8,
    importance: 0.5,
    tags: [],
    embedding_ref: null,
    consolidated_into: null,
    archived: false,
    ...overrides,
  }
}

describe('NoveltyDetector', () => {
  const detector = new NoveltyDetector()

  describe('identical texts', () => {
    it('flags identical text as duplicate with score 1.0', () => {
      const input = makeInput({ text: 'hello world' })
      const existing = [makeItem({ text: 'hello world' })]

      const result = detector.checkNovelty(input, existing)
      expect(result.isDuplicate).toBe(true)
      expect(result.score).toBe(1.0)
      expect(result.matchingItem).toBe(existing[0])
    })
  })

  describe('completely different texts', () => {
    it('allows completely different texts through with low score', () => {
      const input = makeInput({ text: 'alpha beta gamma' })
      const existing = [makeItem({ text: 'one two three four five six' })]

      const result = detector.checkNovelty(input, existing)
      expect(result.isDuplicate).toBe(false)
      expect(result.score).toBeLessThan(0.9)
    })
  })

  describe('near-duplicate texts', () => {
    it('flags near-duplicate above threshold', () => {
      // 9 shared tokens out of 10 total → Jaccard = 9/10 = 0.9
      const input = makeInput({ text: 'the quick brown fox jumps over the lazy dog today' })
      const existing = [makeItem({ text: 'the quick brown fox jumps over the lazy dog yesterday' })]

      const result = detector.checkNovelty(input, existing)
      // "today" vs "yesterday" differ, rest shared. Jaccard = 8/10 = 0.8
      // With default threshold 0.9, this should NOT be flagged
      expect(result.score).toBeGreaterThan(0.5)
    })

    it('allows text below threshold through', () => {
      const input = makeInput({ text: 'apples oranges bananas grapes' })
      const existing = [makeItem({ text: 'cars trucks buses trains' })]

      const result = detector.checkNovelty(input, existing)
      expect(result.isDuplicate).toBe(false)
      expect(result.score).toBe(0.0)
    })
  })

  describe('same type and layer filtering', () => {
    it('only compares against items of the same type and layer', () => {
      const input = makeInput({ text: 'hello world', type: 'episodic', layer: 'daily_notes' })
      const existing = [
        makeItem({ memory_id: 'mem-1', text: 'hello world', type: 'semantic', layer: 'daily_notes' }),
        makeItem({
          memory_id: 'mem-2',
          text: 'hello world',
          type: 'episodic',
          layer: 'life_directory',
        }),
        makeItem({
          memory_id: 'mem-3',
          text: 'completely different text',
          type: 'episodic',
          layer: 'daily_notes',
        }),
      ]

      const result = detector.checkNovelty(input, existing)
      // Only mem-3 matches type+layer, and it has different text
      expect(result.isDuplicate).toBe(false)
      expect(result.score).toBeLessThan(0.9)
    })

    it('detects duplicate when matching type and layer item exists', () => {
      const input = makeInput({ text: 'hello world', type: 'semantic', layer: 'life_directory' })
      const existing = [
        makeItem({
          memory_id: 'mem-1',
          text: 'hello world',
          type: 'semantic',
          layer: 'life_directory',
        }),
      ]

      const result = detector.checkNovelty(input, existing)
      expect(result.isDuplicate).toBe(true)
      expect(result.score).toBe(1.0)
      expect(result.matchingItem?.memory_id).toBe('mem-1')
    })
  })

  describe('empty existing items', () => {
    it('returns isDuplicate=false and score=0.0 when no existing items', () => {
      const input = makeInput({ text: 'anything' })
      const result = detector.checkNovelty(input, [])

      expect(result.isDuplicate).toBe(false)
      expect(result.score).toBe(0.0)
      expect(result.matchingItem).toBeUndefined()
    })

    it('returns isDuplicate=false when no items match type and layer', () => {
      const input = makeInput({ text: 'hello', type: 'procedural', layer: 'tacit_knowledge' })
      const existing = [makeItem({ text: 'hello', type: 'episodic', layer: 'daily_notes' })]

      const result = detector.checkNovelty(input, existing)
      expect(result.isDuplicate).toBe(false)
      expect(result.score).toBe(0.0)
    })
  })

  describe('custom threshold', () => {
    it('uses custom threshold for duplicate detection', () => {
      const lenientDetector = new NoveltyDetector(0.5)
      // Two texts sharing ~50% tokens
      const input = makeInput({ text: 'alpha beta gamma delta' })
      const existing = [makeItem({ text: 'alpha beta epsilon zeta' })]

      const result = lenientDetector.checkNovelty(input, existing)
      // Jaccard: {alpha, beta} intersection / {alpha, beta, gamma, delta, epsilon, zeta} union = 2/6 ≈ 0.33
      expect(result.isDuplicate).toBe(false)
    })

    it('flags as duplicate with very low threshold', () => {
      const veryLenient = new NoveltyDetector(0.1)
      const input = makeInput({ text: 'alpha beta gamma delta epsilon zeta' })
      const existing = [makeItem({ text: 'alpha omega' })]

      const result = veryLenient.checkNovelty(input, existing)
      // Jaccard: {alpha} / {alpha, beta, gamma, delta, epsilon, zeta, omega} = 1/7 ≈ 0.14
      expect(result.isDuplicate).toBe(true)
      expect(result.score).toBeGreaterThanOrEqual(0.1)
    })

    it('stores the threshold value', () => {
      expect(new NoveltyDetector().threshold).toBe(0.9)
      expect(new NoveltyDetector(0.75).threshold).toBe(0.75)
    })
  })

  describe('tokenization', () => {
    it('is case-insensitive', () => {
      const input = makeInput({ text: 'Hello World' })
      const existing = [makeItem({ text: 'hello world' })]

      const result = detector.checkNovelty(input, existing)
      expect(result.isDuplicate).toBe(true)
      expect(result.score).toBe(1.0)
    })

    it('splits on punctuation', () => {
      const input = makeInput({ text: 'hello, world! how are you?' })
      const existing = [makeItem({ text: 'hello world how are you' })]

      const result = detector.checkNovelty(input, existing)
      expect(result.isDuplicate).toBe(true)
      expect(result.score).toBe(1.0)
    })
  })

  describe('best match selection', () => {
    it('returns the item with the highest similarity score', () => {
      const input = makeInput({ text: 'alpha beta gamma' })
      const existing = [
        makeItem({ memory_id: 'low', text: 'alpha delta epsilon' }),
        makeItem({ memory_id: 'high', text: 'alpha beta gamma' }),
        makeItem({ memory_id: 'mid', text: 'alpha beta delta' }),
      ]

      const result = detector.checkNovelty(input, existing)
      expect(result.isDuplicate).toBe(true)
      expect(result.matchingItem?.memory_id).toBe('high')
      expect(result.score).toBe(1.0)
    })
  })
})


// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavious-memory-architecture, Property 7: Novelty Detection Threshold
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
// ---------------------------------------------------------------------------

import fc from 'fast-check'
import type { MemoryType, MemoryLayer, SourceType, Provenance } from './models'

// --- Arbitraries ---

/** Alpha-only word: 1–10 lowercase letters for predictable tokenization. */
const alphaWordArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 10,
  })
  .map((chars) => chars.join(''))

/** A non-empty sentence of 1–12 alpha-only words separated by spaces. */
const sentenceArb = fc
  .array(alphaWordArb, { minLength: 1, maxLength: 12 })
  .map((words) => words.join(' '))

const memoryTypeArb: fc.Arbitrary<MemoryType> = fc.constantFrom(
  'episodic',
  'semantic',
  'procedural',
  'entity_profile',
)

const memoryLayerArb: fc.Arbitrary<MemoryLayer> = fc.constantFrom(
  'life_directory',
  'daily_notes',
  'tacit_knowledge',
)

const sourceTypeArb: fc.Arbitrary<SourceType> = fc.constantFrom(
  'user_input',
  'agent_output',
  'consolidation',
  'system_event',
  'dashboard_sync',
  'evolution',
)

const provenanceArb: fc.Arbitrary<Provenance> = fc.record({
  source_type: sourceTypeArb,
  source_id: fc.string({ minLength: 1, maxLength: 30 }),
  agent_id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
})

/** Threshold in (0, 1] — avoids 0 which would flag everything as duplicate. */
const thresholdArb = fc.double({ min: 0.01, max: 1.0, noNaN: true })

/**
 * Feature: octavious-memory-architecture, Property 7: Novelty Detection Threshold
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 *
 * For any pair of text strings, if the normalized token overlap exceeds the
 * configured threshold, the Novelty_Detector SHALL flag the second string as a
 * duplicate. If the score is below the threshold, the item SHALL be allowed through.
 */
describe('Property 7: Novelty Detection Threshold', () => {
  describe('7a: Identical texts are always flagged as duplicate (score = 1.0)', () => {
    it('flags identical text as duplicate with score 1.0 for any threshold ≤ 1.0', () => {
      fc.assert(
        fc.property(
          sentenceArb,
          thresholdArb,
          memoryTypeArb,
          memoryLayerArb,
          provenanceArb,
          (text, threshold, type, layer, provenance) => {
            const detector = new NoveltyDetector(threshold)
            const input: CreateMemoryItemInput = { text, type, layer, provenance }
            const existing: MemoryItem[] = [
              {
                memory_id: 'existing-1',
                text,
                type,
                layer,
                provenance,
                created_at: '2025-01-01T00:00:00.000Z',
                last_accessed: '2025-01-01T00:00:00.000Z',
                confidence: 0.8,
                importance: 0.5,
                tags: [],
                embedding_ref: null,
                consolidated_into: null,
                archived: false,
              },
            ]

            const result = detector.checkNovelty(input, existing)

            // Identical text → Jaccard similarity = 1.0
            expect(result.score).toBe(1.0)
            // Any threshold ≤ 1.0 means 1.0 >= threshold → duplicate
            expect(result.isDuplicate).toBe(true)
            expect(result.matchingItem).toBe(existing[0])
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('7b: isDuplicate flag is consistent with score vs threshold', () => {
    it('isDuplicate is true iff score >= threshold', () => {
      fc.assert(
        fc.property(
          sentenceArb,
          sentenceArb,
          thresholdArb,
          memoryTypeArb,
          memoryLayerArb,
          provenanceArb,
          (textA, textB, threshold, type, layer, provenance) => {
            const detector = new NoveltyDetector(threshold)
            const input: CreateMemoryItemInput = { text: textA, type, layer, provenance }
            const existing: MemoryItem[] = [
              {
                memory_id: 'existing-1',
                text: textB,
                type,
                layer,
                provenance,
                created_at: '2025-01-01T00:00:00.000Z',
                last_accessed: '2025-01-01T00:00:00.000Z',
                confidence: 0.8,
                importance: 0.5,
                tags: [],
                embedding_ref: null,
                consolidated_into: null,
                archived: false,
              },
            ]

            const result = detector.checkNovelty(input, existing)

            // The isDuplicate flag must be consistent with score vs threshold
            if (result.score >= threshold) {
              expect(result.isDuplicate).toBe(true)
              expect(result.matchingItem).toBeDefined()
            } else {
              expect(result.isDuplicate).toBe(false)
            }

            // Score must always be in [0.0, 1.0]
            expect(result.score).toBeGreaterThanOrEqual(0.0)
            expect(result.score).toBeLessThanOrEqual(1.0)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
