/* Actual shipped Hub HTML/CSS/JS in isolated host Chromium. Worker messages are
 * synthetic fixtures unless a retained bounded live sample is explicitly used.
 * This is not an Android/emulator, native game or complete-history rating test. */
'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict'),vm=require('vm');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets'),out=path.join(root,'qa/hub-replay-095');
const runLive=process.argv.includes('--live');
const liveOnly=process.argv.includes('--live-only');
const argument=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1]};
const reuseProfile=argument('--reuse-profile'),reusePort=Number(argument('--port'))||0;
fs.mkdirSync(out,{recursive:true});
const sourceFiles=['app/src/main/assets/hub/index.html','app/src/main/assets/hub/hub.css','app/src/main/assets/hub/hub.js','app/src/main/assets/hub/hub-data.js','app/src/main/assets/hub/hub-worker.js','app/src/main/assets/warzone/ui/Oswald.ttf','app/src/main/java/com/rbabbit/blocknight/warzone/HubView.java','tools/test-hub-replay-ui-095.cjs','tools/fixtures/hub-075/public-sample.json'];
const sample=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/hub-075/public-sample.json'),'utf8'));
const dataContext=vm.createContext({atob});vm.runInContext(fs.readFileSync(path.join(assets,'hub/hub-data.js'),'utf8'),dataContext);
const data=dataContext.WarzoneHubData,liveModel=data.calculate(sample.results.map(row=>data.normalize(row,row.id)),sample.playerPublicKeys,sample.playerSpoiledPublicKeys,'global',false);
const liveFixture=JSON.parse(JSON.stringify({matches:liveModel.games,rankings:liveModel.rankings}));
const fixture=`<script>
window.liveHubSample=${JSON.stringify(liveFixture).replace(/</g,'\\u003c')};
window.hubFixture={messages:[],workers:[],mode:'normal',complete:false};
(function(){
const f=hubFixture;
f.matches=Array.from({length:35},(_,i)=>({id:'match-'+i,mapName:i===0?'Canyon Run':'Map '+(i+1),startDate:1767001487157+i*1000000,endDate:1767003407157+i*1000000,duration:i===1?null:1920000,playerCount:4,version:'4.7.0',valid:i!==2,ratingReason:i===2?'Uneven teams':null,replayUrl:i===0?'javascript:alert(1)':null,players:[{id:'alpha',name:'Alpha',outcome:'winner',researchRatio:.87,researchRecorded:true,team:0},{id:'beta',name:'Beta',outcome:'loser',researchRatio:null,team:1},{id:'gamma',name:'Gamma',outcome:'contender',researchRatio:.61,researchRecorded:true,team:0},{id:'observer',name:'Observer',outcome:'spectator',researchRatio:null}]}));
f.rankings=Array.from({length:12},(_,i)=>({id:i===0?'alpha':'player-'+i,name:i===0?'Alpha':i===1?'<img src=x onerror=alert(1)>':'Player '+(i+1),rank:i+1,rating:i===2?null:1600-i*15,games:24+i,wins:14,losses:8,draws:2,researchRatio:.81,researchRecorded:true,eligible:i!==2}));
f.worker=()=>f.workers.at(-1);
f.emit=message=>f.worker().emit(message);
f.ready=(complete=true,status='ready')=>{f.complete=complete;f.emit({type:'state',status,summary:{complete,gameCount:35,playerCount:12,lastUpdated:1794664500000}})};
f.answer=m=>{
 if(f.mode==='query-error'){f.emit({type:'error',requestId:m.requestId,message:'Fixture query failed'});return;}
 let items=[],extra={};
 if(m.view==='match')extra.match=f.matches.find(x=>x.id===m.matchId)||null;
 else if(m.view==='player'){extra.player=f.rankings.find(x=>x.id===m.playerId)||null;items=f.matches.filter(x=>x.players.some(p=>p.id===m.playerId));}
 else if(m.view==='rankings')items=f.rankings.filter(x=>x.name.toLowerCase().includes((m.search||'').toLowerCase()));
 else items=f.matches.filter(x=>(x.mapName+' '+x.players.map(p=>p.name).join(' ')).toLowerCase().includes((m.search||'').toLowerCase()));
 if(f.mode==='empty')items=[];
 f.emit(Object.assign({type:'result',requestId:m.requestId,view:m.view,total:items.length,offset:m.offset||0,items:items.slice(m.offset||0,(m.offset||0)+(m.limit||30))},extra));
};
window.Worker=class{
 constructor(url){this.url=url;this.listeners={};this.terminated=false;f.workers.push(this)}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn)}
 postMessage(m){f.messages.push(structuredClone(m));if(m.type==='query')queueMicrotask(()=>{if(!this.terminated)f.answer(m)})}
 emit(data){if(!this.terminated)for(const fn of this.listeners.message||[])fn({data})}
 terminate(){this.terminated=true}
};
})();
</script>`;
const badRequests=[],exceptions=[],checks=[],viewports=[],screenshots=[];let liveBrowser=null;
function pass(name){checks.push(name);console.log('PASS '+name)}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'};
const csp="default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; worker-src 'self'; connect-src https://warzone2100.retropaganda.info; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'";
const server=http.createServer((req,res)=>{let name,url;try{url=new URL(req.url,'http://fixture');name=decodeURIComponent(url.pathname)}catch{res.writeHead(400);res.end();return}
 if(name==='/assets/hub/replay/index.html'){
  res.writeHead(200,{'Content-Type':'text/html'});res.end(`<html><body><script>
   parent.hubFixture.replayEvents.push('loaded');
   for(const name of ['warzone-hub-pause','warzone-hub-resume'])addEventListener(name,()=>parent.hubFixture.replayEvents.push(name));
   window.WarzoneReplay={dispose:()=>parent.hubFixture.replayEvents.push('dispose')};
  </script></body></html>`);return;
 }
 if(name==='/favicon.ico'){res.writeHead(204);res.end();return}
 let file=path.resolve(assets,'.'+name.replace(/^\/assets/,''));
 if(!file.startsWith(assets+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){badRequests.push(name);res.writeHead(404);res.end();return}
 const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'};
 if(url.searchParams.has('live')||file===path.join(assets,'hub/hub-worker.js')||file===path.join(assets,'hub/hub-data.js'))headers['Content-Security-Policy']=csp;
 res.writeHead(200,headers);
 if(file===path.join(assets,'hub/index.html'))res.end(url.searchParams.has('live')?fs.readFileSync(file):fs.readFileSync(file,'utf8').replace('<script src="hub.js"',fixture+'<script src="hub.js"'));
 else fs.createReadStream(file).pipe(res);
});
let edge,ws,serial=0,blockWorkerRemote=false;const pending=new Map(),blockedWorkerTargets=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=8000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const value=await fn();if(value)return value}catch(error){last=error}await delay(25)}throw Error('Timeout '+label+(last?': '+last.message:''))}
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},8000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
async function evaluate(expression){const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result?.value}
async function click(selector){assert(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.click();return true})()`),'Missing/enabled selector '+selector)}
const geometry=`(()=>{const box=e=>{const b=e.getBoundingClientRect();return{left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}},main=document.querySelector('#hub-main');return{viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,main:box(main),scrollHeight:main.scrollHeight,clientHeight:main.clientHeight,scrollWidth:main.scrollWidth,clientWidth:main.clientWidth,rows:document.querySelectorAll('.result-row,.ranking-row').length,buttons:[...document.querySelectorAll('button,input')].filter(e=>e.getClientRects().length).map(e=>({id:e.id||e.className,box:box(e),font:getComputedStyle(e).fontSize})),source:box(document.querySelector('#hub-source')),header:box(document.querySelector('.hub-header')),status:box(document.querySelector('.hub-statusline'))}})()`;
async function ready(){await evaluate('hubFixture.ready(true)');await until(()=>evaluate("document.querySelectorAll('.result-row').length===30"),'result rows')}
async function fresh(origin,width=800,height=360,scale=1){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:origin+'/assets/hub/index.html'});await until(()=>evaluate("document.readyState==='complete'&&Boolean(window.WarzoneHub)&&hubFixture.messages.some(m=>m.type==='load')"),'Hub installed');await evaluate(`document.documentElement.style.fontSize=${JSON.stringify(14*scale+'px')}`);await until(()=>evaluate("document.fonts.status==='loaded'"),'Oswald font')}
(async()=>{let fatal;try{
 await new Promise(r=>server.listen(reusePort,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const profile=reuseProfile||fs.mkdtempSync(path.join(os.tmpdir(),'hub-ui-075-'));
 edge=cp.spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const tabs=await until(async()=>{const name=path.join(profile,'DevToolsActivePort');if(!fs.existsSync(name))return false;const port=Number(fs.readFileSync(name,'utf8').split('\n')[0]);return await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()},'isolated Edge');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
 ws.addEventListener('message',event=>{const p=JSON.parse(String(event.data));if(p.method==='Runtime.exceptionThrown')exceptions.push(p.params.exceptionDetails.exception?.description||p.params.exceptionDetails.text);
  if(p.method==='Target.attachedToTarget'){(async()=>{const id=p.params.sessionId;if(p.params.targetInfo.type==='worker'&&blockWorkerRemote){await send('Network.enable',{},id);await send('Network.setBlockedURLs',{urls:['https://warzone2100.retropaganda.info/*']},id);blockedWorkerTargets.push(p.params.targetInfo.targetId)}await send('Runtime.runIfWaitingForDebugger',{},id)})().catch(e=>exceptions.push(e.message))}
  const item=pending.get(p.id);if(item){pending.delete(p.id);clearTimeout(item.timer);p.error?item.reject(Error(p.error.message)):item.resolve(p.result)}});
 await send('Page.enable');await send('Runtime.enable');
 if(!liveOnly){await fresh(origin);
 assert(await evaluate("document.querySelector('#hub-main').textContent.includes('Loading game information')"));
 assert.equal(await evaluate('hubFixture.worker().url'),'hub-worker.js');pass('Initial loading uses isolated Hub worker and compact page');
 await evaluate("hubFixture.emit({type:'state',status:'error',message:'Fixture network unavailable'})");assert(await evaluate("document.querySelector('#hub-status').textContent.includes('Fixture network unavailable')"));
 await click('#hub-main button');assert(await evaluate("hubFixture.messages.filter(m=>m.type==='load').length>=2"));await ready();pass('Load error and retry recover through actual controls');
 assert.equal(await evaluate('document.querySelectorAll(".result-row").length'),30);assert(await evaluate("document.querySelector('#hub-page-count').textContent.includes('1–30 of 35')"));
 await click('#hub-next');await until(()=>evaluate('document.querySelectorAll(".result-row").length===5'),'next page');assert(await evaluate("document.querySelector('#hub-page-count').textContent.includes('31–35 of 35')"));await click('#hub-previous');await until(()=>evaluate('document.querySelectorAll(".result-row").length===30'),'previous page');pass('Paged results keep bounded rows and correct next/previous totals');
 await click('.result-row .row-main');await until(()=>evaluate("WarzoneHub.report().view==='match'&&document.querySelectorAll('.detail-player').length===4"),'match details');
 assert(await evaluate("document.querySelector('#hub-main').textContent.includes('Winner')&&document.querySelector('#hub-main').textContent.includes('87%')&&document.querySelector('#hub-main').textContent.includes('Spectator')"));assert.equal(await evaluate("document.querySelectorAll('.replay-link').length"),0);
 await click('.detail-player .player-link');await until(()=>evaluate("WarzoneHub.report().view==='player'&&document.querySelector('.player-stats')"),'player details');
 assert(await evaluate("document.querySelector('#hub-main').textContent.includes('Recent matches')"));assert(await evaluate('WarzoneHub.back()'));await until(()=>evaluate("WarzoneHub.report().view==='match'&&document.querySelector('.detail-player')"),'back to match');assert(await evaluate('WarzoneHub.back()'));await until(()=>evaluate("WarzoneHub.report().view==='results'&&document.querySelector('.result-row')"),'back to results');assert.equal(await evaluate('WarzoneHub.back()'),false);pass('Match/player drilldown and native Back restore previous content; unsafe replay rejected');
 await evaluate("document.querySelector('#hub-search').value='Canyon';document.querySelector('#hub-search').dispatchEvent(new Event('input'))");await until(()=>evaluate("hubFixture.messages.at(-1).type==='query'&&hubFixture.messages.at(-1).search==='Canyon'&&document.querySelectorAll('.result-row').length===1"),'search query');pass('Debounced search queries actual worker contract');
 await click('#tab-rankings');await until(()=>evaluate('document.querySelectorAll(".ranking-row").length===12'),'rankings');
 assert.equal(await evaluate('document.querySelectorAll("#hub-main img").length'),0);assert(await evaluate("document.querySelector('#hub-main').textContent.includes('<img src=x onerror=alert(1)>')"));assert(!await evaluate("document.querySelector('#hub-main').textContent.includes('NaN')"));
 await click('[data-board="1v1"]');assert.equal(await evaluate('hubFixture.messages.at(-1).board'),'1v1');await click('[data-board="ffa"]');assert.equal(await evaluate('hubFixture.messages.at(-1).board'),'ffa');pass('Rankings categories, missing rating and untrusted player names render safely');
 await evaluate('hubFixture.ready(false)');await click('#tab-rankings');await until(()=>evaluate("document.querySelector('#hub-main').textContent.includes('complete history')"),'incomplete rating gate');assert.equal(await evaluate('document.querySelectorAll(".ranking-row").length'),0);pass('Incomplete history never presents calculated rankings');
 await evaluate('hubFixture.ready(true,"offline")');await click('#tab-results');await until(()=>evaluate('document.querySelectorAll(".result-row").length===30'),'offline saved results');assert(await evaluate("document.querySelector('#hub-status').textContent.includes('Offline')"));
 await evaluate("hubFixture.mode='empty';document.querySelector('#hub-search').value='missing';document.querySelector('#hub-search').dispatchEvent(new Event('input'))");await until(()=>evaluate("document.querySelector('#hub-main').textContent.includes('No matches found')"),'empty search');pass('Offline cached results and empty searches have clear, separate states');
 await evaluate("hubFixture.mode='query-error'");await click('#tab-results');await until(()=>evaluate("document.querySelector('#hub-main').textContent.includes('Fixture query failed')"),'query error');pass('Query errors show recovery without stale result claims');
 await evaluate("hubFixture.mode='normal';dispatchEvent(new Event('warzone-hub-pause'))");assert(await evaluate("WarzoneHub.report().paused&&hubFixture.workers[0].terminated&&hubFixture.messages.at(-1).type==='cancel'"));await evaluate("dispatchEvent(new Event('warzone-hub-resume'))");assert.equal(await evaluate('hubFixture.workers.length'),2);assert.equal(await evaluate('hubFixture.messages.at(-1).type'),'load','New worker must restore IndexedDB even when lastResult is retained');await ready();await evaluate('WarzoneHub.dispose()');assert(await evaluate('WarzoneHub.report().disposed&&!WarzoneHub.report().workerActive&&hubFixture.worker().terminated'));pass('Native pause/resume and disposal cancel/terminate worker; fresh worker always loads saved cache');
 for(const[width,height,scale]of[[1164,554,1],[800,360,1],[600,300,1],[600,300,1.3],[360,300,1.3]]){
  await fresh(origin,width,height,scale);await ready();
  for(const view of['results','rankings']){
   if(view==='rankings'){await click('#tab-rankings');await until(()=>evaluate('document.querySelectorAll(".ranking-row").length===12'),'viewport rankings')}
   const g=await evaluate(geometry);assert(g.main.width>0&&g.main.height>=45,'No usable scroll area');assert(g.documentWidth<=width+1&&g.bodyWidth<=width+1&&g.scrollWidth<=g.clientWidth+1,'Horizontal overflow');assert(g.main.left>=0&&g.main.right<=width+1&&g.main.bottom<=height+1,'Content clipped');assert(g.source.right<=width+1,'Source link clipped');assert(g.scrollHeight>g.clientHeight,'Long lists must scroll');
   for(const b of g.buttons.filter(x=>!['row-main','player-link'].includes(x.id))){assert(b.box.left>=-1&&b.box.right<=width+1,'Control horizontal clipping '+b.id);assert(b.box.height>=35,'Control target too small '+b.id)}
   const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),name=`ui-${view}-${width}x${height}-${String(scale).replace('.','_')}.png`;fs.writeFileSync(path.join(out,name),Buffer.from(shot.data,'base64'));screenshots.push(name);viewports.push({view,width,height,fontScale:scale,passed:true,geometry:g});
  }
 }
 pass('Actual shipped page scrolls without horizontal clipping at five sizes/font settings');assert.deepEqual(exceptions,[]);assert.deepEqual(badRequests,[]);
 await fresh(origin,800,360,1);
 await evaluate("hubFixture.matches=liveHubSample.matches;hubFixture.rankings=liveHubSample.rankings;hubFixture.emit({type:'state',status:'loading',progress:{records:liveHubSample.matches.length},summary:{complete:false,gameCount:liveHubSample.matches.length,lastUpdated:null}})");
 await until(()=>evaluate('document.querySelectorAll(".result-row").length===30'),'bounded actual public sample during partial sync');
 assert.equal(await evaluate("document.querySelector('.result-row strong').textContent"),liveFixture.matches[0].mapName);
 assert(await evaluate("document.querySelector('#hub-status').textContent.includes('Syncing')"));
 for(const[view,action]of[['live-results',null],['live-match',()=>click('.result-row .row-main')],['live-player',()=>click('.detail-player .player-link')]]){
  if(action){await action();await until(()=>evaluate(view==='live-match'?"Boolean(document.querySelector('.detail-player'))":"Boolean(document.querySelector('.player-stats'))"),view)}
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),name='ui-'+view+'-800x360.png';fs.writeFileSync(path.join(out,name),Buffer.from(shot.data,'base64'));screenshots.push(name);
 }
 assert(await evaluate("document.querySelector('.player-stats').textContent.includes('—')"));pass('Bounded48 actual public records render results/match/player details during incomplete sync without invented ratings');
 }

 await fresh(origin,800,360,1);await ready();
 await evaluate("hubFixture.replayEvents=[];document.querySelector('#hub-search').value='Canyon';document.querySelector('#hub-search').dispatchEvent(new Event('input'))");
 await until(()=>evaluate("document.querySelectorAll('.result-row').length===1&&WarzoneHub.report().search==='Canyon'"),'replay filtered list');
 await click('.result-row .row-main');await until(()=>evaluate("WarzoneHub.report().view==='match'&&Boolean(document.querySelector('.watch-replay'))"),'replay match button');
 const originalRoute=await evaluate('WarzoneHub.report()');
 for(const bad of [null,'javascript:alert(1)','https://evil.test/replays/1794989715726.wzrp','http://warzone2100.retropaganda.info/replays/1794989715726.wzrp','https://user@warzone2100.retropaganda.info/replays/1794989715726.wzrp','https://warzone2100.retropaganda.info/replays/1794989715726.wzrp?x=1','https://warzone2100.retropaganda.info/replays/1794989715726.wzrp#x']){
  await evaluate(`hubFixture.matches[0].replayUrl=${JSON.stringify(bad)};hubFixture.answer(hubFixture.messages.filter(m=>m.type==='query').at(-1))`);
  assert(await evaluate("document.querySelector('.watch-replay').disabled&&!WarzoneHub.report().replayActive&&document.querySelector('.replay-unavailable').textContent.includes('unavailable')"));
 }
 pass('Watch Replay rejects missing/unsafe URL without creating a viewer or executing markup');
 for(let repeat=0;repeat<3;repeat++){
  const replay='https://warzone2100.retropaganda.info/replays/1794989715726.wzrp';
  await evaluate(`hubFixture.matches[0].replayUrl=${JSON.stringify(replay)};hubFixture.answer(hubFixture.messages.filter(m=>m.type==='query').at(-1))`);
  const before=await evaluate("({route:WarzoneHub.report(),scroll:document.querySelector('#hub-main').scrollTop,main:document.querySelector('#hub-main')})");
  await click('.watch-replay');await until(()=>evaluate("WarzoneHub.report().replayActive&&hubFixture.replayEvents.at(-1)==='loaded'"),'iframe initialized');
  assert(await evaluate("document.querySelectorAll('#hub-replay-frame').length===1&&document.querySelector('#hub-replay-frame').src.includes('/assets/hub/replay/index.html?replay=https%3A%2F%2Fwarzone2100.retropaganda.info%2Freplays%2F1794989715726.wzrp')&&getComputedStyle(document.querySelector('#hub-app')).visibility==='hidden'"));
  const bounds=await evaluate("(()=>{const r=document.querySelector('#hub-replay-frame').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()");assert.deepEqual(bounds,[0,0,800,360]);
  if(repeat===0){
   await evaluate("dispatchEvent(new Event('warzone-hub-pause'))");assert(await evaluate("hubFixture.replayEvents.includes('warzone-hub-pause')&&WarzoneHub.report().paused"));
   await evaluate("dispatchEvent(new Event('warzone-hub-resume'))");assert(await evaluate("hubFixture.replayEvents.includes('warzone-hub-resume')&&!WarzoneHub.report().paused&&WarzoneHub.report().replayActive"));await evaluate('hubFixture.ready(true)');await until(()=>evaluate("document.querySelector('.watch-replay')&&!document.querySelector('.watch-replay').disabled"),'resumed current match');
  }
  assert(await evaluate('WarzoneHub.back()'));assert(await evaluate("!document.querySelector('#hub-replay-frame')&&!WarzoneHub.report().replayActive&&getComputedStyle(document.querySelector('#hub-app')).visibility!=='hidden'&&hubFixture.replayEvents.at(-1)==='dispose'"));
  const after=await evaluate('WarzoneHub.report()');for(const key of ['view','board','search','offset','historyDepth'])assert.equal(after[key],originalRoute[key],key+' preserved');
 }
 pass('Three Watch/Back cycles retain Hub match/search/history; viewer fills viewport and is disposed on Back');
 pass('Parent pause/resume reaches viewer without leaving Hub route (viewer lifecycle is an inert boundary fixture)');
 assert(await evaluate('WarzoneHub.back()'));await until(()=>evaluate("WarzoneHub.report().view==='results'&&document.querySelectorAll('.result-row').length===1"),'back filtered list');assert.equal(await evaluate("document.querySelector('#hub-search').value"),'Canyon');
 await evaluate('WarzoneHub.dispose()');assert(await evaluate('WarzoneHub.report().disposed&&!WarzoneHub.report().replayActive'));

 if(runLive){
  await send('Emulation.setDeviceMetricsOverride',{width:600,height:300,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:origin+'/assets/hub/index.html?live=1'});
  await until(()=>evaluate("document.readyState==='complete'&&Boolean(window.WarzoneHub)"),'actual Worker installed');
  assert.equal(await evaluate('typeof window.hubFixture'),'undefined','Live pass must not replace the Worker');
  console.log('LIVE waiting for actual public stream/Worker/IndexedDB sync');
  await until(()=>evaluate("WarzoneHub.report().summary.complete&&WarzoneHub.report().status==='ready'&&document.querySelectorAll('.result-row').length>0"),'actual complete public history',60000);
  const loaded=await evaluate('WarzoneHub.report()');assert(loaded.summary.gameCount>48,'Live pass cannot use bounded fixture as full history');
  liveBrowser={passed:false,completeSync:true,fullHistoryGames:loaded.summary.gameCount};
  const capture=async label=>{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),name='ui-actual-'+label+'-600x300.png';fs.writeFileSync(path.join(out,name),Buffer.from(shot.data,'base64'));screenshots.push(name)};
  await capture('results');await click('#tab-rankings');await until(()=>evaluate("document.querySelectorAll('.ranking-row').length>0"),'actual rankings');
  const topPlayer=await evaluate("document.querySelector('.ranking-row .player-link strong').textContent"),topRating=await evaluate("document.querySelector('.ranking-row .row-fact b').textContent");assert(topPlayer.length);assert(/^[\d,.\s]+$/.test(topRating),'Actual top rating must be finite');await capture('rankings');
  await click('.ranking-row .player-link');await until(()=>evaluate("Boolean(document.querySelector('.player-stats'))&&document.querySelectorAll('.detail-history .result-row').length>0"),'actual player');await capture('player');
  await click('.detail-history .result-row .row-main');await until(()=>evaluate("document.querySelectorAll('.detail-player').length>0"),'actual match');await capture('match');
  assert(!await evaluate("document.querySelector('#hub-main').textContent.includes('NaN')"));
  assert(await evaluate('WarzoneHub.back()'));await until(()=>evaluate("WarzoneHub.report().view==='player'&&document.querySelector('.player-stats')"),'actual back to player');assert(await evaluate('WarzoneHub.back()'));await until(()=>evaluate("WarzoneHub.report().view==='rankings'&&document.querySelector('.ranking-row')"),'actual back to rankings');assert.equal(await evaluate('WarzoneHub.back()'),false);
  blockWorkerRemote=true;
  await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
  await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://warzone2100.retropaganda.info/*']});
  await evaluate("dispatchEvent(new Event('warzone-hub-pause'));dispatchEvent(new Event('warzone-hub-resume'))");
  await until(()=>evaluate("WarzoneHub.report().status==='offline'&&WarzoneHub.report().summary.complete&&WarzoneHub.report().summary.cached"),'actual saved IndexedDB offline cache',20000);
  assert.equal((await evaluate('WarzoneHub.report()')).summary.gameCount,loaded.summary.gameCount);await until(()=>evaluate("document.querySelectorAll('.ranking-row').length>0"),'offline cached rankings');assert.equal(await evaluate("document.querySelector('.ranking-row .player-link strong').textContent"),topPlayer);assert.equal(await evaluate("document.querySelector('.ranking-row .row-fact b').textContent"),topRating);await capture('offline-rankings');
  assert(blockedWorkerTargets.length>0,'Remote feed must be blocked on the actual dedicated Worker target');
  liveBrowser={passed:true,actualWorker:true,actualRemoteFetch:true,actualIndexedDB:true,matchingNativeCSP:csp,fullHistoryGames:loaded.summary.gameCount,topPlayer,topRating,offlineCacheRestored:true,offlineRankingsPreserved:true,remoteOnlyBlocked:true,blockedDedicatedWorkerTargets:blockedWorkerTargets.length,preparedCacheReused:Boolean(reuseProfile),detailBackPassed:true,androidWebViewExecuted:false};
  await evaluate('WarzoneHub.dispose()');assert(await evaluate('WarzoneHub.report().disposed&&!WarzoneHub.report().workerActive'));await send('Network.setBlockedURLs',{urls:[]});
  pass('Actual Worker/fetch/SSE/full-history rankings/details/IndexedDB cache/offline reload pass under native CSP');
 }
 assert.deepEqual(exceptions,[]);assert.deepEqual(badRequests,[]);
}catch(error){fatal=error.stack||String(error);console.error(fatal);process.exitCode=1;try{fs.writeFileSync(path.join(out,'ui-failure.json'),JSON.stringify(await evaluate(geometry),null,2));const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'ui-failure.png'),Buffer.from(shot.data,'base64'))}catch{}}
finally{try{if(ws?.readyState===WebSocket.OPEN)await send('Browser.close')}catch{}for(const item of pending.values())clearTimeout(item.timer);ws?.close();edge?.kill();server.closeAllConnections();await new Promise(r=>server.close(r))}
const proof={version:'0.95',passed:!fatal,emulatorUsed:false,actualAndroidViewsExecuted:false,actualNativeEngineExecuted:false,hostBrowserRendered:true,syntheticFixturesExecuted:!liveOnly,fixture:'Replay iframe lifecycle boundary is an inert stub, not actual replay playback. Actual shipped Hub HTML/CSS/JS; deterministic synthetic worker messages/records plus48 retained real public summary records transformed by actual hub-data.js with complete:false. Optional live pass uses actual Worker/fetch/SSE/IndexedDB under matching native CSP. Android navigation/rendering are not verified.',liveSample:{source:sample.source,scope:sample.scope,records:sample.results.length,completeHistory:false,ratingsCalculated:false},liveBrowser,checksPassed:checks.length,checks,viewports,screenshots,exceptions,badRequests,fatal:fatal||null,sources:sourceFiles.map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}))};fs.writeFileSync(path.join(out,runLive?'ui-live-checks.json':'ui-checks.json'),JSON.stringify(proof,null,2)+'\n');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
