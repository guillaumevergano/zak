import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

const root = join(__dirname, '../..')
const electronPath = require('electron') as unknown as string

/** Launches the built app on a fresh profile (or `profile`, to relaunch on the same one). */
export async function launch(
  name: string,
  profile?: string,
  env: Record<string, string> = {}
): Promise<{ app: ElectronApplication; chrome: Page; profile: string }> {
  const dir = profile ?? mkdtempSync(join(tmpdir(), `zak-e2e-${name}-`))
  const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, ZAK_USER_DATA: dir, ...env } })
  const chrome = await firstChrome(app)
  await expect(chrome.getByTestId('tab').first()).toBeVisible()
  return { app, chrome, profile: dir }
}

/**
 * The chrome UI of the first browser window. Not `app.firstWindow()`: on a fresh profile the
 * « Préparation du lecteur vidéo… » splash can come first.
 */
export async function firstChrome(app: ElectronApplication): Promise<Page> {
  const isChrome = (p: Page): boolean => /\/index\.html(\?|$)|^http:\/\/localhost:\d+\/$/.test(p.url()) && !p.url().includes('#overlay')
  await expect.poll(() => app.windows().some(isChrome), { timeout: 30_000 }).toBe(true)
  return app.windows().find(isChrome)!
}

/** A local HTTP server; `handler` answers every request. */
export async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

/** Clicks an application menu item by label, like its keyboard shortcut would. */
export async function clickMenu(app: ElectronApplication, label: string): Promise<void> {
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

/** The page (tab or internal page) whose URL starts with `prefix`. */
export async function pageAt(app: ElectronApplication, prefix: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().startsWith(prefix))).toBe(true)
  return app.windows().find((p) => p.url().startsWith(prefix))!
}

/** Types into the omnibox of `window` and presses Enter. */
export async function visit(window: Page, url: string): Promise<void> {
  const omnibox = window.getByTestId('omnibox')
  await omnibox.click()
  await omnibox.fill(url)
  await omnibox.press('Enter')
}

export const activeTabTitle = (window: Page): Promise<string | null> =>
  window.locator('[data-testid="tab"][aria-selected="true"]').getAttribute('title')
