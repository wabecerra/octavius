/**
 * Property-based test: Scheduled Job SQLite Round-Trip
 *
 * Feature: openclaw-gateway-integration, Property 20: Scheduled Job SQLite Round-Trip
 * Validates: Requirements 10.5
 *
 * For any valid ScheduledAgentJob object, inserting it into the scheduled_agent_jobs
 * table and reading it back SHALL produce a deeply equal object (all fields preserved).
 */
import { describe, it, expect, afterEach } from 'vitest'
import fc from 'fast-check'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from '../memory/db'
import type { ScheduledAgentJob } from './types'

/**
 * Arbitrary for generating valid ScheduledAgentJob objects.
 * Uses uuid for id to satisfy PRIMARY KEY, and unique names via uuid suffix.
 * Cron expressions are simplified valid patterns.
 * Timestamps are ISO 8601 strings.
 */
const scheduledJobArb: fc.Arbitrary<ScheduledAgentJob> = fc.record({
  id: fc.uuid(),
  name: fc.uuid().map((u) => `job-${u}`),
  cronExpression: fc
    .tuple(
      fc.constantFrom('*', '0', '15', '30', '45'),
      fc.constantFrom('*', '0', '6', '12', '18', '23'),
      fc.constantFrom('*', '1', '15', '28'),
      fc.constantFrom('*', '1', '6', '12'),
      fc.constantFrom('*', '0', '3', '5'),
    )
    .map(([min, hr, dom, mon, dow]) => `${min} ${hr} ${dom} ${mon} ${dow}`),
  agentId: fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 1, maxLength: 40 })
    .map((chars) => chars.join('')),
  taskTemplate: fc.string({ minLength: 1, maxLength: 500 }),
  enabled: fc.boolean(),
  createdAt: fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2029-12-31T00:00:00Z') }).map((d) => d.toISOString()),
  updatedAt: fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2029-12-31T00:00:00Z') }).map((d) => d.toISOString()),
})

describe('Property 20: Scheduled Job SQLite Round-Trip', () => {
  let db: Database.Database

  afterEach(() => {
    if (db) closeDatabase(db)
  })

  it('inserting and reading back a ScheduledAgentJob preserves all fields', () => {
    fc.assert(
      fc.property(scheduledJobArb, (job) => {
        // Fresh in-memory DB per iteration to avoid unique constraint collisions
        db = getDatabase(':memory:')

        // INSERT
        db.prepare(
          `INSERT INTO scheduled_agent_jobs (id, name, cron_expression, agent_id, task_template, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(job.id, job.name, job.cronExpression, job.agentId, job.taskTemplate, job.enabled ? 1 : 0, job.createdAt, job.updatedAt)

        // SELECT back
        const row = db
          .prepare('SELECT * FROM scheduled_agent_jobs WHERE id = ?')
          .get(job.id) as {
          id: string
          name: string
          cron_expression: string
          agent_id: string
          task_template: string
          enabled: number
          created_at: string
          updated_at: string
        }

        // Map snake_case columns + integer boolean back to the ScheduledAgentJob shape
        const retrieved: ScheduledAgentJob = {
          id: row.id,
          name: row.name,
          cronExpression: row.cron_expression,
          agentId: row.agent_id,
          taskTemplate: row.task_template,
          enabled: row.enabled === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }

        expect(retrieved).toEqual(job)

        closeDatabase(db)
        // Prevent double-close in afterEach
        db = undefined as unknown as Database.Database
      }),
      { numRuns: 100 },
    )
  })
})
