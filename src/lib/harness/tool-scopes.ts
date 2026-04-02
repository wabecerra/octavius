/**
 * Tool Scopes — per-agent-type tool whitelists.
 * Each agent type gets specific tools, not the full 42+ tool set.
 * Inspired by claw-code's allowed_tools_for_subagent() pattern.
 */

import { PLUGIN_TOOL_CATEGORIES } from '@/lib/gateway/env-bootstrap'
import type { ToolScopeOverridePayload } from './trace-types'

/** Tool scope definition for an agent type */
export interface ToolScope {
  agentType: string
  allowedTools?: string[]
  allowedCategories?: string[]
  additionalTools?: string[]
  deniedTools?: string[]
}

// Category-to-tools mapping (lazy to break circular import with env-bootstrap)
let _categoryTools: Record<string, string[]> | null = null
function getCategoryTools(): Record<string, string[]> {
  if (!_categoryTools) {
    _categoryTools = {}
    for (const cat of PLUGIN_TOOL_CATEGORIES) {
      _categoryTools[cat.category.toLowerCase()] = [...cat.tools]
    }
  }
  return _categoryTools
}

export const DEFAULT_TOOL_SCOPES: Record<string, ToolScope> = {
  orchestrator: {
    agentType: 'orchestrator',
    allowedCategories: ['tasks', 'memory', 'agents', 'life os', 'system'],
    deniedTools: ['octavius_memory_consolidate', 'octavius_memory_evolve'],
  },
  generalist: {
    agentType: 'generalist',
    allowedCategories: ['tasks', 'memory', 'life os'],
    additionalTools: [
      'octavius_agents_delegate', 'octavius_chat_reply',
      'octavius_agent_status', 'octavius_discover',
      'spawn_specialist', 'discover_specialists',
    ],
  },
  'specialist-coder': {
    agentType: 'specialist-coder',
    allowedTools: [
      'octavius_tasks_list', 'octavius_task_update',
      'octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store',
      'octavius_chat_reply', 'octavius_discover',
    ],
  },
  'specialist-architect': {
    agentType: 'specialist-architect',
    allowedTools: [
      'octavius_tasks_list', 'octavius_task_create', 'octavius_task_update',
      'octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store',
      'octavius_chat_reply', 'octavius_discover',
    ],
  },
  'specialist-research': {
    agentType: 'specialist-research',
    allowedTools: [
      'octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store',
      'octavius_memory_graph_traverse', 'octavius_memory_graph_link',
      'octavius_memory_graph_export',
      'octavius_chat_reply', 'octavius_discover',
    ],
  },
  'specialist-marketing': {
    agentType: 'specialist-marketing',
    allowedTools: [
      'octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store',
      'octavius_goals_list', 'octavius_profile_get',
      'octavius_chat_reply', 'octavius_discover',
    ],
  },
  'specialist-writing': {
    agentType: 'specialist-writing',
    allowedTools: [
      'octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store',
      'octavius_journal', 'octavius_profile_get',
      'octavius_chat_reply', 'octavius_discover',
    ],
  },
  'specialist-video': {
    agentType: 'specialist-video',
    allowedTools: [
      'octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store',
      'octavius_chat_reply', 'octavius_discover',
    ],
  },
  'specialist-image': {
    agentType: 'specialist-image',
    allowedTools: [
      'octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store',
      'octavius_chat_reply', 'octavius_discover',
    ],
  },
  'specialist-n8n': {
    agentType: 'specialist-n8n',
    allowedTools: [
      'octavius_tasks_list', 'octavius_task_create', 'octavius_task_update',
      'octavius_memory_search', 'octavius_memory_context', 'octavius_memory_store',
      'octavius_chat_reply', 'octavius_discover', 'octavius_active_jobs',
    ],
  },
}

/**
 * Resolve the final tool list for a given agent type.
 * Logic: explicit allowedTools > (category tools + additional - denied)
 */
export function resolveToolScope(agentType: string): string[] {
  const scope = DEFAULT_TOOL_SCOPES[agentType] ?? DEFAULT_TOOL_SCOPES['generalist']
  if (!scope) return []

  // If explicit tool list, use it directly
  if (scope.allowedTools && scope.allowedTools.length > 0) {
    const denied = new Set(scope.deniedTools ?? [])
    const tools = new Set(scope.allowedTools.filter(t => !denied.has(t)))
    applyToolScopePolicies(agentType, tools)
    return Array.from(tools)
  }

  // Category-based resolution
  const tools = new Set<string>()
  for (const cat of (scope.allowedCategories ?? [])) {
    const catTools = getCategoryTools()[cat.toLowerCase()]
    if (catTools) {
      for (const t of catTools) tools.add(t)
    }
  }

  // Add additional tools
  for (const t of (scope.additionalTools ?? [])) {
    tools.add(t)
  }

  // Remove denied tools
  for (const t of (scope.deniedTools ?? [])) {
    tools.delete(t)
  }

  // Apply active policy overrides
  applyToolScopePolicies(agentType, tools)

  return Array.from(tools)
}

/** Lazy reference to policy-store to avoid circular dependency */
let _getActivePolicies: typeof import('./policy-store').getActivePolicies | null = null
function lazyGetActivePolicies() {
  if (!_getActivePolicies) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _getActivePolicies = (require('./policy-store') as typeof import('./policy-store')).getActivePolicies
  }
  return _getActivePolicies
}

/** Apply active tool_scope_override policies to a mutable tool set */
function applyToolScopePolicies(agentType: string, tools: Set<string>): void {
  const policies = lazyGetActivePolicies()('tool_scope_override', agentType)
  for (const policy of policies) {
    const payload = policy.payload as ToolScopeOverridePayload
    if (payload.addTools) {
      for (const t of payload.addTools) tools.add(t)
    }
    if (payload.removeTools) {
      for (const t of payload.removeTools) tools.delete(t)
    }
  }
}

/** Check if a tool is in scope for a given agent type */
export function isToolInScope(agentType: string, toolName: string): boolean {
  const scope = resolveToolScope(agentType)
  return scope.includes(toolName)
}

/**
 * Build filtered tool categories for env-bootstrap injection.
 * Returns only categories/tools the agent is allowed to use.
 */
export function buildScopedToolCategories(
  agentType: string,
  allCategories: Array<{ category: string; tools: string[] }>,
): Array<{ category: string; tools: string[] }> {
  const allowed = new Set(resolveToolScope(agentType))
  return allCategories
    .map(cat => ({
      category: cat.category,
      tools: cat.tools.filter(t => allowed.has(t)),
    }))
    .filter(cat => cat.tools.length > 0)
}
