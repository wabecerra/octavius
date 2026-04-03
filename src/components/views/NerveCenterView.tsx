'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { townEvents, type SeatStatus } from '@/lib/town/events'
import { useFleet, useFleetConfigSync, useFleetActivitySync } from '@/lib/town/use-fleet'
import { useFleetSSE } from '@/lib/town/use-fleet-sse'
import { getFleetStore, type FleetAgent } from '@/lib/town/fleet-store'
import { gatewayEvents } from '@/lib/gateway-view/events'
import { ROOM_COLORS, AGENT_HOME_ROOM } from '@/components/town/game/scenes/room-id-map'

const PhaserGame = dynamic(() => import('@/components/town/game/PhaserGame'), { ssr: false })

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
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ width: 420, maxWidth: '90vw', background: '#1a1d27', border: '1px solid #252a3a', borderRadius: 12, padding: 20, boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 32, lineHeight: 1, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, flexShrink: 0 }}>
            {agent.emoji}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>
              Assign task to <strong>{agent.label}</strong>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              <code style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4, color: '#9ca3af' }}>{agentId}</code>
            </div>
          </div>
        </div>
        <textarea
          autoFocus
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the task..."
          rows={3}
          style={{ width: '100%', padding: '10px 12px', background: '#0f1117', border: '1px solid #252a3a', borderRadius: 8, color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' as const }}
        />
        {error && (
          <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, color: '#f87171', fontSize: 12 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <span style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 10, padding: '1px 5px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#a0aec0', lineHeight: '1.4' }}>Enter</kbd> to send
          </span>
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || sending}
            style={{
              padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: !message.trim() || sending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: qColor, opacity: !message.trim() || sending ? 0.3 : 1,
            }}
          >
            {sending ? 'Dispatching...' : 'Assign Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Room Detail Panel ──

const ROOM_LABELS: Record<string, string> = {
  'vitality-lab': 'Vitality Lab', 'task-forge': 'Task Forge', 'writing-room': 'Writing Room',
  'research-lab': 'Research Lab', 'commons': 'Commons', 'media-studio': 'Media Studio',
  'command-hub': 'Command Hub', 'automations': 'Automations Bay', 'soul-workshop': 'Soul Workshop',
  'break-room': 'Break Room',
}

function RoomDetailPanel({ roomId, agents, onClose }: { roomId: string; agents: FleetAgent[]; onClose: () => void }) {
  const color = ROOM_COLORS[roomId] || '#6b7280'
  const label = ROOM_LABELS[roomId] || roomId

  // Find agents assigned to this room
  const roomAgents = agents.filter(a => AGENT_HOME_ROOM[a.id] === roomId)
  const activeAgents = roomAgents.filter(a => a.status === 'running')
  const completedTasks = roomAgents.reduce((sum, a) => sum + a.tasksCompleted, 0)

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 44, width: 300, zIndex: 20,
      background: 'rgba(15, 17, 23, 0.95)', backdropFilter: 'blur(12px)',
      borderLeft: `2px solid ${color}`, display: 'flex', flexDirection: 'column',
      fontFamily: "'SF Mono', 'Fira Code', monospace",
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label}
          </span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6,
            padding: '4px 8px', color: '#6b7280', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>ESC</button>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 10, color: '#6b7280' }}>
          <span><strong style={{ color: '#e2e8f0', fontSize: 16 }}>{roomAgents.length}</strong> agents</span>
          <span><strong style={{ color: '#22c55e', fontSize: 16 }}>{activeAgents.length}</strong> active</span>
          <span><strong style={{ color: '#e2e8f0', fontSize: 16 }}>{completedTasks}</strong> done</span>
        </div>
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#6b7280', marginBottom: 8 }}>ASSIGNED AGENTS</div>
        {roomAgents.length === 0 ? (
          <div style={{ fontSize: 10, color: '#4a5568', fontStyle: 'italic', padding: '12px 0' }}>No agents assigned</div>
        ) : roomAgents.map(agent => {
          const cfg = STATUS_CONFIG[agent.status]
          return (
            <div key={agent.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px',
              borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11,
            }}>
              <span style={{ fontSize: 16 }}>{agent.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 500 }}>{agent.label}</div>
                {agent.currentTask && (
                  <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.currentTask}
                  </div>
                )}
              </div>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0,
                animation: cfg.pulse ? 'ncPulse 2s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontSize: 9, color: cfg.color }}>{cfg.label}</span>
            </div>
          )
        })}
      </div>

      {/* Room stats footer */}
      <div style={{
        padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 10, color: '#4a5568',
      }}>
        Room ID: <code style={{ fontSize: 9, background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, color: '#8a91a0' }}>{roomId}</code>
      </div>
    </div>
  )
}

