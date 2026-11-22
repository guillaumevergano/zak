import { bugReportUrl, HELP_URLS } from '../support/report'
import { t } from '@shared/i18n'
import type { ProfileInfo } from '@shared/types'
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
  profiles: { list: () => ProfileInfo[]; current: string; open: (id: string) => void; manage: () => void }
}

/** Builds the application menu; called again when the list of profiles changes. */
export function installAppMenu(windows: WindowManager, { find, zoom, session, updater, profiles }: MenuCommands): void {
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
    label: i === 8 ? t('Dernier onglet') : t('Onglet {n}', { n: i + 1 }),
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: onWindow((h) => h.tabs.activateNumber(i + 1))
  }))

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: t('À propos de {app}', { app: app.name }) },
              { label: t('Rechercher les mises à jour…'), click: () => void updater.checkFromMenu() },
              { type: 'separator' },
              { label: t('Réglages…'), accelerator: 'Cmd+,', click: openSettings },
              { type: 'separator' },
              { role: 'services', label: t('Services') },
              { type: 'separator' },
              { role: 'hide', label: t('Masquer {app}', { app: app.name }) },
              { role: 'hideOthers', label: t('Masquer les autres') },
              { role: 'unhide', label: t('Tout afficher') },
              { type: 'separator' },
              { role: 'quit', label: t('Quitter {app}', { app: app.name }) }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: t('Fichier'),
      submenu: [
        {
          label: t('Nouvel onglet'),
          accelerator: 'CmdOrCtrl+T',
          click: () => windows.newTab(windows.focusedOrFirst())
        },
        { label: t('Nouvelle fenêtre'), accelerator: 'CmdOrCtrl+N', click: () => windows.create() },
        {
          label: t('Profils'),
          submenu: [
            ...profiles.list().map(
              (p): MenuItemConstructorOptions => ({
                label: `${p.emoji} ${p.name}`,
                type: 'checkbox',
                checked: p.id === profiles.current,
                click: () => profiles.open(p.id)
              })
            ),
            { type: 'separator' },
            { label: t('Gérer les profils…'), click: profiles.manage }
          ]
        },
        {
          label: t('Nouvelle fenêtre de navigation privée'),
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => windows.create([], { private: true })
        },
        {
          id: 'reopen-tab',
          label: t("Rouvrir l'onglet fermé"),
          accelerator: 'CmdOrCtrl+Shift+T',
          click: onWindow((h) => h.tabs.reopenClosed())
        },
        { label: t('Ouvrir la position…'), accelerator: 'CmdOrCtrl+L', click: onWindow((h) => windows.focusOmnibox(h)) },
        { type: 'separator' },
        {
          label: t("Fermer l'onglet"),
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
          label: t('Fermer tous les onglets'),
          accelerator: 'CmdOrCtrl+Shift+W',
          click: onWindow((h) => h.tabs.closeAllButActive())
        },
        { type: 'separator' },
        ...(isMac ? [] : ([{ label: t('Réglages'), accelerator: 'Ctrl+,', click: openSettings }] as MenuItemConstructorOptions[])),
        {
          label: t('Imprimer…'),
          accelerator: 'CmdOrCtrl+P',
          click: onActiveTab((wc) => wc.print())
        }
      ]
    },
    {
      label: t('Édition'),
      submenu: [
        { role: 'undo', label: t('Annuler') },
        { role: 'redo', label: t('Rétablir') },
        { type: 'separator' },
        { role: 'cut', label: t('Couper') },
        { role: 'copy', label: t('Copier') },
        { role: 'paste', label: t('Coller') },
        { role: 'pasteAndMatchStyle', label: t('Coller et adapter le style') },
        { role: 'selectAll', label: t('Tout sélectionner') },
        { type: 'separator' },
        { label: t('Rechercher dans la page…'), accelerator: 'CmdOrCtrl+F', click: onWindow((h) => find.open(h)) },
        { label: t('Occurrence suivante'), accelerator: 'CmdOrCtrl+G', click: onWindow((h) => find.next(h, true)) },
        { label: t('Occurrence précédente'), accelerator: 'CmdOrCtrl+Shift+G', click: onWindow((h) => find.next(h, false)) }
      ]
    },
    {
      label: t('Présentation'),
      submenu: [
        { label: t('Recharger la page'), accelerator: 'CmdOrCtrl+R', click: onActiveTab(reloadPage) },
        {
          label: t('Forcer le rechargement'),
          accelerator: 'CmdOrCtrl+Shift+R',
          click: onActiveTab((wc) => wc.reloadIgnoringCache())
        },
        { type: 'separator' },
        {
          id: 'toggle-sidebar',
          label: t('Afficher / réduire la barre latérale'),
          accelerator: 'CmdOrCtrl+B',
          click: onWindow((h) => windows.send(h, 'sidebar:toggle', null))
        },
        { type: 'separator' },
        { label: t('Taille réelle'), accelerator: 'CmdOrCtrl+0', click: onActiveTab((wc) => zoom.change(wc, 0)) },
        { label: t('Zoom avant'), accelerator: 'CmdOrCtrl+Plus', click: onActiveTab((wc) => zoom.change(wc, 1)) },
        // Cmd/Ctrl+= too (no Shift needed on most layouts), hidden like in Chrome.
        { label: t('Zoom avant '), accelerator: 'CmdOrCtrl+=', visible: false, click: onActiveTab((wc) => zoom.change(wc, 1)) },
        { label: t('Zoom arrière'), accelerator: 'CmdOrCtrl+-', click: onActiveTab((wc) => zoom.change(wc, -1)) },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('Plein écran') },
        { type: 'separator' },
        {
          label: t('Outils de développement'),
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: onActiveTab((wc) => wc.toggleDevTools())
        },
        { label: t('Outils de développement '), accelerator: 'F12', visible: false, click: onActiveTab((wc) => wc.toggleDevTools()) }
      ]
    },
    {
      label: t('Navigation'),
      submenu: [
        {
          label: t('Précédente'),
          accelerator: 'CmdOrCtrl+[',
          click: onActiveTab((wc) => wc.navigationHistory.goBack())
        },
        {
          label: t('Suivante'),
          accelerator: 'CmdOrCtrl+]',
          click: onActiveTab((wc) => wc.navigationHistory.goForward())
        }
      ]
    },
    {
      label: t('Historique'),
      submenu: [
        {
          label: t("Afficher tout l'historique"),
          accelerator: 'CmdOrCtrl+Y',
          click: () => void windows.focusedNormal().tabs.create(HISTORY_PAGE_URL)
        },
        { type: 'separator' },
        { label: t('Rouvrir la fenêtre fermée'), accelerator: 'CmdOrCtrl+Alt+Shift+T', click: () => session.reopenClosedWindow() },
        { label: t('Reprendre la session précédente'), click: () => session.reopenPrevious() }
      ]
    },
    {
      label: t('Onglets'),
      submenu: [
        {
          label: t('Onglet suivant'),
          accelerator: 'Ctrl+Tab',
          registerAccelerator: false,
          click: onWindow((h) => h.tabs.activateRelative(1))
        },
        {
          label: t('Onglet précédent'),
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
      label: t('Fenêtre'),
      submenu: [
        { role: 'minimize', label: t('Réduire') },
        { role: 'zoom', label: t('Agrandir') },
        { type: 'separator' },
        { label: t('Extensions'), click: () => windows.focusedNormal().tabs.create(EXTENSIONS_PAGE_URL) },
        { label: t('Mots de passe'), click: () => windows.focusedNormal().tabs.create(PASSWORDS_PAGE_URL) },
        { type: 'separator' },
        ...(isMac
          ? ([{ role: 'front', label: t('Tout ramener au premier plan') }] as MenuItemConstructorOptions[])
          : ([{ label: t('Rechercher les mises à jour…'), click: () => void updater.checkFromMenu() }] as MenuItemConstructorOptions[]))
      ]
    },
    {
      role: 'help',
      label: t('Aide'),
      submenu: [
        { label: t('Site de Zak'), click: () => windows.focusedNormal().tabs.create(HELP_URLS.site) },
        { label: t('Signaler un problème…'), click: () => windows.focusedNormal().tabs.create(bugReportUrl()) },
        { label: t('Confidentialité'), click: () => windows.focusedNormal().tabs.create(HELP_URLS.privacy) }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
