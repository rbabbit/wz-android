/* MP-local player: deterministic lifecycle fixtures; --browser additionally
 * verifies actual original Opus decoding/menu geometry in isolated host Edge.
 * No emulator, game engine, public room or audible-speaker verification. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets'),out=path.join(root,'qa/multiplayer-072');
const loader=fs.readFileSync(path.join(assets,'multiplayer/music.js'),'utf8');
const cx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(assets,'warzone/music-catalog.js'),'utf8'),cx);const catalog=cx.window.WarzoneMusicCatalog;
const titles=JSON.parse(fs.readFileSync(path.join(assets,'warzone/music-tracks.json'),'utf8')).albums.flatMap(a=>a.tracks);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
let retained=fs.readFileSync(path.join(root,'tools/check-music-playlists-066.cjs'),'utf8').split('async function main(){')[0];
for(const[before,after]of[
 ["source=fs.readFileSync(path.join(root,asset+'music-loader.js'),'utf8')","source=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/music.js'),'utf8')"],
 ['BlockNightAndroid:{','AndroidMultiplayerMusic:{'],
 ["return{api:window.WarzoneMusic,","return{api:window.WarzoneMapMusic,alias:window.WarzoneMapMusic===window.WarzoneMusic,"],
 ["pathname:'/warzone/index-'+mode+'.html'","pathname:'/multiplayer/engine.html'"],
 ["href:origin+'/warzone/index-'+mode+'.html'","href:origin+'/multiplayer/engine.html'"]]){
 if(retained.split(before).length!==2)throw Error('Retained fixture seam changed: '+before);retained=retained.replace(before,after);
}
const fixtureContext={require,__dirname:__dirname,console,URL,URLSearchParams,Blob,AbortController,Promise};
vm.runInNewContext(retained+'\nglobalThis.mpFixture=fixture;',fixtureContext);
const fixture=fixtureContext.mpFixture,checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS '+name);}
async function host(){
 await check('Actual MP copy aliases the existing player API and stays silent outside a battle',async()=>{const f=fixture();assert.equal(f.alias,true);await settle();assert.equal(f.requests.length,0);assert.equal(f.api.report().battleActive,false);assert.equal(f.api.report().menuOpen,false);f.api.dispose();});
 await check('Actual player shuffles all39 bundled songs and avoids an immediate cycle repeat',async()=>{const f=fixture();f.api.setBattleActive(true);await settle();for(let i=0;i<39;i++){f.audios.at(-1).emit('ended');await settle();}const ids=f.requests.map(r=>r.id);assert.equal(new Set(ids.slice(0,39)).size,39);assert.deepEqual(new Set(ids.slice(0,39)),new Set(catalog.playlists.ffa.tracks));assert.notEqual(ids[38],ids[39]);assert.equal(f.api.report().nativeMusicEnabled,false);f.api.dispose();});
 await check('OFF/ON persists through the private bridge without skipping the selected song',async()=>{const f=fixture();f.api.setBattleActive(true);await settle();const id=f.api.report().trackId;f.api.setEnabled(false);await settle();assert.equal(f.prefs.enabled,false);assert.equal(f.api.report().playing,false);assert.equal(f.revoked.length,1);f.api.setEnabled(true);await settle();assert.equal(f.prefs.enabled,true);assert.equal(f.api.report().trackId,id);assert.equal(f.api.report().playing,true);f.api.dispose();});
 await check('Activity and document background pause retain and resume one decoded song',async()=>{const f=fixture();f.api.setBattleActive(true);await settle();const audio=f.audios[0];audio.currentTime=21;f.api.setSuspended(true);assert(audio.paused);assert.equal(f.api.report().retained,true);f.api.setSuspended(false);await settle();await f.visibility(true);assert(audio.paused);await f.visibility(false);assert.equal(f.requests.length,1);assert.equal(f.audios.length,1);assert.equal(audio.currentTime,21);assert.equal(audio.paused,false);f.api.dispose();});
 await check('Game exit aborts pending media and stale fetch/end callbacks cannot restart playback',async()=>{const f=fixture('ffa',{fetch:'hang',ignoreAbort:true});f.api.setBattleActive(true);f.api.dispose();f.requests[0].resolve();await settle();assert.equal(f.audios.length,0);assert.equal(f.api.report().disposed,true);assert.equal(f.timers.size,0);const playing=fixture();playing.api.setBattleActive(true);await settle();const old=playing.audios[0],count=playing.requests.length;playing.api.dispose();old.emit('ended');await settle();assert.equal(playing.requests.length,count);});
 await check('Invalid playlist families, remote tracks and incomplete pools fail closed',async()=>{for(const kind of['family','url','duplicate','count']){const f=fixture();if(kind==='family')f.prefs.mode='campaign';if(kind==='url')f.prefs.tracks[0].url='https://example.invalid/ad';if(kind==='duplicate')f.prefs.tracks[1]=f.prefs.tracks[0];if(kind==='count')f.prefs.tracks.pop();f.api.setBattleActive(true);await settle();assert.equal(f.requests.length,0);assert(f.api.report().error);f.api.dispose();}});
 await check('Media failure is nonfatal and only explicit ON retries',async()=>{const f=fixture('ffa',{play:'reject'});f.api.setBattleActive(true);await settle();assert(f.api.report().error);f.api.setBattleActive(true);await settle();assert.equal(f.requests.length,1);f.config.play='ok';f.api.setEnabled(true);await settle();assert.equal(f.requests.length,2);assert.equal(f.api.report().playing,true);f.api.dispose();});
 await check('MP copy cannot access the main bridge or fetch/extract the complete115MB archive',()=>{assert(!loader.includes('BlockNightAndroid'));assert(!loader.includes('optional/music-v1.data'));assert(!loader.includes('musicSelection('));assert(loader.includes('window.AndroidMultiplayerMusic.musicState()'));assert(loader.includes("mode='ffa'"));assert(loader.includes("'Multiplayer'"));});
 await check('MP native config disables duplicate stock music while retaining effects and voice volumes',()=>{const ctx={};vm.runInNewContext(fs.readFileSync(path.join(assets,'multiplayer/lobby-config.js'),'utf8'),ctx);const result=ctx.PcLobbyConfig.update('[General]\nmusic_enabled=1\nmusic_enabled=1\nsound_enabled=1\nfxvol=81\nvoicevol=73\n');assert.equal((result.match(/^music_enabled=0$/gm)||[]).length,1);assert(result.includes('sound_enabled=1\n'));assert(result.includes('fxvol=81\n'));assert(result.includes('voicevol=73\n'));});
 const report={passed:true,checks,emulatorUsed:false,syntheticMedia:true,actualPlaybackVerified:false,sourceSHA256:sha(path.join(assets,'multiplayer/music.js')),scope:'Actual generated MP player with deterministic fetch/Audio/settings fixtures. Actual decoder is a separate optional browser check.'};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'music-host.json'),JSON.stringify(report,null,2)+'\n');
}

async function browser(){
 const http=require('node:http'),cp=require('node:child_process'),os=require('node:os');
 const edgePath='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';assert(fs.existsSync(edgePath));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mp-music-072-')),streams=[],exceptions=[],browserChecks=[];
 const pack=path.join(assets,'warzone/music/music.data');
 const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
 function page(){const tracks=catalog.playlists.ffa.tracks.map(id=>({...titles.find(t=>t.id===id),url:'/warzone/optional/map-music/'+id}));return `<!doctype html><meta charset="utf-8"><title>MP music decoder fixture</title><link rel="stylesheet" href="/warzone/ui/towers-monochrome.css"><style>html,body{margin:0;background:#080808;color:white}#blocknight-music{margin:16px;background:#262626;color:white;border:1px solid #555;border-radius:5px;padding:12px;min-height:44px}.active{outline:1px solid white}</style><body class="wt-towers-polished"><button id="blocknight-music" aria-expanded="false">MUSIC</button><script>
 const tracks=${json(tracks)};window.fixtureAudios=[];window.fixtureEvents=[];
 function prefs(){return{mode:'ffa',cached:true,enabled:localStorage.getItem('mp-fixture-music')!=='false',suspended:false,mapId:'multiplayer',tracks:tracks.map(t=>({...t,url:new URL(t.url,location.href).href}))}}
 window.AndroidMultiplayerMusic={musicState:()=>JSON.stringify(prefs()),setMusicEnabled(on,session){if(session!=='mp-browser-session')throw Error('Wrong fixture session');localStorage.setItem('mp-fixture-music',String(on));return JSON.stringify(prefs())}};
 const RealAudio=Audio;window.Audio=new Proxy(RealAudio,{construct(target,args){const a=Reflect.construct(target,args);fixtureAudios.push(a);for(const name of['playing','pause','ended','error'])a.addEventListener(name,e=>fixtureEvents.push({name,trusted:e.isTrusted,ended:a.ended}));return a}});
 window.fixtureSnapshot=()=>{const a=fixtureAudios.at(-1);return{report:WarzoneMapMusic.report(),count:fixtureAudios.length,audio:a?{native:a instanceof HTMLAudioElement,time:a.currentTime,duration:a.duration,paused:a.paused,ready:a.readyState,error:a.error?.code||0}:null,events:fixtureEvents}};
 </script><script src="/warzone/music-catalog.js"></script><script src="/multiplayer/music.js"></script><script>document.querySelector('#blocknight-music').onclick=e=>WarzoneMapMusic.showMenu(e.currentTarget);</script>`;}
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local'),name=decodeURIComponent(url.pathname);
  if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(name==='/multiplayer/engine.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end(page());return;}
  if(name.startsWith('/warzone/optional/map-music/')){
   const id=name.slice('/warzone/optional/map-music/'.length),entry=catalog.files.find(e=>e.filename==='/data/music/albums/'+id);
   if(!entry||req.method!=='GET'||req.headers.range){res.writeHead(416);res.end();return;}
   const record={id,bytes:0,expected:entry.end-entry.start};streams.push(record);const hash=crypto.createHash('sha256');
   res.writeHead(200,{'Content-Type':'audio/ogg','Content-Length':record.expected,'Cache-Control':'no-store'});
   const input=fs.createReadStream(pack,{start:entry.start,end:entry.end-1});input.on('data',b=>{record.bytes+=b.length;hash.update(b);});input.on('end',()=>{record.sha256=hash.digest('hex');record.original=record.sha256===entry.sha256;});input.pipe(res);return;
  }
  if(!['/warzone/music-catalog.js','/multiplayer/music.js','/warzone/ui/towers-monochrome.css'].includes(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css':'text/javascript'});fs.createReadStream(path.join(assets,name.slice(1))).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let edge,ws,serial=0;const pending=new Map(),delay=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(fn,label){const limit=Date.now()+8000;while(Date.now()<limit){try{const value=await fn();if(value)return value;}catch{}await delay(35);}throw Error('Timed out: '+label);}
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},8000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
 const snap=()=>evaluate('fixtureSnapshot()');
 async function playing(label){return until(async()=>{const s=await snap();if(s.report.error)throw Error(s.report.error);return s.report.playing&&s.audio?.native&&s.audio.duration>1&&s.audio.ready>=2?s:false;},label);}
 try{
  edge=cp.spawn(edgePath,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--mute-audio','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const port=await until(()=>{const p=path.join(profile,'DevToolsActivePort');return fs.existsSync(p)?Number(fs.readFileSync(p,'utf8').split('\n')[0]):0;},'isolated Edge');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  ws.addEventListener('message',event=>{const p=JSON.parse(String(event.data));if(p.method==='Runtime.exceptionThrown')exceptions.push(p.params.exceptionDetails.text);const item=pending.get(p.id);if(item){pending.delete(p.id);clearTimeout(item.timer);p.error?item.reject(Error(p.error.message)):item.resolve(p.result);}});
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:640,height:320,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/multiplayer/engine.html?battle_session=mp-browser-session'});await until(()=>evaluate("document.readyState==='complete'&&Boolean(window.WarzoneMapMusic)"),'MP generated loader');
  assert.equal((await snap()).count,0);await evaluate('WarzoneMapMusic.setBattleActive(true)');const first=await playing('actual original Opus decode');
  await until(async()=>{const s=await snap();return s.audio.time>.12;},'real media clock advances');browserChecks.push('Original Opus decodes in real HTMLAudioElement and media clock advances');
  await evaluate("document.getElementById('blocknight-music').click()");
  const menu=await evaluate(`(()=>{const m=document.querySelector('#wt-map-music-menu'),b=document.querySelector('#blocknight-music'),r=m.getBoundingClientRect(),on=m.querySelector('[data-music-enabled=true]');return{open:WarzoneMapMusic.report().menuOpen,active:b.classList.contains('active'),aria:b.getAttribute('aria-expanded'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,onHeight:on.getBoundingClientRect().height,background:getComputedStyle(m).backgroundColor,onBackground:getComputedStyle(on).backgroundColor}})()`);
  assert.equal(menu.open,true);assert.equal(menu.active,true);assert.equal(menu.aria,'true');assert(menu.left>=0&&menu.right<=640&&menu.top>=0&&menu.bottom<=320);assert(menu.onHeight>=44);assert.equal(menu.background,'rgb(17, 17, 17)');assert.equal(menu.onBackground,'rgb(244, 244, 244)');
  const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,'music-menu-640x320.png'),Buffer.from(image.data,'base64'));
  await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");assert.equal(await evaluate("document.querySelector('#blocknight-music').classList.contains('active')"),false);assert.equal((await snap()).report.menuOpen,false);browserChecks.push('Compact monochrome menu fits640x320 and outside close immediately clears header active state');
  await evaluate('WarzoneMapMusic.setSuspended(true)');const paused=await snap();assert(paused.audio.paused&&paused.report.retained);await evaluate('WarzoneMapMusic.setSuspended(false)');const resumed=await playing('real retained-media resume');assert.equal(resumed.count,paused.count);assert.equal(resumed.report.trackId,paused.report.trackId);assert(resumed.audio.time>=paused.audio.time-.05);browserChecks.push('Background pause/resume retains actual decoded Audio and position');
  await evaluate('WarzoneMapMusic.setEnabled(false)');assert.equal((await snap()).report.playing,false);await evaluate('WarzoneMapMusic.setEnabled(true)');const on=await playing('real ON retry');assert.equal(on.report.trackId,first.report.trackId);assert(on.count>first.count);browserChecks.push('Private bridge OFF/ON stops and resumes the selected song');
  await evaluate('(()=>{const a=fixtureAudios.at(-1);a.currentTime=a.duration-.10;a.playbackRate=4;})()');
  const next=await until(async()=>{const s=await snap();return s.report.playing&&s.report.trackId!==on.report.trackId?s:false;},'real browser natural end advances');assert(next.events.some(e=>e.name==='ended'&&e.trusted));assert(next.audio.native&&next.audio.ready>=2);browserChecks.push('Trusted natural ended event advances to another original song');
  await evaluate('WarzoneMapMusic.dispose()');assert.equal((await snap()).report.playing,false);assert.equal((await snap()).report.disposed,true);assert.deepEqual(exceptions,[]);assert(streams.every(s=>s.original&&s.bytes===s.expected));
  const report={passed:true,checks:browserChecks,actualChromiumHTMLAudio:true,originalOpusBytes:true,engineExecuted:false,emulatorUsed:false,androidPlaybackVerified:false,speakerOutputVerified:false,hostOutputMuted:true,seekNearEnd:true,menu,streams,exceptions,sourceSHA256:sha(path.join(assets,'multiplayer/music.js'))};
  fs.writeFileSync(path.join(out,'music-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,browserChecks:browserChecks.length,originalStreams:streams.length,emulatorUsed:false}));
 }finally{for(const p of pending.values())clearTimeout(p.timer);ws?.close();edge?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
(async()=>{await host();if(process.argv.includes('--browser'))await browser();console.log(checks.length+' focused MP music host checks passed.');})().catch(error=>{console.error(error.stack);process.exitCode=1;});
