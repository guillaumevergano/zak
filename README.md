# Zak

A calm desktop browser built on Chromium (castLabs Electron), with the things people like in
Chrome, Arc and Vivaldi:

- **Chrome extensions** installed straight from the Chrome Web Store (uBlock Origin, Dashlane…).
- **Streaming with DRM** (Netflix, Prime Video, Canal+, Disney+) in official builds.
- **A favorites sidebar** on the right: emoji tiles and folders, drag and drop.
- **Chrome-style tabs** on top, pinned tabs, and a broom that closes everything but the current tab.
- **Automatic picture-in-picture** when you leave a tab with a playing video, like Arc.
- **Private windows**, history, downloads, find in page, per-site zoom and permissions, session restore.

The interface is in French for now.

## Download

Get the latest version on the [releases page](../../releases/latest) (macOS Apple Silicon and
Intel, Windows). Installed copies update themselves.

## Build from source

Requirements: Node.js 22 (see `.nvmrc`), macOS or Windows (Linux is best effort).

```bash
npm install          # also downloads the castLabs Electron build
npm run dev          # the app, with hot reload of the interface
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright, drives the real app)
npm run typecheck
```

Builds you make yourself run everything **except DRM streaming**: Netflix and co. only play in
builds signed for Widevine's Verified Media Path, which the project's release pipeline does. To
package a local build without that signature:

```bash
ZAK_SKIP_VMP=1 CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:dir
```

## How it is built

| Part | Choice |
|---|---|
| Runtime | [castLabs Electron for Content Security](https://github.com/castlabs/electron-releases) (Chromium + Widevine) |
| Interface | React 18, Vite (`electron-vite`), Zustand, Tailwind CSS |
| Pages | one `WebContentsView` per tab, managed by the main process |
| Extensions | [`electron-chrome-extensions`](https://github.com/samuelmaddock/electron-browser-shell) and `electron-chrome-web-store` |
| Storage | SQLite (`better-sqlite3`) and `electron-store` |

```
src/main/       main process: windows, tabs, sessions, extensions, PiP, storage, downloads…
src/preload/    the typed API exposed to the browser interface
src/renderer/   the browser interface (React) and the internal pages (zak://…)
src/shared/     IPC channels and types shared by both sides
tests/          unit (Vitest) and end-to-end (Playwright) tests
```

The detailed specification, in French, is in [`CLAUDE.md`](CLAUDE.md); release and DRM notes are
in [`docs/RELEASE.md`](docs/RELEASE.md).

## Contributing

Bug reports, ideas and pull requests are welcome: start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Fonts are under the SIL Open Font License; the built-in ad blocker
(`@ghostery/adblocker-electron`) is under MPL-2.0.
