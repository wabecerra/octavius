import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from './db'
import { HeartbeatMonitor } from './heartbeat'

describe('HeartbeatMonitor', () => {
  let db: Database.Database
  let monitor: HeartbeatMonitor

  beforeEach(() => {
    db = getDatabase(':memory:')
    monitor = new HeartbeatMonitor(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  describe('register', () => {
    it('creates a new active process with correct fields', () => {
      const process = monitor.register('proc-1', 'agent-lifeforce', 5000)

      expect(process.process_id).toBe('proc-1')
      expect(process.agent_id).toBe('agent-lifeforce')
      expect(process.status).toBe('active')
      expect(process.started_at).toBeDefined()
      expect(process.last_heartbeat).toBe(process.started_at)
      expect(process.completed_at).toBeNull()
      expect(process.heartbeat_interval_ms).toBe(5000)
    })

    it('persists the process to SQLite', () => {
      monitor.register('proc-1', 'agent-industry', 3000)

      const row = db
        .prepare('SELECT * FROM heartbeat_processes WHERE process_id = ?')
        .get('proc-1') as Record<string, unknown>

      expect(row).toBeDefined()
      expect(row.agent_id).toBe('agent-industry')
      expect(row.status).toBe('active')
      expect(row.heartbeat_interval_ms).toBe(3000)
    })

    it('throws on duplicate process_id', () => {
      monitor.register('proc-dup', 'agent-1', 1000)
      expect(() => monitor.register('proc-dup', 'agent-2', 2000)).toThrow()
    })
  })

  describe('heartbeat', () => {
    it('updates last_heartbeat timestamp on active process', () => {
      const registered = monitor.register('proc-hb', 'agent-1', 1000)

      monitor.heartbeat('proc-hb')

      const row = db
        .prepare('SELECT last_heartbeat FROM heartbeat_processes WHERE process_id = ?')
        .get('proc-hb') as { last_heartbeat: string }

      expect(row.last_heartbeat >= registered.last_heartbeat).toBe(true)
    })

    it('throws for non-existent process', () => {
      expect(() => monitor.heartbeat('nonexistent')).toThrow('Process not found: nonexistent')
    })

    it('throws for completed process', () => {
      monitor.register('proc-done', 'agent-1', 1000)
      monitor.complete('proc-done')

      expect(() => monitor.heartbeat('proc-done')).toThrow(
        "Cannot heartbeat process in 'completed' status: proc-done",
      )
    })

    it('throws for failed process', () => {
      monitor.register('proc-fail', 'agent-1', 1000)
      monitor.fail('proc-fail')

      expect(() => monitor.heartbeat('proc-fail')).toThrow(
        "Cannot heartbeat process in 'failed' status: proc-fail",
      )
    })
  })

  describe('complete', () => {
    it('marks process as completed with timestamp', () => {
      monitor.register('proc-c', 'agent-1', 1000)
      monitor.complete('proc-c')

      const row = db
        .prepare('SELECT status, completed_at FROM heartbeat_processes WHERE process_id = ?')
        .get('proc-c') as { status: string; completed_at: string | null }

      expect(row.status).toBe('completed')
      expect(row.completed_at).not.toBeNull()
    })

    it('throws for non-existent process', () => {
      expect(() => monitor.complete('nonexistent')).toThrow('Process not found: nonexistent')
    })
  })

  describe('fail', () => {
    it('marks process as failed with timestamp', () => {
      monitor.register('proc-f', 'agent-1', 1000)
      monitor.fail('proc-f')

      const row = db
        .prepare('SELECT status, completed_at FROM heartbeat_processes WHERE process_id = ?')
        .get('proc-f') as { status: string; completed_at: string | null }

      expect(row.status).toBe('failed')
      expect(row.completed_at).not.toBeNull()
    })

    it('throws for non-existent process', () => {
      expect(() => monitor.fail('nonexistent')).toThrow('Process not found: nonexistent')
    })
  })

  describe('checkStalled', () => {
    it('marks processes as stalled when heartbeat exceeds 2x interval', () => {
      // Insert a process with a last_heartbeat far in the past
      const pastTime = new Date(Date.now() - 20_000).toISOString()
      db.prepare(
        `INSERT INTO heartbeat_processes
         (process_id, agent_id, status, started_at, last_heartbeat, completed_at, heartbeat_interval_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('stale-proc', 'agent-1', 'active', pastTime, pastTime, null, 5000)

      const stalled = monitor.checkStalled()

      expect(stalled).toHaveLength(1)
      expect(stalled[0].process_id).toBe('stale-proc')
      expect(stalled[0].status).toBe('stalled')

      // Verify persisted
      const row = db
        .prepare('SELECT status FROM heartbeat_processes WHERE process_id = ?')
        .get('stale-proc') as { status: string }
      expect(row.status).toBe('stalled')
    })

    it('does not mark recently heartbeated processes as stalled', () => {
      monitor.register('fresh-proc', 'agent-1', 60_000)

      const stalled = monitor.checkStalled()
      expect(stalled).toHaveLength(0)

      // Verify still active
      const all = monitor.listAll()
      expect(all[0].status).toBe('active')
    })

    it('ignores completed and failed processes', () => {
      const pastTime = new Date(Date.now() - 20_000).toISOString()

      db.prepare(
        `INSERT INTO heartbeat_processes
         (process_id, agent_id, status, started_at, last_heartbeat, completed_at, heartbeat_interval_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('done-proc', 'agent-1', 'completed', pastTime, pastTime, pastTime, 5000)

      db.prepare(
        `INSERT INTO heartbeat_processes
         (process_id, agent_id, status, started_at, last_heartbeat, completed_at, heartbeat_interval_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('fail-proc', 'agent-1', 'failed', pastTime, pastTime, pastTime, 5000)

      const stalled = monitor.checkStalled()
      expect(stalled).toHaveLength(0)
    })

    it('returns empty array when no processes are stalled', () => {
      const stalled = monitor.checkStalled()
      expect(stalled).toHaveLength(0)
    })
  })

  describe('listAll', () => {
    it('returns all processes with current status', () => {
      monitor.register('p1', 'agent-1', 1000)
      monitor.register('p2', 'agent-2', 2000)
      monitor.complete('p2')

      const all = monitor.listAll()
      expect(all).toHaveLength(2)

      const p1 = all.find((p) => p.process_id === 'p1')
      const p2 = all.find((p) => p.process_id === 'p2')

      expect(p1).toBeDefined()
      expect(p1!.status).toBe('active')
      expect(p1!.agent_id).toBe('agent-1')

      expect(p2).toBeDefined()
      expect(p2!.status).toBe('completed')
      expect(p2!.agent_id).toBe('agent-2')
    })

    it('returns empty array when no processes registered', () => {
      const all = monitor.listAll()
      expect(all).toHaveLength(0)
    })

    it('includes all status types', () => {
      monitor.register('active-p', 'a1', 1000)
      monitor.register('completed-p', 'a2', 1000)
      monitor.register('failed-p', 'a3', 1000)

      monitor.complete('completed-p')
      monitor.fail('failed-p')

      // Insert a stalled one manually
      const pastTime = new Date(Date.now() - 20_000).toISOString()
      db.prepare(
        `INSERT INTO heartbeat_processes
         (process_id, agent_id, status, started_at, last_heartbeat, completed_at, heartbeat_interval_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('stalled-p', 'a4', 'stalled', pastTime, pastTime, null, 5000)

      const all = monitor.listAll()
      expect(all).toHaveLength(4)

      const statuses = all.map((p) => p.status).sort()
      expect(statuses).toEqual(['active', 'completed', 'failed', 'stalled'])
    })
  })
})


// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 15: Heartbeat Process Lifecycle
// **Validates: Requirements 17.1, 17.3, 17.4, 17.5, 17.6**
// ---------------------------------------------------------------------------

import * as fc from 'fast-check'

// --- Arbitraries ---

const processIdArb = fc.string({ minLength: 1, maxLength: 64 }).map((s) => `proc-${s}`)
const agentIdArb = fc.constantFrom(
  'agent-lifeforce',
  'agent-industry',
  'agent-fellowship',
  'agent-essence',
  'orchestrator',
)
const intervalMsArb = fc.integer({ min: 100, max: 60_000 })

// --- Property 15: Heartbeat Process Lifecycle ---

describe('Property 15: Heartbeat Process Lifecycle', () => {
  /**
   * Feature: octavius-memory-architecture, Property 15: Heartbeat Process Lifecycle
   *
   * **Validates: Requirements 17.1, 17.3, 17.4, 17.5, 17.6**
   *
   * For any registered process, the Heartbeat_Monitor SHALL transition its status
   * correctly: active → completed (on completion signal), active → failed (on fail signal).
   * The query interface SHALL return the current status for all registered processes.
   */

  let db: Database.Database
  let monitor: HeartbeatMonitor

  beforeEach(() => {
    db = getDatabase(':memory:')
    monitor = new HeartbeatMonitor(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('register → complete → status is "completed" with completed_at set', () => {
    fc.assert(
      fc.property(processIdArb, agentIdArb, intervalMsArb, (pid, agentId, interval) => {
        // Fresh DB per iteration to avoid duplicate process_id collisions
        const iterDb = getDatabase(':memory:')
        const iterMonitor = new HeartbeatMonitor(iterDb)

        try {
          // Register
          const registered = iterMonitor.register(pid, agentId, interval)
          expect(registered.process_id).toBe(pid)
          expect(registered.agent_id).toBe(agentId)
          expect(registered.status).toBe('active')
          expect(registered.heartbeat_interval_ms).toBe(interval)
          expect(registered.completed_at).toBeNull()

          // Complete
          iterMonitor.complete(pid)

          // Verify via listAll
          const all = iterMonitor.listAll()
          expect(all).toHaveLength(1)
          const proc = all[0]
          expect(proc.process_id).toBe(pid)
          expect(proc.status).toBe('completed')
          expect(proc.completed_at).not.toBeNull()
          // completed_at should be a valid ISO timestamp
          expect(Number.isNaN(Date.parse(proc.completed_at!))).toBe(false)
        } finally {
          closeDatabase(iterDb)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('register → fail → status is "failed"', () => {
    fc.assert(
      fc.property(processIdArb, agentIdArb, intervalMsArb, (pid, agentId, interval) => {
        const iterDb = getDatabase(':memory:')
        const iterMonitor = new HeartbeatMonitor(iterDb)

        try {
          // Register
          const registered = iterMonitor.register(pid, agentId, interval)
          expect(registered.status).toBe('active')

          // Fail
          iterMonitor.fail(pid)

          // Verify via listAll
          const all = iterMonitor.listAll()
          expect(all).toHaveLength(1)
          const proc = all[0]
          expect(proc.process_id).toBe(pid)
          expect(proc.status).toBe('failed')
          expect(proc.completed_at).not.toBeNull()
        } finally {
          closeDatabase(iterDb)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('listAll returns all registered processes with correct statuses', () => {
    fc.assert(
      fc.property(
        // Generate 2–6 unique process entries with random terminal actions
        fc.integer({ min: 2, max: 6 }).chain((count) =>
          fc.tuple(
            fc.constant(count),
            fc.array(
              fc.tuple(agentIdArb, intervalMsArb, fc.constantFrom('complete', 'fail', 'none')),
              { minLength: count, maxLength: count },
            ),
          ),
        ),
        ([count, entries]) => {
          const iterDb = getDatabase(':memory:')
          const iterMonitor = new HeartbeatMonitor(iterDb)

          try {
            const expectedStatuses: Map<string, string> = new Map()

            for (let i = 0; i < count; i++) {
              const pid = `p-${i}`
              const [agentId, interval, action] = entries[i]

              iterMonitor.register(pid, agentId, interval)

              if (action === 'complete') {
                iterMonitor.complete(pid)
                expectedStatuses.set(pid, 'completed')
              } else if (action === 'fail') {
                iterMonitor.fail(pid)
                expectedStatuses.set(pid, 'failed')
              } else {
                expectedStatuses.set(pid, 'active')
              }
            }

            // listAll should return all processes
            const all = iterMonitor.listAll()
            expect(all).toHaveLength(count)

            // Each process should have the expected status
            for (const proc of all) {
              expect(expectedStatuses.has(proc.process_id)).toBe(true)
              expect(proc.status).toBe(expectedStatuses.get(proc.process_id))
            }

            // Completed/failed processes should have completed_at set
            for (const proc of all) {
              if (proc.status === 'completed' || proc.status === 'failed') {
                expect(proc.completed_at).not.toBeNull()
              } else {
                expect(proc.completed_at).toBeNull()
              }
            }
          } finally {
            closeDatabase(iterDb)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
