import { defineConfig, devices } from '@playwright/test';

// Playwright E2E configuration (T06/T07 specs live in ./e2e).
//
// The app under test is the React SPA. By default Playwright boots the Vite dev
// server (which proxies /api to the Go backend, see vite.config.ts). To run
// against the production artifact instead — the Go binary serving the embedded
// SPA — set E2E_BASE_URL to that server's origin and Playwright will reuse it
// rather than starting Vite.
//
// Override the base URL with E2E_BASE_URL; CI is detected via process.env.CI.
const PORT = Number(process.env.E2E_PORT ?? 5173);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

// Only manage a dev server when targeting the default local Vite origin.
const usesManagedServer = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  // Fail fast in CI if a test was accidentally left focused.
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Boot the SPA dev server before the suite (unless pointed at an external URL).
  webServer: usesManagedServer
    ? {
        command: `pnpm run dev -- --port ${PORT} --strictPort`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !isCI,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
