import { defineConfig } from '@playwright/test'

/** e2e tests drive the built app (`npm run test:e2e` builds first). */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list'
})
