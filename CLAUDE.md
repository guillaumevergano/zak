# Zak — Spécification d'architecture (navigateur de bureau perso)

> Nom : **Zak** (identité visuelle : `docs/brand/`). Document destiné à être placé à la racine du repo
> (ex. `CLAUDE.md` ou `docs/SPEC.md`) et lu par Claude Code à chaque session.

## 1. Objectif

Navigateur de bureau à usage quotidien, pour un seul utilisateur, construit sur un moteur existant
(Chromium via Electron). Il reprend les fonctionnalités préférées de Chrome, Arc, Vivaldi… sans
réinventer le moteur. Priorités absolues, dans l'ordre :

1. Extensions Chrome installables depuis le Chrome Web Store (Dashlane, Loom, uBlock Origin…).
2. Lecture des services de streaming à DRM (Netflix, Prime Video, Canal+, Disney+…).
3. Barre latérale de favoris, à droite (emoji + dossiers).
4. Onglets en haut à la Chrome, bouton « tout fermer ».
5. Lecteur vidéo flottant automatique (PiP) au changement d'onglet, à la Arc.
6. Mode navigation privée.

Tout le reste (historique, téléchargements, recherche dans la page…) est le « socle » : nécessaire
pour un usage quotidien, mais sans invention — on fait comme Chrome.

## 2. Stack technique (décisions prises, ne pas rediscuter)

