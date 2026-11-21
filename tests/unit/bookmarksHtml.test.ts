import { describe, expect, it } from 'vitest'
import { parseBookmarksHtml } from '../../src/main/sidebar/bookmarksHtml'

const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Barre de favoris</H3>
    <DL><p>
        <DT><A HREF="https://mail.google.com/" ICON="data:image/png;base64,AAA">Gmail</A>
        <DT><H3>Travail</H3>
        <DL><p>
            <DT><A HREF="https://figma.com/">Figma &amp; co</A>
            <DT><H3>Archives</H3>
            <DL><p>
                <DT><A HREF="https://old.test/">Vieux</A>
            </DL><p>
            <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
        </DL><p>
    </DL><p>
    <DT><H3>Autres favoris</H3>
    <DL><p>
        <DT><A HREF="https://news.test/">Actu</A>
    </DL><p>
    <DT><H3>Vide</H3>
    <DL><p>
    </DL><p>
    <DT><A HREF="http://loose.test/">Libre</A>
</DL><p>`

describe('parseBookmarksHtml', () => {
  it('maps a Chrome export to root favorites and one level of folders', () => {
    const result = parseBookmarksHtml(CHROME_EXPORT)
    expect(result.root.map((l) => l.title)).toEqual(['Gmail', 'Libre'])
    expect(result.root[0]!.icon).toBe('data:image/png;base64,AAA')
    expect(result.folders.map((f) => [f.name, f.links.map((l) => l.title)])).toEqual([
      ['Travail', ['Figma & co', 'Vieux']],
      ['Autres favoris', ['Actu']]
    ])
  })

  it('returns nothing for a file without bookmarks', () => {
    expect(parseBookmarksHtml('<html><body>hello</body></html>')).toEqual({ root: [], folders: [] })
  })
})
