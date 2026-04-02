import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: '/local/home/wabo/.cache/ms-playwright/chromium-1212/chrome-linux64/chrome',
  args: ['--no-sandbox'],
})

const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

// Bypass auth by setting localStorage directly
await page.goto('http://localhost:3000/login')
await page.evaluate(() => {
  localStorage.setItem('octavius_session', 'fake-session-for-screenshot')
  localStorage.setItem('octavius_user', JSON.stringify({ userId: 'test-user', email: 'test@octavius.dev' }))
})

// Navigate to dashboard (auth check reads from localStorage)
await page.goto('http://localhost:3000')
await page.waitForTimeout(3000)

// Click the Nerve Center nav item
const navLink = page.locator('text=Nerve Center').first()
if (await navLink.isVisible()) {
  await navLink.click()
  await page.waitForTimeout(5000) // Wait for Phaser canvas to render
} else {
  console.log('Nerve Center nav link not found')
  await browser.close()
  process.exit(1)
}

// Screenshot 1: Initial positions
await page.screenshot({ path: '/tmp/nerve-center-initial.png', fullPage: false })
console.log('Screenshot 1 saved: /tmp/nerve-center-initial.png (initial positions)')

// Wait for agents to wander a bit
await page.waitForTimeout(5000)

// Screenshot 2: After wandering
await page.screenshot({ path: '/tmp/nerve-center-wandered.png', fullPage: false })
console.log('Screenshot 2 saved: /tmp/nerve-center-wandered.png (after wandering)')

// Switch to Dashboard tab (this destroys the Phaser scene, triggering shutdown+flush)
const dashLink = page.locator('text=Dashboard').first()
if (await dashLink.isVisible()) {
  await dashLink.click()
  await page.waitForTimeout(2000)
  console.log('Switched to Dashboard')
}

// Switch back to Nerve Center (scene recreates, should restore positions)
const navLink2 = page.locator('text=Nerve Center').first()
if (await navLink2.isVisible()) {
  await navLink2.click()
  await page.waitForTimeout(5000) // Wait for Phaser canvas to re-render
}

// Screenshot 3: After tab switch (should show agents in same positions)
await page.screenshot({ path: '/tmp/nerve-center-restored.png', fullPage: false })
console.log('Screenshot 3 saved: /tmp/nerve-center-restored.png (after tab switch)')

// Also at 1440x900
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(2000)
await page.screenshot({ path: '/tmp/nerve-center-1440.png', fullPage: false })
console.log('Screenshot 4 saved: /tmp/nerve-center-1440.png (1440x900)')

await browser.close()
console.log('Done! Compare initial vs restored screenshots for position persistence.')
