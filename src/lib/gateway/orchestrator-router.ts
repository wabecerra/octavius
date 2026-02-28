/**
 * OrchestratorRouter — task analysis, sub-agent selection, multi-quadrant
 * aggregation, and failure handling for the Octavious orchestrator.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
import type { AgentTask } from '@/types'
import type { DelegationDecision, SessionInfo, SpawnSessionRequest } from './types'
import type { TaskDispatcher } from './dispatcher'
import type { MemoryService } from '../memory/service'

// ── Quadrant / agent mapping ──────────────────────────────────────────

/** Canonical quadrant tags and their corresponding agent IDs */
const QUADRANT_AGENTS: Record<string, string> = {
  lifeforce: 'agent-lifeforce',
  industry: 'agent-industry',
  fellowship: 'agent-fellowship',
  essence: 'agent-essence',
}

/** Reverse lookup: agent ID → quadrant tag */
const AGENT_TO_QUADRANT: Record<string, string> = Object.fromEntries(
  Object.entries(QUADRANT_AGENTS).map(([q, a]) => [a, q]),
)

/** Specialist agent IDs */
const SPECIALIST_AGENTS = ['specialist-research', 'specialist-engineering'] as const

/** All known sub-agent IDs (quadrant + specialist) */
const ALL_SUB_AGENTS = [
  ...Object.values(QUADRANT_AGENTS),
  ...SPECIALIST_AGENTS,
]

/**
 * Keyword → quadrant mapping for content-based routing.
 * Each keyword list is checked against the task description (case-insensitive).
 */
const QUADRANT_KEYWORDS: Record<string, string[]> = {
  lifeforce: [
    'health', 'wellness', 'workout', 'exercise', 'fitness', 'sleep',
    'nutrition', 'diet', 'meditation', 'stress', 'energy', 'mood',
    'mental health', 'check-in', 'check in', 'wellbeing', 'self-care',
  ],
  industry: [
    'work', 'career', 'task', 'project', 'deadline', 'meeting',
    'business', 'productivity', 'job', 'professional', 'market',
    'research', 'engineering', 'code', 'development', 'strategy',
    'revenue', 'budget', 'schedule', 'focus', 'goal',
  ],
  fellowship: [
    'relationship', 'connection', 'friend', 'family', 'contact',
    'social', 'community', 'network', 'communication', 'reach out',
    'catch up', 'birthday', 'anniversary', 'partner', 'colleague',
  ],
  essence: [
    'journal', 'gratitude', 'reflection', 'soul', 'purpose',
    'values', 'meaning', 'spiritual', 'mindfulness', 'creative',
    'writing', 'art', 'music', 'philosophy', 'identity', 'vision',
  ],
}

