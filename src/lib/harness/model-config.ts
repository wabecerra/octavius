/**
 * Centralized model configuration for harness modules.
 *
 * Reads from `agent_model_config` table first, falls back to env vars,
 * then to sensible defaults from the centralized model registry.
 *
 * In production with OpenClaw/OpenRouter, these models will route through
 * the configured provider. In dev with Bedrock, they use Bedrock directly.
 */

import { getDatabase } from '@/lib/memory/db'
import { ROLE_DEFAULTS, type ModelRole, getDefaultModelForRole } from '@/lib/models'

export interface ModelConfig {
  provider: string
  model: string
}

/**
 * Environment-aware defaults.
 * When OPENCLAW_PROVIDER=openrouter (production), use OpenRouter model IDs.
 * When on Bedrock (dev/free), use Bedrock model IDs.
 */
function getDefaultProvider(): string {
  return process.env.OPENCLAW_PROVIDER || process.env.DEFAULT_LLM_PROVIDER || 'bedrock'
}

/** Agent ID → role mapping for harness internal agents */
const HARNESS_AGENT_ROLES: Record<string, ModelRole> = {
  'harness-proposer': 'workhorse',
  'harness-compaction': 'lightweight',
  'octavius-chat': 'workhorse',
}

/**
 * Get model config for a harness agent, checking DB → env → defaults.
 * This is the single source of truth for all harness LLM calls.
 */
export function getHarnessModelConfig(agentId: string): ModelConfig {
  // 1. Check database (user may have configured via Settings UI)
  try {
    const db = getDatabase()
    const row = db.prepare(
      'SELECT provider, model FROM agent_model_config WHERE agent_id = ?',
    ).get(agentId) as ModelConfig | undefined
    if (row) return row
  } catch {
    // DB not available — use defaults
  }

  // 2. Check env var override (e.g., HARNESS_PROPOSER_MODEL=anthropic/claude-opus-4.6)
  const envKey = `${agentId.replace(/-/g, '_').toUpperCase()}_MODEL`
  const envModel = process.env[envKey]
  if (envModel) {
    return { provider: getDefaultProvider(), model: envModel }
  }

  // 3. Fall back to role-based defaults from centralized registry
  const provider = getDefaultProvider()
  const role = HARNESS_AGENT_ROLES[agentId] || 'workhorse'
  const model = getDefaultModelForRole(role, provider)
  return { provider, model }
}
