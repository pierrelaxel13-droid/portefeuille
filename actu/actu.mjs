/* ============================================================
   LES TITRES DU JOUR, ECRITS A COTE DU SITE

   LE PROBLEME. Un navigateur ne peut pas lire le flux d'un journal :
   le journal refuse les appels venus d'une autre origine, et c'est son
   droit. Il faut donc quelqu'un entre les deux. Le relais Cloudflare
   sait le faire — mais il faut l'avoir deploye, et tant qu'il ne l'est
   pas la rubrique « La presse » reste muette sur le site publie.

   CE PROGRAMME ENLEVE CETTE CONDITION. Il tourne chez GitHub, sur la
   machine qui construit le site, lit les flux, et depose le resultat
   dans un fichier « actu.json » a cote de « index.html ». La page le
   lit alors en MEME ORIGINE : aucune permission a demander, aucun
   service a maintenir, aucun quota a surveiller. Le jour ou le relais
   sera en ligne, il reprendra la main — la page essaie les deux, et
   le premier qui repond gagne.

   CE QU'IL NE PREND PAS. Le titre, le lien, la source et la date.
   Jamais le texte de l'article, jamais une image : on renvoie chez
   celui qui a ecrit, on ne le recopie pas.

   Il n'a aucune dependance : « node actu.mjs > actu.json ».
   ============================================================ */

/* ===== TROIS SOURCES, ET ELLES SONT MESUREES =====
   La premiere liste etait choisie sur l'intention — France Info, la
   Banque de France, l'INSEE — et deux des trois ne repondaient pas.
   Celle-ci est choisie sur un RELEVE, fait le 14 octobre 2026 depuis
   la machine qui fait tourner la tache (voir README).

   Ce qui en est sorti, et qui vaut d'etre su : les institutions
   publiques francaises ont pour la plupart cesse de publier un flux.
   Service-public, l'economie.gouv, la Banque de France, l'INSEE et
   l'AMF repondent toutes — et aucune n'annonce de flux sur sa page.
   Ce n'est pas une panne de ce programme, c'est l'etat du web.

   « Capital » est donne par sa PAGE et non par son flux : l'adresse
   du flux est chez un sous-traitant et peut changer, la page non.
   C'est elle qui dit ou il est, et le programme la suit.

   La liste se change sans toucher au programme : ACTU_FLUX,
   « Nom|adresse », separes par des virgules. */
const DEFAUT = [
  'France Info|https://www.francetvinfo.fr/economie.rss',
  'Le Monde|https://www.lemonde.fr/economie/rss_full.xml',
  'Capital|https://www.capital.fr'
].join(',');

const PAR_FLUX = 5;      /* une rubrique n'est pas une archive */
const TOTAL    = 12;
const DELAI    = 8000;   /* un journal lent ne retient pas les autres */
const MAX      = 400000; /* on ne garde pas douze mega en memoire */

/* un flux ouvre sur ce qui fait l'actualite du jour, pas sur ce qui
   nous concerne : il faut en regarder beaucoup pour en garder cinq */
const EXAMINES = 60;

/* ===== LE SUJET DU SITE, ET RIEN D'AUTRE =====
   La rubrique « economie » d'un journal generaliste, c'est l'economie
   du PAYS : une greve, un salon de l'automobile, le cachet d'un
   animateur de television, le redressement judiciaire d'un fabricant
   de verres. Rien de tout cela ne touche a ce que vous detenez, et
   ca n'avait rien a faire dans une page qui parle de votre patrimoine.

   On ne garde donc qu'un titre qui touche a ce que le site TRAITE :
   impots, epargne, bourse, crypto, immobilier, banque et credit,
   retraite, matieres premieres, et la macro qui change la valeur de
   ce qu'on detient.

   LES TERMES SONT ECRITS COMME LA MACHINE LES LIT : sans accents et
   sans ponctuation, parce que le titre est ramene a cette forme avant
   la comparaison. « plus value » retrouve « plus-values », « credit
   d impot » retrouve « credit d'impot ». Ce n'est pas un oubli.

   LES MOTS QUI N'Y SONT PAS, et c'est delibere : « or », « action »,
   « euro », « taux », « marche », « argent » tout court. Ils
   attrapent « il y a de l'or dans ce film », « une action en
   justice », « trois millions d'euros de degats », « le taux de
   participation », « le marche de Noel », « l'argent de la drogue ».
   Un mot ambigu fait entrer plus de bruit qu'il ne retient de signal ;
   on garde donc leurs composes — « marches financiers », « taux
   d interet », « rachat d actions » — et pas eux. « l or » y est, lui :
   dans une rubrique economie c'est le metal, et c'est un des actifs
   que le site suit.

   Les sigles courts y sont, eux : « cac », « pea », « per », « oat »,
   « lep » ne sont pas des mots francais, ils ne peuvent rien attraper
   d'autre.

   La liste se change sans toucher au programme : ACTU_SUJETS, des
   termes separes par des virgules. */
