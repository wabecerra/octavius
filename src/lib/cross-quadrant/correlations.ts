/**
 * Cross-Quadrant Correlation Analysis
 * 
 * Analyzes relationships between data points across quadrants to discover
 * patterns and insights. For example:
 * - Does better sleep correlate with more completed tasks?
 * - Does journaling correlate with improved mood?
 * - Do social interactions correlate with energy levels?
 */

import type { QuadrantId, OctaviusState } from '@/types'

export interface DataPoint {
  date: string // YYYY-MM-DD
  quadrant: QuadrantId
  metric: string
  value: number
}

export interface CorrelationResult {
  metricA: { quadrant: QuadrantId; metric: string }
  metricB: { quadrant: QuadrantId; metric: string }
  coefficient: number // -1 to 1 (Pearson correlation)
  strength: 'strong' | 'moderate' | 'weak' | 'none'
  direction: 'positive' | 'negative' | 'none'
  sampleSize: number
  insight?: string // human-readable interpretation
}

/**
 * Extract time-series data points from OctaviusState
 * Groups data by date for correlation analysis
 */
export function extractDataPoints(state: OctaviusState): DataPoint[] {
  const points: DataPoint[] = []

  // --- Health quadrant ---
  // Check-ins (mood, energy, stress)
  for (const checkIn of state.health.checkIns) {
    const date = checkIn.timestamp.slice(0, 10)
    points.push({ date, quadrant: 'health', metric: 'mood', value: checkIn.mood })
    points.push({ date, quadrant: 'health', metric: 'energy', value: checkIn.energy })
    points.push({ date, quadrant: 'health', metric: 'stress', value: checkIn.stress })
  }

  // Sleep hours (if available)
  if (state.health.metrics.sleepHours !== undefined) {
    // For metrics, we use today's date since they're current values
    const today = new Date().toISOString().slice(0, 10)
    points.push({
      date: today,
      quadrant: 'health',
      metric: 'sleepHours',
      value: state.health.metrics.sleepHours,
    })
  }

  // --- Career quadrant ---
  // Tasks completed per day
  const tasksByDate = new Map<string, { total: number; completed: number; highPriority: number }>()
  for (const task of state.career.tasks) {
    const date = task.createdAt.slice(0, 10)
    const entry = tasksByDate.get(date) || { total: 0, completed: 0, highPriority: 0 }
    entry.total++
    if (task.completed) entry.completed++
    if (task.priority === 'high') entry.highPriority++
    tasksByDate.set(date, entry)
  }

  for (const [date, stats] of tasksByDate) {
    points.push({ date, quadrant: 'career', metric: 'tasksCreated', value: stats.total })
    points.push({ date, quadrant: 'career', metric: 'tasksCompleted', value: stats.completed })
    points.push({ date, quadrant: 'career', metric: 'highPriorityTasks', value: stats.highPriority })
    points.push({
      date,
      quadrant: 'career',
      metric: 'completionRate',
      value: stats.total > 0 ? stats.completed / stats.total : 0,
    })
  }

  // Focus goals per day
  const focusGoalsByDate = new Map<string, number>()
  for (const goal of state.career.focusGoals) {
    focusGoalsByDate.set(goal.date, (focusGoalsByDate.get(goal.date) || 0) + 1)
  }
  for (const [date, count] of focusGoalsByDate) {
    points.push({ date, quadrant: 'career', metric: 'focusGoals', value: count })
  }

  // --- Relationships quadrant ---
  // Activity log interactions per day
  const interactionsByDate = new Map<string, number>()
  const uniqueConnectionsByDate = new Map<string, Set<string>>()

  for (const activity of state.relationships.activityLog) {
    const date = activity.date.slice(0, 10)
    interactionsByDate.set(date, (interactionsByDate.get(date) || 0) + 1)
    
    if (!uniqueConnectionsByDate.has(date)) {
      uniqueConnectionsByDate.set(date, new Set())
    }
    uniqueConnectionsByDate.get(date)!.add(activity.connectionId)
  }

  for (const [date, count] of interactionsByDate) {
    points.push({ date, quadrant: 'relationships', metric: 'interactions', value: count })
  }
  for (const [date, connections] of uniqueConnectionsByDate) {
    points.push({ date, quadrant: 'relationships', metric: 'uniqueContacts', value: connections.size })
  }

  // --- Soul quadrant ---
  // Journal entries per day
  const journalsByDate = new Map<string, number>()
  const journalWordsByDate = new Map<string, number>()

  for (const entry of state.soul.journalEntries) {
    const date = entry.timestamp.slice(0, 10)
    journalsByDate.set(date, (journalsByDate.get(date) || 0) + 1)
    journalWordsByDate.set(date, (journalWordsByDate.get(date) || 0) + entry.text.split(/\s+/).length)
  }

  for (const [date, count] of journalsByDate) {
    points.push({ date, quadrant: 'soul', metric: 'journalEntries', value: count })
  }
  for (const [date, words] of journalWordsByDate) {
    points.push({ date, quadrant: 'soul', metric: 'journalWords', value: words })
  }

  // Gratitude entries per day
  const gratitudeByDate = new Map<string, number>()
  for (const entry of state.soul.gratitudeEntries) {
    gratitudeByDate.set(entry.date, (gratitudeByDate.get(entry.date) || 0) + entry.items.length)
  }
  for (const [date, count] of gratitudeByDate) {
    points.push({ date, quadrant: 'soul', metric: 'gratitudeItems', value: count })
  }

  return points
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) return 0

  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0)

  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

  if (denominator === 0) return 0
  return numerator / denominator
}

