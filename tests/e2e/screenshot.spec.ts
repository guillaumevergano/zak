import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { clickMenu, launch, pageAt, serve, visit } from './helpers'

/** A PNG's size, read from its header. */
function pngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path)
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

const hasMenuItem = (app: ElectronApplication, label: string): Promise<boolean> =>
  app.evaluate(({ Menu }, label) => {
    const find = (items: Electron.MenuItem[]): boolean => items.some((it) => it.label === label || (!!it.submenu && find(it.submenu.items)))
    return find(Menu.getApplicationMenu()!.items)
  }, label)

const overlayOf = (app: ElectronApplication): Page => app.windows().find((p) => p.url().includes('#overlay'))!

test('a screenshot of a region, the visible page or the whole page is copied and saved, and the tool can be switched off', async () => {
  // Screenshots go to the downloads folder: a fresh one, set in the profile before launch.
  const profile = mkdtempSync(join(tmpdir(), 'zak-e2e-screenshot-'))
  const downloads = mkdtempSync(join(tmpdir(), 'zak-e2e-screenshot-downloads-'))
  writeFileSync(join(profile, 'config.json'), JSON.stringify({ general: { downloadDir: downloads } }))
  const shots = (): string[] => readdirSync(downloads).filter((f) => f.endsWith('.png')).sort()

  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<title>Long</title><body style="margin:0"><div style="height:3000px;background:linear-gradient(#c67afb,#2e1f2d)"></div>')
  })
  const { app, chrome } = await launch('screenshot', profile)
  try {
    await visit(chrome, `${origin}/long`)
    const page = await pageAt(app, origin)
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio }))

    // The whole page, from the File menu: taller than the window, copied, and shown in a thumbnail.
    await clickMenu(app, 'Capture d’écran…')
    await overlayOf(app).getByRole('button', { name: 'Page entière' }).click()
    await expect.poll(shots).toHaveLength(1)
    expect(shots()[0]).toMatch(/^Capture \d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d\.png$/)
    const full = pngSize(join(downloads, shots()[0]!))
    expect(full.height / viewport.ratio).toBeGreaterThanOrEqual(3000)
    await expect(overlayOf(app).getByTestId('screenshot-toast')).toContainText('Capture copiée')
    expect(await app.evaluate(({ clipboard }) => clipboard.has('image/png'))).toBe(true)

    // A region drawn from the page's right-click menu: just that size.
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function (this: Electron.Menu) {
        ;(globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu = this
      }
    })
    await page.mouse.click(300, 300, { button: 'right' })
    await expect.poll(() => app.evaluate(() => !!(globalThis as unknown as { lastMenu?: Electron.Menu }).lastMenu)).toBe(true)
    await app.evaluate(() => (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items.find((it) => it.label === 'Capture d’écran…')!.click())
    const picker = overlayOf(app)
    await expect(picker.getByTestId('screenshot-picker')).toBeVisible()
    await picker.mouse.move(40, 120)
    await picker.mouse.down()
    await picker.mouse.move(140, 160, { steps: 4 })
    await picker.mouse.move(240, 170, { steps: 4 })
    await picker.mouse.up()
    await expect.poll(shots).toHaveLength(2)
    const region = pngSize(join(downloads, shots().find((f) => f !== shots()[0]) ?? shots()[1]!))
    expect(Math.round(region.width / viewport.ratio)).toBe(200)
    expect(Math.round(region.height / viewport.ratio)).toBe(50)

    // The visible page; then Esc leaves without taking anything.
    await clickMenu(app, 'Capture d’écran…')
    await overlayOf(app).getByRole('button', { name: 'Page visible' }).click()
    await expect.poll(shots).toHaveLength(3)
    await expect(overlayOf(app).getByTestId('screenshot-toast')).toBeVisible()
    await clickMenu(app, 'Capture d’écran…')
    await expect(overlayOf(app).getByTestId('screenshot-picker')).toBeVisible()
    await overlayOf(app).keyboard.press('Escape')
    await expect(overlayOf(app).getByTestId('screenshot-picker')).toHaveCount(0)
    expect(shots()).toHaveLength(3)

    // Switched off on zak://extensions: gone from the File menu and from the page's menu.
    await chrome.getByTestId('new-tab').click()
    await visit(chrome, 'zak://extensions')
    const extensions = await pageAt(app, 'zak://extensions')
    await extensions.getByRole('switch', { name: 'Désactiver Capture d’écran' }).click()
    await expect(extensions.getByRole('switch', { name: 'Activer Capture d’écran' })).toBeVisible()
    await expect.poll(() => hasMenuItem(app, 'Capture d’écran…')).toBe(false)
    await chrome.getByTestId('tab').first().click()
    await app.evaluate(() => void ((globalThis as unknown as { lastMenu: Electron.Menu | null }).lastMenu = null))
    await page.mouse.click(300, 300, { button: 'right' })
    await expect.poll(() => app.evaluate(() => !!(globalThis as unknown as { lastMenu?: Electron.Menu | null }).lastMenu)).toBe(true)
    const labels = await app.evaluate(() => (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items.map((it) => it.label))
    expect(labels).not.toContain('Capture d’écran…')
  } finally {
    await app.close()
    server.close()
  }
})
