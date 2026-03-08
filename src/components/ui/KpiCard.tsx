'use client'

import { type ReactNode } from 'react'

// ─── Types ───

export type KpiStatus = 'idle' | 'loading' | 'error' | 'empty'

export interface KpiCardProps {
  title: string
  value: string | number
  trend?: {
    direction: 'up' | 'down' | 'flat'
    label: string
  }
  sparklineData?: number[]
  status?: KpiStatus
  errorMessage?: string
  emptyMessage?: string
  onRetry?: () => void
  icon?: ReactNode
  accentColor?: string
}

// ─── Sparkline (simple SVG) ───

function MiniSparkline({ data, color = 'var(--accent)' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null

  const width = 80
  const height = 24
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Skeleton ───

function KpiSkeleton() {
  return (
    <div className="widget-contain bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-3 animate-skeleton-pulse">
      <div className="h-3 w-20 bg-[var(--bg-tertiary)] rounded" />
      <div className="h-8 w-16 bg-[var(--bg-tertiary)] rounded" />
      <div className="h-2 w-24 bg-[var(--bg-tertiary)] rounded" />
    </div>
  )
}

// ─── KPI Card ───

export function KpiCard({
  title,
  value,
  trend,
  sparklineData,
  status = 'idle',
  errorMessage,
  emptyMessage,
  onRetry,
  icon,
  accentColor,
}: KpiCardProps) {
  // Loading state
  if (status === 'loading') {
    return <KpiSkeleton />
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="widget-contain bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
        <p className="text-xs text-[var(--text-tertiary)]">{title}</p>
        <p className="text-sm text-[var(--color-error)]">
          {errorMessage || 'Failed to load data'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  // Empty state
  if (status === 'empty') {
    return (
      <div className="widget-contain bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
        <p className="text-xs text-[var(--text-tertiary)]">{title}</p>
        <p className="text-sm text-[var(--text-tertiary)]">
          {emptyMessage || 'No data yet'}
        </p>
      </div>
    )
  }

  // Trend arrow
  const trendIcon = trend
    ? trend.direction === 'up'
      ? '↑'
      : trend.direction === 'down'
      ? '↓'
      : '→'
    : null

  const trendColor = trend
    ? trend.direction === 'up'
      ? 'text-[var(--color-success)]'
      : trend.direction === 'down'
      ? 'text-[var(--color-error)]'
      : 'text-[var(--text-tertiary)]'
    : ''

  return (
    <div className="widget-contain bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 transition-colors duration-150 shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
          {icon && <span className="mr-1.5">{icon}</span>}
          {title}
        </p>
        {sparklineData && sparklineData.length >= 2 && (
          <MiniSparkline data={sparklineData} color={accentColor} />
        )}
      </div>

      {/* Value */}
      <p className="text-2xl font-semibold font-mono text-[var(--text-primary)] leading-tight">
        {value}
      </p>

      {/* Trend */}
      {trend && (
        <p className={`text-xs mt-1 ${trendColor}`}>
          {trendIcon} {trend.label}
        </p>
      )}
    </div>
  )
}
