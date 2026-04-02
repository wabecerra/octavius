/**
 * Environment Bootstrap — pre-computed snapshot injected into agent sessions
 * so they don't waste turns discovering what's available.
 *
 * Inspired by the meta-harness _gather_env_snapshot() pattern that eliminated
 * 2-5 exploratory turns per session.
 */

import type { FleetAgentState } from '@/lib/gateway/bridge-events'
import type { GatewayBridge } from '@/lib/gateway/bridge'
import { getDatabase } from '@/lib/memory/db'
import { buildScopedToolCategories } from '@/lib/harness/tool-scopes'

// ---------------------------------------------------------------------------
// Static registries
// ---------------------------------------------------------------------------

export const AGENT_REGISTRY = [
  { id: 'orchestrator', type: 'orchestrator', description: 'Main task router and coordinator' },
  { id: 'gen-lifeforce', type: 'generalist', quadrant: 'lifeforce', description: 'Health, wellness, habits, personal growth' },
  { id: 'gen-industry', type: 'generalist', quadrant: 'industry', description: 'Work, projects, career, productivity' },
  { id: 'gen-fellowship', type: 'generalist', quadrant: 'fellowship', description: 'Relationships, social, community, networking' },
  { id: 'gen-essence', type: 'generalist', quadrant: 'essence', description: 'Identity, values, purpose, creativity' },
  { id: 'specialist-architect', type: 'specialist', description: 'System design, architecture, implementation planning' },
  { id: 'specialist-coder', type: 'specialist', description: 'Code implementation, debugging, testing' },
  { id: 'specialist-research', type: 'specialist', description: 'Deep research, fact extraction, report synthesis' },
  { id: 'specialist-marketing', type: 'specialist', description: 'Market analysis, positioning, go-to-market' },
  { id: 'specialist-writing', type: 'specialist', description: 'Content creation, copywriting, documentation' },
  { id: 'specialist-video', type: 'specialist', description: 'Video planning, scripting, storyboarding' },
  { id: 'specialist-image', type: 'specialist', description: 'Image generation, visual design, brand assets' },
  { id: 'specialist-n8n', type: 'specialist', description: 'N8N workflow automation design and implementation' },
] as const

export const PLUGIN_TOOL_CATEGORIES = [
  { category: 'Tasks', tools: ['octavius_tasks_list', 'octavius_task_create', 'octavius_task_update', 'octavius_task_delete', 'octavius_task_dispatch'] },
  { category: 'Memory', tools: ['octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store', 'octavius_memory_update', 'octavius_memory_delete'] },
  { category: 'Agents', tools: ['octavius_agents_provision', 'octavius_agents_delegate', 'octavius_agent_status'] },
  { category: 'Life OS', tools: ['octavius_checkin', 'octavius_journal', 'octavius_goal_create', 'octavius_goals_list', 'octavius_gratitude_create'] },
  { category: 'System', tools: ['octavius_gateway_status', 'octavius_cost_summary', 'octavius_chat_reply', 'octavius_approval_check'] },
] as const

const QUADRANTS = [
  { id: 'lifeforce', name: 'Lifeforce', description: 'Health, wellness, fitness, habits, personal growth' },
  { id: 'industry', name: 'Industry', description: 'Work, projects, career, finances, productivity' },
  { id: 'fellowship', name: 'Fellowship', description: 'Relationships, social life, community, networking' },
  { id: 'essence', name: 'Essence', description: 'Identity, values, purpose, creativity, spirituality' },
] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvironmentSnapshot {
  timestamp: string
  system: {
    gatewayStatus: string
    bridgeStatus: string
    activeTaskCount: number
  }
  agents: Array<{ id: string; type: string; quadrant?: string; description: string }>
  fleet: FleetAgentState[]
  toolCategories: Array<{ category: string; tools: string[] }>
  quadrants: Array<{ id: string; name: string; description: string }>
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

export function buildEnvironmentSnapshot(bridge: GatewayBridge, agentType?: string): EnvironmentSnapshot {
  const db = getDatabase()

  let activeTaskCount = 0
  try {
    const row = db.prepare(
      "SELECT COUNT(*) AS cnt FROM dashboard_tasks WHERE status = 'in-progress'"
    ).get() as { cnt: number } | undefined
    activeTaskCount = row?.cnt ?? 0
  } catch {
    // DB may not be initialized yet
  }

  return {
    timestamp: new Date().toISOString(),
    system: {
      gatewayStatus: bridge.status === 'CONNECTED' ? 'connected' : bridge.status.toLowerCase(),
      bridgeStatus: bridge.status.toLowerCase(),
      activeTaskCount,
    },
    agents: AGENT_REGISTRY.map((a) => ({
      id: a.id,
      type: a.type,
      ...('quadrant' in a ? { quadrant: a.quadrant } : {}),
      description: a.description,
    })),
    fleet: bridge.getFleetSnapshot(),
    toolCategories: agentType
      ? buildScopedToolCategories(agentType, PLUGIN_TOOL_CATEGORIES.map(c => ({ category: c.category, tools: [...c.tools] })))
      : PLUGIN_TOOL_CATEGORIES.map((c) => ({
        category: c.category,
        tools: [...c.tools],
      })),
    quadrants: QUADRANTS.map((q) => ({ ...q })),
  }
}

// ---------------------------------------------------------------------------
// Prompt formatter
// ---------------------------------------------------------------------------

export function formatSnapshotForPrompt(snapshot: EnvironmentSnapshot): string {
  const lines: string[] = []

  lines.push('## Environment Snapshot')
  lines.push(`_Generated ${snapshot.timestamp}_\n`)

  // System status
  lines.push('### System')
  lines.push(`- Gateway: **${snapshot.system.gatewayStatus}**`)
  lines.push(`- Bridge: **${snapshot.system.bridgeStatus}**`)
  lines.push(`- Active tasks: **${snapshot.system.activeTaskCount}**\n`)

  // Quadrants
  lines.push('### Quadrants')
  for (const q of snapshot.quadrants) {
    lines.push(`- **${q.name}** (\`${q.id}\`): ${q.description}`)
  }
  lines.push('')

  // Agents
  lines.push('### Available Agents')
  const grouped: Record<string, typeof snapshot.agents> = {}
  for (const a of snapshot.agents) {
    const key = a.type
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(a)
  }
  for (const [type, agents] of Object.entries(grouped)) {
    lines.push(`**${type}s:**`)
    for (const a of agents) {
      const quad = a.quadrant ? ` [${a.quadrant}]` : ''
      lines.push(`- \`${a.id}\`${quad} — ${a.description}`)
    }
  }
  lines.push('')

  // Fleet
  if (snapshot.fleet.length > 0) {
    lines.push('### Active Fleet')
    for (const f of snapshot.fleet) {
      const task = f.currentTask ? ` — ${f.currentTask}` : ''
      lines.push(`- \`${f.id}\` (${f.status})${task}`)
    }
    lines.push('')
  }

  // Tools
  lines.push('### Available Tools')
  for (const cat of snapshot.toolCategories) {
    lines.push(`**${cat.category}:** ${cat.tools.map((t) => `\`${t}\``).join(', ')}`)
  }
  lines.push('')

  return lines.join('\n')
}
