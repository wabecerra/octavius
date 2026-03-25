'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { townEvents, type SeatStatus } from '@/lib/town/events'
import { useFleet, useFleetConfigSync } from '@/lib/town/use-fleet'
import { getFleetStore, type FleetAgent, type ActivityEntry } from '@/lib/town/fleet-store'

const PhaserGame = dynamic(() => import('@/components/town/game/PhaserGame'), { ssr: false })

// ── Constants ──

const QUADRANT_COLORS: Record<string, string> = {
  lifeforce: 'var(--quadrant-health)',
  industry: 'var(--quadrant-career)',
  fellowship: 'var(--quadrant-relationships)',
  essence: 'var(--quadrant-soul)',
}

const STATUS_DOT: Record<SeatStatus, { color: string; pulse: boolean; label: string }> = {
  empty: { color: 'var(--text-tertiary)', pulse: false, label: 'Idle' },
  running: { color: 'var(--color-success)', pulse: true, label: 'Working' },
  returning: { color: 'var(--color-warning)', pulse: true, label: 'Returning' },
  done: { color: 'var(--color-success)', pulse: false, label: 'Done' },
  failed: { color: 'var(--color-error)', pulse: false, label: 'Error' },
}

// ── Fleet Status Bar ──

function FleetBar({ agents, gatewayOk }: { agents: FleetAgent[]; gatewayOk: boolean }) {
  const active = agents.filter(a => a.status === 'running').length
  const generalists = agents.filter(a => a.role === 'generalist')
  const specialists = agents.filter(a => a.role === 'specialist')

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${gatewayOk ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
          {gatewayOk ? 'Gateway' : 'Offline'}
        </span>
      </div>
      <div className="w-px h-3" style={{ background: 'var(--border-primary)' }} />
      {generalists.map(a => {
        const dot = STATUS_DOT[a.status]
        return (
          <div key={a.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ background: a.status === 'running' ? `${QUADRANT_COLORS[a.quadrant!]}15` : 'transparent' }}>
            <span className="text-xs">{a.emoji}</span>
            <div className={`w-1.5 h-1.5 rounded-full ${dot.pulse ? 'animate-pulse' : ''}`}
              style={{ background: dot.color }} />
          </div>
        )
      })}
      <div className="w-px h-3" style={{ background: 'var(--border-primary)' }} />
      <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
        {specialists.filter(s => s.status === 'running').length}/{specialists.length} spec
      </span>
      <div className="flex-1" />
      <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
        {active} active
      </span>
    </div>
  )
}

// ── Agent Pill (HUD overlay) ──

function AgentPill({ agent }: { agent: FleetAgent }) {
  const dot = STATUS_DOT[agent.status]
  const color = agent.quadrant ? QUADRANT_COLORS[agent.quadrant] : 'var(--text-secondary)'
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono pointer-events-auto"
      style={{
        background: 'rgba(18, 20, 26, 0.85)', backdropFilter: 'blur(8px)', color,
        border: agent.status === 'running' ? `1px solid ${color}30` : '1px solid transparent',
      }}>
      <span>{agent.emoji}</span>
      <span>{agent.label}</span>
      <div className={`w-1.5 h-1.5 rounded-full ${dot.pulse ? 'animate-pulse' : ''}`} style={{ background: dot.color }} />
      {agent.currentTask && <span className="max-w-[120px] truncate opacity-70">— {agent.currentTask}</span>}
    </div>
  )
}

// ── Activity Panel ──

