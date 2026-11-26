import { getLang, locale, t, type Lang } from '@shared/i18n'
import type { GeneralSettings, NewtabHeadline, NewtabHeadlineSource } from '@shared/types'
import { SAYINGS } from './sayings'

/**
 * What zak://newtab shows under its logo (CLAUDE.md §7, setting « Sous le logo »): Zak's own
 * words, the user's, a quote or a proverb (shipped with Zak, offline), or something to learn from
 * Wikipedia (« Ce jour dans l'histoire », « Le saviez-vous ? »), in the interface's language.
 * Wikipedia is only asked when one of its sources is chosen; no cookies, nothing about the user
 * is sent. The next item is fetched ahead, so a new tab shows one at once.
 */

const TIMEOUT_MS = 4000
/** Wikipedia items kept ahead. */
const QUEUE = 3
/** Something to read at a glance: two or three lines at most. */
const MAX_TITLE = 150

/** Wikimedia asks API clients to say who they are (no personal data). */
const HEADERS = { 'Api-User-Agent': 'Zak browser (https://hellozak.com)', Accept: 'application/json' }

interface OnThisDayEvent {
  text?: string
  year?: number
  pages?: { content_urls?: { desktop?: { page?: string } } }[]
}

interface RandomSummary {
  type?: string
  title?: string
  extract?: string
  content_urls?: { desktop?: { page?: string } }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit', redirect: 'follow' })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return (await response.json()) as T
}

/** Short enough to read at a glance: cut at a word, with an ellipsis. */
export function shorten(text: string, max = MAX_TITLE): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[\s,;:.]+$/, '')}…`
}

/** The first sentence of a Wikipedia extract (not cut after « M. » or « J.-C. »). */
export function firstSentence(extract: string): string {
  const match = /^.{40,}?[.!?](?=\s+\p{Lu})/su.exec(extract.trim())
  return shorten(match ? match[0] : extract)
}

export const capitalize = (text: string): string => text.charAt(0).toLocaleUpperCase(locale()) + text.slice(1)

/** A shuffled bag: every item once before any comes back. */
class Bag<T> {
  private left: T[] = []
  constructor(private readonly items: () => T[]) {}
  next(): T | undefined {
    if (this.left.length === 0) this.left = [...this.items()].sort(() => Math.random() - 0.5)
    return this.left.pop()
  }
}

export class Headlines {
  private bags = new Map<string, Bag<{ text: string; author?: string }>>()
  private onThisDay: { key: string; events: Promise<OnThisDayEvent[]> } | null = null
  private wikipedia: { lang: Lang; queue: NewtabHeadline[]; filling: Promise<void> | null } = { lang: 'fr', queue: [], filling: null }

  constructor(private readonly general: () => GeneralSettings) {}

  /**
   * For the page that is opening: one of the ticked sources, at random; null: Zak's own words.
   * A source with nothing to give (Wikipedia offline, an empty « Mon texte ») lets another one try.
   */
  async next(): Promise<NewtabHeadline | null> {
    const settings = this.general()
    if (settings.newtabHeadlines.length === 0) return { kind: 'none', title: '', subtitle: '' }
    const order = [...settings.newtabHeadlines].sort(() => Math.random() - 0.5)
    for (const source of order) {
      if (source === 'zak') return null
      try {
        const item = await this.from(source, settings)
        if (item) return item
      } catch {
        /* offline, or Wikipedia unreachable: another source */
      }
    }
    return null
  }

  private async from(source: Exclude<NewtabHeadlineSource, 'zak'>, settings: GeneralSettings): Promise<NewtabHeadline | null> {
    switch (source) {
      case 'custom':
        return settings.newtabTitle.trim() || settings.newtabSubtitle.trim()
          ? { kind: 'custom', title: settings.newtabTitle, subtitle: settings.newtabSubtitle }
          : null
      case 'quote':
        return this.saying('quote')
      case 'proverb':
        return this.saying('proverb')
      case 'history':
        return this.history()
      case 'wikipedia':
        return this.didYouKnow()
    }
  }

  /** Starts fetching ahead when a Wikipedia source is ticked (at launch, after a settings change). */
  warmUp(): void {
    const sources = this.general().newtabHeadlines
    if (sources.includes('wikipedia')) void this.fill().catch(() => {})
    if (sources.includes('history')) void this.events().catch(() => {})
  }

  private saying(kind: 'quote' | 'proverb'): NewtabHeadline | null {
    const lang = getLang()
    const key = `${kind}:${lang}`
    let bag = this.bags.get(key)
    if (!bag) {
      bag = new Bag(() => (kind === 'quote' ? SAYINGS[lang].quotes : SAYINGS[lang].proverbs))
      this.bags.set(key, bag)
    }
    const item = bag.next()
    if (!item) return null
    return kind === 'quote'
      ? { kind, title: item.text, subtitle: item.author ?? '' }
      : { kind, title: item.text, subtitle: t('Proverbe') }
  }

  private events(): Promise<OnThisDayEvent[]> {
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const lang = getLang()
    const key = `${lang}/${mm}/${dd}`
    if (this.onThisDay?.key !== key) {
      const events = getJson<{ selected?: OnThisDayEvent[]; events?: OnThisDayEvent[] }>(
        `https://api.wikimedia.org/feed/v1/wikipedia/${lang}/onthisday/all/${mm}/${dd}`
      ).then((feed) => [...(feed.selected ?? []), ...(feed.events ?? [])].filter((e) => e.text && typeof e.year === 'number'))
      // A failure isn't kept: the next tab asks again.
      events.catch(() => {
        if (this.onThisDay?.key === key) this.onThisDay = null
      })
      this.onThisDay = { key, events }
    }
    return this.onThisDay.events
  }

  private async history(): Promise<NewtabHeadline | null> {
    const events = await this.events()
    if (events.length === 0) return null
    const event = events[Math.floor(Math.random() * events.length)]!
    const date = new Date()
    date.setFullYear(event.year!)
    const when = date.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
    return {
      kind: 'history',
      // Some Wikipedias write the events in lowercase (« instauration de… »).
      title: capitalize(shorten(event.text!)),
      subtitle: t('Ce jour dans l’histoire · {date}', { date: when }),
      link: event.pages?.[0]?.content_urls?.desktop?.page
    }
  }

  private async didYouKnow(): Promise<NewtabHeadline | null> {
    const lang = getLang()
    if (this.wikipedia.lang !== lang) this.wikipedia = { lang, queue: [], filling: null }
    if (this.wikipedia.queue.length === 0) await this.fill()
    const item = this.wikipedia.queue.shift() ?? null
    void this.fill().catch(() => {})
    return item
  }

  /** Tops the queue up to QUEUE random articles (skipping disambiguation pages and stubs). */
  private fill(): Promise<void> {
    const state = this.wikipedia
    state.filling ??= (async () => {
      let tries = 0
      while (state.queue.length < QUEUE && tries++ < QUEUE * 3) {
        const page = await getJson<RandomSummary>(`https://${state.lang}.wikipedia.org/api/rest_v1/page/random/summary`)
        // Skip disambiguation pages and stubs: an article with something to say.
        if (page.type !== 'standard' || !page.extract || page.extract.length < 150 || !page.title) continue
        state.queue.push({
          kind: 'wikipedia',
          title: firstSentence(page.extract),
          subtitle: t('Le saviez-vous ? · {topic}', { topic: page.title }),
          link: page.content_urls?.desktop?.page
        })
      }
    })().finally(() => {
      state.filling = null
    })
    return state.filling
  }
}
