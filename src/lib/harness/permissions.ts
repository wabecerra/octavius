/**
 * Permission Hierarchy — per-agent permission levels with tool-level enforcement.
 * Inspired by claw-code's PermissionPolicy with ReadOnly < WorkspaceWrite < DangerFullAccess.
 */

import { randomUUID } from 'crypto'
import { PermissionLevel, PERMISSION_LABELS, type GateResult, type HarnessSession } from './types'
import type { PermissionOverridePayload } from './trace-types'

/** Default permission level per agent type */
export const AGENT_DEFAULT_PERMISSIONS: Record<string, PermissionLevel> = {
  orchestrator: PermissionLevel.STANDARD,
  generalist: PermissionLevel.STANDARD,
  'specialist-coder': PermissionLevel.ELEVATED,
  'specialist-architect': PermissionLevel.ELEVATED,
  'specialist-research': PermissionLevel.READ_ONLY,
  'specialist-marketing': PermissionLevel.READ_ONLY,
  'specialist-writing': PermissionLevel.STANDARD,
  'specialist-video': PermissionLevel.READ_ONLY,
  'specialist-image': PermissionLevel.READ_ONLY,
  'specialist-n8n': PermissionLevel.ELEVATED,
}

/** Minimum permission level required per tool */
export const TOOL_PERMISSION_MAP: Record<string, PermissionLevel> = {
  // READ_ONLY
  octavius_tasks_list: PermissionLevel.READ_ONLY,
  octavius_checkins_list: PermissionLevel.READ_ONLY,
  octavius_journal_list: PermissionLevel.READ_ONLY,
  octavius_goals_list: PermissionLevel.READ_ONLY,
  octavius_connections_list: PermissionLevel.READ_ONLY,
  octavius_gratitude_list: PermissionLevel.READ_ONLY,
  octavius_memory_search: PermissionLevel.READ_ONLY,
  octavius_memory_context: PermissionLevel.READ_ONLY,
  octavius_memory_graph_traverse: PermissionLevel.READ_ONLY,
  octavius_memory_graph_export: PermissionLevel.READ_ONLY,
  octavius_gateway_status: PermissionLevel.READ_ONLY,
  octavius_agent_status: PermissionLevel.READ_ONLY,
  octavius_cost_summary: PermissionLevel.READ_ONLY,
  octavius_active_jobs: PermissionLevel.READ_ONLY,
  octavius_jobs_list: PermissionLevel.READ_ONLY,
  octavius_lcm_status: PermissionLevel.READ_ONLY,
  octavius_lcm_search: PermissionLevel.READ_ONLY,
  octavius_lcm_conversations: PermissionLevel.READ_ONLY,
  octavius_profile_get: PermissionLevel.READ_ONLY,
  octavius_approval_check: PermissionLevel.READ_ONLY,
  octavius_discover: PermissionLevel.READ_ONLY,
  discover_specialists: PermissionLevel.READ_ONLY,
  // STANDARD
  octavius_task_create: PermissionLevel.STANDARD,
  octavius_task_update: PermissionLevel.STANDARD,
  octavius_checkin: PermissionLevel.STANDARD,
  octavius_journal: PermissionLevel.STANDARD,
  octavius_goal_create: PermissionLevel.STANDARD,
  octavius_goal_update: PermissionLevel.STANDARD,
  octavius_connection_create: PermissionLevel.STANDARD,
  octavius_connection_update: PermissionLevel.STANDARD,
  octavius_gratitude_create: PermissionLevel.STANDARD,
  octavius_focus_goals_set: PermissionLevel.STANDARD,
  octavius_schedule_add: PermissionLevel.STANDARD,
  octavius_schedule_toggle: PermissionLevel.STANDARD,
  octavius_memory_store: PermissionLevel.STANDARD,
  octavius_memory_update: PermissionLevel.STANDARD,
  octavius_memory_graph_link: PermissionLevel.STANDARD,
  octavius_chat_reply: PermissionLevel.STANDARD,
  octavius_weekly_review: PermissionLevel.STANDARD,
  octavius_task_dispatch: PermissionLevel.STANDARD,
  octavius_agents_delegate: PermissionLevel.STANDARD,
  octavius_profile_update: PermissionLevel.STANDARD,
  spawn_specialist: PermissionLevel.STANDARD,
  // ELEVATED
  octavius_task_delete: PermissionLevel.ELEVATED,
  octavius_memory_delete: PermissionLevel.ELEVATED,
  octavius_agents_provision: PermissionLevel.ELEVATED,
  octavius_agents_workspace_write: PermissionLevel.ELEVATED,
  octavius_health_import: PermissionLevel.ELEVATED,
  octavius_health_ingest: PermissionLevel.ELEVATED,
  // FULL_ACCESS
  octavius_memory_consolidate: PermissionLevel.FULL_ACCESS,
  octavius_memory_evolve: PermissionLevel.FULL_ACCESS,
  octavius_memory_config: PermissionLevel.FULL_ACCESS,
}

