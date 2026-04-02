/**
 * Double-Confirmation Gate for Critical Operations
 *
 * Intercepts destructive or high-impact operations and requires explicit
 * re-confirmation before they execute. Pending confirmations auto-expire
 * after 60 seconds to prevent stale approvals.
 */

import { randomUUID } from 'crypto'

const CRITICAL_OPERATIONS = new Set([
  'task_delete',
  'memory_delete',
  'agent_stop',
  'bulk_dispatch',
  'goal_delete',
  'connection_delete',
  'job_delete',
])

const EXPIRY_MS = 60_000

export interface PendingConfirmation {
  id: string
  operation: string
  params: Record<string, unknown>
  description: string
  createdAt: string
  expiresAt: string
}

const pending = new Map<string, PendingConfirmation>()

export function requiresConfirmation(operation: string): boolean {
  return CRITICAL_OPERATIONS.has(operation)
}

export function requestConfirmation(
  operation: string,
  params: Record<string, unknown>,
  description: string,
): PendingConfirmation {
  const now = Date.now()
  const confirmation: PendingConfirmation = {
    id: randomUUID(),
    operation,
    params,
    description,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + EXPIRY_MS).toISOString(),
  }
  pending.set(confirmation.id, confirmation)
  return confirmation
}

export function confirmOperation(
  confirmationId: string,
): { confirmed: boolean; operation?: string; params?: Record<string, unknown> } {
  const entry = pending.get(confirmationId)
  if (!entry) return { confirmed: false }

  pending.delete(confirmationId)

  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    return { confirmed: false }
  }

  return { confirmed: true, operation: entry.operation, params: entry.params }
}

export function rejectConfirmation(confirmationId: string): boolean {
  return pending.delete(confirmationId)
}

export function getPendingConfirmations(): PendingConfirmation[] {
  const now = Date.now()
  const results: PendingConfirmation[] = []
  for (const entry of pending.values()) {
    if (new Date(entry.expiresAt).getTime() > now) {
      results.push(entry)
    }
  }
  return results
}

export function cleanExpired(): number {
  const now = Date.now()
  let removed = 0
  for (const [id, entry] of pending) {
    if (new Date(entry.expiresAt).getTime() <= now) {
      pending.delete(id)
      removed++
    }
  }
  return removed
}
