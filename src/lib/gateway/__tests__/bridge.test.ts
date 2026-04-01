/**
 * Tests for GatewayBridge singleton
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import WebSocket from 'ws'
import type { GatewayFrame } from '@/lib/town/ws-gateway'
import { GatewayBridge, getGatewayBridge } from '../bridge'
import { AgentEventType } from '../bridge-events'

// Mock WebSocket
vi.mock('ws', () => {
  const MockWebSocket = vi.fn(function(this: any, url: string) {
    this.url = url
    this.readyState = 1 // OPEN
    this.send = vi.fn()
    this.close = vi.fn()
    this.ping = vi.fn()
    this.on = vi.fn()
    this.once = vi.fn()
    this.off = vi.fn()
    this.removeListener = vi.fn()
    this.removeAllListeners = vi.fn()
    // Store instance for test access
    MockWebSocket._lastInstance = this
    return this
  })

  MockWebSocket.CONNECTING = 0
  MockWebSocket.OPEN = 1
  MockWebSocket.CLOSING = 2
  MockWebSocket.CLOSED = 3

  return { default: MockWebSocket }
})

describe('GatewayBridge', () => {
  let bridge: GatewayBridge

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton between tests
    ;(getGatewayBridge as any)._instance = undefined
  })

  afterEach(() => {
    if (bridge) {
      bridge.destroy()
    }
  })

  describe('constructor and status', () => {
    it('starts in UNKNOWN status', () => {
      bridge = new GatewayBridge()
      expect(bridge.status).toBe('UNKNOWN')
    })

    it('transitions to CONNECTING on connect()', () => {
      bridge = new GatewayBridge()
      bridge.connect()
      expect(bridge.status).toBe('CONNECTING')
    })
  })

  describe('singleton', () => {
    it('getGatewayBridge returns same instance', () => {
      const bridge1 = getGatewayBridge()
      const bridge2 = getGatewayBridge()
      expect(bridge1).toBe(bridge2)
    })

    it('getGatewayBridge creates new instance if none exists', () => {
      const bridge1 = getGatewayBridge()
      expect(bridge1).toBeInstanceOf(GatewayBridge)
    })
  })

  describe('fleet state', () => {
    it('getFleetState returns empty map initially', () => {
      bridge = new GatewayBridge()
      const fleet = bridge.getFleetState()
      expect(fleet).toBeInstanceOf(Map)
      expect(fleet.size).toBe(0)
    })

    it('getFleetSnapshot returns empty array initially', () => {
      bridge = new GatewayBridge()
      const snapshot = bridge.getFleetSnapshot()
      expect(Array.isArray(snapshot)).toBe(true)
      expect(snapshot.length).toBe(0)
    })

    it('tracks agent state from events', async () => {
      bridge = new GatewayBridge()

      const eventPromise = new Promise<void>((resolve) => {
        bridge.on('agent-event', (event: any) => {
          if (event.type === AgentEventType.STARTED) {
            const fleet = bridge.getFleetState()
            const snapshot = bridge.getFleetSnapshot()

            // Should have one agent in running state
            expect(snapshot.length).toBeGreaterThan(0)
            const agent = snapshot[0]
            expect(agent.status).toBe('running')
            resolve()
          }
        })
      })

      bridge.connect()

      // Simulate agent started event
      const ws = (WebSocket as any)._lastInstance
      if (ws && ws.on) {
        const messageHandler = ws.on.mock.calls.find((call: any) => call[0] === 'message')?.[1]
        if (messageHandler) {
          const frame: GatewayFrame = {
            type: 'event',
            event: 'agent',
            payload: {
              sessionKey: 'agent:main',
              runId: 'run-123',
              phase: 'start',
            },
          }
          messageHandler(Buffer.from(JSON.stringify(frame)))
        }
      }

      await eventPromise
    })
  })

  describe('queue and running state', () => {
    it('queueLength returns 0 initially', () => {
      bridge = new GatewayBridge()
      expect(bridge.queueLength).toBe(0)
    })

    it('isRunning returns false when no agents running', () => {
      bridge = new GatewayBridge()
      expect(bridge.isRunning).toBe(false)
    })
  })

  describe('destroy', () => {
    it('cleans up resources', () => {
      bridge = new GatewayBridge()
      bridge.connect()

      const ws = (WebSocket as any)._lastInstance
      expect(ws).toBeDefined()

      bridge.destroy()
      expect(bridge.status).toBe('DISCONNECTED')
      expect(ws.close).toHaveBeenCalled()
    })

    it('can be called multiple times safely', () => {
      bridge = new GatewayBridge()
      bridge.connect()

      bridge.destroy()
      expect(() => bridge.destroy()).not.toThrow()
    })
  })

  describe('request method', () => {
    it('throws when not connected', async () => {
      bridge = new GatewayBridge()
      await expect(bridge.request('test.method')).rejects.toThrow()
    })
  })

  describe('configuration', () => {
    it('uses provided host and port', () => {
      bridge = new GatewayBridge({ host: 'example.com', port: 9999 })
      bridge.connect()

      const ws = (WebSocket as any)._lastInstance
      expect(ws.url).toContain('example.com:9999')
    })

    it('uses default host and port from env or fallback', () => {
      bridge = new GatewayBridge()
      bridge.connect()

      const ws = (WebSocket as any)._lastInstance
      expect(ws.url).toBeDefined()
    })
  })
})
