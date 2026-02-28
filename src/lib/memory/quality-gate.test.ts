import { describe, it, expect } from 'vitest'
import type { CreateMemoryItemInput } from './models'
import { QualityGate } from './quality-gate'

function makeInput(overrides: Partial<CreateMemoryItemInput> = {}): CreateMemoryItemInput {
  return {
    text: 'A reasonable piece of text for testing',
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

describe('QualityGate', () => {
  const gate = new QualityGate()

  describe('confidence scoring — text length', () => {
    it('gives base 0.5 for very short text (≤20 chars)', () => {
      // 'short' is 5 chars — no text length bonus
      // source_type user_input adds +0.1, no tags → total 0.6
      const result = gate.evaluate(makeInput({ text: 'short' }))
      expect(result.confidence).toBeCloseTo(0.6)
    })

    it('adds +0.1 for text > 20 chars', () => {
      const text = 'a'.repeat(21)
      // base 0.5 + text 0.1 + user_input 0.1 = 0.7
      const result = gate.evaluate(makeInput({ text }))
      expect(result.confidence).toBeCloseTo(0.7)
    })

    it('adds +0.2 for text > 100 chars', () => {
      const text = 'a'.repeat(101)
      // base 0.5 + text 0.2 + user_input 0.1 = 0.8
      const result = gate.evaluate(makeInput({ text }))
      expect(result.confidence).toBeCloseTo(0.8)
    })

    it('adds +0.3 for text > 500 chars', () => {
      const text = 'a'.repeat(501)
      // base 0.5 + text 0.3 + user_input 0.1 = 0.9
      const result = gate.evaluate(makeInput({ text }))
      expect(result.confidence).toBeCloseTo(0.9)
    })
  })

  describe('confidence scoring — source reliability', () => {
    it('adds +0.1 for user_input', () => {
      const result = gate.evaluate(
        makeInput({
          text: 'short',
          provenance: { source_type: 'user_input', source_id: 'x', agent_id: null },
        }),
      )
      // base 0.5 + user_input 0.1 = 0.6
      expect(result.confidence).toBeCloseTo(0.6)
    })

    it('adds +0.05 for agent_output', () => {
      const result = gate.evaluate(
        makeInput({
          text: 'short',
          provenance: { source_type: 'agent_output', source_id: 'x', agent_id: 'a1' },
        }),
      )
      // base 0.5 + agent_output 0.05 = 0.55
      expect(result.confidence).toBeCloseTo(0.55)
    })

    it('adds +0.0 for other source types', () => {
      const result = gate.evaluate(
        makeInput({
          text: 'short',
          provenance: { source_type: 'consolidation', source_id: 'x', agent_id: null },
        }),
      )
      // base 0.5 + 0.0 = 0.5
      expect(result.confidence).toBeCloseTo(0.5)
    })
  })

  describe('confidence scoring — field completeness', () => {
    it('adds +0.1 when tags are provided and non-empty', () => {
      const result = gate.evaluate(makeInput({ text: 'short', tags: ['health'] }))
      // base 0.5 + user_input 0.1 + tags 0.1 = 0.7
      expect(result.confidence).toBeCloseTo(0.7)
    })

    it('does not add bonus for empty tags array', () => {
      const result = gate.evaluate(makeInput({ text: 'short', tags: [] }))
      // base 0.5 + user_input 0.1 = 0.6
      expect(result.confidence).toBeCloseTo(0.6)
    })

    it('does not add bonus when tags are undefined', () => {
      const result = gate.evaluate(makeInput({ text: 'short', tags: undefined }))
      // base 0.5 + user_input 0.1 = 0.6
      expect(result.confidence).toBeCloseTo(0.6)
    })
  })

  describe('importance scoring — layer bonus', () => {
    it('adds +0.2 for life_directory', () => {
      const result = gate.evaluate(makeInput({ layer: 'life_directory', type: 'episodic' }))
      // base 0.5 + life_directory 0.2 + episodic 0.0 = 0.7
      expect(result.importance).toBeCloseTo(0.7)
    })

    it('adds +0.1 for tacit_knowledge', () => {
      const result = gate.evaluate(makeInput({ layer: 'tacit_knowledge', type: 'episodic' }))
      // base 0.5 + tacit_knowledge 0.1 + episodic 0.0 = 0.6
      expect(result.importance).toBeCloseTo(0.6)
    })

    it('adds +0.0 for daily_notes', () => {
      const result = gate.evaluate(makeInput({ layer: 'daily_notes', type: 'episodic' }))
      // base 0.5 + daily_notes 0.0 + episodic 0.0 = 0.5
      expect(result.importance).toBeCloseTo(0.5)
    })
  })

  describe('importance scoring — type bonus', () => {
    it('adds +0.1 for semantic', () => {
      const result = gate.evaluate(makeInput({ type: 'semantic', layer: 'daily_notes' }))
      // base 0.5 + daily_notes 0.0 + semantic 0.1 = 0.6
      expect(result.importance).toBeCloseTo(0.6)
    })

    it('adds +0.1 for procedural', () => {
      const result = gate.evaluate(makeInput({ type: 'procedural', layer: 'daily_notes' }))
      expect(result.importance).toBeCloseTo(0.6)
    })

    it('adds +0.05 for entity_profile', () => {
      const result = gate.evaluate(makeInput({ type: 'entity_profile', layer: 'daily_notes' }))
      expect(result.importance).toBeCloseTo(0.55)
    })

    it('adds +0.0 for episodic', () => {
      const result = gate.evaluate(makeInput({ type: 'episodic', layer: 'daily_notes' }))
      expect(result.importance).toBeCloseTo(0.5)
    })
  })

  describe('bypass for system_event', () => {
    it('passes with confidence=1.0 and importance=0.5 when bypass + system_event', () => {
      const result = gate.evaluate(
        makeInput({
          text: '',
          bypass_quality_gate: true,
          provenance: { source_type: 'system_event', source_id: 'sys', agent_id: null },
        }),
      )
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
      expect(result.importance).toBe(0.5)
      expect(result.reason).toBeUndefined()
    })

    it('does NOT bypass when bypass_quality_gate is true but source_type is not system_event', () => {
      const result = gate.evaluate(
        makeInput({
          text: '',
          bypass_quality_gate: true,
          provenance: { source_type: 'user_input', source_id: 'x', agent_id: null },
        }),
      )
      // Empty text, user_input: base 0.5 + 0.1 = 0.6 — passes default threshold
      // But the point is it went through normal scoring, not bypass
      expect(result.confidence).not.toBe(1.0)
    })

    it('does NOT bypass when source_type is system_event but bypass flag is false', () => {
      const result = gate.evaluate(
        makeInput({
          text: '',
          bypass_quality_gate: false,
          provenance: { source_type: 'system_event', source_id: 'sys', agent_id: null },
        }),
      )
      expect(result.confidence).not.toBe(1.0)
    })
  })

  describe('rejection below threshold', () => {
    it('rejects when confidence < minConfidence and provides a reason', () => {
      // Use a high threshold so normal items get rejected
      const strictGate = new QualityGate(0.9)
      const result = strictGate.evaluate(
        makeInput({
          text: 'short',
          provenance: { source_type: 'consolidation', source_id: 'x', agent_id: null },
        }),
      )
      // base 0.5 + consolidation 0.0 = 0.5 < 0.9
      expect(result.pass).toBe(false)
      expect(result.reason).toBeDefined()
      expect(result.reason).toContain('below minimum threshold')
    })

    it('passes when confidence >= minConfidence', () => {
      const result = gate.evaluate(makeInput())
      // base 0.5 + user_input 0.1 = 0.6 >= 0.3
      expect(result.pass).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('uses default threshold of 0.3', () => {
      expect(gate.minConfidence).toBe(0.3)
    })

    it('allows custom threshold', () => {
      const custom = new QualityGate(0.7)
      expect(custom.minConfidence).toBe(0.7)
    })
  })

  describe('score clamping', () => {
    it('confidence never exceeds 1.0 even with all bonuses', () => {
      const result = gate.evaluate(
        makeInput({
          text: 'a'.repeat(501), // +0.3
          provenance: { source_type: 'user_input', source_id: 'x', agent_id: null }, // +0.1
          tags: ['a', 'b', 'c'], // +0.1
        }),
      )
      // base 0.5 + 0.3 + 0.1 + 0.1 = 1.0
      expect(result.confidence).toBeLessThanOrEqual(1.0)
      expect(result.confidence).toBeGreaterThanOrEqual(0.0)
    })

    it('importance never exceeds 1.0 even with all bonuses', () => {
      const result = gate.evaluate(
        makeInput({
          layer: 'life_directory', // +0.2
          type: 'semantic', // +0.1
        }),
      )
      // base 0.5 + 0.2 + 0.1 = 0.8
      expect(result.importance).toBeLessThanOrEqual(1.0)
      expect(result.importance).toBeGreaterThanOrEqual(0.0)
    })

    it('confidence is at least 0.0', () => {
      // Minimum possible: base 0.5 + no bonuses = 0.5 (always >= 0)
      const result = gate.evaluate(
        makeInput({
          text: '',
          provenance: { source_type: 'consolidation', source_id: 'x', agent_id: null },
        }),
      )
      expect(result.confidence).toBeGreaterThanOrEqual(0.0)
    })
  })
})


import * as fc from 'fast-check'
import type { MemoryType, MemoryLayer, SourceType, Provenance } from './models'

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavious-memory-architecture, Property 10: Quality Gate Scoring
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
// ---------------------------------------------------------------------------

// --- Arbitraries ---

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
  source_id: fc.string({ minLength: 1, maxLength: 50 }),
  agent_id: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
})

const tagsArb = fc.option(
  fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  { nil: undefined },
)

const candidateInputArb: fc.Arbitrary<CreateMemoryItemInput> = fc.record({
  text: fc.string({ minLength: 0, maxLength: 600 }),
  type: memoryTypeArb,
  layer: memoryLayerArb,
  provenance: provenanceArb,
  confidence: fc.constant(undefined),
  importance: fc.constant(undefined),
  tags: tagsArb,
  bypass_quality_gate: fc.option(fc.boolean(), { nil: undefined }),
})

/**
 * Feature: octavious-memory-architecture, Property 10: Quality Gate Scoring
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 *
 * For any candidate MemoryItem, the Quality_Gate SHALL assign a confidence score
 * in [0.0, 1.0]. If the score is below the configured minimum threshold, the item
 * SHALL be rejected. If the source_type is system_event and bypass is requested,
 * the item SHALL be accepted regardless of score.
 */
describe('Property 10: Quality Gate Scoring', () => {
  describe('10a: Confidence score is always in [0.0, 1.0]', () => {
    it('assigns confidence in [0.0, 1.0] for any candidate input', () => {
      fc.assert(
        fc.property(candidateInputArb, (candidate) => {
          const gate = new QualityGate()
          const result = gate.evaluate(candidate)
          expect(result.confidence).toBeGreaterThanOrEqual(0.0)
          expect(result.confidence).toBeLessThanOrEqual(1.0)
        }),
        { numRuns: 100 },
      )
    })

    it('assigns importance in [0.0, 1.0] for any candidate input', () => {
      fc.assert(
        fc.property(candidateInputArb, (candidate) => {
          const gate = new QualityGate()
          const result = gate.evaluate(candidate)
          expect(result.importance).toBeGreaterThanOrEqual(0.0)
          expect(result.importance).toBeLessThanOrEqual(1.0)
        }),
        { numRuns: 100 },
      )
    })

    it('assigns confidence in [0.0, 1.0] for any minConfidence threshold', () => {
      const thresholdArb = fc.double({ min: 0.0, max: 1.0, noNaN: true })
      fc.assert(
        fc.property(candidateInputArb, thresholdArb, (candidate, threshold) => {
          const gate = new QualityGate(threshold)
          const result = gate.evaluate(candidate)
          expect(result.confidence).toBeGreaterThanOrEqual(0.0)
          expect(result.confidence).toBeLessThanOrEqual(1.0)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('10b: Rejection when confidence < minConfidence', () => {
    it('rejects with reason when confidence is below threshold', () => {
      // Use a high threshold to ensure most items get rejected through normal scoring
      const highThresholdArb = fc.double({ min: 0.95, max: 1.0, noNaN: true })
      // Constrain to non-bypass candidates so bypass doesn't interfere
      const nonBypassCandidateArb = fc.record({
        text: fc.string({ minLength: 0, maxLength: 600 }),
        type: memoryTypeArb,
        layer: memoryLayerArb,
        provenance: fc.record({
          source_type: fc.constantFrom(
            'user_input' as SourceType,
            'agent_output' as SourceType,
            'consolidation' as SourceType,
            'dashboard_sync' as SourceType,
            'evolution' as SourceType,
          ),
          source_id: fc.string({ minLength: 1, maxLength: 50 }),
          agent_id: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
        }),
        confidence: fc.constant(undefined),
        importance: fc.constant(undefined),
        tags: tagsArb,
        bypass_quality_gate: fc.constant(false as boolean | undefined),
      })

      fc.assert(
        fc.property(nonBypassCandidateArb, highThresholdArb, (candidate, threshold) => {
          const gate = new QualityGate(threshold)
          const result = gate.evaluate(candidate)
          if (result.confidence < threshold) {
            expect(result.pass).toBe(false)
            expect(result.reason).toBeDefined()
            expect(result.reason).toContain('below minimum threshold')
          }
        }),
        { numRuns: 100 },
      )
    })

    it('passes when confidence >= minConfidence (non-bypass path)', () => {
      const lowThresholdArb = fc.double({ min: 0.0, max: 0.1, noNaN: true })
      fc.assert(
        fc.property(candidateInputArb, lowThresholdArb, (candidate, threshold) => {
          const gate = new QualityGate(threshold)
          const result = gate.evaluate(candidate)
          // If not bypassed and confidence >= threshold, must pass
          const isBypassed =
            candidate.bypass_quality_gate && candidate.provenance.source_type === 'system_event'
          if (!isBypassed && result.confidence >= threshold) {
            expect(result.pass).toBe(true)
            expect(result.reason).toBeUndefined()
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('10c: Bypass for system_event with bypass_quality_gate=true', () => {
    it('always passes when bypass_quality_gate=true AND source_type=system_event', () => {
      const bypassCandidateArb: fc.Arbitrary<CreateMemoryItemInput> = fc.record({
        text: fc.string({ minLength: 0, maxLength: 600 }),
        type: memoryTypeArb,
        layer: memoryLayerArb,
        provenance: fc.record({
          source_type: fc.constant('system_event' as SourceType),
          source_id: fc.string({ minLength: 1, maxLength: 50 }),
          agent_id: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
        }),
        confidence: fc.constant(undefined),
        importance: fc.constant(undefined),
        tags: tagsArb,
        bypass_quality_gate: fc.constant(true as boolean | undefined),
      })

      // Also vary the threshold to prove bypass ignores it
      const thresholdArb = fc.double({ min: 0.0, max: 1.0, noNaN: true })

      fc.assert(
        fc.property(bypassCandidateArb, thresholdArb, (candidate, threshold) => {
          const gate = new QualityGate(threshold)
          const result = gate.evaluate(candidate)
          expect(result.pass).toBe(true)
          expect(result.confidence).toBe(1.0)
          expect(result.importance).toBe(0.5)
          expect(result.reason).toBeUndefined()
        }),
        { numRuns: 100 },
      )
    })
  })
})
