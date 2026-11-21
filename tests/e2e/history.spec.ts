import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { Server } from 'node:http'
import { activeTabTitle, clickMenu, launch, pageAt, serve, visit } from './helpers'

let app: ElectronApplication
let chrome: Page
let server: Server
let origin: string

test.beforeAll(async () => {
  ;({ server, origin } = await serve((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<title>Page ${req.url?.slice(1)}</title><p>${req.url}</p>`)
  }))
  ;({ app, chrome } = await launch('history'))
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

test('visits are recorded, searchable and removable; private windows record nothing', async () => {
  await visit(chrome, `${origin}/pommes`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page pommes')
  await visit(chrome, `${origin}/poires`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page poires')

  // A private window visit.
  await clickMenu(app, 'Nouvelle fenêtre de navigation privée')
  await expect.poll(() => app.windows().some((p) => p.url().includes('index.html?private=1'))).toBe(true)
  const priv = app.windows().find((p) => p.url().includes('index.html?private=1'))!
  await expect(priv.getByTestId('tab')).toHaveCount(1)
  await visit(priv, `${origin}/secret`)
  await expect.poll(() => activeTabTitle(priv)).toBe('Page secret')
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('private=1')) w.close()
  })

  await chrome.bringToFront()
  await clickMenu(app, "Afficher tout l'historique")
  const history = await pageAt(app, 'zak://history')
  const entries = history.getByTestId('history-entry')
  await expect(entries).toHaveCount(2)
  await expect(entries.first()).toContainText('Page poires')
  await expect(history.getByText('Page secret')).toHaveCount(0)

  await history.getByRole('searchbox', { name: "Rechercher dans l'historique" }).fill('pommes')
  await expect(entries).toHaveCount(1)
  await history.getByRole('button', { name: "Supprimer Page pommes de l'historique" }).click()
  await expect(entries).toHaveCount(0)

  await history.getByRole('searchbox', { name: "Rechercher dans l'historique" }).fill('')
  await expect(entries).toHaveCount(1)
  await history.getByRole('button', { name: 'Effacer', exact: true }).click()
  await expect(entries).toHaveCount(0)
  await expect(history.getByText("L'historique est vide.")).toBeVisible()
})
