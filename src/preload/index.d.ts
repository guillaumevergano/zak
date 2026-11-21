import type { ZakApi } from '@shared/ipc'

declare global {
  interface Window {
    zak: ZakApi
  }
}

export {}
