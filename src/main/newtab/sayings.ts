import type { Lang } from '@shared/i18n'
import { sayings as de } from './sayings/de'
import { sayings as en } from './sayings/en'
import { sayings as es } from './sayings/es'
import { sayings as fr } from './sayings/fr'
import { sayings as it } from './sayings/it'
import { sayings as pt } from './sayings/pt'

/**
 * Quotes (well-attributed, mostly in their original language) and each language's own proverbs,
 * shown under the new tab page's logo (src/main/newtab/headlines.ts). Offline, nothing fetched.
 */
export interface Sayings {
  quotes: { text: string; author: string }[]
  proverbs: { text: string }[]
}

export const SAYINGS: Record<Lang, Sayings> = { fr, en, es, de, it, pt }
