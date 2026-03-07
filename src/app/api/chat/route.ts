import { NextResponse } from 'next/server'

const GATEWAY_HOST = process.env.OPENCLAW_GATEWAY_HOST || 'localhost'
const GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT || '18789'

/**
 * POST /api/chat — Proxies chat to the OpenClaw gateway.
 *
 * For now, sends to the gateway's chat endpoint if available,
 * or returns a helpful fallback message.
 *
 * Body: { message: string, agentId?: string }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { message } = body

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  // Try the OpenClaw gateway first
  try {
    const gatewayUrl = `http://${GATEWAY_HOST}:${GATEWAY_PORT}`

    // Check if gateway is reachable
    const healthRes = await fetch(`${gatewayUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    })

    if (healthRes.ok) {
      // Try to send through the gateway's chat/completions endpoint
      // OpenClaw gateways typically accept messages via sessions
      const chatRes = await fetch(`${gatewayUrl}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(30000),
      })

      if (chatRes.ok) {
        const data = await chatRes.json()
        return NextResponse.json({
          response: data.response || data.message || data.content || JSON.stringify(data),
          source: 'gateway',
        })
      }
    }
  } catch {
    // Gateway unavailable — fall through to fallback
  }

  // Try local Ollama
  try {
    const ollamaRes = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: message,
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (ollamaRes.ok) {
      const data = await ollamaRes.json()
      return NextResponse.json({
        response: data.response,
        source: 'ollama',
      })
    }
  } catch {
    // Ollama not available either
  }

  // Fallback: acknowledge the message and suggest using the OpenClaw plugin
  return NextResponse.json({
    response: `I received your message: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"\n\nThe chat is currently in offline mode — no LLM backend is connected. To enable AI responses:\n\n1. **Install Ollama** locally (ollama.com) and run a model\n2. **Or** connect through the OpenClaw gateway with the Octavius plugin\n\nIn the meantime, you can use the dashboard to create tasks, log check-ins, and manage your life quadrants.`,
    source: 'fallback',
  })
}
