/**
 * Centralized Model Registry — Single source of truth for all LLM model IDs.
 *
 * UPDATE MODELS HERE when upgrading. Every file in the codebase imports from
 * this module instead of hardcoding model strings.
 *
 * Architecture:
 * - OpenRouter model IDs are the canonical format (e.g. "anthropic/claude-sonnet-4.6")
 * - Bedrock IDs are derived via OPENROUTER_TO_BEDROCK mapping
 * - Agent seed configs define per-agent defaults for fresh installs
 * - UI popular models power the AgentModelSelector dropdown
 *
 * To upgrade models:
 * 1. Update the version strings in OPENROUTER_MODELS / BEDROCK_MODELS
 * 2. Update OPENROUTER_TO_BEDROCK if Bedrock IDs changed
 * 3. That's it — all consumers read from here.
 */

// ─── OpenRouter Model IDs (canonical format) ────────────────────────────────

export const OPENROUTER_MODELS = {
  // Anthropic
  CLAUDE_OPUS: 'anthropic/claude-opus-4.6',
  CLAUDE_SONNET: 'anthropic/claude-sonnet-4.6',
  CLAUDE_HAIKU: 'anthropic/claude-haiku-4.5',

  // OpenAI
  GPT_CODEX: 'openai/gpt-5.3-codex-20260224',

  // Google
  GEMINI_FLASH: 'google/gemini-2.5-flash',
  GEMINI_IMAGE: 'google/gemini-3.1-flash-image-preview-20260226',

  // Qwen (cost-effective)
  QWEN_LARGE: 'qwen/qwen3-235b-a22b-2507',
  QWEN_SMALL: 'qwen/qwen3-30b-a3b-instruct-2507',

  // Meta / routing
  AUTO: 'openrouter/auto',
  FREE: 'openrouter/free',
} as const

// ─── Bedrock Model IDs ──────────────────────────────────────────────────────

export const BEDROCK_MODELS = {
  CLAUDE_OPUS: 'amazon-bedrock/global.anthropic.claude-opus-4-6-v1',
  CLAUDE_SONNET: 'amazon-bedrock/us.anthropic.claude-sonnet-4-6-v1:0',
  CLAUDE_SONNET_PREV: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0',
  CLAUDE_HAIKU: 'amazon-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  NOVA_PRO: 'amazon.nova-pro-v1:0',
  NOVA_LITE: 'amazon.nova-lite-v1:0',
} as const

// ─── OpenRouter ↔ Bedrock Mapping (for fallback chain) ─────────────────────

export const OPENROUTER_TO_BEDROCK: Record<string, string> = {
  [OPENROUTER_MODELS.CLAUDE_OPUS]: 'global.anthropic.claude-opus-4-6-v1',
  [OPENROUTER_MODELS.CLAUDE_SONNET]: 'us.anthropic.claude-sonnet-4-6-v1:0',
  'anthropic/claude-sonnet-4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  [OPENROUTER_MODELS.CLAUDE_HAIKU]: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
}

// ─── Role-Based Defaults (per provider) ─────────────────────────────────────

export type ModelRole = 'workhorse' | 'lightweight' | 'reasoning'

export const ROLE_DEFAULTS: Record<string, Record<ModelRole, string>> = {
  bedrock: {
    workhorse: BEDROCK_MODELS.CLAUDE_SONNET_PREV,
    lightweight: BEDROCK_MODELS.CLAUDE_HAIKU,
    reasoning: BEDROCK_MODELS.CLAUDE_OPUS,
  },
  openrouter: {
    workhorse: OPENROUTER_MODELS.CLAUDE_SONNET,
    lightweight: OPENROUTER_MODELS.CLAUDE_HAIKU,
    reasoning: OPENROUTER_MODELS.CLAUDE_OPUS,
  },
}

// ─── Agent Seed Configs (for fresh DB installs) ─────────────────────────────

