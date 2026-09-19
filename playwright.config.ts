import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests.
 *
 * These cover what vitest structurally cannot: focus, IME composition, and
 * anything that depends on a real browser's event ordering. The Chinese input
 * field is the motivating case — it broke because a toolbar button stole focus,
 * which no jsdom test can observe.
 */
export default defineConfig({
  testDir: './e2e',
  // The suite drives one shared dev server, so tests must not race each other
  // over its state.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // A real window: headless Chrome reports focus differently enough that a
    // focus regression could pass here and still ship broken.
    headless: true,
  },

  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        // The installed browser rather than a Playwright download: the CDN is
        // unreachable from here, and testing the browser users actually run is
        // no worse.
        channel: 'chrome',
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
