/**
 * Agent mood system config (Tier C).
 * Determines visual mood based on agent state: tint color, speed, bounce, emote.
 */

export type AgentMood = 'neutral' | 'happy' | 'stressed' | 'sleeping'

export interface MoodVisuals {
  /** Extra tint to apply (null = use base tint or none). */
  tintColor: number | null
  /** Walk speed multiplier (1.0 = normal). */
  speedMultiplier: number
  /** Y-axis bounce amplitude in px (0 = no bounce). */
  bounceAmplitude: number
  /** Mood emote to show when idle (null = no mood emote). */
  emote: string | null
}

export const MOOD_VISUALS: Record<AgentMood, MoodVisuals> = {
  neutral:  { tintColor: null,     speedMultiplier: 1.0, bounceAmplitude: 0, emote: null },
  happy:    { tintColor: 0x88ffaa, speedMultiplier: 1.0, bounceAmplitude: 2, emote: 'emote:happy' },
  stressed: { tintColor: 0xff8888, speedMultiplier: 1.3, bounceAmplitude: 0, emote: 'emote:sweat' },
  sleeping: { tintColor: null,     speedMultiplier: 0,   bounceAmplitude: 0, emote: 'emote:sleep' },
}
