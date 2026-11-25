import { describe, expect, it } from 'vitest'
import { appearanceCss, cleanFontName, EMPTY_APPEARANCE, normalizeAppearance, patchAppearance } from '../../src/shared/appearance'

describe('appearance', () => {
  it('keeps only valid colors and fonts that differ from Zak’s own', () => {
    const appearance = normalizeAppearance({
      colors: { light: { frame: '#14213D', cream: 'red', unknown: '#000000', pink: '#ff0082' }, dark: { iris: '#7fb2ff' } },
      fonts: { ui: 'Inter', display: 'Fraunces', mono: "x'; } body { color: red" }
    })
    expect(appearance).toEqual({
      colors: { light: { frame: '#14213d' }, dark: { iris: '#7fb2ff' } },
      fonts: { ui: 'Inter', display: null, mono: null }
    })
    expect(normalizeAppearance('nonsense')).toEqual(EMPTY_APPEARANCE)
  })

  it('patches colors and fonts, null going back to Zak’s own', () => {
    const first = patchAppearance(EMPTY_APPEARANCE, { colors: { light: { frame: '#000000', cream: '#ffffff' } }, fonts: { mono: 'Menlo' } })
    const second = patchAppearance(first, { colors: { light: { frame: null } }, fonts: { mono: null, ui: 'Avenir Next' } })
    expect(second).toEqual({ colors: { light: { cream: '#ffffff' }, dark: {} }, fonts: { ui: 'Avenir Next', display: null, mono: null } })
  })

  it('writes each theme’s colors for that theme only, and leaves private windows alone', () => {
    const css = appearanceCss(
      normalizeAppearance({ colors: { light: { frame: '#000000' }, dark: { frame: '#111111' } }, fonts: { display: 'Georgia' } })
    )
    expect(css).toContain("--font-serif: 'Georgia', Georgia, serif !important;")
    expect(css).toMatch(/@media not \(prefers-color-scheme: dark\) \{\nhtml body:not\(\.private\) \{\n {2}--color-frame: #000000 !important;/)
    expect(css).toMatch(/html body:not\(\.private\):not\(\.overlay\) \{\n {2}--color-frame: #111111 !important;/)
    expect(appearanceCss(EMPTY_APPEARANCE)).toBe('')
  })

  it('refuses font names that could break out of the CSS value', () => {
    expect(cleanFontName('  Helvetica   Neue ')).toBe('Helvetica Neue')
    expect(cleanFontName('Évasion Sans 2')).toBe('Évasion Sans 2')
    expect(cleanFontName("Inter'; }")).toBeNull()
    expect(cleanFontName('')).toBeNull()
  })
})
