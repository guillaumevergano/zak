/**
 * « Couleurs » (CLAUDE.md §6.8): the eyedropper's colors and the brand kits read from a site.
 * Pure code, shared by main (aggregation, storage), the overlay and zak://colors.
 */

/** How a color is copied: `#C67AFB`, `rgb(198, 122, 251)` or `hsl(276, 94%, 73%)`. */
export type ColorFormat = 'hex' | 'rgb' | 'hsl'
export const COLOR_FORMATS: readonly ColorFormat[] = ['hex', 'rgb', 'hsl']

/** A color picked with the eyedropper (history), or kept (favorite). One row per color. */
export interface SavedColor {
  id: string
  /** `#RRGGBB`, upper case. */
  hex: string
  favorite: boolean
  /** A name given to a favorite ('' = none). */
  name: string
  /** Where it was picked or found (a brand kit's site), when known. */
  sourceUrl: string | null
  sourceTitle: string | null
  pickedAt: number
}

export interface Rgb {
  r: number
  g: number
  b: number
  /** 0–1. */
  a: number
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/** `#abc`, `#aabbcc`, `#aabbccdd`, `rgb()`/`rgba()` (comma or space syntax); null otherwise. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1]
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = [...hex].map((c) => parseInt(c + c, 16))
      return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 }
    }
    if (hex.length === 6 || hex.length === 8) {
      const n = (i: number): number => parseInt(hex.slice(i, i + 2), 16)
      return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 }
    }
    return null
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(text)?.[1]
  if (!fn) return null
  const parts = fn.split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return null
  const channel = (p: string): number => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p))
  const [r, g, b] = parts.slice(0, 3).map(channel)
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
  if ([r, g, b, alpha].some((n) => n === undefined || Number.isNaN(n))) return null
  return { r: clamp(Math.round(r!), 0, 255), g: clamp(Math.round(g!), 0, 255), b: clamp(Math.round(b!), 0, 255), a: clamp(alpha, 0, 1) }
}

export function toHex({ r, g, b }: Pick<Rgb, 'r' | 'g' | 'b'>): string {
  return `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** `#RRGGBB` (upper case), or null when it is not a color. */
export function normalizeHex(value: string): string | null {
  const rgb = parseColor(value)
  return rgb ? toHex(rgb) : null
}

export function toHsl({ r, g, b }: Pick<Rgb, 'r' | 'g' | 'b'>): { h: number; s: number; l: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
  return { h: Math.round((h * 60 + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/** The color as copied in `format`. */
export function formatColor(hex: string, format: ColorFormat): string {
  const rgb = parseColor(hex)
  if (!rgb) return hex
  if (format === 'rgb') return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  if (format === 'hsl') {
    const { h, s, l } = toHsl(rgb)
    return `hsl(${h}, ${s}%, ${l}%)`
  }
  return toHex(rgb)
}

/** Relative luminance (WCAG). */
export function luminance(hex: string): number {
  const rgb = parseColor(hex) ?? { r: 0, g: 0, b: 0 }
  const lin = (c: number): number => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/** Text drawn on this color: dark or light, whichever reads better. */
export function inkOn(hex: string): '#1A1018' | '#FFFFFF' {
  return luminance(hex) > 0.4 ? '#1A1018' : '#FFFFFF'
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** CIE Lab (D65): distances there match what the eye sees. */
function toLab({ r, g, b }: Pick<Rgb, 'r' | 'g' | 'b'>): [number, number, number] {
  const lin = (c: number): number => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** Lab distance (ΔE 1976): under ~5, two colors look the same. */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = toLab(parseColor(a) ?? { r: 0, g: 0, b: 0 })
  const [l2, a2, b2] = toLab(parseColor(b) ?? { r: 0, g: 0, b: 0 })
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** Lab chroma: how colorful (0 for greys). */
export function chroma(hex: string): number {
  const [, a, b] = toLab(parseColor(hex) ?? { r: 0, g: 0, b: 0 })
  return Math.hypot(a, b)
}

// ─── Brand kits ───────────────────────────────────────────────────────────────────────────────

/** What a color does on the site. */
export type BrandColorRole = 'primary' | 'accent' | 'background' | 'surface' | 'text' | 'neutral'
export type ColorUse = 'background' | 'text' | 'border' | 'fill'
/** In a scan only: what one clicks (buttons, links), a hint of the brand color. */
export type SampleUse = ColorUse | 'action'

export interface BrandColor {
  hex: string
  role: BrandColorRole
  /** Share of the page it accounts for, 0–1 (backgrounds by area, texts by characters). */
  share: number
  uses: ColorUse[]
}

export type FontRole = 'heading' | 'body' | 'button' | 'link'

export interface BrandFont {
  /** The family the site asks for first (« Inter »). */
  family: string
  /** The whole stack as written (« Inter, system-ui, sans-serif »). */
  stack: string
  roles: FontRole[]
  weights: number[]
  /** Share of the text, 0–1. */
  share: number
  /** Where it comes from: Google Fonts, Adobe Fonts, the site's own files, or the computer. */
  source: 'google' | 'adobe' | 'web' | 'system'
}

/** A text style of the page: a heading level, the body text… */
export interface TypeStyle {
  tag: string
  family: string
  /** px. */
  size: number
  weight: number
  /** px, or 0 for « normal ». */
  lineHeight: number
  letterSpacing: string
  transform: string
}

export interface ButtonStyle {
  text: string
  background: string
  color: string
  border: string
  radius: string
  padding: string
  family: string
  size: number
  weight: number
  transform: string
}

export interface BrandData {
  colors: BrandColor[]
  /** The site's CSS custom properties that are colors (`--brand-primary: #C67AFB`). */
  variables: { name: string; hex: string }[]
  fonts: BrandFont[]
  styles: TypeStyle[]
  buttons: ButtonStyle[]
  /** Border radii and shadows, most used first. */
  radii: string[]
  shadows: string[]
  /** The logo as a data: URL (or its address when it couldn't be fetched). */
  logo: string | null
  /** The site's icon (data: URL or address). */
  icon: string | null
  themeColor: string | null
}

/** A brand kit read from a site, kept in zak://colors with a comment and a folder. */
export interface BrandKit {
  id: string
  url: string
  title: string
  host: string
  folderId: string | null
  comment: string
  data: BrandData
  /** A picture of the page when it was read (JPEG data: URL). */
  preview: string | null
  createdAt: number
  updatedAt: number
}

/** What the list of kits shows: no data but the main colors and fonts. */
export interface BrandKitSummary {
  id: string
  url: string
  title: string
  host: string
  folderId: string | null
  comment: string
  colors: string[]
  fonts: string[]
  logo: string | null
  preview: string | null
  createdAt: number
  updatedAt: number
}

export interface BrandFolder {
  id: string
  name: string
  emoji: string | null
  position: number
}

/** What the page script collects (src/main/tools/brandScript.ts), aggregated here. */
export interface BrandScan {
  url: string
  title: string
  themeColor: string | null
  icons: string[]
  logo: { kind: 'img'; src: string } | { kind: 'svg'; markup: string } | null
  /** Computed colors with how much of the page each covers. */
  samples: { color: string; use: SampleUse; weight: number }[]
  variables: { name: string; value: string }[]
  texts: { family: string; weight: number; size: number; lineHeight: number; letterSpacing: string; transform: string; tag: string; role: FontRole; chars: number }[]
  /** Stylesheet addresses: Google Fonts, Adobe Fonts… */
  fontLinks: string[]
  /** Families of the @font-face rules the site loaded. */
  webFonts: string[]
  radii: { value: string; count: number }[]
  shadows: { value: string; count: number }[]
  buttons: ButtonStyle[]
}

const MAX_COLORS = 12
const SAME_COLOR = 7

/** « Inter », from `"Inter", system-ui, sans-serif`. */
export function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
}

const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', 'blinkmacsystemfont', 'math', 'emoji'
])

/**
 * Merges colors that look the same and gives each a role. The primary one is the colorful color
 * of what one clicks (buttons, links), or of the site's variables, before the one of a big picture.
 */
export function brandColors(samples: BrandScan['samples'], hints: string[] = []): BrandColor[] {
  interface Bucket {
    hex: string
    /** Its heaviest sample's weight: the bucket shows that sample's color. */
    weight: number
    byUse: Record<SampleUse, number>
  }
  const totals: Record<SampleUse, number> = { background: 0, text: 0, border: 0, fill: 0, action: 0 }
  const buckets: Bucket[] = []
  for (const sample of samples) {
    const rgb = parseColor(sample.color)
    if (!rgb || rgb.a < 0.5 || !(sample.weight > 0)) continue
    const hex = toHex(rgb)
    totals[sample.use] += sample.weight
    let bucket = buckets.find((b) => colorDistance(b.hex, hex) < SAME_COLOR)
    if (!bucket) {
      bucket = { hex, weight: 0, byUse: { background: 0, text: 0, border: 0, fill: 0, action: 0 } }
      buckets.push(bucket)
    }
    bucket.byUse[sample.use] += sample.weight
    if (sample.use === 'action') continue
    // The bucket keeps the color of its heaviest sample.
    if (sample.weight > bucket.weight) bucket.hex = hex
    bucket.weight = Math.max(bucket.weight, sample.weight)
  }
  const share = (b: Bucket, use: SampleUse): number => (totals[use] > 0 ? b.byUse[use] / totals[use] : 0)
  const scored = buckets.map((b) => {
    const bg = share(b, 'background')
    const text = share(b, 'text')
    const other = (share(b, 'border') + share(b, 'fill')) / 2
    const colorful = chroma(b.hex) > 25
    // A brand color is small (a button, a link) but counts: colorful ones weigh more.
    const score = (bg + text * 0.8 + other * 0.4) * (colorful ? 3 : 1)
    const uses = (['background', 'text', 'border', 'fill'] as ColorUse[]).filter((u) => b.byUse[u] > 0)
    const hinted = hints.filter((h) => colorDistance(h, b.hex) < SAME_COLOR).length
    const brandness = share(b, 'action') * 2 + Math.min(hinted, 5) * 0.1 + score
    return { b, bg, text, colorful, score, uses, brandness }
  })
  // Seen only on what one clicks: still a candidate (a link color), not on the palette otherwise.
  scored.sort((x, y) => y.score - x.score)
  const primary = scored.filter((s) => s.colorful && s.score + s.brandness > 0.002).sort((x, y) => y.brandness - x.brandness)[0] ?? null

  const neutrals = scored.filter((s) => !s.colorful && s.score > 0)
  const accents = scored.filter((s) => s.colorful && s.score > 0.002)
  // Keep the main neutrals and up to 6 colorful ones, so a big grey site still shows its brand.
  const picked = [...new Set([...(primary ? [primary] : []), ...accents.slice(0, 6), ...neutrals])].slice(0, MAX_COLORS)
  picked.sort((x, y) => (x === primary ? -1 : y === primary ? 1 : y.score - x.score))
  const backgroundLead = neutrals.reduce<(typeof neutrals)[number] | null>((best, s) => (!best || s.bg > best.bg ? s : best), null)
  let primaryGiven = false
  return picked.map((s) => {
    let role: BrandColorRole
    if (s.colorful) {
      role = s === primary || (!primary && !primaryGiven) ? 'primary' : 'accent'
      primaryGiven = true
    } else if (s === backgroundLead && s.bg > 0) role = 'background'
    else if (s.text > s.bg && s.text > 0.05) role = 'text'
    else if (s.bg > 0.05) role = 'surface'
    else role = 'neutral'
    return { hex: s.b.hex, role, share: Math.round(Math.max(s.bg, s.text) * 1000) / 1000, uses: s.uses }
  })
}

/** The site's color variables, the brand-named ones first. */
export function brandVariables(variables: BrandScan['variables']): BrandData['variables'] {
  const seen = new Set<string>()
  const found: BrandData['variables'] = []
  for (const { name, value } of variables) {
    if (!name.startsWith('--') || seen.has(name)) continue
    const hex = /^(#|rgb)/i.test(value.trim()) ? normalizeHex(value) : null
    if (!hex || (parseColor(value)?.a ?? 1) < 0.5) continue
    seen.add(name)
    found.push({ name: name.slice(0, 80), hex })
  }
  const branded = (n: string): number => (/brand|primary|secondary|accent|main|theme/i.test(n) ? 0 : 1)
  return found.sort((a, b) => branded(a.name) - branded(b.name)).slice(0, 40)
}

/** Fonts by how much text they set, with what they are used for. */
export function brandFonts(scan: Pick<BrandScan, 'texts' | 'fontLinks' | 'webFonts'>): BrandFont[] {
  const total = scan.texts.reduce((sum, t) => sum + t.chars, 0) || 1
  const byFamily = new Map<string, BrandFont & { chars: number }>()
  for (const text of scan.texts) {
    const family = firstFamily(text.family)
    if (!family) continue
    const key = family.toLowerCase()
    const font = byFamily.get(key) ?? { family, stack: text.family, roles: [], weights: [], share: 0, source: 'system' as const, chars: 0 }
    font.chars += text.chars
    if (!font.roles.includes(text.role)) font.roles.push(text.role)
    if (!font.weights.includes(text.weight)) font.weights.push(text.weight)
    byFamily.set(key, font)
  }
  const links = scan.fontLinks.join(' ').toLowerCase()
  const web = new Set(scan.webFonts.map((f) => f.toLowerCase()))
  const order: FontRole[] = ['heading', 'body', 'button', 'link']
  return [...byFamily.values()]
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 6)
    .map(({ chars, ...font }) => {
      const name = font.family.toLowerCase()
      const inLinks = links.includes(name.replace(/ /g, '+')) || links.includes(encodeURIComponent(name)) || links.includes(name)
      const source: BrandFont['source'] =
        inLinks && links.includes('fonts.googleapis.com')
          ? 'google'
          : inLinks && /typekit|use\.adobe/.test(links)
            ? 'adobe'
            : web.has(name) && !GENERIC_FAMILIES.has(name)
              ? 'web'
              : 'system'
      return {
        ...font,
        source,
        roles: font.roles.sort((a, b) => order.indexOf(a) - order.indexOf(b)),
        weights: font.weights.sort((a, b) => a - b),
        share: Math.round((chars / total) * 1000) / 1000
      }
    })
}

const STYLE_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'small']

/** The page's text styles: for each heading level and the body text, the one used most. */
export function typeStyles(texts: BrandScan['texts']): TypeStyle[] {
  const best = new Map<string, { style: TypeStyle; chars: number }>()
  const byKey = new Map<string, { style: TypeStyle; chars: number }>()
  for (const text of texts) {
    if (!STYLE_TAGS.includes(text.tag)) continue
    const style: TypeStyle = {
      tag: text.tag,
      family: firstFamily(text.family),
      size: Math.round(text.size * 10) / 10,
      weight: text.weight,
      lineHeight: Math.round(text.lineHeight * 10) / 10,
      letterSpacing: text.letterSpacing === 'normal' ? '' : text.letterSpacing,
      transform: text.transform === 'none' ? '' : text.transform
    }
    const key = JSON.stringify(style)
    const entry = byKey.get(key) ?? { style, chars: 0 }
    entry.chars += text.chars
    byKey.set(key, entry)
    const current = best.get(text.tag)
    if (!current || entry.chars > current.chars) best.set(text.tag, entry)
  }
  return STYLE_TAGS.filter((tag) => best.has(tag)).map((tag) => best.get(tag)!.style)
}

/** The whole kit from what the page script collected (logo and icon are fetched by main). */
export function aggregateBrand(scan: BrandScan): Omit<BrandData, 'logo' | 'icon'> {
  const top = (list: { value: string; count: number }[], skip: RegExp, n: number): string[] =>
    [...list]
      .filter((r) => !skip.test(r.value))
      .sort((a, b) => b.count - a.count)
      .slice(0, n)
      .map((r) => r.value.slice(0, 200))
  return {
    colors: brandColors(
      scan.samples,
      [...brandVariables(scan.variables).filter((v) => /brand|primary|accent|button|cta|link/i.test(v.name)).map((v) => v.hex), ...(scan.themeColor ? [scan.themeColor] : [])]
    ),
    variables: brandVariables(scan.variables),
    fonts: brandFonts(scan),
    styles: typeStyles(scan.texts),
    buttons: scan.buttons.slice(0, 4),
    radii: top(scan.radii, /^0(px)?( 0(px)?)*$/, 6),
    shadows: top(scan.shadows, /^none$/, 4),
    themeColor: scan.themeColor ? normalizeHex(scan.themeColor) : null
  }
}

/** The kit as CSS custom properties, to paste in a stylesheet. */
export function kitToCss(kit: Pick<BrandKit, 'host' | 'data'>): string {
  const lines: string[] = []
  const used = new Map<string, number>()
  for (const color of kit.data.colors) {
    const n = (used.get(color.role) ?? 0) + 1
    used.set(color.role, n)
    lines.push(`  --color-${color.role}${n > 1 ? `-${n}` : ''}: ${color.hex};`)
  }
  kit.data.fonts.forEach((font, i) => lines.push(`  --font-${i + 1}: ${font.stack}; /* ${font.roles.join(', ')} */`))
  kit.data.radii.forEach((r, i) => lines.push(`  --radius-${i + 1}: ${r};`))
  kit.data.shadows.forEach((s, i) => lines.push(`  --shadow-${i + 1}: ${s};`))
  return `/* ${kit.host} */\n:root {\n${lines.join('\n')}\n}\n`
}

/** Clears what a hand-edited or old row may hold. */
export function normalizeBrandData(raw: unknown): BrandData {
  const d = (raw ?? {}) as Partial<BrandData>
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    colors: list<BrandColor>(d.colors),
    variables: list(d.variables),
    fonts: list<BrandFont>(d.fonts),
    styles: list<TypeStyle>(d.styles),
    buttons: list<ButtonStyle>(d.buttons),
    radii: list<string>(d.radii),
    shadows: list<string>(d.shadows),
    logo: typeof d.logo === 'string' ? d.logo : null,
    icon: typeof d.icon === 'string' ? d.icon : null,
    themeColor: typeof d.themeColor === 'string' ? d.themeColor : null
  }
}
