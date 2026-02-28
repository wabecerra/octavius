/**
 * Unit tests for OrchestratorRouter.
 *
 * Covers: routeToSubAgent, isMultiQuadrantTask, getRelevantQuadrantAgents,
 * storeSubAgentResult, fanOutToQuadrantAgents, attemptWithNextBestAgent.
 */
import { describe, it, expect, vi } from 'vitest'
import type { AgentTask } from '@/types'
import {
  routeToSubAgent,
  isMultiQuadrantTask,
  getRelevantQuadrantAgents,
  storeSubAgentResult,
  fanOutToQuadrantAgents,
  attemptWithNextBestAgent,
} from './orchestrator-router'
import type { MemoryService } from '../memory/service'
import type { TaskDispatcher } from './dispatcher'

/** Helper: build a minimal AgentTask */
function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    agentId: 'octavius-orchestrator',
    description: 'Do something',
    complexityScore: 5,
    tier: 2,
    modelUsed: 'claude-sonnet',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/** All quadrant + specialist agents registered */
const ALL_REGISTERED = [
  { agentId: 'agent-lifeforce', status: 'registered' },
  { agentId: 'agent-industry', status: 'registered' },
  { agentId: 'agent-fellowship', status: 'registered' },
  { agentId: 'agent-essence', status: 'registered' },
  { agentId: 'specialist-research', status: 'registered' },
  { agentId: 'specialist-engineering', status: 'registered' },
]

describe('routeToSubAgent', () => {
  it('routes health-related tasks to agent-lifeforce', () => {
    const task = makeTask({ description: 'Create a workout plan for this week' })
    const decision = routeToSubAgent(task, ALL_REGISTERED)
    expect(decision.targetAgentId).toBe('agent-lifeforce')
    expect(decision.quadrantContext).toBe('lifeforce')
  })

  it('routes career-related tasks to agent-industry', () => {
    const task = makeTask({ description: 'Review project deadline and schedule meeting' })
    const decision = routeToSubAgent(task, ALL_REGISTERED)
    expect(decision.targetAgentId).toBe('agent-industry')
    expect(decision.quadrantContext).toBe('industry')
  })

  it('routes relationship tasks to agent-fellowship', () => {
    const task = makeTask({ description: 'Reach out to family and catch up with friend' })
    const decision = routeToSubAgent(task, ALL_REGISTERED)
    expect(decision.targetAgentId).toBe('agent-fellowship')
    expect(decision.quadrantContext).toBe('fellowship')
  })

  it('routes soul/reflection tasks to agent-essence', () => {
    const task = makeTask({ description: 'Write a journal entry about gratitude and reflection' })
    const decision = routeToSubAgent(task, ALL_REGISTERED)
    expect(decision.targetAgentId).toBe('agent-essence')
    expect(decision.quadrantContext).toBe('essence')
  })

  it('respects explicit quadrant tag in description [lifeforce]', () => {
    const task = makeTask({ description: '[lifeforce] Check on something random' })
    const decision = routeToSubAgent(task, ALL_REGISTERED)
    expect(decision.targetAgentId).toBe('agent-lifeforce')
    expect(decision.quadrantContext).toBe('lifeforce')
  })

  it('respects explicit quadrant:industry tag in description', () => {
    const task = makeTask({ description: 'quadrant:industry Do a thing' })
    const decision = routeToSubAgent(task, ALL_REGISTERED)
    expect(decision.targetAgentId).toBe('agent-industry')
    expect(decision.quadrantContext).toBe('industry')
  })

  it('routes to agent based on agentId quadrant mapping', () => {
    const task = makeTask({ agentId: 'agent-essence', description: 'Something generic' })
    const decision = routeToSubAgent(task, ALL_REGISTERED)
    expect(decision.targetAgentId).toBe('agent-essence')
    expect(decision.quadrantContext).toBe('essence')
  })

  it('routes to specialist-research when specialist keywords dominate and no quadrant matches', () => {
    const task = makeTask({ description: 'Investigate the data sources and analyze the survey findings' })
    const decision = routeToSubAgent(task, ALL_REGISTERED)
    expect(decision.targetAgentId).toBe('specialist-research')
  })

  it('skips unregistered agents and falls back', () => {
    const onlyLifeforce = [{ agentId: 'agent-lifeforce', status: 'registered' }]
    const task = makeTask({ description: 'Review project deadline and schedule meeting' })
    // Industry keywords but agent-industry not registered
    const decision = routeToSubAgent(task, onlyLifeforce)
    // Should fall back to first available registered agent
    expect(decision.targetAgentId).toBe('agent-lifeforce')
  })

  it('skips agents with non-registered status', () => {
    const failedAgents = [
      { agentId: 'agent-industry', status: 'failed' },
      { agentId: 'agent-lifeforce', status: 'registered' },
    ]
    const task = makeTask({ description: 'Review project deadline' })
    const decision = routeToSubAgent(task, failedAgents)
    // agent-industry is failed, so falls back
    expect(decision.targetAgentId).toBe('agent-lifeforce')
  })

  it('returns orchestrator when no sub-agents are registered', () => {
    const task = makeTask({ description: 'Do anything' })
    const decision = routeToSubAgent(task, [])
    expect(decision.targetAgentId).toBe('octavius-orchestrator')
    expect(decision.reason).toContain('No registered sub-agents')
  })
})

