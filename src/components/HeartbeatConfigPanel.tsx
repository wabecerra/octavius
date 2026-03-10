'use client'

import { useState, useEffect, useCallback } from 'react'

interface HeartbeatConfig {
  enabled: boolean
  intervalMinutes: number
  model: string
  autonomousMode: boolean
  maxDispatchPerRun: number
  checks: {
    kanbanReview: boolean
    costCheck: boolean
    costCheckThresholdUsd: number
    costCheckIntervalHours: number
  }
}

interface HeartbeatRun {
  id: number
  timestamp: string
  summary: string
  taskCount: number
  model: string | null
  costUsd: number
  actionable: boolean
  checksRun: string[]
}

const MODEL_PRESETS: { key: string; label: string; slug: string; cost: string }[] = [
  { key: 'cheap', label: 'Qwen3 235B', slug: 'qwen/qwen3-235b-a22b-2507', cost: '~$0.0001/call' },
  { key: 'tiny', label: 'Qwen3 30B', slug: 'qwen/qwen3-30b-a3b-instruct-2507', cost: '~$0.00003/call' },
  { key: 'free', label: 'Free Router', slug: 'openrouter/free', cost: 'Free (rate limited)' },
  { key: 'auto', label: 'Auto Router', slug: 'openrouter/auto', cost: 'Variable' },
]

const INTERVAL_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
]

