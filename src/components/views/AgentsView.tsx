'use client'

import { useState, useEffect, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { routeTask } from '@/lib/model-router'
import { WorkspaceFilesEditor } from '@/components/WorkspaceFilesEditor'
import { HeartbeatConfigPanel } from '@/components/HeartbeatConfigPanel'
import { AgentModelSelector } from '@/components/AgentModelSelector'
import type { Agent, AgentTask, AgentTaskStatus, ModelTier } from '@/types'

// ─── Agent Model Config ───

interface AgentModelConfig {
  agentId: string
  provider: string
  model: string
}

// ─── Activity Log Entry ───

interface ActivityEntry {
  id: number
  taskId: string
  agentId: string
  action: string
  details: string
  model: string | null
  costUsd: number
  timestamp: string
}

// ─── Agent Card ───

const AGENT_ICONS: Record<string, string> = {
  'generalist-health': '💚',
  'generalist-career': '💼',
  'generalist-relationships': '🤝',
  'generalist-soul': '🧘',
  'specialist-research': '🔍',
  'specialist-engineering': '⚙️',
  'specialist-marketing': '📣',
  'specialist-video': '🎬',
  'specialist-image': '🖼️',
  'specialist-writing': '✍️',
}

const STATUS_COLORS: Record<Agent['status'], string> = {
  idle: 'bg-[var(--text-tertiary)]',
  running: 'bg-[var(--color-success)] animate-pulse',
  error: 'bg-[var(--color-error)]',
}

function AgentCardItem({
  agent,
  onSendTask,
  modelConfigs,
  onSaveModel,
}: {
  agent: Agent
  onSendTask: (agent: Agent) => void
  modelConfigs: AgentModelConfig[]
  onSaveModel: (agentId: string, provider: string, model: string) => void
}) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-3 transition-colors duration-150 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{AGENT_ICONS[agent.role] ?? '🤖'}</span>
          <h4 className="text-sm font-medium text-[var(--text-primary)]">{agent.name}</h4>
        </div>
        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status]}`} title={agent.status} />
      </div>
      <p className="text-xs text-[var(--text-tertiary)] capitalize">{agent.role.replace(/-/g, ' ')}</p>
      {agent.lastActivityAt && (
        <p className="text-[10px] text-[var(--text-disabled)]">
          Last active: {new Date(agent.lastActivityAt).toLocaleString()}
        </p>
      )}

      {/* Model selector */}
      <AgentModelSelector
        agentId={agent.id}
        configs={modelConfigs}
        onSave={onSaveModel}
      />

      <button
        type="button"
        onClick={() => onSendTask(agent)}
        className="w-full py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-xs font-medium"
      >
        Send Task
      </button>
    </div>
  )
}

// ─── Send Task Modal ───

function SendTaskModal({
  open,
  onOpenChange,
  targetAgent,
  onSendTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetAgent: Agent | null
  onSendTask: (task: AgentTask) => void
}) {
  const [description, setDescription] = useState('')
  const [complexity, setComplexity] = useState(5)
  const [sending, setSending] = useState(false)

  const [routerConfig] = useState({
    localModelName: 'llama3.2',
    tier1CloudModel: 'gpt-3.5-turbo',
    tier2Model: 'gpt-4',
    tier3Model: 'gpt-4o',
    researchProvider: 'perplexity',
    tierCostRates: { 1: 0.001, 2: 0.01, 3: 0.05 },
    dailyCostBudget: 2.0,
    localEndpoint: 'http://localhost:11434',
  })

  const handleSend = async () => {
    if (!targetAgent || !description.trim()) return
    setSending(true)

    const tier: ModelTier = complexity <= 4 ? 1 : complexity <= 7 ? 2 : 3
    const routing = routeTask(complexity, routerConfig, false)
    const task: AgentTask = {
      id: crypto.randomUUID(),
      agentId: targetAgent.id,
      description: description.trim(),
      complexityScore: complexity,
      tier,
      modelUsed: routing.model,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    onSendTask(task)
    onOpenChange(false)
    setDescription('')
    setComplexity(5)
    setSending(false)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: task.description, agentId: task.agentId }),
      })
      const data = await res.json()
      console.log('Task completed:', data)
    } catch (err) {
      console.error('Task failed:', err)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
            Send Task to {targetAgent?.name ?? 'Agent'}
          </Dialog.Title>
          <Dialog.Description className="sr-only">Dispatch a task to the selected agent</Dialog.Description>
          <div className="space-y-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task..."
              rows={3}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                Complexity: {complexity}/10
                <span className="ml-2 text-[var(--text-disabled)]">
                  (Tier {complexity <= 4 ? 1 : complexity <= 7 ? 2 : 3})
                </span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={complexity}
                onChange={(e) => setComplexity(Number(e.target.value))}
                className="w-full accent-[var(--accent)] h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-disabled)] mt-1">
                <span>Simple</span><span>Complex</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Dialog.Close asChild>
              <button type="button" className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150">
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !description.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium disabled:opacity-40"
            >
              {sending ? 'Sending...' : 'Send Task'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Task List with Sort Controls ───

type AgentTaskSortKey = 'status' | 'agentId' | 'createdAt' | 'complexityScore'

function AgentTaskList({ agentTasks, agents }: { agentTasks: AgentTask[], agents: Agent[] }) {
  const [sortBy, setSortBy] = useState<AgentTaskSortKey>('createdAt')
  const [sortAsc, setSortAsc] = useState(false)

  const agentMap = new Map(agents.map((a) => [a.id, a.name]))

  const sorted = [...agentTasks].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'status') cmp = a.status.localeCompare(b.status)
    else if (sortBy === 'agentId') cmp = (agentMap.get(a.agentId) ?? '').localeCompare(agentMap.get(b.agentId) ?? '')
    else if (sortBy === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt)
    else if (sortBy === 'complexityScore') cmp = a.complexityScore - b.complexityScore
    return sortAsc ? cmp : -cmp
  })

  const toggleSort = (key: AgentTaskSortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc)
    else { setSortBy(key); setSortAsc(true) }
  }

  const STATUS_BADGE: Record<AgentTaskStatus, string> = {
    pending: 'bg-[color-mix(in_srgb,var(--text-tertiary)_20%,transparent)] text-[var(--text-secondary)]',
    running: 'bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] text-[var(--color-info)]',
    complete: 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]',
    failed: 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)]',
    cancelled: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]',
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Task History</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No tasks dispatched yet</p>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {(['createdAt', 'status', 'agentId', 'complexityScore'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                className={`px-2.5 py-1 rounded text-xs border transition-colors duration-150 ${
                  sortBy === key ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {key === 'createdAt' ? 'Date' : key === 'agentId' ? 'Agent' : key === 'complexityScore' ? 'Complexity' : 'Status'}
                {sortBy === key && (sortAsc ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {sorted.map((task) => (
              <div key={task.id} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-[var(--text-primary)] truncate">{task.description}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${STATUS_BADGE[task.status]}`}>
                    {task.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                  <span>{agentMap.get(task.agentId) ?? task.agentId}</span>
                  <span>Tier {task.tier}</span>
                  <span>C:{task.complexityScore}</span>
                  <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                </div>
                {task.result && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{task.result}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Agent Activity Feed ───

function AgentActivityFeed() {
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/tasks/activity?limit=15')
      if (res.ok) {
        const data = await res.json()
        setActivities(data.activities ?? [])
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchActivities() }, [fetchActivities])

  const ACTION_ICONS: Record<string, string> = {
    started: '🚀',
    progressed: '⚡',
    completed: '✅',
    spawn_requested: '🔀',
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Agent Activity Feed</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Recent agent spawns, task progress, and KB interactions</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchActivities()}
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-tertiary)] text-center py-3">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No agent activity yet</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activities.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-secondary,var(--border-primary))]">
              <span className="text-sm mt-0.5">{ACTION_ICONS[a.action] || '🤖'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{a.agentId}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]">
                    {a.action}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{a.details}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-disabled)]">
                  <span>{timeAgo(a.timestamp)}</span>
                  {a.model && <span className="font-mono truncate">{a.model.split('/').pop()?.split('.').pop()}</span>}
                  {a.costUsd > 0 && <span>${a.costUsd.toFixed(4)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Agents View ───

export function AgentsView() {
  const [agents] = useState<Agent[]>([
    { id: 'gen-lifeforce', name: 'Lifeforce Agent', role: 'generalist-health', status: 'idle' },
    { id: 'gen-industry', name: 'Industry Agent', role: 'generalist-career', status: 'idle' },
    { id: 'gen-fellowship', name: 'Fellowship Agent', role: 'generalist-relationships', status: 'idle' },
    { id: 'gen-essence', name: 'Essence Agent', role: 'generalist-soul', status: 'idle' },
  ])
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([])
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [targetAgent, setTargetAgent] = useState<Agent | null>(null)
  const [modelConfigs, setModelConfigs] = useState<AgentModelConfig[]>([])

  const generalists = agents.filter((a) => a.role.startsWith('generalist-'))
  const specialists = agents.filter((a) => a.role.startsWith('specialist-'))

  // Fetch agent model configs
  const fetchModelConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/config')
      if (res.ok) {
        const data = await res.json()
        setModelConfigs(data.configs ?? [])
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => { void fetchModelConfigs() }, [fetchModelConfigs])

  const handleSaveModel = async (agentId: string, provider: string, model: string) => {
    try {
      const res = await fetch('/api/agents/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, provider, model }),
      })
      if (res.ok) {
        const updated = await res.json()
        setModelConfigs((prev) => {
          const filtered = prev.filter((c) => c.agentId !== agentId)
          return [...filtered, { agentId: updated.agentId, provider: updated.provider, model: updated.model }]
        })
      }
    } catch {
      // silent
    }
  }

  const openSendTask = (agent: Agent) => {
    setTargetAgent(agent)
    setSendModalOpen(true)
  }

  const handleSendTask = (task: AgentTask) => {
    setAgentTasks(prev => [task, ...prev])
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Agent Fleet Management</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          Orchestrator, generalists, and specialist agents powering your Life OS
        </p>
      </div>

      {/* Orchestrator */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-3 transition-colors duration-150 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Octavius Orchestrator</h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                Central coordinator — routes tasks to agents, runs heartbeat checks, manages the fleet
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
            <span className="text-xs text-[var(--color-success)]">Active</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="text-center">
            <p className="text-lg font-semibold text-[var(--text-primary)]">{agents.length}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Generalists</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-[var(--text-primary)]">{specialists.length || '—'}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Specialists</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-[var(--text-primary)]">{agentTasks.length}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Tasks Run</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-[var(--text-primary)]">4</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Quadrants</p>
          </div>
        </div>
      </div>

      {/* Heartbeat Configuration */}
      <HeartbeatConfigPanel />

      {/* Generalist Agents */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Generalist Agents</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">One per quadrant — handles general tasks in their domain</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {generalists.map((agent) => (
            <AgentCardItem
              key={agent.id}
              agent={agent}
              onSendTask={openSendTask}
              modelConfigs={modelConfigs}
              onSaveModel={handleSaveModel}
            />
          ))}
        </div>
      </div>

      {/* Specialist Agents */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Specialist Agents</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">Domain experts for focused tasks</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {specialists.map((agent) => (
            <AgentCardItem
              key={agent.id}
              agent={agent}
              onSendTask={openSendTask}
              modelConfigs={modelConfigs}
              onSaveModel={handleSaveModel}
            />
          ))}
        </div>
      </div>

      {/* Agent Activity Feed */}
      <AgentActivityFeed />

      {/* Agent Task List */}
      <AgentTaskList agentTasks={agentTasks} agents={agents} />

      {/* Workspace Files Editor */}
      <WorkspaceFilesEditor />

      {/* Send Task Modal */}
      <SendTaskModal
        open={sendModalOpen}
        onOpenChange={setSendModalOpen}
        targetAgent={targetAgent}
        onSendTask={handleSendTask}
      />
    </div>
  )
}
