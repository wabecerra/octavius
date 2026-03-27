/**
 * Sync agent output to the memory/KB system after task completion.
 *
 * Creates a semantic memory item with agent provenance so future agents
 * can discover prior work via context retrieval.
 */

const OCTAVIUS_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
const MIN_OUTPUT_LENGTH = 50

/**
 * Store agent output as a memory item in the KB.
 * Non-throwing — failures are logged but don't block the dispatch response.
 */
export async function syncAgentOutput(
  taskId: string,
  agentId: string,
  output: string,
  quadrant: string,
): Promise<void> {
  if (!output || output.length < MIN_OUTPUT_LENGTH) return

  try {
    const summaryMatch = output.match(/^#\s+(.+)/m)
    const summary = summaryMatch?.[1]?.slice(0, 200) || output.slice(0, 200)

    const memoryItem = {
      text: output,
      type: 'semantic' as const,
      layer: 'daily_notes' as const,
      tags: [
        `quadrant:${quadrant}`,
        `task:${taskId}`,
        `agent:${agentId}`,
      ],
      importance: 0.7,
      confidence: 0.8,
      provenance: {
        source_type: 'agent_output',
        source_id: taskId,
        agent_id: agentId,
      },
    }

    const res = await fetch(`${OCTAVIUS_BASE_URL}/api/memory/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memoryItem),
    })

    if (!res.ok) {
      console.warn(`[output-sync] KB write failed (${res.status}):`, await res.text().catch(() => ''))
    } else {
      console.log(`[output-sync] Stored agent output for task=${taskId}, agent=${agentId}, summary="${summary.slice(0, 60)}..."`)
    }
  } catch (err) {
    console.warn(`[output-sync] Failed to sync output:`, (err as Error).message)
  }
}
