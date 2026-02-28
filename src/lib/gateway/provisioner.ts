/**
 * AgentProvisioner — deploys workspace files to disk, registers/deregisters
 * agents with the OpenClaw gateway, generates HEARTBEAT.md, and queues
 * registrations when the gateway is disconnected.
 *
 * Requirements: 4.1–4.6, 5.1–5.5, 14.1–14.4
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { GatewayClient } from './client'
import type { ProvisionResult, HeartbeatActionConfig } from './types'
import { generateAgentWorkspaces, generateOpenClawConfig } from '../memory/agent-workspace'

/** All known agent IDs that should be registered with the gateway */
const ALL_AGENT_IDS = [
  'octavious-orchestrator',
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
] as const

/** Workspace directory name for a given agent ID */
function workspaceDirForAgent(agentId: string): string {
  if (agentId === 'octavious-orchestrator') return 'workspace-octavious'
  // agent-lifeforce → workspace-octavious-lifeforce
  // specialist-research → workspace-octavious-research
  const suffix = agentId.replace(/^(agent|specialist)-/, '')
  return `workspace-octavious-${suffix}`
}

export class AgentProvisioner {
  /** Queued registration requests accumulated while gateway is disconnected */
  private registrationQueue: Array<{ agentId: string; workspacePath: string }> = []

