/**
 * GatewayBridge: Server-side WebSocket client singleton for OpenClaw gateway
 * Maintains persistent connection, handles RPC, tracks fleet state, auto-reconnects
 */

import WebSocket from 'ws'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type { GatewayFrame } from '@/lib/town/ws-gateway'
import {
  type AgentEvent,
  type BridgeStatus,
  type FleetAgentState,
  AgentEventType,
  translateGatewayEvent,
  sessionKeyToAgentId,
} from './bridge-events'

// Constants
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const HEALTH_INTERVAL_MS = 30_000
const HANDSHAKE_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 30_000
const MAX_HEALTH_FAILURES = 3
const SPECIALIST_COOLDOWN_MS = 10_000
const GENERALIST_COOLDOWN_MS = 4_000

interface BridgeConfig {
  host?: string
  port?: number
  token?: string
}

interface PendingRequest {
  resolve: (frame: GatewayFrame) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export class GatewayBridge extends EventEmitter {
  private ws: WebSocket | null = null
  private config: Required<BridgeConfig>
  private _status: BridgeStatus = 'UNKNOWN'
  private pending = new Map<string, PendingRequest>()
  private fleet = new Map<string, FleetAgentState>()
  private cooldownTimers = new Set<NodeJS.Timeout>()
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private healthTimer: NodeJS.Timeout | null = null
  private healthFailures = 0
  private handshakeTimer: NodeJS.Timeout | null = null
  private intentionalDisconnect = false
  private destroyed = false

  constructor(config: BridgeConfig = {}) {
    super()
    this.config = {
      host: config.host ?? process.env.OPENCLAW_HOST ?? 'localhost',
      port: config.port ?? Number(process.env.OPENCLAW_PORT ?? 18789),
      token: config.token ?? process.env.OPENCLAW_TOKEN ?? 'openclaw-local-dev',
    }
  }

  get status(): BridgeStatus {
    return this._status
  }

  get queueLength(): number {
    return Array.from(this.fleet.values()).filter((a) => a.status === 'running').length
  }

  get isRunning(): boolean {
    return this.queueLength > 0
  }

  getFleetState(): Map<string, FleetAgentState> {
    return new Map(this.fleet)
  }

  getFleetSnapshot(): FleetAgentState[] {
    return Array.from(this.fleet.values())
  }

  connect(): void {
    if (this.destroyed) throw new Error('Bridge is destroyed')
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return // Already connecting/connected
    }

    this.intentionalDisconnect = false
    this.setStatus('CONNECTING')
    this.connectOnce()
  }