/**
 * Interpret correlation coefficient
 */
function interpretCorrelation(r: number): { strength: CorrelationResult['strength']; direction: CorrelationResult['direction'] } {
  const absR = Math.abs(r)
  
  let strength: CorrelationResult['strength']
  if (absR >= 0.7) strength = 'strong'
  else if (absR >= 0.4) strength = 'moderate'
  else if (absR >= 0.2) strength = 'weak'
  else strength = 'none'

  let direction: CorrelationResult['direction']
  if (absR < 0.2) direction = 'none'
  else direction = r > 0 ? 'positive' : 'negative'

  return { strength, direction }
}

/**
 * Generate human-readable insight from correlation
 */
function generateInsight(
  metricA: { quadrant: QuadrantId; metric: string },
  metricB: { quadrant: QuadrantId; metric: string },
  correlation: { strength: CorrelationResult['strength']; direction: CorrelationResult['direction'] }
): string | undefined {
  if (correlation.strength === 'none') return undefined

  const strengthWords = {
    strong: 'strongly',
    moderate: 'moderately', 
    weak: 'slightly',
    none: '',
  }

  const directionWords = {
    positive: 'increases',
    negative: 'decreases',
    none: '',
  }

  // Generate contextual insights for common patterns
  const patterns: Record<string, string> = {
    // Health → Career
    'health:energy→career:tasksCompleted': 
      `Higher energy ${strengthWords[correlation.strength]} correlates with task completion.`,
    'health:sleepHours→career:completionRate':
      `Better sleep ${strengthWords[correlation.strength]} correlates with productivity.`,
    'health:stress→career:tasksCompleted':
      correlation.direction === 'negative' 
        ? `Higher stress ${strengthWords[correlation.strength]} reduces task completion.`
        : `Stress may be driving productivity (consider if sustainable).`,
    
    // Health → Soul
    'health:mood→soul:journalEntries':
      correlation.direction === 'positive'
        ? `Better mood ${strengthWords[correlation.strength]} correlates with more journaling.`
        : `Lower mood may trigger more reflective writing.`,
    'health:energy→soul:gratitudeItems':
      `Energy levels ${strengthWords[correlation.strength]} ${directionWords[correlation.direction]} gratitude practice.`,
    
    // Health → Relationships
    'health:energy→relationships:interactions':
      `Energy ${strengthWords[correlation.strength]} affects social engagement.`,
    'health:mood→relationships:uniqueContacts':
      `Mood ${strengthWords[correlation.strength]} influences social reach.`,

    // Career → Soul
    'career:tasksCompleted→soul:journalEntries':
      correlation.direction === 'negative'
        ? `Busy days may leave less time for reflection.`
        : `Productive days may inspire more journaling.`,

    // Relationships → Health
    'relationships:interactions→health:mood':
      `Social interactions ${strengthWords[correlation.strength]} ${directionWords[correlation.direction]} mood.`,
    
    // Soul → Health  
    'soul:gratitudeItems→health:mood':
      `Gratitude practice ${strengthWords[correlation.strength]} ${directionWords[correlation.direction]} mood over time.`,
  }

  const key = `${metricA.quadrant}:${metricA.metric}→${metricB.quadrant}:${metricB.metric}`
  const reverseKey = `${metricB.quadrant}:${metricB.metric}→${metricA.quadrant}:${metricA.metric}`

  return patterns[key] || patterns[reverseKey] || 
    `${metricA.metric} and ${metricB.metric} are ${strengthWords[correlation.strength]} ${correlation.direction === 'positive' ? 'positively' : 'negatively'} correlated.`
}

/**
 * Find correlations between two specific metrics
 */
