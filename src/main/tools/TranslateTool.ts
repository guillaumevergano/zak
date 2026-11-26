import { getLang, t } from '@shared/i18n'
import { session, type MenuItemConstructorOptions, type Session, type WebContents } from 'electron'
import type { OverlayRequest } from '@shared/types'
import { languageMenu, languageName, readingTarget, withRecent } from '@shared/tools'
import { chromeUserAgent } from '../userAgent'
import type { SettingsStore } from '../store/settings'
import type { BrowserWindowHandle } from '../windows/WindowManager'
import { translateText, TRANSLATE_ENDPOINT, type Translation } from './translator'

const BUBBLE_WIDTH = 380
const BUBBLE_HEIGHT = 140

type TranslationRequest = Extract<OverlayRequest, { kind: 'translation' }>

/**
 * « Traduction » (CLAUDE.md §6.8): right-click on a selection. In a field one writes in, « Traduire
 * en › » replaces the selection by its translation (⌘Z undoes it); elsewhere « Traduire en … » shows
 * it in a bubble under the selection. Text leaves only on that click, without cookies.
 */
export class TranslateTool {
  private ses: Session | null = null
  /** The bubble shown per window, and what closes it (the page gets the focus, scrolls, navigates). */
  private bubbles = new Map<BrowserWindowHandle, { request: TranslationRequest; dispose: () => void }>()

  constructor(private readonly settings: SettingsStore) {}

  enabled(): boolean {
    return this.settings.getTools().translate.enabled
  }

  translate(text: string, target: string): Promise<Translation> {
    // E2E tests answer from a local server.
    const endpoint = process.env['ZAK_E2E'] === '1' && process.env['ZAK_TRANSLATE_URL'] ? process.env['ZAK_TRANSLATE_URL'] : TRANSLATE_ENDPOINT
    const ses = (this.ses ??= session.fromPartition('zak-tools'))
    return translateText(text, target, (url, init) => ses.fetch(url, { ...init, headers: { ...init.headers, 'User-Agent': chromeUserAgent() } }), endpoint)
  }

  /** From the bubble: the language picked there becomes the one texts are read in. */
  translateForReader(text: string, target: string): Promise<Translation> {
    const tools = this.settings.getTools()
    this.settings.setTools({ ...tools, translate: { ...tools.translate, target: target === getLang() ? '' : target } })
    return this.translate(text, target)
  }

  /** The page menu's entries for this selection (none when the tool is off or nothing is selected). */
  menuItems(handle: BrowserWindowHandle, wc: WebContents, params: Electron.ContextMenuParams): MenuItemConstructorOptions[] {
    const text = params.selectionText
    if (!this.enabled() || !text.trim()) return []
    const lang = getLang()
    const { translate } = this.settings.getTools()
    if (params.isEditable) {
      const { recent, others } = languageMenu(translate.recent, lang)
      const item = (code: string): MenuItemConstructorOptions => ({
        label: languageName(code, lang),
        click: () => void this.replaceSelection(handle, wc, params, text, code)
      })
      return [
        {
          label: t('Traduire en'),
          submenu: [...recent.map(item), ...(recent.length > 0 ? [{ type: 'separator' as const }] : []), ...others.map(item)]
        }
      ]
    }
    const target = readingTarget(translate, lang)
    return [
      {
        label: t('Traduire en {language}', { language: languageName(target, lang, false) }),
        click: () => this.openBubble(handle, wc, params, text, target)
      }
    ]
  }

  private async replaceSelection(
    handle: BrowserWindowHandle,
    wc: WebContents,
    params: Electron.ContextMenuParams,
    text: string,
    target: string
  ): Promise<void> {
    const tools = this.settings.getTools()
    this.settings.setTools({ ...tools, translate: { ...tools.translate, recent: withRecent(tools.translate.recent, target) } })
    try {
      const result = await this.translate(text, target)
      // Typed like a paste into the selection still there: the page sees its input events, ⌘Z undoes it.
      if (!wc.isDestroyed()) wc.insertText(result.text)
    } catch {
      if (!wc.isDestroyed()) this.openBubble(handle, wc, params, text, target, true)
    }
  }

  private openBubble(
    handle: BrowserWindowHandle,
    wc: WebContents,
    params: Electron.ContextMenuParams,
    text: string,
    target: string,
    error = false
  ): void {
    const page = handle.tabs.pageBounds(wc.id)
    if (!page || handle.window.isDestroyed()) return
    const width = Math.min(BUBBLE_WIDTH, page.width - 16)
    const x = Math.round(Math.min(Math.max(page.x + params.x - 24, page.x + 8), page.x + page.width - width - 8))
    const y = Math.round(page.y + params.y + 14)
    const request: TranslationRequest = { kind: 'translation', frame: { x, y, width, height: BUBBLE_HEIGHT }, tabId: wc.id, text, target, error }
    this.closeBubble(handle)

    const hide = (): void => {
      if (handle.overlay.showing() === request) handle.overlay.hide()
      this.closeBubble(handle)
    }
    let scrollTop: number | null = null
    const onScroll = (tabId: number, scroll: { top: number } | null): void => {
      if (tabId !== wc.id) return
      if (scrollTop === null && scroll) scrollTop = scroll.top
      else if (!scroll || Math.abs(scroll.top - scrollTop!) > 4) hide()
    }
    const onNavigate = (details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>): void => {
      if (details.isMainFrame && !details.isSameDocument) hide()
    }
    // The menu gives the focus back to the page as it closes: only a later click in the page counts.
    const armed = setTimeout(() => wc.on('focus', hide), 400)
    handle.tabs.on('scroll', onScroll)
    wc.on('did-start-navigation', onNavigate)
    this.bubbles.set(handle, {
      request,
      dispose: () => {
        clearTimeout(armed)
        handle.tabs.off('scroll', onScroll)
        if (!wc.isDestroyed()) {
          wc.off('focus', hide)
          wc.off('did-start-navigation', onNavigate)
        }
      }
    })
    void handle.overlay.open(request)
  }

  /** The bubble went away (closed, replaced, its tab left): stop watching its page. */
  closeBubble(handle: BrowserWindowHandle): void {
    this.bubbles.get(handle)?.dispose()
    this.bubbles.delete(handle)
  }
}
