import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { BEDROCK_AGENT_DEFAULTS } from '@/lib/models'

// Force dynamic rendering (GET + PUT in same route)
export const dynamic = 'force-dynamic'

export interface AgentModelConfig {
  agentId: string
  provider: string
  model: string
  updatedAt: string
}

function ensureDefaults(db: ReturnType<typeof getDatabase>) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO agent_model_config (agent_id, provider, model, updated_at)
     VALUES (?, ?, ?, ?)`,
  )
  const now = new Date().toISOString()
  for (const d of BEDROCK_AGENT_DEFAULTS) {
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
