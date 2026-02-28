'use client'

import { useState } from 'react'

export interface ScheduledJobView {
  id: string
  name: string
  cronExpression: string
  agentId: string
  taskTemplate: string
  enabled: boolean
  lastRun?: { success: boolean; completedAt: string }
}

export interface ScheduledJobsPanelProps {
  jobs: ScheduledJobView[]
  onCreateJob: (job: { name: string; cronExpression: string; agentId: string; taskTemplate: string; enabled: boolean }) => void
  onUpdateJob: (id: string, updates: Partial<ScheduledJobView>) => void
  onDeleteJob: (id: string) => void
  onTriggerJob: (id: string) => void
}

export function ScheduledJobsPanel({
  jobs,
  onCreateJob,
  onUpdateJob,
  onDeleteJob,
  onTriggerJob,
}: ScheduledJobsPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', cronExpression: '', agentId: '', taskTemplate: '', enabled: true })

  const resetForm = () => {
    setForm({ name: '', cronExpression: '', agentId: '', taskTemplate: '', enabled: true })
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = () => {
    if (!form.name.trim() || !form.cronExpression.trim() || !form.agentId.trim() || !form.taskTemplate.trim()) return
    if (editingId) {
      onUpdateJob(editingId, form)
    } else {
      onCreateJob(form)
    }
    resetForm()
  }

  const startEdit = (job: ScheduledJobView) => {
    setForm({
      name: job.name,
      cronExpression: job.cronExpression,
      agentId: job.agentId,
      taskTemplate: job.taskTemplate,
      enabled: job.enabled,
    })
    setEditingId(job.id)
    setShowForm(true)
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Scheduled Jobs</h3>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="px-3 py-1.5 text-xs bg-[var(--accent-muted)] border border-[var(--accent)] rounded-lg text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
        >
          {showForm ? 'Cancel' : 'New Job'}
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="space-y-3 p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Job Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Weekly review"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Cron Expression</label>
              <input
                type="text"
                value={form.cronExpression}
                onChange={(e) => setForm({ ...form, cronExpression: e.target.value })}
                placeholder="0 9 * * 1"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Target Agent</label>
              <input
                type="text"
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                placeholder="generalist-career"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
              />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="rounded border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--accent)] focus:ring-[var(--border-focus)]"
                />
                Enabled
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Task Template</label>
            <textarea
              value={form.taskTemplate}
              onChange={(e) => setForm({ ...form, taskTemplate: e.target.value })}
              placeholder="Review this week's progress and create a summary..."
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150"
          >
            {editingId ? 'Update Job' : 'Create Job'}
          </button>
        </div>
      )}

      {/* Job list */}
      {jobs.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No scheduled jobs</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-secondary)]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${job.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--text-tertiary)]'}`} />
                  <span className="text-sm text-[var(--text-primary)] font-medium truncate">{job.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)] font-mono">{job.cronExpression}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[var(--text-tertiary)]">→ {job.agentId}</span>
                  {job.lastRun && (
                    <span className={`text-[10px] ${job.lastRun.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                      Last: {job.lastRun.success ? '✓' : '✗'} {new Date(job.lastRun.completedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  type="button"
                  onClick={() => onTriggerJob(job.id)}
                  className="px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
                  title="Run now"
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(job)}
                  className="px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
                  title="Edit"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteJob(job.id)}
                  className="px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--color-error)] transition-colors duration-150"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
