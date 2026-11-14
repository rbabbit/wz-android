/* Actual shared Research renderer, original artwork and shipped CSS in offline
 * host Edge. BNTECH/BNQUEUE packets and FS acknowledgements are fixtures.
 * No native engine, Android, emulator, public lobby or gameplay execution. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),http=require('node:http'),cp=require('node:child_process'),os=require('node:os');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets'),out=path.join(root,'qa/research-assignment-078');fs.mkdirSync(out,{recursive:true});
const sourceFiles=['app/src/main/assets/warzone-mobile-research.js','app/src/main/assets/warzone/ui/towers-research.css','app/src/main/assets/warzone/ui/research-art.js','tools/test-research-assignment-browser-078.cjs'];
const topics=[
 {id:'R-Vehicle-Body05',name:'Medium Body - Cobra',points:1200,power:37,category:'VEHICLES'},
 {id:'R-Vehicle-Metals01',name:'Composite Alloys',points:1800,power:56,category:'VEHICLES'},
 {id:'R-Struc-Factory-Upgrade01',name:'Automated Manufacturing',points:2400,power:75,category:'SYSTEMS'},
 {id:'R-Defense-MortarPit',name:'Mortar Pit',points:600,power:18,category:'DEFENCE'},
 {id:'R-Struc-RepairFacility',name:'Repair Facility',points:2400,power:75,category:'STRUCTURES'},
 {id:'R-Vehicle-Engine03',name:'Fuel Injection Engine Mk3',points:4800,power:150,category:'VEHICLES'}
].map((topic,nativeIndex)=>({...topic,nativeIndex,started:false,done:false}));
const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
function page(mode){return `<!doctype html><meta charset="utf-8"><base href="/warzone/"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Actual Research renderer fixture</title><link rel="stylesheet" href="ui/towers-shell.css"><link rel="stylesheet" href="ui/towers-monochrome.css"><link rel="stylesheet" href="ui/towers-game-controls.css"><style>html,body{position:fixed;inset:0;margin:0;width:100%;height:100%;overflow:hidden;background:#090909}canvas{display:block;width:100%;height:100%;background:#090909 url('/fixture/battlefield.png') center/cover no-repeat;outline:none}</style><body class="${mode==='duel'?'':'wt-towers-polished'}"><canvas id="canvas" tabindex="0"></canvas><script>
 window.__warzoneCampaignMode=${mode==='campaign'};window.__warzoneMultiplayerMode=${mode==='multiplayer'};window.__warzoneDuelConfig={mode:${js(mode==='duel'?'duel':'')}};
 window.__warzoneFfaConfig={mode:${js(mode==='ffa'?'ffa':'')}};window.PcMultiplayerNative={state:{player:${mode==='multiplayer'?2:0}}};
 window.__towersHtml={isEnded:()=>false,consume:()=>true};window.fixtureWrites=[];window.fixtureFailWrites=false;
 window.Module={FS:{writeFile(path,text){if(fixtureFailWrites)throw Error('Fixture queue-link unavailable');fixtureWrites.push({path,command:JSON.parse(text)})},rename(){}}};
 window.__kalaWarzoneTouch={setHeaderMenuState(){},closeHelp(){},releaseAll(){},report:()=>({})};
 window.__warzoneCommands={close(){},closeNative(){}};window.__warzoneCampaign={nativeUiActive:()=>false};
 const topics=${js(topics)};const player=${mode==='multiplayer'?2:0};
 const labs=Array.from({length:5},(_,i)=>({id:101+i,nativeIndex:i,idle:![0,2].includes(i),topicId:i===0?topics[0].id:i===2?topics[2].id:'',topicName:i===0?topics[0].name:i===2?topics[2].name:'',estimatedProgress:i===0?.58:i===2?.34:0,remainingSeconds:i===0?24:i===2?48:null}));
 const emit=(marker,value)=>dispatchEvent(new CustomEvent('blocknight-engine-output',{detail:{text:marker+JSON.stringify(value)}}));
 window.fixture={topics,labs,emit,
  seed(){emit('BNTECH:',{player,gameTime:60000,power:4455,topics,labs});emit('BNQUEUE:',{gameTime:60000,queues:[{labId:101,topicIds:[topics[1].id]},{labId:103,topicIds:[topics[3].id]}]});emit('BNTECH:',{player,gameTime:60001,power:4455,topics:topics.slice(4),labs});return __blockNightResearch.open()},
  unknown(){labs[4]={...labs[4],idle:false,topicId:'R-Observed-No-Metadata',topicName:'Observed Field Upgrade Without Catalogue Metadata'};delete labs[4].estimatedProgress;delete labs[4].remainingSeconds;emit('BNTECH:',{player,gameTime:61000,power:4455,topics:topics.slice(4),labs});emit('BNQUEUE:',{gameTime:61001,queues:[{labId:102,topicIds:['R-Observed-Queued-No-Metadata']}]});},
  progress(){labs[0].estimatedProgress=.72;emit('BNTECH:',{player,gameTime:62000,power:4455,topics:topics.slice(4),labs});},
  manyLabs(){for(let i=5;i<10;i++)labs.push({id:101+i,nativeIndex:i,idle:true,topicId:'',topicName:'',estimatedProgress:0,remainingSeconds:null});emit('BNTECH:',{player,gameTime:61000,power:4455,topics,labs});},
  inflate(){document.querySelectorAll('.bn-tech-lab b,.bn-tech-copy strong,.bn-tech-copy small,.bn-tech-ready b,.bn-tech-ready small,.bn-tech-preview .bn-tech-detail-name,.bn-tech-assign,.bn-tech-error').forEach(e=>{const c=getComputedStyle(e);e.style.fontSize=(parseFloat(c.fontSize)*1.3)+'px';e.style.lineHeight=(parseFloat(c.lineHeight)*1.3)+'px';});}

 };
 </script><script src="ui/research-art.js"></script><script src="/warzone-mobile-research.js"></script>`;}
const requests=[],exceptions=[],results=[],screenshots=[];
const mime={'.js':'text/javascript','.css':'text/css','.png':'image/png','.gif':'image/gif','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture');let name;try{name=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return;}
 if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(name==='/fixture/research.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end(page(url.searchParams.get('mode')||'towers'));return;}
 let file;if(name==='/fixture/battlefield.png')file=path.join(root,'qa/multiplayer-071/combat071-newborns-selected.png');else file=path.resolve(assets,'.'+name);
 if(!file.startsWith(assets+path.sep)&&name!=='/fixture/battlefield.png'||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();requests.push({name,status:404});return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
let edge,ws,serial=0;const pending=new Map();const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const deadline=Date.now()+7000;let last;while(Date.now()<deadline){try{const value=await fn();if(value)return value;}catch(error){last=error;}await delay(30);}throw Error('Timed out '+label+(last?': '+last.message:''));}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},7000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
function geometry(){return `(()=>{const box=e=>{const r=e.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}},shell=document.querySelector('#blocknight-research-shell'),list=shell.querySelector('.bn-tech-list'),detail=shell.querySelector('.bn-tech-detail'),queue=shell.querySelector('.bn-tech-queue-list'),image=shell.querySelector('.bn-tech-current-image'),progress=shell.querySelector('.bn-tech-progress');return{shell:box(shell),left:box(list),detail:box(detail),preview:box(shell.querySelector('.bn-tech-preview')),assign:box(shell.querySelector('.bn-tech-assign')),current:box(shell.querySelector('.bn-tech-active')),currentName:shell.querySelector('.bn-tech-active-name').textContent,currentStatus:shell.querySelector('.bn-tech-current-status').textContent,currentArt:{width:image.naturalWidth,height:image.naturalHeight,src:image.currentSrc,box:box(image)},progress:{hidden:progress.hidden,value:progress.getAttribute('aria-valuenow'),box:box(progress)},queue:{box:box(queue),scrollHeight:queue.scrollHeight,clientHeight:queue.clientHeight},queueTitle:shell.querySelector('.bn-tech-queue-title').textContent,labs:[...shell.querySelectorAll('.bn-tech-lab b')].map(e=>e.textContent),cards:[...shell.querySelectorAll('.bn-tech-card')].map(e=>({id:e.dataset.topicId,state:e.dataset.researchState,selected:e.classList.contains('selected'),box:box(e),art:e.querySelector('img').naturalWidth})),rows:[...queue.querySelectorAll('.bn-tech-queue-item')].map(e=>({id:e.dataset.queuedTopicId,state:e.dataset.queueState,text:e.querySelector('span').textContent,box:box(e),art:e.querySelector('img').naturalWidth,remove:box(e.querySelector('button'))})),error:shell.querySelector('.bn-tech-error').textContent,leftHorizontalOverflow:list.scrollWidth-list.clientWidth,queueHorizontalOverflow:queue.scrollWidth-queue.clientWidth}})()`;}
(async()=>{
 let fatal;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'research-assignment-078-'));edge=cp.spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const port=await until(()=>{const p=path.join(profile,'DevToolsActivePort');return fs.existsSync(p)?Number(fs.readFileSync(p,'utf8').split('\n')[0]):0;},'isolated Edge');const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  ws.addEventListener('message',event=>{const p=JSON.parse(String(event.data));if(p.method==='Runtime.exceptionThrown')exceptions.push(p.params.exceptionDetails.exception?.description||p.params.exceptionDetails.text);const item=pending.get(p.id);if(item){pending.delete(p.id);clearTimeout(item.timer);p.error?item.reject(Error(p.error.message)):item.resolve(p.result);}});await send('Page.enable');await send('Runtime.enable');
  const cases=[['normal',1200,540],['compact',640,320],['idle',640,320],['queue-failed',640,320],['long-queue',640,320]];
  for(const mode of ['towers','campaign','ffa','multiplayer'])for(const[kind,width,height]of cases){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:origin+'/fixture/research.html?mode='+mode});await until(()=>evaluate("document.readyState==='complete'&&Boolean(window.__blockNightResearch)"),'shared Research installed');
   await evaluate('fixture.seed()');await until(()=>evaluate("document.querySelectorAll('.bn-tech-card').length===2&&[...document.querySelectorAll('.bn-tech-card img,.bn-tech-lab img,.bn-tech-current-image,.bn-tech-queue-image')].every(i=>i.complete&&i.naturalWidth>0)&&document.fonts.status==='loaded'"),'available-only catalogue and original artwork');
   await evaluate("__blockNightResearch.setCategory('WEAPONS')");assert.equal(await evaluate('__blockNightResearch.report().activeCategory'),'ALL');
   if(kind==='idle')await evaluate("__blockNightResearch.selectLab(1)");
   if(kind==='long-queue')await evaluate("fixture.emit('BNQUEUE:',{gameTime:60002,queues:[{labId:101,topicIds:fixture.topics.slice(1).map(t=>t.id)},{labId:103,topicIds:[]}]})");
   if(kind==='queue-failed'){
    await evaluate("document.querySelector('[data-topic-id=\"R-Struc-RepairFacility\"]').click();window.fixtureFailWrites=true;__blockNightResearch.assignSelectedTopic()");
    await until(()=>evaluate("document.querySelector('.bn-tech-error').textContent.includes('queue link is unavailable')"),'native-link failure shown');
   }
   await until(()=>evaluate("[...document.querySelectorAll('.bn-tech-current-image,.bn-tech-queue-image')].every(i=>i.complete&&i.naturalWidth>0)"),'selected-lab artwork');
   let g=await evaluate(geometry());assert(g.shell.left>=0&&g.shell.right<=width+1&&g.shell.top>=0&&g.shell.bottom<=height+1,'Shell fits '+mode+'/'+kind);
   assert(g.detail.width>=180&&g.detail.height>100,'Right lab pane remains usable');assert(g.left.right<=g.detail.left+1,'Catalogue cannot overlap selected-lab work');assert(g.current.bottom<=g.queue.box.top+.5,'Current research precedes queue without overlap');
   assert(g.left.height>=40,'Available catalogue retains a scrollable area');assert(g.preview.top>=g.left.bottom-.5,'Selection strip stays below available topics');assert(g.assign.right<=g.detail.left&&g.assign.bottom<=g.shell.bottom-2,'Assign control stays in left pane');
   assert(g.leftHorizontalOverflow<=1&&g.queueHorizontalOverflow<=1,'No horizontal content clipping');assert.deepEqual(g.labs,['1','2','3','4','5']);assert(g.cards.every(c=>c.state==='ready'&&c.art>0),'Only real-art unassigned topics appear on left');
   if(kind==='idle'){assert.equal(g.currentName,'No active research');assert(g.progress.hidden);assert.equal(g.rows.length,0);assert.equal(g.queueTitle,'QUEUED · LAB 2');}
   else {
    assert.equal(g.currentName,topics[0].name);assert(Math.abs(Number(g.progress.value)-58)<=1);assert(!g.progress.hidden);assert(g.currentArt.width>0);assert.equal(g.queueTitle,'QUEUED · LAB 1');
    if(kind==='queue-failed'){assert(g.rows.some(r=>r.id===topics[4].id&&r.state==='syncing'&&r.text.includes('NOT SYNCED')));assert.equal(g.cards.length,1);}
    else if(kind==='long-queue'){assert.deepEqual(g.rows.map(r=>r.id),topics.slice(1).map(t=>t.id));assert(g.queue.scrollHeight>g.queue.clientHeight,'A long selected-lab queue scrolls');}
    else {assert.deepEqual(g.cards.map(c=>c.id),topics.slice(4).map(t=>t.id));assert.deepEqual(g.rows.map(r=>r.id),[topics[1].id]);}
   }
   assert(g.rows.every(row=>row.art>0&&row.remove.right<=g.detail.right+1),'Queued items retain real images and reachable removal controls');
   if(kind==='normal'){
    await evaluate("window.savedAvailable=document.querySelector('.bn-tech-card');window.savedQueue=document.querySelector('.bn-tech-queue-item');window.savedCurrent=document.querySelector('.bn-tech-current');fixture.progress()");
    assert(await evaluate("savedAvailable===document.querySelector('.bn-tech-card')&&savedQueue===document.querySelector('.bn-tech-queue-item')&&savedCurrent===document.querySelector('.bn-tech-current')"),'Progress ticks retain touch targets');
    assert.equal(await evaluate("document.querySelector('.bn-tech-progress').getAttribute('aria-valuenow')"),'72');
    await evaluate("__blockNightResearch.selectLab(2)");assert.equal(await evaluate("document.querySelector('.bn-tech-active-name').textContent"),topics[2].name);assert.equal(await evaluate("document.querySelector('.bn-tech-queue-item').dataset.queuedTopicId"),topics[3].id);await evaluate('__blockNightResearch.selectLab(0)');
   }
   if(kind==='long-queue'){
    await evaluate("document.querySelector('.bn-tech-queue-list').scrollTop=10000");assert(await evaluate("(()=>{const r=document.querySelector('.bn-tech-queue-item:last-child').getBoundingClientRect(),q=document.querySelector('.bn-tech-queue-list').getBoundingClientRect();return r.bottom<=q.bottom+1&&r.top>=q.top-1})()"),'Last queue item reachable by scrolling');await evaluate("document.querySelector('.bn-tech-queue-list').scrollTop=0");
   }
   const filename=`research-${mode}-${kind}-${width}x${height}.png`;const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,filename),Buffer.from(shot.data,'base64'));screenshots.push(filename);
   let retryVerified=false;if(kind==='queue-failed'){
    const adds=await evaluate('__blockNightResearch.report().queueAdds');assert(await evaluate("!document.querySelector('.bn-tech-retry').hidden"),'Failed queue exposes RETRY');
    await evaluate("window.fixtureFailWrites=false;document.querySelector('.bn-tech-retry').click()");
    assert.deepEqual(await evaluate('fixtureWrites.at(-1).command.labs[0].topicIds'),[topics[1].id,topics[4].id],'Retry retains existing confirmed work plus the new exact intent');
    await evaluate("fixture.emit('BNQUEUE:',{nonce:fixtureWrites.at(-1).command.nonce,ok:true,gameTime:60003,queues:[{labId:101,topicIds:[fixture.topics[1].id,fixture.topics[4].id]}]})");
    assert.equal(await evaluate('__blockNightResearch.report().queueAdds'),adds);assert(await evaluate("[...document.querySelectorAll('.bn-tech-queue-item')].every(r=>r.dataset.queueState==='queued')&&document.querySelector('.bn-tech-retry').hidden"),'Only ACK confirms retried work');retryVerified=true;
   }
   results.push({mode,kind,viewport:[width,height],passed:true,retryVerified,layout:g});
  }
  await send('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:origin+'/fixture/research.html?mode=duel'});await until(()=>evaluate("document.readyState==='complete'&&Boolean(window.__blockNightResearch)"),'Duel installed');await evaluate('fixture.seed()');await until(()=>evaluate("Boolean(document.querySelector('.bn-tech-lab'))"),'Duel shell ready');assert(await evaluate("!document.querySelector('#blocknight-research-shell').classList.contains('wt-towers-research')"),'Duel isolation');assert(await evaluate("getComputedStyle(document.querySelector('.bn-tech-header')).display!=='none'&&getComputedStyle(document.querySelector('.bn-tech-categories')).display!=='none'"),'Duel legacy heading/categories remain');
  assert.deepEqual(exceptions,[]);assert.deepEqual(requests,[]);console.log('PASS selected-lab Research in20 actual-renderer mode/layout cases plus Duel isolation');
 }catch(error){fatal=error.stack||String(error);try{fs.writeFileSync(path.join(out,'research-failure-geometry.json'),JSON.stringify(await evaluate(geometry()),null,2));const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'research-failure.png'),Buffer.from(shot.data,'base64'));}catch{}console.error(fatal);process.exitCode=1;}
 finally{for(const item of pending.values())clearTimeout(item.timer);ws?.close();edge?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
 const proof={version:'0.78',passed:!fatal,duelIsolated:!fatal,fixture:'Actual shared Research JS/CSS/fonts/original artwork; native event packets and FS replies are synthetic. Host Chromium only.',actualNativeEngineExecuted:false,engineExecuted:false,emulatorUsed:false,modeViewports:results.length,results,screenshots,exceptions,badRequests:requests,fatal:fatal||null,sources:sourceFiles.map(file=>({path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}))};fs.writeFileSync(path.join(out,'research-browser.json'),JSON.stringify(proof,null,2)+'\n');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
