/** A link of a bookmarks file. */
export interface ImportedLink {
  title: string
  url: string
  /** data: URL of the icon, when the file has one (Chrome exports them). */
  icon: string | null
}

export interface ImportedBookmarks {
  /** Links outside any folder (and those of the bookmarks bar). */
  root: ImportedLink[]
  folders: { name: string; links: ImportedLink[] }[]
}

const decode = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim()

const attr = (attrs: string, name: string): string | null => {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)
  return match ? decode(match[1]!) : null
}

/**
 * Parses a « Netscape bookmarks » HTML file, as exported by Chrome, Arc, Firefox, Safari…
 * (CLAUDE.md §6.2: one folder level). The bookmarks bar is transparent: its links go to the root
 * and its folders become top-level folders. Deeper folders are flattened into their top-level
 * folder. Only http(s) links are kept.
 */
export function parseBookmarksHtml(html: string): ImportedBookmarks {
  const result: ImportedBookmarks = { root: [], folders: [] }
  // Each open <DL> level: the folder it belongs to (null: root or a transparent folder).
  const stack: ({ name: string; links: ImportedLink[] } | null)[] = []
  let pendingFolder: { name: string; transparent: boolean } | null = null

  const token = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DL\b[^>]*>|<\/DL>|<DT>\s*<A([^>]*)>([\s\S]*?)<\/A>/gi
  for (let m = token.exec(html); m; m = token.exec(html)) {
    const [whole, h3Attrs, h3Name, aAttrs, aTitle] = m
    if (h3Name !== undefined) {
      pendingFolder = { name: decode(h3Name), transparent: /PERSONAL_TOOLBAR_FOLDER\s*=\s*"true"/i.test(h3Attrs ?? '') }
    } else if (/^<DL/i.test(whole)) {
      // Opening the list of the folder just named (or the document's root list).
      const parent = stack.length > 0 ? stack[stack.length - 1]! : null
      if (pendingFolder && !pendingFolder.transparent && parent === null && stack.length > 0) {
        const folder = { name: pendingFolder.name || 'Dossier', links: [] as ImportedLink[] }
        result.folders.push(folder)
        stack.push(folder)
      } else {
        // Root list, the bookmarks bar, or a nested folder flattened into its parent.
        stack.push(parent)
      }
      pendingFolder = null
    } else if (/^<\/DL/i.test(whole)) {
      stack.pop()
    } else if (aAttrs !== undefined) {
      const url = attr(aAttrs, 'HREF')
      if (!url || !/^https?:\/\//i.test(url)) continue
      const link: ImportedLink = { title: decode(aTitle ?? '') || url, url, icon: attr(aAttrs, 'ICON') }
      if (link.icon && !link.icon.startsWith('data:image/')) link.icon = null
      const folder = stack.length > 0 ? stack[stack.length - 1] : null
      ;(folder ? folder.links : result.root).push(link)
    }
  }
  result.folders = result.folders.filter((f) => f.links.length > 0)
  return result
}
