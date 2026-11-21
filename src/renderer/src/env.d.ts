/// <reference types="vite/client" />
/// <reference path="../../preload/index.d.ts" />
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

/** State of the extension actions, from electron-chrome-extensions (browserAction.getState). */
interface BrowserActionState {
  activeTabId?: number
  actions: { id: string; title?: string }[]
}

declare global {
  interface Window {
    /** Exposed by injectBrowserAction (electron-chrome-extensions) in the chrome preload. */
    browserAction?: {
      getState(partition: string): Promise<BrowserActionState>
      addEventListener(name: 'update', listener: (state: BrowserActionState) => void): void
      removeEventListener(name: 'update', listener: (state: BrowserActionState) => void): void
      addObserver(partition: string): void
      removeObserver(partition: string): void
    }
  }
}

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      /** Provided by electron-chrome-extensions (injectBrowserAction in the preload). */
      'browser-action-list': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        partition?: string
        alignment?: string
      }
    }
  }
}
