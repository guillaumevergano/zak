# AGENTS.md

Instructions for AI coding agents (Codex and others) working in this repository. Claude Code reads
[`CLAUDE.md`](CLAUDE.md), the full specification (in French): read it before any change, this file
only summarizes it.

**Only want to customize your own Zak** (settings, a home-made extension)? You don't need this
repository: see [docs/customize/README.md](docs/customize/README.md).

## What Zak is

A desktop browser built on castLabs Electron (Chromium + Widevine), TypeScript everywhere,
React + Vite (electron-vite) for the browser's own interface, Zustand, Tailwind, SQLite
(better-sqlite3), electron-store. One `WebContentsView` per tab, managed by the main process.

```
src/main/        main process: windows, tabs, sessions, extensions, passwords, safety, profiles…
src/preload/     the chrome UI's preload (window.zak)
src/renderer/    React: chrome UI (tab strip, toolbar, sidebar), overlay, internal pages zak://…
src/shared/      ipc.ts (every IPC channel and internal route), types.ts, i18n
tests/unit/      Vitest
tests/e2e/       Playwright, driving the built app
```

## Commands

```bash
npm install
npm run dev          # app with hot reload
npm run typecheck
npm test             # unit tests
npm run test:e2e     # builds, then end-to-end tests (needs a desktop session)
```

All three checks must pass before you finish.

## Rules (from CLAUDE.md §3 and §11)

- Never use `<webview>`, `BrowserView`, `nodeIntegration: true` or `remote`. Web pages get no
  custom preload: anything injected into a page goes through `webContents.executeJavaScript…`
  (an isolated world for our own scripts).
- The chrome UI never reaches Node (`contextIsolation`, `sandbox`); it talks to main through
  `window.zak` only.
- Declare every new IPC channel or internal page route in `src/shared/ipc.ts`, with its types,
  before using it.
- Every visible text goes through `t('…')` (`src/shared/i18n.ts`): French is the key; English,
  Spanish, German, Italian and Portuguese go in `src/shared/i18n/` (languages listed in
  `src/shared/languages.ts`). `tests/unit/i18n.test.ts` fails if one is missing in any language.
- Code, comments and commits in English; docs in `docs/` in French; public files (README,
  CONTRIBUTING, SECURITY, PRIVACY, this file, `docs/customize/`) in English.
- Small commits with imperative messages. Add a unit test for logic and a Playwright test for a
  user flow.
- Don't widen a feature beyond what CLAUDE.md describes for it; update CLAUDE.md when a decision
  changes.
- Zak's own tools (CLAUDE.md §6.8, `src/main/tools/`, `src/shared/tools.ts`) are built in, not
  Chrome extensions: each one has its switch under « Outils Zak » on `zak://extensions` and its
  settings under `tools` in `config.json`. Switched off, a tool leaves nothing behind (no menu item,
  no button, no page script). Translation (right-click on a selection) sends text only on that click, keeps names as
  they are (`<span translate="no">`) and offers English for a text already in Zak's language;
  screenshots (⌘⇧2, page right-click) and screen recordings (⌘⇧E, Loom-like: camera bubble,
  mic, `src/main/tools/RecordTool.ts`) stay local: clipboard / downloads folder. Being on and having
  an icon are separate: any extension or tool that is on can have its icon in the sidebar or not
  (`extensionBar.hidden`, tools as `zak:<tool>`), and works either way.
- DRM streaming can't be tested in development or in your own builds (it needs the signed release).
