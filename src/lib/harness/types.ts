/**
 * Octavius Harness — shared types for the agent harness layer.
 * The harness sits between the GatewayBridge and agent execution,
 * enforcing permissions, tool scopes, and execution policies.
 */

/** Permission levels, ordered from least to most privileged */
export enum PermissionLevel {
  READ_ONLY = 0,
  STANDARD = 1,
  ELEVATED = 2,
  FULL_ACCESS = 3,
}

/** Human-readable permission level names */
export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  [PermissionLevel.READ_ONLY]: 'Read Only',
  [PermissionLevel.STANDARD]: 'Standard',
  [PermissionLevel.ELEVATED]: 'Elevated',
  [PermissionLevel.FULL_ACCESS]: 'Full Access',
}

/** Session-scoped harness state attached to each agent run */
export interface HarnessSession {
  sessionKey: string
  agentId: string
  agentType: string
  permissionLevel: PermissionLevel
  toolScope: string[]
  tokenBudget: number
  tokenUsed: number
  compactionCount: number
  createdAt: string
}

/** Result of a tool execution gate check */
export interface GateResult {
  allowed: boolean
  reason?: string
  elevationRequested?: boolean
  elevationId?: string
}
