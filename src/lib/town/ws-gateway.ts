/**
 * WebSocket-based gateway client for real-time agent events.
 * Connects through the server.ts WS proxy at /api/ws/gateway.
 *
 * Protocol: OpenClaw frame-based RPC (req/res/event).
 */

export type WsGatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed'

export interface GatewayFrame {
  type: 'req' | 'res' | 'event'
  id?: string
  method?: string
  params?: Record<string, unknown>
  ok?: boolean
  payload?: Record<string, unknown>
  error?: { code: string; message: string }
  event?: string
}

type StatusListener = (status: WsGatewayStatus) => void
type EventListener = (payload: unknown) => void

interface PendingReq {
  resolve: (frame: GatewayFrame) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const RECONNECT_BASE = 1000
const RECONNECT_MAX = 30000
const RECONNECT_FACTOR = 2
const MAX_ATTEMPTS = 5
const HANDSHAKE_TIMEOUT = 15000
const REQUEST_TIMEOUT = 30000

let counter = 0
function nextId() { return `oct_${++counter}_${Date.now()}` }

export class WsGatewayClient {
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingReq>()
  private eventListeners = new Map<string, Set<EventListener>>()
  private statusListeners = new Set<StatusListener>()
  private _status: WsGatewayStatus = 'disconnected'
  private url: string
  private token: string
  private autoReconnect = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private connectSettled = false
  private connectReject: ((err: Error) => void) | null = null

  constructor(url?: string, token?: string) {
    const wsProto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000'
    this.url = url ?? `${wsProto}//${host}/api/ws/gateway`
    this.token = token ?? ''
  }

  get status() { return this._status }

  private setStatus(s: WsGatewayStatus) {
    this._status = s
    this.statusListeners.forEach(fn => fn(s))
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  on(event: string, fn: EventListener): () => void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set())
    this.eventListeners.get(event)!.add(fn)
    return () => this.eventListeners.get(event)?.delete(fn)
  }

  connect(): Promise<GatewayFrame> {
    this.autoReconnect = true
    this.reconnectAttempt = 0
    this.intentionalClose = false
    return this.connectOnce()
  }

  private connectOnce(): Promise<GatewayFrame> {
    return new Promise((resolve, reject) => {
      if (this.ws) { this.ws.close(); this.ws = null }
      this.setStatus('connecting')
      this.connectSettled = false
      this.connectReject = reject

      const ws = new WebSocket(this.url)
      this.ws = ws

      ws.onmessage = (ev: MessageEvent) => {
        let frame: GatewayFrame
        try { frame = JSON.parse(typeof ev.data === 'string' ? ev.data : '{}') } catch { return }
        this.handleFrame(frame, (res) => {
          if (!this.connectSettled) {
            this.connectSettled = true
            this.connectReject = null
            this.reconnectAttempt = 0
            resolve(res)
          }
        })
      }

      ws.onerror = () => {
        if (this._status !== 'auth_failed') this.setStatus('error')
        this.rejectConnect(new Error('WebSocket error'))
      }

      ws.onclose = () => {
        const wasConnected = this._status === 'connected'
        if (this._status !== 'auth_failed') this.setStatus('disconnected')
        this.rejectConnect(new Error('Connection closed'))
        this.clearPending()
        if (!this.intentionalClose && this.autoReconnect) this.scheduleReconnect(wasConnected)
      }
    })
  }

  private scheduleReconnect(wasConnected: boolean) {
    if (this.reconnectTimer) return
    if (wasConnected) this.reconnectAttempt = 0
    if (this.reconnectAttempt >= MAX_ATTEMPTS) { this.autoReconnect = false; return }
    const delay = Math.min(RECONNECT_BASE * Math.pow(RECONNECT_FACTOR, this.reconnectAttempt), RECONNECT_MAX)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.autoReconnect || this.intentionalClose) return
      this.connectOnce().catch(() => {})
    }, delay)
  }

  private rejectConnect(err: Error) {
    if (!this.connectSettled) {
      this.connectSettled = true
      this.connectReject?.(err)
      this.connectReject = null
    }
  }

  private clearPending() {
    for (const [id, p] of this.pending) {
      p.reject(new Error('Connection closed'))
      clearTimeout(p.timer)
      this.pending.delete(id)
    }
  }

  private handleFrame(frame: GatewayFrame, onConnected?: (res: GatewayFrame) => void) {
    if (frame.type === 'event') {
      if (frame.event === 'connect.challenge') { this.sendHandshake(); return }
      if (frame.event) {
        this.eventListeners.get(frame.event)?.forEach(fn => fn(frame.payload))
        this.eventListeners.get('*')?.forEach(fn => fn(frame))
      }
      return
    }
    if (frame.type === 'res' && frame.id) {
      const p = this.pending.get(frame.id)
      if (p) {
        clearTimeout(p.timer)
        this.pending.delete(frame.id)
        if (frame.ok) {
          if (frame.payload?.type === 'hello-ok') { this.setStatus('connected'); onConnected?.(frame) }
          p.resolve(frame)
        } else {
          p.reject(new Error(frame.error?.message ?? 'Request failed'))
        }
        return
      }
      if (frame.ok && frame.payload?.type === 'hello-ok') {
        this.setStatus('connected')
        onConnected?.(frame)
      }
      // Forward final responses as events
      this.eventListeners.get('__final_res__')?.forEach(fn => fn(frame))
    }
  }

  private sendHandshake() {
    const id = nextId()
    const frame: GatewayFrame = {
      type: 'req', id, method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'octavius-town', displayName: 'Octavius Town', version: '1.0.0', platform: 'web', mode: 'backend', instanceId: `oct-${Date.now()}` },
        auth: { token: this.token },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        locale: 'en-US',
      },
    }
    const timer = setTimeout(() => {
      this.pending.delete(id)
      this.setStatus('error')
      this.rejectConnect(new Error('Handshake timeout'))
    }, HANDSHAKE_TIMEOUT)
    this.pending.set(id, {
      resolve: () => {},
      reject: (err) => { this.autoReconnect = false; this.setStatus('auth_failed'); this.rejectConnect(err) },
      timer,
    })
    this.ws?.send(JSON.stringify(frame))
  }

  async request(method: string, params?: Record<string, unknown>, timeout = REQUEST_TIMEOUT): Promise<GatewayFrame> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Not connected')
    const id = nextId()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ type: 'req', id, method, params } as GatewayFrame))
    })
  }

  disconnect() {
    this.intentionalClose = true
    this.autoReconnect = false
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.connectSettled = true
    this.connectReject = null
    if (this.ws) { this.ws.close(); this.ws = null }
    this.clearPending()
    this.setStatus('disconnected')
  }
}