export const AGENT_SEED_CONFIGS: ReadonlyArray<readonly [agentId: string, provider: string, model: string]> = [
  // Generalists — cost-effective Qwen for high-volume tasks
  ['gen-industry', 'openrouter', OPENROUTER_MODELS.QWEN_LARGE],
  ['gen-lifeforce', 'openrouter', OPENROUTER_MODELS.QWEN_LARGE],
  ['gen-fellowship', 'openrouter', OPENROUTER_MODELS.QWEN_LARGE],
  ['gen-essence', 'openrouter', OPENROUTER_MODELS.QWEN_LARGE],

  // Specialists — best model for each domain
  ['specialist-architect', 'openrouter', OPENROUTER_MODELS.CLAUDE_OPUS],
  ['specialist-coder', 'openrouter', OPENROUTER_MODELS.GPT_CODEX],
  ['specialist-research', 'openrouter', OPENROUTER_MODELS.GEMINI_FLASH],
  ['specialist-marketing', 'openrouter', OPENROUTER_MODELS.QWEN_LARGE],
  ['specialist-writing', 'openrouter', OPENROUTER_MODELS.QWEN_LARGE],
  ['specialist-video', 'openrouter', OPENROUTER_MODELS.GEMINI_IMAGE],
  ['specialist-image', 'openrouter', OPENROUTER_MODELS.GEMINI_IMAGE],
  ['specialist-n8n', 'openrouter', OPENROUTER_MODELS.CLAUDE_SONNET],

  // Harness internal agents
  ['harness-proposer', 'openrouter', OPENROUTER_MODELS.CLAUDE_SONNET],
  ['harness-compaction', 'openrouter', OPENROUTER_MODELS.CLAUDE_HAIKU],
  ['octavius-chat', 'openrouter', OPENROUTER_MODELS.CLAUDE_SONNET],
]

// ─── Specialist Fallback Models (when DB has no config) ─────────────────────

export const SPECIALIST_FALLBACK_MODELS: Record<string, string> = {
  'specialist-architect': OPENROUTER_MODELS.CLAUDE_OPUS,
  'specialist-coder': OPENROUTER_MODELS.GPT_CODEX,
  'specialist-research': OPENROUTER_MODELS.GEMINI_FLASH,
  'specialist-video': OPENROUTER_MODELS.GEMINI_IMAGE,
  'specialist-image': OPENROUTER_MODELS.GEMINI_IMAGE,
  'specialist-n8n': OPENROUTER_MODELS.CLAUDE_SONNET,
}

export const DEFAULT_AGENT_MODEL = OPENROUTER_MODELS.QWEN_LARGE

// ─── Bedrock Default Configs (for agents/config API fallback) ───────────────

export const BEDROCK_AGENT_DEFAULTS: ReadonlyArray<{ agent_id: string; provider: string; model: string }> = [
  { agent_id: 'gen-lifeforce', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'gen-industry', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'gen-fellowship', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'gen-essence', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'specialist-research', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'specialist-engineering', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'specialist-marketing', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'specialist-video', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'specialist-image', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
  { agent_id: 'specialist-writing', provider: 'bedrock', model: BEDROCK_MODELS.CLAUDE_SONNET_PREV },
]

// ─── OpenRouter Tiered Defaults (for openrouter.ts) ─────────────────────────

export const OPENROUTER_TIERED = {
  cheap: OPENROUTER_MODELS.QWEN_LARGE,
  free: OPENROUTER_MODELS.FREE,
  auto: OPENROUTER_MODELS.AUTO,
  tiny: OPENROUTER_MODELS.QWEN_SMALL,
} as const

// ─── UI Popular Models (for AgentModelSelector) ─────────────────────────────

export const UI_POPULAR_MODELS: Record<string, string[]> = {
  openrouter: [
    OPENROUTER_MODELS.QWEN_LARGE,
    OPENROUTER_MODELS.QWEN_SMALL,
    OPENROUTER_MODELS.AUTO,
    OPENROUTER_MODELS.FREE,
    OPENROUTER_MODELS.CLAUDE_SONNET,
    OPENROUTER_MODELS.GEMINI_FLASH,
  ],
  bedrock: [
    'anthropic.claude-sonnet-4-20250514-v1:0',
    'anthropic.claude-haiku-4-20250514-v1:0',
    BEDROCK_MODELS.NOVA_PRO,
    BEDROCK_MODELS.NOVA_LITE,
  ],
}

// ─── Research Defaults ──────────────────────────────────────────────────────

export const RESEARCH_DEFAULT_MODEL = OPENROUTER_MODELS.QWEN_LARGE

// ─── Helper: Get provider-aware default model for a role ────────────────────

export function getDefaultModelForRole(role: ModelRole, provider?: string): string {
  const p = provider || process.env.OPENCLAW_PROVIDER || process.env.DEFAULT_LLM_PROVIDER || 'bedrock'
  const providerDefaults = ROLE_DEFAULTS[p] || ROLE_DEFAULTS.bedrock
  return providerDefaults[role]
}

// ─── Helper: Get provider-aware fallback for chat/intent ────────────────────

export function getChatFallbackModel(): { provider: string; model: string } {
  const provider = process.env.OPENCLAW_PROVIDER || process.env.DEFAULT_LLM_PROVIDER || 'bedrock'
  const model = provider === 'openrouter'
    ? OPENROUTER_MODELS.CLAUDE_SONNET
    : BEDROCK_MODELS.CLAUDE_SONNET_PREV
  return { provider, model }
}
