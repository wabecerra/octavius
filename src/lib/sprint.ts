/**
 * Sprint utilities — ISO-week based 1-week sprints.
 *
 * A sprint maps 1:1 to an ISO week (Monday–Sunday).
 * Sprint labels use the format "W{isoWeek}" (e.g. W13).
 */

export interface Sprint {
  /** ISO week number (1–53) */
  week: number
  /** ISO year (may differ from calendar year at year boundaries) */
  year: number
  /** Monday 00:00:00 local time */
  startDate: string // YYYY-MM-DD
  /** Sunday 23:59:59 local time */
  endDate: string // YYYY-MM-DD
  /** Human label, e.g. "W13 · Mar 16–22" */
  label: string
}

/** Get the ISO week number and year for a given date. */
export function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { week, year: d.getUTCFullYear() }
}

/** Get the Monday of the ISO week containing the given date. */
export function getMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  // day 0 = Sunday → offset -6, day 1 = Monday → offset 0, etc.
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/** Format a date as YYYY-MM-DD. */
export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Build a Sprint object for the ISO week containing the given date. */
export function getSprintForDate(date: Date): Sprint {
  const monday = getMonday(date)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const { week, year } = getISOWeek(date)

  const monthFmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short' })

  const startMonth = monthFmt(monday)
  const endMonth = monthFmt(sunday)
  const dateRange =
    startMonth === endMonth
      ? `${startMonth} ${monday.getDate()}–${sunday.getDate()}`
      : `${startMonth} ${monday.getDate()} – ${endMonth} ${sunday.getDate()}`

  return {
    week,
    year,
    startDate: toDateStr(monday),
    endDate: toDateStr(sunday),
    label: `W${week} · ${dateRange}`,
  }
}

/** Get the sprint for the current date. */
export function getCurrentSprint(): Sprint {
  return getSprintForDate(new Date())
}

/** Navigate to the previous sprint (1 week back). */
export function getPreviousSprint(sprint: Sprint): Sprint {
  const monday = new Date(sprint.startDate + 'T00:00:00')
  monday.setDate(monday.getDate() - 7)
  return getSprintForDate(monday)
}

/** Navigate to the next sprint (1 week forward). */
export function getNextSprint(sprint: Sprint): Sprint {
  const monday = new Date(sprint.startDate + 'T00:00:00')
  monday.setDate(monday.getDate() + 7)
  return getSprintForDate(monday)
}

/** Check if a given ISO timestamp falls within a sprint's date range. */
export function isInSprint(timestamp: string, sprint: Sprint): boolean {
  const dateStr = timestamp.slice(0, 10) // YYYY-MM-DD
  return dateStr >= sprint.startDate && dateStr <= sprint.endDate
}

/** Check if the given sprint is the current (active) sprint. */
export function isCurrentSprint(sprint: Sprint): boolean {
  const current = getCurrentSprint()
  return sprint.week === current.week && sprint.year === current.year
}
