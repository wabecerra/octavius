import type Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import type {
  CreateMemoryItemInput,
  MemoryConfig,
  MemoryItem,
  SearchQuery,
  SearchResult,
  WorkflowDefinition,
} from './models'
import type { AgentTask, EscalationEvent } from '../../types'
import { validateConfidence, validateImportance } from './validation'
import { computeEmbedding, storeEmbedding } from './embeddings'

/** Row shape returned by better-sqlite3 for memory_items queries. */
interface MemoryRow {
  memory_id: string
  text: string
  type: string
  layer: string
  source_type: string
  source_id: string
  agent_id: string | null
  created_at: string
  last_accessed: string
  confidence: number
  importance: number
  tags: string
  embedding_ref: string | null
  consolidated_into: string | null
  archived: number
}

/** Convert a flat SQLite row into a MemoryItem with nested provenance and parsed tags. */
function rowToMemoryItem(row: MemoryRow): MemoryItem {
  return {
    memory_id: row.memory_id,
    text: row.text,
    type: row.type as MemoryItem['type'],
    layer: row.layer as MemoryItem['layer'],
    provenance: {
      source_type: row.source_type as MemoryItem['provenance']['source_type'],
      source_id: row.source_id,
      agent_id: row.agent_id,
    },
    created_at: row.created_at,
    last_accessed: row.last_accessed,
    confidence: row.confidence,
    importance: row.importance,
    tags: JSON.parse(row.tags) as string[],
    embedding_ref: row.embedding_ref,
    consolidated_into: row.consolidated_into,
    archived: row.archived === 1,
  }
}

/** Row shape returned by better-sqlite3 for workflow_definitions queries. */
interface WorkflowRow {
  name: string
  description: string
  steps: string
  trigger_conditions: string | null
  created_at: string
  updated_at: string
}

/** Convert a flat SQLite row into a WorkflowDefinition with parsed steps. */
function rowToWorkflow(row: WorkflowRow): WorkflowDefinition {
  return {
    name: row.name,
    description: row.description,
    steps: JSON.parse(row.steps) as WorkflowDefinition['steps'],
    ...(row.trigger_conditions != null ? { trigger_conditions: row.trigger_conditions } : {}),
  }
}

export class MemoryService {
  constructor(private readonly db: Database.Database) {}

