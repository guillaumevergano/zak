import type { Server } from 'node:http'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { activeTabTitle, clickMenu, launch, pageAt, serve, visit } from './helpers'

let server: Server
let origin: string

test.beforeAll(async () => {
  ;({ server, origin } = await serve((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<title>Page ${req.url?.slice(1)}</title>`)
  }))
})

test.afterAll(() => {
  server?.close()
})

const titles = (window: Page): Promise<(string | null)[]> =>
  window.getByTestId('tab').evaluateAll((els) => els.map((el) => el.getAttribute('title')))

/** The chrome UI of a window that is not `except`. */
async function otherWindow(app: ElectronApplication, except: Page[]): Promise<Page> {
  const isChrome = (p: Page): boolean => p.url().includes('renderer/index.html') && !p.url().includes('#overlay')
  await expect.poll(() => app.windows().filter((p) => isChrome(p) && !except.includes(p)).length).toBeGreaterThan(0)
  return app.windows().find((p) => isChrome(p) && !except.includes(p))!
}

test('tabs come back at launch; « Reprendre la navigation » and closed windows reopen', async () => {
  let { app, chrome, profile } = await launch('session')
  await visit(chrome, `${origin}/a`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page a')
  await chrome.getByTestId('new-tab').click()
  await visit(chrome, `${origin}/b`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page b')
  await app.close()

  // Relaunch: same tabs, same active one.
  ;({ app, chrome } = await launch('session', profile))
  await expect.poll(() => titles(chrome)).toEqual(['Page a', 'Page b'])
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page b')

  // Startup on a new tab instead: the new tab page offers to reopen the session.
  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')
  await settings.getByRole('combobox', { name: 'Au démarrage' }).selectOption('newtab')
  await app.close()
  ;({ app, chrome } = await launch('session', profile))
  await expect(chrome.getByTestId('tab')).toHaveCount(1)
  const newtab = await pageAt(app, 'zak://newtab')
  await expect(newtab.getByTestId('recent').first()).toBeVisible()
  // Its field suggests visited sites, like the omnibox.
  const field = newtab.getByRole('combobox', { name: 'Où voulez-vous aller ?' })
  await field.fill('Page')
  await expect(newtab.getByTestId('newtab-suggestion').filter({ hasText: 'Page a' })).toBeVisible()
  await field.fill('')
  await expect(newtab.getByTestId('newtab-suggestions')).toHaveCount(0)
  await newtab.getByRole('button', { name: 'Reprendre la navigation' }).click()
  const reopened = await otherWindow(app, [chrome])
  await expect.poll(() => titles(reopened)).toEqual(['Page a', 'Réglages'])

  // A closed window comes back from the History menu.
  await app.evaluate(({ BrowserWindow }) => {
    const newest = BrowserWindow.getAllWindows().sort((a, b) => b.id - a.id)[0]
    newest?.close()
  })
  await expect.poll(() => app.windows().filter((p) => p.url().includes('renderer/index.html') && !p.url().includes('#overlay')).length).toBe(1)
  await clickMenu(app, 'Rouvrir la fenêtre fermée')
  const again = await otherWindow(app, [chrome])
  await expect.poll(() => titles(again)).toEqual(['Page a', 'Réglages'])
  await app.close()
})
