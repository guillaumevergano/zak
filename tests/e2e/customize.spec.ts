import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { activeTabTitle, launch, pageAt, serve, visit } from './helpers'

test('the settings file can be edited outside Zak, and applies at once', async () => {
  const { app, chrome, profile } = await launch('customize-settings')
  const file = join(profile, 'config.json')
  await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).$schema).toContain('settings.schema.json')

  // What Claude Code or Codex would do: edit the JSON.
  const config = JSON.parse(readFileSync(file, 'utf8'))
  config.general = { ...config.general, theme: 'dark' }
  config.sidebar = { ...config.sidebar, collapsed: true }
  writeFileSync(file, JSON.stringify(config, null, 2))

  await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await expect.poll(async () => (await chrome.getByTestId('sidebar').boundingBox())?.width ?? 999).toBeLessThan(100)
  await app.close()
})

test('an unpacked extension loads from a folder and reloads when its files change', async () => {
  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<title>Page</title>')
  })
  const folder = mkdtempSync(join(tmpdir(), 'zak-unpacked-'))
  const manifest = (version: string) =>
    JSON.stringify({ manifest_version: 3, name: 'Fait maison', version, content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['title.js'] }] })
  writeFileSync(join(folder, 'manifest.json'), manifest('1.0'))
  writeFileSync(join(folder, 'title.js'), "document.title += ' ✓'")

  const { app, chrome } = await launch('customize-unpacked')
  // The folder picker, answered as the user would.
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog
  }, folder)
  await visit(chrome, 'zak://extensions')
  const page = await pageAt(app, 'zak://extensions')
  await page.getByRole('button', { name: 'Charger une extension non empaquetée…' }).click()
  await expect(page.getByText('Fait maison')).toBeVisible()
  await expect(page.getByTestId('unpacked-path')).toContainText(folder)

  // Its content script runs on pages.
  await visit(chrome, `${origin}/a`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page ✓')

  // Edited (by hand or by an agent): reloaded without doing anything.
  writeFileSync(join(folder, 'manifest.json'), manifest('1.1'))
  await visit(chrome, 'zak://extensions')
  const again = await pageAt(app, 'zak://extensions')
  await expect.poll(async () => {
    await again.reload()
    return again.getByText('1.1').count()
  }).toBe(1)
  await app.close()
  server.close()
})
