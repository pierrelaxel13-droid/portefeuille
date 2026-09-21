# Relais de cours — mode d'emploi

Ce dossier contient un petit serveur à installer une fois. Il sert à
une seule chose : donner à votre page le cours de vos actions et de vos
ETF, sans que la clé de votre compte se retrouve publique.

## Pourquoi il faut ça

Le cours d'une crypto est une donnée libre : n'importe qui peut la
demander, la page le fait déjà toute seule. Le cours d'une action ou
d'un ETF, non — les bourses le vendent. Tous les fournisseurs, même
gratuits, exigent donc une clé de compte.

Et une clé posée dans une page web est une clé publique : il suffit
d'afficher le code source pour la lire, et de s'en servir à votre
place jusqu'à épuiser votre quota.

Ce relais garde la clé de son côté. La page lui demande des prix, il
interroge le fournisseur, il renvoie les prix. La clé ne bouge pas.

## Ce que ça coûte

Rien, aux volumes d'un portefeuille personnel :

- **Cloudflare Workers** — 100 000 appels par jour sur l'offre gratuite.
- **Twelve Data** — 800 appels par jour, 8 par minute, gratuitement.

Le relais garde ses réponses dix minutes, donc une page ouverte toute
la journée consomme quelques dizaines d'appels, pas des centaines.

## Installation — tout se fait dans le navigateur

Pas de ligne de commande, pas de logiciel à installer, pas de carte
bancaire. Comptez dix minutes.

### 1. La clé du fournisseur de cours — facultative

**Sautez cette étape si vos lignes sont européennes.** Les codes `yh:`
(voir plus bas) ne demandent aucune clé, et couvrent Euronext, Xetra,
Milan, Londres et les États-Unis. La clé ne sert qu'aux codes `tw:`.


Allez sur **twelvedata.com** et créez un compte gratuit. Une fois
connecté, la clé s'affiche dans **API Key** (ou *Dashboard → API Key*).
C'est une longue suite de lettres et de chiffres. Copiez-la et gardez-la
de côté : vous la collerez à l'étape 4.

Cette clé est un mot de passe. Ne la mettez nulle part ailleurs qu'à
l'étape 4.

### 2. Le compte Cloudflare

Allez sur **cloudflare.com**, cliquez **Sign up**, créez un compte
gratuit et confirmez votre adresse e-mail. L'offre gratuite des Workers
ne demande aucun moyen de paiement.

### 3. Créer le relais

Dans le menu de gauche, ouvrez **Workers & Pages** (parfois nommé
*Compute*), puis **Create** → **Workers** → **Create Worker**.

Donnez-lui un nom, par exemple `relais-cours`, et cliquez **Deploy**.
Cloudflare crée un worker d'exemple qui dit « Hello World » — c'est
normal, on va le remplacer.

Cliquez ensuite **Edit code** (ou *Continue to project* puis *Edit
code*). Un éditeur s'ouvre avec quelques lignes dedans :

1. cliquez dans l'éditeur, sélectionnez **tout** (Ctrl+A, ou Cmd+A sur
   Mac) et supprimez ;
2. ouvrez `worker.js` de ce dossier, copiez **tout** son contenu, et
   collez-le à la place ;
3. cliquez **Deploy**.

En haut de la page, Cloudflare affiche l'adresse du relais, de la
forme `https://relais-cours.VOTRE-NOM.workers.dev`. **Copiez-la**, elle
servira à l'étape 5.

### 4. Poser la clé, et dire qui a le droit d'appeler

Toujours sur la page du worker, allez dans **Settings** → **Variables
and Secrets** (ou *Variables*).

**Attention au vocabulaire.** Le tableau de bord, en français, appelle
**« Clé »** le champ du *nom* de la variable — au sens clé/valeur. Ce
n'est pas là que va votre clé d'API. Lisez ces deux champs comme :

