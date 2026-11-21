> Extrait du kit de marque ZAK v1.0 versionné dans le dépôt : les logos SVG (`logos/`), la palette,
> les jetons CSS et la charte PDF. Les icônes de l'app sont dans `build/` (icon.icns, icon.ico, icon.png),
> celles du site dans `site/brand/`. Les autres chemins cités plus bas renvoient au kit complet.

# ZAK - kit de marque v1.0

**Démarrer :** ouvrir `preview/index.html` pour voir les fichiers, puis
`brand/charte-graphique-ZAK.pdf` pour les règles d’usage.

Ce kit décline le **Z ailé, concept 04, avec le mot ZAK en capitales**.
Les formes ont été reconstruites en courbes de Bézier à partir de la proposition
validée. Les couleurs ont été remises exactement à celles du brief, en aplats.
Le dessin source reste dans `sources/approved-concept.png` pour comparaison.
Le lettrage est un dessin vectoriel : il n’a pas besoin de police et ne doit pas
être recomposé en saisissant « ZAK » dans une police.

## Quel fichier utiliser ?

| Besoin | Fichier / dossier |
|---|---|
| Logo principal sur fond clair | `logos/svg/zak-stacked-color.svg` |
| Logo en en-tête | `logos/svg/zak-horizontal-color.svg` |
| Logo sur fond prune / sombre | mêmes noms avec `reverse` |
| Symbole seul | `logos/svg/zak-symbol-color.svg` |
| Symbole à 16-32 px | `zak-symbol-micro-color.svg` ou `micro-reverse.svg` |
| Une seule couleur / gravure | variantes `mono-ink`, `mono-black`, `mono-white`, `mono-cream` |
| Teinte pilotée par CSS | `zak-symbol-currentcolor.svg`, à inclure **inline** |
| PNG transparents | `logos/png/`, largeurs 512, 1024 et 2048 px |
| Favicon / icônes web | `icons/web/` |
| Application macOS | `icons/desktop/zak.icns` + source `zak.iconset/` |
| Application Windows | `icons/desktop/zak.ico` |
| Linux / icône de fenêtre | `icons/desktop/png/zak-{taille}.png` |
| Icône carrée 1024 px | `icons/desktop/zak-app-1024.png` |
| Impression / partage vectoriel | `print/`, PDF RGB et EPS |
| Réseaux sociaux / Open Graph | `templates/zak-social-light.png` ou `dark.png`, 1200 x 630 |
| Couleurs et thèmes | `brand/palette.json` et `brand/tokens.css` |
| Polices locales | `fonts/` et `brand/fonts.css` |
| Composant React facultatif | `templates/Logo.tsx` |

## Intégration web

1. Copier **le contenu** de `icons/web/` dans `public/brand/`.
2. Copier le contenu de `logos/svg/` dans `public/brand/logos/`.
3. Insérer les balises de `templates/head.html` dans le `<head>` de l’application.
4. Dans `site.webmanifest`, adapter `id`, `start_url` et `scope` si l’application
   n’est pas servie à la racine. Les chemins d’icônes restent relatifs au manifeste.
5. Si un manifeste existe déjà, fusionner les entrées `icons` et les couleurs :
   ne pas remplacer les réglages de l’application. Le manifeste et les icônes
   seuls ne constituent pas une PWA complète.

```html
<img src="/brand/logos/zak-horizontal-color.svg"
     alt="ZAK" width="208" height="80">
```

Adapter les chemins publics au routeur et au bundler du projet. Pour un déploiement
dans un sous-dossier, adapter aussi les chemins absolus de `templates/head.html`.
Pour Open Graph, l’URL de l’image publiée doit être absolue ; aucun domaine fictif
n’est configuré dans ce kit. Si le logo est décoratif ou voisin du nom, utiliser `alt=""`.

Les SVG sont autonomes, sans police, image incorporée, script ni ressource externe.
Les trous de l’œil et de la version monochrome sont transparents. Utiliser un fond
uni et choisir la variante adaptée. `currentColor` ne suit la couleur du parent
que si le SVG est inclus inline, pas via une balise `<img>`.

## Polices et thèmes

Conserver `brand/` et `fonts/` au même niveau, puis importer `brand/fonts.css` et
`brand/tokens.css`. Les fichiers WOFF2 sont locaux ; aucun CDN n’est requis.
Appliquer `data-theme="light"`, `"dark"` ou `"private"` au conteneur principal.
Le kit fournit les tokens, sans imposer de CSS aux composants de votre application.

DM Sans sert à l’interface, Fraunces aux titres, JetBrains Mono aux URL.
Les originaux TTF variables, versions WOFF2 et licences SIL OFL sont inclus.
`fonts/SOURCES.json` donne leur provenance et les empreintes des originaux.
Les couleurs secondaires du thème privé absentes du brief sont des propositions.

## Règles rapides

- Conserver les proportions, les trois accents du symbole et le mot **ZAK**.
- Zone libre recommandée : 1/8 de la largeur visible du symbole, tout autour.
- Symbole standard à partir de 32 px ; version micro à 16-32 px.
- Logo horizontal : largeur minimale conseillée 120 px. Vertical : 96 px.
  Logotype seul : 72 px. À confirmer dans le contexte d’affichage final.
- Sur fond sombre, utiliser `reverse` ; pour une seule encre, une variante mono.
- Pas d’ombre, relief, contour ajouté, étirement, dégradé ni rotation du logo.
- Le violet et le rose sont des accents. Sur crème, utiliser l’encre pour les
  petits textes : voir les rapports mesurés dans `brand/contrast.json`.

## Icônes et masques

Le favicon est une tuile prune, avec un œil agrandi pour rester lisible à 16 px.
Le ICO web contient 16/32/48/64 px. Le ICO Windows contient 16/24/32/48/64/128/256 px.
Le ICNS contient dix représentations 1x/2x jusqu’à 1024 px.
L’icône macOS inclut sa marge transparente et sa forme arrondie.
Les Apple Touch et PWA sont **carrées et opaques** : la plateforme applique son masque.
Les versions `maskable` ont une composition plus petite, comprise dans le disque
central de sécurité de rayon 40 % de la largeur. Ne pas ajouter de coins arrondis.
L’icône Safari épinglée est un vrai symbole monochrome.

## Impression

Les SVG, PDF et EPS sont vectoriels. Les couleurs sont en **RGB/sRGB** pour conserver
l’identité numérique. Une conversion CMJN doit être faite avec le profil fourni
par l’imprimeur : le rose vif et le violet peuvent varier à l’impression.

## Sources et reconstruction

Les chemins maîtres sont dans `sources/build_assets.py` (BODY, WING, BEAK, Z, A, K).
Tous les fichiers sont déjà générés ; les scripts ne sont utiles que pour modifier
la géométrie, changer les dimensions ou reproduire les exports.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r sources/requirements.txt
# Installer aussi librsvg (rsvg-convert) et Poppler pour les aperçus PDF.
python sources/build_assets.py
python sources/build_brand.py
python sources/build_guide.py
python sources/validate_and_package.py
```

`fetch_fonts.py` permet de télécharger de nouveau les polices originales ; il
n’est pas nécessaire pour reconstruire le kit livré. Il consulte la version
courante de Google Fonts, qui peut différer des originaux inclus et documentés.

Le dossier courant ne contenant pas de code d’application, aucun écran ni fichier
de configuration du navigateur n’a été modifié. Le kit est prêt à être intégré.
L’inventaire des fichiers est dans `files-manifest.json`, le contrôle des formats
dans `validation-report.json`. Version créée le 21 novembre 2026.
