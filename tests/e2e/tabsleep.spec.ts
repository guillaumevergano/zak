import { expect, test } from '@playwright/test'
import { activeTabTitle, launch, pageAt, serve, visit } from './helpers'

test('idle background tabs go to sleep and come back where they were', async () => {
  const { server, origin } = await serve((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<title>Page ${req.url}</title><p>${req.url}`)
  })
  const { app, chrome } = await launch('tabsleep')
  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')
  await settings.getByRole('combobox', { name: 'Mettre en veille les onglets inactifs' }).selectOption('15')

  await visit(chrome, `${origin}/a`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /a')
  await chrome.getByTestId('new-tab').click()
  await visit(chrome, `${origin}/b`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /b')

  // Some state in the page, to check that it is really unloaded (not kept in the back/forward cache).
  await app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().find((w) => w.getURL().endsWith('/a'))!.executeJavaScript('window.marker = 42')
  )
  await app.evaluate(() => (globalThis as unknown as { zakSleepIdleTabs: () => void }).zakSleepIdleTabs())
  const sleeping = chrome.locator('[data-testid="tab"][data-asleep]')
  await expect(sleeping).toHaveCount(1)
  await expect(sleeping).toHaveAttribute('title', 'Page /a (en veille)')
  expect(await app.evaluate(({ webContents }) => webContents.getAllWebContents().some((w) => w.getURL() === 'about:blank'))).toBe(true)

  // Shown again: reloaded, and about:blank is not left in its history.
  await sleeping.click()
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /a')
  await expect(chrome.locator('[data-testid="tab"][data-asleep]')).toHaveCount(0)
  const marker = await app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().find((w) => w.getURL().endsWith('/a'))!.executeJavaScript('window.marker ?? null')
  )
  expect(marker).toBeNull()
  const history = await app.evaluate(({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/a'))!
    return wc.navigationHistory.getAllEntries().map((e) => e.url)
  })
  expect(history.filter((url) => url === 'about:blank').length).toBeLessThanOrEqual(1) // the initial one only
  expect(history.at(-1)).toMatch(/\/a$/)

  await app.close()
  server.close()
})