  constructor(
    private client: GatewayClient,
    private db: Database.Database,
  ) {
    // Replay queued registrations on reconnect (Req 5.3, 5.4)
    this.client.on('gateway_reconnected', () => {
      void this.replayQueuedRegistrations()
    })
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Deploy all workspace files and register agents with the gateway.
   *
   * 1. Calls generateAgentWorkspaces() to write template files to disk
   *    (skips existing files to preserve user edits — Req 4.3).
   * 2. Writes the OpenClaw agent config to the base path.
   * 3. Registers each agent with the gateway (or queues if disconnected).
   */
  async provision(basePath?: string): Promise<ProvisionResult> {
    const result: ProvisionResult = {
      created: [],
      skipped: [],
      errors: [],
      registrations: [],
    }

    // Step 1: Generate workspace files (Req 4.1, 4.2, 4.3, 4.6)
    try {
      const { created, skipped } = await generateAgentWorkspaces(basePath)
      result.created.push(...created)
      result.skipped.push(...skipped)
    } catch (err) {
      result.errors.push({
        path: basePath ?? '~/.openclaw',
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Step 2: Write OpenClaw config (Req 4.5)
    try {
      const resolvedBase = basePath ?? this.getDefaultBasePath()
      await mkdir(resolvedBase, { recursive: true })
      const configPath = join(resolvedBase, 'openclaw-agents.json')
      const config = generateOpenClawConfig()
      if (existsSync(configPath)) {
        result.skipped.push(configPath)
      } else {
        await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
        result.created.push(configPath)
      }
    } catch (err) {
      result.errors.push({
        path: 'openclaw-agents.json',
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Step 3: Register agents (Req 5.1, 5.2, 5.3)
    const resolvedBase = basePath ?? this.getDefaultBasePath()
    for (const agentId of ALL_AGENT_IDS) {
      const workspacePath = join(resolvedBase, workspaceDirForAgent(agentId))
      try {
        await this.registerAgent(agentId, workspacePath)
        result.registrations.push({ agentId, status: 'registered' })
      } catch (err) {
        const isQueued = this.client.getStatus() !== 'connected'
        result.registrations.push({
          agentId,
          status: isQueued ? 'pending' : 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Persist registration statuses to SQLite (Req 5.2)
    this.persistRegistrations(result.registrations, resolvedBase)

    return result
  }

  /**
   * Register a single agent with the gateway.
   * If the gateway is disconnected, queues the registration for later replay.
   */
  async registerAgent(agentId: string, workspacePath: string): Promise<void> {
    if (this.client.getStatus() !== 'connected') {
      this.registrationQueue.push({ agentId, workspacePath })
      throw new Error(`Gateway disconnected — registration queued for ${agentId}`)
    }

    const res = await this.client.request('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, workspace_path: workspacePath }),
    })

    if (!res.ok) {
      throw new Error(`Registration failed for ${agentId}: HTTP ${res.status}`)
    }
  }

  /**
   * De-register an agent from the gateway (Req 5.5).
   */
  async deregisterAgent(agentId: string): Promise<void> {
    const res = await this.client.request(`/api/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      throw new Error(`Deregistration failed for ${agentId}: HTTP ${res.status}`)
    }

    // Remove from SQLite
    this.db
      .prepare('DELETE FROM agent_registrations WHERE agent_id = ?')
      .run(agentId)
  }

  /**
   * Verify all expected agents are registered; re-register missing ones (Req 5.4).
   */
  async verifyRegistrations(): Promise<void> {
    if (this.client.getStatus() !== 'connected') return

    const basePath = this.getDefaultBasePath()

    for (const agentId of ALL_AGENT_IDS) {
      const row = this.db
        .prepare('SELECT registration_status FROM agent_registrations WHERE agent_id = ?')
        .get(agentId) as { registration_status: string } | undefined

      if (!row || row.registration_status !== 'registered') {
        const workspacePath = join(basePath, workspaceDirForAgent(agentId))
        try {
          await this.registerAgent(agentId, workspacePath)
          this.upsertRegistration(agentId, workspacePath, 'registered')
        } catch {
          // Already queued or failed — leave current status
        }
      } else {
        // Update last_verified_at
        this.db
          .prepare('UPDATE agent_registrations SET last_verified_at = ? WHERE agent_id = ?')
          .run(new Date().toISOString(), agentId)
      }
    }
  }

  /**
   * Generate HEARTBEAT.md content from a list of heartbeat action configs (Req 14.1, 14.2, 14.4).
   */
  generateHeartbeatMd(actions: HeartbeatActionConfig[]): string {
    const enabledActions = actions.filter((a) => a.enabled)

    let md = '# Octavious Orchestrator Heartbeat\n\n'
    md += '## Actions\n\n'

    for (const action of enabledActions) {
      const queryString = Object.entries(action.queryParams)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&')

      md += `### ${action.name}\n`
      md += `**Description:** ${action.description}\n`
      md += `**Endpoint:** GET ${action.memoryApiEndpoint}${queryString ? `?${queryString}` : ''}\n`
      md += `**Condition:** ${action.conditionLogic}\n`
      md += `**Notification:** ${action.notificationTemplate}\n\n`
    }

    md += '## Instructions\n'
    md += 'When this heartbeat fires, execute each enabled action in order:\n'
    md += '1. Call the Memory Service endpoint for each action\n'
    md += '2. Evaluate the condition against the response\n'
    md += '3. If the condition is met, create a notification using the template\n'
    md += '4. Store findings as episodic memories in Daily_Notes with source_type=system_event\n'

    return md
  }

  /**
   * Write HEARTBEAT.md to the orchestrator workspace (Req 14.3).
   */
  async updateHeartbeatMd(actions: HeartbeatActionConfig[]): Promise<void> {
    const basePath = this.getDefaultBasePath()
    const heartbeatPath = join(basePath, 'workspace-octavious', 'HEARTBEAT.md')
    await mkdir(join(basePath, 'workspace-octavious'), { recursive: true })
    const content = this.generateHeartbeatMd(actions)
    await writeFile(heartbeatPath, content, 'utf-8')
  }

  /** Expose the registration queue length (useful for testing) */
  getQueueLength(): number {
    return this.registrationQueue.length
  }

  /** Expose queued items (useful for testing) */
  getQueuedRegistrations(): Array<{ agentId: string; workspacePath: string }> {
    return [...this.registrationQueue]
  }

  // ── Private helpers ─────────────────────────────────────────

  /** Resolve the default workspace base directory */
  private getDefaultBasePath(): string {
    return process.env.OPENCLAW_HOME ?? join(process.env.HOME ?? '~', '.openclaw')
  }

  /** Replay all queued registrations after reconnect */
  private async replayQueuedRegistrations(): Promise<void> {
    const queue = [...this.registrationQueue]
    this.registrationQueue = []

    for (const { agentId, workspacePath } of queue) {
      try {
        await this.registerAgent(agentId, workspacePath)
        this.upsertRegistration(agentId, workspacePath, 'registered')
      } catch {
        // Re-queue failed items (registerAgent will queue if still disconnected)
      }
    }
  }

  /** Persist registration results to SQLite */
  private persistRegistrations(
    registrations: ProvisionResult['registrations'],
    basePath: string,
  ): void {
    const upsert = this.db.prepare(`
      INSERT INTO agent_registrations (agent_id, workspace_path, registration_status, registered_at, error)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        registration_status = excluded.registration_status,
        registered_at = CASE WHEN excluded.registration_status = 'registered' THEN excluded.registered_at ELSE agent_registrations.registered_at END,
        error = excluded.error
    `)

    const now = new Date().toISOString()
    const tx = this.db.transaction(() => {
      for (const reg of registrations) {
        const workspacePath = join(basePath, workspaceDirForAgent(reg.agentId))
        upsert.run(
          reg.agentId,
          workspacePath,
          reg.status,
          reg.status === 'registered' ? now : null,
          reg.error ?? null,
        )
      }
    })
    tx()
  }

  /** Upsert a single agent registration in SQLite */
  private upsertRegistration(
    agentId: string,
    workspacePath: string,
    status: 'registered' | 'pending' | 'failed',
    error?: string,
  ): void {
    const now = new Date().toISOString()
    this.db
      .prepare(`
        INSERT INTO agent_registrations (agent_id, workspace_path, registration_status, registered_at, error)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET
          registration_status = excluded.registration_status,
          registered_at = CASE WHEN excluded.registration_status = 'registered' THEN excluded.registered_at ELSE agent_registrations.registered_at END,
          error = excluded.error
      `)
      .run(agentId, workspacePath, status, status === 'registered' ? now : null, error ?? null)
  }
}
