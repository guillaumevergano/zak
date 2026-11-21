# Compatibilité des extensions

> Registre des extensions testées et des écarts avec Chrome (CLAUDE.md §10).
> Lib : `electron-chrome-extensions` 4.10.0 + `electron-chrome-web-store` 0.13.0, Electron castLabs 45.2.1.

## Extensions testées

| Extension | Installation | Fonctionnement | Notes |
|---|---|---|---|
| uBlock Origin Lite | ✅ | ❌ blocage | Service worker OK depuis le stub `chrome.commands` (raccourcis inactifs). **Mais aucune pub bloquée** : uBO Lite filtre via `chrome.declarativeNetRequest`, qu'Electron expose (règles chargées) **sans l'appliquer** — API absente de la liste supportée par Electron, y compris sur `main`. Vaut pour tout bloqueur MV3. Voir « Bloqueur de pubs » ci-dessous. |
| Dashlane | ✅ | ✅ connexion, ✅ autoremplissage (confirmé le 18/11) | Nouvel appareil → code reçu **par e-mail** (`RequestTokenVerification`), pas celui de l'appli d'authentification. Autoremplissage : nécessite le shim ci-dessous. Passkeys : voir limites. |
| Loom | à tester | | `chrome.desktopCapture` / `tabCapture` absents de la lib → échec attendu. |

## Page `zak://extensions`

Menu **Fenêtre › Extensions**, ou taper `zak://extensions` dans l'omnibox. Liste les extensions installées
(icône, nom localisé, version, badge MV2), avec : activer / désactiver, **Options** (ouvre la page d'options dans
un onglet), **Désinstaller** (confirmation inline), et un bouton vers le Chrome Web Store.

- **Désactiver** : Electron n'a pas d'état « désactivée ». L'extension est déchargée de la session
  (`session.extensions.removeExtension`), son id est mémorisé dans les réglages (`disabledExtensions`) et elle est
  déchargée à chaque démarrage après le chargement fait par `electron-chrome-web-store`. La réactiver la recharge
  depuis son dossier. La réinstaller depuis le Web Store la réactive. Une extension désactivée n'est pas mise à jour.
- **Pages internes** : servies par le protocole `zak:` (`src/main/internal/InternalProtocol.ts`) depuis le
  build du renderer. Pas de preload dans les onglets (§3) : la page appelle le main en `fetch POST /api/<route>`
  sur sa propre origine avec l'en-tête `x-zak-internal`. Routes déclarées dans `src/shared/ipc.ts`
  (`InternalApiRoutes`). Un site web ne peut ni appeler ces routes (schéma sans CORS + en-tête obligatoire),
  ni y naviguer, rediriger, les ouvrir ou les intégrer en iframe (`TabManager` + `frame-ancestors 'none'`).

## Shim maison : état « onglet actif » pour les service workers d'extensions

**Problème.** Dashlane n'active son autoremplissage que dans l'onglet actif. Il l'apprend par deux voies, toutes deux
cassées dans Electron :

1. `sender.tab` des messages `chrome.runtime` est construit nativement par Electron avec `active: false`,
   `highlighted: false`, `windowId: 0`, quel que soit l'onglet.
2. `chrome.tabs.onHighlighted` n'est jamais émis (non implémenté par la lib, l'événement natif ne se déclenche pas).

**Contournement** (sans modifier la lib) :
- `src/preload/extension-sw.ts` — preload chargé **uniquement** dans les service workers `chrome-extension://`
  (jamais dans les pages web). Il corrige `sender.tab.{active,highlighted,selected,windowId,index}` dans les
  listeners `runtime.onMessage` / `runtime.onConnect`, et remplace `chrome.tabs.onHighlighted` par un événement
  alimenté par le main.
- `src/main/extensions/ExtensionWorkerBridge.ts` — pousse l'état des onglets aux workers et émet `onHighlighted`
  à chaque changement d'onglet actif. Canaux déclarés dans `src/shared/ipc.ts`.

C'est un écart assumé à la règle §10 (« ne pas patcher la lib ») : la lib n'est pas modifiée, mais on comble une API
manquante. Piste propre à terme : contribuer `tabs.onHighlighted` + la correction de `sender.tab` en amont
(`electron-chrome-extensions`), puis supprimer le shim.

Vérifié le 17/11 : sur `github.com/login`, Dashlane reçoit `updateTabActiveInfo [true]` au chargement et au retour
sur l'onglet, et décore les champs identifiant / mot de passe.

## Limites connues

- **Passkeys / WebAuthn** : pas d'interface WebAuthn ni d'accès aux passkeys du trousseau iCloud dans Electron
  (2FA Google par passkey bloquée ; Dashlane interroge aussi `webauthnIsUserVerifyingPlatformAuthenticatorAvailable`).
- **Permissions inconnues d'Electron** pour Dashlane : `privacy`, `downloads` (et `contextMenus` / `cookies`,
  couvertes par la lib). Sans effet constaté pour l'instant.
- `chrome.commands` non supporté.

## Bloqueur de pubs

Constat (18/11) : avec uBO Lite actif (7 listes, ~950 règles dynamiques/session), les scripts
`pagead2.googlesyndication.com` et `securepubads.g.doubleclick.net` se chargent normalement depuis
`example.com`. Electron ne supporte pas `declarativeNetRequest` (doc `docs/api/extensions.md`, v39 et `main`) :
**aucun bloqueur MV3 ne fonctionnera**.

Essais :
1. **uBlock Origin classique (MV2)**, release GitHub 1.76.4 chargée en non empaqueté : la page de fond plante
   (`chrome.browserAction` indéfini). La lib injecte bien ses API au preload, mais la page de fond MV2 ne les
   voit pas dans cette version d'Electron. Abandonné (pas de patch de la lib en v1, §10).
2. **Retenu : bloqueur intégré** `@ghostery/adblocker-electron` 2.20.3 (`src/main/adblock/AdBlocker.ts`) —
   listes Ghostery `adsAndTrackingLists` (EasyList, EasyPrivacy, uBO) + **Liste FR** + **AdGuard Français**,
   moteur mis en cache dans `userData/adblock-engine-<hash des listes>.bin`.
   - **Réseau** : `session.webRequest.onBeforeRequest/onHeadersReceived` sur `persist:main`. Ils prennent le
     pas sur ces mêmes événements `chrome.webRequest` des extensions ; Dashlane (qui déclare `webRequest`)
     autoremplit toujours (vérifié le 18/11).
   - **Cosmétique (encarts vides)** : l'intégration Ghostery passe par un preload dans les pages (interdit, §3).
     À la place, le main lit classes/ids de la page dans un monde isolé (`executeJavaScriptInIsolatedWorld`),
     demande les règles de masquage au moteur et les applique avec `webContents.insertCSS` (au `dom-ready`,
     à la fin du chargement, puis 2,5 s après). Limites : encarts créés bien plus tard (scroll infini) non
     couverts avant la page suivante ; scriptlets (anti-anti-adblock, pubs YouTube) non injectés.
   - Vérifié le 18/11 : `adsbygoogle.js` / `gpt.js` bloqués ; encarts masqués sur 20minutes.fr et
     jeuxvideo.com (`.layout__adPlaceHolder`, règle de Liste FR).

uBO Lite peut être désinstallé : il ne bloque rien.
