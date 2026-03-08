'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Skeleton } from '@/components/Skeleton'
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
  /** Optional trend data for sparkline (array of raw numbers) */
  sparklineData?: number[]
  /** Show loading skeleton */
  loading?: boolean
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
  sparklineData,
  loading,
  onClick,
}: QuadrantCardProps) {
  // ─── Loading state ───
  if (loading) {
    return (
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl w-full"
        style={{ borderTopColor: color, borderTopWidth: '2px' }}
        aria-hidden="true"
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-8" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded" />
        </div>
      </div>
    )
  }

  const status = statusConfig[agentStatus]

  // Prepare sparkline data as objects for Recharts
  const sparkData = sparklineData?.map((v, i) => ({ idx: i, val: v }))

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
              <span className="text-[var(--text-primary)] font-medium font-mono text-xs">
                {metric.value}
              </span>
            </div>
          ))}
        </div>

        {/* Sparkline */}
        {sparkData && sparkData.length > 1 && (
          <div className="mt-3 h-10" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="val"
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </button>
  )
}
