/** What is playing in a window, for its sidebar's controls (CLAUDE.md §6.2). */
export interface MediaState {
  tabId: number
  /** The track's title (Media Session), else the tab's title. */
  title: string
  /** The artist (Media Session), else the site. */
  subtitle: string
  /** Cover art (https or data: only), else the tab's icon; null when neither. */
  artwork: string | null
  playing: boolean
  /** The site declares previous / next (like for the keyboard's media keys). */
  canPrevious: boolean
  canNext: boolean
  /** The player's volume, 0–1; null when it can't be set (no media element found). */
  volume: number | null
  /** The tab's sound is cut. */
  muted: boolean
}

export type MediaAction = 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'mute' | 'unmute' | 'show'
