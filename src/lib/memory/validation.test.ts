import { describe, expect, it } from 'vitest'
import {
  MemoryValidationError,
  validateConfidence,
  validateImportance,
  validateMemoryLayer,
  validateMemoryType,
  validateQuadrantId,
} from './validation'

describe('validateConfidence', () => {
  it('accepts 0.0', () => {
    expect(() => validateConfidence(0.0)).not.toThrow()
  })

  it('accepts 1.0', () => {
    expect(() => validateConfidence(1.0)).not.toThrow()
  })

  it('accepts 0.5', () => {
    expect(() => validateConfidence(0.5)).not.toThrow()
  })

  it('rejects negative values', () => {
    expect(() => validateConfidence(-0.1)).toThrow(MemoryValidationError)
  })

  it('rejects values above 1.0', () => {
    expect(() => validateConfidence(1.01)).toThrow(MemoryValidationError)
  })

  it('rejects NaN', () => {
    expect(() => validateConfidence(NaN)).toThrow(MemoryValidationError)
  })

  it('includes field name in error', () => {
    try {
      validateConfidence(2.0)
    } catch (e) {
      expect(e).toBeInstanceOf(MemoryValidationError)
      expect((e as MemoryValidationError).field).toBe('confidence')
    }
  })
})

describe('validateImportance', () => {
  it('accepts 0.0', () => {
    expect(() => validateImportance(0.0)).not.toThrow()
  })

  it('accepts 1.0', () => {
    expect(() => validateImportance(1.0)).not.toThrow()
  })

  it('accepts 0.75', () => {
    expect(() => validateImportance(0.75)).not.toThrow()
  })

  it('rejects negative values', () => {
    expect(() => validateImportance(-0.5)).toThrow(MemoryValidationError)
  })

  it('rejects values above 1.0', () => {
    expect(() => validateImportance(1.5)).toThrow(MemoryValidationError)
  })

  it('rejects NaN', () => {
    expect(() => validateImportance(NaN)).toThrow(MemoryValidationError)
  })

  it('includes field name in error', () => {
    try {
      validateImportance(-1)
    } catch (e) {
      expect(e).toBeInstanceOf(MemoryValidationError)
      expect((e as MemoryValidationError).field).toBe('importance')
    }
  })
})

describe('validateMemoryType', () => {
  it.each(['episodic', 'semantic', 'procedural', 'entity_profile'] as const)(
    'accepts valid type: %s',
    (type) => {
      expect(() => validateMemoryType(type)).not.toThrow()
    },
  )

  it('rejects invalid type', () => {
    expect(() => validateMemoryType('invalid')).toThrow(MemoryValidationError)
  })

  it('rejects empty string', () => {
    expect(() => validateMemoryType('')).toThrow(MemoryValidationError)
  })

  it('includes field name in error', () => {
    try {
      validateMemoryType('bad')
    } catch (e) {
      expect(e).toBeInstanceOf(MemoryValidationError)
      expect((e as MemoryValidationError).field).toBe('type')
    }
  })
})

describe('validateMemoryLayer', () => {
  it.each(['life_directory', 'daily_notes', 'tacit_knowledge'] as const)(
    'accepts valid layer: %s',
    (layer) => {
      expect(() => validateMemoryLayer(layer)).not.toThrow()
    },
  )

  it('rejects invalid layer', () => {
    expect(() => validateMemoryLayer('invalid')).toThrow(MemoryValidationError)
  })

  it('rejects empty string', () => {
    expect(() => validateMemoryLayer('')).toThrow(MemoryValidationError)
  })

  it('includes field name in error', () => {
    try {
      validateMemoryLayer('bad')
    } catch (e) {
      expect(e).toBeInstanceOf(MemoryValidationError)
      expect((e as MemoryValidationError).field).toBe('layer')
    }
  })
})

