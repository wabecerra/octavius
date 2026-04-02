import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDatabase } from '@/lib/memory/db'
import { getDefaultModelForRole } from '@/lib/models'

/**
 * GET /api/agents/queue — Returns tasks ready for real agent spawning.
 *
 * For each task, returns:
 * - Task details
 * - Agent workspace files (AGENTS.md, TOOLS.md)
 * - KB context relevant to the quadrant
 * - Agent model config
 * - Full prompt ready for sessions_spawn
 *
 * Query: ?maxTasks=2
 */

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

const OCTAVIUS_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

function loadWorkspaceFiles(agentId: string): Record<string, string> {
  const dirName = AGENT_WORKSPACE_MAP[agentId]
  if (!dirName) return {}
  const homeDir = process.env.HOME || '/home/wabo'
  const wsPath = join(homeDir, '.openclaw', dirName)
  const files: Record<string, string> = {}
  for (const fn of ['AGENTS.md', 'TOOLS.md', 'USER.md', 'SOUL.md']) {
    const fp = join(wsPath, fn)
    if (existsSync(fp)) {
      try { files[fn] = readFileSync(fp, 'utf-8') } catch { /* skip */ }
    }
  }
  return files
}

async function getKBContext(quadrant: string, taskTitle: string): Promise<string> {
  try {
    const res = await fetch(`${OCTAVIUS_BASE}/api/memory/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: taskTitle, quadrant, top_n: 5 }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    const items = data.results || data.items || []
    if (items.length === 0) return ''
    return items
      .map((item: { text: string; type?: string; importance?: number }, i: number) =>
        `[KB ${i + 1}] (${item.type || 'memory'}, importance: ${item.importance ?? 'n/a'})\n${item.text}`)
      .join('\n\n')
  } catch { return '' }
}

function buildSpawnTask(opts: {
  task: Record<string, unknown>
  agentId: string
  workspaceFiles: Record<string, string>
  kbContext: string
}): string {
  const { task, agentId, workspaceFiles, kbContext } = opts

  const sections: string[] = []

  // Agent identity
  if (workspaceFiles['AGENTS.md']) {
    sections.push(workspaceFiles['AGENTS.md'])
  }

  // Tools
  sections.push(`## Octavius API Tools

You have access to the Octavius Life OS APIs. Use web_fetch or exec with curl to call them:

### Knowledge Base
- Search: \`curl -s -X POST ${OCTAVIUS_BASE}/api/memory/search -H 'Content-Type: application/json' -d '{"text":"query","limit":10}'\`
- Get context: \`curl -s -X POST ${OCTAVIUS_BASE}/api/memory/context -H 'Content-Type: application/json' -d '{"query":"...","quadrant":"${task.quadrant || 'industry'}","top_n":5}'\`
- Store finding: \`curl -s -X POST ${OCTAVIUS_BASE}/api/memory/items -H 'Content-Type: application/json' -d '{"text":"...","type":"semantic","layer":"daily_notes","tags":["quadrant:${task.quadrant || 'industry'}"],"importance":0.7,"confidence":0.8,"provenance":{"source_type":"agent_output","agent_id":"${agentId}"}}'\`

### Task Management
- Update this task: \`curl -s -X PATCH ${OCTAVIUS_BASE}/api/dashboard/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status":"in-progress","description":"..."}'\`
- Mark complete: \`curl -s -X PATCH ${OCTAVIUS_BASE}/api/dashboard/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status":"done"}'\`

### Task Activity Log
- Log your work: \`curl -s -X POST ${OCTAVIUS_BASE}/api/dashboard/tasks/activity -H 'Content-Type: application/json' -d '{"taskId":"${task.id}","agentId":"${agentId}","action":"progressed","details":"what you did"}'\``)

  // Task details
  sections.push(`## Your Task

**Title:** ${task.title}
**Status:** ${task.status}
**Priority:** ${task.priority}
**Quadrant:** ${task.quadrant || 'industry'}${task.project ? `\n**Project:** ${task.project}` : ''}${task.due_date ? `\n**Due:** ${task.due_date}` : ''}`)

  // Previous work (truncated)
  if (task.description) {
    const desc = task.description as string
    const truncated = desc.length > 3000
      ? `...(${desc.length} chars total, showing last section)...\n\n${desc.slice(-3000)}`
      : desc
    sections.push(`## Previous Work\n\n${truncated}`)
  }

  // KB context
  if (kbContext) {
    sections.push(`## Relevant Knowledge Base Context\n\n${kbContext}`)
  }

  // Action
  const action = task.status === 'in-progress'
    ? `Review previous work and produce the next concrete deliverable. Write real files if you're building something. Update the task via the API when done. If the work is substantially complete, mark the task as done.`
    : `This task needs to be started. Produce a concrete first deliverable — not just a plan, but actual output (code, content, research). Update the task status to in-progress via the API. Write files to your workspace.`

  sections.push(`## Instructions\n\n${action}\n\nIMPORTANT:\n- Actually DO the work — write code, create files, produce deliverables\n- Update the task via the Octavius API when you make progress\n- Store important findings in the KB for future reference\n- If you need specialized help, say so and it will be escalated`)

  return sections.join('\n\n---\n\n')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const maxTasks = Math.min(Number(searchParams.get('maxTasks') ?? 2), 5)

  const db = getDatabase()

  // Get heartbeat config
  const configRows = db.prepare('SELECT key, value FROM heartbeat_config').all() as { key: string; value: string }[]
  const configMap = Object.fromEntries(configRows.map((r) => [r.key, r.value]))
  const autonomousMode = configMap.autonomousMode === 'true'

  if (!autonomousMode) {
    return NextResponse.json({ queue: [], autonomousMode: false })
  }

  // Fetch tasks to work on
  const tasks = db.prepare(
    `SELECT id, title, description, priority, status, quadrant, project, due_date, created_at
     FROM dashboard_tasks
     WHERE status IN ('backlog', 'in-progress')
     ORDER BY
       CASE status WHEN 'in-progress' THEN 0 ELSE 1 END,
       CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at ASC
     LIMIT ?`,
  ).all(maxTasks) as Array<Record<string, unknown>>

  // Build spawn requests for each task
  const queue = await Promise.all(tasks.map(async (task) => {
    const quadrant = (task.quadrant as string) || 'industry'
    const agentId = QUADRANT_AGENTS[quadrant] || 'gen-industry'
    const workspaceFiles = loadWorkspaceFiles(agentId)
    const kbContext = await getKBContext(quadrant, task.title as string)

    // Get agent model config
    const modelRow = db.prepare(
      'SELECT provider, model FROM agent_model_config WHERE agent_id = ?',
    ).get(agentId) as { provider: string; model: string } | undefined

    const spawnTask = buildSpawnTask({ task, agentId, workspaceFiles, kbContext })

    return {
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      quadrant,
      agentId,
      model: modelRow?.model || getDefaultModelForRole('reasoning'),
      provider: modelRow?.provider || (process.env.OPENCLAW_PROVIDER || process.env.DEFAULT_LLM_PROVIDER || 'bedrock'),
      spawnTask,
      hasKBContext: kbContext.length > 0,
      workspaceFilesLoaded: Object.keys(workspaceFiles),
    }
  }))

  return NextResponse.json({ queue, autonomousMode: true })
}
