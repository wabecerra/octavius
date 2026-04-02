'use client'

import { useState, useEffect, useCallback } from 'react'
import { useProfile } from '@/hooks'
import { useGatewayInit, useGatewayReconnect, getGatewayClient } from '@/lib/gateway/use-gateway'
import type { GatewayStatus } from '@/lib/gateway/types'

// ─── Gateway Status (self-contained, fetches real data) ───

interface GatewayHealthInfo {
  status: GatewayStatus
  address: string
  port: number
  connectedAt: string | null
  lastHealthyAt: string | null
}

function GatewayStatusSection({ info, onReconnect, onProvision }: {
  info: GatewayHealthInfo
  onReconnect: () => void
  onProvision: () => void
}) {
  const statusColors: Record<GatewayStatus, { dot: string; label: string; text: string }> = {
    connected: { dot: 'bg-[var(--color-success)]', label: 'text-[var(--color-success)]', text: 'Connected' },
    disconnected: { dot: 'bg-[var(--color-error)]', label: 'text-[var(--color-error)]', text: 'Disconnected' },
    degraded: { dot: 'bg-[var(--color-warning)]', label: 'text-[var(--color-warning)]', text: 'Degraded' },
    unknown: { dot: 'bg-[var(--text-tertiary)]', label: 'text-[var(--text-secondary)]', text: 'Unknown' },
  }
  const sc = statusColors[info.status]

  const uptime = info.connectedAt
    ? (() => {
        const ms = Date.now() - new Date(info.connectedAt).getTime()
        const mins = Math.floor(ms / 60_000)
        const hrs = Math.floor(mins / 60)
        return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`
      })()
    : '—'

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Gateway Status</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">OpenClaw gateway connection health</p>
        </div>
        <span className={`flex items-center gap-1.5 text-sm font-medium ${sc.label}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${sc.dot} ${info.status === 'connected' ? 'animate-pulse' : ''}`} />
          {sc.text}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="text-[10px] text-[var(--text-tertiary)] block">Address</span>
          <span className="text-xs text-[var(--text-primary)] font-mono">{info.address}:{info.port}</span>
        </div>
        <div>
          <span className="text-[10px] text-[var(--text-tertiary)] block">Uptime</span>
          <span className="text-xs text-[var(--text-primary)]">{uptime}</span>
        </div>
        <div>
          <span className="text-[10px] text-[var(--text-tertiary)] block">Last Healthy</span>
          <span className="text-xs text-[var(--text-primary)]">
            {info.lastHealthyAt
              ? new Date(info.lastHealthyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReconnect}
          disabled={info.status === 'connected'}
          className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40"
        >
          Reconnect
        </button>
        <button
          type="button"
          onClick={onProvision}
          className="px-3 py-1.5 text-xs bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150"
        >
          Provision Agents
        </button>
      </div>
    </div>
  )
}

// ─── Scheduled Jobs (fetches from OpenClaw cron API via Octavius) ───

interface CronJob {
  id: string
  name: string
  schedule: { kind: string; expr?: string; everyMs?: number }
  enabled: boolean
  lastRun?: { timestamp: string; success: boolean }
}

function ScheduledJobsSection() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      // Try to get jobs from the gateway health endpoint
      const res = await fetch('/api/gateway/health')
      if (res.ok) {
        const data = await res.json()
        if (data.scheduledJobs) setJobs(data.scheduledJobs)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchJobs() }, [fetchJobs])

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Scheduled Jobs</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Cron jobs managed by the OpenClaw gateway</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchJobs()}
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-tertiary)] text-center py-3">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-[var(--text-tertiary)]">No scheduled jobs</p>
          <p className="text-[10px] text-[var(--text-disabled)] mt-1">
            Jobs are created via the OpenClaw gateway or agent commands
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-secondary,var(--border-primary))]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${job.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--text-tertiary)]'}`} />
                  <span className="text-sm text-[var(--text-primary)] font-medium">{job.name || job.id}</span>
                  <span className="text-[10px] text-[var(--text-disabled)] font-mono">
                    {job.schedule.kind === 'cron' ? job.schedule.expr : `every ${Math.round((job.schedule.everyMs || 0) / 60000)}m`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Data Management ───

function DataManagementSection() {
  const [exporting, setExporting] = useState(false)

  const handleExportMemory = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/memory/stats')
      if (res.ok) {
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `octavius-memory-stats-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      // silent
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Data Management</h3>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Export, backup, and manage your Octavius data</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleExportMemory()}
          disabled={exporting}
          className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40"
        >
          {exporting ? 'Exporting…' : '📊 Export Memory Stats'}
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await fetch('/api/memory/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'consolidation' }),
              })
            } catch { /* silent */ }
          }}
          className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
        >
          🔄 Run Consolidation
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await fetch('/api/llm-cost/models/sync', { method: 'POST' })
            } catch { /* silent */ }
          }}
          className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
        >
          💰 Sync Model Pricing
        </button>
      </div>
    </div>
  )
}

// ─── Obsidian Integration Status ───

function ObsidianStatusSection() {
  const [status, setStatus] = useState<{ enabled: boolean; connected: boolean; vault_folder?: string; sync_direction?: string } | null>(null)

  useEffect(() => {
    fetch('/api/obsidian/status')
      .then((r) => r.ok ? r.json() : null)
      .then(setStatus)
      .catch(() => {})
  }, [])

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Obsidian Integration</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Sync memories with your Obsidian vault</p>
        </div>
        {status && (
          <span className={`flex items-center gap-1.5 text-xs font-medium ${
            status.connected ? 'text-[var(--color-success)]' : status.enabled ? 'text-[var(--color-error)]' : 'text-[var(--text-tertiary)]'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              status.connected ? 'bg-[var(--color-success)]' : status.enabled ? 'bg-[var(--color-error)]' : 'bg-[var(--text-tertiary)]'
            }`} />
            {status.connected ? 'Connected' : status.enabled ? 'Disconnected' : 'Disabled'}
          </span>
        )}
      </div>
      {status?.connected && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] text-[var(--text-tertiary)] block">Vault Folder</span>
            <span className="text-xs text-[var(--text-primary)] font-mono">{status.vault_folder ?? '—'}</span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-tertiary)] block">Sync Direction</span>
            <span className="text-xs text-[var(--text-primary)]">{status.sync_direction ?? '—'}</span>
          </div>
        </div>
      )}
      <p className="text-xs text-[var(--text-disabled)]">
        Configure Obsidian sync in Memory → Obsidian Integration panel
      </p>
    </div>
  )
}

// ─── Provider API Keys ───

interface ProviderField { key: string; label: string; type: 'apikey' | 'text' | 'url' }
interface ProviderInfo {
  providerId: string
  displayName: string
  enabled: boolean
  hasKey: boolean
  config: Record<string, string>
  fields: ProviderField[]
  updatedAt: string
}

function ProviderKeysSection() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/provider-keys')
      if (res.ok) {
        const data = await res.json()
        setProviders(data.providers ?? [])
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchProviders() }, [fetchProviders])

  const startEdit = (p: ProviderInfo) => {
    setEditingId(p.providerId)
    // Pre-fill with existing non-masked values
    const vals: Record<string, string> = {}
    for (const f of p.fields) {
      vals[f.key] = f.type === 'apikey' ? '' : (p.config[f.key] || '')
    }
    setFormValues(vals)
  }

  const saveProvider = async (providerId: string, enabled: boolean) => {
    setSaving(true)
    try {
      await fetch('/api/settings/provider-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          apiKey: formValues.apiKey || undefined,
          config: formValues,
          enabled,
        }),
      })
      setEditingId(null)
      void fetchProviders()
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }

  const toggleProvider = async (p: ProviderInfo) => {
    await fetch('/api/settings/provider-keys', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: p.providerId, enabled: !p.enabled }),
    })
    void fetchProviders()
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Provider API Keys</h3>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
          Configure API keys for LLM providers, image generation, and automation services
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-tertiary)] text-center py-3">Loading providers...</p>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.providerId} className="border border-[var(--border-secondary,var(--border-primary))] rounded-lg overflow-hidden">
              {/* Provider header row */}
              <div className="flex items-center justify-between p-3 bg-[var(--bg-primary,var(--bg-secondary))]">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void toggleProvider(p)}
                    className={`w-7 h-4 rounded-full transition-colors duration-200 relative flex-shrink-0 ${
                      p.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${
                      p.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`} />
                  </button>
                  <div>
                    <span className="text-sm text-[var(--text-primary)] font-medium">{p.displayName}</span>
                    {p.hasKey && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]">
                        Configured
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => editingId === p.providerId ? setEditingId(null) : startEdit(p)}
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {editingId === p.providerId ? 'Cancel' : 'Configure'}
                </button>
              </div>

              {/* Edit form (expanded) */}
              {editingId === p.providerId && (
                <div className="p-3 space-y-3 border-t border-[var(--border-secondary,var(--border-primary))]">
                  {p.fields.map((field) => (
                    <div key={field.key}>
                      <label className="text-[10px] text-[var(--text-secondary)] mb-1 block">{field.label}</label>
                      <input
                        type={field.type === 'apikey' ? 'password' : 'text'}
                        value={formValues[field.key] || ''}
                        onChange={(e) => setFormValues({ ...formValues, [field.key]: e.target.value })}
                        placeholder={field.type === 'apikey' ? (p.hasKey ? '(unchanged — enter new key to replace)' : 'Enter API key') : `Enter ${field.label.toLowerCase()}`}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-xs font-mono placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
                      />
                    </div>
                  ))}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void saveProvider(p.providerId, true)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] text-xs font-medium hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
                    >
                      {saving ? 'Saving...' : 'Save & Enable'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Settings View ───

export function SettingsView() {
  const { profile, updateProfile } = useProfile()

  const [accentColor, setAccentColor] = useState('#ff5c5c')
  const [weeklyReviewDay, setWeeklyReviewDay] = useState(0)

  const gateway = useGatewayInit()
  const reconnect = useGatewayReconnect()

  const [gatewayAddress, setGatewayAddress] = useState('localhost')
  const [gatewayPort, setGatewayPort] = useState(18789)

  const [gwAddress, setGwAddress] = useState(gatewayAddress)
  const [gwPort, setGwPort] = useState(String(gatewayPort))
  const [gwToken, setGwToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  useEffect(() => {
    document.documentElement.style.setProperty('--color-accent', accentColor)
  }, [accentColor])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">System Configuration</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          Profile, gateway connection, scheduled jobs, and data management
        </p>
      </div>

      {/* Profile */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Profile</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Your identity and preferences within Octavius</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
              placeholder="Your name"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Core Values</label>
            <textarea
              value={profile.coreValues}
              onChange={(e) => updateProfile({ coreValues: e.target.value })}
              placeholder="What matters most to you?"
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Life Vision</label>
            <textarea
              value={profile.lifeVision}
              onChange={(e) => updateProfile({ lifeVision: e.target.value })}
              placeholder="Where do you see yourself heading?"
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-[var(--border-primary)] bg-transparent cursor-pointer"
                />
                <span className="text-xs text-[var(--text-tertiary)] font-mono">{accentColor}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Weekly Review Day</label>
              <select
                value={weeklyReviewDay}
                onChange={(e) => setWeeklyReviewDay(Number(e.target.value))}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
              >
                {DAYS.map((day, i) => (
                  <option key={day} value={i}>{day}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Gateway Connection */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Gateway Connection</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Configure how Octavius connects to the OpenClaw gateway</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Address</label>
            <input
              type="text"
              value={gwAddress}
              onChange={(e) => setGwAddress(e.target.value)}
              placeholder="localhost"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Port</label>
            <input
              type="number"
              value={gwPort}
              onChange={(e) => setGwPort(e.target.value)}
              placeholder="18789"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setGatewayAddress(gwAddress || 'localhost')
                setGatewayPort(Number(gwPort) || 18789)
              }}
              className="px-4 py-2 text-sm bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              Update
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">Gateway Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={gwToken}
              onChange={(e) => { setGwToken(e.target.value); setTokenStatus('idle') }}
              placeholder="Enter gateway token"
              className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
            <button
              type="button"
              disabled={!gwToken || tokenStatus === 'validating'}
              onClick={async () => {
                setTokenStatus('validating')
                try {
                  const res = await fetch('/api/gateway/validate-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: gwToken, address: gwAddress || 'localhost', port: Number(gwPort) || 18789 }),
                  })
                  const data = await res.json()
                  setTokenStatus(data.valid ? 'valid' : 'invalid')
                  if (data.valid) {
                    const client = getGatewayClient()
                    if (client) client.setToken(gwToken)
                  }
                } catch {
                  setTokenStatus('invalid')
                }
              }}
              className="px-4 py-2 text-sm bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40"
            >
              {tokenStatus === 'validating' ? 'Validating…' : 'Validate'}
            </button>
          </div>
          {tokenStatus === 'valid' && <p className="text-xs text-[var(--color-success)] mt-1">✓ Token validated and saved</p>}
          {tokenStatus === 'invalid' && <p className="text-xs text-[var(--color-error)] mt-1">✗ Token validation failed</p>}
        </div>
      </div>

      {/* Gateway Status */}
      <GatewayStatusSection
        info={{
          status: gateway.status,
          address: gatewayAddress,
          port: gatewayPort,
          connectedAt: gateway.connectedAt,
          lastHealthyAt: gateway.lastHealthyAt,
        }}
        onReconnect={reconnect}
        onProvision={async () => {
          try {
            await fetch('/api/gateway/provision', { method: 'POST' })
          } catch { /* silent */ }
        }}
      />

      {/* Provider API Keys */}
      <ProviderKeysSection />

      {/* Scheduled Jobs */}
      <ScheduledJobsSection />

      {/* Data Management */}
      <DataManagementSection />

      {/* Obsidian Integration Status */}
      <ObsidianStatusSection />
    </div>
  )
}
