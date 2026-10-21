/* Service worker — Pierrel & Co, portefeuille.
   ------------------------------------------------------------------
   Deux stratégies, pour deux besoins opposés :

   - la PAGE part du réseau d'abord, avec le cache en secours. Une
     application installée sur un écran d'accueil peut rester des mois
     sans être réinstallée : servir la page depuis le cache d'abord
     figerait la version du jour de l'installation.
   - le RESTE (icônes, manifeste) part du cache d'abord : ces fichiers
     ne changent qu'avec une nouvelle version, que `VERSION` chasse.

   Les chiffres du client ne passent jamais par ici : ils vivent dans
   le stockage local du navigateur, que ce fichier ne touche pas. */

const VERSION = 'pierrelco-portefeuille-261020.2033';

/* ===== LE CACHE APPARTIENT A L'ORIGINE, PAS A CE WORKER =====
   `caches` n'est pas cloisonne par la portee du service worker : il
   est commun a toute l'origine. Or une adresse comme
   « compte.github.io » sert UN SITE PAR DEPOT, tous sur la meme
   origine — et le menage d'activation, ecrit « supprime tout ce qui
   n'est pas ma version », effacait donc le cache hors ligne DES
   AUTRES SITES du meme compte a chaque publication de celui-ci.

   Ce n'est pas une fuite, c'est une degradation : le voisin perd son
   mode hors ligne et doit tout retelecharger, sans que rien ne
   paraisse casse. On ne supprime donc plus que ce qui porte notre
   prefixe.

   LA RECIPROQUE N'EST PAS GARANTIE, et il faut le dire : ce menage
   aveugle est le modele que tout le monde recopie. Un site voisin qui
   le garde effacera le notre. De meme, un `localStorage.clear()` chez
   lui emporte le portefeuille, et un worker pose a la RACINE de
   l'origine couvre « /portefeuille/ » par sa portee. La seule
   etancheite reelle entre deux sites est une ORIGINE DISTINCTE —
   c'est-a-dire une autre adresse. Ce fichier limite les degats qu'il
   cause ; il ne peut pas se proteger de ceux qu'il subit. */
const PREFIXE = 'pierrelco-portefeuille-';

const COQUILLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icone.svg',
  './icone-192.png',
  './icone-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(VERSION)
      /* `addAll` échoue en bloc si un seul fichier manque : on pose les
         fichiers un par un pour qu'une icône absente n'empêche pas
         l'installation de la page elle-même. */
      .then(function(c){ return Promise.all(COQUILLE.map(function(u){
        return c.add(u).catch(function(){});
      })); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(noms){
        return Promise.all(noms.map(function(n){
          if (n === VERSION) return null;
          /* Un nom qui n'est pas le notre appartient a un autre site
             de la meme origine : on n'y touche pas. */
          if (n.indexOf(PREFIXE) !== 0) return null;
          return caches.delete(n);
        }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  const req = e.request;
  if (req.method !== 'GET') return;
  /* Rien de ce qui sort du domaine ne passe par le cache : un paiement
     ou une API tierce doit toujours atteindre le réseau. */
  if (new URL(req.url).origin !== self.location.origin) return;

  /* LES TITRES DU JOUR NE SE GARDENT PAS. « actu.json » est le seul
     fichier du site qui change sans que la version change : il est
     reecrit deux fois par jour par la tache planifiee. Servi depuis le
     cache comme les icônes, il serait figé au jour de l'installation
     — exactement le défaut qu'on vient de corriger côté réseau.

     Réseau d'abord, cache en secours : hors ligne, la rubrique montre
     les derniers titres connus plutôt que rien, et c'est le bon
     comportement pour une application installée. */
  if (/\/actu\.json(\?|$)/.test(req.url)){
    /* LA PAGE DEMANDE « actu.json?t=NNNN », ou NNNN est le quart
       d'heure en cours : sans ca, GitHub Pages servirait sa copie
       pendant dix minutes. Mais l'adresse change donc quatre fois par
       heure, et le cache est indexe sur l'adresse ENTIERE.

       Deux defauts en decoulaient, et le commentaire ci-dessus
       promettait le contraire de ce qui se passait :
       — hors ligne, « caches.match(req) » ne retrouvait jamais rien,
         puisque le « t » du moment n'avait jamais ete mis en cache.
         La rubrique tombait sur « {} », c'est-a-dire sur rien.
       — et chaque quart d'heure visite laissait une entree de plus,
         qui ne servirait plus jamais.

       On range donc sous une adresse SANS le « t », et on relit la
       meme. Une seule entree, et elle se retrouve. */
    const CANON = new URL('actu.json', self.location).href;
    e.respondWith(
      fetch(req)
        .then(function(rep){
          if (rep && rep.status === 200){
            const copie = rep.clone();
            caches.open(VERSION).then(function(c){ c.put(CANON, copie); });
          }
          return rep;
        })
        .catch(function(){
          return caches.match(CANON).then(function(r){
            return r || new Response('{}', {headers:{'Content-Type':'application/json'}});
          });
        })
    );
    return;
  }

  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req)
        .then(function(rep){
          /* ON NE GARDE QU'UNE REPONSE QUI VA BIEN. Sans ce test, une
             page d'erreur — 404, 502, une page de maintenance de
             l'hebergeur — etait mise en cache A LA PLACE de
             l'application, et servie ensuite hors ligne a chaque
             ouverture. Les deux autres branches le verifiaient deja ;
             celle-ci, non. */
          if (rep && rep.status === 200){
            const copie = rep.clone();
            caches.open(VERSION).then(function(c){ c.put(req, copie); });
          }
          return rep;
        })
        .catch(function(){
          return caches.match(req).then(function(r){ return r || caches.match('./index.html'); });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function(r){
      return r || fetch(req).then(function(rep){
        if (rep && rep.status === 200 && rep.type === 'basic'){
          const copie = rep.clone();
          caches.open(VERSION).then(function(c){ c.put(req, copie); });
        }
        return rep;
      });
    })
  );
});
