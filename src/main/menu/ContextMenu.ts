import { clipboard, Menu, MenuItem, type WebContents } from 'electron'
import { reloadPage, TabManager } from '../tabs/TabManager'
import type { TabId } from '@shared/types'
import { SEARCH_ENGINES, searchUrl, translateUrl } from '@shared/url'

/**
 * Right-click inside a page (CLAUDE.md §6.7). Extension entries (chrome.contextMenus) are appended
 * by `addExtensionItems`, before "Inspecter".
 */
export function buildPageMenu(
  tabs: TabManager,
  wc: WebContents,
  params: Electron.ContextMenuParams,
  hooks: {
    addExtensionItems: (menu: Menu) => void
    addLinkToFavorites: ((url: string, title: string) => void) | null
    /** Null in a private window (its links already open privately). */
    openInPrivateWindow: ((url: string) => void) | null
  }
): Menu {
  const menu = new Menu()
  const add = (options: Electron.MenuItemConstructorOptions): void => menu.append(new MenuItem(options))
  const separator = (): void => {
    if (menu.items.length > 0 && menu.items[menu.items.length - 1]!.type !== 'separator') add({ type: 'separator' })
  }
  const openerIndex = tabs.indexOf(wc.id) + 1

  if (params.linkURL) {
    add({ label: 'Ouvrir le lien dans un nouvel onglet', click: () => tabs.create(params.linkURL, { active: false, index: openerIndex }) })
    const openPrivate = hooks.openInPrivateWindow
    if (openPrivate) {
      add({ label: 'Ouvrir le lien dans une fenêtre de navigation privée', click: () => openPrivate(params.linkURL) })
    }
    add({ label: "Copier l'adresse du lien", click: () => clipboard.writeText(params.linkURL) })
    const addLink = hooks.addLinkToFavorites
    if (addLink && /^https?:/.test(params.linkURL)) {
      add({
        label: 'Ajouter aux favoris de la sidebar',
        click: () => addLink(params.linkURL, params.linkText.trim() || params.linkURL)
      })
    }
    separator()
  }

  if (params.mediaType === 'image' && params.srcURL) {
    add({ label: "Ouvrir l'image dans un nouvel onglet", click: () => tabs.create(params.srcURL, { active: false, index: openerIndex }) })
    add({ label: "Enregistrer l'image sous…", click: () => wc.downloadURL(params.srcURL) })
    add({ label: "Copier l'image", click: () => wc.copyImageAt(params.x, params.y) })
    add({ label: "Copier l'adresse de l'image", click: () => clipboard.writeText(params.srcURL) })
    separator()
  }

  // Spelling (Chromium's checker: the system's on macOS and Windows): suggestions first, like Chrome.
  if (params.isEditable && params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, 5)
    for (const word of suggestions) add({ label: word, click: () => wc.replaceMisspelling(word) })
    if (suggestions.length === 0) add({ label: 'Aucune suggestion', enabled: false })
    add({
      label: 'Ajouter au dictionnaire',
      click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
    })
    separator()
  }

  if (params.isEditable) {
    const flags = params.editFlags
    add({ label: 'Annuler', role: 'undo', enabled: flags.canUndo })
    add({ label: 'Rétablir', role: 'redo', enabled: flags.canRedo })
    separator()
    add({ label: 'Couper', role: 'cut', enabled: flags.canCut })
    add({ label: 'Copier', role: 'copy', enabled: flags.canCopy })
    add({ label: 'Coller', role: 'paste', enabled: flags.canPaste })
    add({ label: 'Tout sélectionner', role: 'selectAll', enabled: flags.canSelectAll })
    separator()
  } else if (params.selectionText.trim()) {
    const text = params.selectionText.trim()
    const short = text.length > 24 ? `${text.slice(0, 24)}…` : text
    add({ label: 'Copier', role: 'copy' })
    add({
      label: `Rechercher « ${short} » sur ${SEARCH_ENGINES[TabManager.searchEngine()].label}`,
      click: () => tabs.create(searchUrl(text, TabManager.searchEngine()), { index: openerIndex })
    })
    separator()
  }

  if (!params.linkURL && params.mediaType === 'none' && !params.isEditable && !params.selectionText.trim()) {
    add({ label: 'Retour', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() })
    add({ label: 'Avancer', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() })
    add({ label: 'Recharger', click: () => reloadPage(wc) })
    separator()
    const pageUrl = wc.getURL()
    if (/^https?:/.test(pageUrl)) {
      add({ label: 'Traduire en français', click: () => tabs.create(translateUrl(pageUrl), { index: openerIndex }) })
      add({ label: 'Imprimer…', click: () => wc.print() })
      separator()
    }
  }

  hooks.addExtensionItems(menu)
  separator()
  add({ label: 'Inspecter', click: () => wc.inspectElement(params.x, params.y) })
  return menu
}

/** Right-click on a tab in the strip. */
export function buildTabMenu(tabs: TabManager, id: TabId): Menu {
  const wc = tabs.get(id)
  const pinned = tabs.isPinned(id)
  const muted = wc?.isAudioMuted() ?? false
  return Menu.buildFromTemplate([
    { label: 'Nouvel onglet à droite', click: () => tabs.create(undefined, { index: tabs.indexOf(id) + 1 }) },
    { type: 'separator' },
    { label: 'Recharger', click: () => wc && reloadPage(wc) },
    { label: 'Dupliquer', click: () => tabs.duplicate(id) },
    { label: pinned ? 'Détacher' : 'Épingler', click: () => tabs.setPinned(id, !pinned) },
    { label: muted ? 'Réactiver le son du site' : 'Couper le son du site', click: () => tabs.toggleMute(id) },
    { type: 'separator' },
    { label: "Fermer l'onglet", click: () => tabs.close(id) },
    { label: 'Fermer les autres onglets', enabled: tabs.count() > 1, click: () => tabs.closeOthers(id) },
    {
      label: 'Fermer les onglets à droite',
      enabled: tabs.indexOf(id) < tabs.count() - 1,
      click: () => tabs.closeToTheRight(id)
    }
  ])
}
