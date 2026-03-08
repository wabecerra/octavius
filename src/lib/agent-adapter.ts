import type { AgentTask, ModelRouterConfig, EscalationEvent, RoutingDecision } from '@/types'
import { routeTask, getEscalatedTier } from './model-router'
import { trackedFetch } from './llm-cost/tracker'

/** Minimal response shape from model endpoints */
export interface ModelResponse {
  result: string
}

/** Dependency-injectable fetch signature */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>

/** Result returned by executeTask */
export interface ExecuteTaskResult {
  result: string
  routing: RoutingDecision
  escalation?: EscalationEvent
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 500

/**
 * Build the request body for the given routing decision.
 * Local Ollama uses /api/generate with {model, prompt}.
 * Cloud uses /v1/chat/completions with {model, messages}.
 */
function buildRequest(
  routing: RoutingDecision,
  prompt: string,
): { url: string; body: string } {
  if (routing.isLocal) {
    return {
      url: `${routing.endpoint}/api/generate`,
      body: JSON.stringify({ model: routing.model, prompt }),
    }
  }
  return {
    url: `${routing.endpoint}/v1/chat/completions`,
    body: JSON.stringify({
      model: routing.model,
      messages: [{ role: 'user', content: prompt }],
    }),
  }
}

/**
 * Parse the response body based on endpoint type.
 * Local Ollama returns { response: string }.
 * Cloud returns { choices: [{ message: { content: string } }] }.
 */
async function parseResponse(
  res: Response,
  isLocal: boolean,
): Promise<string> {
  const json = await res.json()
  if (isLocal) {
    return json.response ?? ''
  }
  return json.choices?.[0]?.message?.content ?? ''
}

/** Sleep helper for exponential backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute an agent task against the routed model endpoint.
 *
 * 1. Routes the task via `routeTask` to get tier/model/endpoint.
 * 2. Dispatches to the correct endpoint (local Ollama or cloud).
 * 3. Retries up to 3 times with exponential backoff on failure.
 * 4. After 3 consecutive failures, escalates to the next tier via `getEscalatedTier`.
 *
 * @param task - The agent task to execute
 * @param config - Model router configuration
 * @param localReachable - Whether the local model endpoint is reachable
 * @param fetchFn - Injectable fetch function (defaults to global fetch)
 */
export async function executeTask(
  task: AgentTask,
  config: ModelRouterConfig,
  localReachable: boolean,
  fetchFn?: FetchFn,
): Promise<ExecuteTaskResult> {
  const routing = routeTask(task.complexityScore, config, localReachable)
  const { url, body } = buildRequest(routing, task.description)

  // Use tracked fetch for automatic cost logging unless a custom fetchFn is provided (tests)
  const doFetch: FetchFn = fetchFn ?? ((u, init) =>
    trackedFetch(u, init, {
      model: routing.model,
      isLocal: routing.isLocal,
      taskId: task.id,
      agentId: task.agentId,
      tier: routing.tier,
    })
  )

  let lastError: Error | undefined
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const result = await parseResponse(res, routing.isLocal)
      return { result, routing }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))
      }
    }
  }

  // All 3 attempts failed — trigger escalation
  const escalatedTier = getEscalatedTier(routing.tier, MAX_RETRIES)
  const escalation: EscalationEvent = {
    id: `esc-${task.id}-${Date.now()}`,
    taskId: task.id,
    fromTier: routing.tier,
    toTier: escalatedTier,
    failureReason: lastError?.message ?? 'Unknown error',
    timestamp: new Date().toISOString(),
  }

  throw new AgentExecutionError(
    `Task ${task.id} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
    escalation,
    routing,
  )
}

/** Custom error carrying escalation metadata */
export class AgentExecutionError extends Error {
  constructor(
    message: string,
    public readonly escalation: EscalationEvent,
    public readonly routing: RoutingDecision,
  ) {
    super(message)
    this.name = 'AgentExecutionError'
  }
}
