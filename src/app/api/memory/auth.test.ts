import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { authenticateRequest } from './auth'

// Mock the database and service modules
vi.mock('@/lib/memory/db', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@/lib/memory/service', () => {
  return {
    MemoryService: class {
      getConfig() {
        return { api_secret_token: 'test-secret-token' }
      }
    },
  }
})

describe('authenticateRequest', () => {
  it('returns 401 when no Authorization header is present', () => {
    const request = new Request('http://localhost/api/memory/items', {
      method: 'GET',
    })

    const result = authenticateRequest(request)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(401)
  })

  it('returns 401 when Authorization header does not start with Bearer', () => {
    const request = new Request('http://localhost/api/memory/items', {
      method: 'GET',
      headers: { Authorization: 'Basic abc123' },
    })

    const result = authenticateRequest(request)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(401)
  })

  it('returns 401 when Bearer token does not match config', () => {
    const request = new Request('http://localhost/api/memory/items', {
      method: 'GET',
      headers: { Authorization: 'Bearer wrong-token' },
    })

    const result = authenticateRequest(request)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(401)
  })

  it('returns null (passes) when Bearer token matches config', () => {
    const request = new Request('http://localhost/api/memory/items', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-secret-token' },
    })

    const result = authenticateRequest(request)
    expect(result).toBeNull()
  })
})
