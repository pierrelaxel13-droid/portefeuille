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

     GET /?ids=yh:CW8.PA,yh:AAPL&vs_currencies=eur
     -> {"yh:CW8.PA":{"eur":512.3},"yh:AAPL":{"eur":182.84}}

   Deux sources, deux préfixes :

   - « yh:SYMBOLE » va chez Yahoo Finance. Aucune clé, et il couvre
     Euronext, Xetra, Milan, Londres et les États-Unis. Le symbole
     porte le suffixe de sa place : CW8.PA, IWDA.AS, SAP.DE, AAPL.
   - « tw:SYMBOLE » ou « tw:SYMBOLE:PLACE » va chez Twelve Data, avec
     une clé. Son palier gratuit ne sert que les marchés américains.

   Les montants sont rendus dans la devise demandée, convertis au taux
   du jour — ou absents si le taux manque, jamais convertis au jugé.

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

/* Le numero de version voyage dans CHAQUE reponse.

   Sans lui, « j'ai redeploye » et « je crois avoir redeploye » se
   ressemblent trop : on a passe deux echanges a diagnostiquer un bug
   deja corrige, simplement parce que rien ne disait quelle version
   repondait. Un champ de trop dans la reponse coute moins cher qu'un
   aller-retour de plus. */
const VERSION = '2026-09-21.8';

/* Ni Yahoo ni Stooq ne publient d'API : ce sont des sites web, et ils
   traitent differemment un navigateur et un programme. Un appel sans
   « User-Agent » -- ce que fait Cloudflare par defaut -- se fait
   refouler par le premier (429) et servir une page HTML par le second.
   On se presente donc comme ce qu'on est du point de vue du serveur :
   quelqu'un qui lit une page. */
const ENTETES = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
};

/* Une page d'erreur HTML n'a pas a etre recopiee telle quelle dans un
   message : on en retire le balisage pour ne garder que la phrase,
   qui est la seule chose utile. */
function texteNu(brut, n){
  return String(brut)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n || 160);
}

const AMONT = 'https://api.twelvedata.com';
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const STOOQ = 'https://stooq.com/q/l/';
const RECHERCHE = 'https://query1.finance.yahoo.com/v1/finance/search';
/* Le palier gratuit compte 8 appels par minute et 800 par jour. On
   garde donc les réponses : sans cela, trois visiteurs suffiraient à
   épuiser la journée. */
const FRAICHE = 600;         /* secondes */

