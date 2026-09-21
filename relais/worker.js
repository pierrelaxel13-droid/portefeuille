/* Relais de cours — Pierrel & Co.
   ==================================================================
   Pourquoi ce fichier existe
   ------------------------------------------------------------------
   Le cours d'une action ou d'un ETF n'est pas une donnée libre : les
   bourses la vendent. Tous les fournisseurs gratuits demandent donc
   une clé de compte — et une clé posée dans une page web est une clé
   publique, que n'importe qui lit dans le code source.

   Ce relais tient la clé de son côté. La page lui demande des prix,
   il interroge le fournisseur, et ne renvoie que les prix. La clé ne
   quitte jamais ce serveur.

   Ce qu'il rend
   ------------------------------------------------------------------
   Exactement la forme que la page attend de ses autres fournisseurs :

     GET /?ids=tw:CW8:XPAR,tw:AAPL&vs_currencies=eur
     -> {"tw:CW8:XPAR":{"eur":512.3},"tw:AAPL":{"eur":198.74}}

   Un code se lit « tw:SYMBOLE » ou « tw:SYMBOLE:PLACE ». La place
   (XPAR pour Paris, XETR pour Francfort, XAMS pour Amsterdam…) lève
   l'ambiguïté quand le même symbole est coté à plusieurs endroits.

   Les codes qui ne commencent pas par « tw: » sont ignorés en
   silence : ce sont des cryptos, que la page ira chercher ailleurs.
   Le relais ne prétend pas savoir ce qu'il ne sait pas.

   Ce qu'il ne fait pas
   ------------------------------------------------------------------
   Il ne donne pas le temps réel. Les paliers gratuits servent des
   cours différés — souvent d'un quart d'heure, parfois de la veille
   en clôture. Le relais le dit dans sa réponse (champ « retard »),
   et la page l'affiche. Un chiffre différé annoncé comme tel est
   utilisable ; annoncé comme du direct, il est faux. */

const AMONT = 'https://api.twelvedata.com';
const PREFIXE = 'tw:';
/* Le palier gratuit compte 8 appels par minute et 800 par jour. On
   garde donc les réponses : sans cela, trois visiteurs suffiraient à
   épuiser la journée. */
const FRAICHE = 600;         /* secondes */

function json(corps, etat, origine){
  return new Response(JSON.stringify(corps), {
    status: etat || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origine || '*',
      'Cache-Control': 'public, max-age=' + FRAICHE
    }
  });
}

/* Seuls les sites déclarés peuvent appeler ce relais. Sans ce garde,
   la clé serait protégée mais le quota, lui, serait à tout le monde. */
function origineAutorisee(req, env){
  const o = req.headers.get('Origin');
  const permis = String(env.ORIGINES || '').split(',')
    .map(function(x){ return x.trim(); }).filter(Boolean);
  if (!permis.length) return '*';          /* rien de déclaré : ouvert */
  if (!o) return permis[0];                /* appel hors navigateur */
  return permis.indexOf(o) === -1 ? null : o;
}

/* « tw:CW8:XPAR » -> {code, symbole, place} */
function lit(id){
  const p = String(id).split(':');
  if (p[0] !== 'tw' || !p[1]) return null;
  return {code:id, symbole:p[1].toUpperCase(), place:(p[2] || '').toUpperCase()};
}

/* Le nom de la variable qui porte la cle du fournisseur.

   Elle s'appelait « CLE ». Mauvais nom : le tableau de bord de
   Cloudflare, en francais, intitule « Cle » le champ du NOM de la
   variable — au sens cle/valeur. Une variable NOMMEE « CLE » invitait
   donc a coller la cle d'API dans le champ du nom, ce qui est
   precisement l'erreur commise a l'installation.

   « TWELVEDATA » ne se confond avec rien. L'ancien nom reste accepte
   pour ceux qui l'ont deja pose. */
function cleAmont(env){
  return env.TWELVEDATA || env.CLE || '';
}

