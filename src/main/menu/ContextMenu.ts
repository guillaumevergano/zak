import { getLang, t } from '@shared/i18n'
import { clipboard, Menu, MenuItem, type WebContents } from 'electron'
import { reloadPage, TabManager } from '../tabs/TabManager'
import type { TabGroupColor, TabGroupInfo, TabId } from '@shared/types'
import { GROUP_COLORS } from '../tabs/groups'
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
    /** Zak's own tools for this selection (CLAUDE.md §6.8: « Traduire en… »), none when they are off. */
    toolItems: Electron.MenuItemConstructorOptions[]
    /** Translating the whole page: part of the translation tool. */
    translatePage: boolean
    /** Zak's tools for the page itself (« Capture d’écran… »), none when they are off. */
    pageItems: Electron.MenuItemConstructorOptions[]
  }
): Menu {
  const menu = new Menu()
  const add = (options: Electron.MenuItemConstructorOptions): void => menu.append(new MenuItem(options))
  const separator = (): void => {
    if (menu.items.length > 0 && menu.items[menu.items.length - 1]!.type !== 'separator') add({ type: 'separator' })
  }
  const openerIndex = tabs.indexOf(wc.id) + 1

  if (params.linkURL) {
    add({ label: t('Ouvrir le lien dans un nouvel onglet'), click: () => tabs.create(params.linkURL, { active: false, index: openerIndex }) })
    const openPrivate = hooks.openInPrivateWindow
    if (openPrivate) {
      add({ label: t('Ouvrir le lien dans une fenêtre de navigation privée'), click: () => openPrivate(params.linkURL) })
    }
    add({ label: t("Copier l'adresse du lien"), click: () => clipboard.writeText(params.linkURL) })
    const addLink = hooks.addLinkToFavorites
    if (addLink && /^https?:/.test(params.linkURL)) {
      add({
        label: t('Ajouter aux favoris de la sidebar'),
        click: () => addLink(params.linkURL, params.linkText.trim() || params.linkURL)
      })
    }
    separator()
  }

  if (params.mediaType === 'image' && params.srcURL) {
    add({ label: t("Ouvrir l'image dans un nouvel onglet"), click: () => tabs.create(params.srcURL, { active: false, index: openerIndex }) })
    add({ label: t("Enregistrer l'image sous…"), click: () => wc.downloadURL(params.srcURL) })
    add({ label: t("Copier l'image"), click: () => wc.copyImageAt(params.x, params.y) })
    add({ label: t("Copier l'adresse de l'image"), click: () => clipboard.writeText(params.srcURL) })
    separator()
  }

  // Spelling (Chromium's checker: the system's on macOS and Windows): suggestions first, like Chrome.
  if (params.isEditable && params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, 5)
    for (const word of suggestions) add({ label: word, click: () => wc.replaceMisspelling(word) })
    if (suggestions.length === 0) add({ label: t('Aucune suggestion'), enabled: false })
    add({
      label: t('Ajouter au dictionnaire'),
      click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
    })
    separator()
  }

  if (params.isEditable) {
    const flags = params.editFlags
    add({ label: t('Annuler@@undo'), role: 'undo', enabled: flags.canUndo })
    add({ label: t('Rétablir'), role: 'redo', enabled: flags.canRedo })
    separator()
    add({ label: t('Couper'), role: 'cut', enabled: flags.canCut })
    add({ label: t('Copier'), role: 'copy', enabled: flags.canCopy })
    add({ label: t('Coller'), role: 'paste', enabled: flags.canPaste })
    add({ label: t('Tout sélectionner'), role: 'selectAll', enabled: flags.canSelectAll })
    separator()
    hooks.toolItems.forEach(add)
    separator()
  } else if (params.selectionText.trim()) {
    const text = params.selectionText.trim()
    const short = text.length > 24 ? `${text.slice(0, 24)}…` : text
    add({ label: t('Copier'), role: 'copy' })
    add({
      label: t('Rechercher « {text} » sur {engine}', { text: short, engine: SEARCH_ENGINES[TabManager.searchEngine()].label }),
      click: () => tabs.create(searchUrl(text, TabManager.searchEngine()), { index: openerIndex })
    })
    hooks.toolItems.forEach(add)
    separator()
  }

  if (!params.linkURL && params.mediaType === 'none' && !params.isEditable && !params.selectionText.trim()) {
    add({ label: t('Retour'), enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() })
    add({ label: t('Avancer'), enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() })
    add({ label: t('Recharger'), click: () => reloadPage(wc) })
    separator()
    const pageUrl = wc.getURL()
    if (/^https?:/.test(pageUrl)) {
      if (hooks.translatePage) {
        add({ label: t('Traduire cette page'), click: () => tabs.create(translateUrl(pageUrl, getLang()), { index: openerIndex }) })
      }
      add({ label: t('Imprimer…'), click: () => wc.print() })
    }
    hooks.pageItems.forEach(add)
    separator()
  }

  hooks.addExtensionItems(menu)
  separator()
  add({ label: t('Inspecter'), click: () => wc.inspectElement(params.x, params.y) })
  return menu
}

