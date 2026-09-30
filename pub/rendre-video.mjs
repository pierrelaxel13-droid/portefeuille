// Enregistre video.html en MP4 (1080x1920, 30 i/s), image par image.
// Usage : node rendre-video.mjs sortie.mp4            -> vidéo complète (28 s, vertical)
//         node rendre-video.mjs dossier 3.5,9,15      -> images fixes à ces instants
// Options : --fmt=16x9 (1920x1080)   --cut=15 (version de 15 s)
//           --page=film.html (film 3D)   --blur=4 (flou de mouvement : 4 sous-images par image)
//           --audio=son.wav (bande-son à mixer)   --port=9333
// Il faut Chromium (CHROME) et ffmpeg (FFMPEG) ; Node 22 pour WebSocket.
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,rmSync,mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
const CHROME=process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FFMPEG=process.env.FFMPEG||'ffmpeg';
const args=process.argv.slice(2),flags=Object.fromEntries(args.filter(a=>a.startsWith('--')).map(a=>a.slice(2).split('='))),opts=['fmt','cut'].filter(k=>flags[k]).map(k=>k+'='+flags[k]),[out,list]=args.filter(a=>!a.startsWith('--')),FPS=30;
// petit serveur local : les pages en modules (film.html) ne se chargent pas depuis file://
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript'};
const srv=createServer((q,r)=>{const p=join(import.meta.dirname,decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,''));
 if(!p.startsWith(import.meta.dirname)||!existsSync(p)){r.writeHead(404).end();return}r.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'});r.end(readFileSync(p))}).listen(0);
const page=`http://127.0.0.1:${srv.address().port}/${flags.page||'video.html'}?render=1`+opts.map(o=>'&'+o).join('');
const prof=mkdtempSync(join(tmpdir(),'cr-'));
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files','--remote-debugging-port='+(flags.port||9333),'--user-data-dir='+prof,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tgt;for(let i=0;i<50&&!tgt;i++){await sleep(200);try{tgt=(await (await fetch('http://127.0.0.1:'+(flags.port||9333)+'/json')).json()).find(x=>x.type==='page')}catch{}}
const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const wait=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&wait.has(m.id)){wait.get(m.id)(m);wait.delete(m.id)}};
const send=(method,params={})=>new Promise(r=>{wait.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
const land=flags.fmt==='16x9',VW=land?1920:1080,VH=land?1080:1920;
await send('Emulation.setDeviceMetricsOverride',{width:VW,height:VH,deviceScaleFactor:1,mobile:false});
await send('Page.enable');await send('Page.navigate',{url:page});
for(let i=0;i<100;i++){await sleep(300);const v=await send('Runtime.evaluate',{expression:'typeof draw==="function"',returnByValue:true});if(v.result?.result?.value)break}
const DUR=(await send('Runtime.evaluate',{expression:'DUR',returnByValue:true})).result.result.value;
const shot=async t=>{await send('Runtime.evaluate',{expression:`draw(${t});0`});
 const r=await send('Page.captureScreenshot',{format:'jpeg',quality:93});return Buffer.from(r.result.data,'base64')};
if(list){mkdirSync(out,{recursive:true});for(const t of list.split(','))writeFileSync(join(out,`t${t}.jpg`),await shot(+t))}
else{const dir=flags.resume||join(prof,'f'),B=+(flags.blur||1),N=Math.round(DUR*FPS);mkdirSync(dir,{recursive:true});
 // --resume=dossier : reprend là où une exécution interrompue s'est arrêtée (les 2 dernières images sont refaites)
 const k0=flags.resume?Math.max(0,readdirSync(dir).length-2):0;
 for(let k=k0;k<(N+1)*B;k++){const i=Math.floor(k/B),j=k%B;
   // obturateur à 180° : les sous-images couvrent la moitié de l'intervalle entre deux images
   const t=Math.max(0,i/FPS+(B>1?((j+.5)/B-.5)*(.5/FPS):0));
   writeFileSync(join(dir,`f${String(k).padStart(5,'0')}.jpg`),await shot(t));
   if(j===0&&i%90===0)console.log(`${i}/${N}`)}
 const vf=B>1?['-vf',`tmix=frames=${B},select=eq(mod(n\\,${B})\\,${B-1}),setpts=N/${FPS}/TB`]:[];
 const au=flags.audio?['-i',flags.audio,'-c:a','aac','-b:a','192k','-shortest']:[];
 await new Promise((ok,ko)=>spawn(FFMPEG,['-y','-loglevel','error','-framerate',String(FPS*B),'-i',join(dir,'f%05d.jpg'),...au,...vf,'-r',String(FPS),'-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-preset','slow','-movflags','+faststart',out],{stdio:'inherit'}).on('exit',c=>c?ko(c):ok()))}
ws.close();chrome.kill();srv.close();await sleep(500);try{rmSync(prof,{recursive:true,force:true})}catch{}process.exit(0);
