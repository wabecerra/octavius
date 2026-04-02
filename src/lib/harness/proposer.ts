/**
 * Proposer Agent — meta-agent that analyzes execution traces
 * and proposes configuration improvements.
 *
 * Inspired by Stanford's meta-harness (arxiv 2603.28052v1):
 * exposes raw execution traces to a reasoning agent for
 * non-Markovian analysis of failure patterns.
 */

import { randomUUID } from 'crypto'
import { getDatabase } from '@/lib/memory/db'
import { callLLM } from '@/lib/llm-caller'
import { getTraceStats, queryTraces } from './trace-store'
import { createPolicy, getActivePolicies } from './policy-store'
import type { ProposerOutput, ProposerRun, PolicyType } from './trace-types'
import { PermissionLevel } from './types'
import { getHarnessModelConfig } from './model-config'

const PROPOSER_SYSTEM_PROMPT = `You are the Octavius Evolution Proposer — a meta-agent that analyzes execution
traces from the Octavius agent fleet and proposes configuration improvements.

You analyze patterns across agent runs to identify:
1. Failure patterns — recurring errors, timeout patterns, permission denials
2. Inefficiencies — agents calling tools outside their scope, excessive token usage
3. Routing mismatches — wrong agent types being assigned to tasks
4. Configuration drift — defaults that no longer match actual usage patterns

You propose CONFIGURATION changes only. You never propose code changes.

Available policy types:
- tool_scope_override: Add or remove tools from an agent type's whitelist
  Payload: { "agentType": "string", "addTools": ["string"], "removeTools": ["string"] }
- permission_override: Adjust the default permission level for an agent type (0=ReadOnly, 1=Standard, 2=Elevated)
  Payload: { "agentType": "string", "newLevel": number }
- routing_hint: Suggest which agent type works best for certain task patterns
  Payload: { "taskPattern": "string", "preferredAgentType": "string", "confidence": number }
- compaction_config: Adjust token budget thresholds
  Payload: { "thresholdPct": number, "preserveRecentCount": number }
- rate_limit_config: Adjust rate limiting
  Payload: { "windowMs": number, "maxCalls": number, "perAgentType": "string" }
- prompt_hint: Suggest additions to agent prompt sections
  Payload: { "agentType": "string", "section": "system|tools|context", "hint": "string" }

CONSTRAINTS:
- Only propose changes supported by evidence (cite trace_ids)
- Prefer small, reversible changes
- Never remove ALL tools from an agent
- Never propose FULL_ACCESS (level 3) permissions
- Each proposal must include a clear reason

Respond with valid JSON:
{
  "findings": [{ "pattern": "string", "severity": "low|medium|high", "traceIds": ["string"], "description": "string" }],
  "proposals": [{ "policyType": "string", "target": "string", "payload": {}, "reason": "string", "traceIds": ["string"] }],
  "summary": "string"
}`

