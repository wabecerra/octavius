import type { CanonicalReading } from './types'
import { normalizeReading } from './normalizer'

// --- Types ---

export type CsvParseResult = {
  readings: CanonicalReading[]
  skipped: Array<{ row: number; reason: string }>
}

// 10 MB limit (measured by string length ≈ byte count for ASCII CSV)
const MAX_FILE_SIZE = 10 * 1024 * 1024

// --- CSV helpers ---

/** Strip optional BOM from the start of a string. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Split a CSV line into fields, handling double-quoted values.
 * Quotes inside quoted fields are escaped as "".
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

// --- Column name mapping ---

/** Canonical column names we recognise, mapped to their normalised key. */
const COLUMN_ALIASES: Record<string, string> = {
  // timestamps
  date: 'date',
  timestamp: 'timestamp',
  datetime: 'timestamp',
  // heart rate
  heart_rate: 'heart_rate',
  hr: 'heart_rate',
  bpm: 'heart_rate',
  heartrate: 'heart_rate',
  // HRV
  hrv: 'hrv',
  heart_rate_variability: 'hrv',
  // SpO2
  spo2: 'spo2',
  oxygen_saturation: 'spo2',
  blood_oxygen: 'spo2',
  // activity
  steps: 'steps',
  calories: 'calories',
  active_minutes: 'active_minutes',
  activeminutes: 'active_minutes',
  // sleep
  sleep_start: 'sleep_start',
  sleep_end: 'sleep_end',
  deep_sleep: 'deep_sleep',
  light_sleep: 'light_sleep',
  rem_sleep: 'rem_sleep',
  awake_time: 'awake_time',
  sleep_duration: 'sleep_duration',
  sleep_score: 'sleep_score',
}

// --- Row extraction helpers ---

type ColumnMap = Map<string, number> // canonical key → column index

function getVal(row: string[], col: ColumnMap, key: string): string | undefined {
  const idx = col.get(key)
  if (idx === undefined) return undefined
  const v = row[idx]
  return v === undefined || v === '' ? undefined : v
}

