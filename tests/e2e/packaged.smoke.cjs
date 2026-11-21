/**
 * Smoke test of the packaged app (not part of `playwright test`): node tests/e2e/packaged.smoke.cjs
 * after `npm run build:dir`. Checks that what only breaks once packaged works: the asar, the
 * native SQLite module, the libraries' preloads and the internal pages.
 */
const { _electron } = require('@playwright/test')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const exe = {
  darwin: `dist/mac-${process.arch}/ZAK.app/Contents/MacOS/ZAK`,
  win32: 'dist/win-unpacked/ZAK.exe',
  linux: 'dist/linux-unpacked/zak'
}[process.platform]

const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`)
  if (!ok) process.exitCode = 1
}

;(async () => {
  const app = await _electron.launch({
    executablePath: join(__dirname, '../..', exe),
    env: { ...process.env, ZAK_USER_DATA: mkdtempSync(join(tmpdir(), 'zak-packaged-')) }
  })
  const isChrome = (p) => /\/index\.html(\?|$)/.test(p.url()) && !p.url().includes('#overlay')
  for (let i = 0; i < 100 && !app.windows().some(isChrome); i++) await new Promise((r) => setTimeout(r, 200))
  const chrome = app.windows().find(isChrome)
  check(Boolean(chrome), 'chrome UI loaded')
  await chrome.waitForSelector('[data-testid="tab"]')

  const widevine = await chrome.evaluate(() => window.zak.invoke('widevine:getStatus'))
  check(widevine.ready, `Widevine CDM ready (${widevine.detail.slice(0, 80)}…)`)

  const id = await chrome.evaluate(() =>
    window.zak.invoke('favorites:add', { title: 'Test', url: 'https://example.com/', emoji: '⭐', folderId: null })
  )
  check(typeof id === 'string' && id.length > 0, 'SQLite (better-sqlite3) works from the package')

  for (let i = 0; i < 50 && !app.windows().some((p) => p.url().startsWith('zak://newtab')); i++) await new Promise((r) => setTimeout(r, 200))
  const newtab = app.windows().find((p) => p.url().startsWith('zak://newtab'))
  check(Boolean(newtab) && (await newtab.textContent('h1')) === 'Un peu d’espace.', 'internal page zak://newtab served from the asar')

  const ua = await chrome.evaluate(() => navigator.userAgent)
  check(!/Electron|ZAK/.test(ua), `Chrome user agent (${ua})`)

  // Electron reads preloads through its asar-aware fs: they only need to exist.
  const preloads = await app.evaluate(({ session }) => {
    const fs = process.getBuiltinModule('node:fs')
    return session.fromPartition('persist:main').getPreloadScripts().map((p) => fs.existsSync(p.filePath))
  })
  check(preloads.length >= 3 && preloads.every(Boolean), `extension and Web Store preloads found (${preloads.length})`)

  await app.close()
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
