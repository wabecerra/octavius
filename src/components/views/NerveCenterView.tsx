'use client'

import { useEffect, useState, useCallback } from 'react'
import { townEvents, type SeatStatus } from '@/lib/town/events'
import { useFleet, useFleetConfigSync, useFleetActivitySync } from '@/lib/town/use-fleet'
import { useFleetSSE } from '@/lib/town/use-fleet-sse'
import { getFleetStore, type FleetAgent } from '@/lib/town/fleet-store'

// ── Constants ──

const QUADRANT_COLORS: Record<string, string> = {
  lifeforce: '#34d399',
  industry: '#60a5fa',
  fellowship: '#f87171',
  essence: '#c084fc',
}

const STATUS_CONFIG: Record<SeatStatus, { color: string; pulse: boolean; label: string }> = {
  empty: { color: '#6b7280', pulse: false, label: 'Idle' },
  running: { color: '#22c55e', pulse: true, label: 'Working' },
  returning: { color: '#f59e0b', pulse: true, label: 'Returning' },
  done: { color: '#22c55e', pulse: false, label: 'Done' },
  failed: { color: '#ef4444', pulse: false, label: 'Error' },
}

// ── Room definitions ──

interface Room {
  id: string
  label: string
  icon: string
  row: number
  col: number
  colSpan?: number
  rowSpan?: number
  color: string
  agents: string[]
  specialistTypes?: string[]
}

const ROOMS: Room[] = [
  { id: 'hub', label: 'Command Hub', icon: '⚡', row: 1, col: 1, colSpan: 2, color: '#ff5c5c', agents: [] },
  { id: 'vault', label: 'Memory Vault', icon: '🧠', row: 0, col: 0, color: '#34d399', agents: ['gen-lifeforce'] },
  { id: 'forge', label: 'Task Forge', icon: '🔨', row: 0, col: 1, color: '#60a5fa', agents: ['gen-industry'], specialistTypes: ['specialist-architect', 'specialist-coder'] },
  { id: 'library', label: 'Writing Room', icon: '✍️', row: 0, col: 2, color: '#a78bfa', agents: [], specialistTypes: ['specialist-writing', 'specialist-marketing'] },
  { id: 'lab', label: 'Research Lab', icon: '🔬', row: 0, col: 3, color: '#818cf8', agents: [], specialistTypes: ['specialist-research'] },
  { id: 'dispatch', label: 'Dispatch Bay', icon: '📡', row: 1, col: 0, color: '#f87171', agents: ['gen-fellowship'] },
  { id: 'engine', label: 'Engine Room', icon: '⚙️', row: 1, col: 3, color: '#fb923c', agents: [], specialistTypes: ['specialist-engineering'] },
  { id: 'workshop', label: 'Soul Workshop', icon: '🧘', row: 2, col: 0, color: '#c084fc', agents: ['gen-essence'] },
  { id: 'studio', label: 'Media Studio', icon: '🎬', row: 2, col: 1, colSpan: 2, color: '#f472b6', agents: [], specialistTypes: ['specialist-video', 'specialist-image', 'specialist-n8n'] },
  { id: 'breakroom', label: 'Break Room', icon: '☕', row: 2, col: 3, color: '#a3a3a3', agents: [] },
]

// ── Stats Bar ──

function StatsBar({ agents }: { agents: Array<{ status: string }> }) {
  const active = agents.filter(a => a.status === 'running').length
  const idle = agents.filter(a => a.status === 'idle' || a.status === 'empty').length
  const done = agents.filter(a => a.status === 'done').length
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '8px 16px',
      fontSize: 13, opacity: 0.85, borderBottom: '1px solid var(--border-primary, #333)',
    }}>
      <span style={{ color: 'var(--color-success, #34d399)' }}>{active} active</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span style={{ opacity: 0.6 }}>{idle} idle</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span style={{ opacity: 0.6 }}>{done} completed</span>
    </div>
  )
}

// ── Task Assignment Modal ──

