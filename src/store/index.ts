import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { OctaviusState, WellnessCheckIn, Task, FocusGoal, ScheduleItem, Connection, ActivityLog, JournalEntry, GratitudeEntry, Goal, WeeklyReview, Agent, AgentTask, AgentTaskStatus, EscalationEvent, ModelRouterConfig } from '@/types'
import { validateProgressPct } from '@/lib/validation'
import { SyncLayer, type SyncStatus } from '@/lib/memory/sync-layer'
import { type GatewaySlice, createGatewaySlice } from './gateway'

const STORAGE_KEY = 'octavius_v1'
const SCHEMA_VERSION = 1

/**
 * Singleton SyncLayer instance for propagating mutations to the Memory Service.
 * Initialized lazily; falls back gracefully when Memory Service is unreachable.
 */
let syncLayerInstance: SyncLayer | null = null

function getSyncLayer(): SyncLayer {
  if (!syncLayerInstance) {
    const apiBase = typeof window !== 'undefined'
      ? `${window.location.origin}/api/memory`
      : 'http://localhost:3000/api/memory'
    syncLayerInstance = new SyncLayer(apiBase)
  }
  return syncLayerInstance
}

/**
 * Fire-and-forget sync: intercept a mutation and propagate to Memory Service.
 * Updates syncStatus on the store. Never throws.
 */
function fireSync(type: string, payload: Record<string, unknown>): void {
  const sync = getSyncLayer()
  sync.interceptMutation(type as Parameters<SyncLayer['interceptMutation']>[0], payload)
    .then(() => {
      try { useOctaviusStore.setState({ syncStatus: sync.getStatus() }) } catch { /* store not ready */ }
    })
    .catch(() => {
      try { useOctaviusStore.setState({ syncStatus: sync.getStatus() }) } catch { /* store not ready */ }
    })
}

/**
 * Safe localStorage wrapper that catches setItem/getItem errors
 * and sets a storageError flag on the store when failures occur.
 */
export function createSafeStorage(): StateStorage {
  return {
    getItem(name: string): string | null {
      try {
        return localStorage.getItem(name)
      } catch {
        // Mark storage error on the store if it exists
        try {
          useOctaviusStore.setState({ storageError: true })
        } catch {
          // Store may not be initialized yet — flag will be set via onRehydrateStorage
        }
        return null
      }
    },
    setItem(name: string, value: string): void {
      try {
        localStorage.setItem(name, value)
      } catch {
        useOctaviusStore.setState({ storageError: true })
      }
    },
    removeItem(name: string): void {
      try {
        localStorage.removeItem(name)
      } catch {
        // Silently ignore remove failures
      }
    },
  }
}

/**
 * Migrate persisted state from an older schema version to the current version.
 * Each version step is handled explicitly so migrations compose cleanly.
 * Returns the migrated state, or null if migration is not possible.
 */
export function migrateState(
  persisted: Record<string, unknown>,
  fromVersion: number,
  toVersion: number,
): Record<string, unknown> | null {
  const state = { ...persisted }
  let version = fromVersion

  // Step through each version increment
  while (version < toVersion) {
    if (version === 0) {
      // v0 → v1: passthrough — the initial schema is compatible
      // Future breaking changes would add field defaults here
      version = 1
    } else {
      // Unknown version gap — cannot migrate
      return null
    }
  }

  return state
}

