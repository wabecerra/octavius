/**
 * Custom Next.js server with WebSocket proxy.
 *
 * Proxies ws://localhost:3000/api/ws/gateway → ws://GATEWAY_HOST:GATEWAY_PORT
 * so the browser gets real-time agent events without direct gateway access.
 */

import { createServer, type IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import next from 'next'
import { WebSocket, WebSocketServer, type RawData } from 'ws'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)
const gatewayHost = process.env.OPENCLAW_GATEWAY_HOST ?? 'localhost'
const gatewayPort = process.env.OPENCLAW_GATEWAY_PORT ?? '18789'
const GATEWAY_WS_URL = `ws://${gatewayHost}:${gatewayPort}/`

const MAX_BUFFERED = 100
const UPSTREAM_TIMEOUT_MS = 15_000

const app = next({ dev })
const handle = app.getRequestHandler()

function log(level: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[${ts}] [${level}]`, ...args)
}

function isForwardableCloseCode(code: number) {
  return (
    code === 1000 ||
    (code >= 1001 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) ||
    (code >= 3000 && code <= 4999)
  )
}

function proxyWebSocket(clientWs: WebSocket, gatewayUrl: string) {
  const upstream = new WebSocket(gatewayUrl)
  const buffer: Array<{ data: RawData; isBinary: boolean }> = []

  const timeout = setTimeout(() => {
    if (upstream.readyState === WebSocket.CONNECTING) {
      log('WARN', 'Upstream connection timeout')
      buffer.length = 0
      upstream.terminate()
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, 'Gateway connection timeout')
      }
    }
  }, UPSTREAM_TIMEOUT_MS)

  upstream.on('open', () => {
    clearTimeout(timeout)
    for (const msg of buffer) upstream.send(msg.data, { binary: msg.isBinary })
    buffer.length = 0
  })

  upstream.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      try { clientWs.send(data, { binary: isBinary }) } catch {}
    }
  })

  upstream.on('close', (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      isForwardableCloseCode(code) ? clientWs.close(code, reason.toString()) : clientWs.close()
    }
  })

  upstream.on('error', (err) => {
    log('ERROR', 'Upstream error:', err.message)
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011, 'Gateway error')
  })

  clientWs.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary })
    } else if (upstream.readyState === WebSocket.CONNECTING && buffer.length < MAX_BUFFERED) {
      buffer.push({ data, isBinary })
    }
  })

  clientWs.on('close', () => {
    clearTimeout(timeout)
    buffer.length = 0
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close()
    }
  })

  clientWs.on('error', (err) => {
    log('ERROR', 'Client error:', err.message)
    if (upstream.readyState === WebSocket.OPEN) upstream.close()
  })
}

function checkOrigin(req: IncomingMessage, socket: Duplex): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        log('WARN', `Rejected WS: origin ${origin} ≠ host ${host}`)
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return false
      }
    } catch {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return false
    }
  }
  return true
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res))
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/api/ws/gateway') {
      if (!checkOrigin(req, socket)) return
      wss.handleUpgrade(req, socket as Duplex, head, (clientWs) => {
        proxyWebSocket(clientWs, GATEWAY_WS_URL)
      })
    }
  })

  wss.on('error', (err) => log('ERROR', 'WSS error:', err.message))

  server.listen(port, () => {
    log('INFO', `Octavius ready on http://localhost:${port}`)
    log('INFO', `WS proxy: ws://localhost:${port}/api/ws/gateway → ${GATEWAY_WS_URL}`)
  })
})
