import type Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { JobRunLog, MemoryConfig, MemoryItem } from './models'
import { NoveltyDetector } from './novelty'

/** File system operations interface for dependency injection (testability). */
export interface FsOps {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  mkdir(path: string): Promise<void>
  existsSync(path: string): boolean
}

/** Default file system operations using Node.js fs. */
export const defaultFsOps: FsOps = {
  readFile: (path) => readFile(path, 'utf-8'),
  writeFile: (path, content) => writeFile(path, content, 'utf-8'),
  mkdir: (path) => mkdir(path, { recursive: true }).then(() => {}),
  existsSync,
}

/** Row shape from memory_items table. */
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

/** Agent definitions for the Octavious system. */
const AGENTS = [
  { id: 'octavious-orchestrator', workspace: 'workspace-octavious', files: ['AGENTS.md', 'USER.md'] },
  { id: 'agent-lifeforce', workspace: 'workspace-octavious-lifeforce', files: ['AGENTS.md', 'USER.md'] },
  { id: 'agent-industry', workspace: 'workspace-octavious-industry', files: ['AGENTS.md', 'USER.md'] },
  { id: 'agent-fellowship', workspace: 'workspace-octavious-fellowship', files: ['AGENTS.md', 'USER.md'] },
  { id: 'agent-essence', workspace: 'workspace-octavious-essence', files: ['AGENTS.md', 'USER.md'] },
  { id: 'specialist-research', workspace: 'workspace-octavious-research', files: ['AGENTS.md'] },
  { id: 'specialist-engineering', workspace: 'workspace-octavious-engineer', files: ['AGENTS.md'] },
  { id: 'specialist-marketing', workspace: 'workspace-octavious-marketing', files: ['AGENTS.md'] },
  { id: 'specialist-video', workspace: 'workspace-octavious-video', files: ['AGENTS.md'] },
  { id: 'specialist-image', workspace: 'workspace-octavious-image', files: ['AGENTS.md'] },
  { id: 'specialist-writing', workspace: 'workspace-octavious-writing', files: ['AGENTS.md'] },
]

/**
 * Extract behavioral patterns from recent episodic memories for an agent.
 * Returns a list of pattern strings suitable for appending to AGENTS.md or USER.md.
 */
function extractPatterns(memories: MemoryItem[]): { behaviors: string[]; preferences: string[] } {
  const behaviors: string[] = []
  const preferences: string[] = []

  for (const mem of memories) {
    const text = mem.text.toLowerCase()

    // Extract behavioral patterns from agent_output memories
    if (mem.provenance.source_type === 'agent_output') {
      if (text.includes('pattern:') || text.includes('learned:') || text.includes('workflow:')) {
        behaviors.push(mem.text.trim())
      }
    }

    // Extract user preferences from user_input or dashboard_sync memories
    if (mem.provenance.source_type === 'user_input' || mem.provenance.source_type === 'dashboard_sync') {
      if (text.includes('prefer') || text.includes('always') || text.includes('never') || text.includes('like')) {
        preferences.push(mem.text.trim())
      }
    }
  }

  return { behaviors, preferences }
}

/**
 * Append new content to a Markdown file, preserving existing structure.
 * Adds a dated section at the end.
 */
function appendToMarkdown(existing: string, newEntries: string[], sectionTitle: string): string {
  if (newEntries.length === 0) return existing

  const date = new Date().toISOString().split('T')[0]
  const section = `\n\n## ${sectionTitle} (${date})\n\n${newEntries.map((e) => `- ${e}`).join('\n')}`

  return existing + section
}

/**
 * Resolve the workspace base directory for agent workspaces.
 * Uses OPENCLAW_HOME env var or defaults to ~/.openclaw.
 */
function getWorkspaceBase(): string {
  return process.env.OPENCLAW_HOME ?? join(process.env.HOME ?? '~', '.openclaw')
}

/**
 * Run the evolution job for all agents.
 *
 * For each agent:
 * 1. Query recent episodic memories by agent_id
 * 2. Extract behavioral patterns and user preferences
 * 3. Read current AGENTS.md and USER.md from agent workspace
 * 4. Back up current versions to agent_context_versions table
 * 5. Use NoveltyDetector to filter redundant information
 * 6. Append new patterns/preferences to context files
 * 7. Log changes per agent
 */
