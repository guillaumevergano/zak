import { BrowserWindow } from 'electron'
import { present } from './quietMode'
import { getLang, t } from '@shared/i18n'

const html = (): string => `<!doctype html><html lang="${getLang()}"><meta charset="utf-8"><title>Zak</title>
<style>
  html,body{margin:0;height:100%;background:#2e1f2d;color:#f3ebf1;font:15px -apple-system,system-ui,sans-serif;-webkit-user-select:none;-webkit-app-region:drag}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
  .ring{width:28px;height:28px;border-radius:50%;border:3px solid rgba(255,0,130,.2);border-top-color:#ff0082;animation:s 0.9s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  small{color:#a8929f;font-size:12.5px}
</style>
<div class="ring"></div><div>${t('Préparation du lecteur vidéo…')}</div><small>${t('Premier lancement : téléchargement du module Widevine')}</small></html>`

/**
 * « Préparation du lecteur vidéo… » (CLAUDE.md §6.6): shown while castLabs downloads and
 * registers the Widevine CDM (first launch, or after an update), which can take a few seconds.
 * No preload, sandboxed, static content.
 */
export function showSplash(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 200,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    backgroundColor: '#2E1F2D',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.once('ready-to-show', () => present(win))
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html())}`)
  return win
}
