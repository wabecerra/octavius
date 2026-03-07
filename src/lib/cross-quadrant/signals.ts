/**
 * Cross-Quadrant Signal Bus
 * 
 * A lightweight pub/sub system for agents to emit and subscribe to
 * cross-quadrant signals. Enables holistic awareness across the 4 quadrants:
 * - Lifeforce (health)
 * - Industry (career)
 * - Fellowship (relationships)
 * - Essence (soul)
 */

import type { QuadrantId, OctaviusState } from '@/types'

// Signal severity levels
export type SignalSeverity = 'info' | 'warning' | 'alert'

// Signal categories that cross quadrant boundaries
export type SignalType =
  // Lifeforce → others
  | 'low-energy'
  | 'poor-sleep'
  | 'high-stress'
  | 'good-energy'
  | 'recovered'
  // Industry → others
  | 'overloaded'
  | 'task-streak'
  | 'deadline-pressure'
  | 'productive-day'
  // Fellowship → others
  | 'social-isolation'
  | 'connection-fulfilled'
  | 'relationship-neglect'
  // Essence → others
  | 'low-mood'
  | 'high-mood'
  | 'gratitude-streak'
  | 'reflection-needed'
  // Meta signals
  | 'quadrant-imbalance'
  | 'recovery-recommended'

export interface Signal {
  id: string
  type: SignalType
  sourceQuadrant: QuadrantId
  targetQuadrants: QuadrantId[] // who should care about this signal
  severity: SignalSeverity
  message: string
  data?: Record<string, unknown> // contextual data
  timestamp: string // ISO 8601
  expiresAt?: string // optional TTL
}

export type SignalHandler = (signal: Signal) => void

interface Subscription {
  id: string
  quadrant: QuadrantId
  handler: SignalHandler
  filter?: SignalType[] // only receive specific signal types
}

/**
 * SignalBus - Central nervous system for cross-quadrant communication
 */
export class SignalBus {
  private subscriptions: Map<string, Subscription> = new Map()
  private signals: Signal[] = []
  private maxSignalHistory = 100

