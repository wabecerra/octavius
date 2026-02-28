import type {
  CreateMemoryItemInput,
  MemoryItem,
  MemoryType,
  MemoryLayer,
  QuadrantId as MemoryQuadrantId,
} from './models'
import type {
  QuadrantId as DashboardQuadrantId,
  WellnessCheckIn,
  Task,
  JournalEntry,
  Goal,
  WeeklyReview,
  Connection,
  ActivityLog,
  GratitudeEntry,
} from '@/types'

// --- Types ---

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

export interface PendingMutation {
  id: string
  type: MutationType
  payload: Record<string, unknown>
  timestamp: string // ISO 8601
  retryCount: number
}

export type MutationType =
  | 'addCheckIn'
  | 'createTask'
  | 'editTask'
  | 'deleteTask'
  | 'addJournalEntry'
  | 'addGratitudeEntry'
  | 'createGoal'
  | 'updateGoalProgress'
  | 'addWeeklyReview'
  | 'addConnection'
  | 'logActivity'
  | 'updateConnection'

// --- Quadrant Mapping ---

/**
 * Maps dashboard QuadrantId (health/career/relationships/soul)
 * to memory QuadrantId (lifeforce/industry/fellowship/essence).
 */
const DASHBOARD_TO_MEMORY_QUADRANT: Record<DashboardQuadrantId, MemoryQuadrantId> = {
  health: 'lifeforce',
  career: 'industry',
  relationships: 'fellowship',
  soul: 'essence',
}

export function mapDashboardQuadrant(quadrant: DashboardQuadrantId): MemoryQuadrantId {
  return DASHBOARD_TO_MEMORY_QUADRANT[quadrant]
}

// --- Mutation → MemoryItem Mapping ---

interface MutationMapping {
  type: MemoryType
  layer: MemoryLayer
  quadrantTag: string | null
  textBuilder: (payload: Record<string, unknown>) => string
}

const MUTATION_MAPPINGS: Record<MutationType, MutationMapping> = {
  addCheckIn: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:lifeforce',
    textBuilder: (p) => {
      const c = p as unknown as WellnessCheckIn
      return `Wellness check-in: mood=${c.mood}, energy=${c.energy}, stress=${c.stress}`
    },
  },
  createTask: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:industry',
    textBuilder: (p) => {
      const t = p as unknown as Task
      return `Task created: ${t.title}${t.description ? ` — ${t.description}` : ''} [priority=${t.priority}]`
    },
  },
  editTask: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:industry',
    textBuilder: (p) => {
      const updates = p.updates as Partial<Task> | undefined
      const completed = updates?.completed
      if (completed) return `Task completed: ${p.id}`
      return `Task updated: ${p.id}`
    },
  },
  deleteTask: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:industry',
    textBuilder: (p) => `Task deleted: ${p.id}`,
  },
  addJournalEntry: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:essence',
    textBuilder: (p) => {
      const j = p as unknown as JournalEntry
      return `Journal entry: ${j.text}`
    },
  },
  addGratitudeEntry: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:essence',
    textBuilder: (p) => {
      const g = p as unknown as GratitudeEntry
      return `Gratitude: ${g.items.join(', ')}`
    },
  },
  createGoal: {
    type: 'semantic',
    layer: 'life_directory',
    quadrantTag: null, // determined dynamically from goal.quadrant
    textBuilder: (p) => {
      const g = p as unknown as Goal
      return `Goal: ${g.title}${g.description ? ` — ${g.description}` : ''}`
    },
  },
  updateGoalProgress: {
    type: 'semantic',
    layer: 'life_directory',
    quadrantTag: null, // determined dynamically
    textBuilder: (p) => `Goal progress updated: ${p.id} → ${p.progressPct}%`,
  },
  addWeeklyReview: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: null, // no specific quadrant
    textBuilder: (p) => {
      const r = p as unknown as WeeklyReview
      return `Weekly review: went well: ${r.wentWell}; didn't go well: ${r.didNotGoWell}; next week: ${r.nextWeekFocus}`
    },
  },
  addConnection: {
    type: 'entity_profile',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:fellowship',
    textBuilder: (p) => {
      const c = p as unknown as Connection
      return `Connection: ${c.name} (${c.relationshipType})`
    },
  },
  logActivity: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:fellowship',
    textBuilder: (p) => {
      const a = p as unknown as ActivityLog
      return `Activity: ${a.description}`
    },
  },
  updateConnection: {
    type: 'episodic',
    layer: 'daily_notes',
    quadrantTag: 'quadrant:fellowship',
    textBuilder: (p) => `Connection updated: ${p.id}`,
  },
}

/**
 * Maps a store mutation to a CreateMemoryItemInput.
 * Returns null if the mutation type is not recognized.
 */
