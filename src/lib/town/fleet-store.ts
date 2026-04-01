/**
 * Fleet Store — persistent agent state that survives tab switches.
 *
 * Uses sessionStorage so state persists within a browser session
 * but resets on restart (matching the "only reset on fresh start" requirement).
 *
 * The store is a singleton module — all components share the same instance.
 */

import type { QuadrantId } from '@/lib/memory/models'
import type { SeatStatus } from './events'
import { townEvents } from './events'
import type { FleetAgentState } from '@/lib/gateway/bridge-events'

// ── Types ──

export interface FleetAgent {
  id: string
  role: 'orchestrator' | 'generalist' | 'specialist'
  quadrant?: QuadrantId
  label: string
  emoji: string
  status: SeatStatus
  currentTask?: string
  currentTaskId?: string
  model?: string
  seatId?: string
  tasksCompleted: number
  lastActivityAt?: string
}

export interface ActivityEntry {
  id: string
  ts: string
  agentId: string
  emoji: string
  message: string
  type: 'dispatch' | 'spawn' | 'complete' | 'fail' | 'delegate' | 'status'
}

export interface FleetSnapshot {
  agents: FleetAgent[]
  activity: ActivityEntry[]
}

// ── Agent templates ──

interface AgentTemplate {
  type: string
  icon: string
  room: string
  maxInstances: number
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  { type: 'specialist-architect', icon: '📐', room: 'command-center', maxInstances: 4 },
  { type: 'specialist-coder', icon: '💻', room: 'workshop', maxInstances: 4 },
  { type: 'specialist-research', icon: '🔬', room: 'library', maxInstances: 4 },
  { type: 'specialist-marketing', icon: '📣', room: 'outpost', maxInstances: 4 },
  { type: 'specialist-writing', icon: '✍️', room: 'library', maxInstances: 4 },
  { type: 'specialist-video', icon: '🎬', room: 'workshop', maxInstances: 4 },
  { type: 'specialist-image', icon: '🎨', room: 'workshop', maxInstances: 4 },
  { type: 'specialist-n8n', icon: '⚡', room: 'workshop', maxInstances: 4 },
]

// ── Default fleet ──

const DEFAULT_AGENTS: FleetAgent[] = [
  { id: 'gen-lifeforce', role: 'generalist', quadrant: 'lifeforce', label: 'Lifeforce', emoji: '💚', status: 'empty', tasksCompleted: 0 },
  { id: 'gen-industry', role: 'generalist', quadrant: 'industry', label: 'Industry', emoji: '💼', status: 'empty', tasksCompleted: 0 },
  { id: 'gen-fellowship', role: 'generalist', quadrant: 'fellowship', label: 'Fellowship', emoji: '🤝', status: 'empty', tasksCompleted: 0 },
  { id: 'gen-essence', role: 'generalist', quadrant: 'essence', label: 'Essence', emoji: '🧘', status: 'empty', tasksCompleted: 0 },
  { id: 'specialist-architect', role: 'specialist', label: 'Architect', emoji: '📐', status: 'empty', tasksCompleted: 0 },
  { id: 'specialist-coder', role: 'specialist', label: 'Coder', emoji: '💻', status: 'empty', tasksCompleted: 0 },
  { id: 'specialist-research', role: 'specialist', label: 'Research', emoji: '🔍', status: 'empty', tasksCompleted: 0 },
  { id: 'specialist-engineering', role: 'specialist', label: 'Engineering', emoji: '⚙️', status: 'empty', tasksCompleted: 0 },
  { id: 'specialist-marketing', role: 'specialist', label: 'Marketing', emoji: '📣', status: 'empty', tasksCompleted: 0 },
  { id: 'specialist-video', role: 'specialist', label: 'Video', emoji: '🎬', status: 'empty', tasksCompleted: 0 },
  { id: 'specialist-image', role: 'specialist', label: 'Image', emoji: '🖼️', status: 'empty', tasksCompleted: 0 },
  { id: 'specialist-writing', role: 'specialist', label: 'Writing', emoji: '✍️', status: 'empty', tasksCompleted: 0 },
]

// Seat index → agent ID mapping (tilemap spawns are seat-0, seat-1, etc.)
const SEAT_INDEX_TO_AGENT: Record<number, string> = {
  0: 'gen-lifeforce', 1: 'gen-industry', 2: 'gen-fellowship', 3: 'gen-essence',
}

