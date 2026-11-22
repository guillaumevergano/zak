import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { clickMenu, firstChrome, forceClose } from './helpers'

const root = join(__dirname, '../..')
// The castLabs Electron binary (the `electron` package exports its path).
const electronPath = require('electron') as unknown as string

let app: ElectronApplication
let chrome: Page

test.beforeAll(async () => {
  app = await electron.launch({
    executablePath: electronPath,
    args: [root],
    env: {
      ...process.env,
      // Kept between runs: the Widevine CDM and the ad-block lists are downloaded only once.
      ZAK_USER_DATA: join(tmpdir(), 'zak-e2e'),
      ZAK_LANG: 'fr',
      ZAK_E2E: '1'
    }
  })
  chrome = await firstChrome(app)
  // The profile is kept between runs, and so are the tabs of the last one: start from a single empty tab.
  await expect(chrome.getByTestId('tab').first()).toBeVisible()
  await chrome.evaluate(async () => {
    const before = await window.zak.invoke('tabs:getState')
    await window.zak.invoke('tabs:create')
    for (const tab of before.tabs) await window.zak.invoke('tabs:close', tab.id)
  })
  await expect(chrome.getByTestId('tab')).toHaveCount(1)
})

test.afterAll(async () => {
  if (app) await forceClose(app)
})

const page = (title: string): string => `data:text/html,<title>${encodeURIComponent(title)}</title><h1>${title}</h1>`

/** Clicks a menu item by id, like its keyboard shortcut would. */
const menu = (id: string): Promise<void> =>
  app.evaluate(({ Menu }, itemId) => Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click(), id)

test('open, navigate, close, close all and reopen tabs', async () => {
  const tabs = chrome.getByTestId('tab')
  const omnibox = chrome.getByTestId('omnibox')

  // New tab: the omnibox gets the focus, typing a URL loads it in that tab.
  await chrome.getByTestId('new-tab').click()
  await expect(tabs).toHaveCount(2)
  await expect(omnibox).toBeFocused()
  await omnibox.fill(page('Alpha'))
  await omnibox.press('Enter')
  await expect(tabs.nth(1)).toHaveAttribute('title', 'Alpha')
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')

  // ✕ closes it and selects the neighbour.
  await tabs.nth(1).hover()
  await tabs.nth(1).getByTestId('tab-close').click()
  await expect(tabs).toHaveCount(1)

  // Cmd/Ctrl+Shift+T brings it back.
  await menu('reopen-tab')
  await expect(tabs).toHaveCount(2)
  await expect(tabs.nth(1)).toHaveAttribute('title', 'Alpha')

  // The broom closes every tab but the active one, without asking (Cmd/Ctrl+Shift+T reopens them).
  for (let i = 0; i < 4; i++) await chrome.getByTestId('new-tab').click()
  await expect(tabs).toHaveCount(6)
  await tabs.nth(1).click()
  await chrome.getByTestId('close-all').click()
  await expect(tabs).toHaveCount(1)
  await expect(tabs.first()).toHaveAttribute('title', 'Alpha')
  await expect(chrome.getByTestId('close-all')).toBeDisabled()
})

test('a new tab keeps the focus in the omnibox while its page loads', async () => {
  // Start from a focused page: the new tab page used to take the focus back once loaded.
  const omnibox = chrome.getByTestId('omnibox')
  await omnibox.fill(page('Focus'))
  await omnibox.press('Enter')
  await expect(chrome.getByTestId('tab').last()).toHaveAttribute('title', 'Focus')
  const focusedUrl = (): Promise<string | undefined> =>
    app.evaluate(({ webContents }) => webContents.getFocusedWebContents()?.getURL())
  await expect.poll(focusedUrl).toContain('Focus')
  await clickMenu(app, 'Nouvel onglet')
  await expect(chrome.getByTestId('tab').last()).toHaveAttribute('title', 'Nouvel onglet')
  await new Promise((r) => setTimeout(r, 1000))
  expect(await focusedUrl()).not.toMatch(/^zak:|^data:/)
  await expect(omnibox).toBeFocused()
})

test('pinned tabs sit on the left and show their title on hover', async () => {
  const omnibox = chrome.getByTestId('omnibox')
  await omnibox.fill(page('Pinned'))
  await omnibox.press('Enter')
  const tab = chrome.getByTestId('tab').filter({ has: chrome.getByText('Pinned') })
  await expect(tab).toHaveCount(1)
  // Not the only tab (alone, e.g. on a retry): on Windows, closing the last tab closes the window, and quits.
  if ((await chrome.getByTestId('tab').count()) < 2) {
    await clickMenu(app, 'Nouvel onglet')
    await expect(chrome.getByTestId('tab')).toHaveCount(2)
  }
  const pinnedId = (): Promise<number | undefined> =>
    app.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getTitle() === 'Pinned')?.id)
  await expect.poll(pinnedId).toBeDefined()
  const id = (await pinnedId())!
  await chrome.evaluate((tabId) => window.zak.invoke('tabs:setPinned', tabId, true), id)
  const pinned = chrome.getByTestId('pinned-tabs').getByTestId('tab')
  await expect(pinned).toHaveCount(1)
  // Away from the strip: the pointer may still be where the pinned tab lands.
  await chrome.mouse.move(600, 400)
  await expect(pinned.getByTestId('pinned-title')).toHaveCSS('max-width', '0px')
  // Left of the broom, which is left of the other tabs.
  const pinBox = (await pinned.boundingBox())!
  const broomBox = (await chrome.getByTestId('close-all').boundingBox())!
  expect(pinBox.x).toBeLessThan(broomBox.x)
  await pinned.hover()
  await expect.poll(async () => (await pinned.boundingBox())!.width).toBeGreaterThan(pinBox.width + 20)
  await chrome.evaluate((tabId) => window.zak.invoke('tabs:close', tabId), id)
})
