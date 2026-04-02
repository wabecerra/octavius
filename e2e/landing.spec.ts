import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('loads without authentication', async ({ page }) => {
    await page.goto('/landing')
    await expect(page.locator('text=runaq')).toBeVisible()
    await expect(page.locator('text=Your Life Operating System')).toBeVisible()
  })

  test('has Get Started CTA that links to login', async ({ page }) => {
    await page.goto('/landing')
    const cta = page.locator('a:has-text("Get Started")').first()
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/login')
  })

  test('shows all four quadrants', async ({ page }) => {
    await page.goto('/landing')
    await expect(page.locator('text=Lifeforce')).toBeVisible()
    await expect(page.locator('text=Industry')).toBeVisible()
    await expect(page.locator('text=Fellowship')).toBeVisible()
    await expect(page.locator('text=Essence')).toBeVisible()
  })

  test('shows AI agents section', async ({ page }) => {
    await page.goto('/landing')
    await expect(page.locator('text=Autonomous AI Agents').or(page.locator('text=AI Agents'))).toBeVisible()
  })

  test('shows self-hosted section', async ({ page }) => {
    await page.goto('/landing')
    await expect(page.locator('text=Own Your Data').or(page.locator('text=Self-Hosted'))).toBeVisible()
  })
})
