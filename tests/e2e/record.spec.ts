import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { clickMenu, launch, serve, visit } from './helpers'

const overlayOf = (app: ElectronApplication): Page | undefined => app.windows().find((p) => p.url().includes('#overlay'))
const windowAt = (app: ElectronApplication, hash: string): Page | undefined => app.windows().find((p) => p.url().includes(hash))

test('a recording with the camera bubble is saved as a video, and one can throw it away', async () => {
  // Videos go to the downloads folder: a fresh one. The screen is a drawn picture (ZAK_RECORD_FAKE),
  // the camera and microphone Chromium's made-up ones.
  const profile = mkdtempSync(join(tmpdir(), 'zak-e2e-record-'))
  const downloads = mkdtempSync(join(tmpdir(), 'zak-e2e-record-downloads-'))
  writeFileSync(join(profile, 'config.json'), JSON.stringify({ general: { downloadDir: downloads } }))
  const videos = (): string[] => readdirSync(downloads).filter((f) => /\.(mp4|webm)$/.test(f))

  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<title>Page</title><p>Bonjour</p>')
  })
  const { app, chrome } = await launch('record', profile, { ZAK_RECORD_FAKE: '1' })
  try {
    await visit(chrome, `${origin}/page`)

    // The sidebar icon opens the setup panel over the page: a source, the camera and the microphone.
    await chrome.getByTestId('tool-action-record').click()
    await expect.poll(() => overlayOf(app)?.getByTestId('record-setup').isVisible() ?? false).toBe(true)
    const setup = overlayOf(app)!
    await expect(setup.getByTestId('record-source')).toHaveCount(1)
    await expect(setup.getByTestId('record-source').first()).toHaveAttribute('aria-checked', 'true')
    await expect(setup.getByRole('combobox', { name: 'Caméra' })).toBeEnabled()
    await setup.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(setup.getByTestId('record-setup')).toHaveCount(0)

    // The bubble and the controls: a countdown, then the time runs. The File menu now stops it.
    await expect.poll(() => !!windowAt(app, '#recorder-camera=')).toBe(true)
    await expect.poll(() => !!windowAt(app, '#recorder-controls')).toBe(true)
    const controls = windowAt(app, '#recorder-controls')!
    await expect(controls.getByTestId('recorder-controls')).toHaveAttribute('data-phase', 'recording', { timeout: 10_000 })
    await expect(windowAt(app, '#recorder-camera=')!.locator('video')).toHaveJSProperty('readyState', 4)
    await expect(controls.getByTestId('recorder-time')).toHaveText('0:02', { timeout: 5000 })
    await clickMenu(app, 'Arrêter l’enregistrement')

    // A video file in the downloads folder, its thumbnail in the page's corner; the windows close.
    await expect.poll(() => videos().length, { timeout: 10_000 }).toBe(1)
    const file = join(downloads, videos()[0]!)
    expect(videos()[0]).toMatch(/^Enregistrement \d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d\.(mp4|webm)$/)
    await expect.poll(() => overlayOf(app)?.getByTestId('screenshot-toast').textContent() ?? '').toContain('Enregistrement terminé')
    await expect.poll(() => statSync(file).size).toBeGreaterThan(10_000)
    await expect.poll(() => !!windowAt(app, '#recorder-controls')).toBe(false)
    await expect.poll(() => !!windowAt(app, '#recorder-camera=')).toBe(false)

    // Again without the camera, thrown away: no bubble, no file.
    await chrome.getByTestId('tool-action-record').click()
    await expect.poll(() => overlayOf(app)?.getByTestId('record-setup').isVisible() ?? false).toBe(true)
    await overlayOf(app)!.getByRole('checkbox', { name: 'Caméra' }).uncheck()
    await overlayOf(app)!.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.poll(() => !!windowAt(app, '#recorder-controls')).toBe(true)
    const again = windowAt(app, '#recorder-controls')!
    await expect(again.getByTestId('recorder-controls')).toHaveAttribute('data-phase', 'recording', { timeout: 10_000 })
    expect(windowAt(app, '#recorder-camera=')).toBeUndefined()
    await again.getByRole('button', { name: 'Jeter l’enregistrement' }).click()
    await expect.poll(() => !!windowAt(app, '#recorder-controls')).toBe(false)
    await expect.poll(() => videos().length).toBe(1)
    expect(existsSync(file)).toBe(true)
  } finally {
    await app.close()
    server.close()
  }
})
