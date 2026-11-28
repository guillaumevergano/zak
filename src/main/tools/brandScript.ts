/// <reference lib="dom" />
import type { BrandScan } from '@shared/colors'

/**
 * « Charte graphique » (CLAUDE.md §6.8): reads the page's colors, fonts, text styles, buttons,
 * radii, shadows and logo from the computed styles, in an isolated world (tabs get no preload, §3).
 * Only what is drawn counts: hidden elements are skipped, backgrounds weigh by their visible area,
 * texts by their characters. Main aggregates the result (aggregateBrand in shared/colors.ts).
 */
export const BRAND_WORLD_ID = 2010

export function brandScript(): string {
  return `(${collect.toString()})()`
}

// ─── Below: page code (no imports, no closures over module scope) ──────────────────────────────

function collect(): BrandScan {
  const MAX_ELEMENTS = 5000
  const viewW = innerWidth
  const viewH = innerHeight
  const samples = new Map<string, { color: string; use: 'background' | 'text' | 'border' | 'fill' | 'action'; weight: number }>()
  const add = (color: string, use: 'background' | 'text' | 'border' | 'fill' | 'action', weight: number): void => {
    if (!color || color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color) || !(weight > 0)) return
    const key = `${use}|${color}`
    const sample = samples.get(key)
    if (sample) sample.weight += weight
    else samples.set(key, { color, use, weight })
  }
  const texts = new Map<string, BrandScan['texts'][number]>()
  const radii = new Map<string, number>()
  const shadows = new Map<string, number>()
  const count = (map: Map<string, number>, value: string): void => {
    map.set(value, (map.get(value) ?? 0) + 1)
  }
  const buttons: BrandScan['buttons'] = []
  const buttonKeys = new Set<string>()

  const headingTag = /^H[1-6]$/
  const roleOf = (el: Element, size: number, bodySize: number): BrandScan['texts'][number]['role'] => {
    if (headingTag.test(el.tagName) || size >= bodySize * 1.6) return 'heading'
    if (el.closest('button, [role="button"], input[type="submit"], .btn, .button')) return 'button'
    if (el.closest('a')) return 'link'
    return 'body'
  }
  const tagOf = (el: Element): string => {
    const heading = el.closest('h1, h2, h3, h4, h5, h6')
    if (heading) return heading.tagName.toLowerCase()
    if (el.closest('button, [role="button"]')) return 'button'
    if (el.closest('a')) return 'a'
    if (el.closest('small')) return 'small'
    return el.closest('p, li, td, dd, blockquote') ? 'p' : el.tagName.toLowerCase()
  }
  const directText = (el: Element): number => {
    let n = 0
    for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) n += (node.textContent ?? '').trim().length
    return n
  }

  const body = document.body
  const bodySize = body ? parseFloat(getComputedStyle(body).fontSize) || 16 : 16
  // The page's own background (html, then body) counts for the whole page.
  for (const root of [document.documentElement, body]) {
    if (!root) continue
    const bg = getComputedStyle(root).backgroundColor
    add(bg, 'background', viewW * viewH * 0.5)
  }

  const elements = body ? body.querySelectorAll('*') : []
  let seen = 0
  for (const el of elements) {
    if (++seen > MAX_ELEMENTS) break
    if (el.closest('script, style, noscript, template, head')) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue
    // Visible area, at most a screen (a long page's sections don't drown everything else).
    const area = Math.min(rect.width * rect.height, viewW * viewH)

    add(style.backgroundColor, 'background', area)
    if (style.backgroundImage.includes('gradient(')) {
      const stops = style.backgroundImage.match(/rgba?\([^)]+\)/g) ?? []
      for (const stop of stops) add(stop, 'background', area / stops.length)
    }
    const borderWidth = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
    if (borderWidth > 0 && style.borderTopStyle !== 'none') add(style.borderTopColor, 'border', ((rect.width + rect.height) * borderWidth) / 2)
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement) && style.fill && style.fill !== 'none' && !style.fill.startsWith('url(')) {
      add(style.fill, 'fill', area)
    }

    const chars = directText(el)
    if (chars > 0) {
      const size = parseFloat(style.fontSize) || bodySize
      add(style.color, 'text', chars * size)
      const weight = parseInt(style.fontWeight, 10) || 400
      const lineHeight = style.lineHeight === 'normal' ? 0 : parseFloat(style.lineHeight) || 0
      const role = roleOf(el, size, bodySize)
      const tag = tagOf(el)
      const key = [style.fontFamily, weight, size, lineHeight, style.letterSpacing, style.textTransform, tag, role].join('|')
      const text = texts.get(key)
      if (text) text.chars += chars
      else
        texts.set(key, {
          family: style.fontFamily,
          weight,
          size,
          lineHeight,
          letterSpacing: style.letterSpacing,
          transform: style.textTransform,
          tag,
          role,
          chars
        })
    }

    if (style.borderTopLeftRadius !== '0px') count(radii, style.borderRadius)
    if (style.boxShadow !== 'none') count(shadows, style.boxShadow)

    // What one clicks shows the brand: buttons' backgrounds and borders, links' color.
    if (el.matches('a[href], button, [role="button"]')) {
      add(style.backgroundColor, 'action', 1)
      if (borderWidth > 0) add(style.borderTopColor, 'action', 0.5)
      if (el.tagName === 'A') add(style.color, 'action', 0.5)
    }
    const isButton = el.matches('button, [role="button"], input[type="submit"], a.btn, a.button, a[class*="btn"], a[class*="button"]')
    if (isButton && buttons.length < 8 && rect.width >= 40 && rect.height >= 24) {
      const label = (el instanceof HTMLInputElement ? el.value : el instanceof HTMLElement ? el.innerText : el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32)
      const bg = style.backgroundColor
      const transparentBg = bg === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(bg)
      // A button with nothing to show (an icon only, no background nor border) isn't a style.
      if (label && !(transparentBg && borderWidth === 0)) {
        const button = {
          text: label,
          background: bg,
          color: style.color,
          border: borderWidth > 0 ? `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}` : 'none',
          radius: style.borderRadius,
          padding: style.padding,
          family: style.fontFamily,
          size: parseFloat(style.fontSize) || bodySize,
          weight: parseInt(style.fontWeight, 10) || 400,
          transform: style.textTransform
        }
        const key = [button.background, button.color, button.border, button.radius, button.family, button.weight].join('|')
        if (!buttonKeys.has(key)) {
          buttonKeys.add(key)
          buttons.push(button)
        }
      }
    }
  }

  // Custom properties: Chromium lists them in the computed style of :root.
  const variables: BrandScan['variables'] = []
  const rootStyle = getComputedStyle(document.documentElement)
  for (let i = 0; i < rootStyle.length && variables.length < 400; i++) {
    const name = rootStyle[i]!
    if (name.startsWith('--')) variables.push({ name, value: rootStyle.getPropertyValue(name).trim().slice(0, 120) })
  }

  const fontLinks = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href], link[rel="preconnect"][href]')]
    .map((l) => l.href)
    .filter((h) => /fonts\.googleapis|typekit|use\.adobe|fonts\.bunny/.test(h))
    .slice(0, 20)
  const webFonts = new Set<string>()
  document.fonts.forEach((face) => {
    if (face.status === 'loaded') webFonts.add(face.family.replace(/^["']|["']$/g, ''))
  })

  // The logo: an image or an SVG in the header, or one that says it is the logo.
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect()
    return r.width >= 16 && r.height >= 12 && r.top < viewH * 1.5
  }
  const candidates = [
    ...document.querySelectorAll('header [class*="logo" i] img, header [class*="logo" i] svg, [class*="logo" i] img, [id*="logo" i] img, img[alt*="logo" i], img[src*="logo" i], img[class*="logo" i], svg[class*="logo" i], [class*="logo" i] > svg, [id*="logo" i] svg'),
    ...document.querySelectorAll('header a[href="/"] img, header a[href="/"] svg, a[href="/"] img, a[href="/"] svg, header img, header svg')
  ]
  const logoEl = candidates.find(visible) ?? null
  let logo: BrandScan['logo'] = null
  if (logoEl instanceof HTMLImageElement && (logoEl.currentSrc || logoEl.src)) logo = { kind: 'img', src: logoEl.currentSrc || logoEl.src }
  else if (logoEl instanceof SVGSVGElement) {
    const clone = logoEl.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    // `currentColor` takes the color the logo has on the page.
    const color = getComputedStyle(logoEl).color
    clone.setAttribute('style', `color: ${color}`)
    if (!clone.getAttribute('width')) clone.setAttribute('width', String(Math.round(logoEl.getBoundingClientRect().width)))
    if (!clone.getAttribute('height')) clone.setAttribute('height', String(Math.round(logoEl.getBoundingClientRect().height)))
    // <use> pointing into the page's sprite: inline what it refers to.
    clone.querySelectorAll('use').forEach((use) => {
      const ref = use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? ''
      const target = ref.startsWith('#') ? document.getElementById(ref.slice(1)) : null
      if (target) use.replaceWith(target.cloneNode(true))
    })
    const markup = new XMLSerializer().serializeToString(clone)
    if (markup.length < 200_000) logo = { kind: 'svg', markup }
  }

  const icons = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"][href], link[rel="apple-touch-icon"][href]')]
    .map((l) => ({ href: l.href, size: parseInt((l.sizes?.value ?? '').split('x')[0] ?? '', 10) || (l.rel.includes('apple') ? 180 : 16) }))
    .sort((a, b) => b.size - a.size)
    .map((i) => i.href)
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null

  return {
    url: location.href,
    title: document.title,
    themeColor,
    icons: icons.slice(0, 4),
    logo,
    samples: [...samples.values()],
    variables,
    texts: [...texts.values()],
    fontLinks,
    webFonts: [...webFonts],
    radii: [...radii].map(([value, n]) => ({ value, count: n })),
    shadows: [...shadows].map(([value, n]) => ({ value, count: n })),
    buttons
  }
}
