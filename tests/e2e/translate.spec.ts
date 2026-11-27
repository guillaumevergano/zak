import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launch, pageAt, serve, visit } from './helpers'

/** Native context menus can't be clicked: keep the last one popped up, and click its items. */
async function captureMenus(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function (this: Electron.Menu) {
      ;(globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu = this
    }
  })
}

const menuLabels = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items.map((it) => it.label))

async function clickMenuItem(app: ElectronApplication, ...path: string[]): Promise<void> {
  await app.evaluate((_electron, labels) => {
    let items = (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items
    for (const [i, label] of labels.entries()) {
      const item = items.find((it) => it.label === label)
      if (!item) throw new Error(`No menu item ${label}: ${items.map((it) => it.label).join(', ')}`)
      if (i === labels.length - 1) item.click()
      else items = item.submenu!.items
    }
  }, path)
}

/** Right-clicks `selector` once the menu was captured, and waits for a new menu. */
async function rightClick(app: ElectronApplication, page: Page, selector: string): Promise<void> {
  await app.evaluate(() => void ((globalThis as unknown as { lastMenu: Electron.Menu | null }).lastMenu = null))
  await page.locator(selector).click({ button: 'right' })
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { lastMenu: Electron.Menu | null }).lastMenu !== null)).toBe(true)
}

test('a selection is translated in place where one writes, in a bubble elsewhere, and the tool can be switched off', async () => {
  // The page, and a stand-in for Google Translate: each piece comes back in capitals, from English
  // when it says « thanks », from French otherwise.
  const requests: string[] = []
  const { server, origin } = await serve((req, res) => {
    if (req.url?.startsWith('/t?')) {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        requests.push(req.url!)
        const pieces = new URLSearchParams(body).getAll('q')
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(pieces.map((q) => [q.toUpperCase(), /thanks/i.test(q) ? 'en' : 'fr'])))
      })
      return
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<title>Mail</title><textarea id="mail" rows="4" cols="40"></textarea><p id="read">Thanks for your message, Pierre.</p><p id="mine">Merci pour votre message.</p><p id="short">Bonjour</p>')
  })
  const { app, chrome } = await launch('translate', undefined, { ZAK_TRANSLATE_URL: `${origin}/t` })
  try {
    await captureMenus(app)
    await visit(chrome, `${origin}/mail`)
    const page = await pageAt(app, origin)

    // Where one writes: « Traduire en › Anglais » replaces the selection.
    await page.locator('#mail').fill('bonjour à tous')
    await page.locator('#mail').selectText()
    await rightClick(app, page, '#mail')
    await clickMenuItem(app, 'Traduire en', 'Anglais')
    await expect(page.locator('#mail')).toHaveValue('BONJOUR À TOUS')
    expect(requests.at(-1)).toContain('tl=en')
    // Undo (⌘Z) gives the original back.
    await page.locator('#mail').focus()
    await page.evaluate(() => document.execCommand('undo'))
    await expect(page.locator('#mail')).toHaveValue('bonjour à tous')

    // The language chosen comes first next time.
    await page.locator('#mail').selectText()
    await rightClick(app, page, '#mail')
    const submenu = await app.evaluate(() =>
      (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items.find((it) => it.label === 'Traduire en')!.submenu!.items.map((it) => it.label)
    )
    expect(submenu[0]).toBe('Anglais')
    expect(submenu[1]).toBe('')

    const select = (id: string): Promise<void> =>
      page.evaluate((id) => {
        const range = document.createRange()
        range.selectNodeContents(document.getElementById(id)!)
        getSelection()!.removeAllRanges()
        getSelection()!.addRange(range)
      }, id)

    // Text one reads, in another language: a bubble under it, in Zak's language. The name is sent
    // marked « not to translate », and comes back without the mark.
    await select('read')
    await rightClick(app, page, '#read')
    await clickMenuItem(app, 'Traduire en français')
    const bubbleHost = app.windows().find((p) => p.url().includes('#overlay'))!
    await expect(bubbleHost.getByTestId('translation-text')).toHaveText('THANKS FOR YOUR MESSAGE, PIERRE.')
    await expect(bubbleHost.getByTestId('translation-bubble')).toContainText('Anglais →')
    expect(requests.at(-1)).toContain('tl=fr')

    // Text already in Zak's language: English is offered.
    await bubbleHost.getByRole('button', { name: 'Fermer' }).click()
    await select('mine')
    await rightClick(app, page, '#mine')
    expect(await menuLabels(app)).toContain('Traduire en anglais')
    // Too short for Zak to tell: offered in French, Google finds French, so it comes in English.
    await select('short')
    await rightClick(app, page, '#short')
    await clickMenuItem(app, 'Traduire en français')
    await expect(bubbleHost.getByTestId('translation-text')).toHaveText('BONJOUR')
    await expect(bubbleHost.getByRole('combobox', { name: 'Langue de la traduction' })).toHaveValue('en')
    expect(requests.at(-1)).toContain('tl=en')

    // Another language from the bubble.
    await bubbleHost.getByRole('combobox', { name: 'Langue de la traduction' }).selectOption('de')
    await expect.poll(() => requests.at(-1)).toContain('tl=de')
    await bubbleHost.getByRole('button', { name: 'Fermer' }).click()
    await expect(bubbleHost.getByTestId('translation-bubble')).toHaveCount(0)

    // Switched off on zak://extensions: nothing left in the menu.
    await chrome.getByTestId('new-tab').click()
    await visit(chrome, 'zak://extensions')
    const extensions = await pageAt(app, 'zak://extensions')
    await extensions.getByRole('switch', { name: 'Désactiver Traduction' }).click()
    await expect(extensions.getByRole('switch', { name: 'Activer Traduction' })).toBeVisible()
    await chrome.getByTestId('tab').first().click()
    await page.locator('#read').selectText()
    await rightClick(app, page, '#read')
    expect((await menuLabels(app)).filter((l) => l.startsWith('Traduire'))).toEqual([])
  } finally {
    await app.close()
    server.close()
  }
})
