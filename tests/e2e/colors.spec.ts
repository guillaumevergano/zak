import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { colorDistance } from '../../src/shared/colors'
import { activeTabTitle, launch, pageAt, serve, visit } from './helpers'

const overlayOf = (app: ElectronApplication): Page | undefined => app.windows().find((p) => p.url().includes('#overlay'))
const pickerOf = (app: ElectronApplication): Page | undefined => app.windows().find((p) => p.url().includes('#colorpicker'))

const SITE = `<!doctype html><html><head><title>Atelier Bleu</title>
<style>
  :root { --brand-primary: #FF5A1F; --ink: #111111; }
  body { margin: 0; background: #FFFFFF; color: #111111; font-family: Georgia, serif; }
  header { height: 160px; background: #1E3A8A; display: flex; align-items: center; padding: 0 24px; }
  h1 { font-family: Arial, sans-serif; font-weight: 700; font-size: 40px; color: #FFFFFF; margin: 0 0 0 16px; }
  p { font-size: 16px; line-height: 24px; }
  .btn { display: inline-block; background: var(--brand-primary); color: #FFFFFF; border-radius: 8px; padding: 12px 20px; font-family: Arial, sans-serif; text-decoration: none; }
</style></head><body>
<header><svg class="logo" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#FF5A1F"/></svg><h1>Atelier Bleu</h1></header>
<main style="padding: 24px">
  <p>${'Un atelier de design qui aime les couleurs franches et les belles lettres. '.repeat(12)}</p>
  <p>${'Des affiches, des sites, des livres. '.repeat(10)}</p>
  <a class="btn" href="#">Nous écrire</a>
</main></body></html>`

test('the eyedropper keeps a color, and a site’s brand kit is read, commented and filed', async () => {
  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(SITE)
  })
  const { app, chrome } = await launch('colors')
  try {
    await visit(chrome, `${origin}/atelier`)
    await expect.poll(() => activeTabTitle(chrome)).toBe('Atelier Bleu')

    // The palette icon reads the site: its kit opens in a tab next to it.
    await chrome.getByTestId('tool-action-brand').click()
    await expect.poll(() => app.windows().some((p) => p.url().startsWith('zak://colors/#kit=')), { timeout: 15_000 }).toBe(true)
    const kit = await pageAt(app, 'zak://colors/#kit=')
    await expect(kit.getByTestId('brand-kit')).toHaveAttribute('data-host', '127.0.0.1')
    await expect(kit.getByTestId('brand-color').first()).toBeVisible()
    const roles = await kit.getByTestId('brand-color').evaluateAll((els) => els.map((e) => [e.getAttribute('data-hex'), e.getAttribute('data-role')]))
    // The button's color (and the --brand-primary variable) before the header's big blue.
    expect(roles[0]).toEqual(['#FF5A1F', 'primary'])
    expect(roles).toContainEqual(['#1E3A8A', 'accent'])
    expect(roles).toContainEqual(['#FFFFFF', 'background'])
    expect(roles).toContainEqual(['#111111', 'text'])
    await expect(kit.getByTestId('brand-font').filter({ hasText: 'Georgia' })).toBeVisible()
    await expect(kit.getByTestId('brand-font').filter({ hasText: 'Arial' })).toBeVisible()
    await expect(kit.getByText('--brand-primary')).toBeVisible()
    await expect(kit.getByText('Nous écrire')).toBeVisible()
    await expect(kit.getByRole('img', { name: 'Logo de 127.0.0.1' })).toBeVisible()

    // A comment (saved as one types) and a folder.
    await kit.getByTestId('brand-kit-comment').fill('Belle typo pour le projet Lumière')
    await expect(kit.getByText('Enregistrement…')).toHaveCount(0)
    await kit.getByRole('link', { name: '← Chartes graphiques' }).click()
    await kit.getByRole('button', { name: '+ Nouveau dossier' }).click()
    await kit.getByRole('textbox', { name: 'Nom du dossier' }).fill('Inspirations')
    await kit.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(kit.getByRole('heading', { name: '📁 Inspirations' })).toBeVisible()
    await kit.getByRole('button', { name: /Toutes les chartes/ }).click()
    await kit.getByTestId('brand-kit-card').click()
    await kit.getByRole('combobox', { name: 'Dossier' }).selectOption({ label: '📁 Inspirations' })
    await kit.reload()
    await expect(kit.getByTestId('brand-kit-comment')).toHaveValue('Belle typo pour le projet Lumière')
    await expect(kit.getByRole('combobox', { name: 'Dossier' })).toHaveValue(/.+/)
    await kit.getByRole('link', { name: '← Chartes graphiques' }).click()
    await expect(kit.getByRole('heading', { name: '📁 Inspirations' })).toBeVisible()
    await expect(kit.getByTestId('brand-kit-card')).toContainText('Belle typo pour le projet Lumière')

    // The eyedropper (in tests: a picture of the page instead of the screen): a click in the header.
    await chrome.getByTestId('tab').first().click()
    await chrome.getByTestId('tool-action-colors').click()
    await expect.poll(() => !!pickerOf(app)).toBe(true)
    const picker = pickerOf(app)!
    await expect(picker.locator('img')).toBeVisible()
    await picker.mouse.move(300, 40)
    await expect(picker.getByTestId('color-picker')).toHaveAttribute('data-hex', /^#[0-9A-F]{6}$/)
    await picker.mouse.click(300, 40)
    await expect.poll(() => !!pickerOf(app)).toBe(false)

    // Copied, kept, shown in the page's corner; a ★ makes it a favorite.
    await expect.poll(() => overlayOf(app)?.getByTestId('colors-toast').getAttribute('data-hex') ?? null).not.toBeNull()
    const toast = overlayOf(app)!.getByTestId('colors-toast')
    const picked = (await toast.getAttribute('data-hex'))!
    expect(colorDistance(picked, '#1E3A8A')).toBeLessThan(6)
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(picked)
    await toast.getByRole('button', { name: 'Ajouter aux favoris' }).click()

    await visit(chrome, 'zak://colors')
    await expect.poll(() => app.windows().some((p) => p.url() === 'zak://colors/')).toBe(true)
    const colors = app.windows().find((p) => p.url() === 'zak://colors/')!
    await expect(colors.getByRole('list', { name: 'Couleurs favorites' }).getByTestId('saved-color')).toHaveAttribute('data-hex', picked)
    await expect(colors.getByRole('list', { name: 'Historique des couleurs' })).toHaveCount(0)
  } finally {
    await app.close()
    server.close()
  }
})
