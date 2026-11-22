import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { plural, resolveLang, setLang, t } from '../../src/shared/i18n'
import { EN } from '../../src/shared/i18n.en'
import { EN_MAIN } from '../../src/shared/i18n/en-main'
import { EN_UI } from '../../src/shared/i18n/en-ui'
import { EN_WELCOME } from '../../src/shared/i18n/en-welcome'

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
  })

/** Every French text passed to t() or plural() in the code. */
function frenchTexts(): Map<string, string> {
  const found = new Map<string, string>()
  const literal = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`
  const call = new RegExp(String.raw`\b(?:t|plural)\(\s*(?:[^,()]+,\s*)?(?:${literal})(?:\s*,\s*(?:${literal}))?`, 'g')
  for (const file of files(join(__dirname, '../../src')).filter((f) => !/shared[/\\]i18n/.test(f))) {
    const source = readFileSync(file, 'utf8')
    for (const m of source.matchAll(call)) {
      for (const text of [m[1] ?? m[2], m[3] ?? m[4]]) {
        if (text !== undefined) found.set(text.replace(/\\'/g, "'").replace(/\\"/g, '"'), file)
      }
    }
  }
  return found
}

describe('i18n', () => {
  it('has an English text for every French text of the interface', () => {
    const missing = [...frenchTexts()].filter(([fr]) => !(fr in EN)).map(([fr, file]) => `${file.split('/src/')[1]}: ${fr}`)
    expect(missing).toEqual([])
  })

  it('translates a French text the same way everywhere (use `texte@@sens` for two meanings)', () => {
    const parts = [EN_MAIN, EN_UI, EN_WELCOME]
    const clashes = parts.flatMap((a, i) =>
      parts.slice(i + 1).flatMap((b) => Object.keys(a).filter((k) => k in b && a[k] !== b[k]).map((k) => `${k}: ${a[k]} / ${b[k]}`))
    )
    expect(clashes).toEqual([])
  })

  it('keeps the placeholders in the English texts', () => {
    const names = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()
    const broken = Object.entries(EN).filter(([fr, en]) => names(fr).join() !== names(en).join())
    expect(broken).toEqual([])
  })

  it('picks the language and fills the placeholders', () => {
    expect(resolveLang('system', 'fr-CA')).toBe('fr')
    expect(resolveLang('system', 'de-DE')).toBe('en')
    expect(resolveLang('fr', 'en-US')).toBe('fr')
    setLang('fr')
    expect(t('{n} pages', { n: 3 })).toBe('3 pages')
    expect(plural(1, '{n} favori', '{n} favoris')).toBe('1 favori')
    setLang('en')
    expect(t('Texte sans traduction')).toBe('Texte sans traduction')
    setLang('fr')
  })
})
