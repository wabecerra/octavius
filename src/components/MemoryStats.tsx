'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface Stats {
  total: number
  byType: Record<string, number>
  byLayer: Record<string, number>
  byQuadrant: Record<string, number>
  embeddingCoverage: number
}

interface JobStatus {
  job_name: string
  started_at: string
  completed_at: string
  success: boolean
}

const QUADRANT_COLORS: Record<string, string> = {
  lifeforce: 'var(--quadrant-lifeforce)',
  industry: 'var(--quadrant-industry)',
  fellowship: 'var(--quadrant-fellowship)',
  essence: 'var(--quadrant-essence)',
  untagged: 'var(--text-tertiary)',
}

const TYPE_COLORS: Record<string, string> = {
  episodic: '#3b82f6',
  semantic: '#22c55e',
  procedural: '#f59e0b',
  entity_profile: '#a855f7',
}

const TYPE_LABELS: Record<string, string> = {
  episodic: 'Episodic',
  semantic: 'Semantic',
  procedural: 'Procedural',
  entity_profile: 'Entity',
}

const QUADRANT_LABELS: Record<string, string> = {
  lifeforce: 'Lifeforce',
  industry: 'Industry',
  fellowship: 'Fellowship',
  essence: 'Essence',
  untagged: 'Untagged',
}

export function MemoryStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [jobs, setJobs] = useState<JobStatus[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, jobsRes] = await Promise.all([
        fetch('/api/memory/stats'),
        fetch('/api/memory/jobs'),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (jobsRes.ok) {
        const data = await jobsRes.json()
        setJobs(Array.isArray(data) ? data : data.runs ?? [])
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
        <div className="animate-pulse flex gap-6">
          <div className="h-16 w-24 bg-[var(--bg-tertiary)] rounded-lg" />
          <div className="h-16 flex-1 bg-[var(--bg-tertiary)] rounded-lg" />
          <div className="h-16 flex-1 bg-[var(--bg-tertiary)] rounded-lg" />
        </div>
      </div>
    )
  }

  if (!stats) return null

  const typeChartData = Object.entries(stats.byType).map(([type, count]) => ({
    name: TYPE_LABELS[type] ?? type,
    value: count,
    fill: TYPE_COLORS[type] ?? '#71717a',
  }))

  const latestJobs: Record<string, JobStatus> = {}
  for (const j of jobs) {
    if (!latestJobs[j.job_name] || j.started_at > latestJobs[j.job_name].started_at) {
      latestJobs[j.job_name] = j
    }
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🧠</span>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Memory Overview
        </h2>
        <span className="ml-auto text-xs text-[var(--text-secondary)]">
          {stats.total} items
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Type breakdown + chart */}
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-2">By Type</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(stats.byType).map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: `${TYPE_COLORS[type]}20`,
                  color: TYPE_COLORS[type],
                }}
              >
                {TYPE_LABELS[type]} {count}
              </span>
            ))}
          </div>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeChartData} barSize={20}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                  cursor={{ fill: 'transparent' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {typeChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quadrant breakdown */}
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-2">By Quadrant</p>
          <div className="space-y-2">
            {Object.entries(stats.byQuadrant)
              .filter(([, count]) => count > 0)
              .map(([q, count]) => {
                const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
                return (
                  <div key={q}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span style={{ color: QUADRANT_COLORS[q] }}>
                        {QUADRANT_LABELS[q]}
                      </span>
                      <span className="text-[var(--text-secondary)]">{count}</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: QUADRANT_COLORS[q],
                        }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Embedding + Jobs */}
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-2">System</p>
          <div className="space-y-3">
            {/* Embedding coverage */}
            <div>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-[var(--text-secondary)]">Embedding coverage</span>
                <span className="text-[var(--text-primary)]">
                  {Math.round(stats.embeddingCoverage * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-2)] rounded-full transition-all duration-300"
                  style={{ width: `${stats.embeddingCoverage * 100}%` }}
                />
              </div>
            </div>

            {/* Job statuses */}
            <div className="space-y-1.5">
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                Last Jobs
              </p>
              {Object.entries(latestJobs).length === 0 && (
                <p className="text-xs text-[var(--text-secondary)] italic">No jobs run yet</p>
              )}
              {Object.entries(latestJobs).map(([name, job]) => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      job.success ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'
                    }`}
                  />
                  <span className="text-[var(--text-secondary)] capitalize">
                    {name.replace(/_/g, ' ')}
                  </span>
                  <span className="ml-auto text-[var(--text-tertiary)]">
                    {timeAgo(job.completed_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
