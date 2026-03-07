/**
 * Context Detector
 * 
 * Infers the user's current life mode based on:
 * - Time of day
 * - Recent activities across quadrants
 * - Biometric data (energy, stress, sleep)
 * - Calendar/schedule context
 * 
 * Life modes help agents adapt their suggestions and interventions.
 */

import type { OctaviusState, WellnessCheckIn } from '@/types'

/**
 * Life modes represent the user's current context/state
 */
export type LifeMode = 
  | 'deep-work'      // High focus time, minimize interruptions
  | 'recovery'       // Rest and recharge, avoid demanding tasks
  | 'social'         // Relationship-focused time
  | 'maintenance'    // Administrative tasks, routine work
  | 'creative'       // Open, exploratory mode
  | 'transition'     // Between modes, flexible
  | 'sleep'          // Nighttime, do not disturb

export interface ContextSnapshot {
  mode: LifeMode
  confidence: number // 0-1
  factors: ContextFactor[]
  recommendations: string[]
  timestamp: string
}

export interface ContextFactor {
  source: 'time' | 'biometric' | 'activity' | 'schedule' | 'history'
  description: string
  weight: number // contribution to mode detection
}

/**
 * Time-of-day context
 */
interface TimeContext {
  hour: number
  dayOfWeek: number // 0=Sunday
  isWeekend: boolean
  timeCategory: 'night' | 'earlyMorning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'lateEvening'
}

function getTimeContext(now: Date = new Date()): TimeContext {
  const hour = now.getHours()
  const dayOfWeek = now.getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  let timeCategory: TimeContext['timeCategory']
  if (hour >= 0 && hour < 5) timeCategory = 'night'
  else if (hour >= 5 && hour < 7) timeCategory = 'earlyMorning'
  else if (hour >= 7 && hour < 10) timeCategory = 'morning'
  else if (hour >= 10 && hour < 13) timeCategory = 'midday'
  else if (hour >= 13 && hour < 17) timeCategory = 'afternoon'
  else if (hour >= 17 && hour < 20) timeCategory = 'evening'
  else if (hour >= 20 && hour < 23) timeCategory = 'lateEvening'
  else timeCategory = 'night'

  return { hour, dayOfWeek, isWeekend, timeCategory }
}

/**
 * Get most recent check-in within last N hours
 */
function getRecentCheckIn(
  state: OctaviusState,
  withinHours = 4,
  now: Date = new Date()
): WellnessCheckIn | null {
  const cutoff = new Date(now.getTime() - withinHours * 60 * 60 * 1000)
  
  const recent = state.health.checkIns
    .filter((c) => new Date(c.timestamp) >= cutoff)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  
  return recent[0] || null
}

/**
 * Check if there's a scheduled event happening now or soon
 */
function getCurrentScheduleContext(
  state: OctaviusState,
  now: Date = new Date()
): { inEvent: boolean; upcomingInMinutes: number | null; eventType: string | null } {
  const todayStr = now.toISOString().slice(0, 10)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  
  const todaySchedule = state.career.scheduleItems.filter((s) => s.date === todayStr)
  
  for (const item of todaySchedule) {
    if (!item.startTime) continue
    
    const [startH, startM] = item.startTime.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    
    const endMinutes = item.endTime
      ? parseInt(item.endTime.split(':')[0]) * 60 + parseInt(item.endTime.split(':')[1])
      : startMinutes + 60 // default 1 hour
    
    // Currently in event
    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return { inEvent: true, upcomingInMinutes: null, eventType: inferEventType(item.title) }
    }
    
    // Event coming up
    const minutesUntil = startMinutes - currentMinutes
    if (minutesUntil > 0 && minutesUntil <= 30) {
      return { inEvent: false, upcomingInMinutes: minutesUntil, eventType: inferEventType(item.title) }
    }
  }
  
  return { inEvent: false, upcomingInMinutes: null, eventType: null }
}

/**
 * Infer event type from title keywords
 */
function inferEventType(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('meeting') || lower.includes('call') || lower.includes('sync')) return 'meeting'
  if (lower.includes('focus') || lower.includes('deep work') || lower.includes('heads down')) return 'focus'
  if (lower.includes('lunch') || lower.includes('break') || lower.includes('rest')) return 'break'
  if (lower.includes('workout') || lower.includes('gym') || lower.includes('exercise')) return 'exercise'
  if (lower.includes('social') || lower.includes('dinner') || lower.includes('coffee')) return 'social'
  return 'general'
}

