'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MemoryConfig } from '@/lib/memory/models'

/** Default config values matching the MemoryConfig interface defaults. */
const DEFAULTS: MemoryConfig = {
  consolidation_schedule: '0 2 * * *',
  decay_schedule: '0 3 * * *',
  evolution_schedule: '0 4 * * *',
  decay_archive_threshold: 0.2,
  decay_deletion_threshold: 0.05,
  novelty_similarity_threshold: 0.9,
  quality_gate_min_confidence: 0.3,
  embedding_enabled: false,
  embedding_endpoint: 'http://localhost:11434',
  embedding_model: 'nomic-embed-text',
  api_secret_token: '',
  context_retrieval_top_n: 10,
  reranking_enabled: false,
  query_expansion_enabled: false,
  smart_chunking_target_tokens: 900,
}

interface JobStatus {
  job_name: string
  started_at: string
  completed_at: string
  success: boolean
}

const inputClass =
  'w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150'
const labelClass = 'text-xs text-[var(--text-secondary)] mb-1 block'

export function MemoryConfigSection() {
  const [config, setConfig] = useState<MemoryConfig>(DEFAULTS)
  const [jobStatuses, setJobStatuses] = useState<JobStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/memory/config')
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
      }
    } catch {
      // Memory service may not be running — use defaults
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchJobStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/memory/jobs')
      if (res.ok) {
        const data = await res.json()
        setJobStatuses(data.jobs ?? [])
      }
    } catch {
      // Silently fail
    }
  }, [])

  useEffect(() => {
    fetchConfig()
    fetchJobStatuses()
  }, [fetchConfig, fetchJobStatuses])

  const saveConfig = async (updates: Partial<MemoryConfig>) => {
    setSaving(true)
    setError(null)
    const newConfig = { ...config, ...updates }
    setConfig(newConfig)

    try {
      const res = await fetch('/api/memory/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save')
      }
    } catch {
      setError('Memory service unreachable')
    } finally {
      setSaving(false)
    }
  }

  const getJobStatus = (name: string): JobStatus | undefined =>
    jobStatuses.find((j) => j.job_name === name)

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
        <p className="text-sm text-[var(--text-tertiary)]">Loading memory configuration...</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Memory Configuration</h3>
        {saving && <span className="text-xs text-[var(--accent)]">Saving...</span>}
        {error && <span className="text-xs text-[var(--color-error)]">{error}</span>}
      </div>

      {/* Schedules */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--text-secondary)]">Job Schedules</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Consolidation Schedule</label>
            <input
              type="text"
              value={config.consolidation_schedule}
              onChange={(e) => saveConfig({ consolidation_schedule: e.target.value })}
              className={inputClass}
            />
            <JobStatusBadge status={getJobStatus('consolidation')} />
          </div>
          <div>
            <label className={labelClass}>Decay Schedule</label>
            <input
              type="text"
              value={config.decay_schedule}
              onChange={(e) => saveConfig({ decay_schedule: e.target.value })}
              className={inputClass}
            />
            <JobStatusBadge status={getJobStatus('decay')} />
          </div>
          <div>
            <label className={labelClass}>Evolution Schedule</label>
            <input
              type="text"
              value={config.evolution_schedule}
              onChange={(e) => saveConfig({ evolution_schedule: e.target.value })}
              className={inputClass}
            />
            <JobStatusBadge status={getJobStatus('evolution')} />
          </div>
        </div>
      </div>

      {/* Thresholds */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--text-secondary)]">Thresholds</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Decay Archive Threshold</label>
            <input
              type="number"
              min={0} max={1} step={0.01}
              value={config.decay_archive_threshold}
              onChange={(e) => saveConfig({ decay_archive_threshold: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Decay Deletion Threshold</label>
            <input
              type="number"
              min={0} max={1} step={0.01}
              value={config.decay_deletion_threshold}
              onChange={(e) => saveConfig({ decay_deletion_threshold: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Novelty Similarity</label>
            <input
              type="number"
              min={0} max={1} step={0.01}
              value={config.novelty_similarity_threshold}
              onChange={(e) => saveConfig({ novelty_similarity_threshold: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Quality Gate Min Confidence</label>
            <input
              type="number"
              min={0} max={1} step={0.01}
              value={config.quality_gate_min_confidence}
              onChange={(e) => saveConfig({ quality_gate_min_confidence: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Embeddings */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--text-secondary)]">Embeddings</h4>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.embedding_enabled}
              onChange={(e) => saveConfig({ embedding_enabled: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--accent)] focus:ring-[var(--border-focus)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">Enable embeddings</span>
          </label>
        </div>
        {config.embedding_enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Embedding Endpoint</label>
              <input
                type="text"
                value={config.embedding_endpoint}
                onChange={(e) => saveConfig({ embedding_endpoint: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Embedding Model</label>
              <input
                type="text"
                value={config.embedding_model}
                onChange={(e) => saveConfig({ embedding_model: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function JobStatusBadge({ status }: { status?: JobStatus }) {
  if (!status) return <span className="text-xs text-[var(--text-disabled)] mt-1 block">No runs yet</span>

  const time = new Date(status.completed_at).toLocaleString()
  return (
    <span className={`text-xs mt-1 block ${status.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
      {status.success ? '✓' : '✗'} Last run: {time}
    </span>
  )
}
