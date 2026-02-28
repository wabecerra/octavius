/**
 * GatewayClient — connection lifecycle, health polling, token management,
 * and event emission for the local OpenClaw gateway.
 *
 * Requirements: 1.1–1.5, 2.1–2.6, 3.2–3.4
 */
import { EventEmitter } from 'events'
import type { GatewayStatus, GatewayClientConfig, GatewayEvents } from './types'

const DEFAULT_CONFIG: GatewayClientConfig = {
  address: 'localhost',
  port: 18789,
  healthCheckIntervalMs: 30_000,
  reconnectIntervalMs: 60_000,
  maxConsecutiveFailures: 3,
}

/** Injectable fetch so tests can stub network calls */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export class GatewayClient extends EventEmitter {
  private status: GatewayStatus = 'unknown'
  private consecutiveFailures = 0
  private lastHealthyAt: string | null = null
  private connectedAt: string | null = null
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setInterval> | null = null
  private token: string | null = null
  private config: GatewayClientConfig
  private fetchFn: FetchFn

  constructor(config?: Partial<GatewayClientConfig>, fetchFn?: FetchFn) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis)
  }

  // ── Public API ──────────────────────────────────────────────

  /** Attempt initial connection to the gateway. */
  async connect(): Promise<boolean> {
    const ok = await this.performHealthCheck()
    if (ok) {
      const ts = new Date().toISOString()
      this.connectedAt = ts
      this.consecutiveFailures = 0
      this.setStatus('connected')
      this.emit('gateway_connected', ts)
      this.startHealthCheckLoop()
      return true
    }
    this.setStatus('disconnected')
    this.startReconnectLoop()
    return false
  }

  /** Disconnect and stop all timers. */
  disconnect(): void {
    this.stopHealthCheckLoop()
    this.stopReconnectLoop()
    if (this.status !== 'disconnected') {
      this.setStatus('disconnected')
      this.emit('gateway_disconnected', new Date().toISOString())
    }
    this.connectedAt = null
  }

  /** Update gateway address/port; triggers reconnect. */
  async updateAddress(address: string, port: number): Promise<void> {
    this.disconnect()
    this.config.address = address
    this.config.port = port
    await this.connect()
  }

  /** Set the auth token (already decrypted) for subsequent requests. */
  setToken(token: string): void {
    this.token = token
  }

  /** Get current connection status. */
  getStatus(): GatewayStatus {
    return this.status
  }

  /** Get connection metadata. */
  getConnectionInfo(): {
    status: GatewayStatus
    address: string
    port: number
    connectedAt: string | null
    lastHealthyAt: string | null
    consecutiveFailures: number
  } {
    return {
      status: this.status,
      address: this.config.address,
      port: this.config.port,
      connectedAt: this.connectedAt,
      lastHealthyAt: this.lastHealthyAt,
      consecutiveFailures: this.consecutiveFailures,
    }
  }

  /** Make an authenticated request to the gateway. */
  async request(path: string, options?: RequestInit): Promise<Response> {
    const url = `http://${this.config.address}:${this.config.port}${path}`
    const headers = new Headers(options?.headers)
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }

    const res = await this.fetchFn(url, { ...options, headers })

    // 401 → immediate disconnect (Req 3.3)
    if (res.status === 401) {
      this.stopHealthCheckLoop()
      this.setStatus('disconnected')
      this.emit('gateway_disconnected', new Date().toISOString())
      this.startReconnectLoop()
    }

    return res
  }

  /** Validate a token against the gateway without persisting it. */
  async validateToken(token: string): Promise<boolean> {
    try {
      const url = `http://${this.config.address}:${this.config.port}/api/health`
      const res = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.ok
    } catch {
      return false
    }
  }

  // ── Private helpers ─────────────────────────────────────────

  /** Ping the gateway health endpoint. */
  private async performHealthCheck(): Promise<boolean> {
    try {
      const url = `http://${this.config.address}:${this.config.port}/api/health`
      const headers: Record<string, string> = {}
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`
      }
      const res = await this.fetchFn(url, { headers })
      return res.ok
    } catch {
      return false
    }
  }

  /** Start the periodic health check loop (runs while connected). */
  private startHealthCheckLoop(): void {
    this.stopHealthCheckLoop()
    this.healthCheckTimer = setInterval(async () => {
      const ok = await this.performHealthCheck()
      const ts = new Date().toISOString()
      this.emit('health_check', ok, ts)

      if (ok) {
        this.lastHealthyAt = ts
        this.consecutiveFailures = 0
        return
      }

      this.consecutiveFailures++
      if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        // 3-strike disconnect (Req 2.4)
        this.stopHealthCheckLoop()
        this.connectedAt = null
        this.setStatus('disconnected')
        this.emit('gateway_disconnected', ts)
        this.startReconnectLoop()
      }
    }, this.config.healthCheckIntervalMs)
  }

  /** Stop the health check loop. */
  private stopHealthCheckLoop(): void {
    if (this.healthCheckTimer !== null) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /** Start the periodic reconnect loop (runs while disconnected). */
  private startReconnectLoop(): void {
    this.stopReconnectLoop()
    this.reconnectTimer = setInterval(async () => {
      const ok = await this.performHealthCheck()
      if (ok) {
        this.stopReconnectLoop()
        const ts = new Date().toISOString()
        this.connectedAt = ts
        this.lastHealthyAt = ts
        this.consecutiveFailures = 0
        this.setStatus('connected')
        this.emit('gateway_reconnected', ts)
        this.startHealthCheckLoop()
      }
    }, this.config.reconnectIntervalMs)
  }

  /** Stop the reconnect loop. */
  private stopReconnectLoop(): void {
    if (this.reconnectTimer !== null) {
      clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /** Transition status and emit status_changed event. */
  private setStatus(newStatus: GatewayStatus): void {
    const previous = this.status
    if (newStatus === previous) return
    this.status = newStatus
    this.emit('status_changed', newStatus, previous)
  }
}
