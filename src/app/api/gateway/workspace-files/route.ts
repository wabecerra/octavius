/**
 * API route for reading and writing agent workspace Markdown files.
 *
 * GET  ?agentId=octavious-orchestrator  → returns all .md files for that agent
 * GET  (no agentId)                     → returns all agents and their files
 * PUT  { agentId, fileName, content }   → writes content to the file
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Map agent IDs to workspace directory names */
function workspaceDirForAgent(agentId: string): string {
  if (agentId === 'octavious-orchestrator') return 'workspace-octavious'
  const suffix = agentId.replace(/^(agent|specialist)-/, '')
  return `workspace-octavious-${suffix}`
}

function getBasePath(): string {
  return process.env.OPENCLAW_HOME ?? join(process.env.HOME ?? '~', '.openclaw')
}

const KNOWN_AGENTS = [
  { id: 'octavious-orchestrator', label: 'Octavious (Orchestrator)' },
  { id: 'agent-lifeforce', label: 'Lifeforce' },
  { id: 'agent-industry', label: 'Industry' },
  { id: 'agent-fellowship', label: 'Fellowship' },
  { id: 'agent-essence', label: 'Essence' },
  { id: 'specialist-research', label: 'Research' },
  { id: 'specialist-engineering', label: 'Engineering' },
  { id: 'specialist-marketing', label: 'Marketing' },
  { id: 'specialist-video', label: 'Video' },
  { id: 'specialist-image', label: 'Image' },
  { id: 'specialist-writing', label: 'Writing' },
] as const

const ALLOWED_FILES = ['SOUL.md', 'AGENTS.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md']

async function readAgentFiles(agentId: string): Promise<Record<string, string>> {
  const base = getBasePath()
  const wsDir = join(base, workspaceDirForAgent(agentId))
  const files: Record<string, string> = {}

  if (!existsSync(wsDir)) return files

  const entries = await readdir(wsDir)
  for (const entry of entries) {
    if (ALLOWED_FILES.includes(entry)) {
      files[entry] = await readFile(join(wsDir, entry), 'utf-8')
    }
  }
  return files
}

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agentId')

  try {
    if (agentId) {
      const files = await readAgentFiles(agentId)
      return NextResponse.json({ agentId, files })
    }

    // Return all agents with their files
    const agents: Array<{ id: string; label: string; files: Record<string, string> }> = []
    for (const agent of KNOWN_AGENTS) {
      const files = await readAgentFiles(agent.id)
      agents.push({ id: agent.id, label: agent.label, files })
    }
    return NextResponse.json({ agents })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, fileName, content } = body as {
      agentId: string
      fileName: string
      content: string
    }

    if (!agentId || !fileName || typeof content !== 'string') {
      return NextResponse.json({ error: 'Missing agentId, fileName, or content' }, { status: 400 })
    }

    if (!ALLOWED_FILES.includes(fileName)) {
      return NextResponse.json({ error: `File not allowed: ${fileName}` }, { status: 400 })
    }

    const base = getBasePath()
    const wsDir = join(base, workspaceDirForAgent(agentId))
    await mkdir(wsDir, { recursive: true })
    await writeFile(join(wsDir, fileName), content, 'utf-8')

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
