# Privacy

Zak is a browser that stays on your computer. It has no account, no analytics and no telemetry:
we (the Zak authors) receive nothing about you or how you use it.

## What stays on your computer

Everything Zak keeps is stored in its profile folder (`~/Library/Application Support/Zak` on
macOS, `%APPDATA%\Zak` on Windows) and never leaves it:

- your history, favorites, open tabs and settings;
- cookies, site data and cache, as in any browser;
- saved passwords, encrypted with your system's keychain (macOS Keychain, Windows DPAPI);
- crash reports: if Zak crashes, Chromium writes a report in the `Crashpad` folder of the profile.
  Nothing is uploaded. When you use **Help → Report a problem…**, Zak opens a GitHub issue
  prefilled with your Zak version and operating system, which you can edit before sending it.

Private windows keep nothing: no history, no session, and their cookies and site data are deleted
when the window closes.

## What Zak downloads, and from where

Besides the sites you visit, Zak itself connects to a few services. None of these requests carry
your history, the pages you visit or any identifier of yours.

| What | Server | When |
|---|---|---|
| Updates | GitHub Releases (`github.com`) | shortly after launch, then every 6 hours (installed builds only) |
| Widevine module, to play Netflix and other DRM-protected videos | Google (Chromium's component updater) | first launch, then when Google updates it |
| Ad and tracker filter lists (EasyList, EasyPrivacy, uBlock Origin lists) | GitHub (`raw.githubusercontent.com`, Ghostery's mirror) | first launch, then from a local cache |
| Phishing and malware lists (OpenPhish, PhishTank, URLhaus, via the malware-filter project) | GitLab Pages (`malware-filter.gitlab.io`), Cloudflare Pages as a fallback | every 12 hours |
| Chrome extensions you install, and their updates | Google (Chrome Web Store) | when you install one, then periodically |

**Dangerous sites are checked on your computer.** Unlike Google Safe Browsing, Zak downloads the
whole lists and compares addresses locally: the pages you visit are never sent to anyone. You can
turn this protection off in Settings → Security.

## Only when you ask

- **Search**: what you type in the address bar goes to the search engine you chose in Settings
  (Google by default), like in any browser. Suggestions come from your own history and favorites.
- **Translate a page** (right-click → Translate) opens the page through Google Translate, which
  then receives its address.

## AI agents (MCP)

If you turn on *Let Claude Code or Codex drive Zak*, Zak listens on your computer only
(127.0.0.1), behind a secret token, for the agent you connected. That agent can see your open tabs
(titles and addresses), favorites and settings, and act on them; never the content of pages, your
history, passwords or cookies. What the agent does with what it sees is governed by that agent's
own privacy policy. It is off by default.

## Extensions

Chrome extensions you install run with the permissions they ask for, as in Chrome. Their privacy
policies are their own.

## Questions

Open an issue on [GitHub](https://github.com/guillaumevergano/zak/issues). To report a security
problem privately, see [SECURITY.md](SECURITY.md).
