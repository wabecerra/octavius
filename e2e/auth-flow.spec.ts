import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/')
    // Should redirect to /login or show loading then redirect
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    // Should have email and password fields
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('register creates account and shows device approval', async ({ page }) => {
    await page.goto('/login')

    // Look for register/signup toggle
    const registerBtn = page.locator('button:has-text("Register"), button:has-text("Sign Up"), a:has-text("Register")')
    if (await registerBtn.isVisible()) {
      await registerBtn.click()
    }

    // Fill registration form
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]')
    const passwordInput = page.locator('input[type="password"]').first()

    const testEmail = `test-${Date.now()}@octavius.dev`
    await emailInput.fill(testEmail)
    await passwordInput.fill('TestPass123!')

    // Submit
    const submitBtn = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign Up"), button:has-text("Create")')
    await submitBtn.click()

    // Should either redirect to dashboard or show device approval
    await page.waitForTimeout(3000)
    const url = page.url()
    const hasDeviceApproval = await page.locator('text=device').or(page.locator('text=approval')).or(page.locator('text=code')).isVisible().catch(() => false)
    const isOnDashboard = !url.includes('/login')

    expect(hasDeviceApproval || isOnDashboard).toBe(true)
  })
})
