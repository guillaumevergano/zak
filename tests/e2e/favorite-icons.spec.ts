import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { forceClose, launch, serve, visit } from './helpers'

// A 1×1 PNG: what the site declares as its big icon, and the image picked on disk.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test('a favorite shows the site’s icon fetched on demand, or an image of one’s own', async () => {
  const { server, origin } = await serve((req, res) => {
    if (req.url === '/touch.png') {
      res.setHeader('Content-Type', 'image/png')
      res.end(PNG)
      return
    }
    res.setHeader('Content-Type', 'text/html')
    res.end('<title>Icons</title><link rel="apple-touch-icon" sizes="180x180" href="/touch.png"><h1>Icons</h1>')
  })
  const { app, chrome, profile } = await launch('favorite-icons')
  try {
    const overlay = async (): Promise<Page> => {
      await expect.poll(() => app.windows().some((p) => p.url().endsWith('#overlay'))).toBe(true)
      return app.windows().find((p) => p.url().endsWith('#overlay'))!
    }
    await visit(chrome, `${origin}/`)
    await expect(chrome.getByTestId('tab').last()).toHaveAttribute('title', 'Icons')
    const tileImage = chrome.getByTestId('sidebar').getByRole('button', { name: 'Icons' }).locator('img')

    // « Icône du site »: fetched from the page's declared icon, kept as data.
    await chrome.getByTestId('favorite-star').click()
    let pop = await overlay()
    let editor = pop.getByTestId('favorite-editor')
    await editor.getByRole('button', { name: 'Icône du site' }).click()
    await expect(editor.getByTestId('emoji-button').locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
    await editor.getByRole('button', { name: 'Ajouter' }).click()
    await expect(tileImage).toHaveAttribute('src', /^data:image\/png;base64,/)
    const siteIcon = await tileImage.getAttribute('src')

    // « Mon image… »: a file of one's own, shown instead.
    const file = join(profile, 'mine.png')
    writeFileSync(file, PNG)
    await chrome.getByTestId('favorite-star').click()
    pop = await overlay()
    editor = pop.getByTestId('favorite-editor')
    await editor.getByTestId('favorite-image-input').setInputFiles(file)
    await expect(editor.getByTestId('emoji-button').locator('img')).toHaveClass(/object-cover/)
    await editor.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(tileImage).toHaveClass(/object-cover/)
    expect(await tileImage.getAttribute('src')).not.toBe(siteIcon)

    // Not an image: refused, with a word why.
    const text = join(profile, 'notes.txt')
    writeFileSync(text, 'hello')
    await chrome.getByTestId('favorite-star').click()
    pop = await overlay()
    editor = pop.getByTestId('favorite-editor')
    await editor.getByTestId('favorite-image-input').setInputFiles(text)
    await expect(editor.getByRole('status')).toHaveText('Ce fichier n’est pas une image.')

    // An emoji replaces the image.
    await editor.getByRole('button', { name: 'Emoji', exact: true }).click()
    await pop.locator('.epr-emoji-category-content button').first().click()
    await editor.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(tileImage).toHaveCount(0)
  } finally {
    await forceClose(app)
    server.close()
  }
})
