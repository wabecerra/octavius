import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { GatewayClient } from '@/lib/gateway/client'
import { encryptToken } from '@/lib/security'

/**
 * POST /api/gateway/validate-token — Validate a gateway token and persist on success.
 * Body: { token: string, address?: string, port?: number }
 * Returns: { valid: boolean }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token: string
      address?: string
      port?: number
    }

    if (!body.token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }

    const address = body.address ?? 'localhost'
    const port = body.port ?? 18789

    const client = new GatewayClient({ address, port })
    const valid = await client.validateToken(body.token)

    if (valid) {
      // Persist encrypted token to SQLite (Req 3.1)
      const db = getDatabase()
      const encrypted = encryptToken(body.token)
      const now = new Date().toISOString()

      db.prepare(`
        INSERT INTO gateway_tokens (encrypted_token, gateway_address, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(encrypted, `${address}:${port}`, now, now)
    }

    return NextResponse.json({ valid })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