const SUJETS = [
  /* impots et fiscalite */
  'impot', 'imposition', 'imposable', 'contribuable', 'fisc', 'fiscal',
  'fiscale', 'fiscaux', 'fiscalite', 'defiscalisation', 'exoneration',
  'csg', 'crds', 'prelevements sociaux', 'prelevement forfaitaire', 'pfu',
  'flat tax', 'plus value', 'moins value', 'abattement', 'niche fiscale',
  'credit d impot', 'ifi', 'isf', 'succession', 'donation',
  'droits de mutation', 'declaration de revenus', 'avis d imposition',
  'taxe fonciere', 'taxe d habitation', 'tranche d imposition',
  'quotient familial', 'revenu fiscal', 'loi de finances', 'tva',
  'prelevement a la source',

  /* epargne et placements */
  'epargne', 'epargnant', 'livret a', 'livrets', 'livret jeune',
  'livret de developpement', 'ldds', 'lep', 'pea', 'per', 'perp',
  'plan d epargne', 'assurance vie', 'placement', 'patrimoine',
  'rendement', 'fonds euro', 'unite de compte', 'sicav', 'opcvm',
  'gestion pilotee', 'compte a terme', 'pel', 'cel', 'epargne logement',
  'interets composes', 'versement programme', 'votre argent',

  /* bourse */
  'bourse', 'boursier', 'boursiere', 'actionnaire', 'dividende', 'cac',
  'nasdaq', 'dow jones', 'euronext', 'wall street', 'indice boursier',
  'introduction en bourse', 'capitalisation', 'obligataire',
  'obligations d etat', 'oat', 'etf', 'opa', 'krach', 'valeur refuge',
  'marches financiers', 'marche actions', 'cotation', 'cote en bourse',
  'rachat d actions',

  /* crypto */
  'crypto', 'cryptomonnaie', 'crypto monnaie', 'cryptoactif', 'bitcoin',
  'btc', 'ethereum', 'stablecoin', 'blockchain', 'minage', 'nft',
  'binance', 'coinbase', 'mica', 'altcoin', 'halving', 'web3',

  /* immobilier */
  'immobilier', 'immobiliere', 'logement', 'loyer', 'locataire',
  'proprietaire', 'bailleur', 'scpi', 'lmnp', 'pinel', 'denormandie',
  'notaire', 'copropriete', 'syndic', 'dpe', 'passoire thermique',
  'metre carre', 'encadrement des loyers', 'foncier', 'fonciere',
  'nue propriete', 'viager', 'hlm', 'primo accedant', 'apport personnel',
  'marche immobilier',

  /* banque et credit */
  'banque', 'bancaire', 'credit', 'emprunt', 'emprunteur', 'prets',
  'pret immobilier', 'pret a taux zero', 'taux d interet',
  'taux directeur', 'taux d emprunt', 'bce', 'banque centrale', 'fed',
  'reserve federale', 'inflation', 'desinflation', 'deflation',
  'pouvoir d achat', 'decouvert', 'frais bancaires', 'agios',
  'taux d usure', 'surendettement', 'endettement', 'hcsf',
  'rachat de credit', 'carte bancaire', 'neobanque', 'courtier',

  /* retraite */
  'retraite', 'pension', 'agirc', 'arrco', 'cnav', 'carsat', 'reversion',
  'decote', 'surcote', 'trimestres', 'cotisation', 'age de depart',

  /* matieres premieres */
  'lingot', 'once d or', 'l or', 'metal precieux',
  'petrole', 'brent', 'baril', 'matieres premieres', 'gaz naturel',
  'cuivre',

  /* la macro qui change la valeur de ce qu'on detient */
  'pib', 'croissance', 'deficit', 'dette publique', 'agence de notation',
  'moody s', 'fitch', 'spread', 'taux de change', 'euro numerique',
  'budget de l etat', 'projet de budget'
];