export function correlate(
  points: DataPoint[],
  metricA: { quadrant: QuadrantId; metric: string },
  metricB: { quadrant: QuadrantId; metric: string }
): CorrelationResult | null {
  // Get data points for each metric by date
  const aByDate = new Map<string, number>()
  const bByDate = new Map<string, number>()

  for (const p of points) {
    if (p.quadrant === metricA.quadrant && p.metric === metricA.metric) {
      // Average if multiple values per day
      aByDate.set(p.date, (aByDate.get(p.date) || 0 + p.value) / (aByDate.has(p.date) ? 2 : 1))
    }
    if (p.quadrant === metricB.quadrant && p.metric === metricB.metric) {
      bByDate.set(p.date, (bByDate.get(p.date) || 0 + p.value) / (bByDate.has(p.date) ? 2 : 1))
    }
  }

  // Find overlapping dates
  const commonDates = [...aByDate.keys()].filter((d) => bByDate.has(d))
  
  if (commonDates.length < 5) {
    return null // Not enough data points
  }

  const xValues = commonDates.map((d) => aByDate.get(d)!)
  const yValues = commonDates.map((d) => bByDate.get(d)!)

  const coefficient = pearsonCorrelation(xValues, yValues)
  const { strength, direction } = interpretCorrelation(coefficient)

  return {
    metricA,
    metricB,
    coefficient,
    strength,
    direction,
    sampleSize: commonDates.length,
    insight: generateInsight(metricA, metricB, { strength, direction }),
  }
}

/**
 * Compute all meaningful cross-quadrant correlations
 */
export function computeCrossQuadrantCorrelations(state: OctaviusState): CorrelationResult[] {
  const points = extractDataPoints(state)
  const results: CorrelationResult[] = []

  // Define metric pairs to analyze (cross-quadrant only)
  const metricPairs: Array<[{ quadrant: QuadrantId; metric: string }, { quadrant: QuadrantId; metric: string }]> = [
    // Health → Career
    [{ quadrant: 'health', metric: 'energy' }, { quadrant: 'career', metric: 'tasksCompleted' }],
    [{ quadrant: 'health', metric: 'energy' }, { quadrant: 'career', metric: 'completionRate' }],
    [{ quadrant: 'health', metric: 'stress' }, { quadrant: 'career', metric: 'tasksCompleted' }],
    [{ quadrant: 'health', metric: 'mood' }, { quadrant: 'career', metric: 'completionRate' }],
    [{ quadrant: 'health', metric: 'sleepHours' }, { quadrant: 'career', metric: 'tasksCompleted' }],

    // Health → Relationships
    [{ quadrant: 'health', metric: 'energy' }, { quadrant: 'relationships', metric: 'interactions' }],
    [{ quadrant: 'health', metric: 'mood' }, { quadrant: 'relationships', metric: 'uniqueContacts' }],
    [{ quadrant: 'health', metric: 'stress' }, { quadrant: 'relationships', metric: 'interactions' }],

    // Health → Soul
    [{ quadrant: 'health', metric: 'mood' }, { quadrant: 'soul', metric: 'journalEntries' }],
    [{ quadrant: 'health', metric: 'energy' }, { quadrant: 'soul', metric: 'journalWords' }],
    [{ quadrant: 'health', metric: 'mood' }, { quadrant: 'soul', metric: 'gratitudeItems' }],

    // Career → Relationships
    [{ quadrant: 'career', metric: 'tasksCompleted' }, { quadrant: 'relationships', metric: 'interactions' }],
    [{ quadrant: 'career', metric: 'highPriorityTasks' }, { quadrant: 'relationships', metric: 'uniqueContacts' }],

    // Career → Soul
    [{ quadrant: 'career', metric: 'tasksCompleted' }, { quadrant: 'soul', metric: 'journalEntries' }],
    [{ quadrant: 'career', metric: 'completionRate' }, { quadrant: 'soul', metric: 'gratitudeItems' }],

    // Relationships → Soul
    [{ quadrant: 'relationships', metric: 'interactions' }, { quadrant: 'soul', metric: 'journalEntries' }],
    [{ quadrant: 'relationships', metric: 'uniqueContacts' }, { quadrant: 'soul', metric: 'gratitudeItems' }],
  ]

  for (const [metricA, metricB] of metricPairs) {
    const result = correlate(points, metricA, metricB)
    if (result && result.strength !== 'none') {
      results.push(result)
    }
  }

  // Sort by absolute correlation strength
  return results.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
}

/**
 * Get the top N most significant correlations
 */
export function getTopCorrelations(state: OctaviusState, n = 5): CorrelationResult[] {
  return computeCrossQuadrantCorrelations(state).slice(0, n)
}

/**
 * Summary of quadrant health based on correlations and data
 */
