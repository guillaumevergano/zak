import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { _electron as electron, expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { firstChrome, forceClose } from './helpers'

const root = join(__dirname, '../..')
const electronPath = require('electron') as unknown as string
const page = (title: string): string => `data:text/html,<title>${encodeURIComponent(title)}</title><h1>${title}</h1>`

let app: ElectronApplication
let chrome: Page

test.beforeAll(async () => {
  const profile = mkdtempSync(join(tmpdir(), 'zak-e2e-favorites-'))
  app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, ZAK_USER_DATA: profile, ZAK_LANG: 'fr', ZAK_E2E: '1' } })
  chrome = await firstChrome(app)
  await expect(chrome.getByTestId('tab')).toHaveCount(1)
})

test.afterAll(async () => {
  if (app) await forceClose(app)
})

const allTabs = (): Promise<{ url: string; favoriteId: string | null }[]> =>
  chrome.evaluate(async () => (await window.zak.invoke('tabs:getState')).tabs.map((t) => ({ url: t.url, favoriteId: t.favoriteId })))

test('a favorite has its own tab, hidden from the strip: clicking it comes back to it', async () => {
  await chrome.evaluate(async (urls) => {
    await window.zak.invoke('favorites:add', { title: 'Messages', url: urls[0]!, emoji: '💬', folderId: null })
    await window.zak.invoke('favorites:add', { title: 'Musique', url: urls[1]!, emoji: '🎧', folderId: null })
  }, [page('Messages'), page('Musique')])
  const messages = chrome.getByRole('button', { name: 'Messages', exact: true })
  const strip = chrome.getByTestId('tab')

  // First click: its tab opens, but not in the strip.
  await messages.click()
  await expect(messages).toHaveAttribute('aria-current', 'page')
  await expect(strip).toHaveCount(1)
  await expect.poll(allTabs).toHaveLength(2)
  await expect(chrome.getByTestId('omnibox')).toHaveValue(/Messages/)

  // Back to the strip tab: the tile stays open (a dot), not current.
  await strip.first().click()
  await expect(messages).not.toHaveAttribute('aria-current', 'page')
  await expect(messages).toHaveAttribute('data-open', 'true')

  // Again: the same tab, no new one.
  await messages.click()
  await expect(messages).toHaveAttribute('aria-current', 'page')
  expect(await allTabs()).toHaveLength(2)

  // « Tout fermer » leaves it; closing it (⌘W) goes back to the strip tab.
  await chrome.evaluate(async () => {
    const { activeId } = await window.zak.invoke('tabs:getState')
    await window.zak.invoke('tabs:close', activeId!)
  })
  await expect(messages).not.toHaveAttribute('data-open', 'true')
  await expect(strip.first()).toHaveAttribute('aria-selected', 'true')
})

async function dragTo(from: Locator, target: () => Locator): Promise<void> {
  const a = (await from.boundingBox())!
  await chrome.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await chrome.mouse.down()
  await chrome.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 4 })
  // Some drop targets only show during the drag.
  const b = (await target().boundingBox())!
  await chrome.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await chrome.mouse.up()
}

test('favorites go in rows: drop one under the last row to start a new line', async () => {
  const sidebar = chrome.getByTestId('sidebar')
  const rows = sidebar.getByTestId('mosaic-row')
  await expect(rows).toHaveCount(1)
  await dragTo(sidebar.getByRole('button', { name: 'Musique', exact: true }), () => sidebar.getByTestId('new-row'))
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).getByRole('button', { name: 'Musique', exact: true })).toBeVisible()
  await expect(sidebar.getByTestId('new-row')).toHaveCount(0)

  // Back onto the first row: the second one goes away.
  await dragTo(sidebar.getByRole('button', { name: 'Musique', exact: true }), () => rows.first())
  await expect(rows).toHaveCount(1)
})

test('a narrow sidebar shows the folders as icons, and fewer tiles per row', async () => {
  const sidebar = chrome.getByTestId('sidebar')
  await chrome.evaluate(() => window.zak.invoke('folders:add', { name: 'Réseaux', emoji: '🌐' }))
  const folder = sidebar.getByTestId('folder').filter({ hasText: '🌐' })
  await expect(folder).toContainText('Réseaux')
  await chrome.evaluate(() => window.zak.invoke('sidebar:setLayout', { width: 150 }))
  await expect(sidebar).toHaveCSS('width', '150px')
  await expect(folder).not.toContainText('Réseaux')
  await expect(folder.locator('button').first()).toHaveAttribute('title', 'Réseaux')
  const columns = await sidebar.getByTestId('mosaic-row').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(3)
  await chrome.evaluate(() => window.zak.invoke('sidebar:setLayout', { width: 300 }))
  await expect(folder).toContainText('Réseaux')
})
