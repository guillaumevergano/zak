# Build signé et DRM en production — Étape 7

Netflix, Prime Video, Canal+ et Disney+ ne lisent rien tant que l'app n'est pas **packagée et
signée VMP** (castLabs EVS), puis signée et notarisée par Apple sur macOS (CLAUDE.md §6.6). En
`npm run dev` ou dans un build non signé, ces services refusent la lecture (erreur type M7121-1331) :
c'est normal.

## Ce qui est prêt

| Élément | Où |
|---|---|
| Fork castLabs `45.2.1+wvcus`, CDM Widevine chargé au lancement | `package.json`, `src/main/index.ts` |
| Écran « Préparation du lecteur vidéo… » pendant le téléchargement du CDM | `src/main/windows/Splash.ts` |
| Signature VMP : macOS **avant** la signature Apple (`afterPack`), Windows **après** Authenticode (`afterSign`) | `electron-builder.yml`, `scripts/hooks/`, `scripts/vmp-sign.js` |
| Hardened runtime, entitlements (JIT, caméra, micro), notarisation | `electron-builder.yml`, `build/entitlements.mac.plist` |
| Vérification des prérequis | `npm run release:check` |
| Test du build packagé (asar, SQLite natif, pages internes, preloads, UA) | `npm run smoke:packaged` ✅ (19/11, macOS arm64, non signé) |

## Ce qu'il te reste à faire (une seule fois)

`npm run release:check` dit précisément ce qui manque. Au 19/11 :

1. **Compte castLabs EVS** (gratuit) :
   ```bash
   .venv/bin/python -m castlabs_evs.account signup   # e-mail de confirmation
   .venv/bin/python -m castlabs_evs.account reauth   # met le jeton en cache (~/.config/evs)
   ```
2. **Certificat Apple « Developer ID Application »** (compte Apple Developer, 99 €/an) :
   developer.apple.com → Certificates → « + » → Developer ID Application, puis double-clic sur le
   certificat pour l'installer dans le trousseau.
3. **Notarisation** : appleid.apple.com → Connexion et sécurité → Mots de passe pour app, puis
   ```bash
   export APPLE_ID="ton@apple.id" APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" APPLE_TEAM_ID="ABCDE12345"
   ```
   (à mettre dans un fichier hors du dépôt, jamais commité).

Puis :

```bash
npm run release:mac
```

Le log doit montrer `VMP signing …` et `verify-pkg` **avant** `signing file=…ZAK.app`, puis la
notarisation. Résultat : `dist/ZAK-<version>-arm64.dmg` et `-x64.dmg`.

Windows (sur une machine Windows) : `npm run release:win`, avec `CSC_LINK` / `CSC_KEY_PASSWORD`
pour Authenticode (recommandé).

## Tests d'acceptation (build signé uniquement)

| # | Vérification | Résultat |
|---|---|---|
| 7.1 | `spctl -a -vv dist/mac-arm64/ZAK.app` → `accepted, source=Notarized Developer ID` | |
| 7.2 | `.venv/bin/python -m castlabs_evs.vmp verify-pkg dist/mac-arm64/ZAK.app` → signature valide | |
| 7.3 | https://bitmovin.com/demos/drm (Widevine) : la vidéo démarre | |
| 7.4 | **Netflix** : lecture d'un épisode, sans erreur M7121-1331 | |
| 7.5 | **Prime Video** : lecture d'un épisode | |
| 7.6 | **Canal+** : lecture d'un épisode | |
| 7.7 | (bonus) Disney+ | |
| 7.8 | Contre-test : un build `ZAK_SKIP_VMP=1` est refusé par Netflix (la signature compte) | |
| 7.9 | PiP automatique sur **Vimeo** (vidéo chiffrée, ne démarrait pas en build non signé) | |
| 7.10 | PiP automatique sur **Netflix** (un refus du site est acceptable, le noter) | |
| 7.11 | Windows : mêmes tests 7.3–7.6 | |

Qualité attendue : Widevine L3, donc SD ou HD selon le service, pas de 4K (comme Chrome sur ordinateur).

## Publier une version (GitHub Actions)

Les versions officielles sont construites, signées et publiées par `.github/workflows/release.yml`
quand un tag de version est poussé ; le site (`site/`) et la mise à jour automatique
(`electron-updater`) lisent ensuite GitHub Releases.

1. Une fois : dans le dépôt GitHub, Settings → Secrets and variables → Actions, créer :

   | Secret | Contenu |
   |---|---|
   | `EVS_ACCOUNT`, `EVS_PASSWD` | compte castLabs EVS (signature VMP) |
   | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | certificat Developer ID Application exporté en .p12, encodé en base64 (`base64 -i cert.p12`), et son mot de passe |
   | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarisation |
   | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | certificat Authenticode (.pfx en base64) ; facultatif mais sans lui SmartScreen avertit |

   Les pull requests de contributeurs n'ont jamais accès à ces secrets.
2. À chaque version : monter `version` dans `package.json`, commiter, puis
   `git tag v0.1.0 && git push --tags`. Le workflow vérifie que le tag et la version concordent.
3. Les fichiers gardent un nom fixe (`ZAK-mac-arm64.dmg`, `ZAK-mac-x64.dmg`,
   `ZAK-Setup-x64.exe`) : les liens `releases/latest/download/…` du site pointent toujours sur
   la dernière version.

`electron-builder.yml` → `publish` désigne le dépôt (`guillaumevergano/zak`) ; à changer si le
dépôt public a un autre nom, ainsi que `REPO` dans `site/index.html`.

Chaque version publiée doit être signée VMP comme n'importe quel build, sinon la mise à jour
casserait la lecture DRM.

**Licence Widevine** : avant la première version publique, vérifier auprès de castLabs les
conditions d'une signature VMP de production pour une app distribuée au public (Google peut exiger
un accord de licence Widevine). C'est ce qui conditionne la lecture sur Netflix & co.

## En cas d'échec

- **M7121-1331 / « navigateur non pris en charge »** : la signature VMP manque ou a été cassée par une
  signature faite après elle (macOS : VMP doit précéder la signature Apple, c'est le rôle d'`afterPack`).
  Vérifier avec `verify-pkg` (7.2).
- **« Lecteur vidéo DRM indisponible »** dans la barre d'outils : le CDM ne s'est pas chargé ; voir le
  log `[widevine]` du processus principal.
- **Gatekeeper refuse l'app** : notarisation absente ou refusée (`xcrun notarytool log <id>`).