  /**
   * Subscribe a quadrant agent to receive signals
   */
  subscribe(
    quadrant: QuadrantId,
    handler: SignalHandler,
    filter?: SignalType[]
  ): string {
    const id = `sub_${quadrant}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    this.subscriptions.set(id, { id, quadrant, handler, filter })
    return id
  }

  /**
   * Unsubscribe from the bus
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId)
  }

  /**
   * Emit a signal to relevant quadrant agents
   */
  emit(signal: Omit<Signal, 'id' | 'timestamp'>): Signal {
    const fullSignal: Signal = {
      ...signal,
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
    }

    // Store in history
    this.signals.push(fullSignal)
    if (this.signals.length > this.maxSignalHistory) {
      this.signals = this.signals.slice(-this.maxSignalHistory)
    }

    // Deliver to subscribed handlers
    for (const sub of this.subscriptions.values()) {
      // Check if this subscriber cares about this signal
      const isTargeted = fullSignal.targetQuadrants.includes(sub.quadrant)
      const passesFilter = !sub.filter || sub.filter.includes(fullSignal.type)

      if (isTargeted && passesFilter) {
        try {
          sub.handler(fullSignal)
        } catch (err) {
          console.error(`Signal handler error for ${sub.quadrant}:`, err)
        }
      }
    }

    return fullSignal
  }

  /**
   * Get recent signals for a quadrant
   */
  getSignalsFor(quadrant: QuadrantId, limit = 10): Signal[] {
    return this.signals
      .filter((s) => s.targetQuadrants.includes(quadrant))
      .slice(-limit)
  }

  /**
   * Get all active (non-expired) signals
   */
  getActiveSignals(): Signal[] {
    const now = new Date().toISOString()
    return this.signals.filter((s) => !s.expiresAt || s.expiresAt > now)
  }

  /**
   * Clear all signals and subscriptions (for testing)
   */
  reset(): void {
    this.subscriptions.clear()
    this.signals = []
  }
}

// Singleton instance for app-wide use
let busInstance: SignalBus | null = null

export function getSignalBus(): SignalBus {
  if (!busInstance) {
    busInstance = new SignalBus()
  }
  return busInstance
}

/**
 * Analyze state and emit appropriate signals
 * Called after state changes to detect cross-quadrant implications
 */
export function analyzeAndEmitSignals(state: OctaviusState, bus: SignalBus = getSignalBus()): Signal[] {
  const emitted: Signal[] = []
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  // --- Lifeforce signals ---
  const recentCheckIns = state.health.checkIns
    .filter((c) => c.timestamp.slice(0, 10) === todayStr)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const latestCheckIn = recentCheckIns[0]

  if (latestCheckIn) {
    // Low energy signal
    if (latestCheckIn.energy <= 2) {
      emitted.push(
        bus.emit({
          type: 'low-energy',
          sourceQuadrant: 'health',
          targetQuadrants: ['career', 'relationships', 'soul'],
          severity: latestCheckIn.energy === 1 ? 'alert' : 'warning',
          message: 'Energy levels are low. Consider lighter tasks and self-care.',
          data: { energy: latestCheckIn.energy },
        })
      )
    }

    // High stress signal
    if (latestCheckIn.stress >= 4) {
      emitted.push(
        bus.emit({
          type: 'high-stress',
          sourceQuadrant: 'health',
          targetQuadrants: ['career', 'relationships', 'soul'],
          severity: latestCheckIn.stress === 5 ? 'alert' : 'warning',
          message: 'Stress levels elevated. Reduce commitments if possible.',
          data: { stress: latestCheckIn.stress },
        })
      )
    }

    // Good energy signal
    if (latestCheckIn.energy >= 4 && latestCheckIn.stress <= 2) {
      emitted.push(
        bus.emit({
          type: 'good-energy',
          sourceQuadrant: 'health',
          targetQuadrants: ['career', 'soul'],
          severity: 'info',
          message: 'Great energy today! Good time for challenging tasks.',
          data: { energy: latestCheckIn.energy, stress: latestCheckIn.stress },
        })
      )
    }
  }

  // Poor sleep signal
  const sleepHours = state.health.metrics.sleepHours
  if (sleepHours !== undefined && sleepHours < 6) {
    emitted.push(
      bus.emit({
        type: 'poor-sleep',
        sourceQuadrant: 'health',
        targetQuadrants: ['career', 'relationships'],
        severity: sleepHours < 5 ? 'alert' : 'warning',
        message: `Only ${sleepHours} hours of sleep. Recommend lighter workload.`,
        data: { sleepHours },
        expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(), // 12h TTL
      })
    )
  }

  // --- Industry signals ---
  const todayTasks = state.career.tasks.filter(
    (t) => t.createdAt.slice(0, 10) === todayStr
  )
  const pendingHighPriority = state.career.tasks.filter(
    (t) => !t.completed && t.priority === 'high'
  )

  // Overloaded signal
  if (pendingHighPriority.length >= 5) {
    emitted.push(
      bus.emit({
        type: 'overloaded',
        sourceQuadrant: 'career',
        targetQuadrants: ['health', 'relationships', 'soul'],
        severity: pendingHighPriority.length >= 7 ? 'alert' : 'warning',
        message: `${pendingHighPriority.length} high-priority tasks pending. Risk of burnout.`,
        data: { pendingCount: pendingHighPriority.length },
      })
    )
  }

  // Task streak signal
  const completedToday = todayTasks.filter((t) => t.completed).length
  if (completedToday >= 5) {
    emitted.push(
      bus.emit({
        type: 'productive-day',
        sourceQuadrant: 'career',
        targetQuadrants: ['health', 'soul'],
        severity: 'info',
        message: `Productive day! ${completedToday} tasks completed.`,
        data: { completedCount: completedToday },
      })
    )
  }

  // --- Fellowship signals ---
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const recentActivity = state.relationships.activityLog.filter(
    (a) => new Date(a.date) >= weekAgo
  )

  // Social isolation signal
  if (recentActivity.length === 0 && state.relationships.connections.length > 0) {
    emitted.push(
      bus.emit({
        type: 'social-isolation',
        sourceQuadrant: 'relationships',
        targetQuadrants: ['health', 'soul'],
        severity: 'warning',
        message: 'No social interactions logged this week. Connection matters.',
        data: { daysSinceLastContact: 7 },
      })
    )
  }

  // --- Essence signals ---
  // Low mood detection from check-in
  if (latestCheckIn && latestCheckIn.mood <= 2) {
    emitted.push(
      bus.emit({
        type: 'low-mood',
        sourceQuadrant: 'soul',
        targetQuadrants: ['health', 'career', 'relationships'],
        severity: latestCheckIn.mood === 1 ? 'alert' : 'warning',
        message: 'Mood is low. Consider journaling or reaching out to someone.',
        data: { mood: latestCheckIn.mood },
      })
    )
  }

  // Gratitude streak
  const recentGratitude = state.soul.gratitudeEntries
    .filter((g) => {
      const daysDiff = (now.getTime() - new Date(g.date).getTime()) / (1000 * 60 * 60 * 24)
      return daysDiff <= 7
    })
  if (recentGratitude.length >= 5) {
    emitted.push(
      bus.emit({
        type: 'gratitude-streak',
        sourceQuadrant: 'soul',
        targetQuadrants: ['health'],
        severity: 'info',
        message: 'Great gratitude practice this week! Keep it up.',
        data: { entriesThisWeek: recentGratitude.length },
      })
    )
  }

  return emitted
}

/**
 * Generate recommendations based on active signals
 */
export interface CrossQuadrantRecommendation {
  targetQuadrant: QuadrantId
  action: string
  reason: string
  priority: 'high' | 'medium' | 'low'
  relatedSignals: string[] // signal IDs
}

export function generateRecommendations(
  bus: SignalBus = getSignalBus()
): CrossQuadrantRecommendation[] {
  const recommendations: CrossQuadrantRecommendation[] = []
  const activeSignals = bus.getActiveSignals()

  // Poor sleep → lighter Industry workload
  const poorSleep = activeSignals.find((s) => s.type === 'poor-sleep')
  if (poorSleep) {
    recommendations.push({
      targetQuadrant: 'career',
      action: 'Reschedule demanding tasks to later this week',
      reason: `Sleep-deprived (${poorSleep.data?.sleepHours}h). Cognitive performance reduced.`,
      priority: 'high',
      relatedSignals: [poorSleep.id],
    })
  }

  // Low energy → suggest recovery activities
  const lowEnergy = activeSignals.find((s) => s.type === 'low-energy')
  if (lowEnergy) {
    recommendations.push({
      targetQuadrant: 'soul',
      action: 'Take a short walk or do breathing exercises',
      reason: 'Energy is depleted. Brief recovery can help.',
      priority: 'medium',
      relatedSignals: [lowEnergy.id],
    })
  }

  // High stress + overloaded → critical intervention
  const highStress = activeSignals.find((s) => s.type === 'high-stress')
  const overloaded = activeSignals.find((s) => s.type === 'overloaded')
  if (highStress && overloaded) {
    recommendations.push({
      targetQuadrant: 'career',
      action: 'Delegate or defer at least 2 high-priority tasks',
      reason: 'Burnout risk: high stress combined with task overload.',
      priority: 'high',
      relatedSignals: [highStress.id, overloaded.id],
    })
  }

  // Social isolation + low mood → reach out
  const isolated = activeSignals.find((s) => s.type === 'social-isolation')
  const lowMood = activeSignals.find((s) => s.type === 'low-mood')
  if (isolated && lowMood) {
    recommendations.push({
      targetQuadrant: 'relationships',
      action: 'Reach out to a close friend or family member',
      reason: 'Low mood may improve with social connection.',
      priority: 'high',
      relatedSignals: [isolated.id, lowMood.id],
    })
  }

  // Good energy → suggest tackling challenging work
  const goodEnergy = activeSignals.find((s) => s.type === 'good-energy')
  if (goodEnergy) {
    recommendations.push({
      targetQuadrant: 'career',
      action: 'Tackle your most challenging task now',
      reason: 'Peak energy state - ideal for difficult work.',
      priority: 'medium',
      relatedSignals: [goodEnergy.id],
    })
  }

  return recommendations
}