/* Le pluriel francais, et rien de plus : « impot » prend « impots »,
   « livret a » prend « livrets a ». Pas de prefixe libre, qui ferait
   prendre « peau » par « pea » et « credo » par « credit ». Les
   formes irregulieres sont ecrites en entier dans la liste. */
const FINS = ['', 's'];

/* Le titre ramene a ce qu'il dit : sans accents, sans majuscules, sans
   ponctuation, chaque mot entoure d'espaces. Compare alors, un terme
   encadre lui aussi d'espaces ne peut matcher qu'un MOT ENTIER — pas
   un morceau de mot. */
function normalise(t){
  return ' ' + String(t == null ? '' : t)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() + ' ';
}

function sujets(){
  const brut = process.env.ACTU_SUJETS
    ? String(process.env.ACTU_SUJETS).split(',') : SUJETS;
  const l = [];
  brut.forEach(x => {
    const n = normalise(x).trim();
    if (!n) return;
    FINS.forEach(f => {
      const m = ' ' + n + f + ' ';
      if (l.indexOf(m) === -1) l.push(m);
    });
  });
  return l;
}
const TERMES = sujets();

function concerne(titre){
  /* UNE LISTE VIDE NE REJETTE PAS TOUT, elle desarme le filtre : c'est
     la seule lecture utile, et elle se voit dans le journal. */
  if (!TERMES.length) return true;
  const t = normalise(titre);
  for (const m of TERMES) if (t.indexOf(m) !== -1) return true;
  return false;
}
if (!TERMES.length) process.stderr.write('AUCUN SUJET — le filtre est desarme.\n');

/* ===== L'ESSAI, SANS RESEAU =====
   « node actu.mjs --essai "un titre" "un autre" » dit, pour chacun,
   s'il concerne le sujet. C'est ce qui permet de VERIFIER le filtre
   sur de vrais titres — ceux-la memes qui ont motive son ecriture —
   sans dependre de ce que les journaux publient aujourd'hui. Le banc
   s'en sert (test88). */
if (process.argv[2] === '--essai'){
  process.argv.slice(3).forEach(t => {
    process.stdout.write((concerne(t) ? 'oui' : 'non') + ' · ' + t + '\n');
  });
  process.exit(0);
}

function flux(){
  return String(process.env.ACTU_FLUX || DEFAUT)
    .split(',')
    .map(x => {
      const i = String(x).indexOf('|');
      if (i === -1) return null;
      const nom = x.slice(0, i).trim();
      const url = x.slice(i + 1).trim();
      /* Seuls http(s). Un flux mal regle ne doit pas pouvoir glisser
         un « javascript: » jusqu'au navigateur du lecteur. */
      return (nom && /^https?:\/\//i.test(url)) ? {nom, url} : null;
    })
    .filter(Boolean);
}

/* Les cinq entites que les flux emploient reellement, plus le
   numerique. Un flux RSS est du XML, pas du HTML : ce sont les seules
   qui y soient obligatoires. */
function entites(t){
  return String(t == null ? '' : t)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return (c > 0 && c < 0x110000) ? String.fromCodePoint(c) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const c = parseInt(n, 16);
      return (c > 0 && c < 0x110000) ? String.fromCodePoint(c) : '';
    })
    /* En DERNIER, sans quoi « &amp;lt; » deviendrait « < ». */
    .replace(/&amp;/g, '&');
}

/* Le contenu d'une balise, CDATA compris : les editeurs y emballent
   presque toujours leurs titres, qui portent des apostrophes et des
   esperluettes. */
