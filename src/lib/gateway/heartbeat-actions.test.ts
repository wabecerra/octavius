/**
 * Unit tests for HeartbeatActionExecutor.
 *
 * Covers: executeAll, executeAction, CRUD operations, default actions,
 * gateway disconnected skip, notification + memory creation.
 *
 * Requirements: 9.1–9.6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from '../memory/db'
import { MemoryService } from '../memory/service'
import {
  HeartbeatActionExecutor,
  DEFAULT_HEARTBEAT_ACTIONS,
  type FetchFn,
} from './heartbeat-actions'
import type { HeartbeatActionConfig } from './types'
import type { GatewayClient } from './client'

/** Create a mock GatewayClient */
function mockClient(status: 'connected' | 'disconnected' = 'connected'): GatewayClient {
  return { getStatus: vi.fn(() => status) } as unknown as GatewayClient
}

/** Create a mock fetch that returns the given data */
function mockFetch(data: Record<string, unknown>, status = 200): FetchFn {
  return vi.fn(async () => new Response(JSON.stringify(data), { status }))
}

/** A sample enabled heartbeat action */
function sampleAction(overrides: Partial<HeartbeatActionConfig> = {}): HeartbeatActionConfig {
  return {
    name: 'test-action',
    description: 'Test heartbeat action',
    enabled: true,
    memoryApiEndpoint: '/api/memory/items',
    queryParams: { type: 'episodic', limit: 10 },
    conditionLogic: 'Items exist',
    notificationTemplate: 'Action needed: test items found.',
    ...overrides,
  }
}

