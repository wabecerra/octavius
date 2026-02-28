/**
 * Determines whether to show the weekly review prompt based on the
 * current day of the week and the user's configured review day.
 *
 * @param date - The current date to check
 * @param config - Configuration object with weeklyReviewDay (0=Sunday … 6=Saturday)
 * @returns true if the date's day of week matches the configured review day
 */
export function shouldShowWeeklyReviewPrompt(
  date: Date,
  config: { weeklyReviewDay: number },
): boolean {
  return date.getDay() === config.weeklyReviewDay
}