export interface StoreActions {
  // Storage error flag (UI reads this to show warning banner)
  storageError: boolean
  clearStorageError: () => void
  // Sync layer status
  syncStatus: SyncStatus
  // Local model connection status
  localModelStatus: 'unknown' | 'connected' | 'disconnected'
  setLocalModelStatus: (status: 'unknown' | 'connected' | 'disconnected') => void
  checkLocalModel: () => Promise<void>
  addCheckIn: (checkIn: WellnessCheckIn) => void
  updateMetrics: (metrics: Partial<{ steps: number; sleepHours: number; heartRate: number }>) => void
  createTask: (task: Task) => void
  editTask: (id: string, updates: Partial<Task>) => void
  deleteTask: (id: string) => void
  addFocusGoal: (goal: FocusGoal) => boolean
  addScheduleItem: (item: ScheduleItem) => void
  addConnection: (connection: Connection) => void
  updateConnection: (id: string, updates: Partial<Connection>) => void
  logActivity: (entry: ActivityLog) => void
  setReminderFrequency: (connectionId: string, days: number) => void
  // Soul slice
  addJournalEntry: (entry: JournalEntry) => void
  addGratitudeEntry: (entry: GratitudeEntry) => void
  // Goals slice
  createGoal: (goal: Goal) => void
  updateGoalProgress: (id: string, progressPct: number) => boolean
  // Profile slice
  updateProfile: (updates: Partial<OctaviusState['profile']>) => void
  // WeeklyReview slice
  addWeeklyReview: (review: WeeklyReview) => void
  // Agents slice
  updateAgentStatus: (agentId: string, status: 'idle' | 'running' | 'error') => void
  // AgentTasks slice
  createAgentTask: (task: AgentTask) => void
  updateAgentTaskStatus: (taskId: string, status: AgentTaskStatus, result?: string) => void
  cancelAgentTask: (taskId: string) => void
  // EscalationLog slice
  appendEscalationEvent: (event: EscalationEvent) => void
  // RouterConfig slice
  updateRouterConfig: (updates: Partial<ModelRouterConfig>) => void
}

export type OctaviusStore = OctaviusState & StoreActions & GatewaySlice

/**
 * Selector: returns the check-in with the most recent timestamp, or undefined if empty.
 */
export function latestCheckIn(state: OctaviusState): WellnessCheckIn | undefined {
  const checkIns = state.health.checkIns
  if (checkIns.length === 0) return undefined
  return checkIns.reduce((latest, current) =>
    current.timestamp > latest.timestamp ? current : latest,
  )
}

/**
 * Selector: returns agent tasks filtered by agentId.
 */
export function tasksByAgent(state: OctaviusState, agentId: string): AgentTask[] {
  return state.agentTasks.filter((t) => t.agentId === agentId)
}

/**
 * Selector: returns connections where daysSince(lastContactDate) > reminderFrequencyDays.
 */
export function overdueConnections(state: OctaviusState, now?: Date): Connection[] {
  const today = now ?? new Date()
  return state.relationships.connections.filter((c) => {
    const lastContact = new Date(c.lastContactDate)
    const diffMs = today.getTime() - lastContact.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return diffDays > c.reminderFrequencyDays
  })
}

/**
 * Pre-seeded agents: 4 Generalists (one per quadrant) + 6 Specialists.
 */
export const seededAgents: Agent[] = [
  { id: 'generalist-health', role: 'generalist-health', name: 'Health Generalist', status: 'idle', lastActivityAt: undefined },
  { id: 'generalist-career', role: 'generalist-career', name: 'Career Generalist', status: 'idle', lastActivityAt: undefined },
  { id: 'generalist-relationships', role: 'generalist-relationships', name: 'Relationships Generalist', status: 'idle', lastActivityAt: undefined },
  { id: 'generalist-soul', role: 'generalist-soul', name: 'Soul Generalist', status: 'idle', lastActivityAt: undefined },
  { id: 'specialist-research', role: 'specialist-research', name: 'Research Specialist', status: 'idle', lastActivityAt: undefined },
  { id: 'specialist-engineering', role: 'specialist-engineering', name: 'Engineering Specialist', status: 'idle', lastActivityAt: undefined },
  { id: 'specialist-marketing', role: 'specialist-marketing', name: 'Marketing Specialist', status: 'idle', lastActivityAt: undefined },
  { id: 'specialist-video', role: 'specialist-video', name: 'Video Specialist', status: 'idle', lastActivityAt: undefined },
  { id: 'specialist-image', role: 'specialist-image', name: 'Image Specialist', status: 'idle', lastActivityAt: undefined },
  { id: 'specialist-writing', role: 'specialist-writing', name: 'Writing Specialist', status: 'idle', lastActivityAt: undefined },
]

