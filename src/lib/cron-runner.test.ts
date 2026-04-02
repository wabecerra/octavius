import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAll = vi.fn()
const mockRun = vi.fn()
const mockGet = vi.fn()
const mockPrepare = vi.fn(() => ({ all: mockAll, run: mockRun, get: mockGet }))
vi.mock('./memory/db', () => ({
  getDatabase: () => ({ prepare: mockPrepare }),
}))

vi.mock('./model-catalog', () => ({
  refreshModelCatalog: vi.fn().mockResolvedValue({ updated: 0, errors: 0 }),
}))

const mockSchedule = vi.fn()
const mockValidate = vi.fn()
vi.mock('node-cron', () => ({
  default: {
    schedule: (...args: unknown[]) => {
      mockSchedule(...args)
      return { stop: vi.fn() }
    },
    validate: (...args: unknown[]) => mockValidate(...args),
  },
}))

// Number of built-in cron.schedule calls (stale task picker + model catalog refresh)
const BUILTIN_CRON_COUNT = 2

describe('cron-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidate.mockReturnValue(true)
  })

  it('startCronRunner loads enabled jobs and schedules them', async () => {
    mockAll.mockReturnValueOnce([
      { id: 'job-1', name: 'Daily Review', cron_expression: '0 9 * * *', agent_id: 'gen-industry', task_template: 'Review tasks', enabled: 1 },
      { id: 'job-2', name: 'Weekly Sync', cron_expression: '0 0 * * 1', agent_id: 'gen-essence', task_template: 'Weekly reflection', enabled: 1 },
    ])

    const { startCronRunner } = await import('./cron-runner')
    startCronRunner()

    // 2 non-system jobs + built-in crons
    expect(mockSchedule).toHaveBeenCalledTimes(2 + BUILTIN_CRON_COUNT)
    expect(mockSchedule).toHaveBeenCalledWith('5 * * * *', expect.any(Function))
    expect(mockSchedule).toHaveBeenCalledWith('0 3 * * *', expect.any(Function))
  })

  it('startCronRunner skips system agent jobs', async () => {
    mockAll.mockReturnValueOnce([
      { id: 'stale-task-recovery', name: 'Stale Task Recovery', cron_expression: '0 * * * *', agent_id: 'system', task_template: 'scan', enabled: 1 },
      { id: 'job-1', name: 'Daily Review', cron_expression: '0 9 * * *', agent_id: 'gen-industry', task_template: 'Review', enabled: 1 },
    ])

    const { startCronRunner } = await import('./cron-runner')
    startCronRunner()

    // 1 non-system job + built-in crons (system job skipped)
    expect(mockSchedule).toHaveBeenCalledTimes(1 + BUILTIN_CRON_COUNT)
  })

  it('startCronRunner handles empty job list', async () => {
    mockAll.mockReturnValueOnce([])

    const { startCronRunner } = await import('./cron-runner')
    startCronRunner()

    // Only built-in crons
    expect(mockSchedule).toHaveBeenCalledTimes(BUILTIN_CRON_COUNT)
    expect(mockSchedule).toHaveBeenCalledWith('5 * * * *', expect.any(Function))
  })

  it('skips jobs with invalid cron expressions', async () => {
    mockValidate.mockReturnValue(false)
    mockAll.mockReturnValueOnce([
      { id: 'job-bad', name: 'Bad Job', cron_expression: 'invalid', agent_id: 'gen-industry', task_template: 'test', enabled: 1 },
    ])

    const { startCronRunner } = await import('./cron-runner')
    startCronRunner()

    // Only built-in crons — bad job skipped due to invalid cron
    expect(mockSchedule).toHaveBeenCalledTimes(BUILTIN_CRON_COUNT)
  })

  it('reloadCronJobs stops existing and reloads', async () => {
    mockAll.mockReturnValueOnce([]) // initial load
    mockAll.mockReturnValueOnce([
      { id: 'job-new', name: 'New Job', cron_expression: '*/5 * * * *', agent_id: 'gen-lifeforce', task_template: 'check health', enabled: 1 },
    ]) // reload

    const { startCronRunner, reloadCronJobs } = await import('./cron-runner')
    startCronRunner()
    reloadCronJobs()

    // startCronRunner: BUILTIN_CRON_COUNT + reloadCronJobs: 1 (new job)
    expect(mockSchedule.mock.calls.length).toBeGreaterThanOrEqual(BUILTIN_CRON_COUNT + 1)
  })
})
