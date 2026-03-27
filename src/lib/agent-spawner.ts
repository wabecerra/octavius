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
import { getSpecialistTools, parseToolCalls } from './agents/specialist-tools'

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
  'specialist-architect': 'workspace-octavius-architect',
  'specialist-coder': 'workspace-octavius-coder',
  'specialist-research': 'workspace-octavius-research',
  'specialist-marketing': 'workspace-octavius-marketing',
  'specialist-writing': 'workspace-octavius-writing',
  'specialist-video': 'workspace-octavius-video',
  'specialist-image': 'workspace-octavius-image',
  'specialist-n8n': 'workspace-octavius-n8n',
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
  if (row) return row
  // Fallback defaults per agent role (openrouter)
  const FALLBACK_MODELS: Record<string, string> = {
    'specialist-architect': 'anthropic/claude-opus-4.6',
    'specialist-coder': 'openai/gpt-5.3-codex-20260224',
    'specialist-research': 'google/gemini-2.5-flash',
    'specialist-video': 'google/gemini-3.1-flash-image-preview-20260226',
    'specialist-image': 'google/gemini-3.1-flash-image-preview-20260226',
    'specialist-n8n': 'anthropic/claude-sonnet-4.6',
  }
  return {
    provider: 'openrouter',
    model: FALLBACK_MODELS[agentId] || 'qwen/qwen3.5-plus-02-15',
  }
}

// ─── Build Agent Task Prompt ───

