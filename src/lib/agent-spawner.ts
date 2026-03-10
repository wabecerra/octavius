/**
 * Agent Spawner — Spawns real sub-agents via OpenClaw sessions_spawn.
 *
 * Each agent gets:
 * - Its workspace files (AGENTS.md, TOOLS.md) as context
 * - Quadrant-relevant KB context from the memory service
 * - Task details and instructions
 * - Tool descriptions for KB interaction and task updates
 *
 * Agents can produce deliverables that get written back to tasks and KB.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDatabase } from './memory/db'

// ─── Types ───

export interface SpawnRequest {
  taskId: string
  agentId?: string        // auto-routes by quadrant if omitted
  instruction?: string    // additional instructions
  maxTokens?: number
}

export interface SpawnResult {
  taskId: string
  agentId: string
  model: string
  provider: string
  output: string
  action: 'started' | 'progressed' | 'completed'
  newStatus: string
  costUsd: number
  kbContextUsed: boolean
}

// ─── Constants ───

const QUADRANT_AGENTS: Record<string, string> = {
  industry: 'gen-industry',
  lifeforce: 'gen-lifeforce',
  fellowship: 'gen-fellowship',
  essence: 'gen-essence',
}

const AGENT_WORKSPACE_MAP: Record<string, string> = {
  'gen-industry': 'workspace-octavius-industry',
  'gen-lifeforce': 'workspace-octavius-lifeforce',
  'gen-fellowship': 'workspace-octavius-fellowship',
  'gen-essence': 'workspace-octavius-essence',
  'specialist-research': 'workspace-octavius-research',
  'specialist-engineering': 'workspace-octavius-engineering',
  'specialist-marketing': 'workspace-octavius-marketing',
  'specialist-video': 'workspace-octavius-video',
  'specialist-image': 'workspace-octavius-image',
  'specialist-writing': 'workspace-octavius-writing',
}

const OCTAVIUS_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

// ─── Workspace File Loader ───

function loadWorkspaceFiles(agentId: string): Record<string, string> {
  const dirName = AGENT_WORKSPACE_MAP[agentId]
  if (!dirName) return {}

  const homeDir = process.env.HOME || '/home/wabo'
  const wsPath = join(homeDir, '.openclaw', dirName)
  const files: Record<string, string> = {}

  for (const fileName of ['AGENTS.md', 'TOOLS.md', 'USER.md', 'SOUL.md', 'HEARTBEAT.md']) {
    const filePath = join(wsPath, fileName)
    if (existsSync(filePath)) {
      try {
        files[fileName] = readFileSync(filePath, 'utf-8')
      } catch { /* skip */ }
    }
  }

  return files
}

// ─── KB Context Retrieval ───

