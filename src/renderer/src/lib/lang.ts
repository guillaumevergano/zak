import { isLang, setLang } from '@shared/i18n'

/**
 * Sets the interface language before anything renders: the chrome UI gets it from its preload,
 * internal pages (no preload) from the <html lang> main serves them with.
 */
const fromPreload = (window as { zak?: { lang?: string } }).zak?.lang
const lang = fromPreload ?? document.documentElement.lang
setLang(isLang(lang) ? lang : 'fr')
document.documentElement.lang = fromPreload ?? document.documentElement.lang
