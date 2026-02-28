import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from './db'
import { JobScheduler } from './scheduler'

describe('JobScheduler', () => {
  let db: Database.Database
  let scheduler: JobScheduler

  beforeEach(() => {
    db = getDatabase(':memory:')
    scheduler = new JobScheduler(db)
  })

  afterEach(() => {
    scheduler.stop()
    closeDatabase(db)
  })

  describe('register', () => {
    it('registers a job without starting it', () => {
      scheduler.register('test-job', '0 2 * * *', async () => {})

      // Job is registered but no runs yet
      const lastRun = scheduler.getLastRun('test-job')
      expect(lastRun).toBeNull()
    })

    it('throws on duplicate job name', () => {
      scheduler.register('dup-job', '0 2 * * *', async () => {})
      expect(() => scheduler.register('dup-job', '0 3 * * *', async () => {})).toThrow(
        'Job already registered: dup-job',
      )
    })
  })

  describe('triggerManual', () => {
    it('executes the handler and logs a successful run', async () => {
      let called = false
      scheduler.register('manual-job', '0 2 * * *', async () => {
        called = true
      })

      const log = await scheduler.triggerManual('manual-job')

      expect(called).toBe(true)
      expect(log.job_name).toBe('manual-job')
      expect(log.success).toBe(true)
      expect(log.error).toBeUndefined()
      expect(log.started_at).toBeDefined()
      expect(log.completed_at).toBeDefined()
      expect(log.completed_at >= log.started_at).toBe(true)
    })

    it('logs a failed run when handler throws', async () => {
      scheduler.register('fail-job', '0 2 * * *', async () => {
        throw new Error('handler exploded')
      })

      const log = await scheduler.triggerManual('fail-job')

      expect(log.job_name).toBe('fail-job')
      expect(log.success).toBe(false)
      expect(log.error).toBe('handler exploded')
    })

    it('throws for unregistered job name', async () => {
      await expect(scheduler.triggerManual('nonexistent')).rejects.toThrow(
        'Job not registered: nonexistent',
      )
    })
  })

  describe('getLastRun', () => {
    it('returns null when job has never run', () => {
      expect(scheduler.getLastRun('never-ran')).toBeNull()
    })

    it('returns the most recent run log', async () => {
      let counter = 0
      scheduler.register('counter-job', '0 2 * * *', async () => {
        counter++
      })

      await scheduler.triggerManual('counter-job')
      await scheduler.triggerManual('counter-job')

      const lastRun = scheduler.getLastRun('counter-job')
      expect(lastRun).not.toBeNull()
      expect(lastRun!.job_name).toBe('counter-job')
      expect(lastRun!.success).toBe(true)
      expect(counter).toBe(2)
    })

    it('returns failed run when last run failed', async () => {
      let shouldFail = false
      scheduler.register('flaky-job', '0 2 * * *', async () => {
        if (shouldFail) throw new Error('flaky failure')
      })

      await scheduler.triggerManual('flaky-job') // success
      shouldFail = true
      await scheduler.triggerManual('flaky-job') // failure

      const lastRun = scheduler.getLastRun('flaky-job')
      expect(lastRun!.success).toBe(false)
      expect(lastRun!.error).toBe('flaky failure')
    })

    it('persists run logs to the job_runs table', async () => {
      scheduler.register('persist-job', '0 2 * * *', async () => {})
      await scheduler.triggerManual('persist-job')

      const row = db
        .prepare('SELECT * FROM job_runs WHERE job_name = ?')
        .get('persist-job') as Record<string, unknown>

      expect(row).toBeDefined()
      expect(row.job_name).toBe('persist-job')
      expect(row.success).toBe(1)
    })
  })

  describe('start / stop', () => {
    it('start and stop do not throw with registered jobs', () => {
      scheduler.register('cron-job', '* * * * *', async () => {})
      expect(() => scheduler.start()).not.toThrow()
      expect(() => scheduler.stop()).not.toThrow()
    })

    it('stop is idempotent', () => {
      scheduler.register('cron-job', '* * * * *', async () => {})
      scheduler.start()
      scheduler.stop()
      expect(() => scheduler.stop()).not.toThrow()
    })

    it('start is idempotent (does not double-schedule)', () => {
      scheduler.register('cron-job', '* * * * *', async () => {})
      scheduler.start()
      // Calling start again should not throw or create duplicate tasks
      expect(() => scheduler.start()).not.toThrow()
      scheduler.stop()
    })
  })
})
