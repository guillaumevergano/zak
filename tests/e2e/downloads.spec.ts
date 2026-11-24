import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { activeTabTitle, forceClose, launch, pageAt, serve, visit } from './helpers'

/** The overlay view (popovers and panels above the page). */
async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().endsWith('#overlay'))).toBe(true)
  return app.windows().find((p) => p.url().endsWith('#overlay'))!
}

test('zak://downloads keeps the history across launches; a download from a malware address is blocked', async () => {
  const { server, origin } = await serve((req, res) => {
    if (req.url === '/phishing.txt') return res.end('! Title: test\n')
    if (req.url === '/malware.txt') return res.end('! Title: test\n||127.0.0.1/evil^$all\n')
    if (req.url === '/report.pdf' || req.url === '/evil/tool.zip') {
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', `attachment; filename="${req.url.split('/').pop()}"`)
      return res.end('12345678')
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<title>Liens</title><a id="evil" href="/evil/tool.zip" download>outil</a>')
  })
  const lists = JSON.stringify({ phishing: `${origin}/phishing.txt`, malware: `${origin}/malware.txt` })
  let { app, chrome, profile } = await launch('downloads', undefined, { ZAK_SAFE_BROWSING_LISTS: lists })
  try {
    await expect.poll(() => existsSync(join(profile, 'safe-browsing', 'malware.txt'))).toBe(true)

    await visit(chrome, `${origin}/report.pdf`)
    await expect.poll(() => existsSync(join(profile, 'Downloads', 'report.pdf'))).toBe(true)

    // « Tout afficher » in the panel opens the page.
    await chrome.getByTestId('downloads-button').click()
    const pop = await overlay(app)
    await expect(pop.getByTestId('download').filter({ hasText: 'report.pdf' })).toBeVisible()
    await pop.getByRole('button', { name: 'Tout afficher' }).click()
    const page = await pageAt(app, 'zak://downloads')
    await expect.poll(() => activeTabTitle(chrome)).toBe('Téléchargements')
    const entry = page.getByTestId('download-entry').filter({ hasText: 'report.pdf' })
    await expect(entry).toContainText('127.0.0.1')
    await expect(entry.getByTestId('download-entry-status')).toHaveText('8 o')

    // A link to a listed address: nothing saved, the list says why; « Télécharger quand même » saves it.
    await visit(chrome, `${origin}/links`)
    await expect.poll(() => activeTabTitle(chrome)).toBe('Liens')
    const links = await pageAt(app, `${origin}/links`)
    await links.click('#evil')
    await chrome.getByTestId('downloads-button').click()
    const panel = await overlay(app)
    const blocked = panel.getByTestId('download').filter({ hasText: 'tool.zip' })
    await expect(blocked.getByTestId('download-status')).toContainText('Bloqué')
    expect(existsSync(join(profile, 'Downloads', 'tool.zip'))).toBe(false)
    await blocked.getByRole('button', { name: 'Télécharger quand même' }).click()
    await expect.poll(() => existsSync(join(profile, 'Downloads', 'tool.zip'))).toBe(true)
    await panel.keyboard.press('Escape')
  } finally {
    await forceClose(app)
  }

  // Next launch: the history is still there; removing an entry keeps the file.
  ;({ app, chrome } = await launch('downloads', profile, { ZAK_SAFE_BROWSING_LISTS: lists }))
  try {
    await visit(chrome, 'zak://downloads')
    const page = await pageAt(app, 'zak://downloads')
    const entries = page.getByTestId('download-entry')
    await expect(entries.filter({ hasText: 'report.pdf' })).toBeVisible()
    await expect(entries.filter({ hasText: 'tool.zip' })).toBeVisible()
    await page.getByRole('searchbox').fill('report')
    await expect(entries).toHaveCount(1)
    await entries.first().hover()
    await page.getByRole('button', { name: 'Retirer report.pdf de la liste' }).click()
    await expect(page.getByText('Aucun résultat.')).toBeVisible()
    expect(existsSync(join(profile, 'Downloads', 'report.pdf'))).toBe(true)
  } finally {
    await forceClose(app)
    server.close()
  }
})