/** Right-click on a tab in the strip. `newTabBeside`: a new tab in a split view with this one, omnibox focused. */
export function buildTabMenu(tabs: TabManager, id: TabId, newTabBeside: () => void): Menu {
  const wc = tabs.get(id)
  const pinned = tabs.isPinned(id)
  const muted = wc?.isAudioMuted() ?? false
  const groupId = tabs.groupOf(id)
  const others = tabs.groupList().filter((g) => g.id !== groupId)
  const groupItems: Electron.MenuItemConstructorOptions[] = pinned
    ? []
    : [
        { label: t('Ajouter l’onglet à un nouveau groupe'), click: () => tabs.addToNewGroup([id]) },
        ...(others.length > 0
          ? [
              {
                label: t('Ajouter l’onglet au groupe'),
                submenu: others.map((g) => ({ label: groupLabel(g), click: () => tabs.addToGroup(id, g.id) }))
              }
            ]
          : []),
        ...(groupId ? [{ label: t('Retirer du groupe'), click: () => tabs.removeFromGroup(id) }] : []),
        { type: 'separator' as const }
      ]
  // Split view (§6.1): also by dropping a tab on another one.
  const partner = tabs.splitPartner(id)
  const candidates = tabs.getState().tabs.filter((tab) => tab.id !== id && !tab.pinned && tabs.splitPartner(tab.id) === null)
  const splitItems: Electron.MenuItemConstructorOptions[] = pinned
    ? []
    : partner !== null
      ? [
          { label: t('Séparer les onglets'), click: () => tabs.unsplit(id) },
          { label: t('Inverser les côtés'), click: () => tabs.swapSplit(id) },
          { type: 'separator' }
        ]
      : [
          {
            label: t('Afficher côte à côte avec'),
            submenu: [
              ...candidates.map((tab) => ({ label: menuTitle(tab.title), click: () => void tabs.split(tab.id, id) })),
              ...(candidates.length > 0 ? [{ type: 'separator' as const }] : []),
              { label: t('Un nouvel onglet'), click: newTabBeside }
            ]
          },
          { type: 'separator' }
        ]
  return Menu.buildFromTemplate([
    ...splitItems,
    { label: t('Nouvel onglet à droite'), click: () => tabs.create(undefined, { index: tabs.indexOf(id) + 1 }) },
    ...groupItems,
    { type: 'separator' },
    { label: t('Recharger'), click: () => wc && reloadPage(wc) },
    { label: t('Dupliquer'), click: () => tabs.duplicate(id) },
    { label: pinned ? t('Détacher') : t('Épingler'), click: () => tabs.setPinned(id, !pinned) },
    { label: muted ? t('Réactiver le son du site') : t('Couper le son du site'), click: () => tabs.toggleMute(id) },
    { type: 'separator' },
    { label: t("Fermer l'onglet"), click: () => tabs.close(id) },
    { label: t('Fermer les autres onglets'), enabled: tabs.count() > 1, click: () => tabs.closeOthers(id) },
    {
      label: t('Fermer les onglets à droite'),
      enabled: tabs.indexOf(id) < tabs.count() - 1,
      click: () => tabs.closeToTheRight(id)
    }
  ])
}

/** A tab's title in a menu: short enough to keep the menu narrow. */
const menuTitle = (title: string): string => (title.length > 60 ? `${title.slice(0, 59)}…` : title)

/** A color's name, in the interface language. */
const colorName = (color: TabGroupColor): string =>
  ({
    grey: t('Gris'),
    blue: t('Bleu'),
    red: t('Rouge'),
    yellow: t('Jaune'),
    green: t('Vert'),
    pink: t('Rose'),
    purple: t('Violet'),
    cyan: t('Cyan'),
    orange: t('Orange')
  })[color]

const groupLabel = (g: TabGroupInfo): string => g.name || t('Groupe sans nom ({color})', { color: colorName(g.color) })

/** Right-click on a group's chip in the strip. */
export function buildGroupMenu(tabs: TabManager, groupId: string, rename: () => void): Menu {
  const group = tabs.groupList().find((g) => g.id === groupId)
  if (!group) return new Menu()
  return Menu.buildFromTemplate([
    { label: t('Renommer le groupe…'), click: rename },
    {
      label: t('Couleur'),
      submenu: GROUP_COLORS.map((color) => ({
        label: colorName(color),
        type: 'radio' as const,
        checked: group.color === color,
        click: () => tabs.updateGroup(groupId, { color })
      }))
    },
    { label: group.collapsed ? t('Déplier le groupe') : t('Replier le groupe'), click: () => tabs.updateGroup(groupId, { collapsed: !group.collapsed }) },
    { type: 'separator' },
    { label: t('Nouvel onglet dans le groupe'), click: () => tabs.addToGroup(tabs.create().id, groupId) },
    { label: t('Dissocier'), click: () => tabs.ungroup(groupId) },
    { label: t('Fermer le groupe'), click: () => tabs.closeGroup(groupId) }
  ])
}

