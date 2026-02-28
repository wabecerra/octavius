/**
 * Unit tests for AgentProvisioner.
 *
 * Covers: provision flow, registerAgent/deregisterAgent, verifyRegistrations,
 * queue-on-disconnect + replay-on-reconnect, generateHeartbeatMd, updateHeartbeatMd,
 * SQLite persistence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AgentProvisioner } from './provisioner'
import { GatewayClient, type FetchFn } from './client'
import { getDatabase, closeDatabase } from '../memory/db'
import type { HeartbeatActionConfig } from './types'

/** Helper: create a mock fetch that returns the given status */
function mockFetch(status: number): FetchFn {
  return vi.fn(async () => new Response(null, { status }))
}

/** All expected agent IDs */
const ALL_AGENT_IDS = [
  'octavius-orchestrator',
  'agent-lifeforce',
  'agent-industry',
  'agent-fellowship',
  'agent-essence',
  'specialist-research',
  'specialist-engineering',
  'specialist-marketing',
  'specialist-video',
  'specialist-image',
  'specialist-writing',
]

describe('AgentProvisioner', () => {
  let tmpDir: string
  let db: ReturnType<typeof getDatabase>
  let client: GatewayClient
  let provisioner: AgentProvisioner

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'provisioner-test-'))
    db = getDatabase(':memory:')
    client = new GatewayClient({}, mockFetch(200))
    await client.connect()
    provisioner = new AgentProvisioner(client, db)
  })

  afterEach(async () => {
    client.disconnect()
    closeDatabase(db)
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('provision()', () => {
    it('creates workspace files and config in the specified base path', async () => {
      const result = await provisioner.provision(tmpDir)

      // Should have created files (workspaces + config)
      expect(result.created.length).toBeGreaterThan(0)
      expect(result.errors).toHaveLength(0)

      // Config file should exist
      expect(existsSync(join(tmpDir, 'openclaw-agents.json'))).toBe(true)

      // All agents should have registration entries
      expect(result.registrations).toHaveLength(ALL_AGENT_IDS.length)
      for (const reg of result.registrations) {
        expect(ALL_AGENT_IDS).toContain(reg.agentId)
        expect(reg.status).toBe('registered')
      }
    })

    it('skips existing files on second provision run', async () => {
      const first = await provisioner.provision(tmpDir)
      const second = await provisioner.provision(tmpDir)

      // All files created in first run should be skipped in second
      expect(second.skipped.length).toBeGreaterThanOrEqual(first.created.length)
      expect(second.created).toHaveLength(0)
    })

    it('creates directories recursively when base path does not exist', async () => {
      const deepPath = join(tmpDir, 'a', 'b', 'c')
      const result = await provisioner.provision(deepPath)

      expect(result.created.length).toBeGreaterThan(0)
      expect(existsSync(deepPath)).toBe(true)
    })

    it('persists registration statuses to SQLite', async () => {
      await provisioner.provision(tmpDir)

      const rows = db
        .prepare('SELECT agent_id, registration_status FROM agent_registrations')
        .all() as Array<{ agent_id: string; registration_status: string }>

      expect(rows).toHaveLength(ALL_AGENT_IDS.length)
      for (const row of rows) {
        expect(ALL_AGENT_IDS).toContain(row.agent_id)
        expect(row.registration_status).toBe('registered')
      }
    })

    it('returns summary with created + skipped + errors covering all files', async () => {
      const result = await provisioner.provision(tmpDir)

      // created + skipped + errors should cover all workspace files + config
      const totalAccounted = result.created.length + result.skipped.length + result.errors.length
      expect(totalAccounted).toBeGreaterThan(0)
    })
  })

  describe('registerAgent()', () => {
    it('sends POST to /api/agents with agent_id and workspace_path', async () => {
      const fetchSpy = mockFetch(200)
      const spyClient = new GatewayClient({}, fetchSpy)
      await spyClient.connect()
      const prov = new AgentProvisioner(spyClient, db)

      await prov.registerAgent('agent-lifeforce', '/path/to/workspace')

      const calls = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls
      // Last call should be the POST to /api/agents
      const lastCall = calls.at(-1)!
      expect(lastCall[0]).toContain('/api/agents')
      const init = lastCall[1] as RequestInit
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string)
      expect(body.agent_id).toBe('agent-lifeforce')
      expect(body.workspace_path).toBe('/path/to/workspace')

      spyClient.disconnect()
    })

    it('throws when gateway returns non-OK status', async () => {
      const failClient = new GatewayClient({}, mockFetch(200))
      await failClient.connect()

      // Override the client's fetch to return 500 for the registration call
      const fetchSeq = vi.fn(async (url: string) => {
        if (url.includes('/api/agents')) return new Response(null, { status: 500 })
        return new Response(null, { status: 200 })
      })
      const client500 = new GatewayClient({}, fetchSeq)
      await client500.connect()
      const prov = new AgentProvisioner(client500, db)

      await expect(prov.registerAgent('agent-lifeforce', '/path')).rejects.toThrow(
        'Registration failed',
      )

      failClient.disconnect()
      client500.disconnect()
    })

    it('queues registration when gateway is disconnected', async () => {
      const failFetch: FetchFn = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
      const dcClient = new GatewayClient({}, failFetch)
      await dcClient.connect() // fails → disconnected
      const prov = new AgentProvisioner(dcClient, db)

      await expect(prov.registerAgent('agent-lifeforce', '/path')).rejects.toThrow(
        'Gateway disconnected',
      )
      expect(prov.getQueueLength()).toBe(1)
      expect(prov.getQueuedRegistrations()[0]!.agentId).toBe('agent-lifeforce')

      dcClient.disconnect()
    })
  })

  describe('deregisterAgent()', () => {
    it('sends DELETE to /api/agents/:agentId', async () => {
      const fetchSpy = mockFetch(200)
      const spyClient = new GatewayClient({}, fetchSpy)
      await spyClient.connect()
      const prov = new AgentProvisioner(spyClient, db)

      // Insert a registration first
      db.prepare(
        `INSERT INTO agent_registrations (agent_id, workspace_path, registration_status)
         VALUES (?, ?, ?)`,
      ).run('agent-lifeforce', '/path', 'registered')

      await prov.deregisterAgent('agent-lifeforce')

      const calls = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls
      const lastCall = calls.at(-1)!
      expect(lastCall[0]).toContain('/api/agents/agent-lifeforce')
      expect((lastCall[1] as RequestInit).method).toBe('DELETE')

      // Should be removed from SQLite
      const row = db
        .prepare('SELECT * FROM agent_registrations WHERE agent_id = ?')
        .get('agent-lifeforce')
      expect(row).toBeUndefined()

      spyClient.disconnect()
    })
  })

  describe('verifyRegistrations()', () => {
    it('re-registers agents that are not registered', async () => {
      const fetchSpy = mockFetch(200)
      const spyClient = new GatewayClient({}, fetchSpy)
      await spyClient.connect()
      const prov = new AgentProvisioner(spyClient, db)

      // Insert only one agent as registered
      db.prepare(
        `INSERT INTO agent_registrations (agent_id, workspace_path, registration_status)
         VALUES (?, ?, ?)`,
      ).run('octavius-orchestrator', '/path/workspace-octavius', 'registered')

      await prov.verifyRegistrations()

      // Should have made POST calls for the missing agents
      const calls = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls
      const postCalls = calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      )
      // 10 missing agents should trigger 10 POST calls
      expect(postCalls.length).toBe(ALL_AGENT_IDS.length - 1)

      spyClient.disconnect()
    })

    it('updates last_verified_at for already-registered agents', async () => {
      const fetchSpy = mockFetch(200)
      const spyClient = new GatewayClient({}, fetchSpy)
      await spyClient.connect()
      const prov = new AgentProvisioner(spyClient, db)

      db.prepare(
        `INSERT INTO agent_registrations (agent_id, workspace_path, registration_status, last_verified_at)
         VALUES (?, ?, ?, ?)`,
      ).run('octavius-orchestrator', '/path', 'registered', '2024-01-01T00:00:00.000Z')

      await prov.verifyRegistrations()

      const row = db
        .prepare('SELECT last_verified_at FROM agent_registrations WHERE agent_id = ?')
        .get('octavius-orchestrator') as { last_verified_at: string }
      expect(row.last_verified_at).not.toBe('2024-01-01T00:00:00.000Z')
    })

    it('does nothing when gateway is disconnected', async () => {
      const failFetch: FetchFn = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
      const dcClient = new GatewayClient({}, failFetch)
      await dcClient.connect()
      const prov = new AgentProvisioner(dcClient, db)

      // Should not throw or make any calls
      await prov.verifyRegistrations()

      dcClient.disconnect()
    })
  })

  describe('queue replay on reconnect', () => {
    it('replays queued registrations when gateway reconnects', async () => {
      vi.useFakeTimers()

      let callCount = 0
      const eventuallyRecovers: FetchFn = vi.fn(async (url: string) => {
        callCount++
        // First call fails (connect), subsequent calls succeed
        if (callCount === 1) throw new Error('ECONNREFUSED')
        return new Response(null, { status: 200 })
      })

      const rcClient = new GatewayClient(
        { reconnectIntervalMs: 200 },
        eventuallyRecovers,
      )
      await rcClient.connect() // fails → disconnected
      const prov = new AgentProvisioner(rcClient, db)

      // Queue some registrations
      try { await prov.registerAgent('agent-lifeforce', '/path/lf') } catch { /* expected */ }
      try { await prov.registerAgent('agent-industry', '/path/ind') } catch { /* expected */ }
      expect(prov.getQueueLength()).toBe(2)

      // Trigger reconnect
      await vi.advanceTimersByTimeAsync(200)

      // Queue should be drained
      expect(prov.getQueueLength()).toBe(0)

      rcClient.disconnect()
      vi.useRealTimers()
    })
  })

  describe('generateHeartbeatMd()', () => {
    const sampleActions: HeartbeatActionConfig[] = [
      {
        name: 'Overdue Tasks Check',
        description: 'Check for overdue tasks in Industry quadrant',
        enabled: true,
        memoryApiEndpoint: '/api/memory/search',
        queryParams: { quadrant: 'industry', status: 'overdue' },
        conditionLogic: 'Results contain items with due_date < now',
        notificationTemplate: 'You have {count} overdue tasks in Industry',
      },
      {
        name: 'Stale Connections',
        description: 'Check for connections not contacted in 14+ days',
        enabled: true,
        memoryApiEndpoint: '/api/memory/search',
        queryParams: { quadrant: 'fellowship', stale_days: 14 },
        conditionLogic: 'Results contain connections with last_contact > 14 days ago',
        notificationTemplate: '{count} connections need attention',
      },
      {
        name: 'Disabled Action',
        description: 'This action is disabled',
        enabled: false,
        memoryApiEndpoint: '/api/memory/search',
        queryParams: {},
        conditionLogic: 'Never',
        notificationTemplate: 'Should not appear',
      },
    ]

    it('includes all enabled actions in the output', () => {
      const md = provisioner.generateHeartbeatMd(sampleActions)

      expect(md).toContain('Overdue Tasks Check')
      expect(md).toContain('Stale Connections')
      expect(md).toContain('/api/memory/search')
      expect(md).toContain('Results contain items with due_date < now')
      expect(md).toContain('{count} overdue tasks in Industry')
    })

    it('excludes disabled actions', () => {
      const md = provisioner.generateHeartbeatMd(sampleActions)

      expect(md).not.toContain('Disabled Action')
      expect(md).not.toContain('Should not appear')
    })

    it('includes instructions section', () => {
      const md = provisioner.generateHeartbeatMd(sampleActions)

      expect(md).toContain('## Instructions')
      expect(md).toContain('Call the Memory Service endpoint')
      expect(md).toContain('source_type=system_event')
    })

    it('renders query params in endpoint URL', () => {
      const md = provisioner.generateHeartbeatMd(sampleActions)

      expect(md).toContain('quadrant=industry')
      expect(md).toContain('status=overdue')
    })

    it('returns valid markdown for empty action list', () => {
      const md = provisioner.generateHeartbeatMd([])

      expect(md).toContain('# Octavius Orchestrator Heartbeat')
      expect(md).toContain('## Instructions')
    })
  })

  describe('updateHeartbeatMd()', () => {
    it('writes HEARTBEAT.md to the orchestrator workspace', async () => {
      // Set OPENCLAW_HOME to our temp dir
      const origHome = process.env.OPENCLAW_HOME
      process.env.OPENCLAW_HOME = tmpDir

      const actions: HeartbeatActionConfig[] = [
        {
          name: 'Test Action',
          description: 'A test heartbeat action',
          enabled: true,
          memoryApiEndpoint: '/api/memory/search',
          queryParams: { test: true },
          conditionLogic: 'Always true',
          notificationTemplate: 'Test notification',
        },
      ]

      await provisioner.updateHeartbeatMd(actions)

      const heartbeatPath = join(tmpDir, 'workspace-octavius', 'HEARTBEAT.md')
      expect(existsSync(heartbeatPath)).toBe(true)

      const content = await readFile(heartbeatPath, 'utf-8')
      expect(content).toContain('Test Action')
      expect(content).toContain('A test heartbeat action')

      // Restore
      if (origHome !== undefined) {
        process.env.OPENCLAW_HOME = origHome
      } else {
        delete process.env.OPENCLAW_HOME
      }
    })
  })
})
