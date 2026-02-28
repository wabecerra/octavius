import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { useOctaviusStore, defaultState } from './index'
import { defaultGatewayState } from './gateway'
import type { ChatMessage } from '@/lib/gateway/types'

/** Arbitrary for a single ChatMessage */
const chatMessageArb: fc.Arbitrary<ChatMessage> = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom('user', 'assistant', 'system') as fc.Arbitrary<
    'user' | 'assistant' | 'system'
  >,
  content: fc.string({ minLength: 1, maxLength: 200 }),
  agentId: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  timestamp: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true })
    .map((d) => d.toISOString()),
})

describe('Feature: openclaw-gateway-integration, Property 16: Chat Message Cap', () => {
  beforeEach(() => {
    useOctaviusStore.setState({ ...defaultState, ...defaultGatewayState })
  })

  /**
   * **Validates: Requirements 8.6**
   *
   * For any sequence of messages added to the Zustand chat store, the
   * `chatMessages` array SHALL never exceed 100 entries. When a new message
   * would exceed the cap, the oldest message SHALL be removed first.
   */
  it('chatMessages never exceeds 100 entries and preserves most recent messages (FIFO eviction)', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 1, maxLength: 200 }),
        (messages) => {
          // Reset store
          useOctaviusStore.setState({ ...defaultState, ...defaultGatewayState })

          for (let i = 0; i < messages.length; i++) {
            useOctaviusStore.getState().addChatMessage(messages[i])
            const { chatMessages } = useOctaviusStore.getState()

            // Invariant: never exceeds 100
            expect(chatMessages.length).toBeLessThanOrEqual(100)

            // Length should be min(i+1, 100)
            expect(chatMessages.length).toBe(Math.min(i + 1, 100))
          }

          // After all messages added, verify the most recent messages are preserved
          const { chatMessages } = useOctaviusStore.getState()
          const expectedCount = Math.min(messages.length, 100)
          expect(chatMessages.length).toBe(expectedCount)

          // The stored messages should be the last `expectedCount` messages (FIFO eviction)
          const expectedMessages = messages.slice(-expectedCount)
          for (let j = 0; j < expectedCount; j++) {
            expect(chatMessages[j].id).toBe(expectedMessages[j].id)
            expect(chatMessages[j].content).toBe(expectedMessages[j].content)
            expect(chatMessages[j].role).toBe(expectedMessages[j].role)
            expect(chatMessages[j].timestamp).toBe(expectedMessages[j].timestamp)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('Feature: openclaw-gateway-integration, Property 17: Chat Message Format', () => {
  /** Arbitrary for an assistant (response) ChatMessage with required fields */
  const assistantMessageArb: fc.Arbitrary<ChatMessage> = fc.record({
    id: fc.uuid(),
    role: fc.constant('assistant') as fc.Arbitrary<'assistant'>,
    content: fc.string({ minLength: 1, maxLength: 200 }),
    agentId: fc.string({ minLength: 1, maxLength: 30 }),
    timestamp: fc
      .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true })
      .map((d) => d.toISOString()),
  })

  beforeEach(() => {
    useOctaviusStore.setState({ ...defaultState, ...defaultGatewayState })
  })

  /**
   * **Validates: Requirements 8.3**
   *
   * For any response message displayed in the chat panel, the ChatMessage
   * object SHALL contain a non-empty agentId, a valid ISO 8601 timestamp,
   * and non-empty content.
   */
  it('assistant messages have non-empty agentId, valid ISO 8601 timestamp, and non-empty content', () => {
    const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/

    fc.assert(
      fc.property(assistantMessageArb, (message) => {
        // Reset store
        useOctaviusStore.setState({ ...defaultState, ...defaultGatewayState })

        // Add the message to the store
        useOctaviusStore.getState().addChatMessage(message)

        // Retrieve the stored message
        const { chatMessages } = useOctaviusStore.getState()
        expect(chatMessages.length).toBe(1)

        const stored = chatMessages[0]

        // Non-empty agentId
        expect(stored.agentId).toBeDefined()
        expect(typeof stored.agentId).toBe('string')
        expect(stored.agentId!.length).toBeGreaterThan(0)

        // Valid ISO 8601 timestamp
        expect(stored.timestamp).toMatch(ISO_8601_RE)
        expect(Number.isNaN(Date.parse(stored.timestamp))).toBe(false)

        // Non-empty content
        expect(stored.content.length).toBeGreaterThan(0)

        // Verify the store preserves the original values
        expect(stored.agentId).toBe(message.agentId)
        expect(stored.timestamp).toBe(message.timestamp)
        expect(stored.content).toBe(message.content)
        expect(stored.role).toBe('assistant')
      }),
      { numRuns: 100 },
    )
  })
})
