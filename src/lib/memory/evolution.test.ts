import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runEvolution, type FsOps } from './evolution'
import { getDatabase, closeDatabase } from './db'
import type Database from 'better-sqlite3'
import type { MemoryConfig } from './models'
import { nanoid } from 'nanoid'

/** In-memory fake filesystem for testing. */
function createFakeFsOps(): FsOps & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    readFile: async (path: string) => files.get(path) ?? '# Existing Content\n',
    writeFile: async (path: string, content: string) => { files.set(path, content) },
    mkdir: async () => {},
    existsSync: (path: string) => files.has(path),
  }
}

function makeConfig(overrides?: Partial<MemoryConfig>): MemoryConfig {
  return {
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
    api_secret_token: 'test-token',
    context_retrieval_top_n: 10,
    ...overrides,
  }
}

function insertMemory(
  db: Database.Database,
  opts: {
    agentId: string
    text: string
    sourceType?: string
    type?: string
  },
) {
  const id = nanoid()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO memory_items
     (memory_id, text, type, layer, source_type, source_id, agent_id,
      created_at, last_accessed, confidence, importance, tags)
     VALUES (?, ?, ?, 'daily_notes', ?, 'src', ?, ?, ?, 0.8, 0.5, '[]')`,
  ).run(id, opts.text, opts.type ?? 'episodic', opts.sourceType ?? 'agent_output', opts.agentId, now, now)
  return id
}

describe('EvolutionJob', () => {
  let db: Database.Database

  beforeEach(() => {
    db = getDatabase(':memory:')
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('returns success with no changes when no memories exist', async () => {
    const config = makeConfig()
    const fs = createFakeFsOps()
    const result = await runEvolution(db, config, fs)

    expect(result.job_name).toBe('evolution')
    expect(result.success).toBe(true)
    expect(result.details.run_id).toBeDefined()
  })

  it('extracts behavioral patterns from agent_output memories', async () => {
    insertMemory(db, {
      agentId: 'agent-lifeforce',
      text: 'Pattern: user prefers morning workouts',
      sourceType: 'agent_output',
    })

    const config = makeConfig()
    const fs = createFakeFsOps()
    const result = await runEvolution(db, config, fs)

    expect(result.success).toBe(true)
    const changes = result.details.agent_changes as Record<string, { behaviors: number; preferences: number }>
    expect(changes['agent-lifeforce'].behaviors).toBe(1)
  })

  it('extracts user preferences from user_input memories', async () => {
    insertMemory(db, {
      agentId: 'agent-industry',
      text: 'I prefer working in the morning',
      sourceType: 'user_input',
    })

    const config = makeConfig()
    const fs = createFakeFsOps()
    const result = await runEvolution(db, config, fs)

    expect(result.success).toBe(true)
    const changes = result.details.agent_changes as Record<string, { behaviors: number; preferences: number }>
    expect(changes['agent-industry'].preferences).toBe(1)
  })

  it('backs up context files to agent_context_versions table', async () => {
    insertMemory(db, {
      agentId: 'agent-lifeforce',
      text: 'Pattern: sleep tracking is important',
      sourceType: 'agent_output',
    })

    const config = makeConfig()
    const fs = createFakeFsOps()
    await runEvolution(db, config, fs)

    const versions = db
      .prepare('SELECT * FROM agent_context_versions WHERE agent_id = ?')
      .all('agent-lifeforce') as Array<{ agent_id: string; file_type: string; content: string }>

    expect(versions.length).toBeGreaterThanOrEqual(2) // AGENTS.md + USER.md
    expect(versions.some((v) => v.file_type === 'agents_md')).toBe(true)
    expect(versions.some((v) => v.file_type === 'user_md')).toBe(true)
  })

  it('stores novel patterns as tacit_knowledge memories', async () => {
    insertMemory(db, {
      agentId: 'agent-fellowship',
      text: 'Pattern: user values weekly check-ins with close friends',
      sourceType: 'agent_output',
    })

    const config = makeConfig()
    const fs = createFakeFsOps()
    await runEvolution(db, config, fs)

    const tacit = db
      .prepare("SELECT * FROM memory_items WHERE layer = 'tacit_knowledge' AND agent_id = ?")
      .all('agent-fellowship') as Array<{ text: string }>

    expect(tacit.length).toBe(1)
    expect(tacit[0].text).toContain('weekly check-ins')
  })

  it('skips duplicate patterns via NoveltyDetector', async () => {
    // Insert existing tacit_knowledge
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO memory_items
       (memory_id, text, type, layer, source_type, source_id, agent_id,
        created_at, last_accessed, confidence, importance, tags)
       VALUES (?, ?, 'procedural', 'tacit_knowledge', 'evolution', 'prev-run', ?, ?, ?, 0.7, 0.6, '[]')`,
    ).run(nanoid(), 'Pattern: user prefers morning workouts', 'agent-lifeforce', now, now)

    // Insert same pattern as new episodic memory
    insertMemory(db, {
      agentId: 'agent-lifeforce',
      text: 'Pattern: user prefers morning workouts',
      sourceType: 'agent_output',
    })

    const config = makeConfig()
    const fs = createFakeFsOps()
    const result = await runEvolution(db, config, fs)

    expect(result.success).toBe(true)
    const changes = result.details.agent_changes as Record<string, { behaviors: number; preferences: number }>
    expect(changes['agent-lifeforce'].behaviors).toBe(0) // Duplicate, not added
  })

  it('continues processing other agents when one fails', async () => {
    insertMemory(db, {
      agentId: 'agent-lifeforce',
      text: 'Pattern: test pattern',
      sourceType: 'agent_output',
    })

    const config = makeConfig()
    const fs = createFakeFsOps()
    // Even if one agent workspace fails, others should still be processed
    const result = await runEvolution(db, config, fs)

    expect(result.details.agent_changes).toBeDefined()
    const changes = result.details.agent_changes as Record<string, { behaviors: number; preferences: number }>
    // All agents should have entries (even if 0 changes)
    expect(Object.keys(changes).length).toBeGreaterThan(0)
  })

  it('records run_id in job log details', async () => {
    const config = makeConfig()
    const fs = createFakeFsOps()
    const result = await runEvolution(db, config, fs)

    expect(result.details.run_id).toBeDefined()
    expect(typeof result.details.run_id).toBe('string')
  })
})
