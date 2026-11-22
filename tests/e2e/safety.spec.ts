import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { activeTabTitle, launch, pageAt, serve, visit } from './helpers'

test('a known phishing page is replaced by a warning; the user can still go on', async () => {
  const { server, origin } = await serve((req, res) => {
    if (req.url === '/phishing.txt') return res.end('! Title: test\n||127.0.0.1/fake-bank^$all\n')
    if (req.url === '/malware.txt') return res.end('! Title: test\n')
    res.setHeader('content-type', 'text/html')
    res.end(`<title>Page ${req.url}</title>`)
  })
  const lists = JSON.stringify({ phishing: `${origin}/phishing.txt`, malware: `${origin}/malware.txt` })
  const { app, chrome, profile } = await launch('safety', undefined, { ZAK_SAFE_BROWSING_LISTS: lists })
  await expect.poll(() => existsSync(join(profile, 'safe-browsing', 'phishing.txt'))).toBe(true)

  // A safe page of the same host loads normally.
  await visit(chrome, `${origin}/home`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /home')

  // The listed one shows the warning; « Retour en lieu sûr » goes back.
  await visit(chrome, `${origin}/fake-bank/login`)
  const warning = await pageAt(app, 'zak://error/')
  await expect(warning.getByTestId('threat-warning')).toContainText('Site trompeur')
  await warning.getByRole('button', { name: 'Retour en lieu sûr' }).click()
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /home')

  // « Continuer quand même » opens it, for this session.
  await visit(chrome, `${origin}/fake-bank/login`)
  const again = await pageAt(app, 'zak://error/')
  await again.getByText('Détails').click()
  await again.getByRole('button', { name: /Continuer quand même/ }).click()
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /fake-bank/login')

  await app.close()
  server.close()
})
