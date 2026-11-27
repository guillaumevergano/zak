/**
 * What Zak can tell about a selection on its own, without sending it anywhere (CLAUDE.md §6.8):
 * which of its interface languages it is written in, and which words are names (kept as they are).
 */

/** Frequent short words of each interface language: enough to recognise a sentence. */
const COMMON: Record<string, readonly string[]> = {
  fr: ['le', 'la', 'les', 'des', 'est', 'et', 'un', 'une', 'du', 'que', 'qui', 'dans', 'pour', 'pas', 'sur', 'au', 'aux', 'avec', 'ce', 'cette', 'sont', 'je', 'vous', 'nous', 'il', 'elle', 'ne', 'mais', 'ou', 'être', 'plus', 'très', 'aussi', 'merci', 'bonjour', 'oui', 'non', 'mon', 'ma', 'mes', 'ton', 'ta', 'son', 'sa', 'ses', 'leur', 'tu', 'ils', 'elles', 'on', 'était', 'été', 'fait', 'avoir', 'ça', 'chez', 'voici', 'puis', 'donc'],
  en: ['the', 'and', 'is', 'are', 'of', 'to', 'in', 'that', 'it', 'for', 'with', 'was', 'on', 'this', 'you', 'be', 'not', 'have', 'has', 'at', 'by', 'from', 'they', 'we', 'but', 'or', 'an', 'will', 'my', 'your', 'our', 'their', 'his', 'her', 'he', 'she', 'what', 'which', 'who', 'there', 'were', 'been', 'would', 'can', 'could', 'do', 'does', 'did', 'thanks', 'thank', 'hello', 'yes', 'no', 'if', 'all', 'about', 'just', 'so'],
  es: ['el', 'los', 'las', 'del', 'que', 'y', 'es', 'en', 'un', 'una', 'por', 'con', 'para', 'no', 'se', 'lo', 'como', 'más', 'pero', 'sus', 'su', 'está', 'son', 'muy', 'también', 'yo', 'usted', 'nosotros', 'gracias', 'hola', 'sí', 'esto', 'esta', 'este', 'al', 'hay', 'tiene', 'ser', 'fue', 'mi', 'tu'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'zu', 'den', 'mit', 'von', 'sich', 'auf', 'für', 'dem', 'des', 'auch', 'ich', 'sie', 'es', 'wir', 'aber', 'oder', 'wird', 'sind', 'ihr', 'mein', 'dein', 'danke', 'hallo', 'ja', 'nein', 'bei', 'nach', 'wie', 'war', 'hat', 'haben', 'noch', 'nur', 'kann', 'dass'],
  it: ['il', 'lo', 'gli', 'della', 'che', 'è', 'di', 'un', 'una', 'per', 'con', 'non', 'sono', 'del', 'alla', 'anche', 'più', 'come', 'ma', 'questo', 'questa', 'nel', 'nella', 'io', 'lei', 'noi', 'grazie', 'ciao', 'sì', 'molto', 'ho', 'ha', 'hanno', 'essere', 'mio', 'suo', 'dei', 'delle', 'le', 'ed'],
  pt: ['o', 'os', 'as', 'da', 'do', 'que', 'é', 'de', 'um', 'uma', 'para', 'com', 'não', 'em', 'no', 'na', 'são', 'mais', 'como', 'mas', 'também', 'você', 'isso', 'pelo', 'pela', 'eu', 'nós', 'obrigado', 'obrigada', 'olá', 'sim', 'muito', 'está', 'tem', 'ser', 'foi', 'meu', 'minha', 'seu', 'sua', 'dos', 'das', 'ao']
}

const SETS = Object.fromEntries(Object.entries(COMMON).map(([lang, words]) => [lang, new Set(words)]))
const ALL_COMMON = new Set(Object.values(COMMON).flat())

const WORDS = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu

/**
 * The interface language `text` is written in ('fr', 'en', 'es', 'de', 'it', 'pt'), or '' when
 * it can't tell (too short, another language or another script).
 */
