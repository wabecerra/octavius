/**
 * Server-side GatewayClient singleton for use in API routes.
 *
 * The main GatewayClient singleton lives in use-gateway.ts ('use client'),
 * which cannot be imported from Next.js API routes. This provides a
 * server-safe equivalent that lazy-connects to the gateway.
 */
import { GatewayClient } from './client'

let _client: GatewayClient | null = null
let _connectPromise: Promise<void> | null = null

/**
 * Get the server-side GatewayClient, or null if not connectable.
 * Lazy-initializes on first call and awaits connection.
 */
export async function getServerGatewayClient(): Promise<GatewayClient | null> {
  if (!_client) {
    const address = process.env.OPENCLAW_HOST || 'localhost'
    const port = Number(process.env.OPENCLAW_PORT || 18789)
    _client = new GatewayClient({ address, port })

    const token = process.env.OPENCLAW_TOKEN || 'openclaw-local-dev'
    _client.setToken(token)

    _connectPromise = _client.connect().then(() => {}).catch(() => {})
  }

  if (_connectPromise) await _connectPromise

  return _client.getStatus() === 'connected' ? _client : null
}
