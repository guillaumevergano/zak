/** Private window (CLAUDE.md §6.3): main loads the chrome UI with `?private=1`. */
export const isPrivateWindow = new URLSearchParams(location.search).get('private') === '1'
