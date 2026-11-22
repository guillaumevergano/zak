# Customize Zak with Claude Code or Codex

Zak is meant to be shaped by the people who use it. You don't need to know how to code: an AI
coding agent such as [Claude Code](https://claude.com/claude-code) or
[Codex](https://openai.com/codex) can do it for you, in plain words.

There are four ways, and none requires rebuilding Zak, so you keep getting its updates:

| | What it changes | How |
|---|---|---|
| **Settings file** | everything in Settings: search engine, theme, startup, tab sleep, picture-in-picture, sidebar… | the agent edits one JSON file; Zak applies it as soon as it is saved |
| **Mods** | Zak itself: a theme for its interface, your own new tab page | the agent writes a folder in Zak's mods folder; you pick it in Settings |
| **Drive Zak from your agent** | your open tabs, groups, favorites, settings, mods | turn on Zak's MCP server; the agent then acts on the running browser |
| **Home-made extensions** | anything a Chrome extension can do: new buttons, page tweaks, shortcuts, reader modes, themes for websites… | the agent writes an extension in a folder; you load it once, Zak reloads it on every change |

## 1. The settings file

**Where it is:** Settings → *Customize with Claude Code or Codex* → *Open* or *Show folder*.

| System | Path |
|---|---|
| macOS | `~/Library/Application Support/Zak/config.json` |
| Windows | `%APPDATA%\Zak\config.json` |
| Linux | `~/.config/Zak/config.json` |

(Other profiles have their own file, under `Zak Profiles/<id>/config.json` next to it.)

Every key is described in [`settings.schema.json`](settings.schema.json), and the file points to it
(`"$schema"`), so an agent — or your editor — knows what is allowed. Invalid values are ignored and
fall back to their default, so a mistake can't break Zak.

Open a terminal and ask, for example:

```
claude "In ~/Library/Application Support/Zak/config.json, set the search engine to DuckDuckGo,
the theme to dark and tab sleep to 30 minutes. Follow the schema linked in the file."
```

```
codex "Add youtube.com and twitch.tv to the sites where Zak's picture-in-picture never starts.
The settings are in ~/Library/Application Support/Zak/config.json (schema linked inside)."
```

Changes apply right away, except the interface language (at the next launch).

## 2. Mods: a theme, a new tab page

A mod is a folder in Zak's **mods folder** (Settings → *Customize with Claude Code or Codex* →
*Mods folder* → *Open*), with a `mod.json`:

```json
{
  "name": "Nuit bleue",
  "version": "1.0",
  "description": "A deep blue frame and a soft blue-grey panel.",
  "theme": "theme.css",
  "newtab": "newtab.html"
}
```

A mod has a `theme`, a `newtab`, or both. Pick them in Settings (*Theme*, *New tab page*): one of
each at a time. Zak watches the folder, so an edit shows at once.

- **Theme** — a CSS file added to Zak's interface and its own pages. It redefines Zak's color
  tokens (`--color-frame`, `--color-cream`, `--color-pink`… — the full list is at the top of
  [`styles.css`](../../src/renderer/src/styles.css)), with `!important` because Zak sets some of them
  again for dark mode. Example: [`mods/nuit-bleue`](mods/nuit-bleue/theme.css).
- **New tab page** — an HTML page (with its own CSS, scripts, images in the folder) shown instead
  of Zak's new tab. It is sandboxed: it can't reach the internet nor any other part of Zak, only
  its own files and the new tab's two API calls (recent sites, suggestions), documented in the
  example [`mods/accueil-minimal`](mods/accueil-minimal/newtab.html). To open a page or search, it
  changes `location`.

```
claude "Create a Zak mod in the mods folder (~/Library/Application Support/Zak/mods/forest)
with a forest-green theme, following docs/customize/README.md of github.com/guillaumevergano/zak"
```

To install a mod someone shared, copy its folder into the mods folder.

## 3. Home-made extensions

Zak runs Chrome extensions, and AI agents write them very well. Ask for one in a folder of your
choice, then load it once: **Extensions → Load unpacked extension…** and pick the folder. From then
on, Zak reloads it every time a file in the folder changes, so you can keep asking for tweaks and
see them immediately.

```
claude "Create a Chrome extension (Manifest V3) in ~/Zak/extensions/reader-mode that adds a
toolbar button to show the current page in a clean reader mode, without ads or menus."
```

Ideas to start from:

- a button that copies the page's title and link as Markdown;
- a dark mode for a site that has none;
- hiding the recommendations on YouTube's home page;
- a keyboard shortcut that opens your three daily sites in a tab group;
- a new look for a site you use every day.

The smallest possible extension, for reference:

```json
{
  "manifest_version": 3,
  "name": "Hello Zak",
  "version": "1.0",
  "content_scripts": [{ "matches": ["https://*/*"], "js": ["hello.js"] }]
}
```

### Good to know

- An extension can read and change the pages it is allowed on. Only load folders you trust, and
  read what an agent wrote if the extension touches sensitive sites. Trying a new one in a separate
  profile (File → Profiles) keeps it away from your accounts.
- Extensions are off in private windows.
- *Remove* in Extensions forgets the extension; its folder stays where it is.

## 4. Let Claude Code or Codex drive Zak (MCP)

Zak has a built-in [MCP](https://modelcontextprotocol.io) server, so an agent can act on the
browser you have open: "group my tabs by project", "add these five sites to my sidebar in a
Reading folder with emojis", "switch to the Nuit bleue theme".

Turn it on in Settings → *Customize with Claude Code or Codex* → *Let Claude Code or Codex drive
Zak*. Zak then shows what to paste:

```
claude mcp add --transport http zak http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

```toml
# Codex: ~/.codex/config.toml
[mcp_servers.zak]
url = "http://127.0.0.1:<port>/mcp"
bearer_token_env_var = "ZAK_MCP_TOKEN"
```

| Tool | What it does |
|---|---|
| `list_tabs` | windows, tabs (id, title, address), tab groups |
| `open_tab`, `close_tabs`, `activate_tab` | open an address or a search, close, show a tab |
| `group_tabs` | put tabs into a named, colored group |
| `list_favorites`, `add_favorite` | read the sidebar, add a favorite (emoji, folder) |
| `get_settings`, `update_settings` | read and change the general settings |
| `list_mods`, `use_mod` | list the mods, pick a theme or a new tab page |

On purpose, the server can't read the content of pages, your history, passwords or cookies. It is
off by default, only listens on your computer (127.0.0.1), needs the token, and refuses requests
coming from web pages. *New token* in Settings disconnects every agent that had the old one.

## Going further: changing Zak itself

Zak is open source (MIT). To change the browser itself, clone the repository and work with your
agent there: [`CLAUDE.md`](../../CLAUDE.md) (Claude Code) and [`AGENTS.md`](../../AGENTS.md)
(Codex) describe the architecture and the rules, and [CONTRIBUTING.md](../../CONTRIBUTING.md)
explains how to propose your change to everyone. Note that a build you make yourself can't play
DRM-protected streaming (Netflix…): that needs Zak's signed release.

Made something others would like? Mods are in the [gallery](https://hellozak.com/mods/):
open a pull request adding your mod's folder to [`docs/customize/mods`](mods) and an entry, with
the prompt that made it, to [`site/mods/mods.json`](../../site/mods/mods.json). Extensions: publish
the folder on GitHub with the `zak-extension` topic.