describe('validateQuadrantId', () => {
  it.each(['lifeforce', 'industry', 'fellowship', 'essence'] as const)(
    'accepts valid quadrant: %s',
    (quadrant) => {
      expect(() => validateQuadrantId(quadrant)).not.toThrow()
    },
  )

  it('rejects invalid quadrant', () => {
    expect(() => validateQuadrantId('invalid')).toThrow(MemoryValidationError)
  })

  it('rejects dashboard quadrant names', () => {
    // Memory quadrants differ from dashboard quadrants
    expect(() => validateQuadrantId('health')).toThrow(MemoryValidationError)
    expect(() => validateQuadrantId('career')).toThrow(MemoryValidationError)
    expect(() => validateQuadrantId('relationships')).toThrow(MemoryValidationError)
    expect(() => validateQuadrantId('soul')).toThrow(MemoryValidationError)
  })

  it('includes field name in error', () => {
    try {
      validateQuadrantId('bad')
    } catch (e) {
      expect(e).toBeInstanceOf(MemoryValidationError)
      expect((e as MemoryValidationError).field).toBe('quadrant')
    }
  })
})

import * as fc from 'fast-check'

/**
 * Feature: octavious-memory-architecture, Property 2: Numeric Range Validation
 *
 * **Validates: Requirements 1.4, 1.5**
 *
 * For any number outside the range [0.0, 1.0], attempting to create a MemoryItem
 * with that value as confidence or importance SHALL be rejected with a validation error.
 * For any number within [0.0, 1.0], the creation SHALL succeed.
 */
describe('Property 2: Numeric Range Validation', () => {
  const validNumberArb = fc.double({ min: 0.0, max: 1.0, noNaN: true })
  const invalidAboveArb = fc.double({ min: 1.0000000000000002, max: 1e308, noNaN: true })
  const invalidBelowArb = fc.double({ min: -1e308, max: -Number.MIN_VALUE, noNaN: true })

  describe('validateConfidence', () => {
    it('accepts any number in [0.0, 1.0]', () => {
      fc.assert(
        fc.property(validNumberArb, (value) => {
          expect(() => validateConfidence(value)).not.toThrow()
        }),
        { numRuns: 100 },
      )
    })

    it('rejects any number above 1.0', () => {
      fc.assert(
        fc.property(invalidAboveArb, (value) => {
          expect(() => validateConfidence(value)).toThrow(MemoryValidationError)
          try {
            validateConfidence(value)
          } catch (e) {
            expect((e as MemoryValidationError).field).toBe('confidence')
          }
        }),
        { numRuns: 100 },
      )
    })

    it('rejects any number below 0.0', () => {
      fc.assert(
        fc.property(invalidBelowArb, (value) => {
          expect(() => validateConfidence(value)).toThrow(MemoryValidationError)
          try {
            validateConfidence(value)
          } catch (e) {
            expect((e as MemoryValidationError).field).toBe('confidence')
          }
        }),
        { numRuns: 100 },
      )
    })

    it('rejects NaN', () => {
      expect(() => validateConfidence(NaN)).toThrow(MemoryValidationError)
    })
  })

  describe('validateImportance', () => {
    it('accepts any number in [0.0, 1.0]', () => {
      fc.assert(
        fc.property(validNumberArb, (value) => {
          expect(() => validateImportance(value)).not.toThrow()
        }),
        { numRuns: 100 },
      )
    })

    it('rejects any number above 1.0', () => {
      fc.assert(
        fc.property(invalidAboveArb, (value) => {
          expect(() => validateImportance(value)).toThrow(MemoryValidationError)
          try {
            validateImportance(value)
          } catch (e) {
            expect((e as MemoryValidationError).field).toBe('importance')
          }
        }),
        { numRuns: 100 },
      )
    })

    it('rejects any number below 0.0', () => {
      fc.assert(
        fc.property(invalidBelowArb, (value) => {
          expect(() => validateImportance(value)).toThrow(MemoryValidationError)
          try {
            validateImportance(value)
          } catch (e) {
            expect((e as MemoryValidationError).field).toBe('importance')
          }
        }),
        { numRuns: 100 },
      )
    })

    it('rejects NaN', () => {
      expect(() => validateImportance(NaN)).toThrow(MemoryValidationError)
    })
  })
})
