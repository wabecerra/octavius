/**
 * Unit tests for GatewayClient.
 *
 * Covers: connect/disconnect lifecycle, health check loop, 3-strike disconnect,
 * reconnect loop, token management, 401 handling, updateAddress, validateToken.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GatewayClient, type FetchFn } from './client'

/** Helper: create a mock fetch that returns the given status */
function mockFetch(status: number): FetchFn {
  return vi.fn(async () => new Response(null, { status }))
}

/** Helper: create a fetch that returns different statuses per call */
function sequenceFetch(statuses: number[]): FetchFn {
  let i = 0
  return vi.fn(async () => {
    const s = statuses[i] ?? statuses[statuses.length - 1]!
    i++
    return new Response(null, { status: s })
  })
}

describe('GatewayClient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const client = new GatewayClient(undefined, mockFetch(200))
      const info = client.getConnectionInfo()
      expect(info.address).toBe('localhost')
      expect(info.port).toBe(18789)
      expect(info.status).toBe('unknown')
    })

    it('merges partial config with defaults', () => {
      const client = new GatewayClient({ port: 9999 }, mockFetch(200))
      const info = client.getConnectionInfo()
      expect(info.port).toBe(9999)
      expect(info.address).toBe('localhost')
    })
  })

  describe('connect()', () => {
    it('returns true and sets status to connected when gateway is reachable', async () => {
      const client = new GatewayClient({}, mockFetch(200))
      const events: string[] = []
      client.on('status_changed', (s: string) => events.push(s))
      client.on('gateway_connected', () => events.push('gw_connected'))

      const result = await client.connect()

      expect(result).toBe(true)
      expect(client.getStatus()).toBe('connected')
      expect(client.getConnectionInfo().connectedAt).toBeTruthy()
      expect(events).toContain('connected')
      expect(events).toContain('gw_connected')
      client.disconnect()
    })

    it('returns false and sets status to disconnected when gateway is unreachable', async () => {
      const failFetch: FetchFn = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
      const client = new GatewayClient({}, failFetch)
      const events: string[] = []
      client.on('status_changed', (s: string) => events.push(s))

      const result = await client.connect()

      expect(result).toBe(false)
      expect(client.getStatus()).toBe('disconnected')
      expect(events).toContain('disconnected')
      client.disconnect()
    })
  })

  describe('disconnect()', () => {
    it('transitions to disconnected and emits event', async () => {
      const client = new GatewayClient({}, mockFetch(200))
      await client.connect()

      const events: string[] = []
      client.on('gateway_disconnected', () => events.push('gw_disconnected'))

      client.disconnect()

      expect(client.getStatus()).toBe('disconnected')
      expect(events).toContain('gw_disconnected')
    })

    it('is idempotent — does not re-emit if already disconnected', async () => {
      const failFetch: FetchFn = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
      const client = new GatewayClient({}, failFetch)
      await client.connect() // fails → disconnected

      const events: string[] = []
      client.on('status_changed', (s: string) => events.push(s))

      client.disconnect()
      expect(events).toHaveLength(0) // no duplicate transition
    })
  })

  describe('setToken() / request()', () => {
    it('includes Authorization header when token is set', async () => {
      const fetchSpy = mockFetch(200)
      const client = new GatewayClient({}, fetchSpy)
      await client.connect()

      client.setToken('my-secret-token')
      await client.request('/api/test')

      // The last call to fetchSpy is the request() call
      const lastCall = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
      const headers = lastCall[1]?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer my-secret-token')
      client.disconnect()
    })

    it('uses updated token after setToken is called again', async () => {
      const fetchSpy = mockFetch(200)
      const client = new GatewayClient({}, fetchSpy)
      await client.connect()

      client.setToken('token-v1')
      await client.request('/api/a')
      client.setToken('token-v2')
      await client.request('/api/b')

      const calls = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls
      const lastHeaders = calls.at(-1)![1]?.headers as Headers
      expect(lastHeaders.get('Authorization')).toBe('Bearer token-v2')
      client.disconnect()
    })

    it('does not include Authorization header when no token is set', async () => {
      const fetchSpy = mockFetch(200)
      const client = new GatewayClient({}, fetchSpy)
      await client.connect()

      await client.request('/api/test')

      const lastCall = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
      const headers = lastCall[1]?.headers as Headers
      expect(headers.has('Authorization')).toBe(false)
      client.disconnect()
    })
  })

  describe('401 handling', () => {
    it('transitions to disconnected on 401 response', async () => {
      // First call (health check) succeeds, subsequent request returns 401
      const fetch401 = sequenceFetch([200, 401])
      const client = new GatewayClient({}, fetch401)
      await client.connect()

      const events: string[] = []
      client.on('status_changed', (s: string) => events.push(s))
      client.on('gateway_disconnected', () => events.push('gw_disconnected'))

      await client.request('/api/something')

      expect(client.getStatus()).toBe('disconnected')
      expect(events).toContain('disconnected')
      expect(events).toContain('gw_disconnected')
      client.disconnect()
    })
  })

  describe('health check loop (3-strike disconnect)', () => {
    it('resets failure counter on successful health check', async () => {
      const client = new GatewayClient(
        { healthCheckIntervalMs: 100, maxConsecutiveFailures: 3 },
        mockFetch(200),
      )
      await client.connect()

      // Advance past one health check interval
      await vi.advanceTimersByTimeAsync(100)

      expect(client.getConnectionInfo().consecutiveFailures).toBe(0)
      expect(client.getConnectionInfo().lastHealthyAt).toBeTruthy()
      client.disconnect()
    })

    it('disconnects after 3 consecutive health check failures', async () => {
      let callCount = 0
      const failAfterConnect: FetchFn = vi.fn(async () => {
        callCount++
        // First call (connect) succeeds, subsequent calls fail
        if (callCount === 1) return new Response(null, { status: 200 })
        throw new Error('ECONNREFUSED')
      })

      const client = new GatewayClient(
        { healthCheckIntervalMs: 100, maxConsecutiveFailures: 3 },
        failAfterConnect,
      )
      await client.connect()
      expect(client.getStatus()).toBe('connected')

      const events: string[] = []
      client.on('gateway_disconnected', () => events.push('gw_disconnected'))

      // Advance through 3 health check intervals
      await vi.advanceTimersByTimeAsync(100) // failure 1
      expect(client.getStatus()).toBe('connected')
      await vi.advanceTimersByTimeAsync(100) // failure 2
      expect(client.getStatus()).toBe('connected')
      await vi.advanceTimersByTimeAsync(100) // failure 3 → disconnect
      expect(client.getStatus()).toBe('disconnected')
      expect(events).toContain('gw_disconnected')
      client.disconnect()
    })
  })

  describe('reconnect loop', () => {
    it('reconnects and emits gateway_reconnected when gateway comes back', async () => {
      let callCount = 0
      const eventuallyRecovers: FetchFn = vi.fn(async () => {
        callCount++
        // First call fails (connect), second call succeeds (reconnect)
        if (callCount === 1) throw new Error('ECONNREFUSED')
        return new Response(null, { status: 200 })
      })

      const client = new GatewayClient(
        { reconnectIntervalMs: 200 },
        eventuallyRecovers,
      )

      const events: string[] = []
      client.on('gateway_reconnected', () => events.push('gw_reconnected'))

      await client.connect() // fails
      expect(client.getStatus()).toBe('disconnected')

      // Advance past reconnect interval
      await vi.advanceTimersByTimeAsync(200)

      expect(client.getStatus()).toBe('connected')
      expect(events).toContain('gw_reconnected')
      expect(client.getConnectionInfo().consecutiveFailures).toBe(0)
      client.disconnect()
    })
  })

  describe('updateAddress()', () => {
    it('disconnects from current and reconnects to new address', async () => {
      const fetchSpy = mockFetch(200)
      const client = new GatewayClient({}, fetchSpy)
      await client.connect()

      await client.updateAddress('192.168.1.100', 9000)

      expect(client.getConnectionInfo().address).toBe('192.168.1.100')
      expect(client.getConnectionInfo().port).toBe(9000)
      // Should have reconnected successfully
      expect(client.getStatus()).toBe('connected')
      client.disconnect()
    })
  })

  describe('validateToken()', () => {
    it('returns true when gateway accepts the token', async () => {
      const client = new GatewayClient({}, mockFetch(200))
      const valid = await client.validateToken('good-token')
      expect(valid).toBe(true)
    })

    it('returns false when gateway rejects the token', async () => {
      const client = new GatewayClient({}, mockFetch(401))
      const valid = await client.validateToken('bad-token')
      expect(valid).toBe(false)
    })

    it('returns false when gateway is unreachable', async () => {
      const failFetch: FetchFn = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
      const client = new GatewayClient({}, failFetch)
      const valid = await client.validateToken('any-token')
      expect(valid).toBe(false)
    })
  })

  describe('getConnectionInfo()', () => {
    it('returns full connection metadata', async () => {
      const client = new GatewayClient(
        { address: 'myhost', port: 1234 },
        mockFetch(200),
      )
      await client.connect()

      const info = client.getConnectionInfo()
      expect(info.status).toBe('connected')
      expect(info.address).toBe('myhost')
      expect(info.port).toBe(1234)
      expect(info.connectedAt).toBeTruthy()
      expect(info.consecutiveFailures).toBe(0)
      client.disconnect()
    })
  })
})

