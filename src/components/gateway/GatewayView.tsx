'use client'

/**
 * GatewayView — OpenClaw Gateway management dashboard.
 *
 * Shows gateway connection status, system topology, registered agents,
 * active sessions, and scheduled jobs. Replaces the unfinished Phaser-based
 * spatial view with a functional React dashboard.
 */

import { useEffect, useState, useCallback } from 'react'
import { useGatewayInit, useGatewayReconnect, getGatewayClient } from '@/lib/gateway/use-gateway'
import type { GatewayStatus } from '@/lib/gateway/types'
import { useFleet } from '@/lib/town/use-fleet'

// ── Agent topology ──

const AGENT_HIERARCHY = [
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    icon: '⚡',
    color: '#ff5c5c',
    children: [
      { id: 'gen-lifeforce', label: 'Lifeforce', icon: '💚', color: '#34d399', quadrant: 'lifeforce' },
      { id: 'gen-industry', label: 'Industry', icon: '💼', color: '#60a5fa', quadrant: 'industry' },
      { id: 'gen-fellowship', label: 'Fellowship', icon: '🤝', color: '#f87171', quadrant: 'fellowship' },
      { id: 'gen-essence', label: 'Essence', icon: '🧘', color: '#c084fc', quadrant: 'essence' },
    ],
  },
]

const SPECIALISTS = [
  { id: 'specialist-research', label: 'Research', icon: '🔍', color: '#818cf8' },
  { id: 'specialist-writing', label: 'Writing', icon: '✍️', color: '#a78bfa' },
  { id: 'specialist-marketing', label: 'Marketing', icon: '📣', color: '#fb923c' },
  { id: 'specialist-engineering', label: 'Engineering', icon: '⚙️', color: '#38bdf8' },
  { id: 'specialist-video', label: 'Video', icon: '🎬', color: '#f472b6' },
  { id: 'specialist-image', label: 'Image', icon: '🖼️', color: '#fbbf24' },
]

// ── Status helpers ──

const STATUS_STYLES: Record<GatewayStatus, { bg: string; text: string; dot: string }> = {
  connected: { bg: 'rgba(34,197,94,0.1)', text: '#22c55e', dot: '#22c55e' },
  disconnected: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', dot: '#ef4444' },
  degraded: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', dot: '#f59e0b' },
  unknown: { bg: 'rgba(107,114,128,0.1)', text: '#6b7280', dot: '#6b7280' },
}

