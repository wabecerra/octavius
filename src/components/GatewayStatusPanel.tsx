'use client'

import type { GatewayStatus, SessionInfo } from '@/lib/gateway/types'

export interface GatewayStatusPanelProps {
  connectionInfo: {
    status: GatewayStatus
    address: string
    port: number
    connectedAt: string | null
    lastHealthyAt: string | null
    consecutiveFailures: number
  }
  registeredAgents: Array<{
    agentId: string
    status: string
    workspacePath: string
    error?: string
  }>
  activeSessions: SessionInfo[]
  recentSessions: SessionInfo[]
  dailyTokenUsage: Record<string, number>
  onReconnect: () => void
  onProvision: () => void
}

const statusColors: Record<GatewayStatus, { dot: string; label: string }> = {
  connected: { dot: 'bg-[var(--color-success)]', label: 'text-[var(--color-success)]' },
  disconnected: { dot: 'bg-[var(--color-error)]', label: 'text-[var(--color-error)]' },
  degraded: { dot: 'bg-[var(--color-warning)]', label: 'text-[var(--color-warning)]' },
  unknown: { dot: 'bg-[var(--text-tertiary)]', label: 'text-[var(--text-secondary)]' },
}

function formatUptime(connectedAt: string | null): string {
  if (!connectedAt) return '—'
  const ms = Date.now() - new Date(connectedAt).getTime()
  if (ms < 0) return '—'
  const mins = Math.floor(ms / 60_000)
  const hrs = Math.floor(mins / 60)
  if (hrs > 0) return `${hrs}h ${mins % 60}m`
  return `${mins}m`
}

function formatTs(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '—'
  }
}

export function GatewayStatusPanel({
  connectionInfo,
  registeredAgents,
  activeSessions,
  recentSessions,
  dailyTokenUsage,
  onReconnect,
  onProvision,
}: GatewayStatusPanelProps) {
  const sc = statusColors[connectionInfo.status]

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-5 transition-colors duration-150">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Gateway Status</h3>
        <span className={`flex items-center gap-1.5 text-sm font-medium ${sc.label}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${sc.dot}`} />
          {connectionInfo.status}
        </span>
      </div>

      {/* Connection info */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <span className="text-xs text-[var(--text-tertiary)] block">Address</span>
          <span className="text-[var(--text-primary)] font-mono text-xs">{connectionInfo.address}:{connectionInfo.port}</span>
        </div>
        <div>
          <span className="text-xs text-[var(--text-tertiary)] block">Last Healthy</span>
          <span className="text-[var(--text-primary)] text-xs">{formatTs(connectionInfo.lastHealthyAt)}</span>
        </div>
        <div>
          <span className="text-xs text-[var(--text-tertiary)] block">Uptime</span>
          <span className="text-[var(--text-primary)] text-xs">{formatUptime(connectionInfo.connectedAt)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReconnect}
          disabled={connectionInfo.status === 'connected'}
          className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reconnect
        </button>
        <button
          type="button"
          onClick={onProvision}
          className="px-3 py-1.5 text-xs bg-[var(--accent-muted)] border border-[var(--accent)] rounded-lg text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
        >
          Provision Agents
        </button>
      </div>

      {/* Registered agents */}
      <div>
        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Registered Agents</h4>
        {registeredAgents.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No agents registered</p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {registeredAgents.map((agent) => (
              <div key={agent.agentId} className="flex items-center justify-between text-xs py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-primary)] font-mono">{agent.agentId}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-tertiary)] truncate max-w-[150px]">{agent.workspacePath}</span>
                  <AgentStatusBadge status={agent.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sessions */}
      <div>
        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
          Sessions <span className="text-[var(--text-tertiary)] font-normal">({activeSessions.length} active)</span>
        </h4>
        {recentSessions.length === 0 && activeSessions.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No sessions</p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {[...activeSessions, ...recentSessions].slice(0, 10).map((s) => (
              <div key={s.session_id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--border-secondary)]">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-primary)] font-mono">{s.agent_id}</span>
                  <span className="text-[var(--text-tertiary)] truncate max-w-[180px]">{s.task_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <SessionStatusBadge status={s.status} />
                  {s.started_at && s.completed_at && (
                    <span className="text-[var(--text-disabled)]">
                      {Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000)}s
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily token usage */}
      <div>
        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Daily Token Usage</h4>
        {Object.keys(dailyTokenUsage).length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No usage today</p>
        ) : (
          <div className="space-y-1">
            {Object.entries(dailyTokenUsage).map(([agentId, tokens]) => (
              <div key={agentId} className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-primary)] font-mono">{agentId}</span>
                <span className="text-[var(--text-secondary)]">{tokens.toLocaleString()} tokens</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'registered'
      ? 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]'
      : status === 'pending'
        ? 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]'
        : 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)]'

  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{status}</span>
}

function SessionStatusBadge({ status }: { status: SessionInfo['status'] }) {
  const cls =
    status === 'active'
      ? 'bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] text-[var(--color-info)]'
      : status === 'completed'
        ? 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]'
        : 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)]'

  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{status}</span>
}
