import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { firstChrome, forceClose } from './helpers'

const root = join(__dirname, '../..')
const electronPath = require('electron') as unknown as string

let app: ElectronApplication
let chrome: Page
let server: Server
let origin: string

test.beforeAll(async () => {
  // /set?name=x sets cookie x=1; every page shows its cookies in its title.
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const name = url.searchParams.get('name')
    if (name) res.setHeader('Set-Cookie', `${name}=1; Path=/`)
    res.setHeader('Content-Type', 'text/html')
    res.end(`<title>cookies:${req.headers.cookie ?? ''}</title>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const profile = mkdtempSync(join(tmpdir(), 'zak-e2e-private-'))
  app = await electron.launch({
    executablePath: electronPath,
    args: [root],
    env: { ...process.env, ZAK_USER_DATA: profile, ZAK_LANG: 'fr', ZAK_E2E: '1' }
  })
  chrome = await firstChrome(app)
  await expect(chrome.getByTestId('tab')).toHaveCount(1)
})

test.afterAll(async () => {
  if (app) await forceClose(app)
  server?.close()
})

/** Clicks an application menu item by label, like Cmd/Ctrl+Shift+N would. */
async function clickMenu(label: string): Promise<void> {
  await app.evaluate(({ Menu }, label) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const item of items) {
        if (item.label === label) return item
        const inner = item.submenu && find(item.submenu.items)
        if (inner) return inner
      }
      return undefined
    }
    const item = find(Menu.getApplicationMenu()!.items)
    if (!item) throw new Error(`No menu item ${label}`)
    item.click()
  }, label)
}

async function openPrivateWindow(): Promise<Page> {
  const before = new Set(app.windows())
  await clickMenu('Nouvelle fenêtre de navigation privée')
  await expect.poll(() => app.windows().some((p) => !before.has(p) && p.url().includes('private=1'))).toBe(true)
  const page = app.windows().find((p) => !before.has(p) && p.url().includes('private=1'))!
  await expect(page.getByTestId('tab')).toHaveCount(1)
  return page
}

async function visit(window: Page, path: string): Promise<void> {
  const omnibox = window.getByTestId('omnibox')
  await omnibox.click()
  await omnibox.fill(`${origin}${path}`)
  await omnibox.press('Enter')
}

async function closePrivateWindows(): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('private=1')) w.close()
  })
  await expect.poll(() => app.windows().some((p) => p.url().includes('private=1'))).toBe(false)
}

const activeTabTitle = (window: Page): Promise<string | null> =>
  window.locator('[data-testid="tab"][aria-selected="true"]').getAttribute('title')

test('private windows have their own throwaway session, dark theme and no extensions', async () => {
  // A cookie in the normal profile.
  await visit(chrome, '/?name=normal')
  // Let the cookie arrive before the next load (Windows is slower to answer: it would be aborted).
  await expect.poll(() => chrome.getByTestId('omnibox').inputValue()).toContain('name=normal')
  await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((w) => w.getURL().includes('name=normal') && !w.isLoading()))).toBe(true)
  await visit(chrome, '/')
  await expect.poll(() => activeTabTitle(chrome)).toBe('cookies:normal=1')

  const priv = await openPrivateWindow()
  await expect(priv.getByTestId('private-badge')).toBeVisible()
  await expect(priv.locator('body')).toHaveClass(/private/)
  await expect(priv.getByTestId('extension-actions')).toHaveCount(0)
  await expect(chrome.getByTestId('private-badge')).toHaveCount(0)

  // It doesn't see the normal profile's cookies, and its own stay inside.
  await visit(priv, '/')
  await expect.poll(() => activeTabTitle(priv)).toBe('cookies:')
  await visit(priv, '/?name=secret')
  await visit(priv, '/')
  await expect.poll(() => activeTabTitle(priv)).toBe('cookies:secret=1')

  const mainCookies = await app.evaluate(async ({ session }) =>
    (await session.fromPartition('persist:main').cookies.get({})).map((c) => c.name)
  )
  expect(mainCookies).toContain('normal')
  expect(mainCookies).not.toContain('secret')

  // Closed, then a new private window: nothing left.
  await closePrivateWindows()
  const again = await openPrivateWindow()
  await visit(again, '/')
  await expect.poll(() => activeTabTitle(again)).toBe('cookies:')
  await closePrivateWindows()
})
