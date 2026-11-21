import type { PermissionKind } from '@shared/types'

/** How each permission is named in prompts and on zak://settings. */
export const PERMISSION_LABELS: Record<PermissionKind, string> = {
  notifications: 'Notifications',
  camera: 'Caméra',
  microphone: 'Micro',
  geolocation: 'Position',
  clipboard: 'Presse-papiers'
}

/** "<site> veut …" in the prompt under the omnibox. */
export const PERMISSION_QUESTIONS: Record<PermissionKind, string> = {
  notifications: 'vous envoyer des notifications',
  camera: 'utiliser votre caméra',
  microphone: 'utiliser votre micro',
  geolocation: 'connaître votre position',
  clipboard: 'lire le presse-papiers'
}
