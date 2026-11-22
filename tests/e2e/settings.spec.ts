import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, pageAt, visit } from './helpers'

let app: ElectronApplication
let chrome: Page
let profile: string

test.beforeAll(async () => {
  ;({ app, chrome, profile } = await launch('settings'))
})

test.afterAll(async () => {
  await app?.close()
})

test('search engine, theme and sidebar settings apply at once', async () => {
  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')

  // Search engine: the omnibox searches with DuckDuckGo.
  await settings.getByRole('combobox', { name: 'Moteur de recherche' }).selectOption('duckduckgo')
  await chrome.getByTestId('new-tab').click()
  await chrome.getByTestId('omnibox').fill('zak test')
  await chrome.getByTestId('omnibox').press('Enter')
  await expect
    .poll(() => app.windows().some((p) => p.url().startsWith('https://duckduckgo.com/?q=zak%20test')), { timeout: 15_000 })
    .toBe(true)

  // Theme: dark switches the whole app (nativeTheme; Playwright pins pages' own media to light).
  await chrome.locator('[data-testid="tab"][title="Réglages"]').click()
  await settings.getByRole('radio', { name: 'Sombre' }).click()
  await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await settings.getByRole('radio', { name: 'Clair' }).click()
  await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')

  // Sidebar collapsed from the settings page.
  const width = (): Promise<number> => chrome.getByTestId('sidebar').evaluate((el) => el.getBoundingClientRect().width)
  await settings.getByRole('switch', { name: 'Barre latérale réduite' }).click()
  await expect.poll(width).toBeLessThan(100)
  await settings.getByRole('switch', { name: 'Barre latérale réduite' }).click()
  await expect.poll(width).toBeGreaterThan(200)

  // Saved.
  await settings.reload()
  await expect(settings.getByRole('combobox', { name: 'Moteur de recherche' })).toHaveValue('duckduckgo')
})

test('bookmarks exported from Chrome are imported into the sidebar', async () => {
  const file = join(profile, 'bookmarks.html')
  writeFileSync(
    file,
    `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
      <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Barre de favoris</H3><DL><p>
        <DT><A HREF="https://exemple.test/">Exemple</A>
        <DT><H3>Lectures</H3><DL><p><DT><A HREF="https://lecture.test/">Lecture</A></DL><p>
      </DL><p></DL><p>`
  )
  // The file picker can't be driven: answer it with our file.
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog
  }, file)
  const settings = await pageAt(app, 'zak://settings')
  await chrome.locator('[data-testid="tab"][title="Réglages"]').click()
  await settings.getByRole('button', { name: 'Choisir le fichier…' }).click()
  await expect(settings.getByText('2 favoris importés, 1 dossier.')).toBeVisible()
  const sidebar = chrome.getByTestId('sidebar')
  await expect(sidebar.getByRole('button', { name: 'Exemple', exact: true })).toBeVisible()
  await expect(sidebar.getByTestId('folder').filter({ hasText: 'Lectures' })).toContainText('Lecture')
  // Again: nothing new.
  await settings.getByRole('button', { name: 'Choisir le fichier…' }).click()
  await expect(settings.getByText('Rien de nouveau à importer.')).toBeVisible()
})

test('links sent by other apps open in a new tab; the default browser row explains why it is off in dev', async () => {
  const count = await chrome.getByTestId('tab').count()
  // What macOS sends once Zak is the default browser (a link clicked in Mail, Slack…).
  const url = 'data:text/html,<title>Externe</title>'
  await app.evaluate(({ app }, link) => app.emit('open-url', { preventDefault: () => {} }, link), url)
  await expect(chrome.getByTestId('tab')).toHaveCount(count + 1)
  await expect(chrome.locator('[data-testid="tab"][title="Externe"]')).toBeVisible()

  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')
  await expect(settings.getByText("Disponible dans l'application installée, pas en mode développement.")).toBeVisible()
  await expect(settings.getByRole('button', { name: 'Définir par défaut' })).toHaveCount(0)
})
