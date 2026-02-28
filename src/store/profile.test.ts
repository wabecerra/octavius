import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState } from './index'

describe('Profile slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('updateProfile', () => {
    it('updates the name field', () => {
      useOctaviusStore.getState().updateProfile({ name: 'Octavius' })
      expect(useOctaviusStore.getState().profile.name).toBe('Octavius')
    })

    it('updates core values', () => {
      useOctaviusStore.getState().updateProfile({ coreValues: 'Integrity, Growth, Compassion' })
      expect(useOctaviusStore.getState().profile.coreValues).toBe('Integrity, Growth, Compassion')
    })

    it('updates life vision', () => {
      useOctaviusStore.getState().updateProfile({ lifeVision: 'Live with purpose and balance.' })
      expect(useOctaviusStore.getState().profile.lifeVision).toBe('Live with purpose and balance.')
    })

    it('updates accent color', () => {
      useOctaviusStore.getState().updateProfile({ accentColor: '#FF5733' })
      expect(useOctaviusStore.getState().profile.accentColor).toBe('#FF5733')
    })

    it('updates weekly review day', () => {
      useOctaviusStore.getState().updateProfile({ weeklyReviewDay: 5 })
      expect(useOctaviusStore.getState().profile.weeklyReviewDay).toBe(5)
    })

    it('updates multiple fields at once', () => {
      useOctaviusStore.getState().updateProfile({
        name: 'Octavius',
        accentColor: '#00FF00',
        weeklyReviewDay: 3,
      })
      const profile = useOctaviusStore.getState().profile
      expect(profile.name).toBe('Octavius')
      expect(profile.accentColor).toBe('#00FF00')
      expect(profile.weeklyReviewDay).toBe(3)
    })

    it('preserves fields not included in the update', () => {
      useOctaviusStore.getState().updateProfile({ name: 'Octavius', coreValues: 'Growth' })
      useOctaviusStore.getState().updateProfile({ accentColor: '#123456' })
      const profile = useOctaviusStore.getState().profile
      expect(profile.name).toBe('Octavius')
      expect(profile.coreValues).toBe('Growth')
      expect(profile.accentColor).toBe('#123456')
      // defaults preserved
      expect(profile.lifeVision).toBe('')
      expect(profile.weeklyReviewDay).toBe(0)
    })

    it('does not mutate other store slices', () => {
      useOctaviusStore.getState().updateProfile({ name: 'Test' })
      const state = useOctaviusStore.getState()
      expect(state.health).toEqual(defaultState.health)
      expect(state.career).toEqual(defaultState.career)
      expect(state.soul).toEqual(defaultState.soul)
      expect(state.goals).toEqual(defaultState.goals)
    })
  })
})
