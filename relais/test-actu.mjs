/* Le lecteur de flux du relais, face a de faux journaux. Aucun reseau. */
import worker from './worker.js';

let ko = 0;
const dit = (n, c, d) => { if (!c) ko++; console.log((c?'  ok  ':'  RATE')+' '+n+(d===undefined?'':' : '+d)); };

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Faux journal</title>
<item>
  <title><![CDATA[Le gouvernement envisage de taxer les plus-values crypto dès 2027]]></title>
  <link>https://exemple.fr/a/crypto-taxe</link>
  <pubDate>Sat, 11 Oct 2026 07:30:00 +0200</pubDate>
</item>
<item>
  <title>L&apos;inflation ralentit &#224; 1,4 % &amp; la BCE h&#xE9;site</title>
  <link>https://exemple.fr/a/inflation</link>
  <pubDate>Fri, 10 Oct 2026 18:00:00 +0200</pubDate>
</item>
<item>
  <title>Un titre sans lien, qui ne doit pas passer</title>
  <pubDate>Fri, 10 Oct 2026 12:00:00 +0200</pubDate>
</item>
<item>
  <title>Un lien dangereux</title>
  <link>javascript:alert(1)</link>
</item>
<item>
  <title>Un titre <b>balisé</b> qu'il faut nettoyer</title>
  <link>https://exemple.fr/a/balise</link>
  <pubDate>Thu, 09 Oct 2026 08:00:00 +0200</pubDate>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Faux Atom</title>
<entry>
  <title>Budget 2027 : ce que prévoit le projet de loi de finances</title>
  <link rel="alternate" href="https://atom.fr/b/budget"/>
  <published>2026-10-11T05:00:00Z</published>
</entry>
<entry>
  <title>Note de conjoncture</title>
  <link href="https://atom.fr/b/conjoncture"/>
  <updated>2026-10-08T09:00:00Z</updated>
</entry>
</feed>`;

let lent = false, casse = false;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (/lent/.test(u)){
    /* Un journal qui ne repond jamais : le signal d'abandon doit le couper. */
    return new Promise((ok, ko2) => {
      const s = opts && opts.signal;
      if (s) s.addEventListener('abort', () => ko2(new Error('abandon')));
    });
  }
  if (/casse/.test(u)) return new Response('page html', {status:503});
  if (/atom/.test(u)) return new Response(ATOM, {status:200});
  return new Response(RSS, {status:200});
};

const ORIG = 'https://pierrel.fr';
const env = {
  ORIGINES: ORIG,
  ACTU_FLUX: 'Un Journal|https://rss.exemple.fr/eco.xml,' +
             'Atom Officiel|https://atom.exemple.fr/feed,' +
             'Mort|https://casse.exemple.fr/f.xml,' +
             'Lent|https://lent.exemple.fr/f.xml'
};
const appel = (q) => worker.fetch(new Request('https://relais.x/' + q, {headers:{Origin:ORIG}}), env);

console.log('[relais] la presse');
const t0 = Date.now();
const r = await appel('?actu=1&diag=1');
const ms = Date.now() - t0;
const o = await r.json();

dit('la route repond', r.status === 200, r.status);
dit('et elle n attend pas le journal muet (< 7 s)', ms < 7000, ms + ' ms');
dit('des titres sont rendus', o.lignes.length > 0, o.lignes.length + ' titres');
dit('le titre sans lien est ecarte',
    !o.lignes.some(x => /sans lien/.test(x.titre)));
dit('le « javascript: » est ecarte',
    !o.lignes.some(x => /^javascript:/i.test(x.lien)));
dit('tous les liens sont en http(s)',
    o.lignes.every(x => /^https?:\/\//i.test(x.lien)));
dit('le CDATA est lu',
    o.lignes.some(x => /taxer les plus-values crypto/.test(x.titre)),
    (o.lignes[0] || {}).titre);
dit('les entites sont decodees',
    o.lignes.some(x => x.titre.indexOf("L'inflation ralentit à 1,4 % & la BCE hésite") === 0),
    o.lignes.map(x => x.titre).find(t => /inflation/.test(t)));
dit('le balisage d un titre est retire',
    o.lignes.some(x => x.titre === "Un titre balisé qu'il faut nettoyer"),
    o.lignes.map(x => x.titre).find(t => /nettoyer/.test(t)));
dit('Atom est lu comme RSS',
    o.lignes.some(x => x.lien === 'https://atom.fr/b/budget'));
dit('le lien Atom sans rel=alternate est lu aussi',
    o.lignes.some(x => x.lien === 'https://atom.fr/b/conjoncture'));
dit('les plus recents d abord', (function(){
  const d = o.lignes.filter(x => x.date).map(x => Date.parse(x.date));
  for (let i = 1; i < d.length; i++) if (d[i] > d[i-1]) return false;
  return true;
})(), o.lignes.map(x => (x.date||'—').slice(0,10)).join(' '));
dit('seules les sources qui ont servi sont citees',
    o.sources.length === 2 && o.sources.indexOf('Mort') === -1 &&
    o.sources.indexOf('Lent') === -1, o.sources.join(', '));
dit('le diagnostic dit l etat de chaque flux',
    o.flux && o.flux.length === 4, JSON.stringify((o.flux||[]).map(f => f.nom + '=' + f.etat)));
dit('le relais annonce sa version', !!o.relais, o.relais);

/* Une origine non declaree ne doit pas lire la presse non plus. */
const r2 = await worker.fetch(new Request('https://relais.x/?actu=1',
  {headers:{Origin:'https://ailleurs.example'}}), env);
dit('une origine inconnue est refusee', r2.status === 403, r2.status);

/* Sans ACTU_FLUX, la liste par defaut doit au moins etre bien formee. */
const r3 = await worker.fetch(new Request('https://relais.x/?actu=1&diag=1',
  {headers:{Origin:ORIG}}), {ORIGINES:ORIG});
const o3 = await r3.json();
dit('la liste par defaut porte trois flux', (o3.flux||[]).length === 3,
    (o3.flux||[]).map(f => f.nom).join(', '));

console.log(ko ? ('RATES=' + ko) : 'tout passe');
process.exit(ko ? 1 : 0);
