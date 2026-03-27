import { callLLM } from '@/lib/llm-caller'
import type { Learning, ResearchConfig } from './types'

export async function generateReport(
  question: string,
  learnings: Learning[],
  sources: string[],
  config: ResearchConfig,
): Promise<string> {
  const unique = Array.from(new Map(learnings.map(l => [l.fact, l])).values())

  const byTopic = new Map<string, Learning[]>()
  for (const l of unique) {
    const topic = l.topic || 'general'
    if (!byTopic.has(topic)) byTopic.set(topic, [])
    byTopic.get(topic)!.push(l)
  }

  const structured = Array.from(byTopic.entries())
    .map(([topic, items]) =>
      `### ${topic}\n${items.map(l => `- ${l.fact} (confidence: ${l.confidence})`).join('\n')}`,
    ).join('\n\n')

  const uniqueSources = [...new Set(sources)]
  const synthesisModel = config.synthesisModel || config.model

  const result = await callLLM(
    [
      {
        role: 'system',
        content: `You are an expert research report writer. Write a comprehensive, well-structured
markdown report that synthesizes all findings. Include an executive summary, detailed analysis
organized by theme, actionable recommendations, and a sources section. Target 2000-4000 words.`,
      },
      {
        role: 'user',
        content: `Write a comprehensive research report answering: "${question}"

Research findings by topic:
${structured}

Sources:
${uniqueSources.map((u, i) => `[${i + 1}] ${u}`).join('\n')}`,
      },
    ],
    { model: synthesisModel, provider: 'openrouter', maxTokens: 4096, temperature: 0.4, label: 'deep-research-synthesizer' },
  )

  return result.text
}
