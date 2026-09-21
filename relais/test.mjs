/* Le relais, execute face a un faux fournisseur : « node test.mjs ».
   Aucune cle, aucun reseau -- on peut le lancer avant de deployer. On verifie ce
   qui compte : la forme rendue, la conversion de devise, le silence
   sur les codes qui ne le concernent pas, la cle qui ne sort jamais,
   et le refus d'une origine non declaree. */
import worker from './worker.js';

const AMONT = 'https://api.twelvedata.com';
const vus = [];            /* tout ce que le relais demande a l'amont */
let mode = 'ok';

const COURS = {
  'CW8':  {close:'512.30', currency:'EUR', is_market_open:true},
  'AAPL': {close:'198.74', currency:'USD', is_market_open:false},
  'ESE':  {close:'31.88',  currency:'EUR', is_market_open:true}
};

globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  vus.push(u.pathname + '?' + u.searchParams.toString());
  if (mode === '429') return new Response('{}', {status:429});
  if (mode === '500') return new Response('{}', {status:500});
  if (u.pathname === '/exchange_rate'){
    const s = u.searchParams.get('symbol');
    const t = {'USD/EUR':0.92, 'EUR/EUR':1}[s];
    if (t === undefined) return new Response(JSON.stringify({status:'error'}), {status:200});
    return new Response(JSON.stringify({symbol:s, rate:t}), {status:200});
  }
  if (u.pathname === '/quote'){
    const syms = (u.searchParams.get('symbol') || '').split(',');
    if (syms.length === 1) return new Response(JSON.stringify(COURS[syms[0]] || {status:'error'}), {status:200});
    const o = {};
    syms.forEach(s => { o[s] = COURS[s] || {status:'error'}; });
    return new Response(JSON.stringify(o), {status:200});
  }
  return new Response('{}', {status:404});
};

const ENV = {TWELVEDATA:'SECRET-QUI-NE-DOIT-PAS-SORTIR', ORIGINES:'https://pierrelaxel13-droid.github.io'};
const appel = (q, origine) => worker.fetch(
  new Request('https://relais.test/?' + q, {headers: origine ? {Origin:origine} : {}}), ENV);
const BON = 'https://pierrelaxel13-droid.github.io';

let ko = 0;
const dit = (t, ok, quoi) => { if (!ok) ko++; console.log((ok?'  ok  ':'ECHEC ') + t + (quoi !== undefined ? ' : ' + quoi : '')); };

// [1] deux ETF europeens et une action americaine, en euros
vus.length = 0;
let r = await appel('ids=tw:CW8:XPAR,tw:ESE:XPAR,tw:AAPL&vs_currencies=eur', BON);
let o = await r.json();
console.log('[1] trois lignes en euros');
dit('CW8 rendu tel quel', o['tw:CW8:XPAR'] && o['tw:CW8:XPAR'].eur === 512.3, JSON.stringify(o['tw:CW8:XPAR']));
dit('AAPL converti en euros', o['tw:AAPL'] && Math.abs(o['tw:AAPL'].eur - 198.74*0.92) < 0.01, JSON.stringify(o['tw:AAPL']));
dit('le retard est annonce', !!o.retard, o.retard);
/* Deux places distinctes (XPAR et « sans place ») : deux appels, et
   surtout chaque cours sur la bonne ligne. */
dit('un appel par place, pas un de plus', vus.filter(x=>x.startsWith('/quote')).length === 2,
    vus.filter(x=>x.startsWith('/quote')).length + ' appel(s)');
dit('ESE n a pas pris le cours d AAPL', o['tw:ESE:XPAR'] && o['tw:ESE:XPAR'].eur === 31.88,
    JSON.stringify(o['tw:ESE:XPAR']));

// [2] la cle ne doit apparaitre nulle part dans la reponse
console.log('[2] la cle reste au chaud');
dit('absente du corps', JSON.stringify(o).indexOf('SECRET') === -1);
dit('presente cote amont', vus.some(x => x.includes('apikey=SECRET')));

// [3] les cryptos ne le concernent pas
vus.length = 0;
r = await appel('ids=bitcoin,ethereum&vs_currencies=eur', BON);
o = await r.json();
console.log('[3] codes qui ne sont pas les siens');
dit('rendu vide', Object.keys(o).length === 0, JSON.stringify(o));
dit('aucun appel a l amont', vus.length === 0, vus.length + ' appel(s)');

// [4] melange crypto + bourse : il ne repond que pour sa part
r = await appel('ids=bitcoin,tw:CW8:XPAR&vs_currencies=eur', BON);
o = await r.json();
console.log('[4] melange');
dit('la bourse est la', !!o['tw:CW8:XPAR']);
dit('la crypto est absente', !o.bitcoin, JSON.stringify(Object.keys(o)));

// [5] un symbole inconnu de l amont ne casse pas les autres
r = await appel('ids=tw:CW8:XPAR,tw:NIMPORTEQUOI&vs_currencies=eur', BON);
o = await r.json();
console.log('[5] un symbole faux parmi des bons');
dit('les bons passent', !!o['tw:CW8:XPAR']);
dit('le faux est simplement absent', !o['tw:NIMPORTEQUOI']);

// [6] origine
console.log('[6] qui a le droit d appeler');
r = await appel('ids=tw:CW8:XPAR', 'https://un-autre-site.test');
dit('origine inconnue refusee', r.status === 403, 'statut ' + r.status);
r = await appel('ids=tw:CW8:XPAR', BON);
dit('origine declaree acceptee', r.status === 200 &&
    r.headers.get('Access-Control-Allow-Origin') === BON,
    r.headers.get('Access-Control-Allow-Origin'));

