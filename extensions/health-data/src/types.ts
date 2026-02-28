// ROOK SDK webhook payload (from tryrook.io docs)
export interface RookWebhookPayload {
  user_id: string;
  data_type: "body" | "physical" | "sleep";
  timestamp: string;
  data: RookBodyData | RookPhysicalData | RookSleepData;
}

export interface RookBodyData {
  heart_rate_bpm?: number;
  heart_rate_variability_ms?: number;
  blood_oxygen_saturation_pct?: number;
}

export interface RookPhysicalData {
  steps?: number;
  calories_kcal?: number;
  active_duration_minutes?: number;
  date: string;
}

export interface RookSleepData {
  sleep_start: string;
  sleep_end: string;
  deep_sleep_minutes?: number;
  light_sleep_minutes?: number;
  rem_sleep_minutes?: number;
  awake_minutes?: number;
  total_sleep_minutes?: number;
  sleep_score?: number;
}

// Apple Health Auto Export webhook payload (from healthyapps.dev docs)
export interface AppleHealthPayload {
  data: {
    metrics?: AppleHealthMetric[];
    workouts?: unknown[];
  };
}

export interface AppleHealthMetric {
  name: string; // e.g. 'heart_rate', 'heart_rate_variability', 'oxygen_saturation', 'step_count', 'active_energy_burned', 'apple_sleeping_wrist_temperature'
  units: string;
  data: Array<{
    date: string; // ISO 8601
    qty: number;
    source?: string;
  }>;
}
