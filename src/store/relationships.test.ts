import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState, overdueConnections } from './index'
import type { Connection, ActivityLog } from '@/types'

describe('Relationships slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('addConnection', () => {
    it('appends a connection to relationships.connections', () => {
      const conn: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(conn)
      const state = useOctaviusStore.getState()
      expect(state.relationships.connections).toHaveLength(1)
      expect(state.relationships.connections[0]).toEqual(conn)
    })

    it('preserves existing connections when adding a new one', () => {
      const first: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      const second: Connection = {
        id: 'conn2',
        name: 'Bob',
        relationshipType: 'colleague',
        lastContactDate: '2025-01-12',
        reminderFrequencyDays: 7,
      }
      useOctaviusStore.getState().addConnection(first)
      useOctaviusStore.getState().addConnection(second)
      const state = useOctaviusStore.getState()
      expect(state.relationships.connections).toHaveLength(2)
      expect(state.relationships.connections[0]).toEqual(first)
      expect(state.relationships.connections[1]).toEqual(second)
    })

    it('does not mutate activity log when adding a connection', () => {
      const conn: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(conn)
      expect(useOctaviusStore.getState().relationships.activityLog).toHaveLength(0)
    })
  })

  describe('updateConnection', () => {
    it('updates specified fields of an existing connection', () => {
      const conn: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(conn)
      useOctaviusStore.getState().updateConnection('conn1', { name: 'Alice Smith' })
      const updated = useOctaviusStore.getState().relationships.connections[0]
      expect(updated.name).toBe('Alice Smith')
      expect(updated.relationshipType).toBe('friend')
    })

    it('does not affect other connections', () => {
      const conn1: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      const conn2: Connection = {
        id: 'conn2',
        name: 'Bob',
        relationshipType: 'colleague',
        lastContactDate: '2025-01-12',
        reminderFrequencyDays: 7,
      }
      useOctaviusStore.getState().addConnection(conn1)
      useOctaviusStore.getState().addConnection(conn2)
      useOctaviusStore.getState().updateConnection('conn1', { relationshipType: 'best friend' })
      const connections = useOctaviusStore.getState().relationships.connections
      expect(connections[1]).toEqual(conn2)
    })

    it('is a no-op when id does not match any connection', () => {
      const conn: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(conn)
      useOctaviusStore.getState().updateConnection('nonexistent', { name: 'Ghost' })
      expect(useOctaviusStore.getState().relationships.connections[0]).toEqual(conn)
    })
  })

  describe('logActivity', () => {
    it('appends an activity log entry', () => {
      const conn: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(conn)
      const entry: ActivityLog = {
        id: 'act1',
        connectionId: 'conn1',
        description: 'Had coffee together',
        date: '2025-01-20',
      }
      useOctaviusStore.getState().logActivity(entry)
      expect(useOctaviusStore.getState().relationships.activityLog).toHaveLength(1)
      expect(useOctaviusStore.getState().relationships.activityLog[0]).toEqual(entry)
    })

    it('updates the connection lastContactDate to the activity date', () => {
      const conn: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(conn)
      const entry: ActivityLog = {
        id: 'act1',
        connectionId: 'conn1',
        description: 'Had coffee together',
        date: '2025-01-20',
      }
      useOctaviusStore.getState().logActivity(entry)
      const updated = useOctaviusStore.getState().relationships.connections[0]
      expect(updated.lastContactDate).toBe('2025-01-20')
    })

    it('does not update lastContactDate of other connections', () => {
      const conn1: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      const conn2: Connection = {
        id: 'conn2',
        name: 'Bob',
        relationshipType: 'colleague',
        lastContactDate: '2025-01-05',
        reminderFrequencyDays: 7,
      }
      useOctaviusStore.getState().addConnection(conn1)
      useOctaviusStore.getState().addConnection(conn2)
      const entry: ActivityLog = {
        id: 'act1',
        connectionId: 'conn1',
        description: 'Lunch',
        date: '2025-01-20',
      }
      useOctaviusStore.getState().logActivity(entry)
      expect(useOctaviusStore.getState().relationships.connections[1].lastContactDate).toBe('2025-01-05')
    })
  })

  describe('setReminderFrequency', () => {
    it('updates reminderFrequencyDays for the specified connection', () => {
      const conn: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(conn)
      useOctaviusStore.getState().setReminderFrequency('conn1', 30)
      expect(useOctaviusStore.getState().relationships.connections[0].reminderFrequencyDays).toBe(30)
    })

    it('does not affect other connection fields', () => {
      const conn: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-10',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(conn)
      useOctaviusStore.getState().setReminderFrequency('conn1', 30)
      const updated = useOctaviusStore.getState().relationships.connections[0]
      expect(updated.name).toBe('Alice')
      expect(updated.lastContactDate).toBe('2025-01-10')
    })
  })

  describe('overdueConnections selector', () => {
    const now = new Date('2025-02-01T12:00:00Z')

    it('returns empty array when there are no connections', () => {
      expect(overdueConnections(useOctaviusStore.getState(), now)).toEqual([])
    })

    it('returns connections where days since last contact exceeds reminder frequency', () => {
      // Last contact 20 days ago, reminder every 14 days → overdue
      const overdue: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-12',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(overdue)
      const result = overdueConnections(useOctaviusStore.getState(), now)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('conn1')
    })

    it('excludes connections that are not overdue', () => {
      // Last contact 5 days ago, reminder every 14 days → not overdue
      const recent: Connection = {
        id: 'conn1',
        name: 'Bob',
        relationshipType: 'colleague',
        lastContactDate: '2025-01-28',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(recent)
      expect(overdueConnections(useOctaviusStore.getState(), now)).toHaveLength(0)
    })

    it('excludes connections where days equals reminder frequency (not strictly overdue)', () => {
      // Exactly 14 days ago, reminder every 14 days → not overdue (need > not >=)
      const exact: Connection = {
        id: 'conn1',
        name: 'Carol',
        relationshipType: 'family',
        lastContactDate: '2025-01-18',
        reminderFrequencyDays: 14,
      }
      useOctaviusStore.getState().addConnection(exact)
      expect(overdueConnections(useOctaviusStore.getState(), now)).toHaveLength(0)
    })

    it('correctly filters a mix of overdue and non-overdue connections', () => {
      const overdue: Connection = {
        id: 'conn1',
        name: 'Alice',
        relationshipType: 'friend',
        lastContactDate: '2025-01-01',
        reminderFrequencyDays: 7,
      }
      const notOverdue: Connection = {
        id: 'conn2',
        name: 'Bob',
        relationshipType: 'colleague',
        lastContactDate: '2025-01-30',
        reminderFrequencyDays: 7,
      }
      useOctaviusStore.getState().addConnection(overdue)
      useOctaviusStore.getState().addConnection(notOverdue)
      const result = overdueConnections(useOctaviusStore.getState(), now)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('conn1')
    })
  })
})

