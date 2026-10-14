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

/* Trois sources publiques et francaises, choisies parce qu'elles
   parlent d'argent a qui n'en fait pas metier. La liste se change
   sans toucher au programme : ACTU_FLUX, « Nom|adresse », separes par
   des virgules. */
const DEFAUT = [
  'France Info|https://www.francetvinfo.fr/economie.rss',
  'Banque de France|https://www.banque-france.fr/rss.xml',
  'INSEE|https://www.insee.fr/fr/information/rss/1405599'
].join(',');

const PAR_FLUX = 5;      /* une rubrique n'est pas une archive */
const TOTAL    = 12;
const DELAI    = 8000;   /* un journal lent ne retient pas les autres */
const MAX      = 400000; /* on ne garde pas douze mega en memoire */

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

async function unFlux(f){
  const t0 = Date.now();
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), DELAI);
  try {
    const r = await fetch(f.url, {
      signal: stop.signal,
      headers: {
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'User-Agent': 'pierrelco-actu/1.0 (+https://github.com/pierrelaxel13-droid/portefeuille)'
      }
    });
    if (!r.ok) return {nom:f.nom, etat:r.status, ms:Date.now() - t0, lignes:[]};
    const brut = (await r.text()).slice(0, MAX);
    const blocs = brut.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
    const lignes = [];
    for (const b of blocs){
      const titre = balise(b, 'title');
      const url = lien(b);
      /* Sans lien on n'affiche pas : reprendre un titre sans renvoyer
         chez celui qui l'a ecrit, c'est se l'approprier. */
      if (!titre || !/^https?:\/\//i.test(url)) continue;
      lignes.push({titre: titre.slice(0, 240), lien: url, source: f.nom, date: quand(b)});
      if (lignes.length >= PAR_FLUX) break;
    }
    return {nom:f.nom, etat:r.status, ms:Date.now() - t0, lignes};
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
const lus = await Promise.all(sources.map(unFlux));
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
  flux: lus.map(x => ({nom:x.nom, etat:x.etat, ms:x.ms, titres:x.lignes.length, dit:x.dit || null}))
};

/* AUCUN TITRE N'EST UN ECHEC, et il doit se voir dans le journal de la
   tache : sans cela, un flux qui a change d'adresse rendrait un
   fichier vide pendant des mois sans que personne ne s'en apercoive. */
lus.forEach(x => {
  process.stderr.write(x.nom + ' : ' + (x.etat || 'injoignable') +
    ' · ' + x.lignes.length + (x.dit ? ' · ' + x.dit : '') + '\n');
});
if (!sortie.lignes.length){
  process.stderr.write('AUCUN TITRE — le fichier ne sera pas ecrit.\n');
  process.exit(2);
}
process.stdout.write(JSON.stringify(sortie, null, 1) + '\n');
