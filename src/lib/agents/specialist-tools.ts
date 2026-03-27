/**
 * Tool definitions for specialist spawning via LLM function calling.
 *
 * These tools are included in agent prompts so the LLM can semantically
 * decide when to spawn specialists, rather than relying on regex pattern
 * matching against output text.
 */

export const SPECIALIST_IDS = [
  'specialist-architect',
  'specialist-coder',
  'specialist-research',
  'specialist-marketing',
  'specialist-writing',
  'specialist-video',
  'specialist-image',
  'specialist-n8n',
] as const

export type SpecialistId = typeof SPECIALIST_IDS[number]

const SPECIALIST_DESCRIPTIONS: Record<SpecialistId, string> = {
  'specialist-architect': 'System design, implementation planning, architecture decisions. Produces specs and step-by-step implementation plans.',
  'specialist-coder': 'Code implementation, debugging, testing. Executes implementation plans produced by the architect.',
  'specialist-research': 'Deep research with iterative web search, fact extraction, and comprehensive report synthesis.',
  'specialist-marketing': 'Market analysis, positioning strategy, competitive research, go-to-market planning.',
  'specialist-writing': 'Content creation, copywriting, documentation, blog posts, communication drafts.',
  'specialist-video': 'Video content planning, scripting, storyboarding, production guidance.',
  'specialist-image': 'Image generation prompts, visual design guidance, brand asset creation.',
  'specialist-n8n': 'Workflow automation design and implementation using N8N platform.',
}

export interface SpawnRequest {
  specialistId: SpecialistId
  instruction: string
}

/**
 * Returns OpenAI-compatible tool definitions for specialist spawning.
 * Include these in the `tools` array when calling the LLM.
 */
export function getSpecialistTools(): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}> {
  return [
    {
      type: 'function',
      function: {
        name: 'spawn_specialist',
        description: 'Spawn a specialist agent to handle a sub-task that requires domain expertise. The specialist will work on the task and append its output. Use this when the task needs skills beyond your generalist capabilities.',
        parameters: {
          type: 'object',
          properties: {
            specialist_id: {
              type: 'string',
              enum: [...SPECIALIST_IDS],
              description: `The specialist to spawn. Available:\n${
                SPECIALIST_IDS.map(id => `- ${id}: ${SPECIALIST_DESCRIPTIONS[id]}`).join('\n')
              }`,
            },
            instruction: {
              type: 'string',
              description: 'Detailed instruction for the specialist. Be specific about what you need, what format, and what context they should use.',
            },
          },
          required: ['specialist_id', 'instruction'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'discover_specialists',
        description: 'List all available specialist agents with their capabilities. Call this if you are unsure which specialist to use.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional natural language query to filter specialists by relevance.',
            },
          },
        },
      },
    },
  ]
}

/**
 * Parse tool_calls from LLM response to extract spawn requests.
 */
export function parseToolCalls(
  toolCalls: Array<{ function: { name: string; arguments: string } }>,
): SpawnRequest[] {
  const requests: SpawnRequest[] = []

  for (const call of toolCalls) {
    if (call.function.name === 'spawn_specialist') {
      try {
        const args = JSON.parse(call.function.arguments)
        if (
          SPECIALIST_IDS.includes(args.specialist_id) &&
          typeof args.instruction === 'string'
        ) {
          requests.push({
            specialistId: args.specialist_id,
            instruction: args.instruction,
          })
        }
      } catch { /* skip malformed */ }
    }
  }

  return requests
}

/**
 * Handle discover_specialists tool call — returns specialist info as text.
 */
export function handleDiscoverSpecialists(query?: string): string {
  let specialists = SPECIALIST_IDS.map(id => ({
    id,
    description: SPECIALIST_DESCRIPTIONS[id],
  }))

  if (query) {
    const lower = query.toLowerCase()
    specialists = specialists.filter(s =>
      s.id.includes(lower) || s.description.toLowerCase().includes(lower)
    )
  }

  return specialists.map(s => `**${s.id}**: ${s.description}`).join('\n\n')
}
