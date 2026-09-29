// Enregistre video.html en MP4 (1080x1920, 30 i/s), image par image.
// Usage : node rendre-video.mjs sortie.mp4            -> vidéo complète (28 s, vertical)
//         node rendre-video.mjs dossier 3.5,9,15      -> images fixes à ces instants
// Options : --fmt=16x9 (1920x1080)   --cut=15 (version de 15 s)
// Il faut Chromium (CHROME) et ffmpeg (FFMPEG) ; Node 22 pour WebSocket.
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,rmSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const CHROME=process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FFMPEG=process.env.FFMPEG||'ffmpeg';
const args=process.argv.slice(2),opts=args.filter(a=>a.startsWith('--')).map(a=>a.slice(2).replace('=','=')),[out,list]=args.filter(a=>!a.startsWith('--')),FPS=30;
const page='file://'+resolve(import.meta.dirname,'video.html')+'?render=1'+opts.map(o=>'&'+o).join('');
const prof=mkdtempSync(join(tmpdir(),'cr-'));
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=9333','--user-data-dir='+prof,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tgt;for(let i=0;i<50&&!tgt;i++){await sleep(200);try{tgt=(await (await fetch('http://127.0.0.1:9333/json')).json()).find(x=>x.type==='page')}catch{}}
const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const wait=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&wait.has(m.id)){wait.get(m.id)(m);wait.delete(m.id)}};
const send=(method,params={})=>new Promise(r=>{wait.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
const land=opts.includes('fmt=16x9'),VW=land?1920:1080,VH=land?1080:1920;
await send('Emulation.setDeviceMetricsOverride',{width:VW,height:VH,deviceScaleFactor:1,mobile:false});
await send('Page.enable');await send('Page.navigate',{url:page});await sleep(1500);
const DUR=(await send('Runtime.evaluate',{expression:'DUR',returnByValue:true})).result.result.value;
const shot=async t=>{await send('Runtime.evaluate',{expression:`draw(${t});0`});
 const r=await send('Page.captureScreenshot',{format:'jpeg',quality:93});return Buffer.from(r.result.data,'base64')};
if(list){mkdirSync(out,{recursive:true});for(const t of list.split(','))writeFileSync(join(out,`t${t}.jpg`),await shot(+t))}
else{const dir=join(prof,'f');mkdirSync(dir);const N=DUR*FPS;
 for(let i=0;i<=N;i++){writeFileSync(join(dir,`f${String(i).padStart(4,'0')}.jpg`),await shot(i/FPS));if(i%90===0)console.log(`${i}/${N}`)}
 await new Promise((ok,ko)=>spawn(FFMPEG,['-y','-loglevel','error','-framerate',String(FPS),'-i',join(dir,'f%04d.jpg'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium','-movflags','+faststart',out],{stdio:'inherit'}).on('exit',c=>c?ko(c):ok()))}
ws.close();chrome.kill();await sleep(500);try{rmSync(prof,{recursive:true,force:true})}catch{}process.exit(0);
