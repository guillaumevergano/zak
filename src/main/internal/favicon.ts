import icon from '../../renderer/public/zak.svg?raw'

/**
 * Favicon of the internal pages (zak://…), as a data URL: the chrome UI and the sidebar live in
 * another session, which cannot load zak:// URLs.
 */
export const INTERNAL_FAVICON = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`
