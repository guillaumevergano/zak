import { defineConfig } from '@playwright/test'

/** e2e tests drive the built app (`npm run test:e2e` builds first). */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  // CI runners are slow and share the network (Widevine and filter lists are downloaded per
  // fresh profile): one retry there, so a slow start doesn't fail the run. Never locally.
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list'
})
