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

const ST = {'cw8.fr':511.90, 'aapl.us':198.10, 'vusa.uk':89.05};
const YH = {
  'CW8.PA':   {regularMarketPrice:512.30, currency:'EUR', marketState:'REGULAR'},
  'IWDA.AS':  {regularMarketPrice:98.44,  currency:'EUR', marketState:'CLOSED'},
  'AAPL':     {regularMarketPrice:198.74, currency:'USD', marketState:'CLOSED'},
  'VUSA.L':   {regularMarketPrice:8900,   currency:'GBp', marketState:'REGULAR'},
  'USDEUR=X': {regularMarketPrice:0.92,   currency:'EUR', marketState:'REGULAR'},
  'GBPEUR=X': {regularMarketPrice:1.17,   currency:'EUR', marketState:'REGULAR'}
};

globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  vus.push(u.pathname + '?' + u.searchParams.toString());
  if (u.hostname === 'stooq.com'){
    const sy = (u.searchParams.get('s') || '').toLowerCase();
    if (mode === 'stooq429') return new Response('Too Many Requests', {status:429});
    const p = ST[sy];
    if (p === undefined){
      return new Response('Symbol,Date,Time,Open,High,Low,Close,Volume\n' +
        sy + ',N/D,N/D,N/D,N/D,N/D,N/D,N/D', {status:200});
    }
    return new Response('Symbol,Date,Time,Open,High,Low,Close,Volume\n' +
      sy + ',2026-09-21,22:00:00,' + p + ',' + p + ',' + p + ',' + p + ',1000',
      {status:200});
  }
  if (u.hostname === 'query1.finance.yahoo.com'){
    if (mode === 'yahoo429') return new Response('Too Many Requests', {status:429});
    const sym = decodeURIComponent(u.pathname.split('/chart/')[1] || '');
    const m = YH[sym];
    if (!m) return new Response(JSON.stringify({chart:{result:null,
      error:{description:'No data found, symbol may be delisted'}}}), {status:404});
    return new Response(JSON.stringify({chart:{result:[{meta:m}], error:null}}), {status:200});
  }
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
/* « relais » et « retard » accompagnent la reponse sans etre des
   cours : on compte les lignes, pas les cles. */
const cours = x => Object.keys(x).filter(k => k !== 'relais' && k !== 'retard');
dit('aucun cours rendu', cours(o).length === 0, JSON.stringify(o));
dit('aucun appel a l amont', vus.length === 0, vus.length + ' appel(s)');

// [4] melange crypto + bourse : il ne repond que pour sa part
r = await appel('ids=bitcoin,tw:CW8:XPAR&vs_currencies=eur', BON);
o = await r.json();
console.log('[4] melange');
dit('la bourse est la', !!o['tw:CW8:XPAR']);
dit('la crypto est absente', !o.bitcoin, JSON.stringify(cours(o)));

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
dit('la ligne est absente plutot que fausse', !o['tw:XXX'], JSON.stringify(cours(o)));
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