function balise(bloc, nom){
  const m = new RegExp('<' + nom + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + nom + '>', 'i').exec(bloc);
  if (!m) return '';
  let t = m[1];
  const cd = /<!\[CDATA\[([\s\S]*?)\]\]>/i.exec(t);
  if (cd) t = cd[1];
  /* Un titre peut porter du balisage : on le retire plutot que de le
     laisser filer jusqu'au navigateur. La page echappe de son cote,
     mais deux filets valent mieux qu'un sur du texte venu d'ailleurs. */
  return entites(t.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/* Atom met le lien dans un attribut, RSS dans le texte de la balise. */
function lien(bloc){
  const a = /<link[^>]*\srel=["']alternate["'][^>]*\shref=["']([^"']+)["']/i.exec(bloc) ||
            /<link[^>]*\shref=["']([^"']+)["']/i.exec(bloc);
  if (a) return entites(a[1]).trim();
  const b = balise(bloc, 'link');
  if (b) return b;
  /* Dernier recours : certains flux ne mettent l'adresse que dans le
     guid, et le signalent par isPermaLink. */
  const g = /<guid[^>]*isPermaLink=["']true["'][^>]*>([\s\S]*?)<\/guid>/i.exec(bloc);
  return g ? entites(g[1]).trim() : '';
}

function quand(bloc){
  const t = balise(bloc, 'pubDate') || balise(bloc, 'published') ||
            balise(bloc, 'updated') || balise(bloc, 'dc:date');
  if (!t) return null;
  const d = new Date(t);
  return isFinite(d.getTime()) ? d.toISOString() : null;
}

/* ===== CE QU'UNE PAGE ANNONCE =====
   Trois adresses sur six essayees n'existaient pas, et chercher la
   bonne a la main est un travail sans fin : chaque site la range
   ailleurs, et elle change. Un vrai lecteur de flux ne la cherche
   pas — il lit la page d'accueil et prend celle qu'elle ANNONCE,
   dans la balise prevue pour ca depuis vingt ans.

   On fait donc un seul saut : si l'adresse donnee rend une page web
   plutot qu'un flux, on y lit le lien annonce et on le suit. Un
   seul, et pas de second — un site qui renverrait en boucle ne doit
   pas nous y emmener. Cela veut dire qu'on peut desormais ecrire
   « Bercy|https://www.economie.gouv.fr » et que ca marche. */
function flairFlux(html, base){
  const liens = html.match(/<link\b[^>]*>/gi) || [];
  for (const l of liens){
    if (!/rel\s*=\s*["']?alternate/i.test(l)) continue;
    if (!/type\s*=\s*["'](application\/(rss|atom)\+xml|application\/xml|text\/xml)["']/i.test(l)) continue;
    const h = /href\s*=\s*["']([^"']+)["']/i.exec(l);
    if (!h) continue;
    try { return new URL(entites(h[1]), base).href; } catch (e){ /* adresse illisible */ }
  }
  return null;
}

/* Les blocs d'un flux, quelle que soit sa famille. */
function articles(brut){
  return brut.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
}

async function unFlux(f, saut){
  const t0 = Date.now();
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), DELAI);
  try {
    const r = await fetch(f.url, {
      signal: stop.signal,
      headers: {
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        /* LA FORME CONVENUE D'UN LECTEUR DE FLUX. « pierrelco-actu/1.0 »
           tout court recoit un 403 de certains serveurs : leur pare-feu
           ne reconnait pas l'agent et refuse par defaut. Le prefixe
           « Mozilla/5.0 (compatible; … ) » est la convention des
           lecteurs RSS depuis vingt ans — il ne deguise rien, le nom du
           programme et l'adresse de son depot restent ecrits en toutes
           lettres, et c'est a cela qu'on nous reconnait. */
        'User-Agent': 'Mozilla/5.0 (compatible; pierrelco-actu/1.0; +https://github.com/pierrelaxel13-droid/portefeuille)'
      }
    });
    if (!r.ok) return {nom:f.nom, etat:r.status, ms:Date.now() - t0, lignes:[]};
    const brut = (await r.text()).slice(0, MAX);
    let blocs = articles(brut);
    /* RIEN A LIRE DANS UNE REPONSE QUI VA BIEN : c'est presque
       toujours une page web la ou on attendait un flux. On suit ce
       qu'elle annonce, une fois. */
    if (!blocs.length && !saut && /<html[\s>]/i.test(brut)){
      const vers = flairFlux(brut, r.url || f.url);
      if (vers && vers !== f.url){
        const suite = await unFlux({nom:f.nom, url:vers}, true);
        suite.dit = 'page web ; flux annonce suivi vers ' + vers.slice(0, 90);
        return suite;
      }
      return {nom:f.nom, etat:r.status, ms:Date.now() - t0, lignes:[],
              dit:"page web, et elle n'annonce aucun flux"};
    }
    /* Une reponse qui va bien, qui n'est pas une page web, et ou l'on
       ne trouve aucun article : on dit ce qui est arrive plutot que de
       laisser un zero sans explication. */
    if (!blocs.length){
      return {nom:f.nom, etat:r.status, ms:Date.now() - t0, lignes:[],
              dit:'aucun article : ' + brut.replace(/\s+/g, ' ').slice(0, 110)};
    }
    const lignes = [];
    let vus = 0;
    for (const b of blocs){
      if (vus >= EXAMINES) break;
      const titre = balise(b, 'title');
      const url = lien(b);
      /* Sans lien on n'affiche pas : reprendre un titre sans renvoyer
         chez celui qui l'a ecrit, c'est se l'approprier. */
      if (!titre || !/^https?:\/\//i.test(url)) continue;
      vus++;
      /* LE PLAFOND PORTE SUR CE QU'ON GARDE, PAS SUR CE QU'ON REGARDE.
         Filtrer les cinq premiers titres au lieu de filtrer parmi tous
         rendrait la rubrique muette des qu'un journal ouvre sur une
         greve : il faut en lire beaucoup pour en garder cinq. */
      if (!concerne(titre)) continue;
      lignes.push({titre: titre.slice(0, 240), lien: url, source: f.nom, date: quand(b)});
      if (lignes.length >= PAR_FLUX) break;
    }
    /* Un flux qui repond, qu'on a lu, et dont rien ne concerne le
       sujet : il faut le DIRE. Sans cela un 200 suivi d'un zero
       ressemble a une panne, et on irait chercher un defaut la ou il
       n'y en a pas. */
    const dit = (vus && !lignes.length)
      ? vus + ' titres lus, aucun ne concerne le sujet du site' : undefined;
    return {nom:f.nom, etat:r.status, ms:Date.now() - t0, lignes, vus, dit};
  } catch (e){
    return {nom:f.nom, etat:0, ms:Date.now() - t0, lignes:[],
            dit: String((e && e.message) || e).slice(0, 120)};
  } finally {
    clearTimeout(minuteur);
  }
}

const sources = flux();
/* En parallele : trois journaux lents l'un apres l'autre, c'est
   vingt-quatre secondes pour rien. */
/* `sources.map(unFlux)` passe l'INDEX en deuxieme argument, et le
   deuxieme argument de `unFlux` est « j'ai deja saute vers un flux
   annonce ». Toutes les sources sauf la premiere croyaient donc avoir
   deja saute, et ne suivaient jamais ce qu'une page annonce. Un
   defaut qui ne casse rien : il rend juste une fonctionnalite
   silencieusement inerte, ce qui est la pire des pannes. */
const lus = await Promise.all(sources.map(f => unFlux(f)));
const lignes = [];
lus.forEach(x => x.lignes.forEach(l => lignes.push(l)));
/* Les plus recents d'abord. Une ligne sans date passe derriere celles
   qui en ont une : on ne la fait pas passer pour fraiche. */
lignes.sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));

const sortie = {
  lignes: lignes.slice(0, TOTAL),
  /* On ne cite que les sources qui ont REELLEMENT servi un titre :
     nommer un journal muet, c'est lui attribuer ce qu'un autre a
     ecrit. */
  sources: lus.filter(x => x.lignes.length).map(x => x.nom),
  fait: new Date().toISOString(),
  /* « vus » est ce qu'on a lu, « titres » ce qu'on a garde : l'ecart
     est le filtre, et il doit se voir. */
  flux: lus.map(x => ({nom:x.nom, etat:x.etat, ms:x.ms, vus:x.vus || 0,
                       titres:x.lignes.length, dit:x.dit || null}))
};

/* AUCUN TITRE N'EST UN ECHEC, et il doit se voir dans le journal de la
   tache : sans cela, un flux qui a change d'adresse rendrait un
   fichier vide pendant des mois sans que personne ne s'en apercoive. */
lus.forEach(x => {
  process.stderr.write(x.nom + ' : ' + (x.etat || 'injoignable') +
    ' · ' + x.lignes.length + ' gardes sur ' + (x.vus || 0) + ' lus' +
    (x.dit ? ' · ' + x.dit : '') + '\n');
});
if (!sortie.lignes.length){
  /* Deux pannes tres differentes sous le meme zero : des flux muets,
     ou un jour sans rien qui nous concerne. Le journal doit trancher. */
  const lu = lus.reduce((n, x) => n + (x.vus || 0), 0);
  process.stderr.write('AUCUN TITRE' +
    (lu ? ' QUI CONCERNE LE SUJET (' + lu + ' titres lus)' : '') +
    ' — le fichier ne sera pas ecrit.\n');
  process.exit(2);
}
process.stdout.write(JSON.stringify(sortie, null, 1) + '\n');