async function getKBContext(quadrant: string, taskTitle: string): Promise<string> {
  try {
    const res = await fetch(`${OCTAVIUS_BASE_URL}/api/memory/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: taskTitle,
        quadrant,
        top_n: 5,
      }),
    })

    if (!res.ok) return ''

    const data = await res.json()
    const items = data.results || data.items || []

    if (items.length === 0) return ''

    return items
      .map((item: { text: string; type?: string; importance?: number }, i: number) =>
        `[KB ${i + 1}] (${item.type || 'memory'}, importance: ${item.importance ?? 'n/a'})\n${item.text}`
      )
      .join('\n\n')
  } catch {
    return ''
  }
}

// ─── Agent Config ───

function getAgentConfig(agentId: string): { provider: string; model: string } {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT provider, model FROM agent_model_config WHERE agent_id = ?',
  ).get(agentId) as { provider: string; model: string } | undefined
  return row || { provider: 'bedrock', model: 'amazon-bedrock/global.anthropic.claude-opus-4-6-v1' }
}

// ─── Build Agent Task Prompt ───

function buildAgentPrompt(opts: {
  task: Record<string, unknown>
  workspaceFiles: Record<string, string>
  kbContext: string
  instruction?: string
}): string {
  const { task, workspaceFiles, kbContext, instruction } = opts

  const sections: string[] = []

  // Agent instructions
  if (workspaceFiles['AGENTS.md']) {
    sections.push(`## Your Instructions\n\n${workspaceFiles['AGENTS.md']}`)
  }

  // Tools available
  sections.push(`## Available Tools

You can interact with the Octavius system via these HTTP APIs:

### Knowledge Base (Memory)
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/search\` — Search KB: {"text": "query", "limit": 10}
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/context\` — Get context: {"query": "...", "quadrant": "industry", "top_n": 5}
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/items\` — Store to KB: {"text": "...", "type": "semantic", "layer": "daily_notes", "tags": ["quadrant:industry"], "importance": 0.7, "confidence": 0.8, "provenance": {"source_type": "agent_output", "agent_id": "your-agent-id"}}

### Task Management
- \`PATCH ${OCTAVIUS_BASE_URL}/api/dashboard/tasks/${task.id}\` — Update this task: {"status": "in-progress|done", "description": "..."}

### Sub-Agent Spawning
If you need specialized help (research, engineering, writing), you can request it by including in your output:
\`\`\`
SPAWN_SPECIALIST: specialist-research
INSTRUCTION: Research the latest anxiety management SaaS competitors
\`\`\`

### Important
- When you complete your deliverable, include it in your response
- If the task is fully complete, end your response with: TASK_COMPLETE
- Store important findings/decisions in the KB for future reference
- Keep your output focused and actionable`)

  // Task context
  const taskContext = [
    `## Current Task`,
    `**Title:** ${task.title}`,
    `**Status:** ${task.status}`,
    `**Priority:** ${task.priority}`,
    `**Quadrant:** ${task.quadrant || 'industry'}`,
    task.project ? `**Project:** ${task.project}` : '',
    task.due_date ? `**Due:** ${task.due_date}` : '',
  ].filter(Boolean).join('\n')

  sections.push(taskContext)

  // Existing task description (previous work)
  if (task.description) {
    const desc = task.description as string
    // Only include the last ~4000 chars to avoid overwhelming context
    const truncated = desc.length > 4000
      ? `...(${desc.length} chars total, showing last section)...\n\n${desc.slice(-4000)}`
      : desc
    sections.push(`## Previous Work on This Task\n\n${truncated}`)
  }

  // KB context
  if (kbContext) {
    sections.push(`## Relevant Knowledge Base Context\n\n${kbContext}`)
  }

  // Special instructions
  if (instruction) {
    sections.push(`## Special Instructions\n\n${instruction}`)
  }

  // Action prompt
  const actionPrompt = task.status === 'in-progress'
    ? `## Your Action\n\nThis task is IN PROGRESS. Review previous work and produce the next deliverable or progress update. If the work is substantially complete, say "TASK_COMPLETE" at the very end.`
    : `## Your Action\n\nThis task is in the BACKLOG. Produce an initial deliverable — a plan, research summary, draft, or first concrete output to get it started.`

  sections.push(actionPrompt)

  return sections.join('\n\n---\n\n')
}

// ─── Main Spawn Function ───

export async function spawnAgent(request: SpawnRequest): Promise<SpawnResult> {
  const db = getDatabase()

  // Load task
  const task = db.prepare(
    'SELECT * FROM dashboard_tasks WHERE id = ?',
  ).get(request.taskId) as Record<string, unknown> | undefined

  if (!task) throw new Error(`Task not found: ${request.taskId}`)

  // Resolve agent
  const quadrant = (task.quadrant as string) || 'industry'
  const agentId = request.agentId || QUADRANT_AGENTS[quadrant] || 'gen-industry'

  // Load agent config
  const agentCfg = getAgentConfig(agentId)

  // Load workspace files
  const workspaceFiles = loadWorkspaceFiles(agentId)

  // Get KB context
  const kbContext = await getKBContext(quadrant, task.title as string)

  // Build prompt
  const prompt = buildAgentPrompt({
    task,
    workspaceFiles,
    kbContext,
    instruction: request.instruction,
  })

  // Call LLM (using unified caller)
  const { callLLM } = await import('./llm-caller')

  const result = await callLLM(
    [
      {
        role: 'system',
        content: workspaceFiles['AGENTS.md'] || `You are a ${quadrant} specialist agent in the Octavius Life OS. You produce actionable deliverables.`,
      },
      { role: 'user', content: prompt },
    ],
    {
      model: agentCfg.model,
      provider: agentCfg.provider,
      maxTokens: request.maxTokens || 4096,
      temperature: 0.4,
      label: `spawn-${agentId}`,
      quadrant,
    },
  )

  // Process result
  const isComplete = result.text.includes('TASK_COMPLETE')
  const agentOutput = result.text.replace('TASK_COMPLETE', '').trim()
  const newStatus = isComplete ? 'done' : (task.status === 'backlog' ? 'in-progress' : task.status as string)
  const action: SpawnResult['action'] = isComplete ? 'completed' : (task.status === 'backlog' ? 'started' : 'progressed')

  // Update task
  const now = new Date().toISOString()
  const existingDesc = (task.description as string) || ''
  const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const updatedDesc = existingDesc
    ? `${existingDesc}\n\n---\n**[${agentId} — ${ts}]**\n${agentOutput}`
    : agentOutput

  db.prepare(
    'UPDATE dashboard_tasks SET status = ?, description = ?, updated_at = ? WHERE id = ?',
  ).run(newStatus, updatedDesc, now, request.taskId)

  // Log activity
  db.prepare(
    `INSERT INTO task_activity_log (task_id, agent_id, action, details, model, cost_usd, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(request.taskId, agentId, action, agentOutput.slice(0, 500), result.model, result.costUsd, now)

  // Check for SPAWN_SPECIALIST requests in output
  const spawnMatch = agentOutput.match(/SPAWN_SPECIALIST:\s*(\S+)\nINSTRUCTION:\s*(.+)/m)
  if (spawnMatch) {
    const [, specialistId, specialistInstruction] = spawnMatch
    // Log the spawn request (actual spawn would be async)
    db.prepare(
      `INSERT INTO task_activity_log (task_id, agent_id, action, details, model, cost_usd, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(request.taskId, agentId, 'spawn_requested', `Requested ${specialistId}: ${specialistInstruction}`, null, 0, now)
  }

  return {
    taskId: request.taskId,
    agentId,
    model: result.model,
    provider: agentCfg.provider,
    output: agentOutput,
    action,
    newStatus,
    costUsd: result.costUsd,
    kbContextUsed: kbContext.length > 0,
  }
}
