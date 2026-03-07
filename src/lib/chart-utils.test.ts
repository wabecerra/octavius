import { describe, it, expect } from 'vitest'
import { toChartData } from './chart-utils'
import type { WellnessCheckIn } from '../types'

describe('toChartData', () => {
  it('returns an empty array for empty input', () => {
    expect(toChartData([])).toEqual([])
  })

  it('maps a single check-in to { timestamp, mood }', () => {
    const checkIn: WellnessCheckIn = {
      id: '1',
      timestamp: '2024-01-15T10:00:00Z',
      mood: 4,
      energy: 3,
      stress: 2,
    }
    expect(toChartData([checkIn])).toEqual([
      { timestamp: '2024-01-15T10:00:00Z', mood: 4 },
    ])
  })

  it('preserves order and length for multiple check-ins', () => {
    const checkIns: WellnessCheckIn[] = [
      { id: '1', timestamp: '2024-01-01T08:00:00Z', mood: 1, energy: 2, stress: 5 },
      { id: '2', timestamp: '2024-01-02T09:00:00Z', mood: 3, energy: 4, stress: 3 },
      { id: '3', timestamp: '2024-01-03T10:00:00Z', mood: 5, energy: 1, stress: 1 },
    ]
    const result = toChartData(checkIns)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ timestamp: '2024-01-01T08:00:00Z', mood: 1 })
    expect(result[1]).toEqual({ timestamp: '2024-01-02T09:00:00Z', mood: 3 })
    expect(result[2]).toEqual({ timestamp: '2024-01-03T10:00:00Z', mood: 5 })
  })

  it('excludes energy and stress fields from output', () => {
    const checkIn: WellnessCheckIn = {
      id: '1',
      timestamp: '2024-06-01T12:00:00Z',
      mood: 2,
      energy: 5,
      stress: 4,
    }
    const [point] = toChartData([checkIn])

    expect(Object.keys(point)).toEqual(['timestamp', 'mood'])
  })
})

import fc from 'fast-check'

const wellnessCheckInArb = fc.record({
  id: fc.uuid(),
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) => d.toISOString()),
  mood: fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<1 | 2 | 3 | 4 | 5>,
  energy: fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<1 | 2 | 3 | 4 | 5>,
  stress: fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<1 | 2 | 3 | 4 | 5>,
})

describe('Feature: octavius-mvp-dashboard, Property 9: Mood Chart Data Fidelity', () => {
  it('toChartData has same length and each element mood equals the corresponding check-in mood', () => {
    fc.assert(
      fc.property(fc.array(wellnessCheckInArb), (checkIns) => {
        const result = toChartData(checkIns)

        // Same length
        expect(result).toHaveLength(checkIns.length)

        // Each element's mood equals the corresponding check-in's mood
        for (let i = 0; i < checkIns.length; i++) {
          expect(result[i].mood).toBe(checkIns[i].mood)
          expect(result[i].timestamp).toBe(checkIns[i].timestamp)
        }
      }),
      { numRuns: 100 },
    )
  })
})
