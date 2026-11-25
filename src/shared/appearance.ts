/**
 * Zak's own look, chosen on zak://appearance or through the MCP server (CLAUDE.md §7): any color
 * token of the interface, per theme (light, dark), and the three fonts. Stored as overrides of
 * the defaults below (src/renderer/src/styles.css), so an empty one is Zak as designed.
 */

export type ColorScheme = 'light' | 'dark'
export type FontRole = 'ui' | 'display' | 'mono'

export interface Appearance {
  colors: Record<ColorScheme, Partial<Record<ColorToken, string>>>
  fonts: Record<FontRole, string | null>
}

/** Changes: a color or font set to null goes back to Zak's own. */
export interface AppearancePatch {
  colors?: Partial<Record<ColorScheme, Partial<Record<ColorToken, string | null>>>>
  fonts?: Partial<Record<FontRole, string | null>>
}

export const COLOR_TOKENS = [
  'frame',
  'frame-2',
  'frame-3',
  'frame-line',
  'frame-text',
  'frame-sub',
  'frame-dim',
  'cream',
  'cream-2',
  'cream-edge',
  'cream-ink',
  'cream-sub',
  'cream-dim',
  'blush',
  'iris',
  'iris-ring',
  'pink',
  'pink-button',
  'pink-soft'
] as const
export type ColorToken = (typeof COLOR_TOKENS)[number]

/** Zak's colors, as in styles.css (the dark theme only remaps some of them). */
export const DEFAULT_COLORS: Record<ColorScheme, Record<ColorToken, string>> = {
  light: {
    frame: '#2e1f2d',
    'frame-2': '#3e2f3e',
    'frame-3': '#4a3949',
    'frame-line': '#4e3a4b',
    'frame-text': '#f3ebf1',
    'frame-sub': '#a8929f',
    'frame-dim': '#866b80',
    cream: '#f3edea',
    'cream-2': '#ebe2e2',
    'cream-edge': '#decfd6',
    'cream-ink': '#2a1a26',
    'cream-sub': '#6f5b68',
    'cream-dim': '#a3919b',
    blush: '#c8a8a8',
    iris: '#c67afb',
    'iris-ring': '#9d7be6',
    pink: '#ff0082',
    'pink-button': '#e00072',
    'pink-soft': '#ff8cc4'
  },
  dark: {
    frame: '#1c131c',
    'frame-2': '#2c202c',
    'frame-3': '#382938',
    'frame-line': '#3d2c3b',
    'frame-text': '#f3ebf1',
    'frame-sub': '#a8929f',
    'frame-dim': '#866b80',
    cream: '#2a1f29',
    'cream-2': '#352834',
    'cream-edge': '#4a3848',
    'cream-ink': '#f3ebf1',
    'cream-sub': '#b9a5b2',
    'cream-dim': '#806b7b',
    blush: '#c8a8a8',
    iris: '#c67afb',
    'iris-ring': '#9d7be6',
    pink: '#ff0082',
    'pink-button': '#e00072',
    'pink-soft': '#ff8cc4'
  }
}

/** The CSS variable of each font role (Tailwind's font-sans, font-serif, font-mono). */
export const FONT_VARS: Record<FontRole, string> = { ui: '--font-sans', display: '--font-serif', mono: '--font-mono' }

/** Zak's fonts (embedded, OFL), and what follows a chosen font when it is missing. */
export const DEFAULT_FONTS: Record<FontRole, string> = { ui: 'DM Sans', display: 'Fraunces', mono: 'JetBrains Mono' }
const FALLBACKS: Record<FontRole, string> = {
  ui: "system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
  display: 'Georgia, serif',
  mono: 'ui-monospace, monospace'
}

export const EMPTY_APPEARANCE: Appearance = {
  colors: { light: {}, dark: {} },
  fonts: { ui: null, display: null, mono: null }
}

const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/** A font family name, as typed: letters, digits, spaces and a few signs; nothing that could end the CSS value. */
export function cleanFontName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/\s+/g, ' ')
  return name.length > 0 && name.length <= 64 && /^[\p{L}\p{N} ._-]+$/u.test(name) ? name : null
}

/** Anything read from the settings file (edited by hand or by an agent): unknown or invalid values are dropped. */
export function normalizeAppearance(raw: unknown): Appearance {
  const value = (raw ?? {}) as { colors?: Record<string, Record<string, unknown>>; fonts?: Record<string, unknown> }
  const colors = { light: {}, dark: {} } as Appearance['colors']
  for (const scheme of ['light', 'dark'] as const) {
    for (const token of COLOR_TOKENS) {
      const color = value.colors?.[scheme]?.[token]
      if (isColor(color) && color.toLowerCase() !== DEFAULT_COLORS[scheme][token]) colors[scheme][token] = color.toLowerCase()
    }
  }
  const fonts = { ...EMPTY_APPEARANCE.fonts }
  for (const role of ['ui', 'display', 'mono'] as const) {
    const name = cleanFontName(value.fonts?.[role])
    fonts[role] = name && name !== DEFAULT_FONTS[role] ? name : null
  }
  return { colors, fonts }
}

/** Applies changes (null: back to Zak's own), then normalizes. */
export function patchAppearance(current: Appearance, patch: AppearancePatch): Appearance {
  const next = { colors: { light: { ...current.colors.light }, dark: { ...current.colors.dark } }, fonts: { ...current.fonts } }
  for (const scheme of ['light', 'dark'] as const) {
    for (const [token, color] of Object.entries(patch.colors?.[scheme] ?? {})) {
      if (color === null) delete (next.colors[scheme] as Record<string, string>)[token]
      else (next.colors[scheme] as Record<string, unknown>)[token] = color
    }
  }
  for (const [role, font] of Object.entries(patch.fonts ?? {})) (next.fonts as Record<string, unknown>)[role] = font
  return normalizeAppearance(next)
}

const fontStack = (role: FontRole, name: string): string => `'${name}', ${FALLBACKS[role]}`

/**
 * CSS for the interface and the internal pages, inserted after a mod's theme so it wins.
 * Private windows keep their own colors (body.private), like with a mod theme.
 */
export function appearanceCss(appearance: Appearance): string {
  const declarations = (entries: [string, string][]): string => entries.map(([name, value]) => `  ${name}: ${value} !important;`).join('\n')
  const colors = (scheme: ColorScheme): [string, string][] =>
    Object.entries(appearance.colors[scheme]).map(([token, color]) => [`--color-${token}`, color as string])
  const fonts = (['ui', 'display', 'mono'] as const).flatMap((role): [string, string][] => {
    const name = appearance.fonts[role]
    return name ? [[FONT_VARS[role], fontStack(role, name)]] : []
  })
  // Each theme's colors only in that theme (popovers stay light in dark mode, as in styles.css).
  const blocks: string[] = []
  // Fonts everywhere, private windows included (only their colors tell them apart).
  if (fonts.length > 0) blocks.push(`html body {\n${declarations(fonts)}\n}`)
  const light = colors('light')
  if (light.length > 0) {
    blocks.push(`@media not (prefers-color-scheme: dark) {\nhtml body:not(.private) {\n${declarations(light)}\n}\n}`)
    blocks.push(`@media (prefers-color-scheme: dark) {\nhtml body.overlay:not(.private) {\n${declarations(light)}\n}\n}`)
  }
  const dark = colors('dark')
  if (dark.length > 0) {
    blocks.push(`@media (prefers-color-scheme: dark) {\nhtml body:not(.private):not(.overlay) {\n${declarations(dark)}\n}\n}`)
  }
  return blocks.join('\n')
}
