import { callLLM } from '@/lib/llm-caller'
import type { Learning, ResearchConfig } from './types'

interface EvalResult {
  sufficient: boolean
  reason: string
  newGaps: string[]
}

export async function evaluateCompleteness(
  question: string,
  learnings: Learning[],
  gaps: string[],
  tokenUsage: number,
  config: ResearchConfig,
): Promise<EvalResult> {
  if (tokenUsage >= config.tokenBudget * 0.85) {
    return { sufficient: true, reason: 'Token budget nearly exhausted', newGaps: [] }
  }

  if (learnings.length < 5) {
    return { sufficient: false, reason: 'Not enough data yet', newGaps: gaps }
  }

  const result = await callLLM(
    [
      {
        role: 'system',
        content: 'Evaluate research completeness. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `Question: "${question}"

Learnings (${learnings.length}):
${learnings.map(l => `- [${l.confidence}] ${l.fact}`).join('\n')}

Gaps: ${gaps.join(', ') || 'none identified'}

Return JSON: { "sufficient": true/false, "reason": "why", "newGaps": ["gaps"] }`,
      },
    ],
    { model: config.model, provider: 'openrouter', maxTokens: 512, temperature: 0.2, label: 'deep-research-evaluator' },
  )

  try {
    return JSON.parse(result.text)
  } catch {
    return { sufficient: false, reason: 'Parse error in evaluation', newGaps: [] }
  }
}
