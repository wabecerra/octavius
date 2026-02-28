import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState, seededAgents, tasksByAgent } from './index'
import type { AgentTask, EscalationEvent, ModelRouterConfig } from '@/types'

describe('Agents slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('seeded agents', () => {
    it('seeds 10 agents on default state (4 generalists + 6 specialists)', () => {
      const state = useOctaviusStore.getState()
      expect(state.agents).toHaveLength(10)
    })

    it('seeds 4 generalist agents', () => {
      const generalists = useOctaviusStore.getState().agents.filter((a) => a.role.startsWith('generalist-'))
      expect(generalists).toHaveLength(4)
      const roles = generalists.map((a) => a.role).sort()
      expect(roles).toEqual(['generalist-career', 'generalist-health', 'generalist-relationships', 'generalist-soul'])
    })

    it('seeds 6 specialist agents', () => {
      const specialists = useOctaviusStore.getState().agents.filter((a) => a.role.startsWith('specialist-'))
      expect(specialists).toHaveLength(6)
      const roles = specialists.map((a) => a.role).sort()
      expect(roles).toEqual([
        'specialist-engineering',
        'specialist-image',
        'specialist-marketing',
        'specialist-research',
        'specialist-video',
        'specialist-writing',
      ])
    })

    it('all seeded agents start with idle status and no lastActivityAt', () => {
      for (const agent of useOctaviusStore.getState().agents) {
        expect(agent.status).toBe('idle')
        expect(agent.lastActivityAt).toBeUndefined()
      }
    })
  })

  describe('updateAgentStatus', () => {
    it('updates an agent status to running', () => {
      useOctaviusStore.getState().updateAgentStatus('generalist-health', 'running')
      const agent = useOctaviusStore.getState().agents.find((a) => a.id === 'generalist-health')
      expect(agent?.status).toBe('running')
      expect(agent?.lastActivityAt).toBeDefined()
    })

    it('updates an agent status to error', () => {
      useOctaviusStore.getState().updateAgentStatus('specialist-research', 'error')
      const agent = useOctaviusStore.getState().agents.find((a) => a.id === 'specialist-research')
      expect(agent?.status).toBe('error')
    })

    it('updates an agent status back to idle', () => {
      useOctaviusStore.getState().updateAgentStatus('generalist-career', 'running')
      useOctaviusStore.getState().updateAgentStatus('generalist-career', 'idle')
      const agent = useOctaviusStore.getState().agents.find((a) => a.id === 'generalist-career')
      expect(agent?.status).toBe('idle')
    })

    it('does not affect other agents', () => {
      useOctaviusStore.getState().updateAgentStatus('generalist-health', 'running')
      const others = useOctaviusStore.getState().agents.filter((a) => a.id !== 'generalist-health')
      for (const agent of others) {
        expect(agent.status).toBe('idle')
      }
    })
  })
})

