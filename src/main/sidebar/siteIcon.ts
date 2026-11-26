import { nativeImage, session, type Session } from 'electron'
import { chromeUserAgent } from '../userAgent'

/** Size the icon is kept at: sharp on the mosaic tiles, even on a Retina screen. */
const SIZE = 128
const MAX_BYTES = 1_000_000
const MAX_DATA_URL = 400_000
const TIMEOUT_MS = 8000

/** A throwaway session: no cookies or cache of the user's browsing go with these requests. */
let iconSession: Session | null = null
const ses = (): Session => (iconSession ??= session.fromPartition('zak-site-icons'))

interface Candidate {
  href: string
  size: number
}

/**
 * The icon of the site at `pageUrl`, as a data: URL (kept by the favorite, so it shows offline and
 * stays sharp): the largest one the page declares (apple-touch-icon, <link rel=icon sizes>), else
 * /favicon.ico. Null when the site has none or can't be reached.
 */
export async function fetchSiteIcon(pageUrl: string): Promise<string | null> {
  let page: URL
  try {
    page = new URL(pageUrl)
  } catch {
    return null
  }
  if (page.protocol !== 'https:' && page.protocol !== 'http:') return null

  const candidates: Candidate[] = []
  const html = await get(page.href).catch(() => null)
  if (html && /text\/html/.test(html.type)) {
    const base = html.url
    for (const tag of new TextDecoder().decode(html.body).match(/<link\b[^>]*>/gi) ?? []) {
      const rel = attr(tag, 'rel')?.toLowerCase() ?? ''
      const href = attr(tag, 'href')
      if (!href || !/(^|\s)(icon|apple-touch-icon(-precomposed)?)(\s|$)/.test(rel)) continue
      try {
        candidates.push({ href: new URL(href, base).href, size: declaredSize(tag, rel) })
      } catch {
        /* a broken href */
      }
    }
  }
  candidates.sort((a, b) => b.size - a.size)
  candidates.push({ href: new URL('/favicon.ico', page.origin).href, size: 0 })

  for (const candidate of candidates) {
    const icon = await get(candidate.href).catch(() => null)
    const data = icon && toDataUrl(icon.body, icon.type)
    if (data) return data
  }
  return null
}

/** Largest side the tag declares; apple-touch-icon is 180 px unless told otherwise. */
function declaredSize(tag: string, rel: string): number {
  const sizes = attr(tag, 'sizes')?.toLowerCase() ?? ''
  if (sizes === 'any' || /svg/.test(attr(tag, 'type') ?? '')) return 256
  const sides = [...sizes.matchAll(/(\d+)x(\d+)/g)].map((m) => Number(m[1]))
  if (sides.length > 0) return Math.max(...sides)
  return rel.includes('apple-touch-icon') ? 180 : 32
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : null
}

/** A raster image becomes a PNG of at most SIZE px; an SVG or ICO Chromium can show is kept as is. */
function toDataUrl(body: Buffer, type: string): string | null {
  if (body.length === 0) return null
  const image = nativeImage.createFromBuffer(body)
  if (!image.isEmpty()) {
    const { width, height } = image.getSize()
    const scale = Math.min(1, SIZE / Math.max(width, height))
    const png = (scale < 1 ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' }) : image).toPNG()
    return `data:image/png;base64,${png.toString('base64')}`
  }
  const isIco = body.length > 4 && body.readUInt32LE(0) === 0x00010000
  const mime = /svg/.test(type) ? 'image/svg+xml' : isIco || /icon/.test(type) ? 'image/x-icon' : null
  if (!mime) return null
  const url = `data:${mime};base64,${body.toString('base64')}`
  return url.length <= MAX_DATA_URL ? url : null
}

async function get(url: string): Promise<{ body: Buffer; type: string; url: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await ses().fetch(url, { signal: controller.signal, headers: { 'User-Agent': chromeUserAgent() }, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length > MAX_BYTES) throw new Error('too large')
    return { body, type: res.headers.get('content-type') ?? '', url: res.url || url }
  } finally {
    clearTimeout(timer)
  }
}
