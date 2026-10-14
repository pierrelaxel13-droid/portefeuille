# Pierrel & Co — portefeuille

Export autonome de l'espace « portefeuille » : une page unique, installable
sur un téléphone, qui fonctionne sans réseau une fois ouverte.

> **En cours.** `index.html` est une copie de l'artifact à un instant donné.
> Tant que la page évolue, c'est l'artifact qui fait foi : cette copie est
> régénérée à partir de lui, elle ne se modifie pas à la main.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | toute l'application : styles, scripts et contenu dans un seul fichier |
| `manifest.webmanifest` | nom, icône et affichage plein écran une fois installée |
| `sw.js` | service worker : la page reste utilisable hors réseau |
| `icone.svg`, `icone-*.png` | icônes, dont une « maskable » pour Android |
| `ange.jpg` | l'œuvre du premier écran, gardée comme fichier source : la page l'embarque désormais en base64 et ne la demande plus |
| `actu.json` | les titres du jour, réécrits deux fois par jour par la tâche planifiée |
| `actu/actu.mjs` | le lecteur de flux : sans dépendance, `node actu/actu.mjs > actu.json` |
| `.github/workflows/actu.yml` | la tâche qui le fait tourner chez GitHub et valide le fichier s'il a changé |

Aucune dépendance, aucun outil de compilation, aucun appel à un tiers
depuis la page.

## Les titres du jour

Un navigateur ne peut pas lire le flux d'un journal : le journal refuse
les appels venus d'une autre origine. La page connaît trois
intermédiaires et prend le premier qui répond — `/api/actu` pour qui
héberge chez soi, **`actu.json` déposé ici par la tâche planifiée**, et
le relais Cloudflare en dernier.

La deuxième voie n'a aucune condition : le fichier arrive avec le site.
La tâche tourne chez GitHub, deux fois par jour, et ne valide le fichier
que s'il a changé.

- **Changer les sources** : Settings → Secrets and variables → Actions
  → Variables → `ACTU_FLUX`, au format `Nom|adresse`, séparés par des
  virgules. Par défaut : France Info (économie), Banque de France, INSEE.
  **Vérifiez les conditions d'utilisation de chaque flux avant de
  l'ajouter.**
- **Ce qui est repris** : le titre, le lien, la source et la date. Jamais
  le texte d'un article, jamais une image. Un titre sans lien n'est pas
  affiché.
- **Si aucune source ne répond**, la tâche échoue exprès : l'ancien
  fichier reste en place et une croix rouge apparaît. Sans cela, une
  adresse qui change laisserait la rubrique répéter les titres
  d'avant-hier pendant des mois.
- **GitHub désactive une tâche planifiée** après soixante jours sans
  activité dans le dépôt, et prévient par courriel. Un « Run
  workflow » suffit à la relancer.

## Mettre en ligne

N'importe quel hébergement de fichiers statiques convient, à deux
conditions : **HTTPS** et les fichiers servis **à la racine du dossier**
(le service worker ne couvre que son propre répertoire).

- **Netlify / Vercel** — déposer le dossier, ou connecter le dépôt en
  indiquant `portefeuille/` comme répertoire publié.
- **GitHub Pages** — activer Pages sur la branche. Dans un dépôt dédié à
  cette page, elle est servie à la racine ; dans un sous-dossier d'un dépôt
  plus large, sous le chemin de ce dossier.
- **Hébergeur classique** — copier le dossier par FTP.

Ouvrir le fichier en `file://` fonctionne aussi, mais sans service worker :
les navigateurs le refusent hors HTTP(S).

## Installer sur un téléphone

- **Android / Chrome** — menu ⋮ → « Installer l'application ».
- **iOS / Safari** — Partager → « Sur l'écran d'accueil ».

L'application s'ouvre alors sans barre d'adresse, avec son icône.

## Où vivent les chiffres

Dans le **stockage local du navigateur**, sur l'appareil. Rien n'est envoyé
nulle part, et il n'y a pas de serveur. Conséquences à connaître :

- vider les données du navigateur efface le portefeuille ;
- rien ne suit d'un appareil à l'autre ;
- la sauvegarde passe par **Exporter** (formules Pro et Max), qui produit un
  fichier contenant les actifs **et** l'historique des relevés.

## Brancher le paiement

Dans `index.html`, deux constantes :

```js
const STRIPE_CLE_PUBLIABLE = '';        // clé pk_ ; vide = paiement éteint
const API_ABONNEMENT = '/api/abonnement';
```

Tant que la clé est vide, « Souscrire » ouvre un e-mail vers l'adresse de
contact et l'accès s'ouvre à la main. Renseigner une clé `pk_` suppose un
serveur en face sur `API_ABONNEMENT` : le paiement se crée côté serveur,
jamais dans la page. **Ne jamais mettre ici une clé `sk_`** — elle est
lisible par tout visiteur.

## Ce qui demande encore un serveur

Cet export est un site complet et une application installable. Il ne fait
pas de lui un service payant : la connexion accepte n'importe quelle
adresse, et les formules Normal / Pro / Max se choisissent librement dans
l'interface. Faire payer suppose des comptes, une base de données et un
statut d'abonnement décidés **hors de la page**.
