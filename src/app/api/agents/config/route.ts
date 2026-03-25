import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

// Force dynamic rendering (GET + PUT in same route)
export const dynamic = 'force-dynamic'

export interface AgentModelConfig {
  agentId: string
  provider: string
  model: string
  updatedAt: string
}

const DEFAULT_CONFIGS: Array<{ agent_id: string; provider: string; model: string }> = [
  { agent_id: 'gen-lifeforce', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'gen-industry', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'gen-fellowship', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'gen-essence', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'specialist-research', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'specialist-engineering', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'specialist-marketing', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'specialist-video', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'specialist-image', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
  { agent_id: 'specialist-writing', provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' },
]

function ensureDefaults(db: ReturnType<typeof getDatabase>) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO agent_model_config (agent_id, provider, model, updated_at)
     VALUES (?, ?, ?, ?)`,
  )
  const now = new Date().toISOString()
  for (const d of DEFAULT_CONFIGS) {
    insert.run(d.agent_id, d.provider, d.model, now)
  }
}

/**
 * GET /api/agents/config — Return all agent model configs
 */
export async function GET() {
  const db = getDatabase()
  ensureDefaults(db)

  const rows = db.prepare('SELECT * FROM agent_model_config ORDER BY agent_id').all() as Array<{
    agent_id: string
    provider: string
    model: string
    updated_at: string
  }>

  const configs: AgentModelConfig[] = rows.map((r) => ({
    agentId: r.agent_id,
    provider: r.provider,
    model: r.model,
    updatedAt: r.updated_at,
  }))

  return NextResponse.json({ configs })
}

/**
 * PUT /api/agents/config — Update a single agent's model config
 */
export async function PUT(request: Request) {
  const body = await request.json()
  const { agentId, provider, model } = body

  if (!agentId || !model) {
    return NextResponse.json({ error: 'agentId and model are required' }, { status: 400 })
  }

  const db = getDatabase()
  ensureDefaults(db)
  const now = new Date().toISOString()

  db.prepare(
    `INSERT OR REPLACE INTO agent_model_config (agent_id, provider, model, updated_at)
     VALUES (?, ?, ?, ?)`,
  ).run(agentId, provider || 'openrouter', model, now)

  return NextResponse.json({
    agentId,
    provider: provider || 'openrouter',
    model,
    updatedAt: now,
  })
}
