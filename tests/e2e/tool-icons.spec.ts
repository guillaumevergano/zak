import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launch, pageAt, serve, visit } from './helpers'

const overlayOf = (app: ElectronApplication): Page => app.windows().find((p) => p.url().includes('#overlay'))!

test("Zak's tools have an icon in the sidebar, which can be hidden while the tool keeps working", async () => {
  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<title>Page</title><p>Bonjour</p>')
  })
  const { app, chrome, profile } = await launch('tool-icons')
  try {
    await visit(chrome, `${origin}/page`)
    const screenshot = chrome.getByTestId('tool-action-screenshot')
    const translate = chrome.getByTestId('tool-action-translate')
    await expect(screenshot).toBeVisible()
    await expect(translate).toBeVisible()

    // The camera opens the screenshot picker over the page.
    await screenshot.click()
    await expect.poll(() => overlayOf(app)?.getByTestId('screenshot-picker').isVisible() ?? false).toBe(true)
    await overlayOf(app).keyboard.press('Escape')
    await expect(overlayOf(app).getByTestId('screenshot-picker')).toHaveCount(0)

    // The translation icon opens the page through Google Traduction, in a new tab beside it.
    await expect(chrome.getByTestId('tab')).toHaveCount(1)
    await translate.click()
    await expect(chrome.getByTestId('tab')).toHaveCount(2)

    // zak://extensions: the icon unticked, the tool still on.
    await visit(chrome, 'zak://extensions')
    const extensions = await pageAt(app, 'zak://extensions')
    const card = extensions.locator('[data-tool-id="translate"]')
    await card.getByRole('checkbox', { name: 'Icône de Traduction dans la barre latérale' }).uncheck()
    await expect(translate).toHaveCount(0)
    await expect(screenshot).toBeVisible()
    await expect(card.getByRole('switch', { name: 'Désactiver Traduction' })).toBeVisible()
    const config = (): { extensionBar: { hidden: string[] }; tools: { translate: { enabled?: boolean } } } =>
      JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8'))
    expect(config().extensionBar.hidden).toContain('zak:translate')
    expect(config().tools?.translate?.enabled ?? true).toBe(true)

    // The tool switched off: no icon either, whatever was chosen; switched back on, the camera returns.
    await extensions.locator('[data-tool-id="screenshot"]').getByRole('switch', { name: 'Désactiver Capture d’écran' }).click()
    await expect(screenshot).toHaveCount(0)
    await expect(extensions.locator('[data-tool-id="screenshot"]').getByRole('checkbox')).toHaveCount(0)
    await extensions.locator('[data-tool-id="screenshot"]').getByRole('switch', { name: 'Activer Capture d’écran' }).click()
    await expect(screenshot).toBeVisible()

    // zak://settings lists the tools among the extensions, in the bar's order.
    await visit(chrome, 'zak://settings')
    const settings = await pageAt(app, 'zak://settings')
    const items = settings.getByTestId('extension-bar-item')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toHaveAttribute('data-extension-id', 'zak:screenshot')
    await expect(items.nth(1)).toHaveAttribute('data-extension-id', 'zak:translate')
    await settings.getByRole('button', { name: 'Descendre Capture d’écran' }).click()
    await settings.getByRole('switch', { name: 'Afficher Traduction dans la barre latérale' }).click()
    await expect(chrome.getByTestId('extension-actions').locator('button')).toHaveCount(2)
    const order = await chrome.getByTestId('extension-actions').locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('data-testid')))
    expect(order).toEqual(['tool-action-translate', 'tool-action-screenshot'])
  } finally {
    await app.close()
    server.close()
  }
})
