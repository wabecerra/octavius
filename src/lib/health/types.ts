// Canonical health reading types for all ingestion paths
// (CSV import, ROOK SDK webhooks, Apple Health Auto Export webhooks)

// --- Discriminators ---

export type ReadingType = 'heart_rate' | 'hrv' | 'spo2' | 'sleep' | 'activity'

export type HealthSource = 'csv_import' | 'rook_webhook' | 'apple_health_webhook'

// --- Individual reading types ---

export interface HeartRateReading {
  timestamp: string // ISO 8601
  bpm: number // 20–300
  type: 'resting' | 'active' | 'average'
}

export interface HRVReading {
  timestamp: string // ISO 8601
  ms: number // 1–500
}

export interface SpO2Reading {
  timestamp: string // ISO 8601
  percentage: number // 50–100
}

export interface SleepSession {
  startTime: string // ISO 8601
  endTime: string // ISO 8601
  stages: {
    deep: number // minutes
    light: number // minutes
    rem: number // minutes
    awake: number // minutes
  }
  duration: number // total minutes, 0–1440
  score?: number // 0–100, optional
}

export interface ActivitySummary {
  date: string // ISO 8601 date (YYYY-MM-DD)
  steps: number // 0–200,000
  calories: number // 0–50,000
  activeMinutes: number
}

// --- Canonical reading envelope ---

export interface CanonicalReading {
  readingType: ReadingType
  source: HealthSource
  data: HeartRateReading | HRVReading | SpO2Reading | SleepSession | ActivitySummary
  dedupKey: string // SHA-256 of `${readingType}:${timestamp}:${JSON.stringify(sortedValues)}`
}

// --- Validation range constants ---

export const VALIDATION_RANGES = {
  bpm: { min: 20, max: 300 },
  hrv: { min: 1, max: 500 },
  spo2: { min: 50, max: 100 },
  steps: { min: 0, max: 200_000 },
  calories: { min: 0, max: 50_000 },
  sleepDuration: { min: 0, max: 1440 },
  sleepScore: { min: 0, max: 100 },
} as const
