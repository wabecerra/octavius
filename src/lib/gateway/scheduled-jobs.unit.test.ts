/**
 * Unit tests for GatewayJobScheduler.
 *
 * Covers: CRUD operations, max 50 enabled jobs enforcement,
 * dispatch when connected/disconnected, run logging.
 *
 * Requirements: 10.1–10.7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from '../memory/db'
import { GatewayJobScheduler, type CreateScheduledJobInput } from './scheduled-jobs'
import type { GatewayClient } from './client'
import type { TaskDispatcher } from './dispatcher'

/** Create a mock GatewayClient */
function mockClient(status: 'connected' | 'disconnected' = 'connected'): GatewayClient {
  return { getStatus: vi.fn(() => status) } as unknown as GatewayClient
}

/** Create a mock TaskDispatcher */
function mockDispatcher(result?: { result: string }): TaskDispatcher {
  return {
    dispatch: vi.fn().mockResolvedValue(result ?? { result: 'ok', routing: {} }),
  } as unknown as TaskDispatcher
}

/** Default job input */
function jobInput(overrides: Partial<CreateScheduledJobInput> = {}): CreateScheduledJobInput {
  return {
    name: `test-job-${Date.now()}-${Math.random()}`,
    cronExpression: '0 9 * * *',
    agentId: 'agent-industry',
    taskTemplate: 'Run daily briefing',
    ...overrides,
  }
}

