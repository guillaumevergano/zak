import { expect, test } from '@playwright/test'
import { launch, pageAt, serve, visit } from './helpers'

/** A tone (a WAV made on the spot), so the tab makes sound. */
const TONE = `<script>
  const rate = 8000, samples = rate * 30
  const buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer)
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i / rate * 2 * Math.PI * 440) * 8000, true)
  window.player = new Audio(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })))
  player.loop = true
</script>`

test('⌘-click opens a link in a background tab, and the sound badge sits in the tab’s top left corner', async () => {
  const { server, origin } = await serve((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    if (req.url === '/links') res.end('<title>Liens</title><a id="plain" href="/a">A</a> <a id="blank" target="_blank" href="/b">B</a>')
    else if (req.url === '/sound') res.end(`<title>Son</title>${TONE}`)
    else res.end(`<title>${req.url!.slice(1)}</title>`)
  })
  const { app, chrome } = await launch('tabs-background')
  try {
    await visit(chrome, `${origin}/links`)
    const links = await pageAt(app, `${origin}/links`)
    const tabs = chrome.getByTestId('tab')
    const selected = (): Promise<string | null> => chrome.locator('[data-testid="tab"][aria-selected="true"]').getAttribute('title')

    // ⌘-click (Ctrl elsewhere): a new tab, but one stays where one is.
    await links.locator('#plain').click({ modifiers: ['ControlOrMeta'] })
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(1)).toHaveAttribute('title', 'a')
    await chrome.waitForTimeout(500)
    expect(await selected()).toBe('Liens')
    await links.locator('#blank').click({ modifiers: ['ControlOrMeta'] })
    await expect(tabs).toHaveCount(3)
    await chrome.waitForTimeout(500)
    expect(await selected()).toBe('Liens')
    // A plain click on a « new tab » link still goes to it.
    await links.locator('#blank').click()
    await expect(tabs).toHaveCount(4)
    await expect.poll(selected).toBe('b')

    // The sound badge: top left of a pinned tab, where it stays while the tab widens on hover.
    await visit(chrome, `${origin}/sound`)
    const sound = await pageAt(app, `${origin}/sound`)
    await sound.evaluate(() => (window as unknown as { player: HTMLAudioElement }).player.play())
    const id = await app.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().endsWith('/sound'))!.id)
    await chrome.evaluate((tabId) => window.zak.invoke('tabs:setPinned', tabId, true), id)
    const pinned = chrome.getByTestId('pinned-tabs').getByTestId('tab')
    const badge = pinned.getByTestId('tab-sound')
    await expect(badge).toBeVisible({ timeout: 10_000 })
    await chrome.mouse.move(600, 400)
    await expect(pinned.getByTestId('pinned-title')).toHaveCSS('max-width', '0px')
    const tabBox = (await pinned.boundingBox())!
    const before = (await badge.boundingBox())!
    expect(before.x - tabBox.x).toBeLessThan(4)
    expect(before.y - tabBox.y).toBeLessThan(4)
    await pinned.hover({ position: { x: tabBox.width - 4, y: tabBox.height - 4 } })
    await expect.poll(async () => (await pinned.boundingBox())!.width).toBeGreaterThan(tabBox.width + 20)
    expect((await badge.boundingBox())!.x).toBeCloseTo(before.x, 0)
    await badge.click()
    await expect.poll(() => app.evaluate(({ webContents }, tabId) => webContents.fromId(tabId)!.isAudioMuted(), id)).toBe(true)
  } finally {
    await app.close()
    server.close()
  }
})