/** Pending permission elevation request */
export interface PermissionElevationRequest {
  id: string
  sessionKey: string
  agentId: string
  toolName: string
  requiredLevel: PermissionLevel
  currentLevel: PermissionLevel
  description: string
  createdAt: string
  expiresAt: string
}

const ELEVATION_EXPIRY_MS = 60_000
const pendingElevations = new Map<string, PermissionElevationRequest>()

/** Lazy reference to policy-store to avoid circular dependency */
let _getActivePolicies: typeof import('./policy-store').getActivePolicies | null = null
function lazyGetActivePolicies() {
  if (!_getActivePolicies) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _getActivePolicies = (require('./policy-store') as typeof import('./policy-store')).getActivePolicies
  }
  return _getActivePolicies
}

/** Resolve permission level for an agent type, checking active policy overrides first */
export function resolvePermissionLevel(agentType: string): PermissionLevel {
  const policies = lazyGetActivePolicies()('permission_override', agentType)
  if (policies.length > 0) {
    const payload = policies[0].payload as PermissionOverridePayload
    // Safety: never auto-grant FULL_ACCESS via policy
    if (payload.newLevel >= 0 && payload.newLevel <= PermissionLevel.ELEVATED) {
      return payload.newLevel as PermissionLevel
    }
  }
  return AGENT_DEFAULT_PERMISSIONS[agentType] ?? PermissionLevel.STANDARD
}

/** Get the required permission level for a tool (defaults to STANDARD for unknown tools) */
export function getToolPermissionLevel(toolName: string): PermissionLevel {
  return TOOL_PERMISSION_MAP[toolName] ?? PermissionLevel.STANDARD
}

/** Check if a session has permission to use a tool */
export function checkPermission(session: HarnessSession, toolName: string): GateResult {
  const required = getToolPermissionLevel(toolName)

  if (session.permissionLevel >= required) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Tool '${toolName}' requires ${PERMISSION_LABELS[required]} but agent '${session.agentId}' has ${PERMISSION_LABELS[session.permissionLevel]}`,
  }
}

/** Request permission elevation — creates a pending request */
export function requestElevation(
  session: HarnessSession,
  toolName: string,
): PermissionElevationRequest {
  const required = getToolPermissionLevel(toolName)
  const now = Date.now()
  const req: PermissionElevationRequest = {
    id: randomUUID(),
    sessionKey: session.sessionKey,
    agentId: session.agentId,
    toolName,
    requiredLevel: required,
    currentLevel: session.permissionLevel,
    description: `Agent '${session.agentId}' needs ${PERMISSION_LABELS[required]} to use '${toolName}'`,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ELEVATION_EXPIRY_MS).toISOString(),
  }
  pendingElevations.set(req.id, req)
  return req
}

/** Confirm an elevation request */
export function confirmElevation(elevationId: string): {
  confirmed: boolean
  sessionKey?: string
  toolName?: string
} {
  const entry = pendingElevations.get(elevationId)
  if (!entry) return { confirmed: false }
  pendingElevations.delete(elevationId)
  if (new Date(entry.expiresAt).getTime() < Date.now()) return { confirmed: false }
  return { confirmed: true, sessionKey: entry.sessionKey, toolName: entry.toolName }
}

/** Reject an elevation request */
export function rejectElevation(elevationId: string): boolean {
  return pendingElevations.delete(elevationId)
}

/** Get all pending elevation requests */
export function getPendingElevations(): PermissionElevationRequest[] {
  const now = Date.now()
  return Array.from(pendingElevations.values()).filter(
    e => new Date(e.expiresAt).getTime() > now
  )
}

/** Clean expired elevation requests */
export function cleanExpiredElevations(): number {
  const now = Date.now()
  let removed = 0
  for (const [id, entry] of pendingElevations) {
    if (new Date(entry.expiresAt).getTime() <= now) {
      pendingElevations.delete(id)
      removed++
    }
  }
  return removed
}
