import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    launchOptions: {
      executablePath: '/local/home/wabo/.cache/ms-playwright/chromium-1212/chrome-linux64/chrome',
    },
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- -p 3000',
    port: 3000,
    timeout: 30_000,
    reuseExistingServer: true,
  },
})
