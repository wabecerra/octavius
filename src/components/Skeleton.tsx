'use client'

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
}

/**
 * Animated skeleton placeholder. Respects prefers-reduced-motion
 * via Tailwind's motion-safe variant.
 */
export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <div
      className={`rounded-md bg-[var(--bg-tertiary)] motion-safe:animate-pulse ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

/**
 * Card-shaped skeleton with title bar and content lines.
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 space-y-4 ${className}`}
      aria-hidden="true"
    >
      {/* Title */}
      <Skeleton className="h-4 w-3/5" />
      {/* Content lines */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}

/**
 * Metric card skeleton (mimics QuadrantCard layout).
 */
export function SkeletonMetricCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 ${className}`}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-8" />
        </div>
      </div>
      {/* Sparkline area */}
      <Skeleton className="h-10 w-full mt-3 rounded" />
    </div>
  )
}
