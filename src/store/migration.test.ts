import { describe, it, expect } from 'vitest'
import { migrateState } from './index'

describe('migrateState', () => {
  it('returns state unchanged for v0 → v1 (passthrough)', () => {
    const stored = { profile: { name: 'Test' }, health: { checkIns: [] } }
    const result = migrateState(stored, 0, 1)
    expect(result).toEqual(stored)
  })

  it('returns state unchanged when already at current version', () => {
    const stored = { profile: { name: 'Test' } }
    const result = migrateState(stored, 1, 1)
    expect(result).toEqual(stored)
  })

  it('returns null for unknown version gap', () => {
    const stored = { profile: { name: 'Test' } }
    const result = migrateState(stored, 5, 10)
    expect(result).toBeNull()
  })

  it('does not mutate the original state object', () => {
    const stored = { profile: { name: 'Test' } }
    const original = { ...stored }
    migrateState(stored, 0, 1)
    expect(stored).toEqual(original)
  })
})
