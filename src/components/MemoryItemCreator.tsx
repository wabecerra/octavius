'use client'

import { useState } from 'react'
import type {
  MemoryType,
  MemoryLayer,
  CreateMemoryItemInput,
} from '@/lib/memory/models'

interface MemoryItemCreatorProps {
  onCreated?: () => void
}

const inputClass =
  'w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150'
const selectClass =
  'w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150'
const labelClass = 'text-xs text-[var(--text-secondary)] mb-1 block'

export function MemoryItemCreator({ onCreated }: MemoryItemCreatorProps) {
  const [text, setText] = useState('')
  const [type, setType] = useState<MemoryType>('episodic')
  const [layer, setLayer] = useState<MemoryLayer>('daily_notes')
  const [tags, setTags] = useState('')
  const [confidence, setConfidence] = useState(0.7)
  const [importance, setImportance] = useState(0.5)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const input: CreateMemoryItemInput = {
      text: text.trim(),
      type,
      layer,
      provenance: {
        source_type: 'user_input',
        source_id: 'dashboard',
        agent_id: null,
      },
      confidence,
      importance,
      tags: tagList,
    }

    try {
      const res = await fetch('/api/memory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (res.ok) {
        setText('')
        setTags('')
        setConfidence(0.7)
        setImportance(0.5)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        onCreated?.()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to create memory')
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 transition-colors duration-150">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">✏️</span>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Add Memory
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Text */}
        <div>
          <label className={labelClass}>Content</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you want to remember?"
            rows={3}
            className={`${inputClass} resize-y min-h-[80px]`}
          />
        </div>

        {/* Type + Layer */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MemoryType)}
              className={selectClass}
            >
              <option value="episodic">Episodic</option>
              <option value="semantic">Semantic</option>
              <option value="procedural">Procedural</option>
              <option value="entity_profile">Entity Profile</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Layer</label>
            <select
              value={layer}
              onChange={(e) => setLayer(e.target.value as MemoryLayer)}
              className={selectClass}
            >
              <option value="daily_notes">Daily Notes</option>
              <option value="life_directory">Life Directory</option>
              <option value="tacit_knowledge">Tacit Knowledge</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className={labelClass}>Tags (comma-separated)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="quadrant:industry, project:octavius"
            className={inputClass}
          />
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          {showAdvanced ? '▼' : '▶'} Advanced options
        </button>

        {showAdvanced && (
          <div className="space-y-3 pl-2 border-l-2 border-[var(--border-secondary)]">
            {/* Confidence */}
            <div>
              <label className={labelClass}>
                Confidence: {Math.round(confidence * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(confidence * 100)}
                onChange={(e) => setConfidence(Number(e.target.value) / 100)}
                className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer accent-[var(--color-success)]"
              />
            </div>

            {/* Importance */}
            <div>
              <label className={labelClass}>
                Importance: {Math.round(importance * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(importance * 100)}
                onChange={(e) => setImportance(Number(e.target.value) / 100)}
                className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer accent-[var(--color-info)]"
              />
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="w-full py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
        >
          {saving ? 'Saving...' : 'Add Memory'}
        </button>

        {/* Feedback */}
        {success && (
          <p className="text-xs text-[var(--color-success)] text-center">
            ✓ Memory created successfully
          </p>
        )}
        {error && (
          <p className="text-xs text-[var(--color-error)] text-center">{error}</p>
        )}
      </form>
    </div>
  )
}