  private connectOnce(): void {
    const url = `ws://${this.config.host}:${this.config.port}`
    this.ws = new WebSocket(url)

    this.ws.on('open', () => {
      // Wait for connect.challenge before declaring connected
    })

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const text = data.toString()
        const frame: GatewayFrame = JSON.parse(text)
        this.handleFrame(frame)
      } catch (err) {
        console.error('[Bridge] Failed to parse frame:', err)
      }
    })

    this.ws.on('error', (err) => {
      console.error('[Bridge] WebSocket error:', err)
      if (this._status !== 'AUTH_FAILED') {
        this.setStatus('DISCONNECTED')
      }
    })

    this.ws.on('close', () => {
      const wasConnected = this._status === 'CONNECTED'
      if (this._status !== 'AUTH_FAILED') {
        this.setStatus('DISCONNECTED')
      }
      this.cleanupConnection()

      if (!this.intentionalDisconnect && !this.destroyed) {
        this.scheduleReconnect(wasConnected)
      }
    })
  }

  private setStatus(status: BridgeStatus): void {
    if (this._status === status) return
    this._status = status
    this.emit('status', status)
  }

  private handleFrame(frame: GatewayFrame): void {
    // Event frames
    if (frame.type === 'event') {
      if (frame.event === 'connect.challenge') {
        this.sendHandshake()
        return
      }

      // Translate agent/chat events
      const agentEvent = translateGatewayEvent(frame)
      if (agentEvent) {
        this.updateFleetFromEvent(agentEvent)
        this.emit('agent-event', agentEvent)
      }

      // Emit raw event
      if (frame.event) {
        this.emit(`event:${frame.event}`, frame.payload)
      }
      return
    }

    // Response frames
    if (frame.type === 'res' && frame.id) {
      const pending = this.pending.get(frame.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(frame.id)

        if (frame.ok) {
          // Check for hello-ok
          if (frame.payload?.type === 'hello-ok') {
            this.onConnected()
          }
          pending.resolve(frame)
        } else {
          pending.reject(new Error(frame.error?.message ?? 'Request failed'))
        }
      }
    }
  }

  private sendHandshake(): void {
    const id = randomUUID()
    const frame: GatewayFrame = {
      type: 'req',
      id,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'octavius-bridge',
          displayName: 'Octavius Bridge',
          version: '1.0.0',
          platform: 'node',
          mode: 'rpc',
          instanceId: `brg-${Date.now()}`,
        },
        auth: { token: this.config.token },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
      },
    }

    this.handshakeTimer = setTimeout(() => {
      this.setStatus('AUTH_FAILED')
      this.disconnect()
    }, HANDSHAKE_TIMEOUT_MS)

    this.sendFrame(frame)
  }

  private onConnected(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }

    this.setStatus('CONNECTED')
    this.reconnectAttempt = 0
    this.healthFailures = 0
    this.startHealthCheck()
  }

  private startHealthCheck(): void {
    this.stopHealthCheck()
    this.healthTimer = setInterval(() => {
      this.ping().catch(() => {
        this.healthFailures++
        if (this.healthFailures >= MAX_HEALTH_FAILURES) {
          console.warn('[Bridge] Health check failed, disconnecting')
          this.disconnect()
        }
      })
    }, HEALTH_INTERVAL_MS)
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }

  private async ping(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }
    // Simple WebSocket ping
    this.ws.ping()
  }

  private scheduleReconnect(wasConnected: boolean): void {
    if (this.reconnectTimer) return

    // Reset attempt counter if we were previously connected
    if (wasConnected) {
      this.reconnectAttempt = 0
    }

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS
    )
    this.reconnectAttempt++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.intentionalDisconnect && !this.destroyed) {
        this.connectOnce()
      }
    }, delay)
  }

  private cleanupConnection(): void {
    this.stopHealthCheck()

    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }

    // Reject all pending requests
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Connection closed'))
      this.pending.delete(id)
    }

    // Remove listeners but don't null out ws (let disconnect do that)
    if (this.ws) {
      if (typeof this.ws.removeAllListeners === 'function') {
        this.ws.removeAllListeners()
      }
    }
  }

  private disconnect(): void {
    this.intentionalDisconnect = true
    this.cleanupConnection()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.setStatus('DISCONNECTED')
  }

  private sendFrame(frame: GatewayFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }
    this.ws.send(JSON.stringify(frame))
  }

  async request(method: string, params?: Record<string, unknown>, timeout = REQUEST_TIMEOUT_MS): Promise<GatewayFrame> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    const id = randomUUID()
    const frame: GatewayFrame = {
      type: 'req',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, timeout)

      this.pending.set(id, { resolve, reject, timer })
      this.sendFrame(frame)
    })
  }

  async sendAgent(opts: {
    message: string
    sessionKey?: string
    idempotencyKey?: string
    timeout?: number
  }): Promise<GatewayFrame> {
    return this.request(
      'agent',
      {
        message: opts.message,
        sessionKey: opts.sessionKey,
        idempotencyKey: opts.idempotencyKey ?? randomUUID(),
      },
      opts.timeout
    )
  }

  async call(method: string, params?: Record<string, unknown>): Promise<GatewayFrame> {
    return this.request(method, params)
  }

  private updateFleetFromEvent(event: AgentEvent): void {
    if (!event.agentId) return

    const existing = this.fleet.get(event.agentId)

    switch (event.type) {
      case AgentEventType.STARTED:
        this.fleet.set(event.agentId, {
          id: event.agentId,
          type: this.inferAgentType(event.agentId),
          status: 'running',
          currentTask: event.text,
          currentTaskId: event.taskId,
          runId: event.runId,
          sessionKey: event.sessionKey,
          spawnedAt: event.timestamp,
        })
        break

      case AgentEventType.COMPLETED:
        if (existing) {
          existing.status = 'done'
          existing.currentTask = undefined
          existing.currentTaskId = undefined

          // Schedule cooldown removal
          const isSpecialist = existing.type.includes('specialist')
          const cooldown = isSpecialist ? SPECIALIST_COOLDOWN_MS : GENERALIST_COOLDOWN_MS

          const timer = setTimeout(() => {
            this.cooldownTimers.delete(timer)
            if (isSpecialist) {
              this.fleet.delete(event.agentId!)
            } else {
              // Reset generalist to idle
              const agent = this.fleet.get(event.agentId!)
              if (agent) {
                agent.status = 'idle'
              }
            }
          }, cooldown)
          this.cooldownTimers.add(timer)
        }
        break

      case AgentEventType.FAILED:
        if (existing) {
          existing.status = 'failed'
          existing.currentTask = undefined
          existing.currentTaskId = undefined

          // Schedule cooldown removal (same as completed)
          const isSpecialist = existing.type.includes('specialist')
          const cooldown = isSpecialist ? SPECIALIST_COOLDOWN_MS : GENERALIST_COOLDOWN_MS

          const timer = setTimeout(() => {
            this.cooldownTimers.delete(timer)
            if (isSpecialist) {
              this.fleet.delete(event.agentId!)
            } else {
              const agent = this.fleet.get(event.agentId!)
              if (agent) {
                agent.status = 'idle'
              }
            }
          }, cooldown)
          this.cooldownTimers.add(timer)
        }
        break

      case AgentEventType.STREAMING:
        if (existing) {
          existing.currentTask = event.text
        }
        break
    }
  }

  private inferAgentType(agentId: string): string {
    if (agentId === 'orchestrator') return 'orchestrator'
    if (agentId.startsWith('specialist-')) return agentId.split(':')[0] ?? agentId
    return 'generalist'
  }

  destroy(): void {
    if (this.destroyed) return

    this.destroyed = true
    this.disconnect()

    // Clear all cooldown timers
    for (const timer of this.cooldownTimers) {
      clearTimeout(timer)
    }
    this.cooldownTimers.clear()

    this.fleet.clear()
    this.removeAllListeners()
  }
}

// Singleton instance
let instance: GatewayBridge | undefined

export function getGatewayBridge(config?: BridgeConfig): GatewayBridge {
  if (!instance) {
    instance = new GatewayBridge(config)
  }
  return instance
}
