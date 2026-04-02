/**
 * Versioned Policy Store — CRUD for evolution policies proposed by the proposer agent.
 * Policies follow a lifecycle: proposed → staged → active → (superseded | rolled_back)
 */

import { randomUUID } from 'crypto'
import { getDatabase } from '@/lib/memory/db'
import type {
  EvolutionPolicy,
  PolicyType,
  PolicyStatus,
  PolicyPayload,
} from './trace-types'

// In-memory cache for active policies (60s TTL)
let activePoliciesCache: { data: EvolutionPolicy[]; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60_000

/** Create a new policy (proposed status) */
export function createPolicy(opts: {
  policyType: PolicyType
  target: string
  payload: PolicyPayload
  reason: string
  evidence: string[]
}): EvolutionPolicy {
  const db = getDatabase()

  // Get next version number for this policy_type + target
  const versionRow = db.prepare(
    'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM evolution_policies WHERE policy_type = ? AND target = ?'
  ).get(opts.policyType, opts.target) as { next_version: number }

  const policy: EvolutionPolicy = {
    policyId: randomUUID(),
    version: versionRow.next_version,
    policyType: opts.policyType,
    target: opts.target,
    payload: opts.payload,
    reason: opts.reason,
    evidence: opts.evidence,
    status: 'proposed',
    proposedAt: new Date().toISOString(),
  }

  db.prepare(`
    INSERT INTO evolution_policies (policy_id, version, policy_type, target, payload, reason, evidence, status, proposed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    policy.policyId, policy.version, policy.policyType, policy.target,
    JSON.stringify(policy.payload), policy.reason, JSON.stringify(policy.evidence),
    policy.status, policy.proposedAt,
  )

  invalidateCache()
  return policy
}

/** Transition: proposed → staged */
export function stagePolicy(policyId: string): boolean {
  return transitionStatus(policyId, 'proposed', 'staged', 'reviewed_at')
}

/** Transition: staged → active (supersedes previous active for same type+target) */
export function activatePolicy(policyId: string): boolean {
  const db = getDatabase()
  const policy = getPolicy(policyId)
  if (!policy || policy.status !== 'staged') return false

  // Supersede any currently active policy for the same type+target
  db.prepare(
    `UPDATE evolution_policies SET status = 'superseded' WHERE policy_type = ? AND target = ? AND status = 'active'`
  ).run(policy.policyType, policy.target)

  const result = db.prepare(
    `UPDATE evolution_policies SET status = 'active', activated_at = ? WHERE policy_id = ? AND status = 'staged'`
  ).run(new Date().toISOString(), policyId)

  invalidateCache()
  return result.changes > 0
}

/** Transition: proposed|staged → rejected */
export function rejectPolicy(policyId: string): boolean {
  const db = getDatabase()
  const now = new Date().toISOString()
  const result = db.prepare(
    `UPDATE evolution_policies SET status = 'rejected', reviewed_at = ? WHERE policy_id = ? AND status IN ('proposed', 'staged')`
  ).run(now, policyId)
  invalidateCache()
  return result.changes > 0
}

/** Transition: active → rolled_back */
export function rollbackPolicy(policyId: string): boolean {
  const db = getDatabase()
  const now = new Date().toISOString()
  const result = db.prepare(
    `UPDATE evolution_policies SET status = 'rolled_back', rolled_back_at = ? WHERE policy_id = ? AND status = 'active'`
  ).run(now, policyId)
  invalidateCache()
  return result.changes > 0
}

/** Get a single policy */
export function getPolicy(policyId: string): EvolutionPolicy | null {
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM evolution_policies WHERE policy_id = ?').get(policyId) as Record<string, unknown> | undefined
    return row ? rowToPolicy(row) : null
  } catch {
    return null
  }
}

/** Get all active policies, optionally filtered by type and target */
export function getActivePolicies(policyType?: PolicyType, target?: string): EvolutionPolicy[] {
  // Check cache
  if (activePoliciesCache && Date.now() - activePoliciesCache.fetchedAt < CACHE_TTL_MS) {
    let result = activePoliciesCache.data
    if (policyType) result = result.filter(p => p.policyType === policyType)
    if (target) result = result.filter(p => p.target === target)
    return result
  }

  // Refresh cache
  try {
    const db = getDatabase()
    const rows = db.prepare(
      `SELECT * FROM evolution_policies WHERE status = 'active' ORDER BY activated_at DESC`
    ).all() as Record<string, unknown>[]
    activePoliciesCache = { data: rows.map(rowToPolicy), fetchedAt: Date.now() }

    let result = activePoliciesCache.data
    if (policyType) result = result.filter(p => p.policyType === policyType)
    if (target) result = result.filter(p => p.target === target)
    return result
  } catch {
    return []
  }
}

/** List policies with optional filters */
export function listPolicies(filters?: {
  policyType?: PolicyType
  status?: PolicyStatus
  target?: string
  limit?: number
}): EvolutionPolicy[] {
  try {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.policyType) {
      conditions.push('policy_type = ?')
      params.push(filters.policyType)
    }
    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }
    if (filters?.target) {
      conditions.push('target = ?')
      params.push(filters.target)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters?.limit ?? 50

    const rows = db.prepare(
      `SELECT * FROM evolution_policies ${where} ORDER BY proposed_at DESC LIMIT ?`
    ).all(...params, limit) as Record<string, unknown>[]

    return rows.map(rowToPolicy)
  } catch {
    return []
  }
}

/** Get version history for a type+target */
export function getPolicyHistory(policyType: PolicyType, target: string): EvolutionPolicy[] {
  try {
    const db = getDatabase()
    const rows = db.prepare(
      `SELECT * FROM evolution_policies WHERE policy_type = ? AND target = ? ORDER BY version DESC`
    ).all(policyType, target) as Record<string, unknown>[]
    return rows.map(rowToPolicy)
  } catch {
    return []
  }
}

function invalidateCache(): void {
  activePoliciesCache = null
}

function transitionStatus(policyId: string, fromStatus: PolicyStatus, toStatus: PolicyStatus, timestampField: string): boolean {
  try {
    const db = getDatabase()
    const now = new Date().toISOString()
    const result = db.prepare(
      `UPDATE evolution_policies SET status = ?, ${timestampField} = ? WHERE policy_id = ? AND status = ?`
    ).run(toStatus, now, policyId, fromStatus)
    invalidateCache()
    return result.changes > 0
  } catch {
    return false
  }
}

function rowToPolicy(row: Record<string, unknown>): EvolutionPolicy {
  return {
    policyId: row.policy_id as string,
    version: row.version as number,
    policyType: row.policy_type as PolicyType,
    target: row.target as string,
    payload: JSON.parse((row.payload as string) || '{}'),
    reason: row.reason as string,
    evidence: JSON.parse((row.evidence as string) || '[]'),
    status: row.status as PolicyStatus,
    proposedAt: row.proposed_at as string,
    reviewedAt: row.reviewed_at as string | undefined,
    activatedAt: row.activated_at as string | undefined,
    rolledBackAt: row.rolled_back_at as string | undefined,
    impactSummary: row.impact_summary ? JSON.parse(row.impact_summary as string) : undefined,
  }
}
