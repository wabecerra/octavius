/**
 * Harness Session Manager — creates and tracks HarnessSessions for agent runs.
 */

import { type HarnessSession, PermissionLevel } from './types'
import { resolvePermissionLevel } from './permissions'
import { resolveToolScope } from './tool-scopes'
import { DEFAULT_COMPACTION_CONFIG } from './compaction'
import { beginTrace, finalizeTrace, hasActiveTrace } from './trace-store'

const sessions = new Map<string, HarnessSession>()

/** Create a new harness session for an agent run */
export function createHarnessSession(sessionKey: string, agentId: string, agentType: string): HarnessSession {
  const session: HarnessSession = {
    sessionKey,
    agentId,
    agentType,
    permissionLevel: resolvePermissionLevel(agentType),
    toolScope: resolveToolScope(agentType),
    tokenBudget: DEFAULT_COMPACTION_CONFIG.maxTokenBudget,
    tokenUsed: 0,
    compactionCount: 0,
    createdAt: new Date().toISOString(),
  }
  sessions.set(sessionKey, session)

  beginTrace(sessionKey, agentId, agentType, {
    permissionLevel: session.permissionLevel,
    toolScope: session.toolScope,
  })

  return session
}

/** Get an existing harness session */
export function getHarnessSession(sessionKey: string): HarnessSession | undefined {
  return sessions.get(sessionKey)
}

/** Get or create a harness session */
export function getOrCreateHarnessSession(sessionKey: string, agentId: string, agentType: string): HarnessSession {
  return sessions.get(sessionKey) ?? createHarnessSession(sessionKey, agentId, agentType)
}

/** Remove a completed session */
export function removeHarnessSession(sessionKey: string): boolean {
  if (hasActiveTrace(sessionKey)) {
    finalizeTrace(sessionKey, { outcome: 'aborted', outcomeReason: 'Session removed' })
  }
  return sessions.delete(sessionKey)
}

/** Get all active sessions */
export function getActiveSessions(): HarnessSession[] {
  return Array.from(sessions.values())
}

/** Override permission level for a session */
export function setSessionPermission(sessionKey: string, level: PermissionLevel): boolean {
  const session = sessions.get(sessionKey)
  if (!session) return false
  session.permissionLevel = level
  return true
}
