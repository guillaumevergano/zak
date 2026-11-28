/**
 * Screen recordings (CLAUDE.md §6.8): the library on zak://recordings, and sharing them through
 * the user's own Google Drive (a link anyone can watch).
 */

/** Where a recording's upload stands. */
export interface RecordingShare {
  state: 'none' | 'uploading' | 'done' | 'error'
  /** 0–1 while uploading. */
  progress: number
  /** The link to watch it on Drive, once uploaded. */
  link: string | null
  error: string | null
}

export interface RecordingInfo {
  id: string
  path: string
  /** File name (« Enregistrement 2026-11-28 10.32.04.mp4 »). */
  name: string
  createdAt: number
  /** Seconds. */
  duration: number
  /** Bytes (0 when the file is gone). */
  size: number
  /** The file is still where it was saved. */
  exists: boolean
  /** JPEG data: URL of its first picture. */
  thumbnail: string | null
  share: RecordingShare
}

/** An upload's progress, sent to the window's thumbnail as it goes. */
export interface RecordingUpload {
  id: string
  share: RecordingShare
}

/** Google Drive, as zak://recordings shows it. */
export interface DriveStatus {
  /** A Google OAuth client is set (built in, or pasted on zak://recordings). */
  configured: boolean
  /** The client was pasted by the user (it can be changed there). */
  ownClient: boolean
  connected: boolean
  /** The account's address, once connected. */
  email: string | null
}

/** What zak://recordings shows. */
export interface RecordingsPageState {
  recordings: RecordingInfo[]
  drive: DriveStatus
  /** Upload each recording as soon as it is made. */
  autoShare: boolean
  /** Anyone with the link can watch (otherwise: only the Drive's owner). */
  publicLink: boolean
}

export const NO_SHARE: RecordingShare = { state: 'none', progress: 0, link: null, error: null }

/** `1:05`, `1:02:09`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const two = (n: number): string => String(n).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`
}
