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

// Click the Nerve Center nav item (label: "Nerve Center", key: "town")
const navLink = page.locator('text=Nerve Center').first()
if (await navLink.isVisible()) {
  await navLink.click()
  await page.waitForTimeout(5000) // Wait for Phaser canvas to render
} else {
  console.log('Nerve Center nav link not found, trying fallback...')
  // Try clicking any nav item with the lightning bolt
  const altNav = page.locator('text=⚡').first()
  if (await altNav.isVisible()) {
    await altNav.click()
    await page.waitForTimeout(5000)
  }
}

// Screenshot at full HD
await page.screenshot({ path: '/tmp/nerve-center-tierc.png', fullPage: false })
console.log('Screenshot saved to /tmp/nerve-center-tierc.png')

// Also at 1440
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(2000)
await page.screenshot({ path: '/tmp/nerve-center-tierc-1440.png', fullPage: false })
console.log('Screenshot saved to /tmp/nerve-center-tierc-1440.png')

await browser.close()