// [7] pannes de l amont
console.log('[7] quand l amont flanche');
mode = '429'; r = await appel('ids=tw:CW8:XPAR', BON);
dit('limite relayee en 429', r.status === 429, 'statut ' + r.status);
mode = '500'; r = await appel('ids=tw:CW8:XPAR', BON);
dit('panne relayee en 502', r.status === 502, 'statut ' + r.status);
mode = 'ok';

// [8] cle absente : on le dit, on ne fait pas semblant
r = await worker.fetch(new Request('https://relais.test/?ids=tw:CW8', {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
console.log('[8] relais mal installe');
dit('dit que la cle manque', r.status === 500, 'statut ' + r.status);
dit('et dit quoi faire', ((await r.clone().json()).quoi || '').includes('TWELVEDATA'));

// [8b] l'ancien nom reste accepte : personne ne doit etre casse par
//      le changement de nom.
r = await worker.fetch(new Request('https://relais.test/?ids=tw:CW8:XPAR&vs_currencies=eur',
      {headers:{Origin:BON}}), {CLE:ENV.TWELVEDATA, ORIGINES:ENV.ORIGINES});
dit('l ancien nom CLE marche encore', r.status === 200 &&
    (await r.json())['tw:CW8:XPAR'] !== undefined, 'statut ' + r.status);

// [9] garde-fou sur le nombre de codes
r = await appel('ids=' + Array.from({length:41}, (_,i)=>'tw:X'+i).join(','), BON);
dit('plus de 40 codes refuses', r.status === 400, 'statut ' + r.status);

// [10] la casse du code ne doit rien changer : la page met les codes
//      en minuscules a la saisie, l'utilisateur tape en majuscules.
vus.length = 0;
r = await appel('ids=tw:cw8:xpar&vs_currencies=eur', BON);
o = await r.json();
console.log('[10] code saisi en minuscules');
dit('le symbole part en majuscules', vus.some(x => x.includes('symbol=CW8')),
    vus.filter(x=>x.startsWith('/quote'))[0]);
dit('le prix revient sous le code recu', o['tw:cw8:xpar'] && o['tw:cw8:xpar'].eur === 512.3,
    JSON.stringify(o));

// [11] la place de cotation est transmise
vus.length = 0;
await appel('ids=tw:CW8:XPAR&vs_currencies=eur', BON);
dit('la place accompagne le symbole', vus.some(x => x.includes('mic_code=XPAR')),
    vus.filter(x=>x.startsWith('/quote'))[0]);

// [12] pas de taux de change disponible : on n'invente pas
COURS['XXX'] = {close:'100', currency:'JPY', is_market_open:true};
r = await appel('ids=tw:XXX,tw:CW8:XPAR&vs_currencies=eur', BON);
o = await r.json();
console.log('[12] devise sans taux connu');
dit('la ligne est absente plutot que fausse', !o['tw:XXX'], JSON.stringify(Object.keys(o)));
dit('les autres passent quand meme', !!o['tw:CW8:XPAR']);
delete COURS['XXX'];

// [13] une cle refusee doit se NOMMER, pas se cacher derriere
//      « injoignable ». Twelve Data repond 401, et parfois un 200
//      portant « status: error » -- les deux doivent etre compris.
console.log('[13] cle refusee');
const vraiFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({
  code:401, message:'Invalid API key', status:'error'}), {status:401});
r = await appel('ids=tw:CW8:XPAR&vs_currencies=eur', BON);
o = await r.json();
dit('statut 502', r.status === 502, 'statut ' + r.status);
dit('le message du fournisseur est repete', (o.amont||{}).message === 'Invalid API key',
    JSON.stringify(o.amont));
dit('et on dit quoi faire', (o.quoi||'').includes('TWELVEDATA'), o.quoi);

globalThis.fetch = async () => new Response(JSON.stringify({
  code:401, message:'Invalid API key', status:'error'}), {status:200});
r = await appel('ids=tw:CW8:XPAR&vs_currencies=eur', BON);
o = await r.json();
dit('un 200 portant une erreur compte aussi', r.status === 502, 'statut ' + r.status);

// [14] la cle ne doit jamais ressortir dans un message d'erreur :
//      ces reponses finissent en capture d'ecran.
globalThis.fetch = async () => new Response(
  'refus pour apikey=SECRET-QUI-NE-DOIT-PAS-SORTIR', {status:400});
r = await appel('ids=tw:CW8:XPAR&vs_currencies=eur', BON);
o = await r.json();
console.log('[14] la cle ne fuit pas par les erreurs');
dit('absente du message', JSON.stringify(o).indexOf('SECRET') === -1, JSON.stringify(o.amont));
dit('remplacee par des etoiles', JSON.stringify(o).includes('***'));

// [15] reseau vraiment mort
globalThis.fetch = async () => { throw new Error('boom'); };
r = await appel('ids=tw:CW8:XPAR&vs_currencies=eur', BON);
o = await r.json();
dit('un reseau mort se distingue d un refus', r.status === 502 &&
    (o.amont||{}).statut === 0, JSON.stringify(o.amont));
globalThis.fetch = vraiFetch;

console.log(ko ? '=> ' + ko + ' echec(s)' : '=> rien a signaler');
process.exit(ko ? 1 : 0);
