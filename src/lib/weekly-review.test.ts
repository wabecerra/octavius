import { describe, it, expect } from 'vitest'
import { shouldShowWeeklyReviewPrompt } from './weekly-review'

describe('shouldShowWeeklyReviewPrompt', () => {
  it('returns true when date day matches configured review day (Sunday = 0)', () => {
    // 2024-01-07 is a Sunday
    const sunday = new Date(2024, 0, 7)
    expect(shouldShowWeeklyReviewPrompt(sunday, { weeklyReviewDay: 0 })).toBe(true)
  })

  it('returns true when date day matches configured review day (Wednesday = 3)', () => {
    // 2024-01-10 is a Wednesday
    const wednesday = new Date(2024, 0, 10)
    expect(shouldShowWeeklyReviewPrompt(wednesday, { weeklyReviewDay: 3 })).toBe(true)
  })

  it('returns true when date day matches configured review day (Saturday = 6)', () => {
    // 2024-01-13 is a Saturday
    const saturday = new Date(2024, 0, 13)
    expect(shouldShowWeeklyReviewPrompt(saturday, { weeklyReviewDay: 6 })).toBe(true)
  })

  it('returns false when date day does not match configured review day', () => {
    // 2024-01-07 is a Sunday (day 0)
    const sunday = new Date(2024, 0, 7)
    expect(shouldShowWeeklyReviewPrompt(sunday, { weeklyReviewDay: 1 })).toBe(false)
  })

  it('returns false for every non-matching day of the week', () => {
    // 2024-01-08 is a Monday (day 1)
    const monday = new Date(2024, 0, 8)
    for (let day = 0; day <= 6; day++) {
      if (day === 1) continue
      expect(shouldShowWeeklyReviewPrompt(monday, { weeklyReviewDay: day })).toBe(false)
    }
  })

  it('works for all seven days of the week', () => {
    // 2024-01-07 (Sun) through 2024-01-13 (Sat)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(2024, 0, 7 + dayOffset)
      const expectedDay = dayOffset // 0=Sun, 1=Mon, ..., 6=Sat
      expect(shouldShowWeeklyReviewPrompt(date, { weeklyReviewDay: expectedDay })).toBe(true)
      // And a different day should be false
      const otherDay = (expectedDay + 1) % 7
      expect(shouldShowWeeklyReviewPrompt(date, { weeklyReviewDay: otherDay })).toBe(false)
    }
  })
})

import fc from 'fast-check'

describe('Feature: octavius-mvp-dashboard, Property 13: Weekly Review Day Prompt', () => {
  it('returns true iff date.getDay() === config.weeklyReviewDay', () => {
    fc.assert(
      fc.property(
        fc.date(),
        fc.integer({ min: 0, max: 6 }),
        (date, weeklyReviewDay) => {
          const result = shouldShowWeeklyReviewPrompt(date, { weeklyReviewDay })
          expect(result).toBe(date.getDay() === weeklyReviewDay)
        },
      ),
      { numRuns: 100 },
    )
  })
})