import fc from 'fast-check'

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: openclaw-gateway-integration, Property 1: Gateway Status State Machine
// **Validates: Requirements 1.2, 1.3, 2.2, 2.3, 2.4, 2.5**
// ---------------------------------------------------------------------------

describe('Feature: openclaw-gateway-integration, Property 1: Gateway Status State Machine', () => {
  it('status follows state machine rules for any sequence of health check results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }),
        async (healthResults) => {
          vi.useFakeTimers()

          // Build a fetch that returns results in sequence.
          // connect() consumes index 0; each health-check/reconnect tick consumes the next.
          let callIndex = 0
          const fetchFn: FetchFn = vi.fn(async () => {
            const success = healthResults[callIndex] ?? false
            callIndex++
            if (success) return new Response(null, { status: 200 })
            throw new Error('ECONNREFUSED')
          })

          const HEALTH_INTERVAL = 100
          const RECONNECT_INTERVAL = 200
          const MAX_FAILURES = 3

          const client = new GatewayClient(
            {
              healthCheckIntervalMs: HEALTH_INTERVAL,
              reconnectIntervalMs: RECONNECT_INTERVAL,
              maxConsecutiveFailures: MAX_FAILURES,
            },
            fetchFn,
          )

          // Track expected state machine values
          let expectedConsecutiveFailures = 0
          let expectedStatus: 'connected' | 'disconnected' = healthResults[0]
            ? 'connected'
            : 'disconnected'

          // Step 0: connect() consumes healthResults[0]
          await client.connect()

          expect(client.getStatus()).toBe(expectedStatus)
          expect(client.getConnectionInfo().consecutiveFailures).toBe(0)

          // (a) after a successful connect, connectedAt is set
          if (healthResults[0]) {
            expect(client.getConnectionInfo().connectedAt).toBeTruthy()
          }

          // Steps 1..N: simulate health checks (connected) or reconnect attempts (disconnected)
          for (let i = 1; i < healthResults.length; i++) {
            const result = healthResults[i]!

            if (expectedStatus === 'connected') {
              // Advance past one health check interval and flush async callbacks
              await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL)

              if (result) {
                // (a) successful health check → stays connected, lastHealthyAt updated, counter resets
                expectedConsecutiveFailures = 0
                expect(client.getStatus()).toBe('connected')
                expect(client.getConnectionInfo().lastHealthyAt).toBeTruthy()
              } else {
                // (c) failure increments counter
                expectedConsecutiveFailures++
                if (expectedConsecutiveFailures >= MAX_FAILURES) {
                  // (b) N >= 3 consecutive failures → disconnected
                  expectedStatus = 'disconnected'
                  expect(client.getStatus()).toBe('disconnected')
                } else {
                  // (c) fewer than 3 → stays connected
                  expect(client.getStatus()).toBe('connected')
                }
              }
            } else {
              // disconnected → advance past reconnect interval
              await vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL)

              if (result) {
                // (d) reconnect success → connected, counter resets to 0
                expectedStatus = 'connected'
                expectedConsecutiveFailures = 0
                expect(client.getStatus()).toBe('connected')
                expect(client.getConnectionInfo().consecutiveFailures).toBe(0)
              } else {
                // Still disconnected
                expect(client.getStatus()).toBe('disconnected')
              }
            }

            expect(client.getConnectionInfo().consecutiveFailures).toBe(
              expectedConsecutiveFailures,
            )
          }

          // Cleanup
          client.disconnect()
          vi.useRealTimers()
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: openclaw-gateway-integration, Property 4: Token Inclusion in Gateway Requests
// **Validates: Requirements 3.2, 3.4**
// ---------------------------------------------------------------------------

// Arbitrary: non-empty token with no leading/trailing whitespace
// (HTTP Headers API normalises values by trimming whitespace per spec)
const tokenArb = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0 && s === s.trim())

describe('Feature: openclaw-gateway-integration, Property 4: Token Inclusion in Gateway Requests', () => {
  it('request() includes Bearer {token} for the most recently set token', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArb,
        async (token) => {
          const fetchSpy: FetchFn = vi.fn(
            async () => new Response(null, { status: 200 }),
          )
          const client = new GatewayClient({}, fetchSpy)
          await client.connect()

          client.setToken(token)
          await client.request('/api/test')

          const calls = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls
          const lastCall = calls.at(-1)!
          const headers = lastCall[1]?.headers as Headers
          expect(headers.get('Authorization')).toBe(`Bearer ${token}`)

          client.disconnect()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('after token update, subsequent requests use the new token', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArb,
        tokenArb,
        async (tokenA, tokenB) => {
          const fetchSpy: FetchFn = vi.fn(
            async () => new Response(null, { status: 200 }),
          )
          const client = new GatewayClient({}, fetchSpy)
          await client.connect()

          // Set first token and make a request
          client.setToken(tokenA)
          await client.request('/api/first')

          const calls = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls
          const firstReqHeaders = calls.at(-1)![1]?.headers as Headers
          expect(firstReqHeaders.get('Authorization')).toBe(
            `Bearer ${tokenA}`,
          )

          // Update token and make another request
          client.setToken(tokenB)
          await client.request('/api/second')

          const secondReqHeaders = (
            (fetchSpy as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1]
              ?.headers as Headers
          )
          expect(secondReqHeaders.get('Authorization')).toBe(
            `Bearer ${tokenB}`,
          )

          client.disconnect()
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: openclaw-gateway-integration, Property 5: Token Storage Encryption
// **Validates: Requirements 3.1**
// ---------------------------------------------------------------------------

import { getDatabase, closeDatabase } from '../memory/db'
import { encryptToken, decryptToken } from '../security'

describe('Feature: openclaw-gateway-integration, Property 5: Token Storage Encryption', () => {
  it('encrypted token stored in gateway_tokens table differs from plaintext', () => {
    // Single DB for all iterations to avoid per-run schema creation overhead
    const db = getDatabase(':memory:')
    const insertStmt = db.prepare(
      `INSERT INTO gateway_tokens (encrypted_token, gateway_address, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    const selectStmt = db.prepare(
      'SELECT encrypted_token FROM gateway_tokens WHERE id = last_insert_rowid()',
    )

    try {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (token) => {
            const encrypted = encryptToken(token)

            // Encrypted value must differ from plaintext
            expect(encrypted).not.toBe(token)

            // Insert into gateway_tokens table
            const now = new Date().toISOString()
            insertStmt.run(encrypted, 'localhost:18789', now, now)

            // Read back and verify stored value differs from plaintext
            const row = selectStmt.get() as { encrypted_token: string }

            expect(row.encrypted_token).not.toBe(token)
            expect(row.encrypted_token).toBe(encrypted)

            // Verify round-trip: decryption recovers the original token
            expect(decryptToken(row.encrypted_token)).toBe(token)
          },
        ),
        { numRuns: 100 },
      )
    } finally {
      closeDatabase(db)
    }
  }, 30_000) // scrypt key derivation is CPU-intensive across 100 iterations
})


// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: openclaw-gateway-integration, Property 6: 401 Response Triggers Disconnect
// **Validates: Requirements 3.3**
// ---------------------------------------------------------------------------

describe('Feature: openclaw-gateway-integration, Property 6: 401 Response Triggers Disconnect', () => {
  it('401 response transitions to disconnected regardless of prior failure count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        async (priorFailures) => {
          vi.useFakeTimers()

          const HEALTH_INTERVAL = 100

          // Build a fetch sequence:
          // 1. connect() health check → 200 (success)
          // 2. N health checks that fail (to build up consecutiveFailures)
          // 3. request() call → 401
          let callIndex = 0
          const fetchFn: FetchFn = vi.fn(async () => {
            callIndex++
            // Call 1: connect() health check succeeds
            if (callIndex === 1) return new Response(null, { status: 200 })
            // Calls 2..N+1: health check failures to build up consecutiveFailures
            if (callIndex <= 1 + priorFailures) throw new Error('ECONNREFUSED')
            // Final call: the request() that returns 401
            return new Response(null, { status: 401 })
          })

          const client = new GatewayClient(
            {
              healthCheckIntervalMs: HEALTH_INTERVAL,
              maxConsecutiveFailures: 6, // set higher than max priorFailures so we don't disconnect from health checks
            },
            fetchFn,
          )

          // Step 1: connect successfully
          await client.connect()
          expect(client.getStatus()).toBe('connected')

          // Step 2: simulate prior health check failures
          for (let i = 0; i < priorFailures; i++) {
            await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL)
          }

          // Verify we're still connected (maxConsecutiveFailures=6 > priorFailures)
          expect(client.getStatus()).toBe('connected')
          expect(client.getConnectionInfo().consecutiveFailures).toBe(priorFailures)

          // Step 3: make a request that returns 401
          const events: string[] = []
          client.on('status_changed', (s: string) => events.push(s))
          client.on('gateway_disconnected', () => events.push('gw_disconnected'))

          const res = await client.request('/api/something')
          expect(res.status).toBe(401)

          // Step 4: verify status is disconnected regardless of prior failure count
          expect(client.getStatus()).toBe('disconnected')
          expect(events).toContain('disconnected')
          expect(events).toContain('gw_disconnected')

          client.disconnect()
          vi.useRealTimers()
        },
      ),
      { numRuns: 100 },
    )
  })
})
