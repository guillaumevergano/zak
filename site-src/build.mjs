// Builds the website's home page in every language from one French template (site-src/page.html)
// and one translation file per language (site-src/i18n/<lang>.json: French text → translation).
// English is the main language, at the root; the others are in /<lang>/.
//   node site-src/build.mjs          writes site/index.html and site/<lang>/index.html
//   node site-src/build.mjs --check  fails if a page is out of date or a text is not translated
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = join(HERE, '..', 'site')
const ORIGIN = 'https://hellozak.com'

/** The languages, in the order of the language menu. `dir`: where the page lives. */
export const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en_US', dir: '' },
  { code: 'fr', name: 'Français', locale: 'fr_FR', dir: 'fr/' },
  { code: 'es', name: 'Español', locale: 'es_ES', dir: 'es/' },
  { code: 'de', name: 'Deutsch', locale: 'de_DE', dir: 'de/' },
  { code: 'it', name: 'Italiano', locale: 'it_IT', dir: 'it/' },
  { code: 'pt', name: 'Português', locale: 'pt_BR', dir: 'pt/' }
]
/** Languages with their own mods gallery (/mods/ in English, /fr/mods/ in French). */
const GALLERIES = new Set(['en', 'fr'])
/** Text nodes that are never translated (names, symbols). */
const KEEP = new Set(['Zak', 'Claude', 'ChatGPT', 'MCP', ' MCP ', ' Zak', 'MCP Zak', 'GitHub', 'GitHub ', 'Zak + ', 'ZAK + ', '⌘ L', '⌘ K', '⌘ T ', '⌘ K ', '×', '6 sites', '8 sites', '4 sites', 'Messages', 'Inspirations', '✨ &nbsp; Inspirations', 'Open source', 'open source', 'Mods'])

const template = readFileSync(join(HERE, 'page.html'), 'utf8')

/** Every text node and translatable attribute of the template. */
export function texts() {
  const text = new Set()
  for (const m of template.matchAll(/>([^<>]*\p{L}[^<>]*)</gu)) if (!KEEP.has(m[1])) text.add(m[1])
  const attr = new Set()
  for (const m of template.matchAll(/\b(?:aria-label|title|alt|content)="([^"]*\p{L}[^"]*)"/gu)) {
    if (!/^(https?:|width=|summary_|website$|Zak$|#)/.test(m[1])) attr.add(m[1])
  }
  return { text: [...text], attr: [...attr] }
}

const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

export function build() {
  const pages = new Map()
  for (const lang of LANGUAGES) {
    const dict = lang.code === 'fr' ? { text: {}, attr: {}, js: {} } : JSON.parse(readFileSync(join(HERE, 'i18n', `${lang.code}.json`), 'utf8'))
    let html = template
    const missing = []
    if (lang.code !== 'fr') {
      const all = texts()
      for (const fr of all.text) if (!(fr in dict.text)) missing.push(`text: ${fr}`)
      for (const fr of all.attr) if (!(fr in dict.attr)) missing.push(`attr: ${fr}`)
    }
    // Longest first, so that a text is never replaced inside a longer one.
    for (const [fr, tr] of Object.entries(dict.text).sort((a, b) => b[0].length - a[0].length)) html = html.split(`>${fr}<`).join(`>${tr}<`)
    for (const [fr, tr] of Object.entries(dict.attr)) html = html.split(`="${fr}"`).join(`="${tr}"`)

    const up = lang.dir ? '../' : ''
    for (const file of ['assets/', 'styles.css', 'theme-beige.css', 'motion.css', 'config.js', 'app.js', 'motion.js']) {
      html = html.split(`src="${file}`).join(`src="${up}${file}`).split(`href="${file}`).join(`href="${up}${file}`)
    }
    if (!GALLERIES.has(lang.code)) html = html.split('href="mods/"').join(`href="${up}mods/"`)

    const url = `${ORIGIN}/${lang.dir}`
    const head = [
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:locale" content="${lang.locale}">`,
      `<link rel="canonical" href="${url}">`,
      ...LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${ORIGIN}/${l.dir}">`),
      `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`,
      Object.keys(dict.js).length ? `<script>window.ZAK_I18N = ${escapeJson(dict.js)};</script>` : '',
      // The main page sends visitors to their browser's language, unless they picked one in the menu.
      lang.code === 'en' ? `<script>${redirect()}</script>` : ''
    ].filter(Boolean)
    html = html.replace('<!--zak:head-->', head.join('\n  '))
    html = html.replace('{{lang}}', lang.code)

    const label = dict.attr.Langue ?? 'Langue'
    const options = LANGUAGES.map(
      (l) => `<option value="${l.code}" data-href="${up}${l.dir || './'}"${l.code === lang.code ? ' selected' : ''} lang="${l.code}">${l.name}</option>`
    ).join('')
    html = html.replace(
      '<!--zak:languages-->',
      `<label class="language-select"><span class="sr-only">${label}</span><svg class="icon" aria-hidden="true"><use href="#i-globe"/></svg><select data-language aria-label="${label}">${options}</select></label>`
    )
    pages.set(`${lang.dir}index.html`, { html, missing })
  }
  return pages
}

function redirect() {
  const others = LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code)
  return (
    `(function(){var L=${JSON.stringify(others)},p;try{p=localStorage.getItem('zak-lang')}catch(e){}` +
    `if(!p){var w=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''];` +
    `for(var i=0;i<w.length;i++){var c=String(w[i]).slice(0,2).toLowerCase();if(c==='en'||L.indexOf(c)>=0){p=c;break}}}` +
    `if(L.indexOf(p)>=0)location.replace('/'+p+'/'+location.hash)})()`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  let failed = false
  for (const [path, { html, missing }] of build()) {
    if (missing.length) { failed = true; console.error(`${path}: not translated\n  ${missing.join('\n  ')}`) }
    const target = join(SITE, path)
    if (check) {
      let current = ''
      try { current = readFileSync(target, 'utf8') } catch {}
      if (current !== html) { failed = true; console.error(`${path}: out of date (npm run site:build)`) }
    } else {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, html)
    }
  }
  if (failed) process.exit(1)
  console.log(check ? 'Site pages up to date.' : `Built ${LANGUAGES.length} pages.`)
}
