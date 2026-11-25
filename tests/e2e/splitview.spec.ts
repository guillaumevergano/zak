import { expect, test, type ElectronApplication } from '@playwright/test'
import { activeTabTitle, launch, serve, visit } from './helpers'

async function captureMenus(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function (this: Electron.Menu) {
      ;(globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu = this
    }
  })
}

async function clickMenuItem(app: ElectronApplication, ...path: string[]): Promise<void> {
  await app.evaluate((_electron, labels) => {
    let items = (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items
    for (const [i, label] of labels.entries()) {
      const item = items.find((it) => it.label === label)
      if (!item) throw new Error(`No menu item ${label}`)
      if (i === labels.length - 1) item.click()
      else items = item.submenu!.items
    }
  }, path)
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

/** Zoom (%) of each tab page, by path. */
async function zooms(app: ElectronApplication): Promise<Record<string, number>> {
  return app.evaluate(({ webContents }) =>
    Object.fromEntries(
      webContents
        .getAllWebContents()
        .filter((wc) => wc.getURL().startsWith('http://127.0.0.1'))
        .map((wc) => [new URL(wc.getURL()).pathname, Math.round(wc.getZoomFactor() * 100)])
    )
  )
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

  // Drag tab b over the middle of tab a (crossing its edge first, like a hand would), then drop:
  // one pill, two pages.
  const tabs = chrome.getByTestId('tab')
  const a = (await tabs.nth(0).boundingBox())!
  const b = (await tabs.nth(1).boundingBox())!
  await chrome.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await chrome.mouse.down()
  await chrome.mouse.move(b.x + b.width / 2 - 10, b.y + b.height / 2, { steps: 4 })
  await chrome.mouse.move(a.x + a.width - 10, a.y + a.height / 2, { steps: 8 })
  await expect(chrome.locator('[data-merge-target]')).toHaveCount(0) // its edge: reorder
  await chrome.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 8 })
  await expect(chrome.locator('[data-merge-target]')).toHaveCount(1)
  // The strip stays still: tab a is still under the pointer.
  await expect.poll(async () => Math.round((await chrome.locator('[data-merge-target]').boundingBox())!.x)).toBe(Math.round(a.x))
  await chrome.mouse.up()
  await expect(chrome.getByTestId('split-tab')).toHaveCount(1)
  await expect(chrome.getByTestId('split-divider')).toBeVisible()
  await expect.poll(async () => (await visiblePages(app)).length).toBe(2)
  const [left, right] = await visiblePages(app)
  expect(left![0] + left![1]).toBeLessThan(right![0])
  // b came from the right: it stays on the right, and it is the tab in use.
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /b')
  // Both pages are zoomed out on their own; another tab of the same site keeps its zoom.
  await expect.poll(() => zooms(app)).toEqual({ '/a': 80, '/b': 80 })
  // dnd-kit swallows clicks for 50 ms after a drop (no hand is that fast).
  await chrome.waitForTimeout(100)
  await chrome.getByTestId('new-tab').click()
  await expect(chrome.getByTestId('tab')).toHaveCount(3)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Nouvel onglet')
  await visit(chrome, `${origin}/c`)
  await expect.poll(() => zooms(app)).toEqual({ '/a': 80, '/b': 80, '/c': 100 })
  await chrome.getByTestId('tab').nth(2).hover()
  await chrome.getByTestId('tab-close').nth(2).click()

  // Clicking the other half makes it the active tab; both pages stay on screen.
  await tabs.nth(0).click()
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /a')
  await expect.poll(async () => (await visiblePages(app)).length).toBe(2)

  // Separate: the tab in use takes the whole area.
  await tabs.nth(0).click({ button: 'right' })
  await clickMenuItem(app, 'Séparer les onglets')
  await expect(chrome.getByTestId('split-tab')).toHaveCount(0)
  await expect.poll(async () => (await visiblePages(app)).length).toBe(1)
  await expect.poll(() => zooms(app)).toEqual({ '/a': 100, '/b': 100 })

  // From the tab menu: « Afficher côte à côte avec › » lists the other tabs.
  await tabs.nth(1).click({ button: 'right' })
  await clickMenuItem(app, 'Afficher côte à côte avec', 'Page /a')
  await expect(chrome.getByTestId('split-tab')).toHaveCount(1)
  await expect.poll(async () => (await visiblePages(app)).length).toBe(2)
  await app.close()

  // Relaunch: the split view is back.
  ;({ app, chrome } = await launch('splitview', profile))
  await expect(chrome.getByTestId('split-tab')).toHaveCount(1)
  await expect.poll(async () => (await visiblePages(app)).length).toBe(2)
  await expect.poll(() => zooms(app)).toEqual({ '/a': 80, '/b': 80 })

  // Closing one of the two: the other takes the whole area.
  await chrome.getByTestId('tab').nth(0).hover()
  await chrome.getByTestId('tab-close').nth(0).click()
  await expect(chrome.getByTestId('split-tab')).toHaveCount(0)
  await expect.poll(async () => (await visiblePages(app)).length).toBe(1)
  await app.close()
  server.close()
})