- **Clé** = le nom de la variable (`TWELVEDATA`, `ORIGINES`)
- **Valeur** = ce qu'elle contient

Ajoutez **deux** entrées. Tapez les noms à la main : les copier depuis
un texte emporte souvent un caractère parasite, et Cloudflare répond
alors *« Le nom de la variable doit commencer par une lettre »*.

**Première entrée — votre clé d'API**

- Clé (le nom) : `TWELVEDATA`
- Valeur : la clé copiée à l'étape 1
- Cochez **Secret** : Cloudflare la chiffre, et elle cesse d'être
  lisible, même par vous. C'est voulu — une clé qu'on peut relire est
  une clé qui peut fuir.

**Seconde entrée — qui a le droit d'appeler**

- Clé (le nom) : `ORIGINES`
- Valeur : l'adresse de votre site, par exemple
  `https://pierrelaxel13-droid.github.io`
- Ne cochez **pas** Secret : ce n'en est pas un.

Sans `ORIGINES`, le relais est ouvert à tous : votre quota devient
celui de tout le monde.

Si un champ contient déjà quelque chose, videz-le entièrement (clic
dedans, Ctrl+A, Suppr) avant de retaper.

Enregistrez (**Save**, puis **Deploy** si le bouton apparaît).

### 5. Vérifier que ça répond

Ouvrez cette adresse dans votre navigateur, en remplaçant le début par
l'adresse de l'étape 3 :

```
https://relais-cours.VOTRE-NOM.workers.dev/?ids=tw:CW8:XPAR&vs_currencies=eur
```

Vous devez lire quelque chose comme :

```
{"yh:CW8.PA":{"eur":512.3},"retard":"differe","relais":"2026-09-21.4"}
```

Le champ **`relais`** dit quelle version du code a répondu. Si vous
venez de coller une nouvelle version et que ce numéro ne change pas,
c'est que **Déployer** n'a pas été cliqué — la seule cause possible.

Si c'est le cas, le relais fonctionne. Sinon, voyez le tableau des
pannes plus bas — le message vous dit lequel des quatre points a été
manqué.

### 6. Brancher la page

Dans l'espace client : **menu** (les trois points, en haut à droite) →
**« Relais pour la bourse… »**. Collez l'adresse de l'étape 3, validez.

Les cours de bourse passent désormais par lui.

## Les codes de vos lignes

Le code se saisit dans le champ **« Code du cours »**, au même endroit
que `bitcoin` ou `pax-gold`.

### Le cas courant : `yh:`

```
yh:CW8.PA        un ETF coté à Paris
yh:IWDA.AS       un ETF coté à Amsterdam
yh:AAPL          une action américaine
```

Le symbole, puis un suffixe pour la place :

- Paris (Euronext) — `.PA`
- Amsterdam — `.AS`
- Bruxelles — `.BR`
- Francfort (Xetra) — `.DE`
- Milan — `.MI`
- Londres — `.L`
- New York, Nasdaq — aucun suffixe

`yh:` **ne demande aucune clé**. C'est la source à utiliser pour tout
ce qui est européen.

Pour trouver le bon symbole : cherchez votre ETF sur
`finance.yahoo.com` et recopiez ce qui s'affiche en haut de sa fiche.

### L'autre : `tw:`

```
tw:AAPL          une action américaine
tw:MSFT:XNAS     avec la place de cotation, si besoin
```

`tw:` passe par twelvedata.com et demande la variable `TWELVEDATA`.
**Son offre gratuite ne couvre pas les bourses européennes** : un ETF
d'Euronext y répond *« This symbol is available starting with the Grow
plan »*, une offre à plusieurs dizaines d'euros par mois.

Il reste utile pour les valeurs américaines. Mais si vous n'avez pas de
clé, ne vous en occupez pas : `yh:` suffit, et l'étape 4 se réduit à
`ORIGINES`.

## Si vous préférez la ligne de commande