import fc from 'fast-check'

const connectionPropArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  relationshipType: fc.string({ minLength: 1, maxLength: 30 }),
  lastContactDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
  reminderFrequencyDays: fc.integer({ min: 1, max: 365 }),
})

describe('Property 7: Connection CRUD and Overdue Detection', () => {
  /**
   * **Validates: Requirements 4.1, 4.3, 4.4, 4.5**
   *
   * For any Connection, after addConnection + read back, deeply equal.
   * Overdue detection: connections where daysSince(lastContactDate) > reminderFrequencyDays
   * are exactly those returned by overdueConnections.
   */
  it('addConnection round-trip preserves data', () => {
    fc.assert(
      fc.property(connectionPropArb, (conn) => {
        useOctaviusStore.setState(defaultState)

        useOctaviusStore.getState().addConnection(conn)
        const stored = useOctaviusStore.getState().relationships.connections.find((c) => c.id === conn.id)
        expect(stored).toEqual(conn)
      }),
      { numRuns: 150 },
    )
  })

  it('overdueConnections returns exactly those past their reminder frequency', () => {
    fc.assert(
      fc.property(
        fc.array(connectionPropArb, { minLength: 1, maxLength: 10 }),
        fc.date({ min: new Date('2025-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }),
        (connections, now) => {
          useOctaviusStore.setState(defaultState)

          for (const c of connections) {
            useOctaviusStore.getState().addConnection(c)
          }

          const state = useOctaviusStore.getState()
          const overdue = overdueConnections(state, now)
          const overdueIds = new Set(overdue.map((c) => c.id))

          // Manually compute expected overdue set
          for (const c of connections) {
            const lastContact = new Date(c.lastContactDate)
            const diffMs = now.getTime() - lastContact.getTime()
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
            if (diffDays > c.reminderFrequencyDays) {
              expect(overdueIds.has(c.id)).toBe(true)
            } else {
              expect(overdueIds.has(c.id)).toBe(false)
            }
          }
        },
      ),
      { numRuns: 150 },
    )
  })
})

describe('Property 8: Activity Log Updates Last Contact', () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * After logActivity for a connection, the connection's lastContactDate
   * equals the activity's date.
   */
  it('logActivity updates lastContactDate to the activity date', () => {
    fc.assert(
      fc.property(
        connectionPropArb,
        fc.record({
          id: fc.uuid(),
          connectionId: fc.constant('placeholder'),
          description: fc.string({ minLength: 1, maxLength: 200 }),
          date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
        }),
        (conn, activity) => {
          useOctaviusStore.setState(defaultState)

          useOctaviusStore.getState().addConnection(conn)

          // Link activity to the connection
          const linkedActivity = { ...activity, connectionId: conn.id }
          useOctaviusStore.getState().logActivity(linkedActivity)

          const updated = useOctaviusStore.getState().relationships.connections.find((c) => c.id === conn.id)
          expect(updated?.lastContactDate).toBe(linkedActivity.date)
        },
      ),
      { numRuns: 150 },
    )
  })
})
