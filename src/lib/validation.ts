/**
 * Validates that a value is an integer in the range [1, 5].
 * Used for Wellness Check-In fields (mood, energy, stress).
 */
export function validateCheckInValue(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

/**
 * Validates that a value is an integer in the range [0, 100].
 * Used for Goal progress percentage.
 */
export function validateProgressPct(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100
}