/** Run the proposer agent */
export async function runProposer(
  trigger: 'cron' | 'manual' | 'event',
  options?: { sinceDays?: number },
): Promise<ProposerRun> {
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const sinceDays = options?.sinceDays ?? 1
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()

  const run: ProposerRun = {
    runId,
    trigger,
    startedAt,
    tracesAnalyzed: 0,
    proposalsGenerated: 0,
    costUsd: 0,
    summary: '',
  }

  try {
    // Gather data
    const stats = getTraceStats(since)
    const { traces, total } = queryTraces({ since, limit: 100 })
    run.tracesAnalyzed = total

    if (total === 0) {
      run.summary = 'No traces found in analysis window. Nothing to propose.'
      run.completedAt = new Date().toISOString()
      persistRun(run)
      return run
    }

    // Build analysis prompt
    const userPrompt = buildAnalysisPrompt(stats, traces, since)

    // Call LLM
    const modelConfig = getHarnessModelConfig('harness-proposer')
    const result = await callLLM(
      [
        { role: 'system', content: PROPOSER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      {
        model: modelConfig.model,
        provider: modelConfig.provider,
        maxTokens: 4096,
        label: 'harness-proposer',
      },
    )

    run.model = modelConfig.model
    // Estimate cost from response length
    const responseText = result.text ?? ''
    run.costUsd = Math.ceil(responseText.length / 4) * 0.000003 // rough estimate

    // Parse response
    const output = parseProposerOutput(responseText)
    run.summary = output.summary

    // Validate and create policies
    let created = 0
    for (const proposal of output.proposals) {
      if (validateProposal(proposal)) {
        createPolicy({
          policyType: proposal.policyType,
          target: proposal.target,
          payload: proposal.payload,
          reason: proposal.reason,
          evidence: proposal.traceIds,
        })
        created++
      }
    }
    run.proposalsGenerated = created

  } catch (err) {
    run.error = (err as Error).message
    run.summary = `Proposer failed: ${run.error}`
  }

  run.completedAt = new Date().toISOString()
  persistRun(run)
  return run
}

function buildAnalysisPrompt(
  stats: ReturnType<typeof getTraceStats>,
  traces: Array<{ traceId: string; agentId: string; agentType: string; taskTitle?: string; outcome: string; toolCallCount: number; costUsd: number; hooksAborted: string[]; outcomeReason?: string }>,
  since: string,
): string {
  const lines: string[] = []

  lines.push(`## Trace Analysis Window`)
  lines.push(`Period: ${since} to now`)
  lines.push(`Total traces analyzed: ${traces.length}\n`)

  // Agent type stats
  if (stats.byAgentType.length > 0) {
    lines.push('## By Agent Type')
    lines.push('| Agent Type | Runs | Success | Failure | Timeout | Avg Cost | Avg Duration | Avg Tools |')
    lines.push('|---|---|---|---|---|---|---|---|')
    for (const s of stats.byAgentType) {
      lines.push(`| ${s.agentType} | ${s.total} | ${s.success} | ${s.failure} | ${s.timeout} | $${s.avgCostUsd.toFixed(4)} | ${Math.round(s.avgDurationMs)}ms | ${s.avgToolCalls.toFixed(1)} |`)
    }
    lines.push('')
  }

  // Top cost traces
  if (stats.topCostTraces.length > 0) {
    lines.push('## High-Cost Traces (top 10)')
    lines.push('| Trace ID | Agent | Task | Cost | Tokens | Outcome |')
    lines.push('|---|---|---|---|---|---|')
    for (const t of stats.topCostTraces) {
      lines.push(`| ${t.traceId.slice(0, 8)}... | ${t.agentId} | ${t.taskTitle || 'N/A'} | $${t.costUsd.toFixed(4)} | ${t.totalTokens} | ${t.outcome} |`)
    }
    lines.push('')
  }

  // Hook aborts from traces
  const abortCounts = new Map<string, { count: number; traceIds: string[] }>()
  for (const trace of traces) {
    for (const reason of (trace.hooksAborted ?? [])) {
      const key = `${trace.agentType}|${reason}`
      const entry = abortCounts.get(key) ?? { count: 0, traceIds: [] }
      entry.count++
      if (entry.traceIds.length < 3) entry.traceIds.push(trace.traceId)
      abortCounts.set(key, entry)
    }
  }
  if (abortCounts.size > 0) {
    lines.push('## Hook Aborts')
    lines.push('| Agent Type | Reason | Count | Example Traces |')
    lines.push('|---|---|---|---|')
    for (const [key, val] of abortCounts) {
      const [agentType, reason] = key.split('|')
      lines.push(`| ${agentType} | ${reason} | ${val.count} | ${val.traceIds.map(id => id.slice(0, 8)).join(', ')} |`)
    }
    lines.push('')
  }

  // Active policies
  const activePolicies = getActivePolicies()
  if (activePolicies.length > 0) {
    lines.push('## Currently Active Policies')
    for (const p of activePolicies) {
      lines.push(`- **${p.policyType}** for ${p.target}: ${p.reason}`)
    }
    lines.push('')
  }

  // Sample failure traces
  const failures = traces.filter(t => t.outcome === 'failure' || t.outcome === 'timeout').slice(0, 5)
  if (failures.length > 0) {
    lines.push('## Sample Failure/Timeout Traces')
    for (const f of failures) {
      lines.push(`### ${f.traceId.slice(0, 8)} (${f.agentType}, ${f.outcome})`)
      lines.push(`Task: ${f.taskTitle || 'N/A'}`)
      lines.push(`Reason: ${f.outcomeReason || 'unknown'}`)
      lines.push(`Tool calls: ${f.toolCallCount}, Cost: $${f.costUsd.toFixed(4)}`)
      lines.push('')
    }
  }

  lines.push('Analyze the above data and produce your findings and proposals.')
  return lines.join('\n')
}

function parseProposerOutput(text: string): ProposerOutput {
  // Try to parse as JSON
  try {
    // Find JSON in the response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*"findings"[\s\S]*"proposals"[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch { /* fall through */ }

  // Fallback: return empty proposals with the text as summary
  return {
    findings: [],
    proposals: [],
    summary: text.slice(0, 500),
  }
}

function validateProposal(proposal: ProposerOutput['proposals'][0]): boolean {
  const validTypes: PolicyType[] = [
    'tool_scope_override', 'permission_override', 'routing_hint',
    'compaction_config', 'rate_limit_config', 'prompt_hint',
  ]
  if (!validTypes.includes(proposal.policyType)) return false
  if (!proposal.target) return false
  if (!proposal.payload) return false
  if (!proposal.reason) return false

  // Type-specific validation
  if (proposal.policyType === 'permission_override') {
    const payload = proposal.payload as { newLevel?: number }
    // Never allow FULL_ACCESS
    if (payload.newLevel === PermissionLevel.FULL_ACCESS) return false
    if (payload.newLevel === undefined || payload.newLevel < 0 || payload.newLevel > 2) return false
  }

  if (proposal.policyType === 'compaction_config') {
    const payload = proposal.payload as { thresholdPct?: number }
    if (payload.thresholdPct !== undefined) {
      if (payload.thresholdPct < 0.5 || payload.thresholdPct > 0.95) return false
    }
  }

  if (proposal.policyType === 'rate_limit_config') {
    const payload = proposal.payload as { maxCalls?: number }
    if (payload.maxCalls !== undefined) {
      if (payload.maxCalls < 5 || payload.maxCalls > 100) return false
    }
  }

  return true
}

function persistRun(run: ProposerRun): void {
  try {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO proposer_runs (run_id, trigger, started_at, completed_at, traces_analyzed, proposals_generated, model, cost_usd, summary, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.runId, run.trigger, run.startedAt, run.completedAt ?? null,
      run.tracesAnalyzed, run.proposalsGenerated, run.model ?? null,
      run.costUsd, run.summary, run.error ?? null,
    )
  } catch (err) {
    console.error('[proposer] Failed to persist run:', (err as Error).message)
  }
}