describe('AgentTasks slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  const sampleTask: AgentTask = {
    id: 'task-1',
    agentId: 'generalist-health',
    description: 'Analyze health data',
    complexityScore: 3,
    tier: 1,
    modelUsed: 'llama3.2',
    status: 'pending',
    createdAt: '2025-01-15T10:00:00Z',
  }

  describe('createAgentTask', () => {
    it('adds a new agent task to the store', () => {
      useOctaviusStore.getState().createAgentTask(sampleTask)
      const state = useOctaviusStore.getState()
      expect(state.agentTasks).toHaveLength(1)
      expect(state.agentTasks[0]).toEqual(sampleTask)
    })

    it('preserves existing tasks when adding a new one', () => {
      useOctaviusStore.getState().createAgentTask(sampleTask)
      const second: AgentTask = { ...sampleTask, id: 'task-2', agentId: 'specialist-research' }
      useOctaviusStore.getState().createAgentTask(second)
      expect(useOctaviusStore.getState().agentTasks).toHaveLength(2)
    })
  })

  describe('updateAgentTaskStatus', () => {
    it('updates task status to running', () => {
      useOctaviusStore.getState().createAgentTask(sampleTask)
      useOctaviusStore.getState().updateAgentTaskStatus('task-1', 'running')
      const task = useOctaviusStore.getState().agentTasks.find((t) => t.id === 'task-1')
      expect(task?.status).toBe('running')
    })

    it('updates task status to complete with result', () => {
      useOctaviusStore.getState().createAgentTask(sampleTask)
      useOctaviusStore.getState().updateAgentTaskStatus('task-1', 'complete', 'Analysis done')
      const task = useOctaviusStore.getState().agentTasks.find((t) => t.id === 'task-1')
      expect(task?.status).toBe('complete')
      expect(task?.result).toBe('Analysis done')
      expect(task?.completedAt).toBeDefined()
    })

    it('updates task status to failed with completedAt', () => {
      useOctaviusStore.getState().createAgentTask(sampleTask)
      useOctaviusStore.getState().updateAgentTaskStatus('task-1', 'failed', 'Model error')
      const task = useOctaviusStore.getState().agentTasks.find((t) => t.id === 'task-1')
      expect(task?.status).toBe('failed')
      expect(task?.result).toBe('Model error')
      expect(task?.completedAt).toBeDefined()
    })

    it('does not set completedAt for non-terminal statuses', () => {
      useOctaviusStore.getState().createAgentTask(sampleTask)
      useOctaviusStore.getState().updateAgentTaskStatus('task-1', 'running')
      const task = useOctaviusStore.getState().agentTasks.find((t) => t.id === 'task-1')
      expect(task?.completedAt).toBeUndefined()
    })

    it('does not affect other tasks', () => {
      const second: AgentTask = { ...sampleTask, id: 'task-2' }
      useOctaviusStore.getState().createAgentTask(sampleTask)
      useOctaviusStore.getState().createAgentTask(second)
      useOctaviusStore.getState().updateAgentTaskStatus('task-1', 'complete', 'Done')
      const task2 = useOctaviusStore.getState().agentTasks.find((t) => t.id === 'task-2')
      expect(task2?.status).toBe('pending')
    })
  })

  describe('cancelAgentTask', () => {
    it('sets task status to cancelled', () => {
      useOctaviusStore.getState().createAgentTask(sampleTask)
      useOctaviusStore.getState().cancelAgentTask('task-1')
      const task = useOctaviusStore.getState().agentTasks.find((t) => t.id === 'task-1')
      expect(task?.status).toBe('cancelled')
    })

    it('does not affect other tasks', () => {
      const second: AgentTask = { ...sampleTask, id: 'task-2' }
      useOctaviusStore.getState().createAgentTask(sampleTask)
      useOctaviusStore.getState().createAgentTask(second)
      useOctaviusStore.getState().cancelAgentTask('task-1')
      const task2 = useOctaviusStore.getState().agentTasks.find((t) => t.id === 'task-2')
      expect(task2?.status).toBe('pending')
    })
  })

  describe('tasksByAgent selector', () => {
    it('returns empty array when no tasks exist', () => {
      expect(tasksByAgent(useOctaviusStore.getState(), 'generalist-health')).toEqual([])
    })

    it('returns only tasks for the specified agent', () => {
      const task1: AgentTask = { ...sampleTask, id: 'task-1', agentId: 'generalist-health' }
      const task2: AgentTask = { ...sampleTask, id: 'task-2', agentId: 'specialist-research' }
      const task3: AgentTask = { ...sampleTask, id: 'task-3', agentId: 'generalist-health' }
      useOctaviusStore.getState().createAgentTask(task1)
      useOctaviusStore.getState().createAgentTask(task2)
      useOctaviusStore.getState().createAgentTask(task3)
      const result = tasksByAgent(useOctaviusStore.getState(), 'generalist-health')
      expect(result).toHaveLength(2)
      expect(result.map((t) => t.id)).toEqual(['task-1', 'task-3'])
    })
  })
})

describe('EscalationLog slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('appendEscalationEvent', () => {
    it('appends an escalation event to the log', () => {
      const event: EscalationEvent = {
        id: 'esc-1',
        taskId: 'task-1',
        fromTier: 1,
        toTier: 2,
        failureReason: 'Model timeout',
        timestamp: '2025-01-15T10:00:00Z',
      }
      useOctaviusStore.getState().appendEscalationEvent(event)
      const state = useOctaviusStore.getState()
      expect(state.escalationLog).toHaveLength(1)
      expect(state.escalationLog[0]).toEqual(event)
    })

    it('preserves existing events when appending', () => {
      const event1: EscalationEvent = {
        id: 'esc-1',
        taskId: 'task-1',
        fromTier: 1,
        toTier: 2,
        failureReason: 'Timeout',
        timestamp: '2025-01-15T10:00:00Z',
      }
      const event2: EscalationEvent = {
        id: 'esc-2',
        taskId: 'task-2',
        fromTier: 2,
        toTier: 3,
        failureReason: 'Rate limit',
        timestamp: '2025-01-15T11:00:00Z',
      }
      useOctaviusStore.getState().appendEscalationEvent(event1)
      useOctaviusStore.getState().appendEscalationEvent(event2)
      expect(useOctaviusStore.getState().escalationLog).toHaveLength(2)
      expect(useOctaviusStore.getState().escalationLog[0]).toEqual(event1)
      expect(useOctaviusStore.getState().escalationLog[1]).toEqual(event2)
    })
  })
})