export function mapMutationToMemoryItem(
  mutationType: MutationType,
  payload: Record<string, unknown>,
): CreateMemoryItemInput | null {
  const mapping = MUTATION_MAPPINGS[mutationType]
  if (!mapping) return null

  // Determine quadrant tag
  let quadrantTag = mapping.quadrantTag
  if (mutationType === 'createGoal') {
    const goal = payload as unknown as Goal
    const memQuadrant = DASHBOARD_TO_MEMORY_QUADRANT[goal.quadrant]
    if (memQuadrant) quadrantTag = `quadrant:${memQuadrant}`
  }

  const tags: string[] = []
  if (quadrantTag) tags.push(quadrantTag)

  return {
    text: mapping.textBuilder(payload),
    type: mapping.type,
    layer: mapping.layer,
    provenance: {
      source_type: 'dashboard_sync',
      source_id: (payload as Record<string, unknown>).id as string ?? mutationType,
      agent_id: null,
    },
    confidence: 0.8,
    importance: 0.5,
    tags,
    bypass_quality_gate: true,
  }
}

// --- Conflict Resolution ---

/**
 * Last-write-wins conflict resolution using timestamps.
 * Returns the item with the later created_at timestamp.
 */
export function resolveConflict(local: MemoryItem, remote: MemoryItem): MemoryItem {
  const localTime = new Date(local.created_at).getTime()
  const remoteTime = new Date(remote.created_at).getTime()
  // Ties go to remote (server is authoritative on equal timestamps)
  return localTime > remoteTime ? local : remote
}

// --- Sync Layer ---

const MAX_RETRY_COUNT = 5
const BASE_RETRY_DELAY_MS = 1000

/** Compute exponential backoff delay: base * 2^retryCount, capped at 30s */
export function computeBackoffDelay(retryCount: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** retryCount, 30_000)
}

export class SyncLayer {
  private pendingQueue: PendingMutation[] = []
  private status: SyncStatus = 'synced'
  private apiBaseUrl: string
  private processing = false
  private mutationCounter = 0

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl
  }

  getStatus(): SyncStatus {
    return this.status
  }

  getPendingQueue(): PendingMutation[] {
    return [...this.pendingQueue]
  }

  /**
   * Queue a mutation for sync to the Memory_Service.
   * Returns the PendingMutation that was queued.
   */
  queueMutation(type: MutationType, payload: Record<string, unknown>): PendingMutation {
    const mutation: PendingMutation = {
      id: `mut_${Date.now()}_${++this.mutationCounter}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    }
    this.pendingQueue.push(mutation)
    return mutation
  }

  /**
   * Remove a mutation from the pending queue by id.
   * Called after successful sync.
   */
  removeMutation(mutationId: string): boolean {
    const idx = this.pendingQueue.findIndex((m) => m.id === mutationId)
    if (idx === -1) return false
    this.pendingQueue.splice(idx, 1)
    if (this.pendingQueue.length === 0) {
      this.status = 'synced'
    }
    return true
  }

  /**
   * Process all pending mutations in FIFO order.
   * Uses exponential backoff on failure. Removes mutations on success.
   * Returns the list of successfully synced mutation ids.
   */
  async processPendingQueue(): Promise<string[]> {
    if (this.processing) return []
    this.processing = true
    this.status = 'syncing'

    const synced: string[] = []

    // Process in order — stop on first failure to preserve ordering
    while (this.pendingQueue.length > 0) {
      const mutation = this.pendingQueue[0]

      const memoryInput = mapMutationToMemoryItem(mutation.type, mutation.payload)
      if (!memoryInput) {
        // Unknown mutation type — discard
        this.pendingQueue.shift()
        continue
      }

      try {
        const response = await fetch(`${this.apiBaseUrl}/api/memory/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(memoryInput),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        // Success — remove from queue
        synced.push(mutation.id)
        this.pendingQueue.shift()
      } catch {
        // Failure — increment retry, apply backoff, stop processing
        mutation.retryCount++
        if (mutation.retryCount >= MAX_RETRY_COUNT) {
          this.status = 'error'
        } else {
          this.status = 'offline'
        }
        break
      }
    }

    if (this.pendingQueue.length === 0) {
      this.status = 'synced'
    }

    this.processing = false
    return synced
  }

  /**
   * Schedule retry of the pending queue with exponential backoff.
   * Returns a promise that resolves after the delay and processing.
   */
  async scheduleRetry(): Promise<string[]> {
    const nextMutation = this.pendingQueue[0]
    if (!nextMutation) return []

    const delay = computeBackoffDelay(nextMutation.retryCount)
    await new Promise((resolve) => setTimeout(resolve, delay))
    return this.processPendingQueue()
  }

  /**
   * Hydrate dashboard state from the Memory_Service.
   * Fetches all memory items and returns them for the store to consume.
   */
  async hydrate(): Promise<MemoryItem[]> {
    try {
      this.status = 'syncing'
      const response = await fetch(`${this.apiBaseUrl}/api/memory/items?limit=1000`)
      if (!response.ok) {
        this.status = 'offline'
        return []
      }
      const data = (await response.json()) as { items: MemoryItem[] }
      this.status = 'synced'
      return data.items ?? []
    } catch {
      this.status = 'offline'
      return []
    }
  }

  /**
   * Intercept a store mutation: queue it and attempt sync.
   * This is the main entry point called by the Zustand middleware.
   */
  async interceptMutation(type: MutationType, payload: Record<string, unknown>): Promise<void> {
    this.queueMutation(type, payload)
    await this.processPendingQueue()
  }
}
