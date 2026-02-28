import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState } from './index'
import type { JournalEntry, GratitudeEntry } from '@/types'

describe('Soul slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('addJournalEntry', () => {
    it('appends a journal entry to soul.journalEntries', () => {
      const entry: JournalEntry = {
        id: 'j1',
        text: 'Today was a good day.',
        timestamp: '2025-01-15T10:00:00Z',
      }
      useOctaviusStore.getState().addJournalEntry(entry)
      const state = useOctaviusStore.getState()
      expect(state.soul.journalEntries).toHaveLength(1)
      expect(state.soul.journalEntries[0]).toEqual(entry)
    })

    it('preserves existing journal entries when adding a new one', () => {
      const first: JournalEntry = {
        id: 'j1',
        text: 'First entry',
        timestamp: '2025-01-15T10:00:00Z',
      }
      const second: JournalEntry = {
        id: 'j2',
        text: 'Second entry',
        timestamp: '2025-01-16T10:00:00Z',
      }
      useOctaviusStore.getState().addJournalEntry(first)
      useOctaviusStore.getState().addJournalEntry(second)
      const state = useOctaviusStore.getState()
      expect(state.soul.journalEntries).toHaveLength(2)
      expect(state.soul.journalEntries[0]).toEqual(first)
      expect(state.soul.journalEntries[1]).toEqual(second)
    })

    it('does not mutate gratitude entries when adding a journal entry', () => {
      const gratitude: GratitudeEntry = {
        id: 'g1',
        date: '2025-01-15',
        items: ['sunshine', 'coffee'],
      }
      useOctaviusStore.getState().addGratitudeEntry(gratitude)
      const journal: JournalEntry = {
        id: 'j1',
        text: 'Reflection',
        timestamp: '2025-01-15T20:00:00Z',
      }
      useOctaviusStore.getState().addJournalEntry(journal)
      expect(useOctaviusStore.getState().soul.gratitudeEntries).toHaveLength(1)
      expect(useOctaviusStore.getState().soul.gratitudeEntries[0]).toEqual(gratitude)
    })
  })

  describe('addGratitudeEntry', () => {
    it('accepts an entry with exactly 3 items', () => {
      const entry: GratitudeEntry = {
        id: 'g1',
        date: '2025-01-15',
        items: ['family', 'health', 'sunshine'],
      }
      useOctaviusStore.getState().addGratitudeEntry(entry)
      const state = useOctaviusStore.getState()
      expect(state.soul.gratitudeEntries).toHaveLength(1)
      expect(state.soul.gratitudeEntries[0]).toEqual(entry)
    })

    it('accepts an entry with 1 item', () => {
      const entry: GratitudeEntry = {
        id: 'g1',
        date: '2025-01-15',
        items: ['a warm cup of tea'],
      }
      useOctaviusStore.getState().addGratitudeEntry(entry)
      const state = useOctaviusStore.getState()
      expect(state.soul.gratitudeEntries).toHaveLength(1)
      expect(state.soul.gratitudeEntries[0].items).toEqual(['a warm cup of tea'])
    })

    it('accepts an entry with 2 items', () => {
      const entry: GratitudeEntry = {
        id: 'g1',
        date: '2025-01-15',
        items: ['good sleep', 'a kind word'],
      }
      useOctaviusStore.getState().addGratitudeEntry(entry)
      expect(useOctaviusStore.getState().soul.gratitudeEntries[0].items).toHaveLength(2)
    })

    it('preserves existing gratitude entries when adding a new one', () => {
      const first: GratitudeEntry = {
        id: 'g1',
        date: '2025-01-15',
        items: ['a', 'b', 'c'],
      }
      const second: GratitudeEntry = {
        id: 'g2',
        date: '2025-01-16',
        items: ['d'],
      }
      useOctaviusStore.getState().addGratitudeEntry(first)
      useOctaviusStore.getState().addGratitudeEntry(second)
      const state = useOctaviusStore.getState()
      expect(state.soul.gratitudeEntries).toHaveLength(2)
      expect(state.soul.gratitudeEntries[0]).toEqual(first)
      expect(state.soul.gratitudeEntries[1]).toEqual(second)
    })

    it('does not mutate journal entries when adding a gratitude entry', () => {
      const journal: JournalEntry = {
        id: 'j1',
        text: 'My thoughts',
        timestamp: '2025-01-15T10:00:00Z',
      }
      useOctaviusStore.getState().addJournalEntry(journal)
      const gratitude: GratitudeEntry = {
        id: 'g1',
        date: '2025-01-15',
        items: ['peace'],
      }
      useOctaviusStore.getState().addGratitudeEntry(gratitude)
      expect(useOctaviusStore.getState().soul.journalEntries).toHaveLength(1)
      expect(useOctaviusStore.getState().soul.journalEntries[0]).toEqual(journal)
    })
  })
})