function formatUsd(val: number): string {
  if (val < 0.0001) return '$0.0000'
  if (val < 0.01) return `$${val.toFixed(6)}`
  if (val < 1) return `$${val.toFixed(4)}`
  return `$${val.toFixed(2)}`
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

export function HeartbeatConfigPanel() {
  const [config, setConfig] = useState<HeartbeatConfig | null>(null)
  const [runs, setRuns] = useState<HeartbeatRun[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<string | null>(null)
  const [customModel, setCustomModel] = useState('')
  const [useCustomModel, setUseCustomModel] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [configRes, historyRes] = await Promise.all([
        fetch('/api/heartbeat/config'),
        fetch('/api/heartbeat/history?limit=5'),
      ])
      if (configRes.ok) {
        const c = await configRes.json()
        setConfig(c)
        const isPreset = MODEL_PRESETS.some((p) => p.slug === c.model)
        if (!isPreset) {
          setUseCustomModel(true)
          setCustomModel(c.model)
        }
      }
      if (historyRes.ok) {
        const h = await historyRes.json()
        setRuns(h.runs ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const saveConfig = async (updates: Partial<HeartbeatConfig>) => {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/heartbeat/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, ...updates }),
      })
      if (res.ok) {
        const updated = await res.json()
        setConfig(updated)
      }
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await fetch('/api/heartbeat', { method: 'POST' })
      const data = await res.json()
      let result = data.summary || ''
      if (data.dispatched && data.dispatched.length > 0) {
        result += '\n\n🤖 Dispatched:\n' + data.dispatched.map(
          (d: { title: string; action: string; agentId: string; costUsd: number }) =>
            `• ${d.action}: "${d.title}" → ${d.agentId} ($${d.costUsd.toFixed(4)})`
        ).join('\n')
      }
      setRunResult(result)
      // Refresh history
      const historyRes = await fetch('/api/heartbeat/history?limit=5')
      if (historyRes.ok) {
        const h = await historyRes.json()
        setRuns(h.runs ?? [])
      }
    } catch (err) {
      setRunResult(`Error: ${err}`)
    } finally {
      setRunning(false)
    }
  }

  if (loading || !config) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 shadow-sm">
        <p className="text-sm text-[var(--text-tertiary)]">Loading heartbeat config…</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-5 transition-colors duration-150 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Heartbeat Configuration</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Automated check-ins that review your kanban board and costs
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Enable toggle */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => void saveConfig({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[var(--text-disabled)] peer-focus:ring-1 peer-focus:ring-[var(--border-focus)] rounded-full peer peer-checked:bg-[var(--accent)] transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
          </label>
          <span className="text-xs text-[var(--text-secondary)]">
            {config.enabled ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Settings grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Interval */}
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">Check Interval</label>
          <select
            value={config.intervalMinutes}
            onChange={(e) => void saveConfig({ intervalMinutes: Number(e.target.value) })}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">LLM Model</label>
          <select
            value={useCustomModel ? 'custom' : config.model}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setUseCustomModel(true)
              } else {
                setUseCustomModel(false)
                void saveConfig({ model: e.target.value })
              }
            }}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
          >
            {MODEL_PRESETS.map((p) => (
              <option key={p.key} value={p.slug}>{p.label} — {p.cost}</option>
            ))}
            <option value="custom">Custom model…</option>
          </select>
          {useCustomModel && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="provider/model-slug"
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
              />
              <button
                type="button"
                onClick={() => void saveConfig({ model: customModel })}
                disabled={!customModel.trim()}
                className="px-3 py-2 text-xs bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40"
              >
                Set
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Checks */}
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-2 block">Active Checks</label>
        <div className="space-y-2">
          {/* Kanban Review */}
          <div className="flex items-center justify-between p-3 bg-[var(--bg-primary,var(--bg-secondary))] rounded-lg border border-[var(--border-secondary,var(--border-primary))]">
            <div>
              <span className="text-sm text-[var(--text-primary)]">📋 Kanban Review</span>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Analyze open tasks and suggest daily priorities</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.checks.kanbanReview}
                onChange={(e) => void saveConfig({ checks: { ...config.checks, kanbanReview: e.target.checked } })}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-[var(--text-disabled)] peer-focus:ring-1 peer-focus:ring-[var(--border-focus)] rounded-full peer peer-checked:bg-[var(--accent)] transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </label>
          </div>

          {/* Cost Check */}
          <div className="flex items-center justify-between p-3 bg-[var(--bg-primary,var(--bg-secondary))] rounded-lg border border-[var(--border-secondary,var(--border-primary))]">
            <div className="flex-1">
              <span className="text-sm text-[var(--text-primary)]">💸 Cost Monitor</span>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                Alert if daily spend exceeds threshold (every {config.checks.costCheckIntervalHours}h)
              </p>
              {config.checks.costCheck && (
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-[10px] text-[var(--text-tertiary)]">Threshold $</label>
                  <input
                    type="number"
                    value={config.checks.costCheckThresholdUsd}
                    onChange={(e) => void saveConfig({ checks: { ...config.checks, costCheckThresholdUsd: Number(e.target.value) } })}
                    min={1}
                    step={1}
                    className="w-16 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-[var(--text-primary)] text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                  />
                  <label className="text-[10px] text-[var(--text-tertiary)] ml-2">Every</label>
                  <select
                    value={config.checks.costCheckIntervalHours}
                    onChange={(e) => void saveConfig({ checks: { ...config.checks, costCheckIntervalHours: Number(e.target.value) } })}
                    className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-[var(--text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                  >
                    <option value={2}>2h</option>
                    <option value={4}>4h</option>
                    <option value={6}>6h</option>
                    <option value={12}>12h</option>
                    <option value={24}>24h</option>
                  </select>
                </div>
              )}
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={config.checks.costCheck}
                onChange={(e) => void saveConfig({ checks: { ...config.checks, costCheck: e.target.checked } })}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-[var(--text-disabled)] peer-focus:ring-1 peer-focus:ring-[var(--border-focus)] rounded-full peer peer-checked:bg-[var(--accent)] transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </label>
          </div>
        </div>
      </div>

      {/* Autonomous Mode */}
      <div className="bg-[var(--bg-primary,var(--bg-secondary))] border border-[var(--border-secondary,var(--border-primary))] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-primary)]">🤖 Autonomous Mode</span>
              {config.autonomousMode && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]">
                  Active
                </span>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
              When enabled, the heartbeat will dispatch tasks to generalist agents for execution — not just report on them
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.autonomousMode || false}
              onChange={(e) => void saveConfig({ autonomousMode: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[var(--text-disabled)] peer-focus:ring-1 peer-focus:ring-[var(--border-focus)] rounded-full peer peer-checked:bg-[var(--color-warning)] transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
          </label>
        </div>

        {config.autonomousMode && (
          <div className="space-y-2 pt-2 border-t border-[var(--border-secondary,var(--border-primary))]">
            <div className="flex items-center gap-3">
              <label className="text-xs text-[var(--text-secondary)]">Max tasks per run:</label>
              <select
                value={config.maxDispatchPerRun || 1}
                onChange={(e) => void saveConfig({ maxDispatchPerRun: Number(e.target.value) })}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-[var(--text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
              >
                <option value={1}>1 (conservative)</option>
                <option value={2}>2 (balanced)</option>
                <option value={3}>3 (aggressive)</option>
                <option value={5}>5 (max throughput)</option>
              </select>
            </div>
            <div className="text-[10px] text-[var(--text-disabled)] space-y-1">
              <p>🔄 <strong>Flow:</strong> Check in-progress → dispatch agents → pull high-priority backlog → update tasks</p>
              <p>💰 <strong>Cost:</strong> Each dispatch uses the agent&apos;s configured model (see Generalist cards below)</p>
              <p>📝 <strong>Output:</strong> Agent work is appended to the task description with timestamps</p>
            </div>
          </div>
        )}
      </div>

      {/* Run Now */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={running}
          className="px-4 py-2 text-sm bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40 font-medium"
        >
          {running ? '⏳ Running…' : '▶ Run Now'}
        </button>
        {saving && <span className="text-xs text-[var(--text-tertiary)]">Saving…</span>}
      </div>

      {/* Run result */}
      {runResult && (
        <div className="bg-[var(--bg-primary,var(--bg-secondary))] border border-[var(--border-secondary,var(--border-primary))] rounded-lg p-3">
          <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{runResult}</p>
        </div>
      )}

      {/* Recent runs */}
      {runs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Recent Runs</h4>
          <div className="space-y-1.5">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-start gap-3 p-2.5 rounded-lg border border-[var(--border-secondary,var(--border-primary))] bg-[var(--bg-primary,var(--bg-secondary))]"
              >
                <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${run.actionable ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{run.summary}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-disabled)]">
                    <span>{timeAgo(run.timestamp)}</span>
                    <span>{run.taskCount} tasks</span>
                    {run.model && <span className="font-mono truncate">{run.model.split('/').pop()}</span>}
                    <span>{formatUsd(run.costUsd)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