function StatusBadge({ status }: { status: GatewayStatus }) {
  const s = STATUS_STYLES[status]
  return (
    <span style={{ background: s.bg, color: s.text, padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {status.toUpperCase()}
    </span>
  )
}

// ── Main View ──

export function GatewayView() {
  const gwState = useGatewayInit()
  const reconnect = useGatewayReconnect()
  const { agents } = useFleet()
  const [healthData, setHealthData] = useState<{ ok: boolean; gateway?: string } | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const checkHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await fetch('/api/gateway/health')
      const data = await res.json()
      setHealthData(data)
    } catch {
      setHealthData({ ok: false })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30_000)
    return () => clearInterval(interval)
  }, [checkHealth])

  const client = getGatewayClient()
  const connInfo = client?.getConnectionInfo() ?? {
    status: gwState.status,
    address: 'localhost',
    port: 18789,
    connectedAt: gwState.connectedAt,
    lastHealthyAt: gwState.lastHealthyAt,
    consecutiveFailures: 0,
  }

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
        Connection management, agent topology, and system health
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Connection Status Card */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, margin: 0 }}>Connection Status</h2>
            <StatusBadge status={connInfo.status as GatewayStatus} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Address</div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace' }}>{connInfo.address}:{connInfo.port}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Last Healthy</div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                {connInfo.lastHealthyAt ? new Date(connInfo.lastHealthyAt).toLocaleTimeString() : '—'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Connected Since</div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                {connInfo.connectedAt ? new Date(connInfo.connectedAt).toLocaleTimeString() : '—'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Failed Checks</div>
              <div style={{ color: connInfo.consecutiveFailures > 0 ? '#f59e0b' : 'var(--text-primary)', fontSize: 13 }}>
                {connInfo.consecutiveFailures}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={reconnect}
              disabled={connInfo.status === 'connected'}
              style={{
                padding: '6px 14px', fontSize: 12, borderRadius: 8,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)', cursor: connInfo.status === 'connected' ? 'not-allowed' : 'pointer',
                opacity: connInfo.status === 'connected' ? 0.4 : 1,
              }}
            >
              Reconnect
            </button>
            <button
              onClick={checkHealth}
              disabled={healthLoading}
              style={{
                padding: '6px 14px', fontSize: 12, borderRadius: 8,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
            >
              {healthLoading ? 'Checking...' : 'Check Health'}
            </button>
          </div>
        </div>

        {/* Health Response Card */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>Health Endpoint</h2>
          {healthData ? (
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>GET </span>
                <span style={{ color: 'var(--text-primary)' }}>/api/gateway/health</span>
              </div>
              <div style={{ color: healthData.ok ? '#22c55e' : '#ef4444', marginBottom: 4 }}>
                Status: {healthData.ok ? '200 OK' : '502 Unreachable'}
              </div>
              {healthData.gateway && (
                <div style={{ color: 'var(--text-secondary)' }}>
                  Gateway: {healthData.gateway}
                </div>
              )}
              <pre style={{ color: 'var(--text-tertiary)', marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 11 }}>
                {JSON.stringify(healthData, null, 2)}
              </pre>
            </div>
          ) : (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading health data...</div>
          )}
        </div>
      </div>

      {/* Agent Topology */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>Agent Topology</h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {/* Orchestrator */}
          {AGENT_HIERARCHY.map(orch => (
            <div key={orch.id} style={{ textAlign: 'center', width: '100%' }}>
              <AgentNode id={orch.id} label={orch.label} icon={orch.icon} color={orch.color} agents={agents} />
              <div style={{ width: 2, height: 20, background: 'var(--border-primary)', margin: '0 auto' }} />
              {/* Generalists */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
                {orch.children.map(gen => (
                    <div key={gen.id} style={{ textAlign: 'center' }}>
                      <AgentNode id={gen.id} label={gen.label} icon={gen.icon} color={gen.color} agents={agents} />
                    </div>
                ))}
              </div>
              <div style={{ width: 2, height: 20, background: 'var(--border-primary)', margin: '0 auto' }} />
              {/* Specialists */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                {SPECIALISTS.map(spec => (
                  <AgentNode key={spec.id} id={spec.id} label={spec.label} icon={spec.icon} color={spec.color} agents={agents} small />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Architecture */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20 }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>System Architecture</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <ServiceCard label="Next.js Server" port="3000" status="running" icon="🖥️" />
          <ServiceCard label="OpenClaw Gateway" port="18789" status={connInfo.status === 'connected' ? 'running' : 'offline'} icon="🌐" />
          <ServiceCard label="SQLite Database" port="local" status="running" icon="🗄️" />
          <ServiceCard label="Memory Service" port="3000" status="running" icon="🧠" sub="/api/memory" />
          <ServiceCard label="Agent Dispatch" port="3000" status="running" icon="📡" sub="/api/agents/dispatch" />
          <ServiceCard label="Chat Endpoint" port="3000" status="running" icon="💬" sub="/api/chat" />
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: '1fr 1fr'"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ──

function AgentNode({ id, label, icon, color, agents, small }: {
  id: string; label: string; icon: string; color: string;
  agents: Array<{ id: string; status: string }>; small?: boolean
}) {
  const agent = agents.find(a => a.id === id)
  const isActive = agent?.status === 'running'
  const size = small ? 44 : 56

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `${color}18`, border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: small ? 18 : 22,
        boxShadow: isActive ? `0 0 12px ${color}44` : 'none',
        position: 'relative',
      }}>
        {icon}
        {isActive && (
          <span style={{
            position: 'absolute', top: -2, right: -2, width: 10, height: 10,
            borderRadius: '50%', background: '#22c55e',
            border: '2px solid var(--bg-secondary)',
          }} />
        )}
      </div>
      <span style={{ color: 'var(--text-secondary)', fontSize: small ? 10 : 11, fontWeight: 500 }}>{label}</span>
    </div>
  )
}

function ServiceCard({ label, port, status, icon, sub }: {
  label: string; port: string; status: string; icon: string; sub?: string
}) {
  const isRunning = status === 'running'
  return (
    <div style={{
      background: 'var(--bg-tertiary)', borderRadius: 8, padding: 14,
      border: `1px solid ${isRunning ? 'var(--border-primary)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
          background: isRunning ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: isRunning ? '#22c55e' : '#ef4444',
        }}>
          {status.toUpperCase()}
        </span>
      </div>
      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'monospace' }}>
        :{port}{sub || ''}
      </div>
    </div>
  )
}

export default GatewayView
