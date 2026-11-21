import type { Server } from 'node:http'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { activeTabTitle, launch, pageAt, serve, visit } from './helpers'

let app: ElectronApplication
let chrome: Page
let server: Server
let origin: string

test.beforeAll(async () => {
  ;({ server, origin } = await serve((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<title>Vidéo</title><div id="box" style="width:200px;height:100px;background:red"></div>')
  }))
  ;({ app, chrome } = await launch('errors'))
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

test('a page that cannot load shows zak://error, keeping its address', async () => {
  // A port nothing listens on any more: connection refused.
  const { server: closed, origin: dead } = await serve(() => {})
  await new Promise((resolve) => closed.close(resolve))
  await visit(chrome, `${dead}/`)
  const error = await pageAt(app, 'zak://error')
  await expect(error.getByRole('heading')).toHaveText('Ce site est inaccessible')
  await expect(error.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  await expect(chrome.getByTestId('omnibox')).toHaveValue(`${dead}/`)
  await expect.poll(() => activeTabTitle(chrome)).toBe(dead.replace('http://', ''))
})

test('HTML full screen covers the whole window, and ends when leaving', async () => {
  await visit(chrome, `${origin}/video`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Vidéo')
  const viewBounds = (): Promise<{ y: number; width: number; window: number }> =>
    app.evaluate(({ BrowserWindow, webContents }) => {
      const page = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/video'))!
      const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 0)!
      const view = win.contentView.children.find((v) => 'webContents' in v && (v as Electron.WebContentsView).webContents === page)!
      return { y: view.getBounds().y, width: view.getBounds().width, window: win.getContentBounds().width }
    })
  expect((await viewBounds()).y).toBeGreaterThan(0)

  await app.evaluate(({ webContents }) => {
    const page = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/video'))!
    return page.executeJavaScript("document.getElementById('box').requestFullscreen(); 0", true)
  })
  await expect.poll(async () => (await viewBounds()).y).toBe(0)
  await expect.poll(async () => {
    const b = await viewBounds()
    return b.width === b.window
  }).toBe(true)

  await app.evaluate(({ webContents }) => {
    const page = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/video'))!
    return page.executeJavaScript('document.exitFullscreen(); 0', true)
  })
  await expect.poll(async () => (await viewBounds()).y).toBeGreaterThan(0)
})
