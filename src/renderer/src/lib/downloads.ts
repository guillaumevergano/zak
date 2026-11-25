import type { DownloadInfo } from '@shared/types'
import { t } from '@shared/i18n'
import { formatBytes } from './format'

export const isActive = (d: DownloadInfo): boolean => d.state === 'progressing' || d.state === 'paused'

/** The line under a download's name, in the toolbar panel and on zak://downloads. */
export function downloadStatus(d: DownloadInfo): string {
  const size =
    d.totalBytes > 0
      ? t('{received} sur {total}', { received: formatBytes(d.receivedBytes), total: formatBytes(d.totalBytes) })
      : formatBytes(d.receivedBytes)
  switch (d.state) {
    case 'progressing':
      return size
    case 'paused':
      return t('En pause — {size}', { size })
    case 'completed':
      return d.exists === false ? t('Fichier supprimé') : formatBytes(d.totalBytes || d.receivedBytes)
    case 'cancelled':
      return t('Annulé')
    case 'interrupted':
      return t('Échec du téléchargement')
    case 'blocked':
      return t("Bloqué : ce fichier vient d'une adresse connue pour diffuser des logiciels malveillants")
  }
}
