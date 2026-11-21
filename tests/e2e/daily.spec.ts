import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { activeTabTitle, clickMenu, launch, pageAt, serve, visit } from './helpers'

let app: ElectronApplication
let chrome: Page
let server: Server
let origin: string
let profile: string

test.beforeAll(async () => {
  ;({ server, origin } = await serve((req, res) => {
    const path = req.url ?? '/'
    if (path === '/notes.txt') {
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Disposition', 'attachment; filename="notes.txt"')
      res.end('hello')
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (path === '/notify') {
      res.end('<title>notify</title><p>Notifications</p>')
      return
    }
    const name = path.slice(1) || 'home'
    res.end(`<title>Page ${name}</title><p>banane, banane et encore banane.</p>`)
  }))
  ;({ app, chrome, profile } = await launch('daily'))
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

/** The overlay view (popovers and panels above the page). */
async function overlay(): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().endsWith('#overlay'))).toBe(true)
  return app.windows().find((p) => p.url().endsWith('#overlay'))!
}

test('omnibox suggests history pages and opens the selected one', async () => {
  await visit(chrome, `${origin}/alpha`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page alpha')
  await chrome.getByTestId('new-tab').click()
  const omnibox = chrome.getByTestId('omnibox')
  await omnibox.pressSequentially('127.0.0.1')
  const pop = await overlay()
  const items = pop.getByTestId('suggestion')
  await expect(items.filter({ hasText: 'Page alpha' })).toBeVisible()
  // First row: the address itself, then a search, then history.
  await expect(items.first()).toHaveAttribute('aria-selected', 'true')
  const index = await items.evaluateAll((els) => els.findIndex((el) => el.textContent?.includes('Page alpha')))
  for (let i = 0; i < index; i++) await omnibox.press('ArrowDown')
  await expect(items.nth(index)).toHaveAttribute('aria-selected', 'true')
  await omnibox.press('Enter')
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page alpha')
  await expect(pop.getByTestId('suggestions')).toHaveCount(0)
})

test('find in page counts matches and moves between them', async () => {
  await clickMenu(app, 'Rechercher dans la page…')
  const pop = await overlay()
  const input = pop.getByRole('textbox', { name: 'Rechercher dans la page' })
  await input.fill('banane')
  await expect(pop.getByTestId('find-count')).toHaveText('1/3')
  await input.press('Enter')
  await expect(pop.getByTestId('find-count')).toHaveText('2/3')
  await input.press('Shift+Enter')
  await expect(pop.getByTestId('find-count')).toHaveText('1/3')
  await input.fill('kiwi')
  await expect(pop.getByTestId('find-count')).toHaveText('0/0')
  await input.press('Escape')
  await expect(pop.getByTestId('find-bar')).toHaveCount(0)
})

test('zoom is remembered per site', async () => {
  await clickMenu(app, 'Zoom avant')
  await expect(chrome.getByTestId('zoom-badge')).toHaveText('110 %')
  await chrome.getByTestId('new-tab').click()
  await visit(chrome, `${origin}/beta`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page beta')
  await expect(chrome.getByTestId('zoom-badge')).toHaveText('110 %')
  await chrome.getByTestId('zoom-badge').click()
  await expect(chrome.getByTestId('zoom-badge')).toHaveCount(0)
})

test('permission prompt under the omnibox, remembered for the site', async () => {
  await visit(chrome, `${origin}/notify`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('notify')
  const page = await pageAt(app, `${origin}/notify`)
  const answer = page.evaluate(() => Notification.requestPermission())
  const pop = await overlay()
  await expect(pop.getByTestId('permission-prompt')).toContainText('127.0.0.1')
  await expect(pop.getByTestId('permission-prompt')).toContainText('notifications')
  await pop.getByRole('button', { name: 'Autoriser' }).click()
  expect(await answer).toBe('granted')
  // Remembered: no prompt the second time, and the page sees it.
  expect(await page.evaluate(() => Notification.requestPermission())).toBe('granted')
  expect(await page.evaluate(() => Notification.permission)).toBe('granted')

  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')
  const list = settings.getByRole('list', { name: 'Autorisations mémorisées' })
  await expect(list).toContainText('Notifications')
  await list.getByRole('button', { name: 'Oublier' }).click()
  await expect(settings.getByText('Aucune autorisation mémorisée.')).toBeVisible()
})

test('downloads go to the downloads folder and show in the toolbar panel', async () => {
  await visit(chrome, `${origin}/notes.txt`)
  await expect(chrome.getByTestId('downloads-button')).toBeVisible()
  await expect.poll(() => existsSync(join(profile, 'Downloads', 'notes.txt'))).toBe(true)
  await chrome.getByTestId('downloads-button').click()
  const pop = await overlay()
  const item = pop.getByTestId('download').filter({ hasText: 'notes.txt' })
  await expect(item).toBeVisible()
  await expect(item.getByTestId('download-status')).toHaveText('5 o')
  // A second one doesn't overwrite the first.
  await pop.keyboard.press('Escape')
  await visit(chrome, `${origin}/notes.txt`)
  await expect.poll(() => existsSync(join(profile, 'Downloads', 'notes (1).txt'))).toBe(true)
})
