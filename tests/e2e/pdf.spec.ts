import { expect, test } from '@playwright/test'
import { activeTabTitle, launch, serve, visit } from './helpers'

const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 40 70 Td (Bonjour PDF) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
`

test('a PDF opens in the tab, in the built-in viewer (not as a download)', async () => {
  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'application/pdf')
    res.end(PDF)
  })
  const { app, chrome } = await launch('pdf')
  await visit(chrome, `${origin}/doc.pdf`)
  await expect.poll(() => activeTabTitle(chrome)).toBe('doc.pdf')
  // The viewer runs as a frame of Chromium's PDF extension inside the tab.
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) => {
        const tab = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/doc.pdf'))
        return tab?.mainFrame.framesInSubtree.some((f) => f.url.startsWith('chrome-extension://')) ?? false
      })
    )
    .toBe(true)
  await expect(chrome.getByTestId('downloads-button')).toHaveCount(0)
  await app.close()
  server.close()
})
