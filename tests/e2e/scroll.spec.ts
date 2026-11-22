import { expect, test } from '@playwright/test'
import { launch, pageAt, serve, visit } from './helpers'

test("the page's own scrollbar gives way to a thin indicator next to the page", async () => {
  // A site that styles its own wide, white scrollbar (the case that showed a white band).
  const { server, origin } = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<title>Long</title><style>
      html { background: #fff } body { margin: 0; background: #1a1030; color: #fff }
      ::-webkit-scrollbar { width: 16px; background: #fff } ::-webkit-scrollbar-thumb { background: #999 }
    </style><div style="height: 6000px">long</div>`)
  })
  const { app, chrome } = await launch('scroll')
  await visit(chrome, `${origin}/long`)
  const page = await pageAt(app, origin)

  // No scrollbar inside the page: it reaches its edge.
  await expect.poll(() => page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBe(0)

  const thumb = chrome.getByTestId('page-scroll-thumb')
  await expect(thumb).toBeVisible()
  const startY = (await thumb.boundingBox())!.y

  // Scrolling the page moves the indicator.
  await page.evaluate(() => scrollTo(0, 3000))
  await expect.poll(async () => (await thumb.boundingBox())!.y).toBeGreaterThan(startY + 50)

  // Dragging the indicator scrolls the page.
  await page.evaluate(() => scrollTo(0, 0))
  await expect.poll(async () => (await thumb.boundingBox())!.y).toBeLessThan(startY + 2)
  const box = (await thumb.boundingBox())!
  await chrome.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await chrome.mouse.down()
  await chrome.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 200, { steps: 8 })
  await chrome.mouse.up()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500)

  // A page that doesn't scroll: no indicator.
  await page.evaluate(() => (document.querySelector('div')!.style.height = '10px'))
  await expect(thumb).toHaveCount(0)
  await app.close()
  server.close()
})