export const defaultState: OctaviusState = {
  profile: {
    name: '',
    coreValues: '',
    lifeVision: '',
    accentColor: '#7C3AED',
    weeklyReviewDay: 0,
  },
  health: {
    checkIns: [],
    metrics: {},
  },
  career: {
    tasks: [],
    focusGoals: [],
    scheduleItems: [],
  },
  relationships: {
    connections: [],
    activityLog: [],
  },
  soul: {
    journalEntries: [],
    gratitudeEntries: [],
  },
  goals: [],
  weeklyReviews: [],
  agents: seededAgents,
  agentTasks: [],
  escalationLog: [],
  routerConfig: {
    localEndpoint: 'http://localhost:11434',
    localModelName: 'llama3.2',
    tier1CloudModel: 'gemini-flash',
    tier2Model: 'claude-sonnet-4-5',
    tier3Model: 'claude-opus-4-5',
    researchProvider: 'kimi',
    dailyCostBudget: 5,
    tierCostRates: { 1: 0.01, 2: 0.05, 3: 0.15 },
  },
}

export const useOctaviusStore = create<OctaviusStore>()(
  persist(
    (set, get, api) => ({
      ...defaultState,
      ...createGatewaySlice(set as Parameters<typeof createGatewaySlice>[0], get as Parameters<typeof createGatewaySlice>[1], api as Parameters<typeof createGatewaySlice>[2]),
      storageError: false,
      clearStorageError: () => set({ storageError: false }),
      syncStatus: 'synced' as SyncStatus,
      localModelStatus: 'unknown' as const,
      setLocalModelStatus: (status: 'unknown' | 'connected' | 'disconnected') =>
        set({ localModelStatus: status }),
      checkLocalModel: async () => {
        const { routerConfig } = get()
        try {
          const response = await fetch(`${routerConfig.localEndpoint}/api/tags`, {
            signal: AbortSignal.timeout(5000),
          })
          set({ localModelStatus: response.ok ? 'connected' : 'disconnected' })
        } catch {
          set({ localModelStatus: 'disconnected' })
        }
      },
      addCheckIn: (checkIn: WellnessCheckIn) => {
        set((state) => ({
          health: {
            ...state.health,
            checkIns: [...state.health.checkIns, checkIn],
          },
        }))
        fireSync('addCheckIn', checkIn as unknown as Record<string, unknown>)
      },
      updateMetrics: (metrics: Partial<{ steps: number; sleepHours: number; heartRate: number }>) =>
        set((state) => ({
          health: {
            ...state.health,
            metrics: { ...state.health.metrics, ...metrics },
          },
        })),
      createTask: (task: Task) => {
        set((state) => ({
          career: {
            ...state.career,
            tasks: [...state.career.tasks, task],
          },
        }))
        fireSync('createTask', task as unknown as Record<string, unknown>)
      },
      editTask: (id: string, updates: Partial<Task>) =>
        set((state) => ({
          career: {
            ...state.career,
            tasks: state.career.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
          },
        })),
      deleteTask: (id: string) =>
        set((state) => ({
          career: {
            ...state.career,
            tasks: state.career.tasks.filter((t) => t.id !== id),
          },
        })),
      addFocusGoal: (goal: FocusGoal) => {
        const state = get()
        const goalsForDate = state.career.focusGoals.filter((g) => g.date === goal.date)
        if (goalsForDate.length >= 3) return false
        set({
          career: {
            ...state.career,
            focusGoals: [...state.career.focusGoals, goal],
          },
        })
        return true
      },
      addScheduleItem: (item: ScheduleItem) =>
        set((state) => ({
          career: {
            ...state.career,
            scheduleItems: [...state.career.scheduleItems, item],
          },
        })),
      addConnection: (connection: Connection) => {
        set((state) => ({
          relationships: {
            ...state.relationships,
            connections: [...state.relationships.connections, connection],
          },
        }))
        fireSync('addConnection', connection as unknown as Record<string, unknown>)
      },
      updateConnection: (id: string, updates: Partial<Connection>) =>
        set((state) => ({
          relationships: {
            ...state.relationships,
            connections: state.relationships.connections.map((c) =>
              c.id === id ? { ...c, ...updates } : c,
            ),
          },
        })),
      logActivity: (entry: ActivityLog) => {
        set((state) => ({
          relationships: {
            ...state.relationships,
            activityLog: [...state.relationships.activityLog, entry],
            connections: state.relationships.connections.map((c) =>
              c.id === entry.connectionId ? { ...c, lastContactDate: entry.date } : c,
            ),
          },
        }))
        fireSync('logActivity', entry as unknown as Record<string, unknown>)
      },
      setReminderFrequency: (connectionId: string, days: number) =>
        set((state) => ({
          relationships: {
            ...state.relationships,
            connections: state.relationships.connections.map((c) =>
              c.id === connectionId ? { ...c, reminderFrequencyDays: days } : c,
            ),
          },
        })),
      // Soul slice
      addJournalEntry: (entry: JournalEntry) => {
        set((state) => ({
          soul: {
            ...state.soul,
            journalEntries: [...state.soul.journalEntries, entry],
          },
        }))
        fireSync('addJournalEntry', entry as unknown as Record<string, unknown>)
      },
      addGratitudeEntry: (entry: GratitudeEntry) => {
        set((state) => ({
          soul: {
            ...state.soul,
            gratitudeEntries: [...state.soul.gratitudeEntries, entry],
          },
        }))
        fireSync('addGratitudeEntry', entry as unknown as Record<string, unknown>)
      },
      // Goals slice
      createGoal: (goal: Goal) => {
        set((state) => ({
          goals: [...state.goals, goal],
        }))
        fireSync('createGoal', goal as unknown as Record<string, unknown>)
      },
      updateGoalProgress: (id: string, progressPct: number) => {
        if (!validateProgressPct(progressPct)) return false
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === id ? { ...g, progressPct } : g,
          ),
        }))
        return true
      },
      // Profile slice
      updateProfile: (updates: Partial<OctaviusState['profile']>) =>
        set((state) => ({
          profile: { ...state.profile, ...updates },
        })),
      // WeeklyReview slice
      addWeeklyReview: (review: WeeklyReview) => {
        set((state) => ({
          weeklyReviews: [...state.weeklyReviews, review],
        }))
        fireSync('addWeeklyReview', review as unknown as Record<string, unknown>)
      },
      // Agents slice
      updateAgentStatus: (agentId: string, status: 'idle' | 'running' | 'error') =>
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId ? { ...a, status, lastActivityAt: new Date().toISOString() } : a,
          ),
        })),
      // AgentTasks slice
      createAgentTask: (task: AgentTask) =>
        set((state) => ({
          agentTasks: [...state.agentTasks, task],
        })),
      updateAgentTaskStatus: (taskId: string, status: AgentTaskStatus, result?: string) =>
        set((state) => ({
          agentTasks: state.agentTasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status,
                  ...(result !== undefined ? { result } : {}),
                  ...(status === 'complete' || status === 'failed' ? { completedAt: new Date().toISOString() } : {}),
                }
              : t,
          ),
        })),
      cancelAgentTask: (taskId: string) =>
        set((state) => ({
          agentTasks: state.agentTasks.map((t) =>
            t.id === taskId ? { ...t, status: 'cancelled' as const } : t,
          ),
        })),
      // EscalationLog slice
      appendEscalationEvent: (event: EscalationEvent) =>
        set((state) => ({
          escalationLog: [...state.escalationLog, event],
        })),
      // RouterConfig slice
      updateRouterConfig: (updates: Partial<ModelRouterConfig>) =>
        set((state) => ({
          routerConfig: { ...state.routerConfig, ...updates },
        })),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => createSafeStorage()),
      partialize: (state) => {
        // Exclude transient gateway state from persistence; keep address/port and chat messages
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { gatewayStatus, connectedAt, lastHealthyAt, registeredAgents, activeSessions, recentSessions, scheduledJobs, heartbeatActions, dailyTokenUsage, ...persisted } = state
        return persisted
      },
      migrate: (persistedState, version) => {
        const migrated = migrateState(
          persistedState as Record<string, unknown>,
          version,
          SCHEMA_VERSION,
        )
        if (migrated === null) {
          // Migration failed — fall back to defaults and warn
          useOctaviusStore.setState({ storageError: true })
          return { ...defaultState, storageError: true } as OctaviusStore
        }
        return migrated as unknown as OctaviusStore
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            // localStorage parse error or unavailable — initialize with defaults and flag
            useOctaviusStore.setState({ ...defaultState, storageError: true })
          }
        }
      },
    },
  ),
)
