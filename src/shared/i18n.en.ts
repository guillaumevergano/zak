import { EN_MAIN } from './i18n/en-main'
import { EN_UI } from './i18n/en-ui'
import { EN_WELCOME } from './i18n/en-welcome'

/**
 * English for every French text of the interface (see i18n.ts). Keys are the exact French
 * strings passed to t(); keep them in sync when a French text changes. Split by process: the
 * main process (menus, dialogs, context menus) and the pages (chrome UI, overlay, internal pages).
 */
export const EN: Record<string, string> = { ...EN_MAIN, ...EN_UI, ...EN_WELCOME }
