> Extrait du kit de marque v2.0 versionné dans le dépôt : les logos SVG (`logos/`), la palette,
> les jetons CSS et la charte PDF. Les icônes de l'app sont dans `build/` (icon.icns, icon.ico, icon.png),
> celles du site dans `site/brand/`, le favicon des pages internes dans `src/renderer/public/zak.svg`.
> Les autres chemins cités plus bas renvoient au kit complet.

# Zak - kit de marque final v2.0

**Logo retenu : proposition 03, « Le k en réserve ».**
Version du 22 novembre 2026.

## Commencer ici

- Voir `preview/index.html` pour le catalogue visuel.
- Ouvrir `brand/charte-graphique-Zak.pdf` pour les règles d’usage.
- Copier `web-ready/public/brand/` dans le dossier public du site.
- Intégrer les balises de `web-ready/head.html`.

## Les fichiers utiles

| Usage | Fichier |
|---|---|
| Logo principal sur fond clair | `logos/svg/zak-logo-color.svg` |
| Logo sur fond sombre | `logos/svg/zak-logo-reverse.svg` |
| Logo monochrome | variantes `mono-black`, `mono-white`, `mono-cream`, `mono-ink` |
| Couleur pilotée par CSS | `zak-logo-currentcolor.svg`, à intégrer inline |
| Symbole seul | `logos/svg/zak-symbol-color.svg` et ses variantes |
| Symbole 16-32 px | `zak-symbol-micro-color.svg` / `micro-reverse.svg` |
| Images transparentes | `logos/png/`, largeurs 512, 1024, 2048 et 4096 px |
| Présentation avec fond | `zak-logo-on-cream.svg` / `on-plum.svg` et leurs PNG |
| Favicons et Apple Touch | `icons/web/` |
| Icônes PWA | `icon-192.png`, `icon-512.png`, variantes maskable |
| Icône Windows | `icons/desktop/zak.ico` |
| Icône macOS | `icons/desktop/zak.icns` et `zak.iconset/` |
| Icônes PNG pour Linux / fenêtres | `icons/desktop/png/` |
| Impression / partage vectoriel | `print/`, PDF et EPS |
| Réseaux sociaux | `templates/zak-opengraph-*.png` 1200 × 630, `zak-square-*.png` 1080 × 1080 |
| Palette et thèmes | `brand/palette.json`, `brand/tokens.css` |
| Polices locales | `fonts/`, licences incluses, et `brand/fonts.css` |
| Exemple React | `templates/Logo.tsx` |

## Ce qui a été finalisé

Le grand logo de la proposition 03 a été converti en courbes de Bézier, avec
conservation de sa silhouette, de ses liaisons et des ouvertures du a et du k.
Les couleurs sont normalisées à la palette : prune #2E1F2D, crème #F3EDEA,
violet #C67AFB et rose #FF0082. L’œil, la contreforme du a et l’ouverture du k
sont de véritables espaces transparents.

Les SVG de production contiennent uniquement des tracés et, pour les versions
avec fond, des formes vectorielles. Aucun PNG n’est incorporé dans les SVG.
Le logo est un dessin autonome : **ne pas le retaper dans Fraunces**.
DM Sans, Fraunces et JetBrains Mono conservent leurs rôles dans l’interface.

Le symbole utilisé dans les favicons reprend la tête, la huppe, l’aile et le bec
de cette nouvelle version. Sa traverse basse est refermée pour qu’il fonctionne
seul. L’œil est agrandi sur la variante micro ; le logo complet reste inchangé.
Les anciennes propositions et les kits v1 restent dans leurs dossiers d’origine.

## Intégrer sur le site

```html
<img src="/brand/logo.svg" alt="Zak" width="168" height="80">
```

Sur fond prune, employer `logo-reverse.svg`. Pour une image décorative, ou lorsque
le nom est déjà présent à côté, utiliser `alt=""`. Les noms de fichiers peuvent
être changés ; adapter alors tous les chemins qui les référencent.

Le dossier `web-ready/` est prêt à copier. Si votre projet possède déjà son
manifeste, fusionner ses icônes et couleurs plutôt que remplacer son contenu.
Les chemins des icônes sont relatifs au manifeste ; `id`, `start_url` et `scope`
doivent correspondre au chemin réel de l’application. Le manifeste seul n’est
pas une PWA complète. Pour Open Graph, utiliser l’URL absolue de l’image publiée.

Pour les polices, conserver les dossiers `brand/` et `fonts/` au même niveau et
importer `brand/fonts.css`. Les polices WOFF2 sont locales, sans CDN.
Importer `brand/tokens.css` pour les variables de couleur ; les thèmes sont
activés via `data-theme="light"`, `"dark"` ou `"private"`.
Un SVG `currentColor` doit être intégré **inline** pour recevoir la couleur du
parent. Via `<img>`, utiliser une variante à couleur explicite.

## Règles d’usage

- Signature complète : largeur minimale conseillée 128 px. En dessous,
  privilégier le symbole. Ces minima sont à vérifier dans le contexte réel.
- Symbole standard : à partir de 32 px ; version micro : 16 à 32 px.
- Réserver une zone libre égale à 1/8 de la hauteur visible du logo, tout autour.
- Garder le rapport largeur/hauteur, les proportions et les ouvertures internes.
- Utiliser un fond uni ; sélectionner la variante selon le contraste.
- Aucun ajout d’ombre, de relief, de contour, de dégradé ou de rotation.
- Le violet et le rose servent d’accents ; sur crème, l’encre reste la couleur
  du texte courant. Les contrastes mesurés sont dans `brand/contrast.json`.

## Formats et transparence

Le ICO web contient 16/32/48/64 px ; le ICO Windows contient
16/24/32/48/64/128/256 px. Le ICNS contient dix représentations 1x/2x jusqu’à
1024 px. Les marges transparentes et les coins de l’icône macOS sont inclus.
Les Apple Touch et PWA sont carrés et opaques : la plateforme applique le masque.
Les variantes maskable placent le symbole dans le disque sûr central, de rayon
40 % du côté. Ne pas pré-arrondir ces images. Safari reçoit un SVG monochrome.

Les PDF et EPS de `print/` sont vectoriels et en RGB. Pour l’impression CMJN,
appliquer le profil fourni par l’imprimeur ; le rose vif et le violet peuvent
changer de rendu selon le support. Les PNG sont destinés à l’écran.

## Sources et reconstruction

- `sources/paths.json` : les vrais tracés du logo complet.
- `sources/build_assets.py` : dérivations du symbole et exports.
- `sources/approved-concept.png` : proposition sélectionnée, pour comparaison.
- `sources/vectorize.py` : conversion initiale en Bézier ; elle n’est pas
  nécessaire pour utiliser ou régénérer les exports livrés.
- `sources/selected-concept.json` : provenance et prompt de la proposition.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r sources/requirements.txt
# Installer aussi librsvg (rsvg-convert) et Poppler.
python sources/build_assets.py
python sources/build_documents.py
python sources/build_guide.py
python sources/validate_and_package.py
```

Les scripts de reconstruction ne téléchargent rien. Les polices originales sont
documentées dans `fonts/SOURCES.json` et couvertes par les licences SIL OFL
présentes dans chaque famille. L’inventaire SHA-256 est dans `files-manifest.json` ;
les contrôles de formats, de transparence et de fidélité sont dans
`validation-report.json`. Aucun code d’application n’a été modifié.
