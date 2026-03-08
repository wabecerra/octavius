'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

// ── Types ──

interface DashboardStats {
  total_logs: number
  total_cost_usd: number
  total_tokens: number
  models_used: number
  cost_today_usd: number
  cost_this_week_usd: number
  top_models: Array<{ model: string; cost_usd: number; requests: number }>
  error_rate: number
  registry: Record<string, number>
}

interface TimeseriesPoint {
  timestamp: string
  cost_usd: number
  tokens: number
  requests: number
}

interface LogRecord {
  id: string
  timestamp: string
  provider: string
  model: string
  request_type: string
  streaming: boolean
  tokens: { input: number; output: number; total: number; cached_input?: number }
  cost: { input_cost_usd: number; output_cost_usd: number; total_cost_usd: number; is_estimated: boolean }
  latency: { total_ms: number; time_to_first_token_ms?: number | null }
  status: string
  agent_id?: string
  session_id?: string
  error_message?: string
}

interface Budget {
  id: string
  name: string
  period: string
  limit_usd: number
  enforcement: string
  current_spend_usd?: number
  percent_used?: number
  period_start?: string
  period_end?: string
  model?: string
  provider?: string
}

interface AlertRule {
  id: string
  name: string
  enabled: boolean
  type: string
  condition: { metric: string; operator: string; threshold: number; window_minutes?: number }
  severity: string
  last_triggered_at?: string
  trigger_count: number
}

interface AlertEvent {
  id: string
  rule_name: string
  triggered_at: string
  resolved_at?: string
  severity: string
  metric_value: number
  threshold_value: number
}

interface ModelEntry {
  model_id: string
  provider: string
  display_name: string
  mode: string
  pricing: { input_cost_per_million: number; output_cost_per_million: number }
}

// ── Utility ──

function formatUsd(val: number): string {
  if (val < 0.01) return `$${val.toFixed(6)}`
  if (val < 1) return `$${val.toFixed(4)}`
  return `$${val.toFixed(2)}`
}

