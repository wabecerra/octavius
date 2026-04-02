/**
 * Auto-Compaction Middleware — detect token budget approaching,
 * summarize old messages, keep costs down.
 * Inspired by claw-code's auto-compaction pattern.
 */

import { callLLM } from '@/lib/llm-caller'
import type { CompactionConfigPayload } from './trace-types'
import { getHarnessModelConfig } from './model-config'

/** Lazy reference to policy-store to avoid circular dependency */
let _getActivePolicies: typeof import('./policy-store').getActivePolicies | null = null
function lazyGetActivePolicies() {
  if (!_getActivePolicies) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _getActivePolicies = (require('./policy-store') as typeof import('./policy-store')).getActivePolicies
  }
  return _getActivePolicies
}

export interface CompactionConfig {
  maxTokenBudget: number
  thresholdPct: number
  preserveRecentCount: number
  summaryModel: string
  summaryMaxTokens: number
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  maxTokenBudget: 100_000,
  thresholdPct: 0.80,
  preserveRecentCount: 6,
  summaryModel: '', // resolved at runtime via getHarnessModelConfig('harness-compaction')
  summaryMaxTokens: 500,
}

export interface CompactionResult {
  previousTokens: number
  compactedTokens: number
  savedTokens: number
  summaryText: string
  messagesCompacted: number
  messagesPreserved: number
}

export interface SessionTokenTracker {
  sessionKey: string
  tokenUsed: number
  messageCount: number
  lastCompactedAt?: string
  compactionCount: number
}

export class CompactionManager {
  private trackers = new Map<string, SessionTokenTracker>()
  private config: CompactionConfig

  constructor(config?: Partial<CompactionConfig>) {
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config }
  }

  recordUsage(sessionKey: string, tokens: number): void {
    let tracker = this.trackers.get(sessionKey)
    if (!tracker) {
      tracker = { sessionKey, tokenUsed: 0, messageCount: 0, compactionCount: 0 }
      this.trackers.set(sessionKey, tracker)
    }
    tracker.tokenUsed += tokens
    tracker.messageCount++
  }

  shouldCompact(sessionKey: string): boolean {
    const tracker = this.trackers.get(sessionKey)
    if (!tracker) return false
    return tracker.tokenUsed >= this.config.maxTokenBudget * this.config.thresholdPct
  }

  async compact(
    sessionKey: string,
    messages: Array<{ role: string; content: string; timestamp: string }>,
  ): Promise<CompactionResult> {
    const tracker = this.trackers.get(sessionKey)
    const previousTokens = tracker?.tokenUsed ?? 0

    // Split messages: old to summarize, recent to keep
    const preserveCount = Math.min(this.config.preserveRecentCount, messages.length)
    const toSummarize = messages.slice(0, messages.length - preserveCount)
    const toPreserve = messages.slice(messages.length - preserveCount)

    if (toSummarize.length === 0) {
      return {
        previousTokens,
        compactedTokens: previousTokens,
        savedTokens: 0,
        summaryText: '',
        messagesCompacted: 0,
        messagesPreserved: toPreserve.length,
      }
    }

    // Build summarization prompt
    const conversationText = toSummarize
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n')

    let summaryText: string
    try {
      // callLLM signature: callLLM(messages, { model, maxTokens, ... }) => Promise<LLMCallResult>
      const result = await callLLM(
        [
          {
            role: 'system',
            content: 'You are a conversation summarizer. Produce a concise summary of the conversation below, preserving key decisions, facts, and action items. Keep it under 200 words.',
          },
          {
            role: 'user',
            content: conversationText,
          },
        ],
        {
          model: this.config.summaryModel || getHarnessModelConfig('harness-compaction').model,
          maxTokens: this.config.summaryMaxTokens,
          label: 'harness-compaction',
        },
      )
      summaryText = result.text ?? ''
    } catch {
      // Fallback: truncate instead of summarize
      summaryText = `[Compacted ${toSummarize.length} messages. Key topics: ${
        toSummarize.slice(0, 3).map(m => m.content.slice(0, 50)).join('; ')
      }...]`
    }

    const compactedTokens = Math.ceil(summaryText.length / 4) +
      toPreserve.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)

    // Update tracker
    if (tracker) {
      tracker.tokenUsed = compactedTokens
      tracker.lastCompactedAt = new Date().toISOString()
      tracker.compactionCount++
    }

    return {
      previousTokens,
      compactedTokens,
      savedTokens: previousTokens - compactedTokens,
      summaryText,
      messagesCompacted: toSummarize.length,
      messagesPreserved: toPreserve.length,
    }
  }

  getTracker(sessionKey: string): SessionTokenTracker | undefined {
    return this.trackers.get(sessionKey)
  }

  getConfig(): CompactionConfig {
    return { ...this.config }
  }
}

// Singleton
let managerInstance: CompactionManager | undefined

export function getCompactionManager(): CompactionManager {
  if (!managerInstance) {
    const overrides: Partial<CompactionConfig> = {}
    const policies = lazyGetActivePolicies()('compaction_config')
    if (policies.length > 0) {
      const payload = policies[0].payload as CompactionConfigPayload
      if (payload.thresholdPct !== undefined) overrides.thresholdPct = payload.thresholdPct
      if (payload.preserveRecentCount !== undefined) overrides.preserveRecentCount = payload.preserveRecentCount
      if (payload.summaryModel !== undefined) overrides.summaryModel = payload.summaryModel
    }
    managerInstance = new CompactionManager(overrides)
  }
  return managerInstance
}

/** Reset singleton so next call picks up fresh policy values */
export function resetCompactionManager(): void {
  managerInstance = undefined
}
