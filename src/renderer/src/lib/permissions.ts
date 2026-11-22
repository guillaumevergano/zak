import type { PermissionKind } from '@shared/types'
import { t } from '@shared/i18n'

/** How each permission is named in prompts and on zak://settings. */
export function permissionLabel(kind: PermissionKind): string {
  switch (kind) {
    case 'notifications':
      return t('Notifications')
    case 'camera':
      return t('Caméra')
    case 'microphone':
      return t('Micro')
    case 'geolocation':
      return t('Position')
    case 'clipboard':
      return t('Presse-papiers')
  }
}

/** "<site> veut …" in the prompt under the omnibox; `{host}` is the site. */
export function permissionQuestion(kind: PermissionKind): string {
  switch (kind) {
    case 'notifications':
      return t('{host} veut vous envoyer des notifications.')
    case 'camera':
      return t('{host} veut utiliser votre caméra (et éventuellement votre micro).')
    case 'microphone':
      return t('{host} veut utiliser votre micro.')
    case 'geolocation':
      return t('{host} veut connaître votre position.')
    case 'clipboard':
      return t('{host} veut lire le presse-papiers.')
  }
}
