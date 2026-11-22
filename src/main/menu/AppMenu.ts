import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { EXTENSIONS_PAGE_URL, HISTORY_PAGE_URL, PASSWORDS_PAGE_URL, SETTINGS_PAGE_URL } from '@shared/ipc'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'
import type { FindController } from '../find/FindController'
import type { ZoomController } from '../tabs/zoom'
import type { SessionRestore } from '../sessions/SessionRestore'
import type { Updater } from '../updates/Updater'
import { reloadPage } from '../tabs/TabManager'

/**
 * Application menu. Its accelerators are the browser shortcuts (CLAUDE.md §6.1): they work whether
 * the focus is in the chrome UI or in a page. Ctrl+Tab is handled in Shortcuts.ts (menu accelerators
 * don't receive it reliably), so it is only displayed here.
 */
export interface MenuCommands {
  find: FindController
  zoom: ZoomController
  session: SessionRestore
  updater: Updater
}

export function installAppMenu(windows: WindowManager, { find, zoom, session, updater }: MenuCommands): void {
  const isMac = process.platform === 'darwin'

  /** Runs on the focused browser window; ignored when none (e.g. a DevTools window is focused). */
  const onWindow =
    (fn: (handle: BrowserWindowHandle) => void): (() => void) =>
    () => {
      const handle = windows.focused()
      if (handle) fn(handle)
    }
  const onActiveTab = (fn: (wc: Electron.WebContents) => void): (() => void) =>
    onWindow((handle) => {
      const wc = handle.tabs.getActive()
      if (wc) fn(wc)
    })

  const openSettings = (): void => void windows.focusedNormal().tabs.create(SETTINGS_PAGE_URL)

  const tabNumbers: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: i === 8 ? 'Dernier onglet' : `Onglet ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: onWindow((h) => h.tabs.activateNumber(i + 1))
  }))

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: `À propos de ${app.name}` },
              { label: 'Rechercher les mises à jour…', click: () => void updater.checkFromMenu() },
              { type: 'separator' },
              { label: 'Réglages…', accelerator: 'Cmd+,', click: openSettings },
              { type: 'separator' },
              { role: 'services', label: 'Services' },
              { type: 'separator' },
              { role: 'hide', label: `Masquer ${app.name}` },
              { role: 'hideOthers', label: 'Masquer les autres' },
              { role: 'unhide', label: 'Tout afficher' },
              { type: 'separator' },
              { role: 'quit', label: `Quitter ${app.name}` }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouvel onglet',
          accelerator: 'CmdOrCtrl+T',
          click: () => windows.newTab(windows.focusedOrFirst())
        },
        { label: 'Nouvelle fenêtre', accelerator: 'CmdOrCtrl+N', click: () => windows.create() },
        {
          label: 'Nouvelle fenêtre de navigation privée',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => windows.create([], { private: true })
        },
        {
          id: 'reopen-tab',
          label: "Rouvrir l'onglet fermé",
          accelerator: 'CmdOrCtrl+Shift+T',
          click: onWindow((h) => h.tabs.reopenClosed())
        },
        { label: 'Ouvrir la position…', accelerator: 'CmdOrCtrl+L', click: onWindow((h) => windows.focusOmnibox(h)) },
        { type: 'separator' },
        {
          label: "Fermer l'onglet",
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const handle = windows.focused()
            const id = handle?.tabs.getActiveId()
            if (handle && id != null) handle.tabs.close(id)
            // Other windows (extension popups, DevTools): Cmd+W closes them like on any app.
            else if (!handle) BrowserWindow.getFocusedWindow()?.close()
          }
        },
        {
          id: 'close-all-tabs',
          label: 'Fermer tous les onglets',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: onWindow((h) => h.tabs.closeAllButActive())
        },
        { type: 'separator' },
        ...(isMac ? [] : ([{ label: 'Réglages', accelerator: 'Ctrl+,', click: openSettings }] as MenuItemConstructorOptions[])),
        {
          label: 'Imprimer…',
          accelerator: 'CmdOrCtrl+P',
          click: onActiveTab((wc) => wc.print())
        }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'pasteAndMatchStyle', label: 'Coller et adapter le style' },
        { role: 'selectAll', label: 'Tout sélectionner' },
        { type: 'separator' },
        { label: 'Rechercher dans la page…', accelerator: 'CmdOrCtrl+F', click: onWindow((h) => find.open(h)) },
        { label: 'Occurrence suivante', accelerator: 'CmdOrCtrl+G', click: onWindow((h) => find.next(h, true)) },
        { label: 'Occurrence précédente', accelerator: 'CmdOrCtrl+Shift+G', click: onWindow((h) => find.next(h, false)) }
      ]
    },
    {
      label: 'Présentation',
      submenu: [
        { label: 'Recharger la page', accelerator: 'CmdOrCtrl+R', click: onActiveTab(reloadPage) },
        {
          label: 'Forcer le rechargement',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: onActiveTab((wc) => wc.reloadIgnoringCache())
        },
        { type: 'separator' },
        {
          id: 'toggle-sidebar',
          label: 'Afficher / réduire la barre latérale',
          accelerator: 'CmdOrCtrl+B',
          click: onWindow((h) => windows.send(h, 'sidebar:toggle', null))
        },
        { type: 'separator' },
        { label: 'Taille réelle', accelerator: 'CmdOrCtrl+0', click: onActiveTab((wc) => zoom.change(wc, 0)) },
        { label: 'Zoom avant', accelerator: 'CmdOrCtrl+Plus', click: onActiveTab((wc) => zoom.change(wc, 1)) },
        // Cmd/Ctrl+= too (no Shift needed on most layouts), hidden like in Chrome.
        { label: 'Zoom avant ', accelerator: 'CmdOrCtrl+=', visible: false, click: onActiveTab((wc) => zoom.change(wc, 1)) },
        { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: onActiveTab((wc) => zoom.change(wc, -1)) },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        { type: 'separator' },
        {
          label: 'Outils de développement',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: onActiveTab((wc) => wc.toggleDevTools())
        },
        { label: 'Outils de développement ', accelerator: 'F12', visible: false, click: onActiveTab((wc) => wc.toggleDevTools()) }
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Précédente',
          accelerator: 'CmdOrCtrl+[',
          click: onActiveTab((wc) => wc.navigationHistory.goBack())
        },
        {
          label: 'Suivante',
          accelerator: 'CmdOrCtrl+]',
          click: onActiveTab((wc) => wc.navigationHistory.goForward())
        }
      ]
    },
    {
      label: 'Historique',
      submenu: [
        {
          label: "Afficher tout l'historique",
          accelerator: 'CmdOrCtrl+Y',
          click: () => void windows.focusedNormal().tabs.create(HISTORY_PAGE_URL)
        },
        { type: 'separator' },
        { label: 'Rouvrir la fenêtre fermée', accelerator: 'CmdOrCtrl+Alt+Shift+T', click: () => session.reopenClosedWindow() },
        { label: 'Reprendre la session précédente', click: () => session.reopenPrevious() }
      ]
    },
    {
      label: 'Onglets',
      submenu: [
        {
          label: 'Onglet suivant',
          accelerator: 'Ctrl+Tab',
          registerAccelerator: false,
          click: onWindow((h) => h.tabs.activateRelative(1))
        },
        {
          label: 'Onglet précédent',
          accelerator: 'Ctrl+Shift+Tab',
          registerAccelerator: false,
          click: onWindow((h) => h.tabs.activateRelative(-1))
        },
        { type: 'separator' },
        ...tabNumbers
      ]
    },
    {
      // role 'window': macOS appends the list of open windows.
      role: 'window',
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'zoom', label: 'Agrandir' },
        { type: 'separator' },
        { label: 'Extensions', click: () => windows.focusedNormal().tabs.create(EXTENSIONS_PAGE_URL) },
        { label: 'Mots de passe', click: () => windows.focusedNormal().tabs.create(PASSWORDS_PAGE_URL) },
        { type: 'separator' },
        ...(isMac
          ? ([{ role: 'front', label: 'Tout ramener au premier plan' }] as MenuItemConstructorOptions[])
          : ([{ label: 'Rechercher les mises à jour…', click: () => void updater.checkFromMenu() }] as MenuItemConstructorOptions[]))
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
