import { NextResponse } from 'next/server'
import { deepResearch, type ResearchConfig } from '@/lib/deep-research'
import { registerResearch, researchTasks } from '@/lib/deep-research/store'
import { syncAgentOutput } from '@/lib/agents/output-sync'

export async function POST(request: Request) {
  const body = await request.json()
  const { query, taskId, quadrant, config: userConfig } = body

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const config: ResearchConfig = {
    maxDepth: userConfig?.maxDepth ?? 3,
    maxBreadth: userConfig?.maxBreadth ?? 4,
    tokenBudget: userConfig?.tokenBudget ?? 500_000,
    maxSearches: userConfig?.maxSearches ?? 50,
    model: userConfig?.model ?? 'qwen/qwen3.5-plus-20260216',
    synthesisModel: userConfig?.synthesisModel,
    searchProvider: 'kimi',
    quadrant,
    taskId,
  }

  // Generate ID and register BEFORE starting research (avoids race condition)
  const researchId = `dr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const initialState = registerResearch(researchId, query)

  // Start research in background — pass pre-generated ID so state.id matches
  deepResearch(query, config, (state) => {
    researchTasks.set(researchId, state)
  }, researchId).then(async (state) => {
    // Final state update
    researchTasks.set(researchId, state)
    // Sync report to KB
    if (state.report && taskId) {
      await syncAgentOutput(taskId, 'specialist-research', state.report, quadrant || 'industry')
    }
  }).catch((err) => {
    const state = researchTasks.get(researchId)
    if (state && state.status !== 'complete' && state.status !== 'error') {
      state.status = 'error'
      state.error = err instanceof Error ? err.message : String(err)
      state.completedAt = Date.now()
      researchTasks.set(researchId, state)
    }
    console.error('[research] Background research failed:', err)
  })

  // Return immediately with the pre-registered ID
  return NextResponse.json({
    researchId: initialState.id,
    status: initialState.status,
  })
}
