import { execFile } from "node:child_process";
import { nativeTheme, systemPreferences, type WebContents } from "electron";
import type { GeneralSettings } from "@shared/types";
import { isInternalUrl } from "../internal/InternalProtocol";
import { trackIdentitySetup } from "../userAgent";

/**
 * The light or dark mode web pages see (`prefers-color-scheme`), apart from Zak's own theme.
 * Zak's theme goes through nativeTheme.themeSource, which Chromium also hands to every page:
 * with Zak in "Clair" on a dark Mac, YouTube & co. were light, unlike Arc or Chrome. Each tab
 * gets its scheme through the DevTools protocol instead (Emulation.setEmulatedMedia), on the
 * debugger already attached for the Chrome identity (userAgent.ts). Internal pages (zak://)
 * keep following Zak's theme: no emulation there.
 */
export type SiteScheme = "light" | "dark" | "";

/** What the computer itself is set to, whatever Zak's theme (nativeTheme only says Zak's). */
class SystemAppearance {
  private dark = false;
  private listeners = new Set<() => void>();

  constructor() {
    if (process.platform === "darwin") {
      this.dark = this.readMac();
      systemPreferences.subscribeNotification(
        "AppleInterfaceThemeChangedNotification",
        () => this.set(this.readMac()),
      );
    } else {
      this.dark = nativeTheme.shouldUseDarkColors;
      void this.readOther();
      nativeTheme.on("updated", () => void this.readOther());
    }
  }

  isDark(): boolean {
    return this.dark;
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private set(dark: boolean): void {
    if (dark === this.dark) return;
    this.dark = dark;
    for (const listener of this.listeners) listener();
  }

  private readMac(): boolean {
    return (
      systemPreferences.getUserDefault("AppleInterfaceStyle", "string") ===
      "Dark"
    );
  }

  /** Windows: the "apps" mode in the registry; elsewhere, nativeTheme when Zak follows the system. */
  private async readOther(): Promise<void> {
    if (process.platform !== "win32") {
      if (nativeTheme.themeSource === "system")
        this.set(nativeTheme.shouldUseDarkColors);
      return;
    }
    const key =
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";
    const out = await new Promise<string>((resolve) =>
      execFile(
        "reg",
        ["query", key, "/v", "AppsUseLightTheme"],
        { windowsHide: true },
        (_err, stdout) => resolve(stdout ?? ""),
      ),
    );
    const match = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out);
    if (match) this.set(parseInt(match[1], 16) === 0);
  }
}

export class SiteColorScheme {
  private readonly system = new SystemAppearance();
  /** Last scheme sent to each page, so a navigation only sends a command when it changes. */
  private readonly sent = new WeakMap<WebContents, SiteScheme>();

  constructor(private readonly setting: () => GeneralSettings["sitesTheme"]) {}

  /** Called when the computer switches between light and dark. */
  onSystemChange(listener: () => void): void {
    this.system.onChange(listener);
  }

  /** The scheme for a page at `url`: '' leaves it to Zak's theme (internal pages, about:blank). */
  schemeFor(url: string): SiteScheme {
    if (url === "" || url === "about:blank" || isInternalUrl(url)) return "";
    const setting = this.setting();
    if (setting === "system") return this.system.isDark() ? "dark" : "light";
    return setting;
  }

  /** Gives the page at `url` (about to load, or loaded) its scheme, if it changed. */
  apply(wc: WebContents, url: string): void {
    if (wc.isDestroyed() || !wc.debugger.isAttached()) return;
    const scheme = this.schemeFor(url);
    if ((this.sent.get(wc) ?? "") === scheme) return;
    this.sent.set(wc, scheme);
    void trackIdentitySetup(
      wc.debugger.sendCommand("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: scheme }],
      }),
    );
  }
}