export interface QuadrantHealthScore {
  quadrant: QuadrantId
  score: number // 0-100
  trend: 'improving' | 'stable' | 'declining'
  factors: string[]
}

export function computeQuadrantHealth(state: OctaviusState): QuadrantHealthScore[] {
  const scores: QuadrantHealthScore[] = []
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // --- Health score ---
  const recentCheckIns = state.health.checkIns.filter(
    (c) => new Date(c.timestamp) >= weekAgo
  )
  if (recentCheckIns.length > 0) {
    const avgMood = recentCheckIns.reduce((s, c) => s + c.mood, 0) / recentCheckIns.length
    const avgEnergy = recentCheckIns.reduce((s, c) => s + c.energy, 0) / recentCheckIns.length
    const avgStress = recentCheckIns.reduce((s, c) => s + c.stress, 0) / recentCheckIns.length
    
    // Score formula: normalize mood/energy to 0-100, subtract stress impact
    const healthScore = Math.round(
      ((avgMood + avgEnergy) / 2 - 1) * 25 - (avgStress - 1) * 5
    )
    
    const factors: string[] = []
    if (avgMood >= 4) factors.push('Good mood')
    if (avgMood <= 2) factors.push('Low mood')
    if (avgEnergy >= 4) factors.push('High energy')
    if (avgEnergy <= 2) factors.push('Low energy')
    if (avgStress >= 4) factors.push('High stress')
    
    scores.push({
      quadrant: 'health',
      score: Math.max(0, Math.min(100, healthScore)),
      trend: avgMood > 3 && avgStress < 3 ? 'improving' : avgMood < 3 || avgStress > 3 ? 'declining' : 'stable',
      factors,
    })
  } else {
    scores.push({ quadrant: 'health', score: 50, trend: 'stable', factors: ['No recent check-ins'] })
  }

  // --- Career score ---
  const recentTasks = state.career.tasks.filter(
    (t) => new Date(t.createdAt) >= weekAgo
  )
  const completedRecent = recentTasks.filter((t) => t.completed)
  const completionRate = recentTasks.length > 0 ? completedRecent.length / recentTasks.length : 0
  const pendingHigh = state.career.tasks.filter((t) => !t.completed && t.priority === 'high').length
  
  const careerScore = Math.round(completionRate * 80 + (pendingHigh <= 3 ? 20 : 0))
  
  scores.push({
    quadrant: 'career',
    score: Math.max(0, Math.min(100, careerScore)),
    trend: completionRate > 0.7 ? 'improving' : completionRate < 0.3 ? 'declining' : 'stable',
    factors: [
      `${Math.round(completionRate * 100)}% completion rate`,
      pendingHigh > 5 ? `${pendingHigh} high-priority tasks pending` : 'Workload manageable',
    ],
  })

  // --- Relationships score ---
  const recentInteractions = state.relationships.activityLog.filter(
    (a) => new Date(a.date) >= weekAgo
  )
  const uniqueContactedThisWeek = new Set(recentInteractions.map((a) => a.connectionId)).size
  const totalConnections = state.relationships.connections.length
  const contactRatio = totalConnections > 0 ? uniqueContactedThisWeek / totalConnections : 0
  
  const relationshipsScore = Math.round(
    Math.min(contactRatio * 100, 70) + (recentInteractions.length >= 3 ? 30 : recentInteractions.length * 10)
  )
  
  scores.push({
    quadrant: 'relationships',
    score: Math.max(0, Math.min(100, relationshipsScore)),
    trend: uniqueContactedThisWeek >= 3 ? 'improving' : uniqueContactedThisWeek === 0 ? 'declining' : 'stable',
    factors: [
      `${uniqueContactedThisWeek}/${totalConnections} connections contacted this week`,
      recentInteractions.length === 0 ? 'No logged interactions' : `${recentInteractions.length} interactions`,
    ],
  })

  // --- Soul score ---
  const recentJournals = state.soul.journalEntries.filter(
    (j) => new Date(j.timestamp) >= weekAgo
  )
  const recentGratitude = state.soul.gratitudeEntries.filter(
    (g) => new Date(g.date) >= weekAgo
  )
  
  const soulScore = Math.round(
    Math.min(recentJournals.length * 15, 50) + Math.min(recentGratitude.length * 15, 50)
  )
  
  scores.push({
    quadrant: 'soul',
    score: Math.max(0, Math.min(100, soulScore)),
    trend: recentJournals.length >= 3 && recentGratitude.length >= 3 ? 'improving' : 
           recentJournals.length === 0 && recentGratitude.length === 0 ? 'declining' : 'stable',
    factors: [
      `${recentJournals.length} journal entries this week`,
      `${recentGratitude.length} gratitude entries this week`,
    ],
  })

  return scores
}
