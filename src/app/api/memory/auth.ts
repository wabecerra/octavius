import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { MemoryService } from '@/lib/memory/service'

/**
 * Shared auth middleware for Memory API routes.
 *
 * Auth modes:
 * 1. **Open local mode** (default): When OCTAVIUS_API_SECRET is not set,
 *    all requests are allowed without auth. This is the expected mode for
 *    self-hosted single-user installations.
 * 2. **Token mode**: When OCTAVIUS_API_SECRET is set, requests must include
 *    a Bearer token matching either the env var or the SQLite-stored token.
 *
 * Returns null if auth passes, or a NextResponse 401 if it fails.
 */
export function authenticateRequest(request: Request): NextResponse | null {
  const envSecret = process.env.OCTAVIUS_API_SECRET

  // Open local mode: no env secret configured → allow all requests
  if (!envSecret) {
    return null
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Invalid or missing authentication token' },
      { status: 401 },
    )
  }

  const token = authHeader.slice('Bearer '.length)

  // Accept the env-configured secret
  if (token === envSecret) {
    return null
  }

  // Also accept the SQLite-stored secret (for backwards compatibility)
  const db = getDatabase()
  const service = new MemoryService(db)
  const config = service.getConfig()

  if (token === config.api_secret_token) {
    return null
  }

  return NextResponse.json(
    { error: 'Invalid or missing authentication token' },
    { status: 401 },
  )
}

/**
 * Get a shared MemoryService instance backed by the default database.
 */
export function getMemoryService(): MemoryService {
  const db = getDatabase()
  return new MemoryService(db)
}

/**
 * Get the shared database instance.
 */
export function getDb() {
  return getDatabase()
}