/**
 * Analyze recent activity patterns
 */
function getActivityPattern(state: OctaviusState, now: Date = new Date()): {
  recentTasksCompleted: number
  recentJournaling: boolean
  recentSocialActivity: boolean
  activeFocusGoals: number
} {
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const todayStr = now.toISOString().slice(0, 10)
  
  // Tasks completed in last 2 hours (rough proxy using createdAt + completed)
  const recentTasks = state.career.tasks.filter(
    (t) => t.completed && new Date(t.createdAt) >= twoHoursAgo
  )
  
  // Journaled today
  const recentJournaling = state.soul.journalEntries.some(
    (j) => j.timestamp.slice(0, 10) === todayStr
  )
  
  // Social activity today
  const recentSocialActivity = state.relationships.activityLog.some(
    (a) => a.date === todayStr
  )
  
  // Active focus goals for today
  const activeFocusGoals = state.career.focusGoals.filter(
    (g) => g.date === todayStr
  ).length

  return {
    recentTasksCompleted: recentTasks.length,
    recentJournaling,
    recentSocialActivity,
    activeFocusGoals,
  }
}

/**
 * Main context detection function
 */
export function detectContext(
  state: OctaviusState,
  now: Date = new Date()
): ContextSnapshot {
  const factors: ContextFactor[] = []
  const modeScores: Record<LifeMode, number> = {
    'deep-work': 0,
    'recovery': 0,
    'social': 0,
    'maintenance': 0,
    'creative': 0,
    'transition': 0,
    'sleep': 0,
  }

  // --- Time-based factors ---
  const time = getTimeContext(now)
  
  switch (time.timeCategory) {
    case 'night':
      modeScores['sleep'] += 5
      factors.push({ source: 'time', description: 'Late night hours', weight: 5 })
      break
    case 'earlyMorning':
      modeScores['transition'] += 2
      modeScores['maintenance'] += 1
      factors.push({ source: 'time', description: 'Early morning - transition time', weight: 2 })
      break
    case 'morning':
      modeScores['deep-work'] += 3
      modeScores['creative'] += 2
      factors.push({ source: 'time', description: 'Morning - peak cognitive time', weight: 3 })
      break
    case 'midday':
      modeScores['deep-work'] += 2
      modeScores['maintenance'] += 2
      factors.push({ source: 'time', description: 'Midday - steady productivity', weight: 2 })
      break
    case 'afternoon':
      modeScores['maintenance'] += 2
      modeScores['social'] += 1
      factors.push({ source: 'time', description: 'Afternoon - routine work', weight: 2 })
      break
    case 'evening':
      modeScores['social'] += 3
      modeScores['recovery'] += 2
      factors.push({ source: 'time', description: 'Evening - wind-down time', weight: 3 })
      break
    case 'lateEvening':
      modeScores['recovery'] += 3
      modeScores['creative'] += 1 // some people are evening creatives
      factors.push({ source: 'time', description: 'Late evening - recovery time', weight: 3 })
      break
  }

  if (time.isWeekend) {
    modeScores['recovery'] += 2
    modeScores['social'] += 2
    modeScores['deep-work'] -= 1
    factors.push({ source: 'time', description: 'Weekend', weight: 2 })
  }

  // --- Biometric factors ---
  const checkIn = getRecentCheckIn(state, 4, now)
  
  if (checkIn) {
    if (checkIn.energy <= 2) {
      modeScores['recovery'] += 4
      modeScores['deep-work'] -= 2
      factors.push({ source: 'biometric', description: `Low energy (${checkIn.energy}/5)`, weight: 4 })
    } else if (checkIn.energy >= 4) {
      modeScores['deep-work'] += 3
      modeScores['creative'] += 2
      factors.push({ source: 'biometric', description: `High energy (${checkIn.energy}/5)`, weight: 3 })
    }

    if (checkIn.stress >= 4) {
      modeScores['recovery'] += 3
      modeScores['social'] -= 1
      factors.push({ source: 'biometric', description: `High stress (${checkIn.stress}/5)`, weight: 3 })
    } else if (checkIn.stress <= 2 && checkIn.energy >= 3) {
      modeScores['deep-work'] += 2
      factors.push({ source: 'biometric', description: 'Low stress, good energy', weight: 2 })
    }

    if (checkIn.mood <= 2) {
      modeScores['recovery'] += 2
      modeScores['social'] -= 1
      factors.push({ source: 'biometric', description: `Low mood (${checkIn.mood}/5)`, weight: 2 })
    } else if (checkIn.mood >= 4) {
      modeScores['social'] += 2
      modeScores['creative'] += 1
      factors.push({ source: 'biometric', description: `Good mood (${checkIn.mood}/5)`, weight: 2 })
    }
  }

  // Sleep data
  const sleepHours = state.health.metrics.sleepHours
  if (sleepHours !== undefined) {
    if (sleepHours < 6) {
      modeScores['recovery'] += 4
      modeScores['deep-work'] -= 2
      factors.push({ source: 'biometric', description: `Poor sleep (${sleepHours}h)`, weight: 4 })
    } else if (sleepHours >= 7.5) {
      modeScores['deep-work'] += 2
      factors.push({ source: 'biometric', description: `Good sleep (${sleepHours}h)`, weight: 2 })
    }
  }

  // --- Schedule factors ---
  const schedule = getCurrentScheduleContext(state, now)
  
  if (schedule.inEvent) {
    if (schedule.eventType === 'meeting') {
      modeScores['social'] += 4
      factors.push({ source: 'schedule', description: 'Currently in a meeting', weight: 4 })
    } else if (schedule.eventType === 'focus') {
      modeScores['deep-work'] += 5
      factors.push({ source: 'schedule', description: 'In scheduled focus time', weight: 5 })
    } else if (schedule.eventType === 'break' || schedule.eventType === 'exercise') {
      modeScores['recovery'] += 4
      factors.push({ source: 'schedule', description: 'Scheduled break/exercise', weight: 4 })
    }
  } else if (schedule.upcomingInMinutes !== null) {
    modeScores['transition'] += 2
    factors.push({ 
      source: 'schedule', 
      description: `Event in ${schedule.upcomingInMinutes} minutes`, 
      weight: 2 
    })
  }

  // --- Activity pattern factors ---
  const activity = getActivityPattern(state, now)
  
  if (activity.activeFocusGoals >= 2) {
    modeScores['deep-work'] += 2
    factors.push({ source: 'activity', description: `${activity.activeFocusGoals} focus goals set`, weight: 2 })
  }

  if (activity.recentTasksCompleted >= 3) {
    modeScores['deep-work'] += 2
    factors.push({ source: 'activity', description: 'Active task completion streak', weight: 2 })
  }

  if (activity.recentSocialActivity) {
    modeScores['social'] += 1
    factors.push({ source: 'activity', description: 'Recent social interaction', weight: 1 })
  }

  if (activity.recentJournaling) {
    modeScores['creative'] += 1
    factors.push({ source: 'activity', description: 'Journaled today', weight: 1 })
  }

  // --- Determine winning mode ---
  const sortedModes = (Object.entries(modeScores) as [LifeMode, number][])
    .sort((a, b) => b[1] - a[1])
  
  const [topMode, topScore] = sortedModes[0]
  const [, secondScore] = sortedModes[1]
  
  // Calculate confidence based on margin between top modes
  const totalScore = Object.values(modeScores).reduce((a, b) => a + b, 0)
  const confidence = totalScore > 0 
    ? Math.min((topScore - secondScore + 3) / 10, 1) 
    : 0.3

  // Generate recommendations based on detected mode
  const recommendations = generateModeRecommendations(topMode, factors, state)

  return {
    mode: topMode,
    confidence,
    factors: factors.sort((a, b) => b.weight - a.weight),
    recommendations,
    timestamp: now.toISOString(),
  }
}