// [16] Yahoo : la source qui couvre l'Europe, sans cle.
console.log('[16] la bourse europeenne, par Yahoo');
vus.length = 0;
r = await worker.fetch(new Request(
  'https://relais.test/?ids=yh:CW8.PA,yh:IWDA.AS,yh:AAPL&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});   // AUCUNE cle
o = await r.json();
dit('un ETF d Euronext repond', o['yh:CW8.PA'] && o['yh:CW8.PA'].eur === 512.3,
    JSON.stringify(o['yh:CW8.PA']));
dit('un ETF d Amsterdam aussi', o['yh:IWDA.AS'] && o['yh:IWDA.AS'].eur === 98.44,
    JSON.stringify(o['yh:IWDA.AS']));
dit('une action americaine est convertie', o['yh:AAPL'] &&
    Math.abs(o['yh:AAPL'].eur - 198.74*0.92) < 0.01, JSON.stringify(o['yh:AAPL']));
dit('sans aucune cle Twelve Data', r.status === 200, 'statut ' + r.status);
dit('aucun appel a Twelve Data', !vus.some(x => x.includes('/quote')),
    vus.filter(x=>x.includes('/quote')).join(' '));

// [17] Londres cote en PENCE. Confondre GBp et GBP divise ou
//      multiplie un portefeuille par cent, en silence.
r = await worker.fetch(new Request('https://relais.test/?ids=yh:VUSA.L&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
o = await r.json();
console.log('[17] Londres, en pence');
dit('8900 pence = 89 GBP = 104,13 EUR', o['yh:VUSA.L'] &&
    Math.abs(o['yh:VUSA.L'].eur - 89*1.17) < 0.01, JSON.stringify(o['yh:VUSA.L']));

// [18] les deux sources dans le meme appel
r = await worker.fetch(new Request(
  'https://relais.test/?ids=yh:CW8.PA,tw:AAPL,bitcoin&vs_currencies=eur',
  {headers:{Origin:BON}}), ENV);
o = await r.json();
console.log('[18] Yahoo et Twelve Data ensemble');
dit('la ligne Yahoo est la', !!o['yh:CW8.PA'], JSON.stringify(o['yh:CW8.PA']));
dit('la ligne Twelve Data aussi', !!o['tw:AAPL'], JSON.stringify(o['tw:AAPL']));
dit('la crypto reste ignoree', !o.bitcoin);

// [19] un symbole Yahoo inconnu ne doit pas emporter les bons
r = await worker.fetch(new Request(
  'https://relais.test/?ids=yh:CW8.PA,yh:NEXISTEPAS.XX&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
o = await r.json();
console.log('[19] un symbole Yahoo faux parmi des bons');
dit('le bon passe', !!o['yh:CW8.PA'], JSON.stringify(cours(o)));
dit('le faux est absent', !o['yh:NEXISTEPAS.XX']);

// [20] un « tw: » sans cle doit le dire, un « yh: » sans cle non
r = await worker.fetch(new Request('https://relais.test/?ids=tw:AAPL',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
console.log('[20] la cle n est exigee que par Twelve Data');
dit('« tw: » sans cle est signale', r.status === 500, 'statut ' + r.status);
r = await worker.fetch(new Request('https://relais.test/?ids=yh:CW8.PA&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
dit('« yh: » sans cle fonctionne', r.status === 200, 'statut ' + r.status);

// [21] Yahoo limite la machine : Stooq doit prendre le relais, sans
//      que l'utilisateur ait quoi que ce soit a changer.
console.log('[21] Yahoo refuse, Stooq repond');
mode = 'yahoo429';
r = await worker.fetch(new Request('https://relais.test/?ids=yh:CW8.PA&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
o = await r.json();
dit('la ligne est servie quand meme', r.status === 200 && !!o['yh:CW8.PA'],
    JSON.stringify(o));
dit('au cours de Stooq', o['yh:CW8.PA'] && o['yh:CW8.PA'].eur === 511.9,
    JSON.stringify(o['yh:CW8.PA']));
dit('annonce comme une cloture', o.retard === 'cloture', o.retard);

// [22] les deux refusent : on dit ce que CHACUNE a repondu, sinon on
//      accuse la mauvaise.
console.log('[22] les deux portes fermees');
mode = 'stooq429';   // yahoo429 deja actif ? non : un seul mode a la fois
mode = 'yahoo429';
r = await worker.fetch(new Request('https://relais.test/?ids=yh:INCONNU.PA&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
o = await r.json();
dit('les deux sources sont nommees',
    (JSON.stringify(o).includes('Yahoo') && JSON.stringify(o).includes('Stooq')),
    JSON.stringify(o.amont || o).slice(0, 150));
mode = 'ok';

// [23] « st: » vise Stooq directement, sans passer par Yahoo
vus.length = 0;
r = await worker.fetch(new Request('https://relais.test/?ids=st:cw8.fr&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
o = await r.json();
console.log('[23] Stooq choisi explicitement');
dit('la ligne repond', !!o['st:cw8.fr'], JSON.stringify(o['st:cw8.fr']));
dit('sans appeler Yahoo', !vus.some(x => x.includes('/chart/')),
    vus.filter(x=>x.includes('/chart/')).join(' '));

// [24] Londres chez Stooq : toujours des livres, jamais des pence
r = await worker.fetch(new Request('https://relais.test/?ids=st:vusa.uk&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
o = await r.json();
dit('Stooq Londres converti depuis GBP', o['st:vusa.uk'] &&
    Math.abs(o['st:vusa.uk'].eur - 89.05*1.17) < 0.02, JSON.stringify(o['st:vusa.uk']));

// [25] chaque reponse dit quelle version repond : sans ca, « j'ai
//      redeploye » et « je crois avoir redeploye » se ressemblent trop.
console.log('[25] la version voyage dans la reponse');
r = await worker.fetch(new Request('https://relais.test/?ids=yh:CW8.PA&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
o = await r.json();
dit('sur une reponse qui marche', typeof o.relais === 'string', o.relais);
r = await worker.fetch(new Request('https://relais.test/?ids=tw:AAPL',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
o = await r.json();
dit('sur une erreur aussi', typeof o.relais === 'string', o.relais);

// [26] une erreur ne doit JAMAIS etre mise en cache : sinon le
//      navigateur re-sert le vieux message apres la correction, et
//      l'on cherche un defaut deja repare.
console.log('[26] ce qui se garde, et ce qui ne se garde pas');
r = await worker.fetch(new Request('https://relais.test/?ids=tw:AAPL',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
dit('une erreur n est pas gardee', r.headers.get('Cache-Control') === 'no-store',
    r.headers.get('Cache-Control'));
r = await worker.fetch(new Request('https://relais.test/?ids=yh:CW8.PA&vs_currencies=eur',
  {headers:{Origin:BON}}), {ORIGINES:ENV.ORIGINES});
dit('un cours l est, brievement', /max-age=60/.test(r.headers.get('Cache-Control') || ''),
    r.headers.get('Cache-Control'));

console.log(ko ? '=> ' + ko + ' echec(s)' : '=> rien a signaler');
process.exit(ko ? 1 : 0);
