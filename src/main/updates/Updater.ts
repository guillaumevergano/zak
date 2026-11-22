import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

const CHECK_EVERY_MS = 6 * 3_600_000

/**
 * Updates through GitHub Releases (CLAUDE.md §6.7, electron-updater). Only in a packaged build
 * published with a `publish` config (electron-builder writes `app-update.yml`); otherwise the menu
 * item explains why there is nothing to check. Updates are downloaded in the background, then a
 * restart is offered. Each release must be VMP-signed like any build (docs/RELEASE.md).
 */
export class Updater {
  private readonly enabled = app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
  private offered = false

  constructor() {
    if (!this.enabled) return
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = console
    autoUpdater.on('update-downloaded', (info) => void this.offerRestart(info.version))
    autoUpdater.on('error', (err) => console.warn('[updates]', err.message))
    setTimeout(() => void this.check(), 15_000)
    setInterval(() => void this.check(), CHECK_EVERY_MS)
  }

  /** « Rechercher les mises à jour… » in the app menu. */
  async checkFromMenu(): Promise<void> {
    if (!this.enabled) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Mises à jour automatiques indisponibles',
        detail: app.isPackaged
          ? "Cette version n'a pas été publiée sur GitHub Releases (voir docs/RELEASE.md)."
          : 'Les mises à jour ne concernent que l’application installée, pas le mode développement.'
      })
      return
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      const latest = result?.updateInfo.version
      if (!latest || latest === app.getVersion()) {
        await dialog.showMessageBox({ type: 'info', message: 'Zak est à jour', detail: `Version ${app.getVersion()}.` })
      } else {
        await dialog.showMessageBox({
          type: 'info',
          message: `La version ${latest} se télécharge`,
          detail: 'Vous pourrez redémarrer Zak une fois le téléchargement terminé.'
        })
      }
    } catch (err) {
      await dialog.showMessageBox({ type: 'error', message: 'Impossible de vérifier les mises à jour', detail: String(err) })
    }
  }

  private async check(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // Offline, rate limit…: try again later.
    }
  }

  private async offerRestart(version: string): Promise<void> {
    if (this.offered) return
    this.offered = true
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      message: `Zak ${version} est prêt`,
      detail: 'Redémarrez pour l’installer. Sinon, elle s’installera à la prochaine fermeture.'
    })
    if (response === 0) autoUpdater.quitAndInstall()
  }
}