describe('isMultiQuadrantTask', () => {
  it('returns true when task spans multiple quadrants', () => {
    const task = makeTask({
      description: 'Create a workout plan and review project deadline for the meeting',
    })
    expect(isMultiQuadrantTask(task)).toBe(true)
  })

  it('returns false for single-quadrant tasks', () => {
    const task = makeTask({ description: 'Write a journal entry about gratitude' })
    expect(isMultiQuadrantTask(task)).toBe(false)
  })

  it('returns false for tasks with no quadrant keywords', () => {
    const task = makeTask({ description: 'Hello world' })
    expect(isMultiQuadrantTask(task)).toBe(false)
  })
})

describe('getRelevantQuadrantAgents', () => {
  it('returns agents for all matching quadrants sorted by score', () => {
    const task = makeTask({
      description: 'Create a workout plan for health and review project deadline schedule',
    })
    const agents = getRelevantQuadrantAgents(task)
    expect(agents.length).toBeGreaterThanOrEqual(2)
    expect(agents).toContain('agent-lifeforce')
    expect(agents).toContain('agent-industry')
  })

  it('returns empty array when no quadrant keywords match', () => {
    const task = makeTask({ description: 'Hello world' })
    const agents = getRelevantQuadrantAgents(task)
    expect(agents).toEqual([])
  })
})

describe('storeSubAgentResult', () => {
  it('creates an episodic memory with correct provenance', () => {
    const mockCreate = vi.fn().mockReturnValue({ memory_id: 'mem-1' })
    const mockMemoryService = { create: mockCreate } as unknown as MemoryService

    storeSubAgentResult(mockMemoryService, 'agent-lifeforce', 'task-1', 'Workout plan created')

    expect(mockCreate).toHaveBeenCalledOnce()
    const input = mockCreate.mock.calls[0]![0]
    expect(input.type).toBe('episodic')
    expect(input.layer).toBe('daily_notes')
    expect(input.provenance.source_type).toBe('agent_output')
    expect(input.provenance.source_id).toBe('task-1')
    expect(input.provenance.agent_id).toBe('agent-lifeforce')
    expect(input.text).toContain('agent-lifeforce')
    expect(input.text).toContain('Workout plan created')
  })
})

describe('fanOutToQuadrantAgents', () => {
  it('spawns sessions to all relevant registered agents and aggregates results', async () => {
    const task = makeTask({
      description: 'Create a workout plan for health and review project deadline schedule',
    })

    const mockSpawnSession = vi.fn().mockResolvedValue({
      session_id: 'sess-1',
      agent_id: 'agent-lifeforce',
      task_id: 'task-1',
      status: 'completed',
      started_at: new Date().toISOString(),
      result: 'Done',
    })
    const mockDispatcher = { spawnSession: mockSpawnSession } as unknown as TaskDispatcher
    const mockCreate = vi.fn().mockReturnValue({ memory_id: 'mem-1' })
    const mockMemoryService = { create: mockCreate } as unknown as MemoryService

    const { results, failures } = await fanOutToQuadrantAgents(
      task,
      mockDispatcher,
      mockMemoryService,
      ALL_REGISTERED,
    )

    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(failures).toEqual([])
    expect(mockSpawnSession).toHaveBeenCalledTimes(results.length)
  })

  it('records failures for agents that throw', async () => {
    const task = makeTask({
      description: 'Create a workout plan for health and review project deadline schedule',
    })

    const mockSpawnSession = vi.fn().mockRejectedValue(new Error('spawn failed'))
    const mockDispatcher = { spawnSession: mockSpawnSession } as unknown as TaskDispatcher
    const mockMemoryService = { create: vi.fn() } as unknown as MemoryService

    const { results, failures } = await fanOutToQuadrantAgents(
      task,
      mockDispatcher,
      mockMemoryService,
      ALL_REGISTERED,
    )

    expect(results).toEqual([])
    expect(failures.length).toBeGreaterThanOrEqual(2)
  })
})

describe('attemptWithNextBestAgent', () => {
  it('tries next available agent after failure', async () => {
    const task = makeTask({ description: 'Do something' })
    const mockSession = {
      session_id: 'sess-fallback',
      agent_id: 'agent-industry',
      task_id: 'task-1',
      status: 'active' as const,
      started_at: new Date().toISOString(),
    }
    const mockSpawnSession = vi.fn().mockResolvedValue(mockSession)
    const mockDispatcher = { spawnSession: mockSpawnSession } as unknown as TaskDispatcher

    const result = await attemptWithNextBestAgent(
      task,
      'agent-lifeforce',
      mockDispatcher,
      ALL_REGISTERED,
    )

    expect(result).not.toBeNull()
    // Should have tried a different agent than the failed one
    const calledAgentId = mockSpawnSession.mock.calls[0]![0].agent_id
    expect(calledAgentId).not.toBe('agent-lifeforce')
  })

  it('returns null when all agents fail', async () => {
    const task = makeTask({ description: 'Do something' })
    const mockSpawnSession = vi.fn().mockRejectedValue(new Error('all fail'))
    const mockDispatcher = { spawnSession: mockSpawnSession } as unknown as TaskDispatcher

    const result = await attemptWithNextBestAgent(
      task,
      'agent-lifeforce',
      mockDispatcher,
      ALL_REGISTERED,
    )

    expect(result).toBeNull()
  })

  it('returns null when no agents are registered', async () => {
    const task = makeTask({ description: 'Do something' })
    const mockDispatcher = { spawnSession: vi.fn() } as unknown as TaskDispatcher

    const result = await attemptWithNextBestAgent(
      task,
      'agent-lifeforce',
      mockDispatcher,
      [],
    )

    expect(result).toBeNull()
  })
})