  /**
   * Create a new memory item.
   * Generates a unique memory_id, sets timestamps, validates inputs, and inserts into SQLite.
   */
  create(input: CreateMemoryItemInput): MemoryItem {
    const confidence = input.confidence ?? 0.5
    const importance = input.importance ?? 0.5

    validateConfidence(confidence)
    validateImportance(importance)

    const now = new Date().toISOString()
    const memoryId = nanoid()
    const tags = input.tags ?? []

    this.db
      .prepare(
        `INSERT INTO memory_items
          (memory_id, text, type, layer, source_type, source_id, agent_id,
           created_at, last_accessed, confidence, importance, tags,
           embedding_ref, consolidated_into, archived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
      )
      .run(
        memoryId,
        input.text,
        input.type,
        input.layer,
        input.provenance.source_type,
        input.provenance.source_id,
        input.provenance.agent_id,
        now,
        now,
        confidence,
        importance,
        JSON.stringify(tags),
      )

    return {
      memory_id: memoryId,
      text: input.text,
      type: input.type,
      layer: input.layer,
      provenance: { ...input.provenance },
      created_at: now,
      last_accessed: now,
      confidence,
      importance,
      tags,
      embedding_ref: null,
      consolidated_into: null,
      archived: false,
    }
  }

  /**
   * Compute and store an embedding for a memory item (async, graceful fallback).
   * If embedding computation succeeds, stores the vector and updates the item's embedding_ref.
   * If it fails, the item remains without an embedding (logged warning only).
   */
  async computeAndStoreEmbeddingForItem(memoryId: string, text: string): Promise<void> {
    const config = this.getConfig()
    if (!config.embedding_enabled) return

    const embedding = await computeEmbedding(text, config)
    if (!embedding) return

    storeEmbedding(this.db, memoryId, embedding, config.embedding_model)
    this.db
      .prepare('UPDATE memory_items SET embedding_ref = ? WHERE memory_id = ?')
      .run(memoryId, memoryId)
  }

  /**
   * Retrieve a memory item by ID.
   * Updates last_accessed timestamp on successful retrieval (Req 1.3).
   * Returns null if not found.
   */
  getById(id: string): MemoryItem | null {
    const row = this.db
      .prepare('SELECT * FROM memory_items WHERE memory_id = ?')
      .get(id) as MemoryRow | undefined

    if (!row) return null

    // Update last_accessed
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE memory_items SET last_accessed = ? WHERE memory_id = ?')
      .run(now, id)

    row.last_accessed = now
    return rowToMemoryItem(row)
  }

  /**
   * Update mutable fields on an existing memory item.
   * Throws if the item does not exist.
   * Validates confidence/importance if provided.
   */
  update(id: string, updates: Partial<MemoryItem>): MemoryItem {
    // Verify item exists first
    const existing = this.db
      .prepare('SELECT memory_id FROM memory_items WHERE memory_id = ?')
      .get(id) as { memory_id: string } | undefined

    if (!existing) {
      throw new Error(`Memory item not found: ${id}`)
    }

    if (updates.confidence !== undefined) validateConfidence(updates.confidence)
    if (updates.importance !== undefined) validateImportance(updates.importance)

    // Build dynamic SET clause from provided fields
    const setClauses: string[] = []
    const values: unknown[] = []

    const fieldMap: Record<string, (v: unknown) => unknown> = {
      text: (v) => v,
      type: (v) => v,
      layer: (v) => v,
      confidence: (v) => v,
      importance: (v) => v,
      tags: (v) => JSON.stringify(v),
      embedding_ref: (v) => v,
      consolidated_into: (v) => v,
      archived: (v) => (v ? 1 : 0),
    }

    for (const [field, transform] of Object.entries(fieldMap)) {
      if ((updates as Record<string, unknown>)[field] !== undefined) {
        setClauses.push(`${field} = ?`)
        values.push(transform((updates as Record<string, unknown>)[field]))
      }
    }

    // Handle provenance sub-fields
    if (updates.provenance) {
      if (updates.provenance.source_type !== undefined) {
        setClauses.push('source_type = ?')
        values.push(updates.provenance.source_type)
      }
      if (updates.provenance.source_id !== undefined) {
        setClauses.push('source_id = ?')
        values.push(updates.provenance.source_id)
      }
      if (updates.provenance.agent_id !== undefined) {
        setClauses.push('agent_id = ?')
        values.push(updates.provenance.agent_id)
      }
    }

    if (setClauses.length > 0) {
      values.push(id)
      this.db
        .prepare(`UPDATE memory_items SET ${setClauses.join(', ')} WHERE memory_id = ?`)
        .run(...values)
    }

    // Return the updated item (getById also updates last_accessed)
    return this.getById(id)!
  }

  /**
   * Delete a memory item by ID.
   * Returns true if a row was deleted, false if not found.
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM memory_items WHERE memory_id = ?')
      .run(id)
    return result.changes > 0
  }

  /**
   * List memory items with optional filters.
   * Supports filtering by type, layer, tags, quadrant, source_type, agent_id.
   * Updates last_accessed on returned items.
   */
  list(filters: SearchQuery): SearchResult {
    const whereClauses: string[] = []
    const params: unknown[] = []

    if (filters.type) {
      whereClauses.push('type = ?')
      params.push(filters.type)
    }

    if (filters.layer) {
      whereClauses.push('layer = ?')
      params.push(filters.layer)
    }

    if (filters.source_type) {
      whereClauses.push('source_type = ?')
      params.push(filters.source_type)
    }

    if (filters.agent_id) {
      whereClauses.push('agent_id = ?')
      params.push(filters.agent_id)
    }

    // Tags filter: check if any of the filter tags appear in the item's tags JSON
    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => "tags LIKE ?")
      whereClauses.push(`(${tagConditions.join(' OR ')})`)
      for (const tag of filters.tags) {
        params.push(`%${JSON.stringify(tag).slice(1, -1)}%`)
      }
    }

    // Quadrant filter: check tags contain 'quadrant:{quadrantId}'
    if (filters.quadrant) {
      whereClauses.push("tags LIKE ?")
      params.push(`%"quadrant:${filters.quadrant}"%`)
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const limit = filters.limit ?? 20
    const offset = filters.offset ?? 0

    // Get total count
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM memory_items ${whereSQL}`)
      .get(...params) as { total: number }

    // Get paginated items
    const rows = this.db
      .prepare(`SELECT * FROM memory_items ${whereSQL} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as MemoryRow[]

    const items = rows.map(rowToMemoryItem)

    // Update last_accessed on returned items
    if (items.length > 0) {
      const now = new Date().toISOString()
      const ids = items.map((i) => i.memory_id)
      const placeholders = ids.map(() => '?').join(', ')
      this.db
        .prepare(`UPDATE memory_items SET last_accessed = ? WHERE memory_id IN (${placeholders})`)
        .run(now, ...ids)

      // Reflect the updated timestamp in returned items
      for (const item of items) {
        item.last_accessed = now
      }
    }

    return {
      items,
      total: countRow.total,
    }
  }

  // ---------------------------------------------------------------------------
  // Agent Task Memory Recording (Req 16.1, 16.2, 16.3)
  // ---------------------------------------------------------------------------

  /**
   * Record a successful agent task completion as an episodic memory.
   * Creates a daily_notes episodic memory with provenance source_type='agent_output'.
   */
  recordAgentTaskCompletion(task: AgentTask): MemoryItem {
    const text = [
      `Agent task completed: ${task.description}`,
      `Model: ${task.modelUsed} (Tier ${task.tier})`,
      `Complexity: ${task.complexityScore}`,
      task.result ? `Result: ${task.result}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    return this.create({
      text,
      type: 'episodic',
      layer: 'daily_notes',
      provenance: {
        source_type: 'agent_output',
        source_id: task.id,
        agent_id: task.agentId,
      },
      confidence: 0.9,
      importance: 0.6,
      tags: ['agent-task', 'task-completed'],
    })
  }

  /**
   * Record a failed agent task with escalation details as an episodic memory.
   * Creates a daily_notes episodic memory with failure and escalation info.
   */
  recordAgentTaskFailure(task: AgentTask, escalation: EscalationEvent): MemoryItem {
    const text = [
      `Agent task failed: ${task.description}`,
      `Model: ${task.modelUsed} (Tier ${task.tier})`,
      `Complexity: ${task.complexityScore}`,
      `Failure reason: ${escalation.failureReason}`,
      `Escalated from Tier ${escalation.fromTier} to Tier ${escalation.toTier}`,
    ].join('\n')

    return this.create({
      text,
      type: 'episodic',
      layer: 'daily_notes',
      provenance: {
        source_type: 'agent_output',
        source_id: task.id,
        agent_id: task.agentId,
      },
      confidence: 0.9,
      importance: 0.7,
      tags: ['agent-task', 'task-failed', 'escalation'],
    })
  }

  // ---------------------------------------------------------------------------
  // Configuration Management (Req 22.2, 22.3, 22.4)
  // ---------------------------------------------------------------------------

  /** Default configuration values. */
  private static readonly CONFIG_DEFAULTS: MemoryConfig = {
    consolidation_schedule: '0 2 * * *',
    decay_schedule: '0 3 * * *',
    evolution_schedule: '0 4 * * *',
    decay_archive_threshold: 0.2,
    decay_deletion_threshold: 0.05,
    novelty_similarity_threshold: 0.9,
    quality_gate_min_confidence: 0.3,
    embedding_enabled: false,
    embedding_endpoint: 'http://localhost:11434',
    embedding_model: 'nomic-embed-text',
    api_secret_token: '',
    context_retrieval_top_n: 10,
  }

  /**
   * Read the full MemoryConfig from the config table, falling back to defaults
   * for any missing keys. Generates an api_secret_token on first call if none exists.
   */
  getConfig(): MemoryConfig {
    const rows = this.db
      .prepare('SELECT key, value FROM config')
      .all() as Array<{ key: string; value: string }>

    const stored = new Map(rows.map((r) => [r.key, r.value]))

    // Build config from defaults + stored overrides
    const config: MemoryConfig = { ...MemoryService.CONFIG_DEFAULTS }

    for (const key of Object.keys(config) as Array<keyof MemoryConfig>) {
      const raw = stored.get(key)
      if (raw !== undefined) {
        // Parse numeric and boolean values back from string storage
        const defaultVal = MemoryService.CONFIG_DEFAULTS[key]
        if (typeof defaultVal === 'number') {
          ;(config as unknown as Record<string, unknown>)[key] = Number(raw)
        } else if (typeof defaultVal === 'boolean') {
          ;(config as unknown as Record<string, unknown>)[key] = raw === 'true'
        } else {
          ;(config as unknown as Record<string, unknown>)[key] = raw
        }
      }
    }

    // Generate api_secret_token on first init if empty
    if (!config.api_secret_token) {
      config.api_secret_token = crypto.randomUUID()
      this.db
        .prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)')
        .run('api_secret_token', config.api_secret_token, new Date().toISOString())
    }

    return config
  }