function formatTokens(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`
  return String(val)
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

const MODEL_COLORS = ['#ff5c5c', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#6366f1']

// ── Main Component ──

export function CostDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([])
  const [logs, setLogs] = useState<LogRecord[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [alerts, setAlerts] = useState<{ rules: AlertRule[]; events: AlertEvent[] }>({ rules: [], events: [] })
  const [models, setModels] = useState<ModelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'budgets' | 'alerts' | 'models'>('overview')

  // Filters
  const [timeRange, setTimeRange] = useState('7d')
  const [logPage, setLogPage] = useState(0)
  const [logFilter, setLogFilter] = useState({ model: '', provider: '', status: '' })
  const [syncing, setSyncing] = useState(false)

  const getTimeRange = useCallback(() => {
    const end = new Date().toISOString()
    const now = Date.now()
    let start: string
    switch (timeRange) {
      case '1h': start = new Date(now - 3600000).toISOString(); break
      case '24h': start = new Date(now - 86400000).toISOString(); break
      case '7d': start = new Date(now - 7 * 86400000).toISOString(); break
      case '30d': start = new Date(now - 30 * 86400000).toISOString(); break
      case '90d': start = new Date(now - 90 * 86400000).toISOString(); break
      default: start = new Date(now - 7 * 86400000).toISOString()
    }
    return { start, end }
  }, [timeRange])

  const granularity = timeRange === '1h' ? 'hour' : timeRange === '24h' ? 'hour' : 'day'

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { start, end } = getTimeRange()
    try {
      const [statsRes, tsRes, logsRes, budgetRes, alertRes] = await Promise.all([
        fetch('/api/llm-cost/stats'),
        fetch(`/api/llm-cost/costs/timeseries?start_time=${start}&end_time=${end}&granularity=${granularity}`),
        fetch(`/api/llm-cost/logs?limit=50&offset=${logPage * 50}${logFilter.model ? `&model=${logFilter.model}` : ''}${logFilter.provider ? `&provider=${logFilter.provider}` : ''}${logFilter.status ? `&status=${logFilter.status}` : ''}`),
        fetch('/api/llm-cost/budgets'),
        fetch('/api/llm-cost/alerts?include_disabled=true'),
      ])

      if (statsRes.ok) setStats(await statsRes.json())
      if (tsRes.ok) {
        const tsData = await tsRes.json()
        setTimeseries(tsData.data ?? [])
      }
      if (logsRes.ok) {
        const logData = await logsRes.json()
        setLogs(logData.data ?? [])
        setLogTotal(logData.pagination?.total ?? 0)
      }
      if (budgetRes.ok) {
        const bData = await budgetRes.json()
        setBudgets(bData.budgets ?? [])
      }
      if (alertRes.ok) setAlerts(await alertRes.json())
    } catch (err) {
      console.error('Failed to fetch cost data:', err)
    } finally {
      setLoading(false)
    }
  }, [getTimeRange, granularity, logPage, logFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch models on models tab
  useEffect(() => {
    if (activeTab === 'models' && models.length === 0) {
      fetch('/api/llm-cost/models')
        .then((r) => r.json())
        .then((d) => setModels(d.models ?? []))
        .catch(console.error)
    }
  }, [activeTab, models.length])

  const syncModels = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/llm-cost/models/sync', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        console.log('Synced:', data)
        // Refresh models list
        const mRes = await fetch('/api/llm-cost/models')
        if (mRes.ok) setModels((await mRes.json()).models ?? [])
      }
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  // ── Budget CRUD ──
  const [newBudgetOpen, setNewBudgetOpen] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ name: '', period: 'monthly', limit_usd: '', enforcement: 'monitor_only' })

  const createBudget = async () => {
    if (!budgetForm.name || !budgetForm.limit_usd) return
    try {
      await fetch('/api/llm-cost/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: budgetForm.name,
          period: budgetForm.period,
          limit_usd: Number(budgetForm.limit_usd),
          enforcement: budgetForm.enforcement,
        }),
      })
      setBudgetForm({ name: '', period: 'monthly', limit_usd: '', enforcement: 'monitor_only' })
      setNewBudgetOpen(false)
      fetchData()
    } catch (err) { console.error(err) }
  }

  const deleteBudget = async (id: string) => {
    try {
      await fetch(`/api/llm-cost/budgets?id=${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err) { console.error(err) }
  }

  // ── Alert CRUD ──
  const [newAlertOpen, setNewAlertOpen] = useState(false)
  const [alertForm, setAlertForm] = useState({
    name: '', type: 'cost_absolute', metric: 'cost_total_usd',
    operator: 'gt', threshold: '', window_minutes: '60', severity: 'warning',
  })

  const createAlert = async () => {
    if (!alertForm.name || !alertForm.threshold) return
    try {
      await fetch('/api/llm-cost/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: alertForm.name,
          type: alertForm.type,
          condition: {
            metric: alertForm.metric,
            operator: alertForm.operator,
            threshold: Number(alertForm.threshold),
            window_minutes: Number(alertForm.window_minutes),
          },
          severity: alertForm.severity,
        }),
      })
      setAlertForm({ name: '', type: 'cost_absolute', metric: 'cost_total_usd', operator: 'gt', threshold: '', window_minutes: '60', severity: 'warning' })
      setNewAlertOpen(false)
      fetchData()
    } catch (err) { console.error(err) }
  }

  const toggleAlert = async (id: string, enabled: boolean) => {
    try {
      await fetch('/api/llm-cost/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      })
      fetchData()
    } catch (err) { console.error(err) }
  }

  const deleteAlert = async (id: string) => {
    try {
      await fetch(`/api/llm-cost/alerts?id=${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err) { console.error(err) }
  }

  const evaluateAlerts = async () => {
    try {
      await fetch('/api/llm-cost/alerts/evaluate', { method: 'POST' })
      fetchData()
    } catch (err) { console.error(err) }
  }

  // ── Sub-tabs ──
  const tabs = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'logs', label: 'Logs', icon: '📋' },
    { key: 'budgets', label: 'Budgets', icon: '💰' },
    { key: 'alerts', label: 'Alerts', icon: '🔔' },
    { key: 'models', label: 'Models', icon: '🤖' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
              activeTab === tab.key
                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
            {tab.key === 'alerts' && alerts.events.filter(e => !e.resolved_at).length > 0 && (
              <span className="ml-1.5 bg-[var(--color-error)] text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {alerts.events.filter(e => !e.resolved_at).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Time Range Selector (for overview) */}
      {activeTab === 'overview' && (
        <div className="flex items-center gap-2">
          {['1h', '24h', '7d', '30d', '90d'].map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                timeRange === r
                  ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]'
                  : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {r}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      )}

      {loading && !stats ? (
        <div className="text-center py-12 text-[var(--text-tertiary)]">Loading cost data…</div>
      ) : (
        <>
          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === 'overview' && stats && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Total Spend" value={formatUsd(stats.total_cost_usd)} icon="💸" />
                <KpiCard label="Today" value={formatUsd(stats.cost_today_usd)} icon="📅"
                  sub={`This week: ${formatUsd(stats.cost_this_week_usd)}`} />
                <KpiCard label="Requests" value={stats.total_logs.toLocaleString()} icon="📨"
                  sub={`${stats.models_used} models`} />
                <KpiCard label="Tokens" value={formatTokens(stats.total_tokens)} icon="🔤"
                  sub={`Error rate: ${stats.error_rate.toFixed(1)}%`} />
              </div>

              {/* Cost Over Time */}
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Cost Over Time</h3>
                {timeseries.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No data for this time range</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timeseries}>
                        <defs>
                          <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ff5c5c" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ff5c5c" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="timestamp" tick={{ fill: '#6B7280', fontSize: 10 }}
                          tickFormatter={(v: string) => granularity === 'hour' ? v.slice(11, 16) : v.slice(5, 10)}
                          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                        <YAxis tick={{ fill: '#6B7280', fontSize: 10 }}
                          tickFormatter={(v: number) => formatUsd(v)}
                          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                          formatter={(value) => [formatUsd(Number(value)), 'Cost']}
                          labelFormatter={(l) => String(l)}
                        />
                        <Area type="monotone" dataKey="cost_usd" stroke="#ff5c5c" strokeWidth={2} fill="url(#costGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Model Breakdown + Budget Summary side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Models */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Cost by Model</h3>
                  {stats.top_models.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No usage data yet</p>
                  ) : (
                    <>
                      <div className="h-48 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.top_models.slice(0, 8)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 10 }} tickFormatter={(v: number) => formatUsd(v)} />
                            <YAxis type="category" dataKey="model" tick={{ fill: '#9CA3AF', fontSize: 10 }} width={120} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                              formatter={(value) => [formatUsd(Number(value)), 'Cost']}
                            />
                            <Bar dataKey="cost_usd" radius={[0, 4, 4, 0]}>
                              {stats.top_models.slice(0, 8).map((_, i) => (
                                <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5">
                        {stats.top_models.slice(0, 5).map((m, i) => (
                          <div key={m.model} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                              <span className="text-[var(--text-secondary)] font-mono truncate max-w-[180px]">{m.model}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[var(--text-tertiary)]">
                              <span>{formatUsd(m.cost_usd)}</span>
                              <span>{m.requests} req</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Budget Summary */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Budgets</h3>
                    <button onClick={() => setActiveTab('budgets')} className="text-xs text-[var(--accent)] hover:underline">
                      Manage →
                    </button>
                  </div>
                  {budgets.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No budgets configured</p>
                  ) : (
                    <div className="space-y-3">
                      {budgets.map((b) => (
                        <div key={b.id} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-secondary)] font-medium">{b.name}</span>
                            <span className="text-[var(--text-tertiary)]">
                              {formatUsd(b.current_spend_usd ?? 0)} / {formatUsd(b.limit_usd)}
                            </span>
                          </div>
                          <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(b.percent_used ?? 0, 100)}%`,
                                backgroundColor: (b.percent_used ?? 0) > 90 ? '#ef4444'
                                  : (b.percent_used ?? 0) > 70 ? '#eab308' : '#22c55e',
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-disabled)]">
                            <span>{b.period} · {b.enforcement.replace('_', ' ')}</span>
                            <span>{(b.percent_used ?? 0).toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Alerts */}
              {alerts.events.length > 0 && (
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Alerts</h3>
                  <div className="space-y-2">
                    {alerts.events.slice(0, 5).map((evt) => (
                      <div key={evt.id} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg border ${
                        evt.severity === 'critical' ? 'border-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_5%,transparent)]'
                          : evt.severity === 'warning' ? 'border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_5%,transparent)]'
                          : 'border-[var(--border-primary)]'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span>{evt.severity === 'critical' ? '🔴' : evt.severity === 'warning' ? '🟡' : '🔵'}</span>
                          <span className="text-[var(--text-secondary)]">{evt.rule_name}</span>
                        </div>
                        <span className="text-[var(--text-tertiary)]">{timeAgo(evt.triggered_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ LOGS TAB ═══ */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Filter model..."
                  value={logFilter.model}
                  onChange={(e) => { setLogFilter(f => ({ ...f, model: e.target.value })); setLogPage(0) }}
                  className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-[var(--text-primary)] text-xs font-mono placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] w-40"
                />
                <select
                  value={logFilter.status}
                  onChange={(e) => { setLogFilter(f => ({ ...f, status: e.target.value })); setLogPage(0) }}
                  className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-[var(--text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                >
                  <option value="">All statuses</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                  <option value="timeout">Timeout</option>
                  <option value="rate_limited">Rate Limited</option>
                </select>
                <select
                  value={logFilter.provider}
                  onChange={(e) => { setLogFilter(f => ({ ...f, provider: e.target.value })); setLogPage(0) }}
                  className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-[var(--text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                >
                  <option value="">All providers</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="bedrock">Bedrock</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
                <span className="text-xs text-[var(--text-tertiary)] self-center ml-auto">
                  {logTotal} total records
                </span>
              </div>

              {/* Log Table */}
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-primary)]">
                        <th className="text-left px-4 py-3 text-[var(--text-tertiary)] font-medium">Time</th>
                        <th className="text-left px-4 py-3 text-[var(--text-tertiary)] font-medium">Model</th>
                        <th className="text-left px-4 py-3 text-[var(--text-tertiary)] font-medium">Provider</th>
                        <th className="text-right px-4 py-3 text-[var(--text-tertiary)] font-medium">Tokens</th>
                        <th className="text-right px-4 py-3 text-[var(--text-tertiary)] font-medium">Cost</th>
                        <th className="text-right px-4 py-3 text-[var(--text-tertiary)] font-medium">Latency</th>
                        <th className="text-center px-4 py-3 text-[var(--text-tertiary)] font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                          <td className="px-4 py-2.5 text-[var(--text-tertiary)] font-mono whitespace-nowrap">
                            {timeAgo(log.timestamp)}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--text-primary)] font-mono truncate max-w-[200px]">
                            {log.model}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--text-secondary)] capitalize">
                            {log.provider}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)] font-mono">
                            <span className="text-[var(--text-tertiary)]">{formatTokens(log.tokens.input)}→</span>
                            {formatTokens(log.tokens.output)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            <span className={log.cost.is_estimated ? 'text-[var(--color-warning)]' : 'text-[var(--text-primary)]'}>
                              {formatUsd(log.cost.total_cost_usd)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)] font-mono">
                            {log.latency.total_ms}ms
                            {log.latency.time_to_first_token_ms != null && (
                              <span className="text-[var(--text-disabled)]"> ({log.latency.time_to_first_token_ms}ms ttft)</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              log.status === 'success' ? 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]'
                                : log.status === 'error' ? 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)]'
                                : 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {logs.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                            No logs found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {logTotal > 50 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-primary)]">
                    <button
                      disabled={logPage === 0}
                      onClick={() => setLogPage(p => p - 1)}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                    >
                      ← Previous
                    </button>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      Page {logPage + 1} of {Math.ceil(logTotal / 50)}
                    </span>
                    <button
                      disabled={(logPage + 1) * 50 >= logTotal}
                      onClick={() => setLogPage(p => p + 1)}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ BUDGETS TAB ═══ */}
          {activeTab === 'budgets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Budget Management</h3>
                <button
                  onClick={() => setNewBudgetOpen(!newBudgetOpen)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium"
                >
                  + New Budget
                </button>
              </div>

              {/* Create Budget Form */}
              {newBudgetOpen && (
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 space-y-3 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Budget name"
                      value={budgetForm.name}
                      onChange={(e) => setBudgetForm(f => ({ ...f, name: e.target.value }))}
                      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Limit (USD)"
                      value={budgetForm.limit_usd}
                      onChange={(e) => setBudgetForm(f => ({ ...f, limit_usd: e.target.value }))}
                      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                    />
                    <select
                      value={budgetForm.period}
                      onChange={(e) => setBudgetForm(f => ({ ...f, period: e.target.value }))}
                      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <select
                      value={budgetForm.enforcement}
                      onChange={(e) => setBudgetForm(f => ({ ...f, enforcement: e.target.value }))}
                      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                    >
                      <option value="monitor_only">Monitor Only</option>
                      <option value="soft_limit">Soft Limit</option>
                      <option value="hard_limit">Hard Limit</option>
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setNewBudgetOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Cancel</button>
                    <button onClick={createBudget} className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] text-xs font-medium hover:bg-[var(--bg-hover)] transition-colors">Create</button>
                  </div>
                </div>
              )}

              {/* Budget Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {budgets.map((b) => (
                  <div key={b.id} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-[var(--text-primary)]">{b.name}</h4>
                      <button
                        onClick={() => deleteBudget(b.id)}
                        className="text-xs text-[var(--color-error)] opacity-50 hover:opacity-100 transition-opacity"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-[var(--text-primary)]">{formatUsd(b.current_spend_usd ?? 0)}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">/ {formatUsd(b.limit_usd)}</span>
                    </div>
                    <div className="h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(b.percent_used ?? 0, 100)}%`,
                          backgroundColor: (b.percent_used ?? 0) > 90 ? '#ef4444' : (b.percent_used ?? 0) > 70 ? '#eab308' : '#22c55e',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-disabled)]">
                      <span>{b.period} · {b.enforcement.replace('_', ' ')}</span>
                      <span>{(b.percent_used ?? 0).toFixed(1)}% used</span>
                    </div>
                  </div>
                ))}
                {budgets.length === 0 && (
                  <div className="col-span-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-8 text-center shadow-sm">
                    <p className="text-[var(--text-tertiary)] text-sm">No budgets yet. Create one to track spending.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ ALERTS TAB ═══ */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Alert Rules</h3>
                <div className="flex gap-2">
                  <button
                    onClick={evaluateAlerts}
                    className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    ⚡ Evaluate Now
                  </button>
                  <button
                    onClick={() => setNewAlertOpen(!newAlertOpen)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium"
                  >
                    + New Rule
                  </button>
                </div>
              </div>

              {/* Create Alert Form */}
              {newAlertOpen && (
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 space-y-3 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Alert name"
                      value={alertForm.name}
                      onChange={(e) => setAlertForm(f => ({ ...f, name: e.target.value }))}
                      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                    />
                    <select
                      value={alertForm.metric}
                      onChange={(e) => setAlertForm(f => ({ ...f, metric: e.target.value }))}
                      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                    >
                      <option value="cost_total_usd">Total Cost (USD)</option>
                      <option value="error_rate">Error Rate (%)</option>
                      <option value="avg_latency_ms">Avg Latency (ms)</option>
                      <option value="request_count">Request Count</option>
                      <option value="tokens_total">Total Tokens</option>
                    </select>
                    <div className="flex gap-2">
                      <select
                        value={alertForm.operator}
                        onChange={(e) => setAlertForm(f => ({ ...f, operator: e.target.value }))}
                        className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] w-20"
                      >
                        <option value="gt">&gt;</option>
                        <option value="gte">≥</option>
                        <option value="lt">&lt;</option>
                        <option value="lte">≤</option>
                      </select>
                      <input
                        type="number"
                        step="any"
                        placeholder="Threshold"
                        value={alertForm.threshold}
                        onChange={(e) => setAlertForm(f => ({ ...f, threshold: e.target.value }))}
                        className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Window (min)"
                        value={alertForm.window_minutes}
                        onChange={(e) => setAlertForm(f => ({ ...f, window_minutes: e.target.value }))}
                        className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                      />
                      <select
                        value={alertForm.severity}
                        onChange={(e) => setAlertForm(f => ({ ...f, severity: e.target.value }))}
                        className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                      >
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setNewAlertOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Cancel</button>
                    <button onClick={createAlert} className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] text-xs font-medium hover:bg-[var(--bg-hover)] transition-colors">Create</button>
                  </div>
                </div>
              )}

              {/* Alert Rules List */}
              <div className="space-y-2">
                {alerts.rules.map((rule) => (
                  <div key={rule.id} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleAlert(rule.id, !rule.enabled)}
                        className={`w-10 h-5 rounded-full transition-colors duration-200 relative ${
                          rule.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                          rule.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                      <div>
                        <p className="text-sm text-[var(--text-primary)] font-medium">{rule.name}</p>
                        <p className="text-[10px] text-[var(--text-tertiary)]">
                          {rule.condition.metric} {rule.condition.operator} {rule.condition.threshold}
                          {rule.condition.window_minutes ? ` (${rule.condition.window_minutes}min window)` : ''}
                          {' · '}
                          <span className={
                            rule.severity === 'critical' ? 'text-[var(--color-error)]'
                              : rule.severity === 'warning' ? 'text-[var(--color-warning)]'
                              : 'text-[var(--color-info)]'
                          }>{rule.severity}</span>
                          {rule.trigger_count > 0 && ` · triggered ${rule.trigger_count}×`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteAlert(rule.id)}
                      className="text-xs text-[var(--color-error)] opacity-50 hover:opacity-100 transition-opacity"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {alerts.rules.length === 0 && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-8 text-center shadow-sm">
                    <p className="text-[var(--text-tertiary)] text-sm">No alert rules configured</p>
                  </div>
                )}
              </div>

              {/* Recent Events */}
              {alerts.events.length > 0 && (
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 space-y-3 shadow-sm">
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">Recent Events</h4>
                  <div className="space-y-2">
                    {alerts.events.map((evt) => (
                      <div key={evt.id} className="flex items-center justify-between text-xs bg-[var(--bg-secondary)] rounded-lg px-3 py-2 border border-[var(--border-primary)]">
                        <div className="flex items-center gap-2">
                          <span>{evt.severity === 'critical' ? '🔴' : evt.severity === 'warning' ? '🟡' : '🔵'}</span>
                          <span className="text-[var(--text-secondary)]">{evt.rule_name}</span>
                          <span className="text-[var(--text-disabled)]">
                            value={typeof evt.metric_value === 'number' ? evt.metric_value.toFixed(2) : evt.metric_value} threshold={evt.threshold_value}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--text-tertiary)]">{timeAgo(evt.triggered_at)}</span>
                          {evt.resolved_at ? (
                            <span className="text-[var(--color-success)] text-[10px]">Resolved</span>
                          ) : (
                            <span className="text-[var(--color-error)] text-[10px]">Active</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ MODELS TAB ═══ */}
          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Model Registry
                  <span className="text-[var(--text-tertiary)] font-normal ml-2">({models.length} models)</span>
                </h3>
                <button
                  onClick={syncModels}
                  disabled={syncing}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium disabled:opacity-40"
                >
                  {syncing ? 'Syncing…' : '↻ Sync from LiteLLM'}
                </button>
              </div>

              {/* Provider Summary */}
              {stats?.registry && Object.keys(stats.registry).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.registry).sort((a, b) => b[1] - a[1]).map(([provider, count]) => (
                    <span key={provider} className="px-2.5 py-1 rounded-lg text-xs bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-secondary)]">
                      {provider}: {count}
                    </span>
                  ))}
                </div>
              )}

              {/* Models Table */}
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                      <tr className="border-b border-[var(--border-primary)]">
                        <th className="text-left px-4 py-3 text-[var(--text-tertiary)] font-medium">Model</th>
                        <th className="text-left px-4 py-3 text-[var(--text-tertiary)] font-medium">Provider</th>
                        <th className="text-left px-4 py-3 text-[var(--text-tertiary)] font-medium">Mode</th>
                        <th className="text-right px-4 py-3 text-[var(--text-tertiary)] font-medium">Input $/1M</th>
                        <th className="text-right px-4 py-3 text-[var(--text-tertiary)] font-medium">Output $/1M</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map((m) => (
                        <tr key={m.model_id} className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                          <td className="px-4 py-2 text-[var(--text-primary)] font-mono">{m.model_id}</td>
                          <td className="px-4 py-2 text-[var(--text-secondary)] capitalize">{m.provider}</td>
                          <td className="px-4 py-2 text-[var(--text-tertiary)]">{m.mode}</td>
                          <td className="px-4 py-2 text-right text-[var(--text-secondary)] font-mono">{formatUsd(m.pricing.input_cost_per_million)}</td>
                          <td className="px-4 py-2 text-right text-[var(--text-secondary)] font-mono">{formatUsd(m.pricing.output_cost_per_million)}</td>
                        </tr>
                      ))}
                      {models.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                            No models in registry. Click &quot;Sync from LiteLLM&quot; to populate.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── KPI Card ──

function KpiCard({ label, value, icon, sub }: { label: string; value: string; icon: string; sub?: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-disabled)] mt-0.5">{sub}</p>}
    </div>
  )
}
