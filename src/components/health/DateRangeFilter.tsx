'use client'

import { useState } from 'react'

interface DateRangeFilterProps {
  value: string
  onChange: (range: string) => void
}

const PRESETS = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
] as const

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const isPreset = PRESETS.some((p) => p.value === value)

  const handlePreset = (preset: string) => {
    setShowCustom(false)
    onChange(preset)
  }

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onChange(`${customStart}:${customEnd}`)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => handlePreset(p.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
            value === p.value
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowCustom(!showCustom)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
          !isPreset && value.includes(':')
            ? 'bg-[var(--accent)] text-white'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        Custom
      </button>
      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2 py-1 rounded-lg text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-primary)]"
          />
          <span className="text-[var(--text-tertiary)] text-sm">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2 py-1 rounded-lg text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-primary)]"
          />
          <button
            type="button"
            onClick={handleCustomApply}
            disabled={!customStart || !customEnd}
            className="px-3 py-1 rounded-lg text-sm font-medium bg-[var(--accent)] text-white disabled:opacity-50 transition-colors duration-150"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