| Brique | Choix | Pourquoi |
|---|---|---|
| Runtime | **Electron (fork castLabs « Electron for Content Security »)** — `github:castlabs/electron-releases#vXX.Y.Z+wvcus` (prendre la dernière version supportée) | Chromium complet + Widevine CDM + VMP. Drop-in replacement d'Electron. |
| Langage | **TypeScript** partout (main, preload, renderer) | |
| UI du navigateur (« chrome ») | **React 18 + Vite** via `electron-vite` | Itération rapide, HMR |
| State UI | **Zustand** | Léger, pas de boilerplate |
| Styles | **Tailwind CSS** | |
| Pages web (onglets) | **`WebContentsView`** (une par onglet, gérée côté main) | API Electron actuelle (remplace `BrowserView` / `<webview>` qui sont dépréciés) |
| Extensions | **`electron-chrome-extensions`** + **`electron-chrome-web-store`** (packages de Samuel Maddock, projet `electron-browser-shell`) | Apporte `chrome.tabs`, `chrome.windows`, popups, browser actions, context menus, installation depuis le Web Store, MV2 + MV3 |
| Persistance | **SQLite via `better-sqlite3`** (historique, favoris, dossiers, sessions d'onglets) + **`electron-store`** pour les réglages | |
| Drag & drop | **`@dnd-kit/core`** | Réordonner favoris / dossiers / onglets |
| Emoji picker | **`emoji-picker-react`** (ou `@emoji-mart/react`) | Favoris illustrés |
| Packaging | **`electron-builder`** + hook `afterPack`/`afterSign` pour la signature VMP castLabs (`castlabs_evs`) | Voir §8 |
| Tests | **Vitest** (unitaires) + **Playwright** (e2e Electron) sur les flux critiques | |

Plateformes cibles : macOS et Windows (VMP/Widevine complet). Linux = best effort (castLabs y a des
limitations VMP).

## 3. Architecture des processus

```
┌───────────────────────────────────────────────────────────────┐
│ MAIN (Node)                                                   │
│  WindowManager   → BrowserWindow(s) normales + privées        │
│  TabManager      → 1 WebContentsView par onglet, par fenêtre  │
│  SessionManager  → 'persist:main' | 'private-<uuid>'          │
│  ExtensionsHost  → electron-chrome-extensions + web-store     │
│  PipController   → détection vidéo + requestPictureInPicture  │
│  Store (SQLite)  → favoris, dossiers, historique, sessions    │
│  Downloads, Permissions, ContextMenu, Shortcuts, Updater      │
└───────────────┬───────────────────────────────────────────────┘
                │ IPC typé (contextBridge, canaux déclarés dans shared/ipc.ts)
┌───────────────▼───────────────────────────────────────────────┐
│ RENDERER « chrome » (React) — 1 par BrowserWindow             │
│  TabStrip (haut) · Toolbar/Omnibox · Sidebar favoris (droite) │
│  <browser-action-list> (icônes d'extensions, fourni par lib)  │
│  Panneaux : téléchargements, historique, réglages             │
└───────────────────────────────────────────────────────────────┘
   Les WebContentsView des onglets sont positionnées par le main
   dans la zone « contenu » (sous la toolbar, à gauche de la sidebar).
   Le renderer envoie ses dimensions de layout au main à chaque resize.
```

Règles :
- Le renderer « chrome » n'a **jamais** accès à Node (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- Les pages web (onglets) n'ont **aucun** preload maison sauf le preload fourni par `electron-chrome-extensions` (nécessaire aux extensions). Toute injection côté page passe par `webContents.executeJavaScript`.
- Un seul fichier `shared/ipc.ts` déclare les canaux et leurs types ; main et renderer l'importent. Pas de string magique.

## 4. Structure du repo

```
zak/
├─ CLAUDE.md                 ← ce document
├─ package.json
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ scripts/
│   └─ vmp-sign.js           ← hook castLabs EVS
├─ src/
│   ├─ main/
│   │   ├─ index.ts
│   │   ├─ windows/WindowManager.ts
│   │   ├─ tabs/TabManager.ts
│   │   ├─ sessions/SessionManager.ts
│   │   ├─ extensions/ExtensionsHost.ts
│   │   ├─ pip/PipController.ts
│   │   ├─ store/{db.ts, favorites.ts, history.ts, sessions.ts}
│   │   ├─ downloads/DownloadsManager.ts
│   │   ├─ permissions/PermissionsHandler.ts
│   │   ├─ menu/{AppMenu.ts, ContextMenu.ts}
│   │   └─ shortcuts/Shortcuts.ts
│   ├─ preload/
│   │   └─ chrome.ts         ← expose window.zak (API typée)
│   ├─ renderer/             ← React
│   │   ├─ App.tsx
│   │   ├─ components/{TabStrip, Toolbar, Omnibox, Sidebar, FavoriteItem, FolderItem, EmojiPicker, DownloadsPanel, HistoryPanel, Settings}
│   │   ├─ store/useBrowserStore.ts
│   │   └─ styles/
│   └─ shared/
│       ├─ ipc.ts
│       └─ types.ts
└─ tests/
```

## 5. Modèle de données (SQLite)

```sql
CREATE TABLE folders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT,
  position INTEGER NOT NULL, collapsed INTEGER DEFAULT 0, created_at INTEGER
);
CREATE TABLE favorites (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
  emoji TEXT,                    -- emoji choisi ; si NULL → favicon
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  position INTEGER NOT NULL, created_at INTEGER
);
CREATE TABLE history (
  id INTEGER PRIMARY KEY, url TEXT NOT NULL, title TEXT,
  visited_at INTEGER NOT NULL, visit_count INTEGER DEFAULT 1
);
CREATE INDEX history_url ON history(url);
CREATE TABLE tab_sessions (      -- restauration au démarrage
  window_id TEXT, tab_index INTEGER, url TEXT, title TEXT, pinned INTEGER, active INTEGER
);
```

Les fenêtres privées n'écrivent **rien** dans `history` ni `tab_sessions`.

## 6. Spécification fonctionnelle, feature par feature

### 6.1 Onglets (en haut, style Chrome)
- Barre d'onglets en haut de la fenêtre, au-dessus de la toolbar. Chaque onglet : favicon, titre tronqué, indicateur audio (🔊 / cliquer = mute), bouton ✕ au survol.
- Bouton « + » nouvel onglet (ouvre `zak://newtab`, la barre d'adresse garde le focus pour taper tout de suite, avec suggestions) ; bouton **« Tout fermer »** à gauche de la barre (icône balai, à la Arc) : ferme tous les onglets sauf l'onglet actif et les épinglés, sans confirmation (`Cmd/Ctrl+Shift+T` les rouvre).
- Onglets épinglés (clic droit → Épingler) : réduits à l'icône, regroupés à gauche de la barre avant le balai ; au survol, l'onglet s'élargit et montre le titre du site.
- Réorganisation par drag & drop ; glisser hors de la barre = nouvelle fenêtre (v2).
- Raccourcis : `Cmd/Ctrl+T` nouveau, `Cmd/Ctrl+W` fermer, `Cmd/Ctrl+Shift+T` rouvrir le dernier fermé (pile de 20), `Ctrl+Tab`/`Ctrl+Shift+Tab` suivant/précédent, `Cmd/Ctrl+1..9` aller à l'onglet n, `Cmd/Ctrl+Shift+W` tout fermer.
- Implémentation : `TabManager` crée une `WebContentsView` par onglet dans la session de la fenêtre, l'ajoute à `win.contentView`, ne rend visible que l'active (`setVisible`). Les bounds sont recalculées à partir du layout envoyé par le renderer (`layout:update { sidebarWidth, topHeight }`).
- `webContents.setWindowOpenHandler` → ouvre dans un nouvel onglet (jamais une BrowserWindow sauvage), sauf popups OAuth (features `popup` ou taille explicite) → petite fenêtre dédiée dans la même session.
- Onglets inactifs depuis > 30 min : déchargement (« mise en veille ») optionnel, réglage désactivé par défaut en v1.

### 6.2 Barre latérale droite — favoris
- Panneau fixe à droite (sous la barre d'outils), largeur réglable (220–380 px), repliable (`Cmd/Ctrl+B`) en mode « icônes seules ». Roue crantée en bas → `zak://settings`.
- Contenu : liste ordonnée de **dossiers** (repliables) et de **favoris** à la racine. Un dossier contient des favoris (un seul niveau de profondeur en v1).
- Favoris de la racine en **mosaïque de 5 tuiles carrées par ligne** : chaque tuile n'affiche que l'**emoji** (choisi via picker), ou le favicon si pas d'emoji ; le titre apparaît en infobulle au survol. La tuile du site ouvert dans l'onglet actif est mise en avant. Clic = ouvrir dans l'onglet courant ; `Cmd/Ctrl+clic` ou clic molette = nouvel onglet.
- Ajouter : bouton ★ dans la toolbar (page courante) → popover « Titre / Emoji / Dossier » ; ou glisser un onglet depuis la barre d'onglets vers la sidebar ; ou clic droit sur un lien → « Ajouter aux favoris de la sidebar ».
- Dossiers en **liste** (chevron, emoji, nom, nombre de favoris) ; un dossier déplié montre ses favoris en lignes (icône + titre).
- Dossiers : bouton « + Nouveau dossier » sous la liste, nom + emoji, drag & drop pour réordonner et déplacer des favoris dedans/dehors. Clic sur un dossier = plier/déplier ; clic droit → « Ouvrir tous dans des onglets ».
- Persistance immédiate en SQLite (pas de bouton enregistrer). Import depuis un fichier HTML de favoris Chrome/Arc (v1.1).

### 6.3 Mode navigation privée
- `Cmd/Ctrl+Shift+N` ou menu → nouvelle **fenêtre** privée. Toute la fenêtre est privée (comme Chrome), pas un onglet isolé.
- Session Electron **non persistante** : `session.fromPartition('private-<uuid>')` (sans préfixe `persist:`). Cookies, cache, storage en mémoire, détruits à la fermeture de la fenêtre.
- Visuel distinct : thème sombre forcé + badge « Privé » dans la barre d'onglets. Rien n'est écrit dans l'historique ni dans la restauration de session. Les téléchargements vont dans le dossier normal (comme Chrome).
- Extensions dans les fenêtres privées : **désactivées par défaut** en v1 (réglage global « Autoriser les extensions en navigation privée » en v1.1).

### 6.4 Lecteur flottant automatique (PiP) à la Arc
- Comportement : quand l'utilisateur quitte un onglet (changement d'onglet actif ou minimisation de la fenêtre) où une vidéo est **en lecture**, la vidéo passe en Picture-in-Picture natif (fenêtre flottante toujours au-dessus, déplaçable, redimensionnable, avec contrôles). Quand il revient sur l'onglet, le PiP se ferme automatiquement.
- Implémentation (`PipController`) :
  1. Sur `tab:activated` → pour l'onglet **précédent**, si `webContents.isCurrentlyAudible()` est vrai OU que le script de sondage trouve une `<video>` non pausée de taille raisonnable (> 200×100 px) :
  2. `previous.webContents.executeJavaScript(ENTER_PIP_SCRIPT, /* userGesture */ true)` — le `true` est **indispensable** : `requestPictureInPicture()` exige une activation utilisateur, et Electron permet de la simuler ainsi.
  3. `ENTER_PIP_SCRIPT` : sélectionne la vidéo en lecture la plus grande, retire l'attribut `disablepictureinpicture` si présent, appelle `video.requestPictureInPicture()`, retourne `true/false`.
  4. Sur retour à l'onglet → `executeJavaScript('document.pictureInPictureElement && document.exitPictureInPicture()')` (réglage « Fermer le PiP au retour » activable/désactivable).
- Réglages : activer/désactiver ; liste de domaines exclus ; ne pas déclencher si la vidéo est muette (par défaut : déclencher quand même).
- YouTube est la référence de test ; vérifier aussi Twitch, Vimeo, un lecteur HTML5 nu, et Netflix (le PiP sur contenu DRM peut être refusé par le site — acceptable).
- v2 : Document Picture-in-Picture API (fenêtre PiP custom avec nos contrôles) si disponible dans la version d'Electron utilisée.

### 6.5 Extensions Chrome (Dashlane, Loom, uBlock Origin…)
- `ExtensionsHost` instancie `new ElectronChromeExtensions({ session, createTab, selectTab, removeTab, createWindow, … })` sur la session `persist:main`, en implémentant les callbacks avec le `TabManager`. Appeler `extensions.addTab(webContents, window)` pour chaque onglet créé.
- `installChromeWebStore({ session, extensionsPath, autoUpdate: true })` → l'utilisateur ouvre `https://chromewebstore.google.com`, clique « Ajouter à Chrome », l'extension s'installe. Page interne `zak://extensions` listant les extensions installées (activer / désactiver / désinstaller / ouvrir les options).
- Icônes des extensions dans la toolbar via l'élément `<browser-action-list>` fourni par la lib (le preload de la lib doit être chargé dans le renderer « chrome »). Les popups d'extensions sont gérés par la lib.
- Packaging : inclure `node_modules` des deux libs (leurs preloads sont résolus à l'exécution) — suivre leur README pour `asarUnpack`.
- User agent : définir un UA **Chrome standard** (retirer les tokens `Electron/` et le nom de l'app) via `app.userAgentFallback` — sinon la connexion Google (et certains SSO) refuse les « navigateurs embarqués », ce qui casserait Dashlane/Loom/Google Workspace.
- **Validation obligatoire au spike (§9)** : installer Dashlane → connexion + autoremplissage sur 3 sites ; installer Loom → vérifier si l'enregistrement d'écran fonctionne. Si Loom échoue (API `chrome.desktopCapture`/`tabCapture` non couvertes), documenter et renvoyer vers l'app desktop Loom. uBlock Origin sert de témoin (connu pour fonctionner).

### 6.6 Streaming DRM (Netflix, Prime Video, Canal+, Disney+)
- Utiliser **exclusivement** le fork castLabs comme dépendance `electron` (`package.json` → `"electron": "github:castlabs/electron-releases#v<version>+wvcus"`). Ne jamais le remplacer par l'Electron standard « pour tester » : rien de DRM ne marchera.
- Widevine CDM : chargé automatiquement par le fork au premier lancement (prévoir un écran « Préparation du lecteur vidéo… » si `app.whenReady` attend le CDM — suivre le README castLabs, option `components`).
- **VMP (Verified Media Path)** : les binaires castLabs publiés sont pré-signés **pour le développement uniquement** → Netflix & co. refuseront (erreur type M7121-1331) tant que le build n'est pas signé avec **EVS** (`pip install castlabs-evs`, compte castLabs gratuit). Hook electron-builder : sur macOS signer VMP **avant** la signature Apple (`afterPack`), sur Windows **après** la signature code (`afterSign`). Script : `python3 -m castlabs_evs.vmp sign-pkg <appOutDir>`.
- macOS : certificat **Developer ID** + notarisation requis pour que la chaîne VMP soit valide. Windows : signature code recommandée.
- Limites connues : Widevine L3 → qualité plafonnée (SD/HD selon le service, pas de 4K), identique à Chrome sur ordinateur. Linux : pas de licences persistantes.
- Test d'acceptation : lire un épisode sur Netflix, Prime Video et Canal+ dans un build packagé et signé.

### 6.7 Socle « comme Chrome » (obligatoire pour un usage quotidien)
- **Omnibox** : URL ↔ recherche (moteur par défaut réglable : Google, DuckDuckGo, Brave…), suggestions depuis l'historique et les favoris, `Cmd/Ctrl+L` focus, affichage du cadenas/état HTTPS.
- **Historique** : table `history`, panneau `Cmd/Ctrl+Y`, recherche, effacement par période.
- **Téléchargements** : `session.on('will-download')`, panneau avec progression/pause/annuler/ouvrir le dossier, bouton toolbar avec badge.
- **Recherche dans la page** : `Cmd/Ctrl+F` → `webContents.findInPage` avec compteur.
- **Zoom** : `Cmd/Ctrl +/-/0`, mémorisé par domaine.
- **Menu contextuel** : retour/avancer/recharger, ouvrir le lien dans un nouvel onglet / fenêtre privée, copier lien/image, enregistrer l'image, inspecter, + entrées des extensions (`chrome.contextMenus`, fourni par la lib).
- **Permissions** : `session.setPermissionRequestHandler` → popover sous l'omnibox (notifications, caméra, micro, géoloc, presse-papiers, plein écran), mémorisation par domaine.
- **Certificats / erreurs** : page d'erreur interne `zak://error` (DNS, TLS, hors ligne) avec bouton réessayer.
- **Plein écran** vidéo (`enter-html-full-screen`) : masquer sidebar + barres.
- **Restauration de session** au lancement (onglets de la dernière fenêtre normale) + « Rouvrir la fenêtre fermée ».
- **Réglages** `zak://settings` : moteur de recherche, page de démarrage, PiP, sidebar, extensions en privé, thème (clair/sombre/système), dossier de téléchargement, effacer les données.
- **Impression** `Cmd/Ctrl+P` (`webContents.print`). **DevTools** `F12` / `Cmd+Opt+I`.
- **Mise à jour** : `electron-updater` via GitHub Releases (v1.1). En attendant, suivre les releases castLabs (elles suivent de près Electron upstream, donc les correctifs de sécurité Chromium).

Choix faits à l'Étape 6 (à garder) :
- L'historique est une page interne `zak://history` ouverte par `Cmd/Ctrl+Y` (comme `chrome://history`), pas un panneau.
- Les panneaux posés au-dessus de la page (suggestions de l'omnibox, barre `Cmd/Ctrl+F`, demande d'autorisation, téléchargements, éditeurs de favoris) passent par la vue `Overlay` (`src/main/windows/Overlay.ts`) : modale plein écran ou réduite à son cadre.
- Plein écran : accordé sans demande, comme Chrome ; les demandes concernent notifications, caméra, micro, position et lecture du presse-papiers.
- « Effacer les données » : la période s'applique à l'historique ; cookies, données de sites et cache sont effacés en entier (Electron ne sait pas les effacer par période).
- Restauration de session : réglage « Au démarrage » (onglets de la dernière session par défaut, ou nouvel onglet + « Reprendre la navigation »).
- Fermer un onglet ou quitter attend la fin de la préparation CDP de l'onglet (`userAgent.ts`), sinon le processus principal boucle à 100 % CPU.
- Navigateur par défaut : le build déclare http/https et les pages HTML (Info.plist sur macOS, `build/installer.nsh` sur Windows). Réglages → « Définir par défaut » (dialogue système sur macOS, page « Applications par défaut » sur Windows ; indisponible en `npm run dev`). Un lien venu d'une autre app s'ouvre dans un nouvel onglet de la dernière fenêtre normale ; une seule instance par profil (`src/main/system/DefaultBrowser.ts`).

## 7. Design / UI
Maquette de référence : **`docs/design/maquette-v2.png`**. Jetons dans `src/renderer/src/styles.css`.
- **Cadre prune** `#2E1F2D` (fenêtre opaque) : barre d'onglets en haut (feux tricolores, onglets épinglés, balai « Tout fermer », onglets, « + ») et barre latérale à droite, sous la barre d'outils. Texte `#F3EBF1`, secondaire `#A8929F`, tuiles `#3E2F3E`, accent violet `#C67AFB` (tuile active cerclée `#9D7BE6`).
- **Panneau crème** `#F3EDEA` (coins arrondis 14 px, marge 8 px) : l'onglet actif (qui s'y raccorde, à la Chrome), la barre d'outils sur toute la largeur (← → ⟳, omnibox en pilule `#EBE2E2` bordée `#DECFD6`, puis au bout les icônes d'extensions et le bouton des téléchargements, au-dessus de la barre latérale) et la page web, à gauche de la barre latérale. Le panneau forme un L inversé : coin rentrant arrondi entre la barre d'outils et la barre latérale. Feux tricolores centrés sur les onglets. Texte `#2A1A26`, secondaire `#6F5B68`.
- **Page Nouvel onglet** `zak://newtab` : logo Zak (version inversée en thème sombre et en privé), titre serif « Un peu d'espace. », sous-titre `#C8A8A8` « Pour vos prochaines idées. », champ « Où voulez-vous aller ? » (⌘K). « Reprendre la navigation » et « Récemment » (aperçus carrés arrondis) arrivent avec l'Étape 6 (restauration de session, historique). Le sélecteur d'espaces et le « Mode focus » de la maquette sont hors périmètre.
- **Rose `#FF0082`** réservé aux éléments marquants (chargement, focus de l'omnibox, onglet sonore) ; petit texte rose sur fond sombre `#FF8CC4`.
- **Logo** : « La branche », oiseau-Z posé sur une branche qui porte le mot Zak (kit de marque v3.0 dans `docs/brand/`, charte PDF incluse). Icônes de l'app dans `build/` (`icon.icns`, `icon.ico`, `icon.png`), favicon des pages internes `src/renderer/public/zak.svg`, icônes du site dans `site/brand/`. Ne pas recomposer le mot Zak dans une police : utiliser les SVG.
- Polices embarquées (OFL) : **DM Sans** pour l'interface, **Fraunces** pour les titres de la page Nouvel onglet, **JetBrains Mono** pour l'URL et le code. Emojis en police système.
- Popovers et pages internes (extensions, réglages) gardent les jetons violets de la v1 (`docs/design/maquette.html`) sur fond crème.
- Fenêtre : `titleBarStyle: 'hiddenInset'` sur macOS (feux tricolores dans la barre d'onglets), `titleBarOverlay` sur Windows.
- Navigation privée : même structure, cadre `#150C2B` et panneau violet nuit `#2A1850` (jetons remappés par `body.private`), page Nouvel onglet sombre, badge « Privé ».
- Barre de défilement des pages : fine, mauve, fond transparent (CSS injecté en origine « user » : les sites qui stylent la leur la gardent).
- Aucune animation > 150 ms. Tout doit rester fluide avec 50 onglets ouverts.

## 8. Build & distribution
- `npm run dev` → electron-vite avec HMR sur le renderer.
- `npm run build` → electron-builder, cibles `dmg` (mac, arm64 + x64) et `nsis` (win).
- Hook VMP (§6.6) dans `scripts/vmp-sign.js` ; variables d'environnement `EVS_ACCOUNT` / `EVS_PASSWD` lues en CI, jamais commitées.
- Icône de l'app dans `build/`.

## 9. Plan de réalisation

**Étape 0 — Spike de risque (à faire EN PREMIER, avant toute UI)**
Un seul objectif : prouver que les trois briques risquées marchent ensemble dans un build packagé.
1. Projet electron-vite minimal avec le fork castLabs, une fenêtre, une `WebContentsView`.
2. `electron-chrome-extensions` + `electron-chrome-web-store` branchés ; installer uBlock Origin, Dashlane, Loom depuis le Web Store ; noter ce qui marche.
3. Packager + signer VMP (EVS) + signer Apple ; ouvrir Netflix, lire un épisode.
4. YouTube : changer d'onglet → PiP natif apparaît via `executeJavaScript(…, true)`.
Livrable : `docs/SPIKE.md` avec le résultat de chaque point. Si un point échoue, on décide avant d'aller plus loin.

**Étape 1 — Squelette navigateur** : WindowManager, TabManager, barre d'onglets, omnibox, navigation, raccourcis, menu contextuel, IPC typé.
**Étape 2 — Sidebar favoris** : SQLite, dossiers, emoji, drag & drop, ajout depuis la toolbar.
**Étape 3 — Extensions** : intégration complète, page `zak://extensions`, `<browser-action-list>`, UA Chrome.
**Étape 4 — Navigation privée** : fenêtres privées, sessions éphémères, thème.
**Étape 5 — PiP automatique** : PipController + réglages + tests multi-sites.
**Étape 6 — Socle quotidien** : historique, téléchargements, permissions, find, zoom, restauration de session, réglages.
**Étape 7 — DRM en prod** : chaîne de build signée, tests Netflix / Prime / Canal+.
**Étape 8 — Polish** : thème, animations, icône, import des favoris, auto-update.

Chaque étape = une branche + une PR, avec un test Playwright sur le flux principal.

## 10. Risques connus & décisions
| Risque | Décision |
|---|---|
| Une extension n'est pas compatible (API manquante dans la lib) | Documenter dans `docs/EXTENSIONS.md`, ne pas patcher la lib soi-même en v1 |
| Loom ne peut pas enregistrer l'écran | Fallback app desktop Loom ; réévaluer en v2 (`desktopCapturer` Electron → shim `chrome.desktopCapture`) |
| Google refuse la connexion | UA Chrome standard (§6.5) ; ne jamais exposer `Electron/` dans l'UA |
| Netflix erreur VMP | Toujours tester le DRM sur un build **packagé et signé EVS**, jamais en `npm run dev` |
| Mises à jour Chromium | Suivre `castlabs/electron-releases` ; bump dans les 2 semaines après chaque release stable |
| Performance avec beaucoup d'onglets | Une `WebContentsView` par onglet est OK ; activer la mise en veille (6.1) si > 40 onglets |

## 11. Conventions pour Claude Code
- Langue du code et des commits : anglais. Langue des docs et de l'UI : français.
- Projet open source (licence MIT) : les fichiers destinés au public (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, modèles `.github/`) sont en anglais ; ce document et `docs/` restent en français. Le site de téléchargement est dans `site/` (GitHub Pages).
- Avant d'implémenter une feature, relire la section correspondante de ce document et ne pas en élargir le périmètre.
- Ne jamais introduire `<webview>`, `BrowserView`, `nodeIntegration: true` ni `remote`.
- Toute nouvelle commande IPC est déclarée dans `src/shared/ipc.ts` avec ses types avant usage.
- Commits atomiques, messages en impératif (`Add sidebar folder drag and drop`).
- Quand un point technique dépend d'une version (Electron, lib d'extensions), vérifier la doc de la version installée plutôt que de supposer.

## 12. Premier prompt à donner à Claude Code

```
Lis CLAUDE.md en entier. Nous commençons par l'Étape 0 (spike de risque, §9).
Initialise le projet avec electron-vite + TypeScript + React, en remplaçant la dépendance
electron par le fork castLabs (dernière version supportée, suffixe +wvcus). Crée une fenêtre
avec une WebContentsView qui charge https://www.youtube.com, branche electron-chrome-extensions
et electron-chrome-web-store sur la session persist:main, règle un user agent Chrome standard,
et ajoute un script de build electron-builder avec le hook de signature VMP (sans credentials).
Puis rédige docs/SPIKE.md avec la liste des vérifications manuelles que je dois faire.
Ne fais pas d'UI au-delà du strict minimum pour cette étape.
```
