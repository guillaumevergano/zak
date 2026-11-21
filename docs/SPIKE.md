# Spike de risque — Étape 0

> Objectif (CLAUDE.md §9) : prouver que les trois briques risquées — **extensions Chrome**, **DRM
> Widevine/VMP**, **PiP automatique** — marchent ensemble dans un build packagé. Si un point échoue,
> on décide avant d'aller plus loin.

## Ce qui est en place

| Brique | Version / choix | Fichiers |
|---|---|---|
| Electron castLabs (Widevine) | `v45.2.1+wvcus` (Chromium 156) — dernière stable ; v46 encore en alpha | `package.json` |
| electron-vite + React 18 + Tailwind | electron-vite 6, Vite 8 | `electron.vite.config.ts`, `src/renderer/` |
| Onglets | 1 `WebContentsView` par onglet, session `persist:main` | `src/main/tabs/TabManager.ts` |
| Extensions | `electron-chrome-extensions` 4.10.0 + `electron-chrome-web-store` 0.13.0 | `src/main/extensions/ExtensionsHost.ts` |
| Icônes d'extensions | `<browser-action-list partition="persist:main">` dans la toolbar | `src/preload/chrome.ts`, `App.tsx` |
| User agent | Chrome standard, sans `Electron/` ni nom d'app | `src/main/userAgent.ts` |
| Widevine | `components.whenReady()` avant l'ouverture de la fenêtre + badge « Widevine OK/✗ » | `src/main/index.ts` |
| PiP auto | `executeJavaScript(…, true)` sur l'onglet quitté / fenêtre minimisée | `src/main/pip/PipController.ts` |
| Packaging | electron-builder, hooks VMP (mac `afterPack`, win `afterSign`) | `electron-builder.yml`, `scripts/` |

### Déjà vérifié de mon côté (macOS arm64, build non signé)

- `npm run build:app` et `npx tsc` passent sans erreur.
- Au lancement : Widevine CDM `4.10.3112.0` téléchargé et enregistré (`components.whenReady()` résolu).
- YouTube se charge dans la `WebContentsView`, positionnée sous la barre (layout envoyé par le renderer).
- UA vu par la page : `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36`.
- Le chrome UI n'a pas accès à Node (`require` indéfini), `window.zak` et `<browser-action-list>` sont présents.
- **Build packagé** (`dist/mac-arm64`) : le preload du Web Store est bien injecté sur `chromewebstore.google.com` (`chrome.webstorePrivate` présent) — les preloads des libs sont donc résolus depuis l'asar.

Rien de ce qui suit n'a été testé à la main (installation réelle d'extensions, connexion, lecture DRM, PiP visible) : c'est la liste ci-dessous.

## Lancer

```bash
npm install
npm run dev                 # dev, HMR sur le renderer — PAS pour tester le DRM
ZAK_SKIP_VMP=1 CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:dir   # build packagé, non signé
open dist/mac-arm64/ZAK.app
```

Le premier lancement attend le téléchargement du CDM Widevine (quelques secondes, fenêtre pas
encore visible). L'écran « Préparation du lecteur vidéo… » est prévu plus tard (§6.6).

---

## Vérifications manuelles

Remplir la colonne **Résultat** (✅ / ❌ / ⚠️ + note). Les tests extensions et PiP peuvent se faire
en `npm run dev` ; le DRM **uniquement** sur un build packagé et signé.

### 1. Socle

| # | Vérification | Résultat |
|---|---|---|
| 1.1 | La fenêtre s'ouvre, YouTube s'affiche sous la barre, le badge affiche « Widevine OK » | ✅ |
| 1.2 | `+` ouvre un onglet, clic sur un onglet = bascule, `✕` ferme ; le redimensionnement de la fenêtre suit | |
| 1.3 | `target=_blank` / clic molette sur un lien → nouvel onglet (pas de fenêtre sauvage) | |
| 1.4 | Sur https://www.whatismybrowser.com : détecté comme « Chrome 156 », aucune mention d'Electron | |

### 2. Extensions (§6.5)

> ⚠️ uBlock Origin (MV2) a été retiré du Chrome Web Store en 2025. Utiliser **uBlock Origin Lite**
> (MV3) comme témoin. Le support MV2 est quand même activé (`minimumManifestVersion: 2`).

