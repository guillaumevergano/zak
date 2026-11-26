import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { firstChrome, forceClose } from './helpers'

const root = join(__dirname, '../..')
const electronPath = require('electron') as unknown as string

/**
 * A plain HTML5 player: a 640×360 <video> fed by an animated canvas, so no media file is needed.
 * It starts by itself, like a video in a feed; « Lire » is the user starting it.
 */
const VIDEO_PAGE = `<!doctype html><title>Video</title>
<button id="play" onclick="document.getElementById('v').play()">Lire</button>
<video id="v" width="640" height="360" playsinline></video>
<canvas id="c" width="320" height="180" hidden></canvas>
<script>
  const c = document.getElementById('c'), ctx = c.getContext('2d'), v = document.getElementById('v')
  let n = 0
  setInterval(() => { ctx.fillStyle = 'hsl(' + (n++ * 7 % 360) + ' 70% 50%)'; ctx.fillRect(0, 0, 320, 180) }, 40)
  v.srcObject = c.captureStream(25)
  v.play()
</script>`

let app: ElectronApplication
let chrome: Page
let server: Server
let videoUrl: string

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(VIDEO_PAGE)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  videoUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/video`

  const profile = mkdtempSync(join(tmpdir(), 'zak-e2e-pip-'))
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

async function pageAt(prefix: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().startsWith(prefix))).toBe(true)
  return app.windows().find((p) => p.url().startsWith(prefix))!
}

async function openInNewTab(url: string): Promise<void> {
  await chrome.getByTestId('new-tab').click()
  const omnibox = chrome.getByTestId('omnibox')
  await omnibox.fill(url)
  await omnibox.press('Enter')
}

const inPip = (video: Page): Promise<boolean> => video.evaluate(() => document.pictureInPictureElement !== null)
const activate = (title: string): Promise<void> => chrome.getByTestId('tab').and(chrome.locator(`[title="${title}"]`)).click()

/** Leaves the video tab for another one and tells whether its video went to PiP. */
async function leaveAndCheck(video: Page, expected: boolean): Promise<void> {
  await activate('Video')
  await expect.poll(() => video.evaluate(() => !(document.getElementById('v') as HTMLVideoElement).paused)).toBe(true)
  await activate('Réglages')
  if (expected) await expect.poll(() => inPip(video)).toBe(true)
  else {
    await video.waitForTimeout(600)
    expect(await inPip(video)).toBe(false)
  }
}

test('a video the user started goes to PiP when leaving its tab, and comes back', async () => {
  await openInNewTab(videoUrl)
  const video = await pageAt(videoUrl)
  await expect(chrome.getByTestId('tab').last()).toHaveAttribute('title', 'Video')
  await expect.poll(() => video.evaluate(() => (document.getElementById('v') as HTMLVideoElement).readyState)).toBeGreaterThan(2)

  // Started by the page itself (a feed): it stays in its tab.
  await openInNewTab('zak://settings')
  const settings = await pageAt('zak://settings')
  await expect(chrome.getByTestId('tab').last()).toHaveAttribute('title', 'Réglages')
  await video.waitForTimeout(600)
  expect(await inPip(video)).toBe(false)

  // Unless « Aussi les vidéos qui se lancent toutes seules » is on.
  await settings.getByRole('switch', { name: 'Aussi les vidéos qui se lancent toutes seules' }).click()
  await leaveAndCheck(video, true)
  await activate('Video')
  await settings.getByRole('switch', { name: 'Aussi les vidéos qui se lancent toutes seules' }).click()
  await leaveAndCheck(video, false)

  // Started by the user: it goes to PiP.
  await activate('Video')
  await video.evaluate(() => (document.getElementById('v') as HTMLVideoElement).pause())
  await video.getByRole('button', { name: 'Lire' }).click()
  await activate('Réglages')
  await expect.poll(() => inPip(video)).toBe(true)

  // Back on the video tab: the PiP window closes.
  await activate('Video')
  await expect.poll(() => inPip(video)).toBe(false)

  // A paused video doesn't trigger it.
  await video.evaluate(() => (document.getElementById('v') as HTMLVideoElement).pause())
  await activate('Réglages')
  await video.waitForTimeout(600)
  expect(await inPip(video)).toBe(false)
  await video.evaluate(() => (document.getElementById('v') as HTMLVideoElement).play())

  // Excluded site (typed as a URL: kept as its domain).
  await settings.getByRole('textbox', { name: 'Site à exclure' }).fill('http://127.0.0.1/whatever')
  await settings.getByRole('button', { name: 'Ajouter' }).click()
  await expect(settings.getByRole('list', { name: 'Sites exclus' })).toHaveText(/127\.0\.0\.1/)
  await leaveAndCheck(video, false)
  await settings.getByRole('button', { name: 'Retirer 127.0.0.1' }).click()
  await expect(settings.getByRole('list', { name: 'Sites exclus' })).toHaveCount(0)
  await leaveAndCheck(video, true)

  // Muted videos: still PiP by default, not once "Ignorer les vidéos muettes" is on.
  await video.evaluate(() => ((document.getElementById('v') as HTMLVideoElement).muted = true))
  await leaveAndCheck(video, true)
  await settings.getByRole('switch', { name: 'Ignorer les vidéos muettes' }).click()
  await expect(settings.getByRole('switch', { name: 'Ignorer les vidéos muettes' })).toHaveAttribute('aria-checked', 'true')
  await leaveAndCheck(video, false)

  // Switched off entirely.
  await video.evaluate(() => ((document.getElementById('v') as HTMLVideoElement).muted = false))
  await settings.getByRole('switch', { name: 'Lecteur flottant automatique' }).click()
  await leaveAndCheck(video, false)

  // Saved: a reload of the page shows the same settings.
  await settings.reload()
  await expect(settings.getByRole('switch', { name: 'Lecteur flottant automatique' })).toHaveAttribute('aria-checked', 'false')
  await expect(settings.getByRole('switch', { name: 'Ignorer les vidéos muettes' })).toHaveAttribute('aria-checked', 'true')
})