function ActivityPanel({ entries, visible, onClose }: { entries: ActivityEntry[]; visible: boolean; onClose: () => void }) {
  if (!visible) return null
  return (
    <div className="absolute right-3 top-14 bottom-14 w-72 rounded-xl border overflow-hidden pointer-events-auto"
      style={{ background: 'rgba(18, 20, 26, 0.92)', borderColor: 'var(--border-primary)', backdropFilter: 'blur(12px)', zIndex: 25 }}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>Activity</span>
        </div>
        <button onClick={onClose} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>✕</button>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 36px)' }}>
        {entries.length === 0 ? (
          <div className="px-3 py-8 text-center text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
            Agents standing by
          </div>
        ) : entries.map(e => (
          <div key={e.id} className="px-3 py-1.5 border-b flex items-start gap-1.5"
            style={{ borderColor: 'var(--border-secondary)' }}>
            <span className="text-[10px] font-mono shrink-0 mt-px" style={{ color: 'var(--text-tertiary)' }}>{e.ts.slice(11, 19)}</span>
            <span className="text-[10px]">{e.emoji}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Seat-to-agent mapping ──

const SEAT_TO_QUADRANT: Record<number, string> = { 0: 'lifeforce', 1: 'industry', 2: 'fellowship', 3: 'essence' }
const QUADRANT_TO_AGENT: Record<string, string> = {
  lifeforce: 'gen-lifeforce', industry: 'gen-industry', fellowship: 'gen-fellowship', essence: 'gen-essence',
}
// Room labels for display (matches NerveScene WORKER_HOME_ROOMS order)
const SEAT_TO_ROOM_LABEL: Record<number, string> = { 0: 'Vault', 1: 'Forge', 2: 'Dispatch', 3: 'Workshop' }

function resolveAgentForSeat(seatId: string, agents: FleetAgent[]): { agentId: string; quadrant: string } | null {
  // Direct match on agent id
  const direct = agents.find(a => a.id === seatId)
  if (direct) return { agentId: direct.id, quadrant: direct.quadrant ?? 'industry' }
  // Match on seatId field
  const bySeat = agents.find(a => a.seatId === seatId)
  if (bySeat) return { agentId: bySeat.id, quadrant: bySeat.quadrant ?? 'industry' }
  // Parse seat-N index
  const match = seatId.match(/seat-(\d+)/)
  if (match) {
    const idx = parseInt(match[1], 10)
    const q = SEAT_TO_QUADRANT[idx]
    if (q) return { agentId: QUADRANT_TO_AGENT[q], quadrant: q }
  }
  return null
}

// ── Task Assignment Modal ──

function TaskAssignModal({ seatId, agents, onClose }: { seatId: string; agents: FleetAgent[]; onClose: () => void }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolved = resolveAgentForSeat(seatId, agents)
  const agent = agents.find(a => a.id === (resolved?.agentId ?? seatId))

  const handleSubmit = async () => {
    if (!message.trim() || !resolved) return
    setSending(true)
    setError(null)

    try {
      // 1. Create the task in SQLite → shows on kanban board
      const taskRes = await fetch('/api/dashboard/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: message.trim().slice(0, 120),
          description: message.trim(),
          priority: 'medium',
          status: 'in-progress',
          quadrant: resolved.quadrant,
        }),
      })
      if (!taskRes.ok) throw new Error(`Failed to create task: ${taskRes.status}`)
      const task = await taskRes.json()

      // 2. Update fleet store with taskId (for kanban sync on complete/fail)
      const store = getFleetStore()
      store.assignTask(resolved.agentId, task.id, message.trim())

      // 3. Emit town event so the pixel worker starts animating
      townEvents.emit('task-assigned', seatId, message.trim())

      // 4. Close modal immediately — dispatch runs async
      townEvents.emit('terminal-closed')
      onClose()

      // 5. Dispatch to the agent
      try {
        const dispatchRes = await fetch('/api/agents/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id, agentId: resolved.agentId }),
        })
        if (dispatchRes.ok) {
          // Fleet store handles kanban PATCH to 'done'
          store.completeTask(resolved.agentId)
          townEvents.emit('task-completed', seatId)
        } else {
          // Fleet store handles kanban PATCH back to 'backlog'
          store.failTask(resolved.agentId)
          townEvents.emit('task-failed', seatId)
        }
      } catch {
        store.failTask(resolved.agentId)
        townEvents.emit('task-failed', seatId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign task')
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { townEvents.emit('terminal-closed'); onClose() }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto" style={{ zIndex: 35 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={() => { townEvents.emit('terminal-closed'); onClose() }} />
      <div className="relative rounded-xl border p-4 w-96 max-w-[90vw]"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', boxShadow: 'var(--shadow-xl)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{agent?.emoji ?? '⚡'}</span>
          <div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Assign task to {agent?.label ?? seatId}
            </span>
            {resolved && (
              <div className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                {resolved.agentId} · {resolved.quadrant} quadrant
              </div>
            )}
          </div>
        </div>
        <textarea autoFocus value={message} onChange={e => setMessage(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Describe the task..." rows={3}
          className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
          style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)', outline: 'none' }} />
        {error && (
          <div className="mt-2 text-xs px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)' }}>
            {error}
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>Enter to send · Esc to cancel</span>
          <button onClick={handleSubmit} disabled={!message.trim() || sending || !resolved}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {sending ? 'Sending...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main View ──

export function NerveCenterView() {
  // Read from persistent fleet store (survives tab switches)
  const { agents, activity } = useFleet()
  useFleetConfigSync()

  const [gatewayOk, setGatewayOk] = useState(false)
  const [gameReady, setGameReady] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [showFleet, setShowFleet] = useState(true)
  const [taskModalSeatId, setTaskModalSeatId] = useState<string | null>(null)

  // Gateway health polling
  useEffect(() => {
    const check = async () => {
      try { const r = await fetch('/api/gateway/health'); setGatewayOk(r.ok) } catch { setGatewayOk(false) }
    }
    check()
    const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
  }, [])

  // Game events (only the ones that need local UI state)
  useEffect(() => {
    const unsub1 = townEvents.on('seats-discovered', () => setGameReady(true))
    const unsub2 = townEvents.on('open-terminal', (seatId) => { if (seatId) setTaskModalSeatId(seatId) })
    return () => { unsub1(); unsub2() }
  }, [])

  const generalists = agents.filter(a => a.role === 'generalist')
  const specialists = agents.filter(a => a.role === 'specialist')

  return (
    <div className="space-y-3">
      <FleetBar agents={agents} gatewayOk={gatewayOk} />

      <div className="relative rounded-xl overflow-hidden border"
        style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', height: 'calc(100vh - 260px)', minHeight: '480px' }}>

        <div className="absolute inset-0"><PhaserGame /></div>

        {/* HUD overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
          <div className="flex items-center gap-1.5 p-2 flex-wrap">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono pointer-events-auto"
              style={{ background: 'rgba(18, 20, 26, 0.85)', color: 'var(--accent)', backdropFilter: 'blur(8px)' }}>
              ⚡ Octavius
            </div>
            {generalists.map(a => <AgentPill key={a.id} agent={a} />)}
            {specialists.filter(s => s.status === 'running').map(s => <AgentPill key={s.id} agent={s} />)}
          </div>

          <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-mono pointer-events-auto"
              style={{ background: 'rgba(18, 20, 26, 0.85)', color: 'var(--text-tertiary)', backdropFilter: 'blur(8px)' }}>
              <span>WASD move</span><span>•</span><span>E interact</span><span>•</span><span>Scroll zoom</span>
            </div>
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button onClick={() => setShowFleet(v => !v)}
                className="px-2.5 py-1 rounded-full text-[10px] font-mono transition-colors"
                style={{ background: showFleet ? 'rgba(255,92,92,0.2)' : 'rgba(18,20,26,0.85)', color: showFleet ? 'var(--accent)' : 'var(--text-tertiary)', backdropFilter: 'blur(8px)' }}>
                Fleet
              </button>
              <button onClick={() => setShowActivity(v => !v)}
                className="px-2.5 py-1 rounded-full text-[10px] font-mono transition-colors"
                style={{ background: showActivity ? 'rgba(255,92,92,0.2)' : 'rgba(18,20,26,0.85)', color: showActivity ? 'var(--accent)' : 'var(--text-tertiary)', backdropFilter: 'blur(8px)' }}>
                Activity {activity.length > 0 && `(${activity.length})`}
              </button>
            </div>
          </div>
        </div>

        <ActivityPanel entries={activity} visible={showActivity} onClose={() => setShowActivity(false)} />
        {taskModalSeatId && <TaskAssignModal seatId={taskModalSeatId} agents={agents} onClose={() => setTaskModalSeatId(null)} />}

        {!gameReady && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(18,20,26,0.95)', zIndex: 30 }}>
            <div className="text-center">
              <div className="text-3xl mb-2 animate-pulse">⚡</div>
              <div className="text-xs font-mono" style={{ color: 'var(--accent)' }}>Loading Nerve Center...</div>
            </div>
          </div>
        )}
      </div>

      {showFleet && (
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {agents.map(a => {
            const dot = STATUS_DOT[a.status]
            const color = a.quadrant ? QUADRANT_COLORS[a.quadrant] : 'var(--text-secondary)'
            return (
              <div key={a.id} className="rounded-lg border px-2.5 py-2 transition-all"
                style={{ background: a.status === 'running' ? `${color}08` : 'var(--bg-secondary)', borderColor: a.status === 'running' ? `${color}30` : 'var(--border-primary)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{a.emoji}</span>
                  <span className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={`w-1 h-1 rounded-full ${dot.pulse ? 'animate-pulse' : ''}`} style={{ background: dot.color }} />
                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{dot.label}</span>
                  {a.tasksCompleted > 0 && <span className="text-[9px] font-mono ml-auto" style={{ color: 'var(--text-tertiary)' }}>×{a.tasksCompleted}</span>}
                </div>
                {a.currentTask && <div className="text-[9px] font-mono mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>{a.currentTask}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
