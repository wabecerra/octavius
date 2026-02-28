import type {
  ActivitySummary,
  CanonicalReading,
  HealthSource,
  HeartRateReading,
  HRVReading,
  ReadingType,
  SleepSession,
  SpO2Reading,
} from './types'
import { VALIDATION_RANGES } from './types'
import { computeDedupKey } from './dedup'

// --- Result type ---

export type NormalizeResult = { ok: true; reading: CanonicalReading } | { ok: false; error: string }

// --- Validation helpers ---

/** Validates that a string is a valid ISO 8601 timestamp. */
export function validateTimestamp(ts: string): boolean {
  if (typeof ts !== 'string' || ts.length === 0) return false
  const d = new Date(ts)
  return !Number.isNaN(d.getTime())
}

/** Validates that a numeric value falls within [min, max]. */
export function validateRange(value: number, min: number, max: number): boolean {
  return typeof value === 'number' && !Number.isNaN(value) && value >= min && value <= max
}

// Re-export computeDedupKey from canonical location
export { computeDedupKey } from './dedup'

// --- Per-type normalizers ---

function normalizeHeartRate(raw: Record<string, unknown>): NormalizeResult {
  const { timestamp, bpm, type } = raw as Record<string, unknown>
  if (typeof timestamp !== 'string' || !validateTimestamp(timestamp as string)) {
    return { ok: false, error: 'Invalid or missing timestamp for heart_rate reading' }
  }
  if (!validateRange(bpm as number, VALIDATION_RANGES.bpm.min, VALIDATION_RANGES.bpm.max)) {
    return { ok: false, error: `bpm ${bpm} out of range [${VALIDATION_RANGES.bpm.min}, ${VALIDATION_RANGES.bpm.max}]` }
  }
  const validTypes = ['resting', 'active', 'average'] as const
  if (!validTypes.includes(type as (typeof validTypes)[number])) {
    return { ok: false, error: `Invalid heart rate type: ${type}` }
  }
  const data: HeartRateReading = {
    timestamp: timestamp as string,
    bpm: bpm as number,
    type: type as HeartRateReading['type'],
  }
  const dedupKey = computeDedupKey('heart_rate', data.timestamp, { bpm: data.bpm, type: data.type })
  return { ok: true, reading: { readingType: 'heart_rate', source: '' as HealthSource, data, dedupKey } }
}

function normalizeHrv(raw: Record<string, unknown>): NormalizeResult {
  const { timestamp, ms } = raw as Record<string, unknown>
  if (typeof timestamp !== 'string' || !validateTimestamp(timestamp as string)) {
    return { ok: false, error: 'Invalid or missing timestamp for hrv reading' }
  }
  if (!validateRange(ms as number, VALIDATION_RANGES.hrv.min, VALIDATION_RANGES.hrv.max)) {
    return { ok: false, error: `ms ${ms} out of range [${VALIDATION_RANGES.hrv.min}, ${VALIDATION_RANGES.hrv.max}]` }
  }
  const data: HRVReading = { timestamp: timestamp as string, ms: ms as number }
  const dedupKey = computeDedupKey('hrv', data.timestamp, { ms: data.ms })
  return { ok: true, reading: { readingType: 'hrv', source: '' as HealthSource, data, dedupKey } }
}

function normalizeSpo2(raw: Record<string, unknown>): NormalizeResult {
  const { timestamp, percentage } = raw as Record<string, unknown>
  if (typeof timestamp !== 'string' || !validateTimestamp(timestamp as string)) {
    return { ok: false, error: 'Invalid or missing timestamp for spo2 reading' }
  }
  if (!validateRange(percentage as number, VALIDATION_RANGES.spo2.min, VALIDATION_RANGES.spo2.max)) {
    return {
      ok: false,
      error: `percentage ${percentage} out of range [${VALIDATION_RANGES.spo2.min}, ${VALIDATION_RANGES.spo2.max}]`,
    }
  }
  const data: SpO2Reading = { timestamp: timestamp as string, percentage: percentage as number }
  const dedupKey = computeDedupKey('spo2', data.timestamp, { percentage: data.percentage })
  return { ok: true, reading: { readingType: 'spo2', source: '' as HealthSource, data, dedupKey } }
}

