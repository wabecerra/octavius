import { callLLM } from '@/lib/llm-caller'
import type { Learning, SearchResult, ResearchConfig } from './types'

interface ExtractionResult {
  learnings: Learning[]
  followUpQuestions: string[]
}

export async function extractLearnings(
  originalQuestion: string,
  results: SearchResult[],
  priorLearnings: Learning[],
  config: ResearchConfig,
): Promise<ExtractionResult> {
  if (results.length === 0) return { learnings: [], followUpQuestions: [] }

  const combinedContent = results
    .map(r => `## Source: ${r.url}\n${(r.content || r.snippet).slice(0, 3000)}`)
    .join('\n\n---\n\n')

  const priorContext = priorLearnings.length > 0
    ? `\n\nAlready known (do NOT repeat):\n${priorLearnings.map(l => `- ${l.fact}`).join('\n')}`
    : ''

  const result = await callLLM(
    [
      {
        role: 'system',
        content: `You are a research analyst. Extract key factual learnings from search results.
Focus on: specific facts, numbers, dates, named entities, relationships, mechanisms.
Do NOT repeat already-known information. Generate follow-up questions for gaps.
Return valid JSON only.`,
      },
      {
        role: 'user',
        content: `Research question: "${originalQuestion}"${priorContext}

Search results:
${combinedContent}

Return JSON:
{
  "learnings": [{ "fact": "concise factual statement", "confidence": 0.0-1.0, "topic": "subtopic" }],
  "followUpQuestions": ["question that fills a gap in understanding"]
}`,
      },
    ],
    { model: config.model, provider: 'openrouter', maxTokens: 1024, temperature: 0.3, label: 'deep-research-extractor' },
  )

  try {
    const parsed = JSON.parse(result.text)
    return {
      learnings: (parsed.learnings || []).map((l: { fact: string; confidence: number; topic: string }) => ({
        ...l,
        source: results[0]?.url ?? 'unknown',
      })),
      followUpQuestions: parsed.followUpQuestions || [],
    }
  } catch {
    return { learnings: [], followUpQuestions: [] }
  }
}
