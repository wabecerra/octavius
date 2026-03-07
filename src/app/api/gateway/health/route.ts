import { NextResponse } from 'next/server'

const GATEWAY_HOST = process.env.OPENCLAW_GATEWAY_HOST || 'localhost'
const GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT || '18789'

/**
 * GET /api/gateway/health — Proxies to the OpenClaw gateway /health endpoint.
 * This avoids CORS issues since the browser calls same-origin.
 */
export async function GET() {
  try {
    const res = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/health`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    return NextResponse.json({ ...data, gateway: `${GATEWAY_HOST}:${GATEWAY_PORT}` })
  } catch {
    return NextResponse.json({ ok: false, status: 'unreachable' }, { status: 502 })
  }
}