| # | Vérification | Résultat |
|---|---|---|
| 2.1 | Ouvrir `chromewebstore.google.com`, page d'une extension → le bouton « Ajouter à Chrome » est actif | |
| 2.2 | **uBlock Origin Lite** : s'installe, icône dans la toolbar, popup s'ouvre au clic, pubs bloquées sur un site d'actu | ❌ uBO Lite ne bloque rien (Electron n'applique pas `declarativeNetRequest`), uBO MV2 plante → **bloqueur intégré Ghostery** à la place : pubs bloquées et encarts masqués (docs/EXTENSIONS.md) |
| 2.3 | Redémarrer l'app → l'extension est toujours là (chargée depuis `~/Library/Application Support/ZAK/Extensions`) | |
| 2.4 | **Connexion Google** dans un onglet (accounts.google.com) : pas d'écran « Ce navigateur ou cette application ne sont peut-être pas sécurisés » | ✅ après shim `window.chrome` ; 2FA par passkey bloquée → autre méthode OK |
| 2.5 | **Dashlane** : installation, connexion au compte (popup + éventuel onglet de login) | ✅ (code de vérification reçu par e-mail) |
| 2.6 | Dashlane : autoremplissage d'identifiants sur 3 sites (noter lesquels) | ✅ après shim onglet actif (docs/EXTENSIONS.md), confirmé le 18/11 |
| 2.7 | Dashlane : enregistrement d'un nouvel identifiant après une connexion | |
| 2.8 | **Loom** : installation, connexion | ⏭️ abandonné (18/11) : remplacé à terme par un enregistreur d'écran intégré au navigateur |
| 2.9 | Loom : lancer un enregistrement d'écran → noter l'erreur exacte si échec | ⏭️ voir 2.8 |
| 2.10 | Clic droit dans une page : les entrées des extensions (`chrome.contextMenus`) apparaissent | |

Points d'attention :
- Loom dépend probablement de `chrome.desktopCapture` / `chrome.tabCapture`, **absents** de la liste
  des API supportées par `electron-chrome-extensions` 4.10 → échec attendu. Si c'est le cas : noter
  l'erreur (DevTools de la page de fond via clic droit → Inspecter sur le popup) et basculer sur
  l'app desktop Loom (§10).
- Si 2.4 échoue malgré l'UA : les Client Hints exposent `Chromium` mais pas `Google Chrome`
  (`navigator.userAgentData.brands`). Ce sera la piste suivante — à traiter **sans**
  `session.webRequest` sur `persist:main` (cela désactiverait `chrome.webRequest` pour les extensions).
- **Résultat 2.4 (17/11)** : refusé avec le seul UA Chrome, puis avec les Client Hints « Google Chrome »,
  puis avec un UA Firefox sur `accounts.google.com`. **Débloqué** par le shim `window.chrome`
  (`loadTimes`, `csi`, `app`) + notifications non accordées d'office (`src/main/userAgent.ts`,
  `SessionManager`) : l'étape mot de passe est atteinte.
- **Passkeys / clés de sécurité (WebAuthn)** : la validation en deux étapes par passkey reste bloquée
  (page grise). Electron n'a ni l'interface WebAuthn de Chrome ni l'accès aux passkeys du trousseau
  iCloud ; le mode « téléphone » (QR + Bluetooth) demande en plus `NSBluetoothAlwaysUsageDescription`
  dans l'Info.plist. Contournement : « Essayer une autre méthode » (notification téléphone, code).
  Sujet à part entière, à traiter après le spike.
- Toute extension incompatible → `docs/EXTENSIONS.md` (§10), pas de patch de la lib en v1.

### 3. DRM — build packagé + signé (§6.6)

> Suite à l'Étape 7 : procédure et tests à jour dans **`docs/RELEASE.md`**.

Prérequis (une seule fois) :

1. `python3 -m pip install --upgrade castlabs-evs`
2. Créer le compte EVS : `python3 -m castlabs_evs.account signup` (mail de confirmation), puis
   `python3 -m castlabs_evs.account reauth` pour mettre le jeton en cache.
