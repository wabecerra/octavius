import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateAgentWorkspaces, generateOpenClawConfig } from './agent-workspace'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Agent Workspace Generator', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'octavius-ws-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('creates orchestrator workspace with all required files', async () => {
    const result = await generateAgentWorkspaces(tempDir)

    const orchestratorPath = join(tempDir, 'workspace-octavius')
    const files = await readdir(orchestratorPath)

    expect(files).toContain('SOUL.md')
    expect(files).toContain('AGENTS.md')
    expect(files).toContain('USER.md')
    expect(files).toContain('TOOLS.md')
    expect(result.created.length).toBeGreaterThan(0)
  })

  it('creates all four quadrant agent workspaces', async () => {
    await generateAgentWorkspaces(tempDir)

    for (const quadrant of ['lifeforce', 'industry', 'fellowship', 'essence']) {
      const wsPath = join(tempDir, `workspace-octavius-${quadrant}`)
      const files = await readdir(wsPath)
      expect(files).toContain('AGENTS.md')
      expect(files).toContain('USER.md')
      expect(files).toContain('TOOLS.md')
    }
  })

  it('creates specialist agent workspaces', async () => {
    await generateAgentWorkspaces(tempDir)

    for (const specialist of ['research', 'engineering', 'marketing', 'video', 'image', 'writing']) {
      const wsPath = join(tempDir, `workspace-octavius-${specialist}`)
      const files = await readdir(wsPath)
      expect(files).toContain('AGENTS.md')
      expect(files).toContain('TOOLS.md')
    }
  })

  it('orchestrator SOUL.md contains personality and boundaries', async () => {
    await generateAgentWorkspaces(tempDir)

    const content = await readFile(join(tempDir, 'workspace-octavius', 'SOUL.md'), 'utf-8')
    expect(content).toContain('Personality')
    expect(content).toContain('Boundaries')
    expect(content).toContain('Tone')
  })

  it('TOOLS.md contains Memory API documentation', async () => {
    await generateAgentWorkspaces(tempDir)

    const content = await readFile(join(tempDir, 'workspace-octavius', 'TOOLS.md'), 'utf-8')
    expect(content).toContain('Memory API')
    expect(content).toContain('/api/memory')
    expect(content).toContain('Authorization')
  })

  it('skips existing files on second run', async () => {
    const first = await generateAgentWorkspaces(tempDir)
    const second = await generateAgentWorkspaces(tempDir)

    expect(first.created.length).toBeGreaterThan(0)
    expect(second.skipped.length).toBe(first.created.length)
    expect(second.created.length).toBe(0)
  })

  it('generates valid OpenClaw config with all agents', () => {
    const config = generateOpenClawConfig()
    const agents = (config.agents as { list: Array<{ id: string }> }).list

    expect(agents.length).toBe(11) // 1 orchestrator + 4 quadrant + 6 specialist

    const ids = agents.map((a) => a.id)
    expect(ids).toContain('octavius-orchestrator')
    expect(ids).toContain('agent-lifeforce')
    expect(ids).toContain('agent-industry')
    expect(ids).toContain('agent-fellowship')
    expect(ids).toContain('agent-essence')
    expect(ids).toContain('specialist-research')
    expect(ids).toContain('specialist-engineering')
  })

  it('orchestrator has sub_agents configured', () => {
    const config = generateOpenClawConfig()
    const agents = (config.agents as { list: Array<{ id: string; sub_agents?: string[] }> }).list
    const orchestrator = agents.find((a) => a.id === 'octavius-orchestrator')

    expect(orchestrator?.sub_agents).toBeDefined()
    expect(orchestrator?.sub_agents?.length).toBe(10)
  })
})
