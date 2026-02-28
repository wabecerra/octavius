import type { MemoryItem } from './models'
import { MEMORY_TYPES, MEMORY_LAYERS, SOURCE_TYPES } from './models'

/**
 * Ordered list of fields for consistent JSON serialization.
 * Matches the canonical MemoryItem interface order.
 */
const FIELD_ORDER: readonly (keyof MemoryItem)[] = [
  'memory_id',
  'text',
  'type',
  'layer',
  'provenance',
  'created_at',
  'last_accessed',
  'confidence',
  'importance',
  'tags',
  'embedding_ref',
  'consolidated_into',
  'archived',
] as const

/**
 * Serialize a MemoryItem to JSON with consistent field ordering.
 * Guarantees deterministic output for the same input.
 */
export function serializeMemoryItem(item: MemoryItem): string {
  const ordered: Record<string, unknown> = {}
  for (const key of FIELD_ORDER) {
    ordered[key] = item[key]
  }
  return JSON.stringify(ordered)
}

/**
 * Deserialize a JSON string back into a MemoryItem.
 * Validates that all required fields are present and have correct types.
 * Throws on invalid JSON or missing/invalid fields.
 */
export function deserializeMemoryItem(json: string): MemoryItem {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON: unable to parse input')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid MemoryItem: expected a JSON object')
  }

  const obj = parsed as Record<string, unknown>

  // Validate required string fields
  for (const field of ['memory_id', 'text', 'type', 'layer', 'created_at', 'last_accessed']) {
    if (typeof obj[field] !== 'string') {
      throw new Error(`Invalid MemoryItem: missing or invalid field '${field}'`)
    }
  }

  // Validate type enum
  if (!(MEMORY_TYPES as readonly string[]).includes(obj.type as string)) {
    throw new Error(`Invalid MemoryItem: type must be one of ${MEMORY_TYPES.join(', ')}`)
  }

  // Validate layer enum
  if (!(MEMORY_LAYERS as readonly string[]).includes(obj.layer as string)) {
    throw new Error(`Invalid MemoryItem: layer must be one of ${MEMORY_LAYERS.join(', ')}`)
  }

  // Validate provenance
  if (typeof obj.provenance !== 'object' || obj.provenance === null) {
    throw new Error("Invalid MemoryItem: missing or invalid field 'provenance'")
  }
  const prov = obj.provenance as Record<string, unknown>
  if (typeof prov.source_type !== 'string') {
    throw new Error("Invalid MemoryItem: missing or invalid field 'provenance.source_type'")
  }
  if (!(SOURCE_TYPES as readonly string[]).includes(prov.source_type)) {
    throw new Error(`Invalid MemoryItem: provenance.source_type must be one of ${SOURCE_TYPES.join(', ')}`)
  }
  if (typeof prov.source_id !== 'string') {
    throw new Error("Invalid MemoryItem: missing or invalid field 'provenance.source_id'")
  }
  if (prov.agent_id !== null && typeof prov.agent_id !== 'string') {
    throw new Error("Invalid MemoryItem: provenance.agent_id must be a string or null")
  }

  // Validate numeric fields
  if (typeof obj.confidence !== 'number') {
    throw new Error("Invalid MemoryItem: missing or invalid field 'confidence'")
  }
  if (typeof obj.importance !== 'number') {
    throw new Error("Invalid MemoryItem: missing or invalid field 'importance'")
  }

  // Validate tags
  if (!Array.isArray(obj.tags)) {
    throw new Error("Invalid MemoryItem: missing or invalid field 'tags'")
  }

  // Validate nullable string fields
  if (obj.embedding_ref !== null && typeof obj.embedding_ref !== 'string') {
    throw new Error("Invalid MemoryItem: 'embedding_ref' must be a string or null")
  }
  if (obj.consolidated_into !== null && typeof obj.consolidated_into !== 'string') {
    throw new Error("Invalid MemoryItem: 'consolidated_into' must be a string or null")
  }

  // Validate archived
  if (typeof obj.archived !== 'boolean') {
    throw new Error("Invalid MemoryItem: missing or invalid field 'archived'")
  }

  return {
    memory_id: obj.memory_id as string,
    text: obj.text as string,
    type: obj.type as MemoryItem['type'],
    layer: obj.layer as MemoryItem['layer'],
    provenance: {
      source_type: prov.source_type as MemoryItem['provenance']['source_type'],
      source_id: prov.source_id as string,
      agent_id: (prov.agent_id as string | null),
    },
    created_at: obj.created_at as string,
    last_accessed: obj.last_accessed as string,
    confidence: obj.confidence as number,
    importance: obj.importance as number,
    tags: obj.tags as string[],
    embedding_ref: (obj.embedding_ref as string | null),
    consolidated_into: (obj.consolidated_into as string | null),
    archived: obj.archived as boolean,
  }
}

/**
 * Format a MemoryItem as human-readable Markdown text.
 * Includes all key fields in a structured layout.
 */
export function prettyPrintMemoryItem(item: MemoryItem): string {
  const lines: string[] = []

  // Header with ID, type, and layer
  lines.push(`## Memory: ${item.memory_id}`)
  lines.push('')
  lines.push(`**Type:** ${item.type}  `)
  lines.push(`**Layer:** ${item.layer}  `)
  lines.push(`**Archived:** ${item.archived ? 'Yes' : 'No'}`)
  lines.push('')

  // Text content
  lines.push('### Content')
  lines.push('')
  lines.push(item.text)
  lines.push('')

  // Provenance
  lines.push('### Provenance')
  lines.push('')
  lines.push(`- **Source Type:** ${item.provenance.source_type}`)
  lines.push(`- **Source ID:** ${item.provenance.source_id}`)
  lines.push(`- **Agent ID:** ${item.provenance.agent_id ?? 'None'}`)
  lines.push('')

  // Scores
  lines.push('### Scores')
  lines.push('')
  lines.push(`- **Confidence:** ${item.confidence}`)
  lines.push(`- **Importance:** ${item.importance}`)
  lines.push('')

  // Tags
  lines.push('### Tags')
  lines.push('')
  if (item.tags.length > 0) {
    lines.push(item.tags.map((t) => `\`${t}\``).join(', '))
  } else {
    lines.push('_No tags_')
  }
  lines.push('')

  // Timestamps
  lines.push('### Timestamps')
  lines.push('')
  lines.push(`- **Created:** ${item.created_at}`)
  lines.push(`- **Last Accessed:** ${item.last_accessed}`)
  lines.push('')

  // References
  if (item.embedding_ref || item.consolidated_into) {
    lines.push('### References')
    lines.push('')
    if (item.embedding_ref) {
      lines.push(`- **Embedding Ref:** ${item.embedding_ref}`)
    }
    if (item.consolidated_into) {
      lines.push(`- **Consolidated Into:** ${item.consolidated_into}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
