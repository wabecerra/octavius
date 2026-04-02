import { test, expect } from '@playwright/test'

/**
 * Nerve Center agent position tests.
 *
 * Since Phaser renders on a <canvas>, we can't query DOM elements for agent
 * positions. Instead we read from sessionStorage (BotStateStore key:
 * "octavius-bot-state") which the scene writes every 2 seconds and flushes
 * on shutdown.
 *
 * Expected initial generalist positions (from nerve-center-map.logic.json):
 *   gen-lifeforce  → (155, 170) in vitality-lab
 *   gen-industry   → (495, 170) in task-forge
 *   gen-fellowship → (105, 550) in commons
 *   gen-essence    → (1055, 550) in soul-workshop
 */

const TEST_EMAIL = 'test@octavius.dev'
const TEST_PASSWORD = 'TestPass123!'

const EXPECTED_POSITIONS: Record<string, { x: number; y: number; room: string }> = {
  'gen-lifeforce':  { x: 155,  y: 170, room: 'vitality-lab' },
  'gen-industry':   { x: 495,  y: 170, room: 'task-forge' },
  'gen-fellowship': { x: 105,  y: 550, room: 'commons' },
  'gen-essence':    { x: 1055, y: 550, room: 'soul-workshop' },
}

// Agents wander, so allow some tolerance from their seat position
const POSITION_TOLERANCE = 80

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('input[type="email"], input[placeholder*="email" i]').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()
  // Wait for dashboard to load (redirect from /login)
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15_000 })
}

async function navigateToNerveCenter(page: import('@playwright/test').Page) {
  // Click the Nerve Center nav item in the sidebar
  const navBtn = page.locator('button:has-text("Nerve Center"), [data-view="town"]')
  await navBtn.click()
  // Wait for the Phaser canvas to appear
  await page.waitForSelector('canvas', { timeout: 15_000 })
}

async function navigateToDashboard(page: import('@playwright/test').Page) {
  const navBtn = page.locator('button:has-text("Dashboard"), [data-view="dashboard"]')
  await navBtn.click()
  await page.waitForTimeout(1000)
}

/**
 * Read BotStateStore from sessionStorage.
 * Returns an array of { seatId, x, y, currentRoomId, ... } or null if not yet stored.
 */
async function readBotState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem('octavius-bot-state')
    if (!raw) return null
    try {
      return JSON.parse(raw) as Array<{
        seatId: string
        x: number
        y: number
        currentRoomId: string | null
      }>
    } catch {
      return null
    }
  })
}

test.describe('Nerve Center — Agent Positions', () => {
  test.beforeEach(async ({ page }) => {
    // Clear sessionStorage to ensure fresh state
    await page.goto('/')
    await page.evaluate(() => {
      sessionStorage.removeItem('octavius-bot-state')
      sessionStorage.removeItem('octavius-fleet-state')
    })
  })

  test('generalist agents are positioned at their manifest seats on initial load', async ({ page }) => {
    await login(page)
    await navigateToNerveCenter(page)

    // Wait for scene to be ready and save positions (first save at 2s interval)
    await page.waitForTimeout(4000)

    const botState = await readBotState(page)
    expect(botState).not.toBeNull()
    expect(botState!.length).toBeGreaterThanOrEqual(4) // at least 4 generalists

    for (const [agentId, expected] of Object.entries(EXPECTED_POSITIONS)) {
      const agent = botState!.find(s => s.seatId === agentId)
      expect(agent, `Agent ${agentId} should exist in BotStateStore`).toBeTruthy()

      // Check position within tolerance (agents wander after spawn)
      const dx = Math.abs(agent!.x - expected.x)
      const dy = Math.abs(agent!.y - expected.y)
      expect(
        dx < POSITION_TOLERANCE && dy < POSITION_TOLERANCE,
        `${agentId} position (${agent!.x}, ${agent!.y}) should be near (${expected.x}, ${expected.y}) — dx=${dx}, dy=${dy}`,
      ).toBe(true)

      // Check room assignment
      expect(agent!.currentRoomId).toBe(expected.room)
    }
  })

  test('agent positions persist after switching tabs and returning', async ({ page }) => {
    await login(page)
    await navigateToNerveCenter(page)

    // Wait for positions to be saved
    await page.waitForTimeout(4000)

    // Capture positions before tab switch
    const beforeState = await readBotState(page)
    expect(beforeState).not.toBeNull()
    expect(beforeState!.length).toBeGreaterThanOrEqual(4)

    // Switch to Dashboard (destroys Phaser game, triggers flush)
    await navigateToDashboard(page)

    // Verify sessionStorage still has bot state after Phaser destruction
    const midState = await readBotState(page)
    expect(midState).not.toBeNull()
    expect(midState!.length).toBe(beforeState!.length)

    // Switch back to Nerve Center (recreates Phaser game, triggers restore)
    await navigateToNerveCenter(page)

    // Wait for scene to initialize and save (restore + first save)
    await page.waitForTimeout(4000)

    const afterState = await readBotState(page)
    expect(afterState).not.toBeNull()
    expect(afterState!.length).toBeGreaterThanOrEqual(4)

    // Compare: each agent should be near its pre-switch position
    // Allow some wander drift but not the Y-drift bug (which would be 2-4px per switch)
    for (const before of beforeState!) {
      const after = afterState!.find(s => s.seatId === before.seatId)
      if (!after) continue // specialist may have become hidden

      const dx = Math.abs(after.x - before.x)
      const dy = Math.abs(after.y - before.y)

      // Agents wander, so allow some tolerance, but Y should not systematically drift
      expect(
        dx < POSITION_TOLERANCE && dy < POSITION_TOLERANCE,
        `${before.seatId} drifted too far: (${before.x},${before.y}) → (${after.x},${after.y}) — dx=${dx}, dy=${dy}`,
      ).toBe(true)

      // Room should be preserved
      expect(after.currentRoomId).toBe(before.currentRoomId)
    }
  })

  test('agent positions persist across multiple rapid tab switches', async ({ page }) => {
    await login(page)
    await navigateToNerveCenter(page)
    await page.waitForTimeout(3000)

    const initialState = await readBotState(page)
    expect(initialState).not.toBeNull()

    // Rapidly switch tabs 5 times to test for Y-drift accumulation
    for (let i = 0; i < 5; i++) {
      await navigateToDashboard(page)
      await page.waitForTimeout(500)
      await navigateToNerveCenter(page)
      await page.waitForTimeout(2500)
    }

    const finalState = await readBotState(page)
    expect(finalState).not.toBeNull()

    // After 5 round-trips, agents should NOT have drifted significantly
    // (the Y-drift bug would cause ~2-4px per switch = 10-20px total)
    for (const initial of initialState!) {
      const final = finalState!.find(s => s.seatId === initial.seatId)
      if (!final) continue

      const dy = Math.abs(final.y - initial.y)
      expect(
        dy < POSITION_TOLERANCE,
        `${initial.seatId} Y-drifted ${dy}px after 5 tab switches (was ${initial.y}, now ${final.y})`,
      ).toBe(true)
    }
  })
})
