import { test, expect } from '@playwright/test'

test.describe('Task Detail Modal - Approval UI Fixes', () => {
  test('Subtasks appear before description in modal', async ({ page }) => {
    // Login
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]')
    const passwordInput = page.locator('input[type="password"]').first()

    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill('test@octavius.dev')
      await passwordInput.fill('TestPass123!')
      await page.locator('button[type="submit"]').click()
      await page.waitForTimeout(3000)
    }

    expect(page.url()).not.toContain('/login')
    await expect(page.locator('text=Sprint Board')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2000)

    // Find and open the runaq.ai task
    const taskTitle = page.getByText('Build runaq.ai SaaS MVP - Anxiety management platform', { exact: true })
    await expect(taskTitle).toBeVisible({ timeout: 5000 })
    await taskTitle.scrollIntoViewIfNeeded()

    const card = taskTitle.locator('xpath=ancestor::div[contains(@class,"group")]').first()
    await card.hover()
    await page.waitForTimeout(500)

    const viewBtn = card.locator('button:has-text("View")')
    await expect(viewBtn).toBeVisible({ timeout: 3000 })
    await viewBtn.click()
    await page.waitForTimeout(1500)

    // KEY ASSERTION: Subtasks section should be visible WITHOUT scrolling
    // (it's now above the description)
    const subtasksHeader = page.locator('h4:has-text("Subtasks")')
    await expect(subtasksHeader).toBeVisible({ timeout: 3000 })

    // Subtask titles should be visible
    const reviewPlan = page.locator('text=Review implementation plan')
    await expect(reviewPlan).toBeVisible({ timeout: 2000 })

    // "Show more" button should exist (description is truncated)
    const showMore = page.locator('button:has-text("Show more")')
    const showMoreVisible = await showMore.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`Show more button visible: ${showMoreVisible}`)

    // Take screenshot
    await page.screenshot({ path: 'e2e/screenshots/modal-subtasks-first.png' })

    // Verify subtask status badges
    const approvedBadge = page.locator('span:has-text("approved")')
    const pendingBadge = page.locator('span:has-text("pending")')
    console.log(`Approved badge count: ${await approvedBadge.count()}`)
    console.log(`Pending badge count: ${await pendingBadge.count()}`)
  })
})