const STORAGE_KEY = 'octavius-fleet-state'
const MAX_ACTIVITY = 200

// ── Resolve seatId to agent ID ──

function resolveAgentId(seatId: string, agents: FleetAgent[]): string {
  // Direct match
  if (agents.some(a => a.id === seatId)) return seatId
  // Match on seatId field
  const bySeat = agents.find(a => a.seatId === seatId)
  if (bySeat) return bySeat.id
  // Parse seat-N
  const match = seatId.match(/seat-(\d+)/)
  if (match) {
    const mapped = SEAT_INDEX_TO_AGENT[parseInt(match[1], 10)]
    if (mapped) return mapped
  }
  return seatId
}

// ── Persistence ──

function loadSnapshot(): FleetSnapshot {
  if (typeof window === 'undefined') return { agents: DEFAULT_AGENTS, activity: [] }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { agents: DEFAULT_AGENTS, activity: [] }
    const parsed = JSON.parse(raw) as FleetSnapshot
    const agentMap = new Map(parsed.agents.map(a => [a.id, a]))
    const merged = DEFAULT_AGENTS.map(def => {
      const saved = agentMap.get(def.id)
      return saved ? { ...def, ...saved } : def
    })
    return { agents: merged, activity: parsed.activity ?? [] }
  } catch {
    return { agents: DEFAULT_AGENTS, activity: [] }
  }
}

function saveSnapshot(snapshot: FleetSnapshot) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...snapshot, activity: snapshot.activity.slice(0, 50),
      }))
    } catch { /* give up */ }
  }
}

// ── Singleton store ──

type Listener = () => void

class FleetStore {
  private snapshot: FleetSnapshot
  private listeners = new Set<Listener>()
  private eventCleanups: Array<() => void> = []

  constructor() {
    this.snapshot = loadSnapshot()
    this.wireEvents()
  }

  getSnapshot(): FleetSnapshot {
    return this.snapshot
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  updateAgentModel(agentId: string, model: string) {
    this.updateAgent(agentId, { model })
  }

  /** Mark an agent as working on a specific task */
  assignTask(agentId: string, taskId: string, message: string) {
    this.updateAgent(agentId, {
      status: 'running',
      currentTask: message.slice(0, 60),
      currentTaskId: taskId,
      lastActivityAt: new Date().toISOString(),
    })
    this.addActivity(agentId, `Started: ${message.slice(0, 80)}`, 'dispatch')
  }

  /** Mark task complete and update the kanban board */
  async completeTask(agentId: string) {
    const agent = this.snapshot.agents.find(a => a.id === agentId)
    const taskId = agent?.currentTaskId

    this.updateAgent(agentId, {
      status: 'done',
      currentTask: undefined,
      currentTaskId: undefined,
      tasksCompleted: (agent?.tasksCompleted ?? 0) + 1,
      lastActivityAt: new Date().toISOString(),
    })
    this.addActivity(agentId, 'Task completed', 'complete')

    // Update the kanban board
    if (taskId) {
      try {
        await fetch('/api/dashboard/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [taskId], updates: { status: 'done', completed: true } }),
        })
      } catch { /* non-fatal */ }
    }

    // Auto-reset to idle after 4s (matches the game worker behavior)
    setTimeout(() => {
      const current = this.snapshot.agents.find(a => a.id === agentId)
      if (current?.status === 'done') {
        this.updateAgent(agentId, { status: 'empty' })
      }
    }, 4000)
  }

  /** Mark task failed and revert the kanban board */
  async failTask(agentId: string) {
    const agent = this.snapshot.agents.find(a => a.id === agentId)
    const taskId = agent?.currentTaskId

    this.updateAgent(agentId, {
      status: 'failed',
      currentTask: undefined,
      currentTaskId: undefined,
      lastActivityAt: new Date().toISOString(),
    })
    this.addActivity(agentId, 'Task failed', 'fail')

    // Revert task to backlog so it's not stuck in-progress
    if (taskId) {
      try {
        await fetch('/api/dashboard/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [taskId], updates: { status: 'backlog' } }),
        })
      } catch { /* non-fatal */ }
    }

