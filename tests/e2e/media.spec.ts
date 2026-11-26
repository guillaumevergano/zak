import { expect, test, type ElectronApplication } from '@playwright/test'
import { launch, pageAt, serve, visit } from './helpers'

/**
 * A page that plays a tone (a WAV made on the spot) and declares itself like a music site:
 * Media Session title, artist and previous / next handlers. The player can be left out of the
 * document, like Spotify's (`?detached`).
 */
const PAGE = `<title>Musique</title><body><script>
  const rate = 8000, seconds = 30, samples = rate * seconds
  const buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer)
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i / rate * 2 * Math.PI * 440) * 8000, true)
  const audio = new Audio(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })))
  audio.loop = true
  if (!location.search.includes('detached')) document.body.append(audio)
  window.player = audio
  navigator.mediaSession.metadata = new MediaMetadata({ title: 'Ma chanson', artist: 'Mon artiste' })
  navigator.mediaSession.setActionHandler('nexttrack', () => { document.title = 'suivante' })
  navigator.mediaSession.setActionHandler('previoustrack', () => { document.title = 'précédente' })
</script></body>`

const inPage = <T,>(app: ElectronApplication, script: string): Promise<T> =>
  app.evaluate(
    ({ webContents }, script) => webContents.getAllWebContents().find((w) => w.getURL().includes('/music'))!.executeJavaScript(script, true),
    script
  ) as Promise<T>

for (const detached of [false, true]) {
  test(`the sidebar controls what plays${detached ? ', even a player kept out of the page' : ''}`, async () => {
    const { server, origin } = await serve((_req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(PAGE)
    })
    const { app, chrome } = await launch('media')
    try {
      await visit(chrome, `${origin}/music${detached ? '?detached' : ''}`)
      await pageAt(app, origin)
      const card = chrome.getByTestId('media-card')
      await expect(card).toHaveCount(0)

      await inPage(app, 'player.play().then(() => 0)')
      await expect(card.getByTestId('media-title')).toHaveText('Ma chanson', { timeout: 10_000 })
      await expect(card).toContainText('Mon artiste')

      // The site's own previous / next, like the keyboard's media keys.
      await card.getByTestId('media-next').click()
      await expect.poll(() => inPage(app, 'document.title')).toBe('suivante')
      await card.getByTestId('media-previous').click()
      await expect.poll(() => inPage(app, 'document.title')).toBe('précédente')

      // Pause and play again.
      await card.getByTestId('media-play').click()
      await expect.poll(() => inPage(app, 'player.paused')).toBe(true)
      await expect(card.getByRole('button', { name: 'Lecture' })).toBeVisible()
      await card.getByTestId('media-play').click()
      await expect.poll(() => inPage(app, 'player.paused')).toBe(false)
      await expect(card.getByRole('button', { name: 'Pause' })).toBeVisible()

      // Volume and sound.
      await card.getByTestId('media-volume').fill('40')
      await expect.poll(() => inPage(app, 'player.volume')).toBe(0.4)
      await card.getByTestId('media-mute').click()
      const muted = (): Promise<boolean> =>
        app.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('/music'))!.isAudioMuted())
      await expect.poll(muted).toBe(true)
      await card.getByRole('button', { name: 'Réactiver le son' }).click()
      await expect.poll(muted).toBe(false)

      // From another tab: still there, and a click on it comes back to the tab.
      await chrome.getByTestId('new-tab').click()
      await expect(chrome.getByTestId('tab')).toHaveCount(2)
      await expect(card.getByTestId('media-title')).toHaveText('Ma chanson')
      await card.getByRole('button', { name: /Ma chanson/ }).click()
      await expect(chrome.getByTestId('omnibox')).toHaveValue(new RegExp('/music'))

      // The tab closed: nothing left to control.
      await app.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('/music'))!.close())
      await expect(card).toHaveCount(0, { timeout: 10_000 })
    } finally {
      await app.close()
      server.close()
    }
  })
}
