import type { MemoryItem, CreateMemoryItemInput } from '@/lib/memory/models'
import { ObsidianClient } from './client'

/**
 * Obsidian ↔ Octavius Memory sync engine.
 *
 * Memory items are stored as markdown files with YAML frontmatter in a
 * configurable vault subfolder (default: "octavius/").
 *
 * Frontmatter schema:
 * ---
 * memory_id: <nanoid>
 * type: episodic | semantic | procedural | entity_profile
 * layer: life_directory | daily_notes | tacit_knowledge
 * confidence: 0.0–1.0
 * importance: 0.0–1.0
 * tags: [tag1, tag2]
 * source: octavius
 * created_at: ISO 8601
 * ---
 */

// ── Frontmatter helpers ──

export interface NoteFrontmatter {
  memory_id?: string
  type?: string
  layer?: string
  confidence?: number
  importance?: number
  tags?: string[]
  source?: string
  created_at?: string
}

/** Parse YAML frontmatter from markdown. Simple parser — no external deps. */
export function parseFrontmatter(markdown: string): { frontmatter: NoteFrontmatter; body: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: markdown }

  const raw = match[1]
  const body = match[2]
  const fm: Record<string, unknown> = {}

  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let val: unknown = line.slice(colonIdx + 1).trim()

    // Parse arrays: [a, b, c]
    if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    }
    // Parse numbers
    else if (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val)) {
      val = parseFloat(val)
    }

    fm[key] = val
  }

  return { frontmatter: fm as NoteFrontmatter, body }
}

/** Serialize frontmatter + body into markdown. */
export function toMarkdown(fm: NoteFrontmatter, body: string): string {
  const lines: string[] = ['---']
  if (fm.memory_id) lines.push(`memory_id: ${fm.memory_id}`)
  if (fm.type) lines.push(`type: ${fm.type}`)
  if (fm.layer) lines.push(`layer: ${fm.layer}`)
  if (fm.confidence !== undefined) lines.push(`confidence: ${fm.confidence}`)
  if (fm.importance !== undefined) lines.push(`importance: ${fm.importance}`)
  if (fm.tags && fm.tags.length > 0) lines.push(`tags: [${fm.tags.join(', ')}]`)
  lines.push(`source: octavius`)
  if (fm.created_at) lines.push(`created_at: ${fm.created_at}`)
  lines.push('---', '')
  lines.push(body)
  return lines.join('\n')
}

/** Build a vault-safe filename from a memory item. */
function memoryToFilename(item: MemoryItem): string {
  const slug = item.text
    .slice(0, 60)
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  return `${slug}-${item.memory_id.slice(0, 8)}.md`
}

// ── Wikilink parser ──

/** Extract [[wikilinks]] from markdown body. Returns target note names. */
export function extractWikilinks(markdown: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const links: string[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(markdown)) !== null) {
    links.push(m[1].trim())
  }
  return [...new Set(links)]
}

// ── Sync operations ──

export interface SyncResult {
  pushed: number
  pulled: number
  errors: string[]
}

/**
 * Push memory items to Obsidian vault as markdown files.
 * Only pushes items not already in the vault (checks frontmatter memory_id).
 */
