'use client'

import { useState } from 'react'
import type { HeartbeatActionConfig } from '@/lib/gateway/types'

export interface HeartbeatActionsPanelProps {
  actions: HeartbeatActionConfig[]
  onToggle: (name: string, enabled: boolean) => void
  onSave: (action: HeartbeatActionConfig) => void
}

export function HeartbeatActionsPanel({ actions, onToggle, onSave }: HeartbeatActionsPanelProps) {
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<HeartbeatActionConfig | null>(null)

  const startEdit = (action: HeartbeatActionConfig) => {
    setEditForm({ ...action })
    setEditingName(action.name)
  }

  const cancelEdit = () => {
    setEditForm(null)
    setEditingName(null)
  }

  const handleSave = () => {
    if (!editForm) return
    onSave(editForm)
    cancelEdit()
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Heartbeat Actions</h3>
      <p className="text-xs text-[var(--text-tertiary)]">
        Proactive checks run on each heartbeat cycle. Saving triggers HEARTBEAT.md regeneration.
      </p>

      {actions.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No heartbeat actions configured</p>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <div key={action.name}>
              {editingName === action.name && editForm ? (
                <EditForm form={editForm} onChange={setEditForm} onSave={handleSave} onCancel={cancelEdit} />
              ) : (
                <ActionRow action={action} onToggle={onToggle} onEdit={startEdit} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionRow({
  action,
  onToggle,
  onEdit,
}: {
  action: HeartbeatActionConfig
  onToggle: (name: string, enabled: boolean) => void
  onEdit: (action: HeartbeatActionConfig) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-secondary)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${action.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--text-tertiary)]'}`} />
          <span className="text-sm text-[var(--text-primary)] font-medium">{action.name}</span>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{action.description}</p>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={action.enabled}
            onChange={(e) => onToggle(action.name, e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-8 h-4 bg-[var(--text-disabled)] peer-focus:ring-1 peer-focus:ring-[var(--border-focus)] rounded-full peer peer-checked:bg-[var(--accent)] transition-colors" />
          <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
        </label>
        <button
          type="button"
          onClick={() => onEdit(action)}
          className="px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
          title="Edit"
        >
          ✎
        </button>
      </div>
    </div>
  )
}

function EditForm({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: HeartbeatActionConfig
  onChange: (f: HeartbeatActionConfig) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3 p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--accent)]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">Endpoint</label>
          <input
            type="text"
            value={form.memoryApiEndpoint}
            onChange={(e) => onChange({ ...form, memoryApiEndpoint: e.target.value })}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">Condition Logic</label>
          <input
            type="text"
            value={form.conditionLogic}
            onChange={(e) => onChange({ ...form, conditionLogic: e.target.value })}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">Notification Template</label>
        <textarea
          value={form.notificationTemplate}
          onChange={(e) => onChange({ ...form, notificationTemplate: e.target.value })}
          rows={2}
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="px-3 py-1.5 text-xs bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