Le même relais se déploie en trois commandes, depuis ce dossier :

```
npm install -g wrangler
wrangler login
wrangler deploy
wrangler secret put TWELVEDATA
```

`ORIGINES` se règle alors dans `wrangler.toml`, et un `wrangler deploy`
de plus le prend en compte. La clé, elle, ne va **jamais** dans un
fichier : ce dossier est versionné.

## Le vérifier avant de le déployer

```
node test.mjs
```

Le test exécute le relais face à un faux fournisseur : pas de clé, pas
de réseau. Il vérifie que la clé ne sort jamais dans la réponse, que
les cryptos ne déclenchent aucun appel, qu'un symbole inconnu n'emporte
pas les autres, qu'une origine non déclarée est refusée, et qu'un cours
coté en dollars est bien converti — ou absent si le taux manque, plutôt
que faux.

## Ce que ce relais ne fait pas

**Il ne donne pas le temps réel.** Les offres gratuites servent des
cours différés — souvent d'un quart d'heure, parfois la clôture de la
veille. Le relais le signale, et la page l'écrit sous vos montants :
*« cours de bourse différé, pas du direct »*. Un chiffre différé annoncé
comme tel est utilisable ; annoncé comme du direct, il est faux.

**`yh:` ne repose sur aucune API publiée.** Yahoo ne documente pas
cette adresse et ne promet rien : elle peut changer de forme, ou cesser
de répondre, sans préavis. C'est le prix à payer pour ne pas facturer
plusieurs dizaines d'euros par mois à quelqu'un qui suit trois lignes —
mais il faut le savoir avant la panne, pas le jour où elle arrive. Si
elle survient, la page ne se casse pas : elle garde vos derniers
montants et dit qu'elle n'a pas eu les cours.

**Il ne touche pas à vos chiffres.** Il ne voit ni vos montants, ni vos
quantités, ni votre historique : uniquement la liste des symboles dont
la page veut le prix. Tout le reste ne quitte pas votre navigateur.

## Si ça ne marche pas

| Ce que vous voyez | Ce qu'il faut regarder |
|---|---|
| `{"erreur":"cle absente"}` | Vous utilisez un code `tw:` sans avoir posé `TWELVEDATA`. Passez en `yh:`, qui n'a besoin de rien. |
| `available starting with the Grow plan` | Twelve Data ne sert pas cette bourse gratuitement. Utilisez `yh:` à la place. |
| `No data found, symbol may be delisted` | Le symbole Yahoo est faux. Cherchez-le sur `finance.yahoo.com` et recopiez-le exactement. |
| `{"erreur":"origine non autorisee"}` | `ORIGINES` ne contient pas l'adresse de votre site. Depuis la barre d'adresse du navigateur, cette erreur ne doit PAS apparaître — si elle apparaît, `ORIGINES` est vide ou mal recopié. |
| `{"erreur":"limite"}` | Le quota du fournisseur est atteint. Attendez une minute. |
| `{"erreur":"le fournisseur a refuse", ...}` | La réponse contient `amont.message` : c'est le fournisseur qui parle, mot pour mot, et `quoi` dit la suite. Un message parlant de `API key` signifie que `TWELVEDATA` est absente, périmée ou mal recopiée. |
| `{}` tout court | Le symbole n'est pas reconnu. Vérifiez le code : symbole et place, tels que le fournisseur les nomme. |
| « Hello World » | L'étape 3 s'est arrêtée avant le collage du code. |
| Dans la page : aucun fournisseur n'a répondu | L'adresse collée à l'étape 6 n'est pas celle de l'étape 3. |

Pour voir ce que répond le relais, ouvrez directement dans un
navigateur :

```
https://VOTRE-RELAIS.workers.dev/?ids=yh:CW8.PA&vs_currencies=eur
```

Vous devez lire quelque chose comme
`{"tw:CW8:XPAR":{"eur":512.3},"retard":"differe"}`.
