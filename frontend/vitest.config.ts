/// <reference types="vitest/config" />
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Vitest configuration for component/unit tests (RTL + jsdom).
//
// It extends the app's Vite config (so path resolution, plugins, and the React
// transform match production) and layers the test environment on top. Playwright
// E2E specs live under `e2e/` and are intentionally excluded here — they run via
// `playwright.config.ts`, not Vitest.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // RTL renders into a DOM, so we need the jsdom environment.
      environment: 'jsdom',
      // Global APIs (describe/it/expect) without per-file imports.
      globals: true,
      // jest-dom matchers + automatic RTL cleanup between tests.
      setupFiles: ['./src/test/setup.ts'],
      // Only Vitest specs; keep Playwright E2E out of the unit run.
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['node_modules', 'dist', 'e2e/**'],
      css: false,
      restoreMocks: true,
      clearMocks: true,
      coverage: {
        provider: 'v8',
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/api/**'],
      },
    },
  }),
);
