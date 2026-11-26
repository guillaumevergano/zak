import type { SVGProps } from 'react'

/** Small stroke icons (16 px grid) for the browser chrome. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export const BackIcon = (): JSX.Element => <Icon><path d="M13 8H3M7 4 3 8l4 4" /></Icon>
export const ForwardIcon = (): JSX.Element => <Icon><path d="M3 8h10M9 4l4 4-4 4" /></Icon>
export const ReloadIcon = (): JSX.Element => <Icon><path d="M13 8a5 5 0 1 1-1.5-3.6M13 3v3h-3" /></Icon>
export const StopIcon = (): JSX.Element => <Icon><path d="M4 4l8 8M12 4l-8 8" /></Icon>
export const PlusIcon = (): JSX.Element => <Icon><path d="M8 3v10M3 8h10" /></Icon>
export const CloseIcon = (): JSX.Element => (
  <Icon width={12} height={12}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></Icon>
)
export const LockIcon = (): JSX.Element => (
  <Icon width={13} height={13}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></Icon>
)
export const SearchIcon = (): JSX.Element => (
  <Icon width={13} height={13}><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></Icon>
)
export const GlobeIcon = (): JSX.Element => (
  <Icon width={14} height={14} strokeWidth={1.3}><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.7 1.6 2.5 3.4 2.5 5.5S9.7 11.9 8 13.5C6.3 11.9 5.5 10.1 5.5 8S6.3 4.1 8 2.5Z" /></Icon>
)
export const SpeakerIcon = ({ muted }: { muted: boolean }): JSX.Element => (
  <Icon width={13} height={13}>
    <path d="M3 6.5h2L8 4v8L5 9.5H3z" />
    {muted ? <path d="m10.5 6.5 3 3M13.5 6.5l-3 3" /> : <path d="M10.5 6a3 3 0 0 1 0 4M12 4.5a5 5 0 0 1 0 7" />}
  </Icon>
)
/** "Tout fermer" (CLAUDE.md §6.1: icône balai). */
export const BroomIcon = (): JSX.Element => (
  <Icon><path d="M12.5 2.5 8.5 6.5M5 7.5l3.5 3.5M4.6 7.9C3.3 9.2 2.6 11 2.5 13.5c2.5-.1 4.3-.8 5.6-2.1M6.7 6.3l3 3" /></Icon>
)
export const ChevronIcon = ({ open }: { open: boolean }): JSX.Element => (
  <Icon width={10} height={10} strokeWidth={2} style={{ transform: open ? undefined : 'rotate(-90deg)' }}>
    <path d="M4 6l4 4 4-4" />
  </Icon>
)
export const StarIcon = ({ filled }: { filled: boolean }): JSX.Element => (
  <Icon width={15} height={15} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.5}>
    <path d="M8 2.3l1.75 3.55 3.9.57-2.83 2.76.67 3.89L8 11.24l-3.49 1.83.67-3.89L2.35 6.42l3.9-.57z" />
  </Icon>
)
/** Pinned tabs group (CLAUDE.md §7). */
export const PinIcon = (): JSX.Element => (
  <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor" aria-hidden>
    <path d="M10.2 1.6a.9.9 0 0 1 1.3 0l2.9 2.9a.9.9 0 0 1 0 1.3l-.6.6a.9.9 0 0 1-1 .2l-2.2 2.2.2 2.5a.9.9 0 0 1-.3.7l-.6.6a.6.6 0 0 1-.9 0L6.6 10.2 3 13.8a.5.5 0 0 1-.8-.8l3.6-3.6-2.4-2.4a.6.6 0 0 1 0-.9l.6-.6a.9.9 0 0 1 .7-.3l2.5.2 2.2-2.2a.9.9 0 0 1 .2-1z" />
  </svg>
)
/** New tab (tab favicon, new tab page search field). */
export const SparkleIcon = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Icon width={size} height={size} strokeWidth={1.4}>
    <path d="M8 1.8c.4 3.3 1.6 5.2 6.2 6.2-4.6 1-5.8 2.9-6.2 6.2C7.6 10.9 6.4 9 1.8 8 6.4 7 7.6 5.1 8 1.8Z" />
  </Icon>
)
/** A panel on the right, with an arrow: `collapse` points out (fold the sidebar), else in. */
export const SidebarIcon = ({ collapse }: { collapse: boolean }): JSX.Element => (
  <Icon width={17} height={17} strokeWidth={1.4}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
    <path d="M10.5 2.5v11" />
    <path d={collapse ? 'M5 6l2 2-2 2' : 'M7 6 5 8l2 2'} />
  </Icon>
)
export const GearIcon = (): JSX.Element => (
  <Icon width={17} height={17} strokeWidth={1.4}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5 3.4 3.4" />
    <circle cx="8" cy="8" r="4.6" />
  </Icon>
)
export const DownloadIcon = (): JSX.Element => (
  <Icon width={17} height={17}>
    <path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 13.5h10" />
  </Icon>
)

/** Two pages side by side (split view). */
export const SplitIcon = (): JSX.Element => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="2" />
    <path d="M8 3v10" />
  </Icon>
)

/** Media controls (sidebar): filled shapes, like a player's. */
export const PlayIcon = (): JSX.Element => (
  <Icon fill="currentColor" stroke="none"><path d="M5 3.4v9.2a.6.6 0 0 0 .9.5l7.3-4.6a.6.6 0 0 0 0-1L5.9 2.9a.6.6 0 0 0-.9.5Z" /></Icon>
)
export const PauseIcon = (): JSX.Element => (
  <Icon fill="currentColor" stroke="none"><rect x="3.8" y="3" width="3" height="10" rx=".8" /><rect x="9.2" y="3" width="3" height="10" rx=".8" /></Icon>
)
export const PreviousIcon = (): JSX.Element => (
  <Icon width={14} height={14} fill="currentColor" stroke="none"><rect x="3" y="3.5" width="1.6" height="9" rx=".6" /><path d="M13 4.1v7.8a.5.5 0 0 1-.8.4L6.4 8.4a.5.5 0 0 1 0-.8l5.8-3.9a.5.5 0 0 1 .8.4Z" /></Icon>
)
export const NextIcon = (): JSX.Element => (
  <Icon width={14} height={14} fill="currentColor" stroke="none"><rect x="11.4" y="3.5" width="1.6" height="9" rx=".6" /><path d="M3 4.1v7.8a.5.5 0 0 0 .8.4l5.8-3.9a.5.5 0 0 0 0-.8L3.8 3.7a.5.5 0 0 0-.8.4Z" /></Icon>
)
