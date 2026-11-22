import { expect, test, type ElectronApplication } from '@playwright/test'
import { activeTabTitle, launch, serve, visit } from './helpers'

/** Native context menus can't be clicked: keep the last one popped up, and click its items. */
async function captureMenus(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function (this: Electron.Menu) {
      ;(globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu = this
    }
  })
}

async function clickMenuItem(app: ElectronApplication, ...path: string[]): Promise<void> {
  await app.evaluate((_electron, labels) => {
    let items = (globalThis as unknown as { lastMenu: Electron.Menu }).lastMenu.items
    for (const [i, label] of labels.entries()) {
      const item = items.find((it) => it.label === label)
      if (!item) throw new Error(`No menu item ${label}`)
      if (i === labels.length - 1) item.click()
      else items = item.submenu!.items
    }
  }, path)
}

test('tabs can be grouped, renamed, folded, and the group comes back with the session', async () => {
  const { server, origin } = await serve((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<title>Page ${req.url}</title>`)
  })
  let { app, chrome, profile } = await launch('tabgroups')
  await captureMenus(app)
  await visit(chrome, `${origin}/a`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /a')
  await chrome.getByTestId('new-tab').click()
  await visit(chrome, `${origin}/b`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /b')

  // Right-click the first tab → new group; then the second joins it.
  const tabs = chrome.getByTestId('tab')
  await tabs.nth(0).click({ button: 'right' })
  await clickMenuItem(app, 'Ajouter l’onglet à un nouveau groupe')
  const chip = chrome.getByTestId('tab-group')
  await expect(chip).toHaveCount(1)
  await tabs.nth(1).click({ button: 'right' })
  await clickMenuItem(app, 'Ajouter l’onglet au groupe', 'Groupe sans nom (Bleu)')
  await expect(chrome.getByTestId('tab-group-line')).toHaveCount(2)

  // Rename in place, then fold: the active tab moves out of the folded group (here: a new tab).
  await chip.click({ button: 'right' })
  await clickMenuItem(app, 'Renommer le groupe…')
  await chrome.getByRole('textbox', { name: 'Nom du groupe' }).fill('Voyage')
  await chrome.keyboard.press('Enter')
  await expect(chip).toHaveText('Voyage')
  await chrome.getByTestId('new-tab').click()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-expanded', 'false')
  await expect(tabs).toHaveCount(1)
  await app.close()

  // Relaunch: same group, same name, still folded.
  ;({ app, chrome } = await launch('tabgroups', profile))
  await expect(chrome.getByTestId('tab-group')).toHaveText('Voyage')
  await expect(chrome.getByTestId('tab-group')).toHaveAttribute('aria-expanded', 'false')
  await chrome.getByTestId('tab-group').click()
  await expect(chrome.getByTestId('tab-group-line')).toHaveCount(2)
  await app.close()
  server.close()
})
