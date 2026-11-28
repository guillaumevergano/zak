# Partage des enregistrements par Google Drive

Les enregistrements d'écran (CLAUDE.md §6.8) se partagent par un lien : Zak envoie la vidéo dans le
Google Drive de la personne (dossier « Zak ») et copie le lien. Pour parler à Google, Zak a besoin
d'un **identifiant client OAuth** à lui, créé une seule fois dans la console Google Cloud.

## Créer l'identifiant client (une fois, ~10 min)

1. <https://console.cloud.google.com> → créer un projet (par ex. « Zak »).
2. **API et services → Bibliothèque** → « Google Drive API » → **Activer**.
3. **API et services → Écran de consentement OAuth** (« Google Auth Platform ») :
   - Type d'utilisateur : **Externe**.
   - Nom de l'application : `Zak`, adresse d'assistance, logo (`build/icon.png`), domaine
     `hellozak.com`, liens vers la confidentialité (`PRIVACY.md` publié sur le site).
   - **Accès aux données** → ajouter le champ d'application
     `https://www.googleapis.com/auth/drive.file` (« Voir, modifier, créer et supprimer uniquement
     les fichiers Google Drive spécifiques que vous utilisez avec cette application »). C'est le seul.
   - **Audience** : tant que l'application est « En test », seuls les comptes ajoutés comme
     **utilisateurs test** (100 au plus) peuvent se connecter : ajoute le tien. Pour tout le monde :
     « Publier l'application ». `drive.file` est un champ d'application non sensible : pas d'audit de
     sécurité, seulement la validation de la marque (nom, logo, domaine).
4. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   type **Application de bureau**, nom `Zak`. Google donne un **ID client**
   (`…apps.googleusercontent.com`) et un **code secret**.

Pour une application installée, Google considère le code secret comme non confidentiel (la sécurité
vient de PKCE et de la redirection vers `127.0.0.1`) ; on le garde tout de même hors du dépôt.

## Le donner à Zak

- **Sur son ordinateur** : `zak://recordings` → « Partage par Google Drive » → coller l'ID client et
  le code secret → Enregistrer, puis « Connecter Google Drive ». (Ils vont dans `config.json`,
  `tools.record.driveClientId` / `driveClientSecret`.)
- **Dans le build** (pour que chacun n'ait qu'à cliquer « Connecter ») : variables
  `MAIN_VITE_GOOGLE_CLIENT_ID` et `MAIN_VITE_GOOGLE_CLIENT_SECRET` au moment de `npm run build`
  (fichier `.env` local, ignoré par git), ou secrets GitHub `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` pour `release.yml`. Un identifiant collé dans les réglages a priorité.

## Ce que fait Zak

- Connexion : la page Google s'ouvre dans un onglet Zak ; Google renvoie vers un petit serveur que
  Zak ouvre le temps de la connexion sur `127.0.0.1` ; l'onglet se ferme. Le jeton (refresh token) est
  chiffré par le trousseau du système (`google-drive.bin` dans le dossier du profil).
- Envoi : reprenable, par morceaux de 8 Mo (une coupure réseau ne recommence pas tout), dans le
  dossier « Zak » du Drive, puis « toute personne ayant le lien peut lire » (réglable).
- « Ne plus partager » supprime la copie du Drive ; « Déconnecter » efface le jeton et le révoque.
- Zak ne voit que les fichiers qu'il a créés : jamais le reste du Drive.

## Dépannage

| Message | Cause |
|---|---|
| « Accès bloqué : Zak n'a pas terminé la procédure de validation » | Application « En test » et compte absent des utilisateurs test. |
| `redirect_uri_mismatch` | L'identifiant n'est pas de type « Application de bureau ». |
| « Google Drive est déconnecté : reconnectez-le… » | Accès retiré depuis le compte Google, ou jeton expiré (7 jours en mode test). |
