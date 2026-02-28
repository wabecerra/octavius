// Memory Item types
export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'entity_profile'
export type MemoryLayer = 'life_directory' | 'daily_notes' | 'tacit_knowledge'
export type SourceType =
  | 'user_input'
  | 'agent_output'
  | 'consolidation'
  | 'system_event'
  | 'dashboard_sync'
  | 'evolution'
  | 'device_sync'
export type QuadrantId = 'lifeforce' | 'industry' | 'fellowship' | 'essence'

export interface Provenance {
  source_type: SourceType
  source_id: string
  agent_id: string | null
}

export interface MemoryItem {
  memory_id: string
  text: string
  type: MemoryType
  layer: MemoryLayer
  provenance: Provenance
  created_at: string // ISO 8601
  last_accessed: string // ISO 8601
  confidence: number // 0.0–1.0
  importance: number // 0.0–1.0
  tags: string[]
  embedding_ref: string | null
  consolidated_into: string | null // memory_id of consolidated item
  archived: boolean
}

export interface CreateMemoryItemInput {
  text: string
  type: MemoryType
  layer: MemoryLayer
  provenance: Provenance
  confidence?: number // assigned by QualityGate if omitted
  importance?: number // assigned by QualityGate if omitted
  tags?: string[]
  bypass_quality_gate?: boolean // for system_event source_type
}

// Graph types
export interface MemoryEdge {
  edge_id: string
  source_memory_id: string
  target_memory_id: string
  relationship_type: string
  weight: number // 0.0–1.0, default 1.0
  created_at: string
}

export interface GraphNode {
  id: string
  label: string
  type: MemoryType
  quadrant: QuadrantId | null
  importance: number
  cluster?: number
}

export interface GraphExport {
  nodes: GraphNode[]
  edges: Array<{
    source: string
    target: string
    label: string
    weight: number
  }>
}

// Search types
export interface SearchQuery {
  text?: string // FTS5 query
  tags?: string[]
  type?: MemoryType
  layer?: MemoryLayer
  quadrant?: QuadrantId
  source_type?: SourceType
  agent_id?: string
  semantic_query?: string // natural language for embedding search
  limit?: number // default 20
  offset?: number
}

export interface SearchResult {
  items: MemoryItem[]
  total: number
  relevance_scores?: number[] // parallel to items, from FTS5 rank or hybrid fusion
  contexts?: string[] // parallel to items, resolved context annotations
}

// Heartbeat types
export type ProcessStatus = 'active' | 'stalled' | 'completed' | 'failed'

export interface HeartbeatProcess {
  process_id: string
  agent_id: string
  status: ProcessStatus
  started_at: string
  last_heartbeat: string
  completed_at: string | null
  heartbeat_interval_ms: number
}

// Job types
export interface JobRunLog {
  job_name: string
  started_at: string
  completed_at: string
  success: boolean
  details: Record<string, unknown>
  error?: string
}

// Workflow types
export interface WorkflowStep {
  agent_id: string
  task_template: string
  dependencies: string[] // step IDs that must complete first
  optional: boolean
}

export interface WorkflowDefinition {
  name: string
  description: string
  steps: WorkflowStep[]
  trigger_conditions?: string
}

// Configuration
export interface MemoryConfig {
  consolidation_schedule: string // cron expression, default '0 2 * * *'
  decay_schedule: string // cron expression, default '0 3 * * *'
  evolution_schedule: string // cron expression, default '0 4 * * *'
  decay_archive_threshold: number // default 0.2
  decay_deletion_threshold: number // default 0.05
  novelty_similarity_threshold: number // default 0.90
  quality_gate_min_confidence: number // default 0.3
  embedding_enabled: boolean // default false
  embedding_endpoint: string // default 'http://localhost:11434'
  embedding_model: string // default 'nomic-embed-text'
  api_secret_token: string // generated on first init
  context_retrieval_top_n: number // default 10
  reranking_enabled: boolean // auto-enabled when embedding_enabled is true
  query_expansion_enabled: boolean // auto-enabled when embedding_enabled is true
  smart_chunking_target_tokens: number // default 900 — target tokens per chunk
}

// Valid value sets for validation
export const MEMORY_TYPES: readonly MemoryType[] = [
  'episodic',
  'semantic',
  'procedural',
  'entity_profile',
] as const

export const MEMORY_LAYERS: readonly MemoryLayer[] = [
  'life_directory',
  'daily_notes',
  'tacit_knowledge',
] as const

export const SOURCE_TYPES: readonly SourceType[] = [
  'user_input',
  'agent_output',
  'consolidation',
  'system_event',
  'dashboard_sync',
  'evolution',
  'device_sync',
] as const

export const QUADRANT_IDS: readonly QuadrantId[] = [
  'lifeforce',
  'industry',
  'fellowship',
  'essence',
] as const