/* Rien de ce qui sort d'ici ne doit contenir la cle. Elle voyage dans
   l'URL qu'on construit, et un message d'erreur qui la recopierait la
   publierait aussitot -- y compris dans la capture d'ecran que
   quelqu'un enverra pour demander de l'aide. */
function sansCle(texte, env){
  const c = cleAmont(env);
  if (!c) return texte;
  return String(texte).split(c).join('***');
}

async function amont(chemin, params, env){
  const u = new URL(AMONT + chemin);
  Object.keys(params).forEach(function(k){
    if (params[k]) u.searchParams.set(k, params[k]);
  });
  u.searchParams.set('apikey', cleAmont(env));

  let r, texte;
  try {
    r = await fetch(u.toString(), {cf:{cacheTtl:FRAICHE, cacheEverything:true}});
    texte = await r.text();
  } catch (e){
    /* La seule vraie « injoignable » : le reseau n'a pas abouti. */
    const err = new Error('reseau');
    err.amont = {statut:0, message:'le fournisseur n a pas repondu du tout'};
    throw err;
  }

  let o = null;
  try { o = JSON.parse(texte); } catch (e){}

  /* Twelve Data signale ses refus de deux facons : par le code HTTP,
     ou par un corps « status: error » rendu avec un 200. Les deux
     comptent, sinon une cle refusee passerait pour une reponse vide. */
  if (r.status === 429 || (o && o.code === 429)){
    const e = new Error('limite'); e.limite = true; throw e;
  }
  if (!r.ok || (o && o.status === 'error')){
    const e = new Error('amont');
    /* On repete ce que le fournisseur a dit, mot pour mot. Un message
       vague fait chercher au hasard ; celui-ci nomme la cause. */
    e.amont = {
      statut: r.status,
      code: (o && o.code) || null,
      message: sansCle((o && o.message) || texte.slice(0, 300) || '(reponse vide)', env)
    };
    throw e;
  }
  return o;
}

/* Le taux de change, quand l'instrument n'est pas coté dans la devise
   demandée. Un seul appel par couple, et gardé comme le reste. */
async function taux(de, vers, env){
  if (de === vers) return 1;
  const o = await amont('/exchange_rate', {symbol:de + '/' + vers}, env);
  const v = parseFloat(o && o.rate);
  if (!isFinite(v) || v <= 0) throw new Error('taux ' + de + '/' + vers);
  return v;
}

