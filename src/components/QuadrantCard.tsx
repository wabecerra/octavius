'use client'

import type { QuadrantId } from '@/types'

interface MetricItem {
  label: string
  value: string | number
}

export interface QuadrantCardProps {
  quadrant: QuadrantId
  name: string
  icon: string
  color: string
  metrics: MetricItem[]
  agentStatus: 'idle' | 'running' | 'error'
  onClick?: () => void
}

const statusConfig = {
  idle: { label: 'Idle', className: 'bg-[color-mix(in_srgb,var(--text-tertiary)_20%,transparent)] text-[var(--text-secondary)]' },
  running: { label: 'Running', className: 'bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] text-[var(--color-info)]' },
  error: { label: 'Error', className: 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)]' },
} as const

export function QuadrantCard({
  name,
  icon,
  color,
  metrics,
  agentStatus,
  onClick,
}: QuadrantCardProps) {
  const status = statusConfig[agentStatus]

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-left w-full hover:bg-[var(--bg-hover)] transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
      style={{ borderTopColor: color, borderTopWidth: '2px' }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg" role="img" aria-hidden="true">
              {icon}
            </span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{name}</h3>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        {/* Metrics */}
        <div className="space-y-1.5">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-[var(--text-secondary)]">{metric.label}</span>
              <span className="text-[var(--text-primary)] font-medium">{metric.value}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  )
}