/** Specialist keyword mapping */
const SPECIALIST_KEYWORDS: Record<string, string[]> = {
  'specialist-research': [
    'research', 'investigate', 'analyze', 'study', 'survey',
    'data', 'report', 'findings', 'literature', 'sources',
  ],
  'specialist-engineering': [
    'build', 'implement', 'code', 'develop', 'deploy',
    'architecture', 'system', 'infrastructure', 'automate', 'debug',
  ],
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Analyze task content and determine the target sub-agent.
 *
 * Routing priority:
 * 1. Explicit Quadrant_Tag on the task (via tags array)
 * 2. Keyword matching against task description
 * 3. Specialist agent matching
 * 4. Fallback to orchestrator itself
 *
 * Only returns agents that are currently registered.
 *
 * Requirement 7.1
 */
export function routeToSubAgent(
  task: AgentTask,
  registeredAgents: Array<{ agentId: string; status: string }>,
): DelegationDecision {
  const registeredIds = new Set(
    registeredAgents
      .filter((a) => a.status === 'registered')
      .map((a) => a.agentId),
  )

  // 1. Check explicit quadrant tag in task description or tags-like content
  const explicitQuadrant = detectExplicitQuadrant(task)
  if (explicitQuadrant) {
    const agentId = QUADRANT_AGENTS[explicitQuadrant]
    if (agentId && registeredIds.has(agentId)) {
      return {
        targetAgentId: agentId,
        quadrantContext: explicitQuadrant,
        reason: `Explicit quadrant tag: ${explicitQuadrant}`,
      }
    }
  }

  // 2. Keyword-based quadrant matching
  const quadrantScores = scoreQuadrants(task.description)
  const topQuadrant = getTopScoringQuadrant(quadrantScores)
  if (topQuadrant) {
    const agentId = QUADRANT_AGENTS[topQuadrant]
    if (agentId && registeredIds.has(agentId)) {
      return {
        targetAgentId: agentId,
        quadrantContext: topQuadrant,
        reason: `Keyword match: ${topQuadrant} quadrant (score: ${quadrantScores[topQuadrant]})`,
      }
    }
  }

  // 3. Specialist agent matching
  const specialistMatch = matchSpecialist(task.description, registeredIds)
  if (specialistMatch) {
    return {
      targetAgentId: specialistMatch,
      reason: `Specialist keyword match: ${specialistMatch}`,
    }
  }

  // 4. Fallback: pick the first registered quadrant agent, or orchestrator
  const fallbackAgent = ALL_SUB_AGENTS.find((id) => registeredIds.has(id))
  if (fallbackAgent) {
    const quadrant = AGENT_TO_QUADRANT[fallbackAgent]
    return {
      targetAgentId: fallbackAgent,
      quadrantContext: quadrant,
      reason: 'Fallback: no strong keyword match; routed to first available agent',
    }
  }

  // No registered sub-agents — route to orchestrator itself
  return {
    targetAgentId: 'octavious-orchestrator',
    reason: 'No registered sub-agents available; handled by orchestrator',
  }
}

/**
 * Determine if a task spans multiple quadrants.
 *
 * A task is multi-quadrant when keywords from 2+ quadrants are detected
 * with scores above a minimum threshold.
 *
 * Requirement 7.5
 */
export function isMultiQuadrantTask(task: AgentTask): boolean {
  const scores = scoreQuadrants(task.description)
  const THRESHOLD = 1
  const matchingQuadrants = Object.values(scores).filter((s) => s >= THRESHOLD)
  return matchingQuadrants.length >= 2
}

/**
 * Return the list of quadrant agent IDs relevant to a task.
 *
 * Requirement 7.5
 */
export function getRelevantQuadrantAgents(task: AgentTask): string[] {
  const scores = scoreQuadrants(task.description)
  const THRESHOLD = 1
  return Object.entries(scores)
    .filter(([, score]) => score >= THRESHOLD)
    .sort(([, a], [, b]) => b - a)
    .map(([quadrant]) => QUADRANT_AGENTS[quadrant]!)
}

/**
 * Handle a sub-agent announce result: store as episodic memory with agent provenance.
 *
 * Requirement 7.4
 */
export function storeSubAgentResult(
  memoryService: MemoryService,
  agentId: string,
  taskId: string,
  result: string,
): void {
  memoryService.create({
    text: `Sub-agent result from ${agentId}: ${result}`,
    type: 'episodic',
    layer: 'daily_notes',
    provenance: {
      source_type: 'agent_output',
      source_id: taskId,
      agent_id: agentId,
    },
    confidence: 0.9,
    importance: 0.6,
    tags: ['sub-agent-result', 'delegation'],
  })
}

/**
 * Multi-quadrant fan-out: spawn sub-sessions to each relevant agent,
 * aggregate results.
 *
 * Requirement 7.5
 */
export async function fanOutToQuadrantAgents(
  task: AgentTask,
  dispatcher: TaskDispatcher,
  memoryService: MemoryService,
  registeredAgents: Array<{ agentId: string; status: string }>,
): Promise<{ results: Array<{ agentId: string; result: string }>; failures: string[] }> {
  const relevantAgents = getRelevantQuadrantAgents(task)
  const registeredIds = new Set(
    registeredAgents
      .filter((a) => a.status === 'registered')
      .map((a) => a.agentId),
  )

  const results: Array<{ agentId: string; result: string }> = []
  const failures: string[] = []

  // Spawn sub-sessions in parallel
  const promises = relevantAgents
    .filter((agentId) => registeredIds.has(agentId))
    .map(async (agentId) => {
      const quadrant = AGENT_TO_QUADRANT[agentId]
      const request: SpawnSessionRequest = {
        agent_id: agentId,
        message: task.description,
        context: {
          task_id: task.id,
          quadrant,
          multi_quadrant: true,
        },
      }

      try {
        const session = await dispatcher.spawnSession(request)
        const result = session.result ?? ''
        storeSubAgentResult(memoryService, agentId, task.id, result)
        results.push({ agentId, result })
      } catch {
        failures.push(agentId)
      }
    })

  await Promise.allSettled(promises)

  return { results, failures }
}

/**
 * Failure handling: attempt the task with the next-best agent.
 * Returns null if all agents fail (caller should escalate to user).
 *
 * Requirement 7.6
 */
export async function attemptWithNextBestAgent(
  task: AgentTask,
  failedAgentId: string,
  dispatcher: TaskDispatcher,
  registeredAgents: Array<{ agentId: string; status: string }>,
): Promise<SessionInfo | null> {
  const registeredIds = new Set(
    registeredAgents
      .filter((a) => a.status === 'registered')
      .map((a) => a.agentId),
  )

  // Get all candidate agents excluding the failed one
  const candidates = ALL_SUB_AGENTS.filter(
    (id) => id !== failedAgentId && registeredIds.has(id),
  )

  for (const agentId of candidates) {
    try {
      const session = await dispatcher.spawnSession({
        agent_id: agentId,
        message: task.description,
        context: {
          task_id: task.id,
          fallback_from: failedAgentId,
        },
      })
      return session
    } catch {
      // Try next agent
      continue
    }
  }

  // All agents failed — escalate to user
  return null
}

// ── Internal helpers ──────────────────────────────────────────────────

/** Detect an explicit quadrant tag from the task's agentId or description */
function detectExplicitQuadrant(task: AgentTask): string | null {
  // Check if agentId directly maps to a quadrant
  const quadrantFromAgent = AGENT_TO_QUADRANT[task.agentId]
  if (quadrantFromAgent) return quadrantFromAgent

  // Check for explicit quadrant mentions in description (e.g. "[lifeforce]" or "quadrant:industry")
  const desc = task.description.toLowerCase()
  for (const quadrant of Object.keys(QUADRANT_AGENTS)) {
    if (desc.includes(`[${quadrant}]`) || desc.includes(`quadrant:${quadrant}`)) {
      return quadrant
    }
  }

  return null
}

/** Score each quadrant by counting keyword matches in the text */
function scoreQuadrants(text: string): Record<string, number> {
  const lower = text.toLowerCase()
  const scores: Record<string, number> = {}

  for (const [quadrant, keywords] of Object.entries(QUADRANT_KEYWORDS)) {
    scores[quadrant] = keywords.filter((kw) => lower.includes(kw)).length
  }

  return scores
}

/** Return the quadrant with the highest score, or null if all are 0 */
function getTopScoringQuadrant(scores: Record<string, number>): string | null {
  let best: string | null = null
  let bestScore = 0

  for (const [quadrant, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = quadrant
      bestScore = score
    }
  }

  return best
}

/** Match specialist agents by keyword */
function matchSpecialist(text: string, registeredIds: Set<string>): string | null {
  const lower = text.toLowerCase()

  for (const [agentId, keywords] of Object.entries(SPECIALIST_KEYWORDS)) {
    if (!registeredIds.has(agentId)) continue
    const matches = keywords.filter((kw) => lower.includes(kw)).length
    if (matches >= 2) return agentId
  }

  return null
}