async function prix(codes, devise, env){
  const lus = codes.map(lit).filter(Boolean);
  if (!lus.length) return {prix:{}, retard:null};

  /* L'amont veut deux listes parallèles : les symboles, et les places.
     Il faut donc qu'elles s'alignent — un symbole sans place décalerait
     toutes les suivantes, et chacune recevrait le cours de sa voisine.
     On groupe donc par place, et on fait un appel par groupe. En
     pratique un portefeuille tient sur une ou deux places, et le palier
     gratuit compte les APPELS, pas les symboles. */
  const groupes = {};
  lus.forEach(function(x){
    (groupes[x.place] = groupes[x.place] || []).push(x);
  });

  const par = {};
  /* Un groupe qui échoue ne doit pas emporter les autres : un symbole
     mal orthographié ne rend pas le reste du portefeuille illisible.
     Mais une clé refusée, elle, condamne tout — la taire ferait
     chercher du côté des symboles pendant des heures. On distingue
     donc les deux, au lieu de traiter toute erreur pareil. */
  const soucis = [];
  function fatale(e){
    if (e && e.limite) return true;
    const d = (e && e.amont) || {};
    return d.statut === 0 || d.statut === 401 || d.statut === 403 ||
           d.code === 401 || d.code === 403;
  }
  for (const place of Object.keys(groupes)){
    const g = groupes[place];
    let rep;
    try {
      rep = await amont('/quote', {
        symbol: g.map(function(x){ return x.symbole; }).join(','),
        mic_code: place || null
      }, env);
    } catch (e){
      if (fatale(e)) throw e;
      soucis.push(e);
      continue;
    }
    /* Un seul symbole : l'amont rend l'objet nu. Plusieurs : un objet
       indexé par symbole. On ramène les deux à la même forme. */
    if (g.length === 1) par[g[0].code] = rep;
    else g.forEach(function(x){ par[x.code] = rep && rep[x.symbole]; });
  }
  /* Rien trouvé du tout, et une raison sous la main : on la donne. Une
     réponse vide laisserait croire que les symboles sont justes et que
     le fournisseur n'a rien. */
  if (!Object.keys(par).length && soucis.length) throw soucis[0];

  const sortie = {};
  let retard = null;
  const besoins = {};
  lus.forEach(function(x){
    const q = par[x.code];
    if (!q || q.status === 'error') return;
    const v = parseFloat(q.close != null ? q.close : q.price);
    if (!isFinite(v) || v <= 0) return;
    const dev = String(q.currency || devise).toUpperCase();
    besoins[dev] = 1;
    sortie[x.code] = {brut:v, dev:dev};
    /* « is_market_open » à faux signifie un cours de clôture, pas un
       cours du moment. On le remonte plutôt que de le taire. */
    if (q.is_market_open === false) retard = 'cloture';
    else if (retard === null) retard = 'differe';
  });

  const cible = String(devise).toUpperCase();
  const taux_ = {};
  for (const d of Object.keys(besoins)){
    try { taux_[d] = await taux(d, cible, env); }
    catch (e){ taux_[d] = null; }
  }

  const fini = {};
  Object.keys(sortie).forEach(function(c){
    const t = taux_[sortie[c].dev];
    /* Pas de taux : on n'invente pas une conversion. La ligne reste
       absente, et la page dira qu'elle n'a pas eu ce cours. */
    if (t === null || t === undefined) return;
    const o = {};
    o[String(devise).toLowerCase()] = Math.round(sortie[c].brut * t * 1e6) / 1e6;
    fini[c] = o;
  });
  return {prix:fini, retard:retard};
}

export default {
  async fetch(req, env){
    const origine = origineAutorisee(req, env);
    if (origine === null) return json({erreur:'origine non autorisee'}, 403, '*');

    if (req.method === 'OPTIONS'){
      return new Response(null, {status:204, headers:{
        'Access-Control-Allow-Origin': origine,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400'
      }});
    }
    if (req.method !== 'GET') return json({erreur:'methode'}, 405, origine);
    if (!cleAmont(env)) return json({
      erreur:'cle absente',
      quoi:'Ajoutez une variable nommee TWELVEDATA, de type Secret, ' +
           'dont la valeur est la cle de votre compte twelvedata.com.'
    }, 500, origine);

    const u = new URL(req.url);
    const ids = (u.searchParams.get('ids') || '').split(',')
      .map(function(x){ return x.trim(); }).filter(Boolean);
    const devise = (u.searchParams.get('vs_currencies') || 'eur').toLowerCase();
    if (!ids.length) return json({}, 200, origine);

    /* Plus de 40 codes d'un coup, c'est un appel qui n'est pas le fait
       d'un portefeuille : on borne plutôt que de payer pour lui. */
    if (ids.length > 40) return json({erreur:'trop de codes'}, 400, origine);

    try {
      const r = await prix(ids, devise, env);
      const corps = r.prix;
      if (r.retard) corps.retard = r.retard;
      return json(corps, 200, origine);
    } catch (e){
      if (e && e.limite) return json({
        erreur:'limite',
        quoi:'Le fournisseur refuse pour trop d appels. Attendez une minute.'
      }, 429, origine);
      const d = (e && e.amont) || {message:String((e && e.message) || e)};
      return json({
        erreur:'le fournisseur a refuse',
        /* Ce que LUI a dit, sans interpretation de ma part. */
        amont:d,
        quoi: d.code === 401 || /api ?key|apikey/i.test(d.message || '')
          ? 'La cle est refusee. Verifiez la variable TWELVEDATA : sa valeur ' +
            'doit etre la cle actuelle de twelvedata.com, sans espace autour.'
          : 'Regardez le message ci-dessus : il vient du fournisseur, pas du relais.'
      }, 502, origine);
    }
  }
};