export async function runEvolution(
  db: Database.Database,
  config: MemoryConfig,
  fs: FsOps = defaultFsOps,
): Promise<JobRunLog> {
  const startedAt = new Date().toISOString()
  const agentChanges: Record<string, { behaviors: number; preferences: number }> = {}
  const errors: string[] = []
  const runId = nanoid()
  const noveltyDetector = new NoveltyDetector(config.novelty_similarity_threshold)
  const workspaceBase = getWorkspaceBase()

  for (const agent of AGENTS) {
    try {
      // 1. Query recent episodic memories for this agent
      const rows = db
        .prepare(
          `SELECT * FROM memory_items
           WHERE agent_id = ? AND type = 'episodic' AND archived = 0
           ORDER BY created_at DESC LIMIT 100`,
        )
        .all(agent.id) as MemoryRow[]

      const memories = rows.map(rowToMemoryItem)

      if (memories.length === 0) {
        agentChanges[agent.id] = { behaviors: 0, preferences: 0 }
        continue
      }

      // 2. Extract patterns
      const { behaviors, preferences } = extractPatterns(memories)

      // 3. Read and update context files
      const workspacePath = join(workspaceBase, agent.workspace)
      let behaviorsAdded = 0
      let preferencesAdded = 0

      for (const fileName of agent.files) {
        const filePath = join(workspacePath, fileName)

        // Read current file content (or empty if doesn't exist)
        let currentContent = ''
        if (fs.existsSync(filePath)) {
          currentContent = await fs.readFile(filePath)
        }

        // 4. Back up current version
        db.prepare(
          `INSERT INTO agent_context_versions (agent_id, file_type, content, created_at, evolution_run_id)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(
          agent.id,
          fileName === 'AGENTS.md' ? 'agents_md' : 'user_md',
          currentContent,
          new Date().toISOString(),
          runId,
        )

        // 5. Filter with NoveltyDetector — check each entry against existing tacit_knowledge
        const existingTacit = db
          .prepare(
            `SELECT * FROM memory_items
             WHERE layer = 'tacit_knowledge' AND agent_id = ? AND archived = 0`,
          )
          .all(agent.id) as MemoryRow[]
        const existingItems = existingTacit.map(rowToMemoryItem)

        const entriesToAdd = fileName === 'AGENTS.md' ? behaviors : preferences
        const novelEntries: string[] = []

        for (const entry of entriesToAdd) {
          const candidate = {
            text: entry,
            type: 'procedural' as const,
            layer: 'tacit_knowledge' as const,
            provenance: { source_type: 'evolution' as const, source_id: runId, agent_id: agent.id },
          }
          const noveltyResult = noveltyDetector.checkNovelty(candidate, existingItems)
          if (!noveltyResult.isDuplicate) {
            novelEntries.push(entry)

            // Store as tacit_knowledge memory
            const memId = nanoid()
            const now = new Date().toISOString()
            db.prepare(
              `INSERT INTO memory_items
               (memory_id, text, type, layer, source_type, source_id, agent_id,
                created_at, last_accessed, confidence, importance, tags,
                embedding_ref, consolidated_into, archived)
               VALUES (?, ?, 'procedural', 'tacit_knowledge', 'evolution', ?, ?,
                       ?, ?, 0.7, 0.6, '[]', NULL, NULL, 0)`,
            ).run(memId, entry, runId, agent.id, now, now)
          }
        }

        // 6. Append to file
        if (novelEntries.length > 0) {
          const sectionTitle = fileName === 'AGENTS.md' ? 'Learned Patterns' : 'Learned Preferences'
          const updatedContent = appendToMarkdown(currentContent, novelEntries, sectionTitle)

          await fs.mkdir(dirname(filePath))
          await fs.writeFile(filePath, updatedContent)

          if (fileName === 'AGENTS.md') behaviorsAdded = novelEntries.length
          else preferencesAdded = novelEntries.length
        }
      }

      agentChanges[agent.id] = { behaviors: behaviorsAdded, preferences: preferencesAdded }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${agent.id}: ${msg}`)
      agentChanges[agent.id] = { behaviors: 0, preferences: 0 }
    }
  }

  const completedAt = new Date().toISOString()
  const log: JobRunLog = {
    job_name: 'evolution',
    started_at: startedAt,
    completed_at: completedAt,
    success: errors.length === 0,
    details: { agent_changes: agentChanges, run_id: runId },
  }
  if (errors.length > 0) {
    log.error = errors.join('; ')
  }
  return log
}
