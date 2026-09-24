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

const VERSION = 'pierrelco-portefeuille-260924.1936';
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
          return n === VERSION ? null : caches.delete(n);
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

  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req)
        .then(function(rep){
          const copie = rep.clone();
          caches.open(VERSION).then(function(c){ c.put(req, copie); });
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
