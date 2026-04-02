import { test, expect } from '@playwright/test'

test.describe('All Views Load Without Error', () => {
  test('landing page loads', async ({ page }) => {
    const response = await page.goto('/landing')
    expect(response?.status()).toBe(200)
    // No JS errors
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(2000)
    expect(errors).toEqual([])
  })

  test('login page loads', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(2000)
    expect(errors).toEqual([])
  })

  test('API health endpoints respond', async ({ request }) => {
    // Test that key API routes respond (even if with auth errors)
    const endpoints = [
      '/api/dashboard/profile',
      '/api/dashboard/tasks',
      '/api/memory/search',
    ]

    for (const endpoint of endpoints) {
      const response = await request.get(endpoint)
      // Should get 200 or 401 (auth required), not 500
      expect([200, 401, 403]).toContain(response.status())
    }
  })

  test('active agents API responds', async ({ request }) => {
    const response = await request.get('/api/agents/active')
    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('activeAgents')
    expect(data).toHaveProperty('pendingSpecialists')
    expect(Array.isArray(data.activeAgents)).toBe(true)
  })
})
