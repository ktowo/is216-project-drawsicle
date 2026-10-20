import { defineConfig, devices } from '@playwright/test';

// Browser tests (e2e/*.spec.js). They run against demo mode (the API inside the browser, with the
// demo data), so no server or database is needed: `pnpm test:e2e`.
// The first time on a machine, get the browser with `pnpm exec playwright install chromium`.
const PORT = 4179;

export default defineConfig({
  testDir: './e2e',
  timeout: 120 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `pnpm exec vite --mode mock --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
