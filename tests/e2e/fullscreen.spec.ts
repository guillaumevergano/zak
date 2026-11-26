import { expect, test, type ElectronApplication } from '@playwright/test'
import { launch, pageAt, serve, visit } from './helpers'

/** The page's view, its window, and whether the page itself believes it is in full screen. */
const state = (app: ElectronApplication): Promise<{ y: number; windowFullScreen: boolean; pageFullScreen: boolean }> =>
  app.evaluate(async ({ BrowserWindow, webContents }) => {
    const page = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/video'))!
    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 0)!
    const view = win.contentView.children.find((v) => 'webContents' in v && (v as Electron.WebContentsView).webContents === page)!
    const pageFullScreen = (await page.executeJavaScript('!!document.fullscreenElement')) as boolean
    return { y: view.getBounds().y, windowFullScreen: win.isFullScreen(), pageFullScreen }
  })

const inPage = (app: ElectronApplication, script: string): Promise<unknown> =>
  app.evaluate(({ webContents }, script) => webContents.getAllWebContents().find((w) => w.getURL().endsWith('/video'))!.executeJavaScript(script, true), script)

/** Both the window and the page are out of full screen, with Zak's bars back around the page. */
async function expectBack(app: ElectronApplication): Promise<void> {
  await expect.poll(() => state(app), { timeout: 10_000 }).toMatchObject({ windowFullScreen: false, pageFullScreen: false })
  expect((await state(app)).y).toBeGreaterThan(0)
}

test('a video leaves full screen entirely, by the page (Esc, its button) or by the window (green button)', async () => {
  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<title>Vidéo</title><div id="box" style="width:300px;height:200px;background:#c67afb"></div>')
  })
  const { app, chrome } = await launch('fullscreen')
  try {
    await visit(chrome, `${origin}/video`)
    await pageAt(app, origin)
    const enter = async (): Promise<void> => {
      await inPage(app, "document.getElementById('box').requestFullscreen(); 0")
      await expect.poll(() => state(app), { timeout: 10_000 }).toMatchObject({ y: 0, windowFullScreen: true, pageFullScreen: true })
      // macOS animates into full screen: one leaves it once there, like a viewer does.
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }

    // Left by the page: the page itself must hear it once the window is back (YouTube, X stayed giant).
    await enter()
    await inPage(app, 'document.exitFullscreen(); 0')
    await expectBack(app)

    // Left by the window: the page leaves too, instead of covering the whole window.
    await enter()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 0)!.setFullScreen(false))
    await expectBack(app)

    // And it can go back to full screen afterwards.
    await enter()
    await inPage(app, 'document.exitFullscreen(); 0')
    await expectBack(app)
  } finally {
    await app.close()
    server.close()
  }
})