// ── Context Menu ──

function RoomContextMenu({ roomId, x, y, onAction, onClose }: {
  roomId: string; x: number; y: number; onAction: (action: string) => void; onClose: () => void
}) {
  const label = ROOM_LABELS[roomId] || roomId
  const color = ROOM_COLORS[roomId] || '#6b7280'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={onClose}>
      <div
        style={{
          position: 'absolute', left: x, top: y, minWidth: 160,
          background: '#1a1d27', border: '1px solid #252a3a', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: '4px 0',
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '6px 12px', fontSize: 10, color: '#6b7280', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ color }}>{label}</span>
        </div>
        {[
          { key: 'assign', label: 'Assign Task', icon: '+' },
          { key: 'detail', label: 'View Details', icon: '>' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => onAction(item.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
              background: 'none', border: 'none', color: '#e2e8f0', fontSize: 11,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseOut={e => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ color: '#6b7280', fontSize: 12, width: 16, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main View ──

export function NerveCenterView() {
  const { agents, activity } = useFleet()
  useFleetConfigSync()
  useFleetActivitySync()
  useFleetSSE()

  const [gatewayOk, setGatewayOk] = useState(false)
  const [taskModalAgent, setTaskModalAgent] = useState<string | null>(null)
  const [feedOpen, setFeedOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ roomId: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const check = async () => {
      try { const r = await fetch('/api/gateway/health'); setGatewayOk(r.ok) } catch { setGatewayOk(false) }
    }
    check()
    const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
  }, [])

  // Bridge: scene emits open-terminal → React shows TaskAssignModal
  useEffect(() => {
    return townEvents.on('open-terminal', (seatId?: string) => {
      if (seatId) setTaskModalAgent(seatId)
    })
  }, [])

  // Bridge: scene emits room-clicked → React shows room detail panel
  useEffect(() => {
    const unsub1 = gatewayEvents.on('room-clicked', (roomId: string) => {
      setSelectedRoom(prev => prev === roomId ? null : roomId)
      setContextMenu(null)
    })
    const unsub2 = gatewayEvents.on('room-context-menu', (roomId: string, _wx: number, _wy: number) => {
      // Convert world coords to approximate screen position
      setContextMenu({ roomId, x: Math.min(window.innerWidth - 200, window.innerWidth / 2), y: Math.min(window.innerHeight - 120, window.innerHeight / 2) })
    })
    return () => { unsub1(); unsub2() }
  }, [])

  // ESC key closes panels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedRoom(null)
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const active = agents.filter(a => a.status === 'running').length
  const completed = agents.reduce((sum, a) => sum + a.tasksCompleted, 0)

  return (
    <div className="nc-root">
      {/* Full-size Phaser canvas */}
      <div className="nc-canvas">
        <PhaserGame />
      </div>

      {/* Bottom status bar overlay */}
      <div className="nc-statusbar">
        <div className="nc-stat-group">
          <span className="nc-stat"><strong>{agents.length}</strong> AGENTS</span>
          <span className="nc-stat-sep">|</span>
          <span className="nc-stat"><strong>{active}</strong> ACTIVE</span>
          <span className="nc-stat-sep">|</span>
          <span className="nc-stat"><strong>{completed}</strong> DONE</span>
          <span className="nc-stat-sep">|</span>
          <span className="nc-stat">
            <span className={`nc-dot ${gatewayOk ? 'nc-dot-ok' : 'nc-dot-err'}`} />
            {gatewayOk ? 'Gateway Online' : 'Gateway Offline'}
          </span>
        </div>
        <div className="nc-stat-runners">
          {agents.filter(a => a.status === 'running').map(a => (
            <span key={a.id} className="nc-runner">
              {a.emoji} {a.label}
              <span className="nc-dot nc-dot-pulse" style={{ background: '#22c55e' }} />
            </span>
          ))}
          {active === 0 && <span className="nc-stat-idle">All agents idle</span>}
        </div>
      </div>

      {/* Collapsible activity feed (right edge) */}
      <button className="nc-feed-toggle" onClick={() => setFeedOpen(o => !o)}>
        {feedOpen ? '>' : '<'} Activity
      </button>
      {feedOpen && (
        <div className="nc-feed">
          <div className="nc-feed-title">LIVE ACTIVITY</div>
          <div className="nc-feed-list">
            {activity.length === 0 ? (
              <div className="nc-feed-empty">All agents standing by</div>
            ) : activity.slice(0, 30).map(e => (
              <div key={e.id} className="nc-feed-row">
                <span className="nc-feed-ts">{e.ts.slice(11, 19)}</span>
                <span>{e.emoji}</span>
                <span className="nc-feed-msg">{e.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Room detail panel (slide-in from right) */}
      {selectedRoom && (
        <RoomDetailPanel
          roomId={selectedRoom}
          agents={agents}
          onClose={() => setSelectedRoom(null)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <RoomContextMenu
          roomId={contextMenu.roomId}
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={(action) => {
            if (action === 'detail') setSelectedRoom(contextMenu.roomId)
            if (action === 'assign') {
              // Find first agent in this room to assign
              const roomAgent = agents.find(a => AGENT_HOME_ROOM[a.id] === contextMenu.roomId)
              if (roomAgent) setTaskModalAgent(roomAgent.id)
            }
            setContextMenu(null)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Task assign modal */}
      {taskModalAgent && (
        <TaskAssignModal
          agentId={taskModalAgent}
          agents={agents}
          onClose={() => { setTaskModalAgent(null); townEvents.emit('terminal-closed') }}
        />
      )}

      <style jsx>{`
        .nc-root {
          position: relative;
          width: calc(100% - 400px);
          height: calc(100vh - 120px);
          overflow: hidden;
          font-family: 'SF Mono', 'Fira Code', monospace;
        }
        @media (max-width: 768px) {
          .nc-root {
            width: 100%;
          }
        }
        .nc-canvas {
          position: absolute;
          inset: 0;
        }
        .nc-statusbar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 16px;
          background: rgba(15, 17, 23, 0.85);
          backdrop-filter: blur(8px);
          border-top: 1px solid rgba(255,255,255,0.08);
          z-index: 10;
          font-size: 11px;
          color: #8a91a0;
        }
        .nc-stat-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .nc-stat :global(strong) {
          color: #e2e8f0;
          font-weight: 800;
        }
        .nc-stat-sep {
          opacity: 0.2;
        }
        .nc-stat-runners {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .nc-runner {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 12px;
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.15);
          font-size: 10px;
          color: #a3e635;
        }
        .nc-stat-idle {
          font-size: 10px;
          color: #4a5568;
          font-style: italic;
        }
        .nc-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }
        .nc-dot-ok {
          background: #22c55e;
        }
        .nc-dot-err {
          background: #ef4444;
        }
        .nc-dot-pulse {
          animation: ncPulse 2s ease-in-out infinite;
        }
        .nc-feed-toggle {
          position: absolute;
          top: 12px;
          right: 0;
          z-index: 15;
          padding: 6px 10px;
          background: rgba(15,17,23,0.85);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08);
          border-right: none;
          border-radius: 8px 0 0 8px;
          color: #8a91a0;
          font-size: 10px;
          cursor: pointer;
          font-family: inherit;
        }
        .nc-feed {
          position: absolute;
          top: 40px;
          right: 0;
          bottom: 44px;
          width: 240px;
          z-index: 15;
          background: rgba(15,17,23,0.9);
          backdrop-filter: blur(8px);
          border-left: 1px solid rgba(255,255,255,0.08);
          padding: 12px;
          display: flex;
          flex-direction: column;
        }
        .nc-feed-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #6b7280;
          margin-bottom: 10px;
        }
        .nc-feed-list {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }
        .nc-feed-empty {
          color: #4a5568;
          font-size: 10px;
          text-align: center;
          padding: 20px 0;
        }
        .nc-feed-row {
          display: flex;
          gap: 6px;
          padding: 3px 0;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          font-size: 10px;
        }
        .nc-feed-ts {
          color: #4a5568;
          flex-shrink: 0;
        }
        .nc-feed-msg {
          color: #8a91a0;
          line-height: 1.3;
        }
        @keyframes ncPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
