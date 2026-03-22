'use client'

import type { Task } from '@/hooks'
import type { CheckIn } from '@/hooks'
import type { FocusGoal } from '@/hooks'
import type { Connection } from '@/hooks'

interface StandupBriefProps {
  /** Tasks completed yesterday */
  completedYesterday: Task[]
  /** Tasks currently in progress */
  inProgress: Task[]
  /** Today's focus goals */
  todayGoals: FocusGoal[]
  /** Latest check-in (if from today) */
  latestCheckin: CheckIn | null
  /** Overdue connections (blockers) */
  overdueConnections: Connection[]
  /** Count of open tasks carried over from previous sprints */
  carriedOverCount: number
}

export function StandupBrief({
  completedYesterday,
  inProgress,
  todayGoals,
  latestCheckin,
  overdueConnections,
  carriedOverCount,
}: StandupBriefProps) {
  const hasContent =
    completedYesterday.length > 0 ||
    inProgress.length > 0 ||
    todayGoals.length > 0 ||
    latestCheckin ||
    overdueConnections.length > 0 ||
    carriedOverCount > 0

  if (!hasContent) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">📋 Daily Standup</h3>
        <p className="text-xs text-[var(--text-tertiary)]">
          Start your day — add tasks, check in, or set focus goals to populate your standup.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 space-y-3 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">📋 Daily Standup</h3>

      {/* Yesterday */}
      {completedYesterday.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
            Yesterday
          </p>
          <ul className="space-y-0.5">
            {completedYesterday.slice(0, 3).map((t) => (
              <li key={t.id} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                <span className="text-[var(--color-success)]">✓</span> {t.title}
              </li>
            ))}
            {completedYesterday.length > 3 && (
              <li className="text-[10px] text-[var(--text-tertiary)]">
                +{completedYesterday.length - 3} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Today */}
      <div>
        <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
          Today
        </p>
        <ul className="space-y-0.5">
          {todayGoals.map((g) => (
            <li key={g.id} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
              <span className="text-[var(--accent)]">◎</span> {g.title}
            </li>
          ))}
          {inProgress.slice(0, 3).map((t) => (
            <li key={t.id} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
              <span className="text-[var(--color-warning)]">▸</span> {t.title}
            </li>
          ))}
          {todayGoals.length === 0 && inProgress.length === 0 && (
            <li className="text-xs text-[var(--text-tertiary)]">No tasks or goals set yet</li>
          )}
        </ul>
      </div>

      {/* Blockers / Alerts */}
      {(overdueConnections.length > 0 || carriedOverCount > 0) && (
        <div>
          <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
            Attention
          </p>
          <ul className="space-y-0.5">
            {carriedOverCount > 0 && (
              <li className="text-xs text-[var(--color-warning)] flex items-center gap-1.5">
                ⚠ {carriedOverCount} task{carriedOverCount > 1 ? 's' : ''} carried over from last sprint
              </li>
            )}
            {overdueConnections.slice(0, 2).map((c) => (
              <li key={c.id} className="text-xs text-[var(--color-warning)] flex items-center gap-1.5">
                ⚠ Reach out to {c.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mood pulse */}
      {latestCheckin && (
        <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-primary)]">
          <span className="text-xs text-[var(--text-tertiary)]">Mood</span>
          <span className="text-sm">
            {['😞', '😐', '🙂', '😊', '😄'][latestCheckin.mood - 1]}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">Energy</span>
          <span className="text-sm">
            {['🪫', '🔋', '⚡', '💪', '🔥'][latestCheckin.energy - 1]}
          </span>
        </div>
      )}
    </div>
  )
}
