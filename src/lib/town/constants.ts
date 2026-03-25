/**
 * Town view constants — game dimensions, interaction distances, worker behavior.
 */

export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720

export const INTERACT_DISTANCE = 48
export const BOSS_INTERACT_DISTANCE = 34

export const PF_CELL_SIZE = 16
export const PF_PADDING = 8
export const PF_MAX_ITER = 20000

export const WANDER_MIN_DELAY = 3000
export const WANDER_MAX_DELAY = 10000
export const WANDER_STAGGER_MS = 1800

export const ARRIVE_THRESHOLD = 8
export const WORKER_SPEED_FACTOR = 0.55
export const STUCK_FRAME_LIMIT = 120
export const TASK_BUBBLE_MS = 4000

export const EMOTE_Y_OFFSET = 0.55
export const BUBBLE_Y_OFFSET = 0.45

export const BODY_SIZE_RATIO_W = 0.5
export const BODY_SIZE_RATIO_H = 0.2
export const BODY_OFFSET_RATIO_X = 0.25
export const BODY_OFFSET_RATIO_Y = 0.75

export const CAMERA_LERP = 0.1
export const ZOOM_DEFAULT = 0.82
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2
export const ZOOM_SENSITIVITY = 0.001

export const PRESS_E_STYLE = {
  fontFamily: '"SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  fontSize: '14px',
  color: '#c9a227',
  backgroundColor: 'rgba(37, 34, 25, 0.95)',
  padding: { x: 8, y: 4 },
  align: 'center',
}

// Quadrant-themed activity bubbles for idle agents
export const QUADRANT_BUBBLES: Record<string, string[]> = {
  lifeforce: ['Checking vitals...', 'Analyzing sleep data~', 'Heart rate looks good!', 'Time for a stretch!'],
  industry: ['Reviewing tasks...', 'Prioritizing backlog~', 'Focus mode activated!', 'Shipping code...'],
  fellowship: ['Checking connections...', 'Time to reach out~', 'Scheduling catch-up!', 'Sending gratitude...'],
  essence: ['Reflecting...', 'Writing journal~', 'Finding meaning...', 'Gratitude moment...'],
}

export const SEAT_ACTIVITIES = [
  { emote: 'emote:device', bubbles: ['Working...', 'Processing~', 'Almost done!'], minDuration: 5000, maxDuration: 12000 },
  { emote: 'emote:thinking', bubbles: ['Hmm...', 'Let me think...', 'Analyzing...'], minDuration: 5000, maxDuration: 10000 },
  { emote: 'emote:star', bubbles: ['Got it!', 'Eureka!', 'Great insight!'], minDuration: 2000, maxDuration: 4000 },
  { emote: 'emote:sleep', bubbles: ['Zzz...', 'Resting...', '*dozing*'], minDuration: 6000, maxDuration: 14000 },
  { emote: 'emote:music', bubbles: ['~♪♪~', 'Good vibes~', 'In the zone~'], minDuration: 3000, maxDuration: 6000 },
]