function normalizeSleep(raw: Record<string, unknown>): NormalizeResult {
  const { startTime, endTime, stages, duration, score } = raw as Record<string, unknown>
  if (typeof startTime !== 'string' || !validateTimestamp(startTime as string)) {
    return { ok: false, error: 'Invalid or missing startTime for sleep reading' }
  }
  if (typeof endTime !== 'string' || !validateTimestamp(endTime as string)) {
    return { ok: false, error: 'Invalid or missing endTime for sleep reading' }
  }
  if (!validateRange(duration as number, VALIDATION_RANGES.sleepDuration.min, VALIDATION_RANGES.sleepDuration.max)) {
    return {
      ok: false,
      error: `duration ${duration} out of range [${VALIDATION_RANGES.sleepDuration.min}, ${VALIDATION_RANGES.sleepDuration.max}]`,
    }
  }
  if (score !== undefined && score !== null) {
    if (!validateRange(score as number, VALIDATION_RANGES.sleepScore.min, VALIDATION_RANGES.sleepScore.max)) {
      return {
        ok: false,
        error: `score ${score} out of range [${VALIDATION_RANGES.sleepScore.min}, ${VALIDATION_RANGES.sleepScore.max}]`,
      }
    }
  }
  // Validate stages object
  if (typeof stages !== 'object' || stages === null) {
    return { ok: false, error: 'Missing or invalid stages for sleep reading' }
  }
  const s = stages as Record<string, unknown>
  for (const field of ['deep', 'light', 'rem', 'awake'] as const) {
    if (typeof s[field] !== 'number' || Number.isNaN(s[field] as number) || (s[field] as number) < 0) {
      return { ok: false, error: `Invalid sleep stage value for ${field}: ${s[field]}` }
    }
  }

  const data: SleepSession = {
    startTime: startTime as string,
    endTime: endTime as string,
    stages: {
      deep: (s as Record<string, number>).deep,
      light: (s as Record<string, number>).light,
      rem: (s as Record<string, number>).rem,
      awake: (s as Record<string, number>).awake,
    },
    duration: duration as number,
    ...(score !== undefined && score !== null ? { score: score as number } : {}),
  }
  const dedupKey = computeDedupKey('sleep', data.startTime, {
    endTime: data.endTime,
    stages: data.stages,
    duration: data.duration,
  })
  return { ok: true, reading: { readingType: 'sleep', source: '' as HealthSource, data, dedupKey } }
}

function normalizeActivity(raw: Record<string, unknown>): NormalizeResult {
  const { date, steps, calories, activeMinutes } = raw as Record<string, unknown>
  if (typeof date !== 'string' || !validateTimestamp(date as string)) {
    return { ok: false, error: 'Invalid or missing date for activity reading' }
  }
  if (!validateRange(steps as number, VALIDATION_RANGES.steps.min, VALIDATION_RANGES.steps.max)) {
    return {
      ok: false,
      error: `steps ${steps} out of range [${VALIDATION_RANGES.steps.min}, ${VALIDATION_RANGES.steps.max}]`,
    }
  }
  if (!validateRange(calories as number, VALIDATION_RANGES.calories.min, VALIDATION_RANGES.calories.max)) {
    return {
      ok: false,
      error: `calories ${calories} out of range [${VALIDATION_RANGES.calories.min}, ${VALIDATION_RANGES.calories.max}]`,
    }
  }
  if (typeof activeMinutes !== 'number' || Number.isNaN(activeMinutes as number) || (activeMinutes as number) < 0) {
    return { ok: false, error: `Invalid activeMinutes: ${activeMinutes}` }
  }
  const data: ActivitySummary = {
    date: date as string,
    steps: steps as number,
    calories: calories as number,
    activeMinutes: activeMinutes as number,
  }
  const dedupKey = computeDedupKey('activity', data.date, {
    steps: data.steps,
    calories: data.calories,
    activeMinutes: data.activeMinutes,
  })
  return { ok: true, reading: { readingType: 'activity', source: '' as HealthSource, data, dedupKey } }
}

// --- Main normalizer ---

/**
 * Normalizes a raw health reading into a canonical CanonicalReading.
 * Validates timestamps, numeric ranges, and computes the dedup key.
 */
export function normalizeReading(
  readingType: ReadingType,
  source: HealthSource,
  raw: unknown,
): NormalizeResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Raw reading must be a non-null object' }
  }

  const rawObj = raw as Record<string, unknown>
  let result: NormalizeResult

  switch (readingType) {
    case 'heart_rate':
      result = normalizeHeartRate(rawObj)
      break
    case 'hrv':
      result = normalizeHrv(rawObj)
      break
    case 'spo2':
      result = normalizeSpo2(rawObj)
      break
    case 'sleep':
      result = normalizeSleep(rawObj)
      break
    case 'activity':
      result = normalizeActivity(rawObj)
      break
    default:
      return { ok: false, error: `Unknown reading type: ${readingType}` }
  }

  // Attach the source to successful results
  if (result.ok) {
    result.reading.source = source
  }

  return result
}
