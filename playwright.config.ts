import { defineConfig, devices } from '@playwright/test';

/**
 * BingoDuel Responsiveness Test Configuration
 * Tests across mobile + desktop device profiles.
 *
 * Run with: npx playwright test
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'iPhone SE', use: { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } } },
    { name: 'iPhone 12', use: { ...devices['iPhone 12'], viewport: { width: 390, height: 844 } } },
    { name: 'iPhone 14 Pro Max', use: { ...devices['iPhone 14 Pro Max'], viewport: { width: 430, height: 932 } } },
    { name: 'iPad Mini', use: { ...devices['iPad Mini'], viewport: { width: 768, height: 1024 } } },
    { name: 'iPad Pro 11 Landscape', use: { ...devices['iPad Pro 11'], viewport: { width: 1194, height: 834 } } },
    { name: 'Pixel 5', use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } } },
    { name: 'Galaxy S9+', use: { ...devices['Galaxy S9+'], viewport: { width: 320, height: 658 } } },
    { name: 'Pixel 7', use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } } },
    { name: 'Desktop 1366x768', use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } } },
    { name: 'Desktop 1920x1080', use: { browserName: 'firefox', viewport: { width: 1920, height: 1080 } } },
    { name: 'Desktop 2560x1440', use: { browserName: 'webkit', viewport: { width: 2560, height: 1440 } } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
