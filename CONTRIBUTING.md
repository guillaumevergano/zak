# Contributing to Zak

Thanks for helping! Here is how to get going.

## Before you start

- **Bugs:** open an issue with the steps to reproduce, what you expected and what happened, and
  your OS and Zak version (menu Zak → À propos).
- **Features:** open an issue first to discuss it. Zak tries to stay small and calm: the
  scope is described in [`CLAUDE.md`](CLAUDE.md) (in French), section by section.
- **Security issues:** please don't open a public issue, see [SECURITY.md](SECURITY.md).

Working with an AI agent? Claude Code reads [CLAUDE.md](CLAUDE.md), Codex reads
[AGENTS.md](AGENTS.md): both describe the architecture and the rules. Pull requests written with an
agent are welcome, as long as you have read and tested them. To customize your own Zak without
changing its code, see [docs/customize](docs/customize/README.md).

## Setup

```bash
nvm use              # Node.js 22
npm install
npm run dev
```

DRM streaming (Netflix…) does not work in development or in your own builds: it needs the VMP
signature of official releases. Everything else does.

## Checks

Run these before opening a pull request; CI runs them too.

```bash
npm run typecheck
npm test
npm run test:e2e     # needs a desktop session; keep the test window focused
```

Add or update tests with your change: a unit test for logic, a Playwright test for a user flow.

## Conventions

- Code, comments and commit messages in **English**; interface texts through `t('…')`, French as the key and the English in `src/shared/i18n/`.
- Small commits with imperative messages (`Add sidebar folder drag and drop`).
- Every IPC channel and internal page route is declared in `src/shared/ipc.ts` with its types
  before it is used.
- Never use `<webview>`, `BrowserView`, `nodeIntegration: true` or `remote`. Web pages get no
  custom preload: anything injected into a page goes through `webContents.executeJavaScript`.
- The browser interface never reaches Node directly (`contextIsolation`, `sandbox`).
- Keep animations at 150 ms or less, and the app smooth with 50 tabs open.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change with its tests, and check that the commands above pass.
3. Open the pull request with what changed, why, and how you tested it (screenshots for
   interface changes).

By contributing, you agree that your work is released under the [MIT License](LICENSE).
