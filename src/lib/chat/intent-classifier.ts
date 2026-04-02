/**
 * Intent classifier for Octavius conversational interface.
 *
 * Uses LLM function calling to determine if a user message is:
 * - An actionable task (research, build, plan, etc.) → create_task
 * - A conversational message (question, advice, chat) → respond
 *
 * Reuses the existing LLM caller with fallback chain (OpenRouter → Bedrock → free).
 */
import { callLLM } from '@/lib/llm-caller'
import { getChatFallbackModel } from '@/lib/models'

export interface TaskIntent {
  title: string
  description: string
  quadrant: string
  priority: string
}

export interface IntentResult {
  intent: 'create_task' | 'respond'
  task?: TaskIntent
  response?: string
}

const INTENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description: 'Create a new task when the user wants something done — research, build, write, analyze, schedule, track, or any actionable request. Use this when the user is asking you to DO something, not just answer a question.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short task title (under 80 chars). Action-oriented, e.g. "Research AI impact on mental health"',
          },
          description: {
            type: 'string',
            description: 'Detailed description of what needs to be done, including any specifics the user mentioned.',
          },
          quadrant: {
            type: 'string',
            enum: ['industry', 'lifeforce', 'fellowship', 'essence'],
            description: 'Life quadrant: industry (work/career/projects), lifeforce (health/fitness/wellness), fellowship (relationships/social), essence (purpose/creativity/values)',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Task priority based on urgency/importance signals in the message',
          },
        },
        required: ['title', 'description', 'quadrant', 'priority'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'respond',
      description: 'Respond directly to the user when they are asking a question, having a conversation, want advice, or when no actionable task is needed.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Your conversational response to the user. Be concise, helpful, and actionable.',
          },
        },
        required: ['message'],
      },
    },
  },
]

const SYSTEM_PROMPT = `You are Octavius, a Life OS assistant. You help the user manage their life across four quadrants:
- **Lifeforce**: Health, fitness, nutrition, sleep, energy
- **Industry**: Work, career, projects, productivity
- **Fellowship**: Relationships, social connections, community
- **Essence**: Purpose, values, creativity, personal growth

You MUST call exactly one tool for every message:
- Call **create_task** when the user wants something DONE — research, build, write, plan, schedule, analyze, track, investigate, create, set up, or any actionable work. Even vague requests like "look into X" or "help me with Y project" should become tasks.
- Call **respond** for questions, advice, conversation, check-ins, or when no actionable work is needed.

When in doubt between a task and a response, lean toward creating a task — the user can always dismiss it, but a missed task means dropped work.`

/**
 * Classify user intent: is this an actionable task or a conversational message?
 * Uses LLM function calling to make the determination.
 * Reuses getChatModelConfig from chat route (passed in by caller) to avoid duplication.
 */
export async function classifyIntent(
  message: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  modelConfig?: { provider: string; model: string },
): Promise<IntentResult> {
  const config = modelConfig || getChatFallbackModel()

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...(history || []).map(h => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: message },
  ]

  const result = await callLLM(messages, {
    model: config.model,
    provider: config.provider,
    maxTokens: 1024,
    temperature: 0.3,
    label: 'octavius-intent',
    tools: INTENT_TOOLS,
  })

  // Parse tool calls
  if (result.toolCalls && result.toolCalls.length > 0) {
    const toolCall = result.toolCalls[0]
    try {
      const args = JSON.parse(toolCall.function.arguments)

      if (toolCall.function.name === 'create_task') {
        return {
          intent: 'create_task',
          task: {
            title: args.title,
            description: args.description,
            quadrant: args.quadrant || 'industry',
            priority: args.priority || 'medium',
          },
        }
      }

      if (toolCall.function.name === 'respond') {
        return {
          intent: 'respond',
          response: args.message,
        }
      }
    } catch {
      // JSON parse failed — fall through to text response
    }
  }

  // Fallback: treat raw text as a response
  return {
    intent: 'respond',
    response: result.text || 'I\'m not sure how to help with that. Could you rephrase?',
  }
}
