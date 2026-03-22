'use client'

import type { Sprint } from '@/lib/sprint'

interface SprintHeaderProps {
  sprint: Sprint
  isCurrent: boolean
  onBack: () => void
  onForward: () => void
  onToday: () => void
}

export function SprintHeader({
  sprint,
  isCurrent,
  onBack,
  onForward,
  onToday,
}: SprintHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-[var(--bg-secondary)] border-[var(--border-primary)] shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="px-2 py-1 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        aria-label="Previous sprint"
      >
        ◀
      </button>

      <div className="flex-1 text-center">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          Sprint {sprint.label}
        </span>
        {isCurrent && (
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-muted)] text-[var(--accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            Active
          </span>
        )}
        {!isCurrent && (
          <span className="ml-2 text-[10px] text-[var(--text-tertiary)]">
            {sprint.year}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onForward}
        disabled={isCurrent}
        className="px-2 py-1 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next sprint"
      >
        ▶
      </button>

      {!isCurrent && (
        <button
          type="button"
          onClick={onToday}
          className="px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--accent)] bg-[var(--accent-muted)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          Today
        </button>
      )}
    </div>
  )
}