function getNum(row: string[], col: ColumnMap, key: string): number | undefined {
  const v = getVal(row, col, key)
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

/** Resolve a timestamp from the row — prefer 'timestamp', fall back to 'date'. */
function resolveTimestamp(row: string[], col: ColumnMap): string | undefined {
  return getVal(row, col, 'timestamp') ?? getVal(row, col, 'date')
}

// --- Per-type extractors ---

function extractHeartRate(
  row: string[],
  col: ColumnMap,
  ts: string,
  readings: CanonicalReading[],
  skipped: CsvParseResult['skipped'],
  rowNum: number,
) {
  const bpm = getNum(row, col, 'heart_rate')
  if (bpm === undefined) return // column not present or empty — not an error
  const result = normalizeReading('heart_rate', 'csv_import', { timestamp: ts, bpm, type: 'average' })
  if (result.ok) readings.push(result.reading)
  else skipped.push({ row: rowNum, reason: `heart_rate: ${result.error}` })
}

function extractHrv(
  row: string[],
  col: ColumnMap,
  ts: string,
  readings: CanonicalReading[],
  skipped: CsvParseResult['skipped'],
  rowNum: number,
) {
  const ms = getNum(row, col, 'hrv')
  if (ms === undefined) return
  const result = normalizeReading('hrv', 'csv_import', { timestamp: ts, ms })
  if (result.ok) readings.push(result.reading)
  else skipped.push({ row: rowNum, reason: `hrv: ${result.error}` })
}

function extractSpo2(
  row: string[],
  col: ColumnMap,
  ts: string,
  readings: CanonicalReading[],
  skipped: CsvParseResult['skipped'],
  rowNum: number,
) {
  const percentage = getNum(row, col, 'spo2')
  if (percentage === undefined) return
  const result = normalizeReading('spo2', 'csv_import', { timestamp: ts, percentage })
  if (result.ok) readings.push(result.reading)
  else skipped.push({ row: rowNum, reason: `spo2: ${result.error}` })
}

function extractActivity(
  row: string[],
  col: ColumnMap,
  ts: string,
  readings: CanonicalReading[],
  skipped: CsvParseResult['skipped'],
  rowNum: number,
) {
  const steps = getNum(row, col, 'steps')
  const calories = getNum(row, col, 'calories')
  const activeMinutes = getNum(row, col, 'active_minutes')
  // Need at least one activity field present
  if (steps === undefined && calories === undefined && activeMinutes === undefined) return
  const result = normalizeReading('activity', 'csv_import', {
    date: ts,
    steps: steps ?? 0,
    calories: calories ?? 0,
    activeMinutes: activeMinutes ?? 0,
  })
  if (result.ok) readings.push(result.reading)
  else skipped.push({ row: rowNum, reason: `activity: ${result.error}` })
}

function extractSleep(
  row: string[],
  col: ColumnMap,
  readings: CanonicalReading[],
  skipped: CsvParseResult['skipped'],
  rowNum: number,
) {
  const sleepStart = getVal(row, col, 'sleep_start')
  const sleepEnd = getVal(row, col, 'sleep_end')
  // Need at least start+end to form a session
  if (!sleepStart || !sleepEnd) return
  const deep = getNum(row, col, 'deep_sleep') ?? 0
  const light = getNum(row, col, 'light_sleep') ?? 0
  const rem = getNum(row, col, 'rem_sleep') ?? 0
  const awake = getNum(row, col, 'awake_time') ?? 0
  const duration = getNum(row, col, 'sleep_duration') ?? deep + light + rem + awake
  const score = getNum(row, col, 'sleep_score')

  const raw: Record<string, unknown> = {
    startTime: sleepStart,
    endTime: sleepEnd,
    stages: { deep, light, rem, awake },
    duration,
  }
  if (score !== undefined) raw.score = score

  const result = normalizeReading('sleep', 'csv_import', raw)
  if (result.ok) readings.push(result.reading)
  else skipped.push({ row: rowNum, reason: `sleep: ${result.error}` })
}

// --- Main parser ---

/**
 * Parses a RingConn CSV export into canonical health readings.
 *
 * - Rejects files exceeding 10 MB (based on string length).
 * - Skips rows with missing/malformed fields, recording row number and reason.
 * - Passes each parsed reading through the normalizer.
 */
export function parseRingConnCsv(csvContent: string): CsvParseResult {
  // Size check
  if (csvContent.length > MAX_FILE_SIZE) {
    return {
      readings: [],
      skipped: [{ row: 0, reason: `File exceeds maximum size of 10 MB` }],
    }
  }

  const content = stripBom(csvContent)
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return {
      readings: [],
      skipped: [{ row: 0, reason: 'File is empty' }],
    }
  }

  // Parse header row
  const headerFields = splitCsvLine(lines[0])
  const columnMap: ColumnMap = new Map()

  for (let i = 0; i < headerFields.length; i++) {
    const raw = headerFields[i].toLowerCase().replace(/[\s-]+/g, '_')
    const canonical = COLUMN_ALIASES[raw]
    if (canonical && !columnMap.has(canonical)) {
      columnMap.set(canonical, i)
    }
  }

  // Must have at least one recognised health column
  if (columnMap.size === 0) {
    return {
      readings: [],
      skipped: [{ row: 1, reason: 'No recognised health data columns in header' }],
    }
  }

  if (lines.length < 2) {
    return {
      readings: [],
      skipped: [{ row: 0, reason: 'No data rows found (header only)' }],
    }
  }

  const readings: CanonicalReading[] = []
  const skipped: CsvParseResult['skipped'] = []

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1 // 1-based, header is row 1
    const fields = splitCsvLine(lines[i])
    const ts = resolveTimestamp(fields, columnMap)

    if (!ts) {
      skipped.push({ row: rowNum, reason: 'Missing timestamp/date' })
      continue
    }

    const beforeCount = readings.length + skipped.length

    // Extract all reading types present in this row
    extractHeartRate(fields, columnMap, ts, readings, skipped, rowNum)
    extractHrv(fields, columnMap, ts, readings, skipped, rowNum)
    extractSpo2(fields, columnMap, ts, readings, skipped, rowNum)
    extractActivity(fields, columnMap, ts, readings, skipped, rowNum)
    extractSleep(fields, columnMap, readings, skipped, rowNum)

    const afterCount = readings.length + skipped.length
    // If no extractor produced anything for this row, record it as skipped
    if (afterCount === beforeCount) {
      skipped.push({ row: rowNum, reason: 'No extractable health data in row' })
    }
  }

  return { readings, skipped }
}
