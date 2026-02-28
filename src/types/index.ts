// Quadrant domain
export type QuadrantId = 'health' | 'career' | 'relationships' | 'soul'

export interface WellnessCheckIn {
  id: string
  timestamp: string // ISO 8601
  mood: 1 | 2 | 3 | 4 | 5
  energy: 1 | 2 | 3 | 4 | 5
  stress: 1 | 2 | 3 | 4 | 5
}

export interface Task {
  id: string
  title: string
  description?: string
  priority: 'high' | 'medium' | 'low'
  dueDate?: string // ISO 8601 date
  completed: boolean
  createdAt: string
}

export interface FocusGoal {
  id: string
  date: string // ISO 8601 date (YYYY-MM-DD)
  title: string
}

export interface Connection {
  id: string
  name: string
  relationshipType: string
  lastContactDate: string // ISO 8601 date
  reminderFrequencyDays: number
}

export interface ActivityLog {
  id: string
  connectionId: string
  description: string
  date: string // ISO 8601 date
}

export interface JournalEntry {
  id: string
  text: string
  timestamp: string // ISO 8601
}

export interface GratitudeEntry {
  id: string
  date: string // ISO 8601 date
  items: string[] // 1–3 items
}

export interface Goal {
  id: string
  quadrant: QuadrantId
  title: string
  description?: string
  targetDate?: string
  progressPct: number // 0–100
}

export interface WeeklyReview {
  id: string
  timestamp: string
  wentWell: string
  didNotGoWell: string
  nextWeekFocus: string
}

// Agent domain
export type AgentRole =
  | 'generalist-health'
  | 'generalist-career'
  | 'generalist-relationships'
  | 'generalist-soul'
  | 'specialist-research'
  | 'specialist-engineering'
  | 'specialist-marketing'
  | 'specialist-video'
  | 'specialist-image'
  | 'specialist-writing'

export type ModelTier = 1 | 2 | 3
export type AgentTaskStatus = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled'

export interface Agent {
  id: string
  role: AgentRole
  name: string
  status: 'idle' | 'running' | 'error'
  lastActivityAt?: string
}

export interface AgentTask {
  id: string
  agentId: string
  description: string
  complexityScore: number // 1–10
  tier: ModelTier
  modelUsed: string
  status: AgentTaskStatus
  result?: string
  sourceUrls?: string[] // Research Agent only
  isVerified?: boolean // Research Agent only
  createdAt: string
  completedAt?: string
}

export interface EscalationEvent {
  id: string
  taskId: string
  fromTier: ModelTier
  toTier: ModelTier
  failureReason: string
  timestamp: string
}

// Model Router
export interface ModelRouterConfig {
  localEndpoint: string // default: 'http://localhost:11434'
  localModelName: string // e.g. 'llama3.2'
  tier1CloudModel: string // e.g. 'gemini-flash'
  tier2Model: string // e.g. 'claude-sonnet-4-5'
  tier3Model: string // e.g. 'claude-opus-4-5'
  researchProvider: string // e.g. 'kimi'
  dailyCostBudget: number // USD
  tierCostRates: { 1: number; 2: number; 3: number } // USD per 1k tokens (estimated)
}

export interface RoutingDecision {
  tier: ModelTier
  model: string
  endpoint: string
  isLocal: boolean
}

// Schedule
export interface ScheduleItem {
  id: string
  date: string // ISO 8601 date (YYYY-MM-DD)
  title: string
  startTime?: string // HH:mm
  endTime?: string // HH:mm
}

// Zustand Store Shape
export interface OctaviusState {
  // Profile
  profile: {
    name: string
    coreValues: string
    lifeVision: string
    accentColor: string
    weeklyReviewDay: number // 0=Sunday … 6=Saturday
  }

  // Health Quadrant
  health: {
    checkIns: WellnessCheckIn[]
    metrics: { steps?: number; sleepHours?: number; heartRate?: number }
  }

  // Wealth/Career Quadrant
  career: {
    tasks: Task[]
    focusGoals: FocusGoal[]
    scheduleItems: ScheduleItem[]
  }

  // Relationships Quadrant
  relationships: {
    connections: Connection[]
    activityLog: ActivityLog[]
  }

  // Soul/Emotional Quadrant
  soul: {
    journalEntries: JournalEntry[]
    gratitudeEntries: GratitudeEntry[]
  }

  // Goals (cross-quadrant)
  goals: Goal[]

  // Weekly Reviews
  weeklyReviews: WeeklyReview[]

  // Agent Fleet
  agents: Agent[]
  agentTasks: AgentTask[]
  escalationLog: EscalationEvent[]

  // Model Router Config
  routerConfig: ModelRouterConfig
}

// Schema versioning for localStorage persistence
export interface PersistedState {
  version: number // increment on breaking schema changes
  data: OctaviusState
}
