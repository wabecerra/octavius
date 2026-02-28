import { createHash } from "node:crypto";
import type {
  RookWebhookPayload,
  RookBodyData,
  RookPhysicalData,
  RookSleepData,
  AppleHealthPayload,
} from "./types.js";

// Canonical types mirrored from octavious/src/lib/health/types.ts
// (extension can't import from octavious directly)

export type ReadingType = "heart_rate" | "hrv" | "spo2" | "sleep" | "activity";
export type HealthSource = "csv_import" | "rook_webhook" | "apple_health_webhook";

export interface CanonicalReading {
  readingType: ReadingType;
  source: HealthSource;
  data: Record<string, unknown>;
  dedupKey: string;
}

/**
 * Computes a source-independent SHA-256 dedup key.
 * Mirrors the logic in octavious/src/lib/health/dedup.ts.
 */
function computeDedupKey(
  readingType: ReadingType,
  timestamp: string,
  values: Record<string, unknown>,
): string {
  const sortedKeys = Object.keys(values).sort();
  const sortedValues: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sortedValues[key] = values[key];
  }
  const input = `${readingType}:${timestamp}:${JSON.stringify(sortedValues)}`;
  return createHash("sha256").update(input).digest("hex");
}

// --- ROOK SDK normalization ---

function normalizeRookBody(data: RookBodyData, timestamp: string): CanonicalReading[] {
  const readings: CanonicalReading[] = [];

  if (data.heart_rate_bpm != null) {
    const hrData = { timestamp, bpm: data.heart_rate_bpm, type: "average" as const };
    readings.push({
      readingType: "heart_rate",
      source: "rook_webhook",
      data: hrData,
      dedupKey: computeDedupKey("heart_rate", timestamp, { bpm: hrData.bpm, type: hrData.type }),
    });
  }

  if (data.heart_rate_variability_ms != null) {
    const hrvData = { timestamp, ms: data.heart_rate_variability_ms };
    readings.push({
      readingType: "hrv",
      source: "rook_webhook",
      data: hrvData,
      dedupKey: computeDedupKey("hrv", timestamp, { ms: hrvData.ms }),
    });
  }

  if (data.blood_oxygen_saturation_pct != null) {
    const spo2Data = { timestamp, percentage: data.blood_oxygen_saturation_pct };
    readings.push({
      readingType: "spo2",
      source: "rook_webhook",
      data: spo2Data,
      dedupKey: computeDedupKey("spo2", timestamp, { percentage: spo2Data.percentage }),
    });
  }

  return readings;
}

function normalizeRookPhysical(data: RookPhysicalData, timestamp: string): CanonicalReading[] {
  const activityData = {
    date: data.date,
    steps: data.steps ?? 0,
    calories: data.calories_kcal ?? 0,
    activeMinutes: data.active_duration_minutes ?? 0,
  };
  return [
    {
      readingType: "activity",
      source: "rook_webhook",
      data: activityData,
      dedupKey: computeDedupKey("activity", activityData.date, {
        steps: activityData.steps,
        calories: activityData.calories,
        activeMinutes: activityData.activeMinutes,
      }),
    },
  ];
}

function normalizeRookSleep(data: RookSleepData, _timestamp: string): CanonicalReading[] {
  const duration = data.total_sleep_minutes ?? 0;
  const sleepData = {
    startTime: data.sleep_start,
    endTime: data.sleep_end,
    stages: {
      deep: data.deep_sleep_minutes ?? 0,
      light: data.light_sleep_minutes ?? 0,
      rem: data.rem_sleep_minutes ?? 0,
      awake: data.awake_minutes ?? 0,
    },
    duration,
    ...(data.sleep_score != null ? { score: data.sleep_score } : {}),
  };
  return [
    {
      readingType: "sleep",
      source: "rook_webhook",
      data: sleepData,
      dedupKey: computeDedupKey("sleep", sleepData.startTime, {
        endTime: sleepData.endTime,
        stages: sleepData.stages,
        duration: sleepData.duration,
      }),
    },
  ];
}

/**
 * Normalizes a ROOK SDK webhook payload into canonical readings.
 */
export function normalizeRookPayload(payload: RookWebhookPayload): CanonicalReading[] {
  const { data_type, timestamp, data } = payload;

  switch (data_type) {
    case "body":
      return normalizeRookBody(data as RookBodyData, timestamp);
    case "physical":
      return normalizeRookPhysical(data as RookPhysicalData, timestamp);
    case "sleep":
      return normalizeRookSleep(data as RookSleepData, timestamp);
    default:
      return [];
  }
}

// --- Apple Health Auto Export normalization ---

/** Maps Apple Health metric names to canonical reading types. */
const APPLE_METRIC_MAP: Record<string, (name: string, units: string, date: string, qty: number) => CanonicalReading | null> = {
  heart_rate: (_name, _units, date, qty) => {
    const data = { timestamp: date, bpm: qty, type: "average" as const };
    return {
      readingType: "heart_rate",
      source: "apple_health_webhook",
      data,
      dedupKey: computeDedupKey("heart_rate", date, { bpm: data.bpm, type: data.type }),
    };
  },
  heart_rate_variability: (_name, _units, date, qty) => {
    // Apple Health reports HRV in seconds (SDNN); convert to ms
    const ms = _units === "s" ? qty * 1000 : qty;
    const data = { timestamp: date, ms };
    return {
      readingType: "hrv",
      source: "apple_health_webhook",
      data,
      dedupKey: computeDedupKey("hrv", date, { ms: data.ms }),
    };
  },
  oxygen_saturation: (_name, _units, date, qty) => {
    // Apple Health reports SpO2 as a fraction (0–1); convert to percentage
    const percentage = qty <= 1 ? qty * 100 : qty;
    const data = { timestamp: date, percentage };
    return {
      readingType: "spo2",
      source: "apple_health_webhook",
      data,
      dedupKey: computeDedupKey("spo2", date, { percentage: data.percentage }),
    };
  },
  step_count: (_name, _units, date, qty) => {
    const data = { date, steps: qty, calories: 0, activeMinutes: 0 };
    return {
      readingType: "activity",
      source: "apple_health_webhook",
      data,
      dedupKey: computeDedupKey("activity", date, {
        steps: data.steps,
        calories: data.calories,
        activeMinutes: data.activeMinutes,
      }),
    };
  },
  active_energy_burned: (_name, _units, date, qty) => {
    const data = { date, steps: 0, calories: qty, activeMinutes: 0 };
    return {
      readingType: "activity",
      source: "apple_health_webhook",
      data,
      dedupKey: computeDedupKey("activity", date, {
        steps: data.steps,
        calories: data.calories,
        activeMinutes: data.activeMinutes,
      }),
    };
  },
};

/**
 * Normalizes an Apple Health Auto Export webhook payload into canonical readings.
 */
export function normalizeAppleHealthPayload(payload: AppleHealthPayload): CanonicalReading[] {
  const readings: CanonicalReading[] = [];
  const metrics = payload.data?.metrics;
  if (!metrics || !Array.isArray(metrics)) return readings;

  for (const metric of metrics) {
    const mapper = APPLE_METRIC_MAP[metric.name];
    if (!mapper) continue;

    for (const point of metric.data) {
      const reading = mapper(metric.name, metric.units, point.date, point.qty);
      if (reading) {
        readings.push(reading);
      }
    }
  }

  return readings;
}
