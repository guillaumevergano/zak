import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The website's pages are generated (npm run site:build): every language translated, files up to date.
describe('website pages', () => {
  it('are translated and up to date', async () => {
    const { build } = await import('../../site-src/build.mjs')
    for (const [path, { html, missing }] of build() as Map<string, { html: string; missing: string[] }>) {
      expect(missing, `${path} has untranslated texts`).toEqual([])
      expect(readFileSync(join(__dirname, '../../site', path), 'utf8'), `${path} is out of date: npm run site:build`).toBe(html)
    }
  })
})
