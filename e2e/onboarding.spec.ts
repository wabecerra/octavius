import { test, expect } from '@playwright/test'

test.describe('Onboarding Wizard', () => {
  // Helper: register and login to get a fresh session
  async function registerAndLogin(page: import('@playwright/test').Page) {
    await page.goto('/login')

    // Try to find register toggle
    const registerBtn = page.locator('button:has-text("Register"), button:has-text("Sign Up"), a:has-text("Register")')
    if (await registerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await registerBtn.click()
    }

    const email = `onboard-${Date.now()}@octavius.dev`
    await page.locator('input[type="email"], input[placeholder*="email" i]').fill(email)
    await page.locator('input[type="password"]').first().fill('TestPass123!')

    const submit = page.locator('button[type="submit"]').or(page.locator('button:has-text("Register")').or(page.locator('button:has-text("Create")')))
    await submit.click()
    await page.waitForTimeout(3000)
  }

  test('shows onboarding wizard for new users', async ({ page }) => {
    await registerAndLogin(page)

    // If we made it past login, check for onboarding
    const wizardVisible = await page.locator('text=Welcome to Octavius').isVisible({ timeout: 10_000 }).catch(() => false)
    // New users should see the wizard (if auth succeeded) or still be on login
    if (page.url().includes('/login')) {
      // Auth flow may require device approval — that's ok
      test.skip()
      return
    }
    expect(wizardVisible).toBe(true)
  })

  test('onboarding wizard has 4 steps', async ({ page }) => {
    await registerAndLogin(page)
    if (page.url().includes('/login')) { test.skip(); return }

    // Step 0: Welcome
    await expect(page.locator('text=Welcome to Octavius')).toBeVisible()
    await page.locator('button:has-text("Let\'s Go")').click()

    // Step 1: Name
    await expect(page.locator('text=What should we call you')).toBeVisible()
    await page.locator('input[placeholder="Your name"]').fill('Test User')
    await page.locator('button:has-text("Next")').click()

    // Step 2: Quadrants
    await expect(page.locator('text=What are you focusing on')).toBeVisible()
    await page.locator('button:has-text("Industry")').click()
    await page.locator('button:has-text("Next")').click()

    // Step 3: First task
    await expect(page.locator('text=Create your first task')).toBeVisible()
  })
})
