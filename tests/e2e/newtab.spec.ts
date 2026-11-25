import { expect, test } from '@playwright/test'
import { forceClose, launch, pageAt, visit } from './helpers'

test('the new tab page shows what was chosen under its logo, a new one each time', async () => {
  const { app, chrome } = await launch('newtab-headline')
  try {
    const open = async () => {
      await visit(chrome, 'zak://newtab')
      return pageAt(app, 'zak://newtab')
    }

    // Zak's own words by default.
    let page = await open()
    const headline = page.getByTestId('newtab-headline')
    await expect(headline).toHaveAttribute('data-kind', 'zak')
    await expect(headline).toContainText('Un peu d’espace.')

    // From the settings page: a quote, with its author.
    await visit(chrome, 'zak://settings')
    const settings = await pageAt(app, 'zak://settings')
    const source = settings.getByRole('combobox', { name: 'Sous le logo' })
    await source.selectOption('quote')
    page = await open()
    await expect(page.getByTestId('newtab-headline')).toHaveAttribute('data-kind', 'quote')
    await expect(page.getByTestId('newtab-headline').locator('p')).toContainText('— ')

    // A proverb each time: two tabs in a row show two different ones.
    await visit(chrome, 'zak://settings')
    await source.selectOption('proverb')
    page = await open()
    const first = await page.getByTestId('newtab-headline').locator('h1').innerText()
    page = await open()
    await expect(page.getByTestId('newtab-headline').locator('h1')).not.toHaveText(first)

    // Own text.
    await visit(chrome, 'zak://settings')
    await source.selectOption('custom')
    await settings.getByRole('textbox', { name: 'Titre', exact: true }).fill('Bonjour.')
    await settings.getByRole('textbox', { name: 'Sous-titre' }).fill('Belle journée.')
    await settings.getByRole('textbox', { name: 'Titre', exact: true }).focus()
    page = await open()
    await expect(page.getByTestId('newtab-headline')).toContainText('Bonjour.')
    await expect(page.getByTestId('newtab-headline')).toContainText('Belle journée.')

    // Nothing at all (the page keeps a title for screen readers).
    await visit(chrome, 'zak://settings')
    await source.selectOption('none')
    page = await open()
    await expect(page.getByTestId('newtab-headline')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouvel onglet')
  } finally {
    await forceClose(app)
  }
})
