import { expect, test, type ElectronApplication } from '@playwright/test'
import { activeTabTitle, launch, serve, visit } from './helpers'

async function captureMenus(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function (this: Electron.Menu) {
      ;(globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu = this
    }
  })
}

async function clickMenuItem(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate((_electron, label) => {
    const item = (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items.find((it) => it.label === label)
    if (!item) throw new Error(`No menu item ${label}`)
    item.click()
  }, label)
}

/** Visible tab pages, left to right: [x, width]. */
async function visiblePages(app: ElectronApplication): Promise<[number, number][]> {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 0)!
    return win.contentView.children
      .filter((v) => 'webContents' in v && v.getVisible() && !(v as Electron.WebContentsView).webContents.getURL().startsWith('file:'))
      .map((v) => v.getBounds())
      .filter((b) => b.width > 0 && b.y > 40) // tab pages sit under the bars (not the overlay)
      .sort((a, b) => a.x - b.x)
      .map((b) => [b.x, b.width] as [number, number])
  })
}

test('two tabs can be shown side by side, by drag & drop or the tab menu, and come back with the session', async () => {
  const { server, origin } = await serve((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<title>Page ${req.url}</title>`)
  })
  let { app, chrome, profile } = await launch('splitview')
  await captureMenus(app)
  await visit(chrome, `${origin}/a`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /a')
  await chrome.getByTestId('new-tab').click()
  await visit(chrome, `${origin}/b`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /b')
  await expect.poll(async () => (await visiblePages(app)).length).toBe(1)

  // Hold tab b over the middle of tab a, then drop: one pill, two pages.
  const tabs = chrome.getByTestId('tab')
  const a = (await tabs.nth(0).boundingBox())!
  const b = (await tabs.nth(1).boundingBox())!
  await chrome.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await chrome.mouse.down()
  await chrome.mouse.move(b.x + b.width / 2 - 10, b.y + b.height / 2, { steps: 4 })
  await chrome.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 12 })
  await expect(chrome.locator('[data-merge-target]')).toHaveCount(1)
  await chrome.mouse.up()
  await expect(chrome.getByTestId('split-tab')).toHaveCount(1)
  await expect(chrome.getByTestId('split-divider')).toBeVisible()
  await expect.poll(async () => (await visiblePages(app)).length).toBe(2)
  const [left, right] = await visiblePages(app)
  expect(left![0] + left![1]).toBeLessThan(right![0])
  // b came from the right: it stays on the right, and it is the tab in use.
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /b')

  // Clicking the other half makes it the active tab; both pages stay on screen.
  await tabs.nth(0).click()
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /a')
  await expect.poll(async () => (await visiblePages(app)).length).toBe(2)

  // Separate: the tab in use takes the whole area.
  await tabs.nth(0).click({ button: 'right' })
  await clickMenuItem(app, 'Séparer les onglets')
  await expect(chrome.getByTestId('split-tab')).toHaveCount(0)
  await expect.poll(async () => (await visiblePages(app)).length).toBe(1)

  // From the menu of a background tab: next to the active one.
  await tabs.nth(1).click({ button: 'right' })
  await clickMenuItem(app, 'Afficher à côté de l’onglet actif')
  await expect(chrome.getByTestId('split-tab')).toHaveCount(1)
  await expect.poll(async () => (await visiblePages(app)).length).toBe(2)
  await app.close()

  // Relaunch: the split view is back.
  ;({ app, chrome } = await launch('splitview', profile))
  await expect(chrome.getByTestId('split-tab')).toHaveCount(1)
  await expect.poll(async () => (await visiblePages(app)).length).toBe(2)

  // Closing one of the two: the other takes the whole area.
  await chrome.getByTestId('tab').nth(0).hover()
  await chrome.getByTestId('tab-close').nth(0).click()
  await expect(chrome.getByTestId('split-tab')).toHaveCount(0)
  await expect.poll(async () => (await visiblePages(app)).length).toBe(1)
  await app.close()
  server.close()
})
