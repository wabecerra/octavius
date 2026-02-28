import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { MemoryService } from '@/lib/memory/service'

/**
 * Shared auth middleware for Memory API routes.
 * Validates Bearer token against the configured api_secret_token.
 * Returns null if auth passes, or a NextResponse 401 if it fails.
 */
export function authenticateRequest(request: Request): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Invalid or missing authentication token' },
      { status: 401 },
    )
  }

  const token = authHeader.slice('Bearer '.length)
  const db = getDatabase()
  const service = new MemoryService(db)
  const config = service.getConfig()

  if (token !== config.api_secret_token) {
    return NextResponse.json(
      { error: 'Invalid or missing authentication token' },
      { status: 401 },
    )
  }

  return null
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