/**
 * Generate actionable recommendations based on detected mode
 */
function generateModeRecommendations(
  mode: LifeMode,
  factors: ContextFactor[],
  state: OctaviusState
): string[] {
  const recommendations: string[] = []
  
  const hasLowEnergy = factors.some((f) => f.description.includes('Low energy'))
  const hasHighStress = factors.some((f) => f.description.includes('High stress'))
  const hasPoorSleep = factors.some((f) => f.description.includes('Poor sleep'))

  switch (mode) {
    case 'deep-work':
      recommendations.push('Silence notifications and close distracting apps')
      recommendations.push('Work on your highest-priority task')
      if (state.career.focusGoals.length === 0) {
        recommendations.push('Set 1-3 focus goals for today')
      }
      break

    case 'recovery':
      recommendations.push('Take a break from demanding tasks')
      if (hasLowEnergy || hasPoorSleep) {
        recommendations.push('Consider a short nap or rest')
      }
      if (hasHighStress) {
        recommendations.push('Try breathing exercises or a short walk')
      }
      recommendations.push('Hydrate and have a healthy snack')
      break

    case 'social':
      const overdueConnections = state.relationships.connections.filter((c) => {
        const daysSince = Math.floor(
          (Date.now() - new Date(c.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
        )
        return daysSince > c.reminderFrequencyDays
      })
      if (overdueConnections.length > 0) {
        recommendations.push(`Reach out to ${overdueConnections[0].name}`)
      }
      recommendations.push('Be present in conversations')
      break

    case 'maintenance':
      recommendations.push('Work through routine tasks and admin')
      recommendations.push('Clear your inbox or review backlog')
      recommendations.push('This is good time for planning, not creating')
      break

    case 'creative':
      recommendations.push('Explore ideas without judgment')
      recommendations.push('Consider journaling or brainstorming')
      recommendations.push('Follow curiosity — low-stakes experimentation')
      break

    case 'transition':
      recommendations.push('Wrap up current activity')
      recommendations.push('Review what\'s next on your schedule')
      recommendations.push('Quick mental reset before context switch')
      break

    case 'sleep':
      recommendations.push('Avoid screens if possible')
      recommendations.push('Rest is productive — your brain consolidates learning during sleep')
      break
  }

  return recommendations.slice(0, 4) // Max 4 recommendations
}

/**
 * Get a human-friendly description of the current context
 */
export function describeContext(snapshot: ContextSnapshot): string {
  const modeDescriptions: Record<LifeMode, string> = {
    'deep-work': 'Deep Work mode — focused, heads-down time',
    'recovery': 'Recovery mode — time to rest and recharge',
    'social': 'Social mode — connecting with others',
    'maintenance': 'Maintenance mode — handling routine tasks',
    'creative': 'Creative mode — open to exploration',
    'transition': 'Transition — shifting between contexts',
    'sleep': 'Sleep time — rest and recovery',
  }

  const confidenceLevel = 
    snapshot.confidence >= 0.7 ? 'High confidence' :
    snapshot.confidence >= 0.4 ? 'Moderate confidence' : 
    'Low confidence'

  return `${modeDescriptions[snapshot.mode]} (${confidenceLevel})`
}

/**
 * Check if the current mode suggests avoiding certain actions
 */
export interface ModeConstraints {
  avoidDeepWork: boolean
  avoidSocialOutreach: boolean
  avoidNewCommitments: boolean
  reduceNotifications: boolean
}

export function getModeConstraints(mode: LifeMode): ModeConstraints {
  return {
    avoidDeepWork: ['recovery', 'social', 'sleep', 'transition'].includes(mode),
    avoidSocialOutreach: ['deep-work', 'sleep', 'recovery'].includes(mode),
    avoidNewCommitments: ['recovery', 'sleep', 'transition'].includes(mode),
    reduceNotifications: ['deep-work', 'sleep', 'recovery', 'creative'].includes(mode),
  }
}

/**
 * Suggest optimal times for different activities based on patterns
 */
export interface OptimalTimeSlot {
  activity: 'deep-work' | 'social' | 'exercise' | 'creative' | 'admin'
  suggestedHours: number[] // hours of day (0-23)
  reason: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function suggestOptimalTimes(_state: OctaviusState): OptimalTimeSlot[] {
  // These are sensible defaults; in a full implementation,
  // we'd analyze the user's historical patterns
  return [
    {
      activity: 'deep-work',
      suggestedHours: [9, 10, 11],
      reason: 'Morning hours typically offer peak cognitive performance',
    },
    {
      activity: 'creative',
      suggestedHours: [10, 11, 20, 21],
      reason: 'Creative work suits both morning clarity and evening relaxation',
    },
    {
      activity: 'social',
      suggestedHours: [12, 13, 17, 18, 19],
      reason: 'Lunch and after-work hours are natural social times',
    },
    {
      activity: 'admin',
      suggestedHours: [14, 15, 16],
      reason: 'Afternoon energy dip suits routine tasks',
    },
    {
      activity: 'exercise',
      suggestedHours: [6, 7, 17, 18],
      reason: 'Early morning or post-work exercise fits most schedules',
    },
  ]
}
