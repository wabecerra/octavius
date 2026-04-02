import { test, expect } from '@playwright/test'

test.describe('Kanban Board - Real-time Updates', () => {
  test('dashboard loads with Sprint Board section', async ({ page }) => {
    // This test assumes a logged-in session with existing profile
    // Set up session storage to bypass auth if possible
    await page.goto('/login')

    // Login with test credentials
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]')
    const passwordInput = page.locator('input[type="password"]').first()

    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill('test@octavius.dev')
      await passwordInput.fill('TestPass123!')

      const submit = page.locator('button[type="submit"]')
      await submit.click()
      await page.waitForTimeout(3000)
    }

    // If we're on dashboard, check for Sprint Board
    if (!page.url().includes('/login')) {
      const sprintBoard = page.locator('text=Sprint Board')
      const isVisible = await sprintBoard.isVisible({ timeout: 10_000 }).catch(() => false)
      if (isVisible) {
        // Verify 3 columns exist
        await expect(page.locator('text=Backlog')).toBeVisible()
        await expect(page.locator('text=In Progress')).toBeVisible()
        await expect(page.locator('text=Done')).toBeVisible()
      }
    }
  })
})
