/**
 * Google Translate, as Google's own Chrome extension calls it (clients5 « dict-chrome-ex »): no key,
 * line breaks kept, several pieces per request. Only ever called on a click (CLAUDE.md §6.8).
 * No electron import here: `fetcher` is given (unit tests, a cookie-less session in Zak).
 *
 * The service reads its input as HTML: the text is escaped, and names are sent inside
 * `<span translate="no">`, which it leaves as they are (« Merci Pierre » no longer gives « Thank you
 * Peter »). It sends plain text back, the spans still around the names.
 */
import { guessLanguage, nameRanges } from '../../shared/textLanguage'

export const TRANSLATE_ENDPOINT = 'https://clients5.google.com/translate_a/t'

/** Longest piece sent in one `q` (a request carries every piece). */
const PIECE_MAX = 4500
/** Longest text translated at once. */
export const TRANSLATE_MAX = 30_000

export type Fetcher = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export interface Translation {
  text: string
  /** Detected language of the original (Google code), '' when unknown. */
  source: string
}

/**
 * Cuts `text` into pieces of at most `max` characters, at line breaks (else at a sentence end, else
 * a space), keeping every character: the pieces joined give the text back.
 */
export function splitText(text: string, max = PIECE_MAX): string[] {
  const pieces: string[] = []
  let rest = text
  while (rest.length > max) {
    const window = rest.slice(0, max)
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf(' '))
    const at = cut > max / 2 ? cut + 1 : max
    pieces.push(rest.slice(0, at))
    rest = rest.slice(at)
  }
  if (rest) pieces.push(rest)
  return pieces
}

/** Google trims the spaces and line breaks around a piece: they are put back as they were. */
function around(piece: string): { before: string; core: string; after: string } {
  const before = /^\s*/.exec(piece)![0]
  const after = piece.length > before.length ? /\s*$/.exec(piece)![0] : ''
  return { before, core: piece.slice(before.length, piece.length - after.length), after }
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** `text` as the service reads it: escaped, the names marked « not to translate ». */
export function protectNames(text: string, language?: string): string {
  let out = ''
  let at = 0
  for (const { start, end } of nameRanges(text, language)) {
    out += escapeHtml(text.slice(at, start)) + `<span translate="no">${escapeHtml(text.slice(start, end))}</span>`
    at = end
  }
  return out + escapeHtml(text.slice(at))
}

/** The translation without the marks around the names (the service may change their case). */
export const unprotectNames = (text: string): string => text.replace(/<span\s+translate\s*=\s*["']no["']\s*>([\s\S]*?)<\/span>/gi, '$1')

/** [[translation, source], …] for several pieces; [translation, source] or "translation" for one. */
export function parseResponse(data: unknown, count: number): Translation[] {
  if (!Array.isArray(data)) throw new Error('Unexpected response')
  const rows = count === 1 && !Array.isArray(data[0]) ? [data] : data
  return rows.map((row: unknown) => {
    if (typeof row === 'string') return { text: row, source: '' }
    if (Array.isArray(row) && typeof row[0] === 'string') return { text: row[0], source: typeof row[1] === 'string' ? row[1] : '' }
    throw new Error('Unexpected response')
  })
}

export async function translateText(text: string, target: string, fetcher: Fetcher, endpoint = TRANSLATE_ENDPOINT): Promise<Translation> {
  const kept = text.slice(0, TRANSLATE_MAX)
  const language = guessLanguage(kept)
  const pieces = splitText(kept).map(around)
  const sent = pieces.filter((p) => p.core !== '')
  if (sent.length === 0) return { text, source: '' }
  const url = `${endpoint}?${new URLSearchParams({ client: 'dict-chrome-ex', sl: 'auto', tl: target })}`
  const body = sent.map((p) => `q=${encodeURIComponent(protectNames(p.core, language))}`).join('&')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const translated = parseResponse(await res.json(), sent.length)
    if (translated.length !== sent.length) throw new Error('Unexpected response')
    let i = 0
    const out = pieces.map((p) => (p.core === '' ? p.before + p.after : p.before + unprotectNames(translated[i++]!.text) + p.after)).join('')
    return { text: out, source: translated.find((t) => t.source)?.source ?? '' }
  } finally {
    clearTimeout(timer)
  }
}