3. Certificat **Developer ID Application** dans le trousseau (ou `CSC_LINK` + `CSC_KEY_PASSWORD`).
4. Notarisation : exporter `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

Build : `npm run build:mac` → `dist/ZAK-0.0.1-arm64.dmg` (+ x64). Le log doit montrer
`VMP signing …` puis la vérification `verify-pkg`, **avant** `signing file=…ZAK.app`.
En CI : `EVS_ACCOUNT` / `EVS_PASSWD` en secrets, jamais commités.

| # | Vérification | Résultat |
|---|---|---|
| 3.1 | Le build passe : VMP signé + vérifié, signature Apple, notarisation acceptée | |
| 3.2 | `spctl -a -vv dist/mac-arm64/ZAK.app` → `accepted, source=Notarized Developer ID` | |
| 3.3 | `python3 -m castlabs_evs.vmp verify-pkg dist/mac-arm64/ZAK.app` → signature valide | |
| 3.4 | https://bitmovin.com/demos/drm (Widevine) : la vidéo démarre | |
| 3.5 | **Netflix** : lecture d'un épisode (pas d'erreur M7121-1331) | |
| 3.6 | **Prime Video** : lecture d'un épisode | |
| 3.7 | **Canal+** : lecture d'un épisode | |
| 3.8 | (bonus) Disney+ | |
| 3.9 | Contre-test : un build `ZAK_SKIP_VMP=1` est refusé par Netflix (prouve que la signature compte) | |
| 3.10 | Windows (si dispo) : `npm run build:win` sur une machine Windows, même tests 3.4–3.7 | |

Qualité attendue : Widevine L3 → SD/HD selon le service, pas de 4K (comme Chrome desktop).

### 4. PiP automatique (§6.4)

| # | Vérification | Résultat |
|---|---|---|
| 4.1 | YouTube : lancer une vidéo, ouvrir/cliquer un autre onglet → la vidéo passe en PiP natif | ✅ |
| 4.2 | Revenir sur l'onglet YouTube → le PiP se ferme | ✅ |
| 4.3 | Vidéo en pause puis changement d'onglet → **pas** de PiP | ✅ |
| 4.4 | Minimiser la fenêtre pendant la lecture → PiP ; restaurer → fermé | ✅ |
| 4.5 | Twitch (live) | ✅ |
| 4.6 | Vimeo | ⏳ la vidéo testée est chiffrée Widevine (CENC) : pas de clé en build non signé → ne démarre pas. À refaire avec le build signé (section 3) |
| 4.7 | Lecteur HTML5 nu (ex. https://www.w3schools.com/html/html5_video.asp — vidéo dans la page, pas en iframe) | ✅ après correctif (voir ci-dessous) |
| 4.8 | Netflix (build signé) — un refus est acceptable, le noter | |

Tests 4.1–4.7 joués le 18/11 en pilotant le navigateur (CDP + inspecteur du main).

**Correctif 4.7** : Chromium met en pause les vidéos muettes (ou sans piste audio) dès que la page est
cachée ; l'onglet quitté était caché avant que `requestPictureInPicture()` ne s'exécute. Désormais
`TabManager` affiche le nouvel onglet **au-dessus** de l'ancien, attend le démarrage du PiP
(`beforeHide`, 600 ms max) puis seulement cache l'onglet quitté.

En cas d'échec : console du process main (`[pip] …`) et console DevTools de l'onglet
(`[zak] PiP refused: …`).

---

## Décision

| Brique | Verdict | Suite |
|---|---|---|
| Extensions | ✅ Web Store, Dashlane (connexion + autoremplissage), connexion Google. Bloqueur intégré à la place d'uBO (MV3 non appliqué par Electron) | Loom remplacé à terme par un enregistreur intégré ; finitions en Étape 3 |
| DRM | ⏭️ Widevine chargé (badge OK), chaîne de signature prête (hook VMP + venv EVS) ; build signé non testé | Reporté à l'Étape 7 (compte EVS, Developer ID, notarisation) |
| PiP | ✅ YouTube, Twitch, HTML5, pause, minimisation | Vimeo (DRM) et Netflix à refaire à l'Étape 7 ; réglages en Étape 5 |

**Conclusion (18/11)** : extensions et PiP validés, le DRM signé est reporté à l'Étape 7 à la demande de
l'utilisateur. On passe à l'Étape 1 (squelette navigateur).