export function guessLanguage(text: string): string {
  const words = text.toLowerCase().match(WORDS) ?? []
  const scores = Object.entries(SETS)
    .map(([lang, set]) => ({ lang, score: words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score)
  const [best, second] = scores
  if (!best || best.score < 2 || best.score === second?.score) return ''
  return best.lang
}

/** Google's code reduced to the language (« zh-CN » stays: Chinese has two). */
export const baseLanguage = (code: string): string => (code.startsWith('zh') ? code : code.split('-')[0]!.toLowerCase())

/**
 * The language to read a text in: the one wanted, unless the text is already in it; then the
 * interface language, or English (French when both are English).
 */
export function readerTarget(wanted: string, source: string, uiLanguage: string): string {
  if (!source || source !== wanted) return wanted
  return [uiLanguage, 'en', 'fr'].find((code) => code !== source)!
}

/** Capitalised words that are not names (English writes them with a capital). */
const NOT_NAMES = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'english', 'french', 'spanish', 'german', 'italian', 'portuguese', 'american', 'british', 'european', 'chinese', 'japanese',
  'mr', 'mrs', 'ms', 'dr', 'ok', 'okay'
])

const SENTENCE_END = /[.!?…]["»”')\]]*\s*$|^\s*$|\n\s*["«“'(\[-]*\s*$/

/** A capital first, small letters after (not an acronym in capitals, not a lone letter). */
const isCapitalised = (word: string): boolean => /^\p{Lu}/u.test(word) && /\p{Ll}/u.test(word)

/**
 * Where the names are in `text`: capitalised words in the middle of a sentence (and the same words,
 * or the start of a name of several words, at the start of one), common words and months aside.
 * None in German (every noun has a capital), nor in a title line where every word has one.
 */
export function nameRanges(text: string, language = guessLanguage(text)): { start: number; end: number }[] {
  if (language === 'de') return []
  const words = [...text.matchAll(WORDS)].map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }))
  // A title (« How To Train Your Dragon »): a line of 4 words or more, all capitalised but the small ones.
  const titleLines = new Set<number>()
  let lineStart = 0
  for (const line of text.split('\n')) {
    const inLine = words.filter((w) => w.start >= lineStart && w.end <= lineStart + line.length)
    const long = inLine.filter((w) => !ALL_COMMON.has(w.word.toLowerCase()))
    if (inLine.length >= 4 && long.length > 0 && long.every((w) => isCapitalised(w.word))) titleLines.add(lineStart)
    lineStart += line.length + 1
  }
  const inTitle = (w: { start: number }): boolean => [...titleLines].some((start) => w.start >= start && !text.slice(start, w.start).includes('\n'))

  const candidate = (w: { word: string; start: number }): boolean =>
    !inTitle(w) &&
    isCapitalised(w.word) && !ALL_COMMON.has(w.word.toLowerCase()) && !NOT_NAMES.has(w.word.toLowerCase())
  const atStart = (w: { start: number }): boolean => SENTENCE_END.test(text.slice(Math.max(0, w.start - 12), w.start))

  const names = new Set<number>()
  words.forEach((w, i) => {
    if (candidate(w) && !atStart(w)) names.add(i)
  })
  const known = new Set([...names].map((i) => words[i]!.word))
  words.forEach((w, i) => {
    if (names.has(i) || !candidate(w) || !atStart(w)) return
    // At a sentence's start: a name seen elsewhere, or the first word of « Jacques Martin ».
    const next = words[i + 1]
    const joined = next && /^[\s-]+$/.test(text.slice(w.end, next.start))
    if (known.has(w.word) || (joined && names.has(i + 1))) names.add(i)
  })

  // Neighbouring names (first and last name) make one range.
  const ranges: { start: number; end: number }[] = []
  for (const i of [...names].sort((a, b) => a - b)) {
    const w = words[i]!
    const last = ranges.at(-1)
    if (last && names.has(i - 1) && /^[\s-]+$/.test(text.slice(last.end, w.start))) last.end = w.end
    else ranges.push({ start: w.start, end: w.end })
  }
  return ranges
}