function json(corps, etat, origine){
  /* La page ne lit que les cles qu'elle a demandees : un champ de plus
     ne la gene pas, comme « retard » avant lui. */
  if (corps && typeof corps === 'object' && !Array.isArray(corps)){
    corps = Object.assign({}, corps, {relais:VERSION});
  }
  const code = etat || 200;
  /* UNE ERREUR NE SE MET PAS EN CACHE.

     Elle l'etait, dix minutes durant, comme les cours. Consequence :
     apres correction et redeploiement, le navigateur re-servait la
     vieille erreur sans meme appeler le relais -- et on cherchait un
     defaut deja repare. C'est exactement ce qui vient d'arriver, deux
     fois.

     Un cours a une duree de vie ; un message d'echec, non : il dit
     l'etat d'un instant, et cet instant est passe. */
  const cache = code >= 400
    ? 'no-store'
    : 'public, max-age=60';
  return new Response(JSON.stringify(corps), {
    status: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origine || '*',
      'Cache-Control': cache
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

/* Deux sources, deux prefixes.

   « tw: » va chez Twelve Data. Son palier gratuit ne sert en pratique
   que les marches americains : un ETF d'Euronext y repond « This
   symbol is available starting with the Grow plan ».

   « yh: » va chez Yahoo Finance, qui couvre Euronext, Xetra, Milan,
   Londres, sans cle. Ce n'est pas une API publiee : elle peut changer
   sans prevenir, et elle ne promet rien. C'est le prix a payer pour
   ne pas facturer 79 $ par mois a quelqu'un qui suit trois lignes.
   Le README le dit ; on ne le decouvre pas le jour de la panne.

   « yh:CW8.PA »  -> {code, source:'yh', symbole:'CW8.PA'}
   « tw:CW8:XPAR » -> {code, source:'tw', symbole:'CW8', place:'XPAR'} */
function lit(id){
  const p = String(id).split(':');
  /* En MAJUSCULES, toujours. La page range les codes en minuscules au
     moment de la saisie : « yh:CW8.PA » tape par l'utilisateur arrive
     ici en « yh:cw8.pa ». Le meme code marcherait alors a la main et
     echouerait depuis l'application -- l'ecart le plus penible a
     diagnostiquer, parce que les deux essais semblent identiques. */
  if (p[0] === 'yh' && p[1]) return {code:id, source:'yh', symbole:p[1].toUpperCase()};
  if (p[0] === 'st' && p[1]) return {code:id, source:'st', symbole:p[1].toLowerCase()};
  if (p[0] === 'tw' && p[1]) {
    return {code:id, source:'tw', symbole:p[1].toUpperCase(),
            place:(p[2] || '').toUpperCase()};
  }
  return null;
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

/* Yahoo rend une cotation par appel. Un portefeuille compte quelques
   lignes, pas quelques milliers : c'est acceptable, et Cloudflare en
   autorise cent mille par jour. */
async function chezYahoo(symbole){
  let r, texte;
  try {
    r = await fetch(YAHOO + encodeURIComponent(symbole) +
                    '?interval=1d&range=1d',
                    {headers:Object.assign({'Accept':'application/json'}, ENTETES),
                     cf:{cacheTtl:FRAICHE, cacheEverything:true}});
    texte = await r.text();
  } catch (e){
    const err = new Error('reseau');
    err.amont = {statut:0, message:'Yahoo n a pas repondu du tout'};
    throw err;
  }
  /* Yahoo limite par adresse IP, et celles de Cloudflare sont
     partagees entre des milliers de projets : ce refus-la n'est
     souvent pas le fait de l'utilisateur. C'est une attente, pas une
     panne, et ca ne se dit pas pareil. */
  if (r.status === 429){
    const e = new Error('limite'); e.limite = true;
    e.amont = {statut:429, source:'Yahoo',
               message:'Yahoo limite les appels venant de cette machine'};
    throw e;
  }
  let o = null;
  try { o = JSON.parse(texte); } catch (e){}
  const m = o && o.chart && o.chart.result && o.chart.result[0] &&
            o.chart.result[0].meta;
  if (!m){
    const e = new Error('amont');
    const dit = (o && o.chart && o.chart.error && o.chart.error.description) ||
                texteNu(texte, 200) || '(reponse vide)';
    e.amont = {statut:r.status, code:r.status, source:'Yahoo', message:dit};
    throw e;
  }
  let v = parseFloat(m.regularMarketPrice);
  let dev = String(m.currency || '').toUpperCase();
  /* Londres cote en PENCE, pas en livres. « GBp » vaut un centieme de
     « GBP » : le confondre divise ou multiplie un portefeuille par
     cent, en silence. */
  if (String(m.currency) === 'GBp'){ v = v / 100; dev = 'GBP'; }
  if (!isFinite(v) || v <= 0){
    const e = new Error('amont');
    e.amont = {statut:r.status, code:null, source:'Yahoo',
               message:'aucun cours pour ' + symbole};
    throw e;
  }
  return {valeur:v, dev:dev, ouvert:m.marketState === 'REGULAR'};
}

/* ===== Stooq, la source de secours =====
   Yahoo refuse souvent les machines partagees ; Stooq, non. Il rend du
   CSV, une ligne par symbole, et couvre Paris, Francfort, Londres et
   les Etats-Unis. Ses cours sont ceux de la cloture : c'est moins
   frais, et c'est dit.

   Ses symboles ne s'ecrivent pas comme ceux de Yahoo. On traduit les
   suffixes dont on est sur, et on s'abstient pour les autres plutot
   que de deviner -- un symbole devine repond « N/D », ce qui ressemble
   a une panne. */
const VERS_STOOQ = {'.PA':'.fr', '.DE':'.de', '.L':'.uk', '':'.us'};
function versStooq(symboleYahoo){
  const i = String(symboleYahoo).lastIndexOf('.');
  const base = i === -1 ? symboleYahoo : symboleYahoo.slice(0, i);
  const suf = i === -1 ? '' : symboleYahoo.slice(i);
  const t = VERS_STOOQ[suf.toUpperCase()];
  if (t === undefined) return null;
  return (base + t).toLowerCase();
}

async function chezStooq(symbole){
  let r, texte;
  try {
    r = await fetch(STOOQ + '?s=' + encodeURIComponent(symbole) +
                    '&f=sd2t2ohlcv&h&e=csv',
                    {headers:Object.assign({'Accept':'text/csv,text/plain'}, ENTETES),
                     cf:{cacheTtl:FRAICHE, cacheEverything:true}});
    texte = await r.text();
  } catch (e){
    const err = new Error('reseau');
    err.amont = {statut:0, source:'Stooq', message:'Stooq n a pas repondu du tout'};
    throw err;
  }
  if (r.status === 429){
    const e = new Error('limite'); e.limite = true;
    e.amont = {statut:429, source:'Stooq', message:'Stooq limite les appels'};
    throw e;
  }
  /* Deux lignes : l'entete, puis la cotation. « N/D » partout signifie
     que le symbole n'existe pas chez lui. */
  const lignes = String(texte).trim().split(/\r?\n/);
  const cols = (lignes[1] || '').split(',');
  const v = parseFloat(cols[6]);
  if (!isFinite(v) || v <= 0){
    const e = new Error('amont');
    e.amont = {statut:r.status, code:null, source:'Stooq',
               message:'aucun cours pour ' + symbole + ' \u2014 ' +
                       (texteNu(texte, 160) || '(reponse vide)')};
    throw e;
  }
  /* Stooq ne dit pas la devise : elle se deduit de la place. */
  const dev = /\.fr$|\.de$/.test(symbole) ? 'EUR'
            : /\.uk$/.test(symbole) ? 'GBP' : 'USD';
  return {valeur:v, dev:dev, ouvert:false, source:'Stooq'};
}

/* Le taux de change, chez Yahoo aussi : « USDEUR=X ». On ne fait pas
   dependre la bourse europeenne d'une cle Twelve Data que l'utilisateur
   n'a peut-etre pas. */
async function tauxYahoo(de, vers){
  if (de === vers) return 1;
  const r = await chezYahoo(de + vers + '=X');
  return r.valeur;
}

async function prix(codes, devise, env){
  const lus = codes.map(lit).filter(Boolean);
  if (!lus.length) return {prix:{}, retard:null};

  const twelve = lus.filter(function(x){ return x.source === 'tw'; });
  const yh = lus.filter(function(x){ return x.source === 'yh' || x.source === 'st'; });

  /* L'amont veut deux listes parallèles : les symboles, et les places.
     Il faut donc qu'elles s'alignent — un symbole sans place décalerait
     toutes les suivantes, et chacune recevrait le cours de sa voisine.
     On groupe donc par place, et on fait un appel par groupe. En
     pratique un portefeuille tient sur une ou deux places, et le palier
     gratuit compte les APPELS, pas les symboles. */
  const groupes = {};
  twelve.forEach(function(x){
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


  const sortie = {};
  let retard = null;
  const besoins = {};

  /* Yahoo, ligne par ligne. Une ligne qui echoue n'emporte pas les
     autres, comme pour Twelve Data. */
  for (const x of yh){
    let q = null;
    const essais = [];
    /* Yahoo d'abord : plus frais, et il couvre plus de places. Stooq
       ensuite, s'il sait traduire le symbole. On ne s'arrete donc pas
       au premier refus -- c'est tout l'interet d'avoir deux portes. */
    const portes = [function(){ return chezYahoo(x.symbole); }];
    const sy = x.source === 'st' ? x.symbole : versStooq(x.symbole);
    if (x.source === 'st') portes.length = 0;
    if (sy) portes.push(function(){ return chezStooq(sy); });

    for (const porte of portes){
      try { q = await porte(); break; }
      catch (e){ essais.push((e && e.amont) || {message:String(e && e.message)}); }
    }
    if (q){
      besoins[q.dev] = 1;
      sortie[x.code] = {brut:q.valeur, dev:q.dev, yahoo:true};
      if (!q.ouvert) retard = 'cloture';
      else if (retard === null) retard = 'differe';
    } else {
      /* Aucune porte n'a ouvert : on garde ce que CHACUNE a dit. Un
         seul message ferait accuser la mauvaise source. */
      const e = new Error('amont');
      e.amont = {statut:0, code:null, symbole:x.code, essais:essais,
                 message:essais.map(function(a){
                   return (a.source || '?') + ' : ' + a.message;
                 }).join(' | ')};
      soucis.push(e);
    }
  }

  twelve.forEach(function(x){
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

  /* Rien du tout, et une raison sous la main : on la donne plutot
     qu'une reponse vide, qui laisserait croire a des symboles justes. */
  if (!Object.keys(sortie).length && soucis.length) throw soucis[0];

  const cible = String(devise).toUpperCase();
  const taux_ = {};
  /* Le taux vient de la meme maison que le cours : sans cle Twelve
     Data, une ligne Yahoo doit quand meme pouvoir se convertir. */
  const parYahoo = Object.keys(sortie).some(function(c){ return sortie[c].yahoo; });
  for (const d of Object.keys(besoins)){
    try {
      taux_[d] = (parYahoo || !cleAmont(env))
        ? await tauxYahoo(d, cible)
        : await taux(d, cible, env);
    } catch (e){ taux_[d] = null; }
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

/* ===== Chercher un titre par son nom =====
   Sans ca, il faut connaitre « CW8.PA » avant d'ouvrir la page -- ce
   qui revient a demander la reponse pour poser la question. On rend
   donc les candidats, avec leur place de cotation : c'est le seul
   moyen de choisir entre les cinq lignes du meme fonds, cotees dans
   cinq pays et deux devises.

   On ne choisit PAS a la place de l'utilisateur. Prendre le premier
   resultat attacherait un jour la cotation de Milan a un portefeuille
   parisien, sans que rien ne le signale. */
async function cherche(q){
  let r, texte;
  try {
    r = await fetch(RECHERCHE + '?q=' + encodeURIComponent(q) +
                    '&quotesCount=10&newsCount=0',
                    {headers:Object.assign({'Accept':'application/json'}, ENTETES),
                     cf:{cacheTtl:3600, cacheEverything:true}});
    texte = await r.text();
  } catch (e){
    const err = new Error('reseau');
    err.amont = {statut:0, source:'Yahoo', message:'la recherche n a pas repondu'};
    throw err;
  }
  if (r.status === 429){
    const e = new Error('limite'); e.limite = true;
    e.amont = {statut:429, source:'Yahoo', message:'Yahoo limite les recherches'};
    throw e;
  }
  let o = null;
  try { o = JSON.parse(texte); } catch (e){}
  if (!o || !Array.isArray(o.quotes)){
    const e = new Error('amont');
    e.amont = {statut:r.status, source:'Yahoo', message:texteNu(texte, 160)};
    throw e;
  }
  const GARDE = {EQUITY:1, ETF:1, MUTUALFUND:1, INDEX:1};
  return o.quotes
    .filter(function(x){ return x && x.symbol && GARDE[x.quoteType]; })
    .slice(0, 8)
    .map(function(x){
      return {
        code: 'yh:' + x.symbol,
        nom: x.longname || x.shortname || x.symbol,
        place: x.exchDisp || x.exchange || '',
        genre: x.typeDisp || x.quoteType || ''
      };
    });
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

    const u = new URL(req.url);

    /* Recherche par nom : « ?cherche=amundi msci world ». */
    const q = (u.searchParams.get('cherche') || '').trim();
    if (q){
      if (q.length < 2) return json({resultats:[]}, 200, origine);
      try {
        return json({resultats: await cherche(q)}, 200, origine);
      } catch (e){
        if (e && e.limite) return json({erreur:'limite', resultats:[]}, 429, origine);
        return json({erreur:'recherche impossible',
                     amont:(e && e.amont) || null, resultats:[]}, 502, origine);
      }
    }

    const ids = (u.searchParams.get('ids') || '').split(',')
      .map(function(x){ return x.trim(); }).filter(Boolean);
    const devise = (u.searchParams.get('vs_currencies') || 'eur').toLowerCase();
    if (!ids.length) return json({}, 200, origine);

    /* Plus de 40 codes d'un coup, c'est un appel qui n'est pas le fait
       d'un portefeuille : on borne plutôt que de payer pour lui. */
    if (ids.length > 40) return json({erreur:'trop de codes'}, 400, origine);

    /* La cle n'est exigee que si l'on s'adresse a Twelve Data. Les
       codes « yh: » n'en ont pas besoin, et reclamer une cle pour eux
       ferait croire a un relais mal installe. */
    if (!cleAmont(env) && ids.some(function(i){ return /^tw:/.test(i); })){
      return json({
        erreur:'cle absente',
        quoi:'Les codes « tw: » passent par twelvedata.com et demandent ' +
             'une variable TWELVEDATA, de type Secret. Les codes « yh: » ' +
             'n en ont pas besoin.'
      }, 500, origine);
    }

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