describe('GatewayJobScheduler', () => {
  let db: Database.Database
  let scheduler: GatewayJobScheduler

  beforeEach(() => {
    db = getDatabase(':memory:')
    scheduler = new GatewayJobScheduler(db, mockClient(), mockDispatcher())
  })

  afterEach(() => {
    closeDatabase(db)
  })

  describe('create()', () => {
    it('creates a job and persists it in SQLite', () => {
      const job = scheduler.create(jobInput({ name: 'daily-briefing' }))

      expect(job.id).toBeTruthy()
      expect(job.name).toBe('daily-briefing')
      expect(job.cronExpression).toBe('0 9 * * *')
      expect(job.agentId).toBe('agent-industry')
      expect(job.enabled).toBe(true)
      expect(job.createdAt).toBeTruthy()

      // Verify persisted
      const retrieved = scheduler.getById(job.id)
      expect(retrieved).toEqual(job)
    })

    it('creates a disabled job without hitting the limit', () => {
      const job = scheduler.create(jobInput({ name: 'disabled-job', enabled: false }))
      expect(job.enabled).toBe(false)
    })

    it('rejects creation when 50 enabled jobs exist', () => {
      // Create 50 enabled jobs
      for (let i = 0; i < 50; i++) {
        scheduler.create(jobInput({ name: `job-${i}` }))
      }

      expect(scheduler.getEnabledCount()).toBe(50)

      // 51st should fail
      expect(() => scheduler.create(jobInput({ name: 'job-51' }))).toThrow(
        /maximum of 50 enabled jobs/,
      )
    })

    it('allows creating disabled jobs even at the limit', () => {
      for (let i = 0; i < 50; i++) {
        scheduler.create(jobInput({ name: `job-${i}` }))
      }

      // Disabled job should succeed
      const job = scheduler.create(jobInput({ name: 'disabled-extra', enabled: false }))
      expect(job.enabled).toBe(false)
    })
  })

  describe('getById() / getByName()', () => {
    it('returns null for non-existent job', () => {
      expect(scheduler.getById('nonexistent')).toBeNull()
      expect(scheduler.getByName('nonexistent')).toBeNull()
    })

    it('retrieves job by name', () => {
      const created = scheduler.create(jobInput({ name: 'find-me' }))
      const found = scheduler.getByName('find-me')
      expect(found).toEqual(created)
    })
  })

  describe('list()', () => {
    it('lists all jobs', () => {
      scheduler.create(jobInput({ name: 'job-a' }))
      scheduler.create(jobInput({ name: 'job-b', enabled: false }))

      const all = scheduler.list()
      expect(all).toHaveLength(2)
    })

    it('lists only enabled jobs when filtered', () => {
      scheduler.create(jobInput({ name: 'enabled-job' }))
      scheduler.create(jobInput({ name: 'disabled-job', enabled: false }))

      const enabled = scheduler.list(true)
      expect(enabled).toHaveLength(1)
      expect(enabled[0]!.name).toBe('enabled-job')
    })
  })

  describe('update()', () => {
    it('updates job fields', () => {
      const job = scheduler.create(jobInput({ name: 'update-me' }))
      const updated = scheduler.update(job.id, {
        name: 'updated-name',
        cronExpression: '30 8 * * 1-5',
        agentId: 'agent-lifeforce',
      })

      expect(updated.name).toBe('updated-name')
      expect(updated.cronExpression).toBe('30 8 * * 1-5')
      expect(updated.agentId).toBe('agent-lifeforce')
      // updatedAt is refreshed (may be same ms in fast tests, so just check it exists)
      expect(updated.updatedAt).toBeTruthy()
    })

    it('throws for non-existent job', () => {
      expect(() => scheduler.update('nonexistent', { name: 'x' })).toThrow(
        /not found/,
      )
    })

    it('rejects enabling when at the limit', () => {
      for (let i = 0; i < 50; i++) {
        scheduler.create(jobInput({ name: `job-${i}` }))
      }
      const disabled = scheduler.create(jobInput({ name: 'disabled', enabled: false }))

      expect(() => scheduler.update(disabled.id, { enabled: true })).toThrow(
        /maximum of 50/,
      )
    })
  })

  describe('delete()', () => {
    it('deletes an existing job', () => {
      const job = scheduler.create(jobInput({ name: 'delete-me' }))
      expect(scheduler.delete(job.id)).toBe(true)
      expect(scheduler.getById(job.id)).toBeNull()
    })

    it('returns false for non-existent job', () => {
      expect(scheduler.delete('nonexistent')).toBe(false)
    })
  })

  describe('executeJob()', () => {
    it('dispatches task when gateway is connected', async () => {
      const dispatchFn = vi.fn().mockResolvedValue({ result: 'ok', routing: {} })
      const dispatcher = { dispatch: dispatchFn } as unknown as TaskDispatcher
      const sched = new GatewayJobScheduler(db, mockClient('connected'), dispatcher)

      const job = sched.create(jobInput({ name: 'exec-test' }))
      await sched.executeJob(job)

      expect(dispatchFn).toHaveBeenCalledOnce()
      const calledTask = dispatchFn.mock.calls[0]![0]
      expect(calledTask.agentId).toBe('agent-industry')
      expect(calledTask.description).toBe('Run daily briefing')

      // Verify run logged as success
      const runs = sched.getJobRuns('exec-test')
      expect(runs).toHaveLength(1)
      expect(runs[0]!.success).toBe(true)
    })

    it('skips and logs when gateway is disconnected', async () => {
      const dispatchFn = vi.fn()
      const dispatcher = { dispatch: dispatchFn } as unknown as TaskDispatcher
      const sched = new GatewayJobScheduler(db, mockClient('disconnected'), dispatcher)

      const job = sched.create(jobInput({ name: 'skip-test' }))
      await sched.executeJob(job)

      // Dispatch should NOT have been called
      expect(dispatchFn).not.toHaveBeenCalled()

      // Verify skip event logged
      const events = db
        .prepare("SELECT * FROM gateway_events WHERE event_type = 'job_skip'")
        .all() as Array<{ details: string }>
      expect(events).toHaveLength(1)
      const details = JSON.parse(events[0]!.details)
      expect(details.reason).toBe('gateway_disconnected')

      // Verify run logged as failure
      const runs = sched.getJobRuns('skip-test')
      expect(runs).toHaveLength(1)
      expect(runs[0]!.success).toBe(false)
    })

    it('records failure when dispatch throws', async () => {
      const dispatchFn = vi.fn().mockRejectedValue(new Error('dispatch failed'))
      const dispatcher = { dispatch: dispatchFn } as unknown as TaskDispatcher
      const sched = new GatewayJobScheduler(db, mockClient('connected'), dispatcher)

      const job = sched.create(jobInput({ name: 'fail-test' }))
      await sched.executeJob(job)

      const runs = sched.getJobRuns('fail-test')
      expect(runs).toHaveLength(1)
      expect(runs[0]!.success).toBe(false)
      expect(runs[0]!.error).toContain('dispatch failed')
    })
  })

  describe('triggerManual()', () => {
    it('executes the job by ID', async () => {
      const dispatchFn = vi.fn().mockResolvedValue({ result: 'ok', routing: {} })
      const dispatcher = { dispatch: dispatchFn } as unknown as TaskDispatcher
      const sched = new GatewayJobScheduler(db, mockClient('connected'), dispatcher)

      const job = sched.create(jobInput({ name: 'manual-trigger' }))
      await sched.triggerManual(job.id)

      expect(dispatchFn).toHaveBeenCalledOnce()
    })

    it('throws for non-existent job', async () => {
      await expect(scheduler.triggerManual('nonexistent')).rejects.toThrow(/not found/)
    })
  })
})
