import type { WellnessCheckIn } from '../types'

/**
 * Maps an array of WellnessCheckIn records to chart-friendly data points.
 * Preserves order and length of the input array.
 */
export function toChartData(
  checkIns: WellnessCheckIn[],
): { timestamp: string; mood: number }[] {
  return checkIns.map((c) => ({ timestamp: c.timestamp, mood: c.mood }))
}
