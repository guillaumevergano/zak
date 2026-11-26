import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launch, pageAt, serve, visit } from './helpers'

/** A 16:9 <video> fed by an animated canvas; « Lire » is the user starting it. */
const VIDEO_PAGE = `<!doctype html><title>Vidéo</title>
<button id="play" onclick="document.getElementById('v').play()">Lire</button>
<video id="v" width="640" height="360" playsinline></video>
<canvas id="c" width="320" height="180" hidden></canvas>
<script>
  const c = document.getElementById('c'), ctx = c.getContext('2d'), v = document.getElementById('v')
  let n = 0
  setInterval(() => { ctx.fillStyle = 'hsl(' + (n++ * 7 % 360) + ' 70% 50%)'; ctx.fillRect(0, 0, 320, 180) }, 40)
  v.srcObject = c.captureStream(25)
</script>`

/** Zak's floating player: its window (null when there is none) and where the video's page is. */
const player = (app: ElectronApplication): Promise<{ width: number; height: number; onTop: boolean; holdsPage: boolean } | null> =>
  app.evaluate(({ BaseWindow, BrowserWindow, webContents }) => {
    const page = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/video'))
    const browsers = new Set(BrowserWindow.getAllWindows().map((w) => w.id))
    const mini = BaseWindow.getAllWindows().find((w) => !browsers.has(w.id))
    if (!mini) return null
    const { width, height } = mini.getContentBounds()
    const holdsPage = mini.contentView.children.some((v) => 'webContents' in v && (v as Electron.WebContentsView).webContents === page)
    return { width, height, onTop: mini.isAlwaysOnTop(), holdsPage }
  })

const controls = async (app: ElectronApplication): Promise<Page> => {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#miniplayer'))).toBe(true)
  return app.windows().find((p) => p.url().includes('#miniplayer'))!
}

test('a video one leaves plays on in Zak’s rounded floating player, with its own buttons', async () => {
  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(VIDEO_PAGE)
  })
  const { app, chrome } = await launch('miniplayer')
  try {
    await visit(chrome, `${origin}/video`)
    const video = await pageAt(app, origin)
    await video.getByRole('button', { name: 'Lire' }).click()
    await expect.poll(() => video.evaluate(() => (document.getElementById('v') as HTMLVideoElement).readyState)).toBeGreaterThan(2)
    const paused = (): Promise<boolean> => video.evaluate(() => (document.getElementById('v') as HTMLVideoElement).paused)
    const tabs = chrome.getByTestId('tab')

    // Leaving the tab: the page moves into a small window on top, the video fills it and plays on.
    await chrome.getByTestId('new-tab').click()
    await expect.poll(() => player(app)).toMatchObject({ onTop: true, holdsPage: true })
    const shown = (await player(app))!
    expect(Math.abs(shown.width / shown.height - 16 / 9)).toBeLessThan(0.05)
    expect(await video.evaluate(() => document.getElementById('v')!.matches('[data-zak-floating]:popover-open'))).toBe(true)
    expect(await paused()).toBe(false)

    // Its buttons: pause, play.
    let buttons = await controls(app)
    await buttons.getByTestId('miniplayer-play').click()
    await expect.poll(paused).toBe(true)
    await buttons.getByTestId('miniplayer-play').click()
    await expect.poll(paused).toBe(false)

    // « Revenir à l'onglet »: the page is back in the window, the player gone, the video in its place.
    await buttons.getByTestId('miniplayer-back').click()
    await expect.poll(() => player(app)).toBeNull()
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
    expect(await video.evaluate(() => document.getElementById('v')!.hasAttribute('data-zak-floating'))).toBe(false)
    expect(await paused()).toBe(false)

    // Clicking the tab itself brings it back too.
    await tabs.nth(1).click()
    await expect.poll(() => player(app)).toMatchObject({ holdsPage: true })
    await tabs.first().click()
    await expect.poll(() => player(app)).toBeNull()

    // Closing the player stops the video; the tab one is on stays.
    await tabs.nth(1).click()
    await expect.poll(() => player(app)).toMatchObject({ holdsPage: true })
    buttons = await controls(app)
    await buttons.getByTestId('miniplayer-close').click()
    await expect.poll(() => player(app)).toBeNull()
    await expect.poll(paused).toBe(true)
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    // The page is back in its window (hidden), and shows normally when one comes back.
    await tabs.first().click()
    await expect(video.getByRole('button', { name: 'Lire' })).toBeVisible()
  } finally {
    await app.close()
    server.close()
  }
})