export async function pushToVault(
  client: ObsidianClient,
  items: MemoryItem[],
  vaultFolder: string,
): Promise<{ pushed: number; errors: string[] }> {
  let pushed = 0
  const errors: string[] = []

  // Get existing files in the octavius folder
  let existingFiles: string[] = []
  try {
    existingFiles = await client.listFiles(vaultFolder)
  } catch {
    // Folder may not exist yet — that's fine, we'll create files
  }

  // Build a set of memory_ids already in vault by reading frontmatter
  const existingIds = new Set<string>()
  for (const file of existingFiles) {
    if (!file.endsWith('.md')) continue
    try {
      const content = await client.readNote(file)
      const { frontmatter } = parseFrontmatter(content)
      if (frontmatter.memory_id) existingIds.add(frontmatter.memory_id)
    } catch {
      // Skip unreadable files
    }
  }

  for (const item of items) {
    if (existingIds.has(item.memory_id)) continue
    if (item.archived) continue

    const filename = memoryToFilename(item)
    const path = `${vaultFolder}/${filename}`
    const fm: NoteFrontmatter = {
      memory_id: item.memory_id,
      type: item.type,
      layer: item.layer,
      confidence: item.confidence,
      importance: item.importance,
      tags: item.tags,
      created_at: item.created_at,
    }
    const md = toMarkdown(fm, item.text)

    try {
      await client.writeNote(path, md)
      pushed++
    } catch (err) {
      errors.push(`Failed to push ${item.memory_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { pushed, errors }
}

/**
 * Pull notes from Obsidian vault into Octavius memory.
 * Only pulls notes that have no memory_id in frontmatter (new notes created in Obsidian).
 * After pulling, stamps the note with the new memory_id to prevent re-pulling.
 * Returns CreateMemoryItemInput[] ready to be inserted via MemoryService.create().
 */
export async function pullFromVault(
  client: ObsidianClient,
  vaultFolder: string,
): Promise<{ items: Array<CreateMemoryItemInput & { _vaultPath: string }>; errors: string[] }> {
  const items: Array<CreateMemoryItemInput & { _vaultPath: string }> = []
  const errors: string[] = []

  let files: string[] = []
  try {
    files = await client.listFiles(vaultFolder)
  } catch {
    return { items, errors: ['Could not list vault folder'] }
  }

  for (const file of files) {
    if (!file.endsWith('.md')) continue

    try {
      const content = await client.readNote(file)
      const { frontmatter, body } = parseFrontmatter(content)

      // Skip notes already synced from Octavius
      if (frontmatter.memory_id || frontmatter.source === 'octavius') continue

      const text = body.trim()
      if (!text) continue

      items.push({
        text,
        type: (frontmatter.type as CreateMemoryItemInput['type']) ?? 'episodic',
        layer: (frontmatter.layer as CreateMemoryItemInput['layer']) ?? 'daily_notes',
        provenance: {
          source_type: 'device_sync',
          source_id: `obsidian:${file}`,
          agent_id: null,
        },
        confidence: typeof frontmatter.confidence === 'number' ? frontmatter.confidence : undefined,
        importance: typeof frontmatter.importance === 'number' ? frontmatter.importance : undefined,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        _vaultPath: file,
      })
    } catch (err) {
      errors.push(`Failed to read ${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { items, errors }
}

/**
 * After a note is pulled and assigned a memory_id, stamp the vault note
 * with the memory_id so it won't be re-pulled on the next sync.
 */
export async function stampPulledNote(
  client: ObsidianClient,
  vaultPath: string,
  memoryId: string,
): Promise<void> {
  try {
    const content = await client.readNote(vaultPath)
    const { frontmatter, body } = parseFrontmatter(content)
    frontmatter.memory_id = memoryId
    frontmatter.source = 'octavius'
    const updated = toMarkdown(frontmatter, body)
    await client.writeNote(vaultPath, updated)
  } catch {
    // Best-effort — note will be re-pulled next sync but dedup by source_id will catch it
  }
}

/**
 * Build a graph from all vault notes by parsing [[wikilinks]].
 * Returns nodes and edges compatible with our GraphExport-like format.
 */
export async function buildVaultGraph(
  client: ObsidianClient,
  rootFolder = '/',
): Promise<{ nodes: Map<string, { path: string; memoryId?: string; linkCount: number }>; edges: Array<{ source: string; target: string }> }> {
  const nodes = new Map<string, { path: string; memoryId?: string; linkCount: number }>()
  const edges: Array<{ source: string; target: string }> = []

  let files: string[] = []
  try {
    files = await client.listFiles(rootFolder)
  } catch {
    return { nodes, edges }
  }

  // First pass: register all files as nodes
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const name = file.replace(/\.md$/, '').split('/').pop() ?? file
    nodes.set(name, { path: file, linkCount: 0 })
  }

  // Second pass: parse wikilinks and build edges
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const sourceName = file.replace(/\.md$/, '').split('/').pop() ?? file

    try {
      const content = await client.readNote(file)
      const { frontmatter } = parseFrontmatter(content)

      // Tag node with memory_id if it has one
      const node = nodes.get(sourceName)
      if (node && frontmatter.memory_id) {
        node.memoryId = frontmatter.memory_id as string
      }

      const links = extractWikilinks(content)
      for (const target of links) {
        // Ensure target node exists (even if file doesn't exist yet — phantom node)
        if (!nodes.has(target)) {
          nodes.set(target, { path: `${target}.md`, linkCount: 0 })
        }
        nodes.get(target)!.linkCount++
        edges.push({ source: sourceName, target })
      }
    } catch {
      // Skip unreadable files
    }
  }

  return { nodes, edges }
}
