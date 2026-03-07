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
  describe('when OCTAVIUS_API_SECRET is set (token mode)', () => {
    beforeEach(() => {
      process.env.OCTAVIUS_API_SECRET = 'env-secret-token'
    })

    afterEach(() => {
      delete process.env.OCTAVIUS_API_SECRET
    })

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

    it('returns 401 when Bearer token does not match', () => {
      const request = new Request('http://localhost/api/memory/items', {
        method: 'GET',
        headers: { Authorization: 'Bearer wrong-token' },
      })

      const result = authenticateRequest(request)
      expect(result).not.toBeNull()
      expect(result!.status).toBe(401)
    })

    it('returns null (passes) when Bearer token matches env secret', () => {
      const request = new Request('http://localhost/api/memory/items', {
        method: 'GET',
        headers: { Authorization: 'Bearer env-secret-token' },
      })

      const result = authenticateRequest(request)
      expect(result).toBeNull()
    })

    it('returns null (passes) when Bearer token matches SQLite secret', () => {
      const request = new Request('http://localhost/api/memory/items', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-secret-token' },
      })

      const result = authenticateRequest(request)
      expect(result).toBeNull()
    })
  })

  describe('when OCTAVIUS_API_SECRET is not set (open local mode)', () => {
    beforeEach(() => {
      delete process.env.OCTAVIUS_API_SECRET
    })

    it('returns null (allows) when no Authorization header is present', () => {
      const request = new Request('http://localhost/api/memory/items', {
        method: 'GET',
      })

      const result = authenticateRequest(request)
      expect(result).toBeNull()
    })

    it('returns null (allows) for any request in open mode', () => {
      const request = new Request('http://localhost/api/memory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = authenticateRequest(request)
      expect(result).toBeNull()
    })
  })
})