function TaskAssignModal({ agentId, agents, onClose }: { agentId: string; agents: FleetAgent[]; onClose: () => void }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const agent = agents.find(a => a.id === agentId)

  const handleSubmit = async () => {
    if (!message.trim() || !agent) return
    setSending(true)
    setError(null)

    try {
      const taskRes = await fetch('/api/dashboard/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: message.trim().slice(0, 120),
          description: message.trim(),
          priority: 'medium',
          status: 'in-progress',
          quadrant: agent.quadrant,
        }),
      })
      if (!taskRes.ok) throw new Error(`Failed to create task: ${taskRes.status}`)
      const task = await taskRes.json()

      const store = getFleetStore()
      store.assignTask(agentId, task.id, message.trim())
      townEvents.emit('task-assigned', agentId, message.trim())
      onClose()

      try {
        const dispatchRes = await fetch('/api/agents/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id, agentId }),
        })
        if (dispatchRes.ok) {
          store.completeTask(agentId)
          townEvents.emit('task-completed', agentId)
        } else {
          store.failTask(agentId)
          townEvents.emit('task-failed', agentId)
        }
      } catch {
        store.failTask(agentId)
        townEvents.emit('task-failed', agentId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign task')
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') onClose()
  }

  if (!agent) return null
  const qColor = agent.quadrant ? QUADRANT_COLORS[agent.quadrant] : 'var(--accent)'

  return (
    <div className="nc-modal-overlay" onClick={onClose}>
      <div className="nc-modal" onClick={e => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div className="nc-modal-emoji">{agent.emoji}</div>
          <div>
            <div className="nc-modal-title">Assign task to <strong>{agent.label}</strong></div>
            <div className="nc-modal-sub"><code>{agentId}</code></div>
          </div>
        </div>
        <textarea
          autoFocus
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the task..."
          rows={3}
          className="nc-modal-input"
        />
        {error && <div className="nc-modal-error">{error}</div>}
        <div className="nc-modal-foot">
          <span className="nc-hint"><kbd>Enter</kbd> to send</span>
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || sending}
            className="nc-modal-btn"
            style={{ background: qColor }}
          >
            {sending ? 'Dispatching...' : 'Assign Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main View ──

export function NerveCenterView() {
  const { agents, activity } = useFleet()
  useFleetConfigSync()
  useFleetActivitySync()
  useFleetSSE() // Subscribe to real-time agent events via SSE

  const [gatewayOk, setGatewayOk] = useState(false)
  const [taskModalAgent, setTaskModalAgent] = useState<string | null>(null)

  useEffect(() => {
    const check = async () => {
      try { const r = await fetch('/api/gateway/health'); setGatewayOk(r.ok) } catch { setGatewayOk(false) }
    }
    check()
    const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
  }, [])

  const openTerminal = useCallback((agentId: string) => {
    setTaskModalAgent(agentId)
  }, [])

  const active = agents.filter(a => a.status === 'running').length
  const completed = agents.reduce((sum, a) => sum + a.tasksCompleted, 0)

  return (
    <div className="nc-root">
      {/* ── Stats Bar ── */}
      <StatsBar agents={agents} />

      {/* ── Layout: Map + Sidebar ── */}
      <div className="nc-layout">
        {/* ── Room Map ── */}
        <div className="nc-map">
          <div className="nc-map-grid">
            {ROOMS.map(room => {
              const roomAgents = agents.filter(a => {
                // Match explicit agent IDs
                if (room.agents.includes(a.id)) return true
                // Match specialist types dynamically
                if (a.role === 'specialist' && room.specialistTypes) {
                  const specialistType = a.id.split(':')[0]
                  return room.specialistTypes.includes(specialistType)
                }
                return false
              })
              const anyRunning = roomAgents.some(a => a.status === 'running')
              return (
                <div
                  key={room.id}
                  className={`nc-room ${anyRunning ? 'nc-room-active' : ''}`}
                  style={{
                    gridRow: `${room.row + 1} / span ${room.rowSpan || 1}`,
                    gridColumn: `${room.col + 1} / span ${room.colSpan || 1}`,
                    '--rc': room.color,
                  } as React.CSSProperties}
                >
                  <div className="nc-room-head">
                    <span className="nc-room-icon">{room.icon}</span>
                    <span className="nc-room-name">{room.label}</span>
                    {anyRunning && <span className="nc-room-pulse" />}
                  </div>
                  <div className="nc-room-agents">
                    {roomAgents.map(agent => {
                      const cfg = STATUS_CONFIG[agent.status]
                      return (
                        <button
                          key={agent.id}
                          className="nc-agent"
                          onClick={() => openTerminal(agent.id)}
                          title={agent.currentTask || cfg.label}
                        >
                          <span className="nc-agent-emoji">{agent.emoji}</span>
                          <span className="nc-agent-label">{agent.label}</span>
                          <span
                            className={`nc-dot ${cfg.pulse ? 'nc-dot-pulse' : ''}`}
                            style={{ background: cfg.color }}
                          />
                          {agent.currentTask && (
                            <span className="nc-agent-task">{agent.currentTask}</span>
                          )}
                        </button>
                      )
                    })}
                    {roomAgents.length === 0 && room.id !== 'hub' && room.id !== 'breakroom' && (
                      <div className="nc-room-standby">standby</div>
                    )}
                    {room.id === 'hub' && (
                      <div className="nc-hub-status">
                        <div className="nc-hub-line">
                          <span className={`nc-dot ${gatewayOk ? 'nc-dot-ok' : 'nc-dot-err'}`} />
                          <span>{gatewayOk ? 'Gateway Online' : 'Gateway Offline'}</span>
                        </div>
                        <div className="nc-hub-line">
                          <span className="nc-hub-num">{active}</span>/{agents.length} agents active
                        </div>
                        <div className="nc-hub-line">
                          <span className="nc-hub-num">{completed}</span> tasks completed
                        </div>
                      </div>
                    )}
                    {room.id === 'breakroom' && (
                      <div className="nc-room-standby">All quiet</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Sidebar: Room Routing + Activity ── */}
        <div className="nc-sidebar">
          <div className="nc-sidebar-section">
            <div className="nc-sidebar-title">ROOM ROUTING</div>
            {ROOMS.map(room => {
              const roomAgents = agents.filter(a => {
                // Match explicit agent IDs
                if (room.agents.includes(a.id)) return true
                // Match specialist types dynamically
                if (a.role === 'specialist' && room.specialistTypes) {
                  const specialistType = a.id.split(':')[0]
                  return room.specialistTypes.includes(specialistType)
                }
                return false
              })
              const anyRunning = roomAgents.some(a => a.status === 'running')
              const agentCount = roomAgents.length
              return (
                <div key={room.id} className="nc-route-row">
                  <span className={`nc-dot ${anyRunning ? 'nc-dot-pulse' : ''}`}
                    style={{ background: anyRunning ? room.color : '#6b7280' }}
                  />
                  <span className="nc-route-name" style={{ color: room.color }}>{room.label}</span>
                  <span className="nc-route-status">{anyRunning ? 'ACTIVE' : 'IDLE'}</span>
                  <span className="nc-route-count">{agentCount}</span>
                </div>
              )
            })}
          </div>

          <div className="nc-sidebar-section nc-sidebar-activity">
            <div className="nc-sidebar-title">LIVE ACTIVITY</div>
            <div className="nc-activity-list">
              {activity.length === 0 ? (
                <div className="nc-activity-empty">All agents standing by</div>
              ) : activity.slice(0, 30).map(e => (
                <div key={e.id} className="nc-activity-row">
                  <span className="nc-activity-ts">{e.ts.slice(11, 19)}</span>
                  <span className="nc-activity-emoji">{e.emoji}</span>
                  <span className="nc-activity-msg">{e.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="nc-stats">
        <div className="nc-stat">
          <span className="nc-stat-num">{agents.length}</span>
          <span className="nc-stat-label">AGENTS</span>
        </div>
        <div className="nc-stat">
          <span className="nc-stat-num">{active}</span>
          <span className="nc-stat-label">LIVE</span>
        </div>
        <div className="nc-stat">
          <span className="nc-stat-num">{completed}</span>
          <span className="nc-stat-label">DONE</span>
        </div>
        <div className="nc-stat-sep" />
        {agents.filter(a => a.status === 'running').map(a => (
          <div key={a.id} className="nc-stat-running">
            <span>{a.emoji}</span>
            <span>{a.label}</span>
            <span className="nc-dot nc-dot-pulse" style={{ background: '#22c55e' }} />
          </div>
        ))}
        {active === 0 && <span className="nc-stat-idle">All agents idle</span>}
      </div>

      {/* ── Task assign modal ── */}
      {taskModalAgent && (
        <TaskAssignModal
          agentId={taskModalAgent}
          agents={agents}
          onClose={() => setTaskModalAgent(null)}
        />
      )}

      <style jsx>{`
        .nc-root {
          display: flex;
          flex-direction: column;
          gap: 12px;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        }

        /* ── Layout ── */
        .nc-layout {
          display: flex;
          gap: 12px;
          min-height: calc(100vh - 260px);
        }

        /* ── Map ── */
        .nc-map {
          flex: 1;
          background: var(--nerve-bg, #0f1117);
          border: 1px solid var(--nerve-border, #1e2231);
          border-radius: 12px;
          padding: 16px;
          overflow: hidden;
        }
        .nc-map-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(3, 1fr);
          gap: 10px;
          height: 100%;
        }

        /* ── Room ── */
        .nc-room {
          background: var(--nerve-room-bg, #161922);
          border: 1px solid var(--nerve-room-border, #252a3a);
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: border-color 0.3s, box-shadow 0.3s;
          cursor: default;
          overflow: hidden;
        }
        .nc-room:hover {
          border-color: var(--rc);
          box-shadow: 0 0 20px color-mix(in srgb, var(--rc) 15%, transparent);
        }
        .nc-room-active {
          border-color: var(--rc) !important;
          box-shadow: 0 0 24px color-mix(in srgb, var(--rc) 20%, transparent),
                      inset 0 0 30px color-mix(in srgb, var(--rc) 5%, transparent);
        }
        .nc-room-head {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .nc-room-icon {
          font-size: 18px;
        }
        .nc-room-name {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--rc);
        }
        .nc-room-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          margin-left: auto;
          animation: ncPulse 2s ease-in-out infinite;
        }
        .nc-room-agents {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }
        .nc-room-standby {
          font-size: 10px;
          color: #4a5568;
          font-style: italic;
        }

        /* ── Hub status ── */
        .nc-hub-status {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 4px;
        }
        .nc-hub-line {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #8a91a0;
        }
        .nc-hub-num {
          font-weight: 700;
          color: #e2e8f0;
          font-size: 14px;
        }

        /* ── Agent chip ── */
        .nc-agent {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
          color: #e2e8f0;
          font-size: 11px;
        }
        .nc-agent:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.12);
        }
        .nc-agent-emoji {
          font-size: 14px;
        }
        .nc-agent-label {
          font-weight: 500;
          white-space: nowrap;
        }
        .nc-agent-task {
          font-size: 9px;
          color: #6b7280;
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-left: auto;
        }

        /* ── Dots ── */
        .nc-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .nc-dot-pulse {
          animation: ncPulse 2s ease-in-out infinite;
        }
        .nc-dot-ok { background: #22c55e; }
        .nc-dot-err { background: #ef4444; }

        /* ── Sidebar ── */
        .nc-sidebar {
          width: 260px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .nc-sidebar-section {
          background: var(--nerve-bg, #0f1117);
          border: 1px solid var(--nerve-border, #1e2231);
          border-radius: 12px;
          padding: 12px;
        }
        .nc-sidebar-activity {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .nc-sidebar-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #6b7280;
          margin-bottom: 10px;
        }

        /* ── Route rows ── */
        .nc-route-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .nc-route-row:last-child { border-bottom: none; }
        .nc-route-name {
          font-size: 11px;
          font-weight: 600;
          flex: 1;
        }
        .nc-route-status {
          font-size: 9px;
          color: #6b7280;
        }
        .nc-route-count {
          font-size: 11px;
          font-weight: 700;
          color: #e2e8f0;
          min-width: 20px;
          text-align: right;
        }

        /* ── Activity ── */
        .nc-activity-list {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }
        .nc-activity-empty {
          color: #4a5568;
          font-size: 10px;
          text-align: center;
          padding: 20px 0;
        }
        .nc-activity-row {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          font-size: 10px;
        }
        .nc-activity-ts {
          color: #4a5568;
          flex-shrink: 0;
        }
        .nc-activity-emoji {
          flex-shrink: 0;
        }
        .nc-activity-msg {
          color: #8a91a0;
          line-height: 1.3;
        }

        /* ── Stats bar ── */
        .nc-stats {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 10px 16px;
          background: var(--nerve-bg, #0f1117);
          border: 1px solid var(--nerve-border, #1e2231);
          border-radius: 12px;
        }
        .nc-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .nc-stat-num {
          font-size: 18px;
          font-weight: 800;
          color: #e2e8f0;
          line-height: 1;
        }
        .nc-stat-label {
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #6b7280;
          margin-top: 2px;
        }
        .nc-stat-sep {
          width: 1px;
          height: 28px;
          background: #1e2231;
        }
        .nc-stat-running {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.15);
          font-size: 10px;
          color: #a3e635;
        }
        .nc-stat-idle {
          font-size: 10px;
          color: #4a5568;
          font-style: italic;
        }

        /* ── Modal ── */
        .nc-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }
        .nc-modal {
          width: 420px;
          max-width: 90vw;
          background: #1a1d27;
          border: 1px solid #252a3a;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        }
        .nc-modal-head {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 16px;
        }
        .nc-modal-emoji {
          font-size: 32px;
          line-height: 1;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.04);
          border-radius: 10px;
          flex-shrink: 0;
        }
        .nc-modal-title {
          font-size: 14px;
          font-weight: 500;
          color: #e2e8f0;
        }
        .nc-modal-title strong {
          font-weight: 700;
        }
        .nc-modal-sub {
          font-size: 11px;
          color: #6b7280;
          margin-top: 2px;
        }
        .nc-modal-sub code {
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 10px;
          background: rgba(255,255,255,0.06);
          padding: 1px 5px;
          border-radius: 4px;
          color: #9ca3af;
        }
        .nc-modal-input {
          width: 100%;
          padding: 10px 12px;
          background: #0f1117;
          border: 1px solid #252a3a;
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 13px;
          font-family: inherit;
          resize: none;
          outline: none;
          box-sizing: border-box;
        }
        .nc-modal-input:focus {
          border-color: var(--accent, #ff5c5c);
        }
        .nc-modal-error {
          margin-top: 8px;
          padding: 6px 8px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 6px;
          color: #f87171;
          font-size: 12px;
        }
        .nc-modal-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 12px;
        }
        .nc-hint {
          font-size: 11px;
          color: #6b7280;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .nc-hint kbd {
          display: inline-block;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 10px;
          padding: 1px 5px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 4px;
          color: #a0aec0;
          line-height: 1.4;
        }
        .nc-modal-btn {
          padding: 7px 18px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          color: #fff;
          border: none;
          cursor: pointer;
          font-family: inherit;
        }
        .nc-modal-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        @keyframes ncPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .nc-layout { flex-direction: column; }
          .nc-sidebar { width: 100%; flex-direction: row; }
          .nc-sidebar-section { flex: 1; }
          .nc-map-grid {
            grid-template-columns: repeat(2, 1fr);
            grid-template-rows: auto;
          }
          .nc-room { grid-column: auto !important; grid-row: auto !important; }
        }
      `}</style>
    </div>
  )
}