describe('HeartbeatActionExecutor', () => {
  let db: Database.Database
  let memoryService: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    memoryService = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  describe('executeAll()', () => {
    it('returns empty array when gateway is disconnected (Req 9.6)', async () => {
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('disconnected'),
        memoryService,
        mockFetch({ items: [{ id: 1 }], total: 1 }),
      )

      const results = await executor.executeAll([sampleAction()])
      expect(results).toEqual([])
    })

    it('executes all enabled actions when connected', async () => {
      const fetchFn = mockFetch({ items: [{ id: 1 }], total: 1 })
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('connected'),
        memoryService,
        fetchFn,
      )

      const actions = [
        sampleAction({ name: 'action-1' }),
        sampleAction({ name: 'action-2' }),
        sampleAction({ name: 'disabled-action', enabled: false }),
      ]

      const results = await executor.executeAll(actions)

      // Only enabled actions should be executed
      expect(results).toHaveLength(2)
      expect(results[0]!.actionName).toBe('action-1')
      expect(results[1]!.actionName).toBe('action-2')
    })

    it('skips disabled actions', async () => {
      const fetchFn = mockFetch({ items: [], total: 0 })
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('connected'),
        memoryService,
        fetchFn,
      )

      const results = await executor.executeAll([
        sampleAction({ name: 'disabled', enabled: false }),
      ])

      expect(results).toHaveLength(0)
    })
  })

  describe('executeAction()', () => {
    it('queries Memory Service and triggers when items found', async () => {
      const fetchFn = mockFetch({ items: [{ id: 1 }], total: 1 })
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('connected'),
        memoryService,
        fetchFn,
      )

      const result = await executor.executeAction(sampleAction())

      expect(result.triggered).toBe(true)
      expect(result.notification).toBeDefined()
      expect(result.notification!.actionType).toBe('test-action')
      expect(result.notification!.suggestedNextStep).toContain('test items found')

      // Verify fetch was called with correct URL
      const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls
      expect(calls[0]![0]).toContain('/api/memory/items')
      expect(calls[0]![0]).toContain('type=episodic')
    })

    it('does not trigger when no items found', async () => {
      const fetchFn = mockFetch({ items: [], total: 0 })
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('connected'),
        memoryService,
        fetchFn,
      )

      const result = await executor.executeAction(sampleAction())

      expect(result.triggered).toBe(false)
      expect(result.notification).toBeUndefined()
    })

    it('stores episodic memory when action triggers (Req 9.4)', async () => {
      const fetchFn = mockFetch({ items: [{ id: 1 }], total: 1 })
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('connected'),
        memoryService,
        fetchFn,
      )

      await executor.executeAction(sampleAction())

      // Check that an episodic memory was created
      const memories = memoryService.list({
        type: 'episodic',
        tags: ['heartbeat-action'],
      })
      expect(memories.total).toBeGreaterThanOrEqual(1)
      const mem = memories.items[0]!
      expect(mem.layer).toBe('daily_notes')
      expect(mem.provenance.source_type).toBe('system_event')
      expect(mem.text).toContain('test-action')
    })

    it('stores notification in gateway_events (Req 9.3)', async () => {
      const fetchFn = mockFetch({ items: [{ id: 1 }], total: 1 })
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('connected'),
        memoryService,
        fetchFn,
      )

      await executor.executeAction(sampleAction())

      const events = db
        .prepare("SELECT * FROM gateway_events WHERE event_type = 'heartbeat_notification'")
        .all() as Array<{ details: string }>
      expect(events).toHaveLength(1)
      const details = JSON.parse(events[0]!.details)
      expect(details.actionType).toBe('test-action')
      expect(details.description).toBe('Test heartbeat action')
    })

    it('handles Memory Service errors gracefully', async () => {
      const failFetch: FetchFn = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('connected'),
        memoryService,
        failFetch,
      )

      const result = await executor.executeAction(sampleAction())

      expect(result.triggered).toBe(false)
      expect(result.error).toContain('ECONNREFUSED')
    })

    it('handles non-OK HTTP responses', async () => {
      const fetchFn = mockFetch({}, 500)
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient('connected'),
        memoryService,
        fetchFn,
      )

      const result = await executor.executeAction(sampleAction())

      expect(result.triggered).toBe(false)
      expect(result.error).toContain('HTTP 500')
    })
  })

  describe('CRUD operations (Req 9.5)', () => {
    it('saves and loads actions from SQLite', () => {
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient(),
        memoryService,
      )

      const action = sampleAction({ name: 'persist-me' })
      executor.saveAction(action)

      const loaded = executor.loadActions()
      expect(loaded).toHaveLength(1)
      expect(loaded[0]!.name).toBe('persist-me')
      expect(loaded[0]!.enabled).toBe(true)
      expect(loaded[0]!.memoryApiEndpoint).toBe('/api/memory/items')
      expect(loaded[0]!.queryParams).toEqual({ type: 'episodic', limit: 10 })
    })

    it('toggles action enabled state', () => {
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient(),
        memoryService,
      )

      executor.saveAction(sampleAction({ name: 'toggle-me' }))
      executor.toggleAction('toggle-me', false)

      const loaded = executor.loadActions()
      expect(loaded[0]!.enabled).toBe(false)

      executor.toggleAction('toggle-me', true)
      const reloaded = executor.loadActions()
      expect(reloaded[0]!.enabled).toBe(true)
    })

    it('deletes an action', () => {
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient(),
        memoryService,
      )

      executor.saveAction(sampleAction({ name: 'delete-me' }))
      expect(executor.deleteAction('delete-me')).toBe(true)
      expect(executor.loadActions()).toHaveLength(0)
    })

    it('returns false when deleting non-existent action', () => {
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient(),
        memoryService,
      )
      expect(executor.deleteAction('nonexistent')).toBe(false)
    })
  })

  describe('initializeDefaults()', () => {
    it('creates all four default heartbeat actions', () => {
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient(),
        memoryService,
      )

      executor.initializeDefaults()

      const actions = executor.loadActions()
      expect(actions).toHaveLength(4)

      const names = actions.map((a) => a.name).sort()
      expect(names).toEqual([
        'missed-wellness',
        'overdue-tasks',
        'stale-connections',
        'stalled-goals',
      ])
    })

    it('is idempotent — does not duplicate on second call', () => {
      const executor = new HeartbeatActionExecutor(
        db,
        mockClient(),
        memoryService,
      )

      executor.initializeDefaults()
      executor.initializeDefaults()

      const actions = executor.loadActions()
      expect(actions).toHaveLength(4)
    })
  })

  describe('DEFAULT_HEARTBEAT_ACTIONS', () => {
    it('contains all four required default actions (Req 9.2)', () => {
      expect(DEFAULT_HEARTBEAT_ACTIONS).toHaveLength(4)

      const names = DEFAULT_HEARTBEAT_ACTIONS.map((a) => a.name)
      expect(names).toContain('overdue-tasks')
      expect(names).toContain('stale-connections')
      expect(names).toContain('missed-wellness')
      expect(names).toContain('stalled-goals')
    })

    it('all default actions are enabled', () => {
      for (const action of DEFAULT_HEARTBEAT_ACTIONS) {
        expect(action.enabled).toBe(true)
      }
    })

    it('all default actions have required fields', () => {
      for (const action of DEFAULT_HEARTBEAT_ACTIONS) {
        expect(action.name).toBeTruthy()
        expect(action.description).toBeTruthy()
        expect(action.memoryApiEndpoint).toBeTruthy()
        expect(action.conditionLogic).toBeTruthy()
        expect(action.notificationTemplate).toBeTruthy()
      }
    })
  })
})