function buildAgentPrompt(opts: {
  agentId: string
  task: Record<string, unknown>
  workspaceFiles: Record<string, string>
  kbContext: string
  instruction?: string
}): string {
  const { agentId, task, workspaceFiles, kbContext, instruction } = opts

  const sections: string[] = []

  // Agent instructions
  if (workspaceFiles['AGENTS.md']) {
    sections.push(`## Your Instructions\n\n${workspaceFiles['AGENTS.md']}`)
  }

  sections.push(`## Available Tools

You can interact with the Octavius system via these HTTP APIs:

### Knowledge Base (Memory)
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/search\` — Search KB: {"text": "query", "limit": 10}
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/context\` — Get context: {"query": "...", "quadrant": "industry", "top_n": 5}
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/items\` — Store to KB: {"text": "...", "type": "semantic", "layer": "daily_notes", "tags": [...], "importance": 0.7}

### Task Management
- \`PATCH ${OCTAVIUS_BASE_URL}/api/dashboard/tasks/${task.id}\` — Update this task

### Specialist Agents (via function calling)
You have access to \`spawn_specialist\` and \`discover_specialists\` function tools.
Use them to delegate sub-tasks that need domain expertise. The LLM runtime will
execute these tool calls automatically — do NOT include text-based spawn commands.

### Important
- When you complete your deliverable, include it in your response
- If the task is fully complete, end your response with: TASK_COMPLETE
- Store important findings/decisions in the KB for future reference`)

  // N8N-specific tools (only for specialist-n8n)
  if (agentId === 'specialist-n8n') {
    sections.push(`## N8N Automation Tools

You have access to the N8N workflow automation platform via MCP. Use these capabilities to:
- Create and manage automated workflows
- Connect external services (email, Slack, Google Sheets, webhooks, etc.)
- Set up triggers and scheduled automations
- Monitor workflow execution status

When creating workflows, describe them in detail so they can be set up in N8N.
Include: trigger type, actions, data transformations, and error handling.`)
  }

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
    agentId,
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
      tools: getSpecialistTools(),
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

  // Check for tool_calls in LLM response (if provider supports function calling)
  if (result.toolCalls && result.toolCalls.length > 0) {
    const spawnRequests = parseToolCalls(result.toolCalls)
    for (const req of spawnRequests) {
      if (AGENT_WORKSPACE_MAP[req.specialistId]) {
        db.prepare(
          `INSERT INTO task_activity_log (task_id, agent_id, action, details, model, cost_usd, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(request.taskId, agentId, 'spawn_requested',
          `Requested ${req.specialistId}: ${req.instruction}`, null, 0, now)

        spawnSpecialistCascade(request.taskId, agentId, req.specialistId, req.instruction)
          .catch(err => {
            console.error(`[agent-spawner] Specialist cascade failed for ${req.specialistId}:`, err)
          })
      }
    }
  }

  // Legacy fallback: still check for text-based pattern (for models without tool calling)
  if (!result.toolCalls || result.toolCalls.length === 0) {
    const spawnMatch = agentOutput.match(/SPAWN_SPECIALIST:\s*(\S+)\nINSTRUCTION:\s*(.+)/m)
    if (spawnMatch) {
      const [, specialistId, specialistInstruction] = spawnMatch
      if (AGENT_WORKSPACE_MAP[specialistId]) {
        spawnSpecialistCascade(request.taskId, agentId, specialistId, specialistInstruction)
          .catch(err => console.error(`[agent-spawner] Legacy cascade failed:`, err))
      }
    }
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

// ─── Architect → Coder Pipeline ───

/**
 * Special cascade for engineering tasks:
 * 1. Architect (Opus 4.6) produces spec + implementation plan
 * 2. Creates subtasks from plan steps, each requiring approval
 * 3. After approval, coder (Codex 5.3) executes each step
 */
async function spawnArchitectPipeline(
  taskId: string,
  requestingAgentId: string,
  instruction: string,
): Promise<void> {
  const db = getDatabase()
  const now = new Date().toISOString()

  console.log(`[agent-spawner] Starting architect pipeline for task ${taskId}`)

  // Step 1: Spawn architect to produce the plan
  const architectResult = await spawnAgent({
    taskId,
    agentId: 'specialist-architect',
    instruction: `You were called by ${requestingAgentId} to architect a solution.

**Requirement:**
${instruction}

**Your job:**
1. Analyze the requirement thoroughly
2. Produce a detailed implementation spec
3. Break the implementation into numbered steps (3-8 steps max)
4. Each step must be self-contained and executable by a coding agent

**Output format — you MUST follow this exactly:**

## Spec
(Your analysis, architecture decisions, constraints)

## Implementation Plan
STEP 1: [title]
[Detailed instructions for the coder — exact files to create/modify, function signatures, logic]

STEP 2: [title]
[Detailed instructions]

(continue for all steps)

Do NOT mark the task as TASK_COMPLETE — the coder will handle implementation.`,
  })

  // Step 2: Parse the plan into steps
  const planText = architectResult.output
  const stepPattern = /STEP\s+(\d+):\s*([\s\S]+?)(?=\nSTEP\s+\d+:|\n## |$)/g
  const steps: Array<{ title: string; description: string }> = []

  let match
  while ((match = stepPattern.exec(planText)) !== null) {
    steps.push({
      title: match[2].split('\n')[0].trim(),
      description: match[2].trim(),
    })
  }

  if (steps.length === 0) {
    // Fallback: treat entire output as a single step
    steps.push({ title: 'Execute implementation', description: planText })
  }

  // Step 3: Create subtasks with approval gates
  const { nanoid } = await import('nanoid')
  const insertSubtask = db.prepare(`
    INSERT INTO subtasks (id, parent_task_id, title, description, status, step_order, agent_id, requires_approval, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // First subtask: the spec itself, requires user approval before coding begins
  const specSubtaskId = nanoid()
  insertSubtask.run(
    specSubtaskId, taskId,
    'Review implementation plan',
    `The architect (${architectResult.model}) produced the following plan:\n\n${planText}`,
    'awaiting_approval', 0, 'specialist-architect', 1, now, now,
  )

  // Remaining subtasks: one per implementation step, assigned to coder
  for (let i = 0; i < steps.length; i++) {
    insertSubtask.run(
      nanoid(), taskId,
      steps[i].title,
      steps[i].description,
      'pending', i + 1, 'specialist-coder', 0, now, now,
    )
  }

  // Update parent task status
  db.prepare('UPDATE dashboard_tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run('in-progress', now, taskId)

  // Log
  db.prepare(
    `INSERT INTO task_activity_log (task_id, agent_id, action, details, model, cost_usd, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(taskId, 'specialist-architect', 'plan_created',
    `Created ${steps.length + 1} subtasks (1 spec review + ${steps.length} implementation steps). Awaiting user approval.`,
    architectResult.model, architectResult.costUsd, now)

  console.log(`[agent-spawner] Architect pipeline created ${steps.length + 1} subtasks for task ${taskId}, awaiting approval`)
}

// ─── Specialist Cascade ───

/**
 * Spawns a specialist agent when a generalist requests one.
 *
 * Special handling:
 * - specialist-architect: triggers the architect→coder pipeline with subtasks
 * - specialist-engineering: redirected to architect pipeline (backwards compat)
 * - All others: direct spawn with restricted context
 */
async function spawnSpecialistCascade(
  taskId: string,
  requestingAgentId: string,
  specialistId: string,
  instruction: string,
): Promise<void> {
  console.log(`[agent-spawner] Cascading to specialist ${specialistId} for task ${taskId} (requested by ${requestingAgentId})`)

  // Route engineering tasks through the architect→coder pipeline
  if (specialistId === 'specialist-architect' || specialistId === 'specialist-engineering') {
    return spawnArchitectPipeline(taskId, requestingAgentId, instruction)
  }

  const specialistResult = await spawnAgent({
    taskId,
    agentId: specialistId,
    instruction: `You were called by ${requestingAgentId} to handle a specialized sub-task.\n\n**Specialist Instruction:**\n${instruction}\n\nProduce a focused deliverable addressing this instruction. Do NOT mark the task as TASK_COMPLETE — the generalist will decide that.`,
  })

  console.log(`[agent-spawner] Specialist ${specialistId} completed: ${specialistResult.action}, cost=$${specialistResult.costUsd.toFixed(4)}`)
}