describe('RouterConfig slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('updateRouterConfig', () => {
    it('updates a single config field', () => {
      useOctaviusStore.getState().updateRouterConfig({ localModelName: 'mistral' })
      expect(useOctaviusStore.getState().routerConfig.localModelName).toBe('mistral')
    })

    it('updates multiple config fields at once', () => {
      useOctaviusStore.getState().updateRouterConfig({
        tier2Model: 'gpt-4o-mini',
        dailyCostBudget: 10,
      })
      const config = useOctaviusStore.getState().routerConfig
      expect(config.tier2Model).toBe('gpt-4o-mini')
      expect(config.dailyCostBudget).toBe(10)
    })

    it('preserves unmodified config fields', () => {
      const originalConfig = { ...useOctaviusStore.getState().routerConfig }
      useOctaviusStore.getState().updateRouterConfig({ localModelName: 'phi3' })
      const config = useOctaviusStore.getState().routerConfig
      expect(config.localEndpoint).toBe(originalConfig.localEndpoint)
      expect(config.tier1CloudModel).toBe(originalConfig.tier1CloudModel)
      expect(config.researchProvider).toBe(originalConfig.researchProvider)
    })

    it('updates tierCostRates', () => {
      useOctaviusStore.getState().updateRouterConfig({
        tierCostRates: { 1: 0.02, 2: 0.10, 3: 0.30 },
      })
      expect(useOctaviusStore.getState().routerConfig.tierCostRates).toEqual({ 1: 0.02, 2: 0.10, 3: 0.30 })
    })
  })
})

import fc from 'fast-check'

const tierArb = fc.constantFrom(1 as const, 2 as const, 3 as const)
const statusArb = fc.constantFrom('pending' as const, 'running' as const, 'complete' as const, 'failed' as const, 'cancelled' as const)

const agentTaskPropArb = fc.record({
  id: fc.uuid(),
  agentId: fc.constantFrom('generalist-health', 'generalist-career', 'specialist-research', 'specialist-engineering'),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  complexityScore: fc.integer({ min: 1, max: 10 }),
  tier: tierArb,
  modelUsed: fc.string({ minLength: 1, maxLength: 30 }),
  status: fc.constant('pending' as const),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString()),
})

describe('Property 18: Agent Task Persistence Round-Trip', () => {
  /**
   * **Validates: Requirements 10.2, 10.5, 11.2, 11.5, 15.4**
   *
   * For any AgentTask, after createAgentTask + read back, deeply equal.
   * After updateAgentTaskStatus to 'complete', status and result are updated.
   * After cancelAgentTask, status is 'cancelled'.
   */
  it('createAgentTask round-trip preserves data', () => {
    fc.assert(
      fc.property(agentTaskPropArb, (task) => {
        useOctaviusStore.setState(defaultState)

        useOctaviusStore.getState().createAgentTask(task)
        const stored = useOctaviusStore.getState().agentTasks.find((t) => t.id === task.id)
        expect(stored).toEqual(task)
      }),
      { numRuns: 150 },
    )
  })

  it('updateAgentTaskStatus to complete sets status and result', () => {
    fc.assert(
      fc.property(agentTaskPropArb, fc.string({ minLength: 1, maxLength: 200 }), (task, result) => {
        useOctaviusStore.setState(defaultState)

        useOctaviusStore.getState().createAgentTask(task)
        useOctaviusStore.getState().updateAgentTaskStatus(task.id, 'complete', result)

        const stored = useOctaviusStore.getState().agentTasks.find((t) => t.id === task.id)
        expect(stored?.status).toBe('complete')
        expect(stored?.result).toBe(result)
        expect(stored?.completedAt).toBeDefined()
      }),
      { numRuns: 150 },
    )
  })

  it('cancelAgentTask sets status to cancelled', () => {
    fc.assert(
      fc.property(agentTaskPropArb, (task) => {
        useOctaviusStore.setState(defaultState)

        useOctaviusStore.getState().createAgentTask(task)
        useOctaviusStore.getState().cancelAgentTask(task.id)

        const stored = useOctaviusStore.getState().agentTasks.find((t) => t.id === task.id)
        expect(stored?.status).toBe('cancelled')
      }),
      { numRuns: 150 },
    )
  })
})