  /**
   * Update configuration values. Upserts each key-value pair into the config table.
   * Returns the full updated config.
   */
  updateConfig(updates: Partial<MemoryConfig>): MemoryConfig {
    const now = new Date().toISOString()
    const upsert = this.db.prepare(
      'INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)',
    )

    const runUpserts = this.db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          upsert.run(key, String(value), now)
        }
      }
    })
    runUpserts()

    return this.getConfig()
  }

  // ---------------------------------------------------------------------------
  // Workflow Definitions (Req 20.1)
  // ---------------------------------------------------------------------------

  /**
   * Store a workflow definition. Overwrites if a workflow with the same name exists.
   */
  createWorkflow(def: WorkflowDefinition): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT OR REPLACE INTO workflow_definitions
          (name, description, steps, trigger_conditions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        def.name,
        def.description,
        JSON.stringify(def.steps),
        def.trigger_conditions ?? null,
        now,
        now,
      )
  }

  /**
   * Retrieve a workflow definition by name. Returns null if not found.
   */
  getWorkflow(name: string): WorkflowDefinition | null {
    const row = this.db
      .prepare('SELECT * FROM workflow_definitions WHERE name = ?')
      .get(name) as WorkflowRow | undefined

    if (!row) return null
    return rowToWorkflow(row)
  }

  /**
   * List all stored workflow definitions.
   */
  listWorkflows(): WorkflowDefinition[] {
    const rows = this.db
      .prepare('SELECT * FROM workflow_definitions ORDER BY name')
      .all() as WorkflowRow[]

    return rows.map(rowToWorkflow)
  }

  /**
   * Delete a workflow definition by name. Returns true if deleted, false if not found.
   */
  deleteWorkflow(name: string): boolean {
    const result = this.db
      .prepare('DELETE FROM workflow_definitions WHERE name = ?')
      .run(name)
    return result.changes > 0
  }

}
