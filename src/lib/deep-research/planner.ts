import { callLLM } from '@/lib/llm-caller'
import type { Learning, ResearchConfig } from './types'

export async function generateQueries(
  question: string,
  count: number,
  priorLearnings: Learning[],
  config: ResearchConfig,
): Promise<string[]> {
  const learningContext = priorLearnings.length > 0
    ? `\n\nPrior research findings (use these to generate more specific, targeted queries):\n${priorLearnings.map(l => `- ${l.fact}`).join('\n')}`
    : ''

  const result = await callLLM(
    [
      {
        role: 'system',
        content: 'You are a research query planner. Generate diverse, specific search queries to thoroughly investigate the given question. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `Generate exactly ${count} search queries to research:\n\n"${question}"${learningContext}\n\nReturn JSON: { "queries": ["query1", "query2", ...] }`,
      },
    ],
    { model: config.model, provider: 'openrouter', maxTokens: 512, temperature: 0.5, label: 'deep-research-planner' },
  )

  try {
    const parsed = JSON.parse(result.text)
    return (parsed.queries || []).slice(0, count)
  } catch {
    return result.text.split('\n').filter(l => l.trim()).slice(0, count)
  }
}
