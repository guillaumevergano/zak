import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { firstChrome } from './helpers'

const root = join(__dirname, '../..')
const electronPath = require('electron') as unknown as string
const fixture = join(__dirname, '../fixtures/hello-extension')
/** Localized from _locales (fr or en, depending on the machine). */
const NAME = /Bonjour Test|Hello Test/

let app: ElectronApplication
let chrome: Page

test.beforeAll(async () => {
  const profile = mkdtempSync(join(tmpdir(), 'zak-e2e-extensions-'))
  app = await electron.launch({
    executablePath: electronPath,
    args: [root],
    env: { ...process.env, ZAK_USER_DATA: profile, ZAK_LANG: 'fr', ZAK_E2E: '1' }
  })
  chrome = await firstChrome(app)
  await expect(chrome.getByTestId('tab')).toHaveCount(1)
  // Installing from the Web Store needs the network: load an unpacked test extension instead.
  await app.evaluate(async ({ session }, path) => {
    await session.fromPartition('persist:main').extensions.loadExtension(path)
  }, fixture)
})

test.afterAll(async () => {
  await app?.close()
})

const loadedIds = (): Promise<string[]> =>
  app.evaluate(({ session }) =>
    session
      .fromPartition('persist:main')
      .extensions.getAllExtensions()
      .map((e) => e.id)
  )

async function pageAt(prefix: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().startsWith(prefix))).toBe(true)
  return app.windows().find((p) => p.url().startsWith(prefix))!
}

test('manage an extension on zak://extensions', async () => {
  const omnibox = chrome.getByTestId('omnibox')
  await chrome.getByTestId('new-tab').click()
  await omnibox.fill('zak://extensions')
  await omnibox.press('Enter')

  const page = await pageAt('zak://extensions')
  const card = page.getByRole('listitem').filter({ hasText: NAME })
  await expect(card).toBeVisible()
  await expect(card).toContainText('1.2.3')
  await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
  const id = (await card.getAttribute('data-extension-id'))!
  expect(await loadedIds()).toContain(id)

  // Off: unloaded from the session, still listed.
  await card.getByRole('switch').click()
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  expect(await loadedIds()).not.toContain(id)
  await expect(card.getByRole('button', { name: 'Options' })).toHaveCount(0)

  // On again.
  await card.getByRole('switch').click()
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  expect(await loadedIds()).toContain(id)

  // Options open in a new tab.
  await card.getByRole('button', { name: 'Options' }).click()
  const options = await pageAt(`chrome-extension://${id}/options.html`)
  await expect(options.locator('h1')).toHaveText('Options')

  // Uninstall, with the inline confirmation.
  await card.getByRole('button', { name: 'Désinstaller' }).click()
  await card.getByRole('button', { name: 'Désinstaller' }).click()
  await expect(card).toHaveCount(0)
  expect(await loadedIds()).not.toContain(id)
  await expect(page.getByText('Aucune extension installée')).toBeVisible()
})

test('web pages cannot reach internal pages', async () => {
  const omnibox = chrome.getByTestId('omnibox')
  await chrome.getByTestId('new-tab').click()
  await omnibox.fill('data:text/html,<title>Hostile</title><a id="go" href="zak://extensions/">go</a>')
  await omnibox.press('Enter')
  const hostile = await pageAt('data:text/html')

  // The API refuses cross-origin calls, with or without CORS.
  const results = await hostile.evaluate(async () => {
    const attempt = (init: RequestInit): Promise<string> =>
      fetch('zak://extensions/api/list', init).then(
        (r) => `status ${r.status} ${r.type}`,
        () => 'blocked'
      )
    return [
      await attempt({ method: 'POST', headers: { 'x-zak-internal': '1' } }),
      await attempt({ method: 'POST', mode: 'no-cors' })
    ]
  })
  for (const result of results) expect(result).not.toMatch(/status 200 (basic|cors)/)

  // Links to zak:// do nothing.
  // (Clicked from the page: Playwright's click would wait for the navigation main cancels.)
  await hostile.evaluate(() => document.getElementById('go')!.click())
  await hostile.waitForTimeout(300)
  expect(hostile.url()).toMatch(/^data:text\/html/)
})

test('pick and order the extension icons of the sidebar in the settings', async () => {
  const actionFixture = join(__dirname, '../fixtures/action-extension')
  const actionId = await app.evaluate(async ({ session }, path) => {
    const ext = await session.fromPartition('persist:main').extensions.loadExtension(path)
    return ext.id
  }, actionFixture)

  const icons = chrome.getByTestId('extension-actions').locator('button.ext-action')
  await expect(chrome.locator(`button.ext-action[id="${actionId}"]`)).toBeVisible()
  const before = await icons.evaluateAll((els) => els.map((e) => e.id))

  const omnibox = chrome.getByTestId('omnibox')
  await chrome.getByTestId('new-tab').click()
  await omnibox.fill('zak://settings')
  await omnibox.press('Enter')
  const page = await pageAt('zak://settings')
  const item = page.locator(`[data-testid="extension-bar-item"][data-extension-id="${actionId}"]`)
  await expect(item).toBeVisible()

  // Hide it: gone from the sidebar; show it again: back.
  await item.getByRole('switch').click()
  await expect(chrome.locator(`button.ext-action[id="${actionId}"]`)).toHaveCount(0)
  await item.getByRole('switch').click()
  await expect(chrome.locator(`button.ext-action[id="${actionId}"]`)).toBeVisible()

  // Move it first: first icon of the sidebar.
  if (before.length > 1) {
    while (!(await item.getByRole('button', { name: /^Monter/ }).isDisabled())) {
      await item.getByRole('button', { name: /^Monter/ }).click()
    }
    await expect(icons.first()).toHaveAttribute('id', actionId)
  }
})