    // Auto-reset to idle after 4s
    setTimeout(() => {
      const current = this.snapshot.agents.find(a => a.id === agentId)
      if (current?.status === 'failed') {
        this.updateAgent(agentId, { status: 'empty' })
      }
    }, 4000)
  }

  /** Add activity from backend polling (used by useFleetActivitySync) */
  addBackendActivity(
    id: string,
    agentId: string,
    emoji: string,
    message: string,
    type: ActivityEntry['type'],
    timestamp: string,
  ) {
    // Don't duplicate
    if (this.snapshot.activity.some(a => a.id === id)) return
    this.snapshot = {
      ...this.snapshot,
      activity: [{
        id,
        ts: timestamp,
        agentId,
        emoji,
        message,
        type,
      }, ...this.snapshot.activity].slice(0, MAX_ACTIVITY),
    }
    this.persist()
    this.notify()
  }

  /** Sync server-authoritative agent state from the gateway bridge */
  applyServerState(serverAgents: FleetAgentState[]): void {
    // Update existing agents' status from server
    for (const sa of serverAgents) {
      const existing = this.snapshot.agents.find(a => a.id === sa.id)
      if (existing) {
        // Map 'idle' to 'empty' for compatibility with SeatStatus
        const status = sa.status === 'idle' ? 'empty' : sa.status
        existing.status = status as SeatStatus
        existing.currentTask = sa.currentTask
        existing.currentTaskId = sa.currentTaskId
      } else if (sa.id.startsWith('specialist-')) {
        // Dynamic specialist instance — add it
        const typeName = sa.id.split(':')[0]
        const template = AGENT_TEMPLATES.find(t => t.type === typeName)
        if (template) {
          const status = sa.status === 'idle' ? 'empty' : sa.status
          this.snapshot.agents.push({
            id: sa.id,
            role: 'specialist',
            label: sa.id,
            emoji: template.icon,
            status: status as SeatStatus,
            currentTask: sa.currentTask,
            currentTaskId: sa.currentTaskId,
            tasksCompleted: 0,
            lastActivityAt: sa.spawnedAt,
          })
        }
      }
    }
    // Remove specialist instances not in server state
    const serverIds = new Set(serverAgents.map(a => a.id))
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.filter(a =>
        a.role !== 'specialist' || serverIds.has(a.id)
      ),
    }
    this.persist()
    this.notify()
  }

  // ── Internal ──

  private updateAgent(agentId: string, patch: Partial<FleetAgent>) {
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map(a => a.id === agentId ? { ...a, ...patch } : a),
    }
    this.persist()
    this.notify()
  }

  private addActivity(agentId: string, message: string, type: ActivityEntry['type']) {
    const agent = this.snapshot.agents.find(a => a.id === agentId)
    this.snapshot = {
      ...this.snapshot,
      activity: [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        ts: new Date().toISOString(),
        agentId,
        emoji: agent?.emoji ?? '🤖',
        message,
        type,
      }, ...this.snapshot.activity].slice(0, MAX_ACTIVITY),
    }
    this.persist()
    this.notify()
  }

  private persist() { saveSnapshot(this.snapshot) }
  private notify() { this.listeners.forEach(fn => fn()) }

  private wireEvents() {
    this.eventCleanups.forEach(fn => fn())
    this.eventCleanups = []

    this.eventCleanups.push(
      townEvents.on('task-assigned', (seatId, message) => {
        const agentId = resolveAgentId(seatId, this.snapshot.agents)
        this.assignTask(agentId, '', message)
      }),

      townEvents.on('task-completed', (seatId) => {
        const agentId = resolveAgentId(seatId, this.snapshot.agents)
        this.completeTask(agentId)
      }),

      townEvents.on('task-failed', (seatId) => {
        const agentId = resolveAgentId(seatId, this.snapshot.agents)
        this.failTask(agentId)
      }),

      townEvents.on('task-bubble', (seatId, text) => {
        const agentId = resolveAgentId(seatId, this.snapshot.agents)
        this.addActivity(agentId, text, 'status')
      }),

      townEvents.on('agent-status', (seatId, status) => {
        const agentId = resolveAgentId(seatId, this.snapshot.agents)
        this.updateAgent(agentId, { status, lastActivityAt: new Date().toISOString() })
      }),
    )
  }
}

let _store: FleetStore | null = null

export function getFleetStore(): FleetStore {
  if (!_store) _store = new FleetStore()
  return _store
}
