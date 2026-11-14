'use strict';
// Own production data/worker code, actual retained public records and clearly
// synthetic transport/cache fixtures. No Android, emulator or game is executed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='app/src/main/assets/hub/';
const source=fs.readFileSync(path.join(root,base+'hub-data.js'),'utf8'),worker=fs.readFileSync(path.join(root,base+'hub-worker.js'),'utf8');
const context={atob};vm.runInNewContext(source,context);const H=context.WarzoneHubData;
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/hub-075/public-sample.json'),'utf8'));
const expected=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/hub-075/reference-expected.json'),'utf8'));
const checks=[];async function check(name,fn){await fn();checks.push(name);}
const normalized=fixture.results.map(row=>H.normalize(row,row.id)),clone=value=>JSON.parse(JSON.stringify(value));
function fakeDB(store){return{open(){const request={};setTimeout(()=>{request.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const operations=[],tx={objectStore:()=>({get(key){const r={};operations.push(()=>{r.result=store.get(key);});return r;},put(value,key){operations.push(()=>store.set(key,structuredClone(value)));},delete(key){operations.push(()=>store.delete(key));}})};setTimeout(()=>{operations.forEach(fn=>fn());tx.oncomplete?.();},0);return tx;}};request.onsuccess?.();},0);return request;}};}
function workerFixture({store=new Map(),rejectNetwork=false,streamMode='complete',hold=false}={}){
 const messages=[],requests=[];let release,aborted=0;
 const header={get:()=>streamMode==='json'?'application/json':'text/event-stream'};
 const all='event: reset\ndata:\n\n'+fixture.results.map(r=>'data: '+JSON.stringify(r)+'\nid: '+r.id+'\n\n').join('')+(streamMode==='truncated'?'':'event: synced\ndata:\n\n');
 const sandbox={atob,TextDecoder,TextEncoder,AbortController,structuredClone,Date,console,onmessage:null,indexedDB:fakeDB(store),setTimeout,clearTimeout,postMessage:m=>messages.push(clone(m)),
  fetch:async(url,options)=>{
   requests.push({url,accept:options.headers.Accept});if(rejectNetwork)throw Error('Fixture network offline');
   if(url.includes('player-public-keys'))return{ok:true,text:async()=>JSON.stringify(fixture.playerPublicKeys)};
   if(url.includes('player-spoiled'))return{ok:true,text:async()=>JSON.stringify(fixture.playerSpoiledPublicKeys)};
   let index=0,cancelled=false;options.signal.addEventListener('abort',()=>{aborted++;release?.();});
   return{ok:true,headers:header,body:{getReader:()=>({async read(){if(cancelled||index>=all.length)return{done:true};if(hold){await new Promise(resolve=>{release=resolve;});if(options.signal.aborted)throw Error('Fixture request aborted');}
     const chunk=new TextEncoder().encode(all.slice(index,index+137));index+=137;return{done:false,value:chunk};},async cancel(){cancelled=true;}})}};
  }};
 vm.createContext(sandbox);sandbox.importScripts=()=>vm.runInContext(source,sandbox);vm.runInContext(worker,sandbox);
 const send=request=>sandbox.onmessage({data:request});
 async function wait(predicate){for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,4));}throw Error('Worker fixture did not settle');}
 return{send,messages,requests,store,wait,get aborted(){return aborted;},release:()=>release?.()};
}
(async()=>{
 await check('SSE handles fragmented Unicode, CRLF boundaries, comments, multiline data, event types and persistent IDs',()=>{
  const events=[],parser=new H.SSEParser(e=>events.push(clone(e)));
  const text='\uFEFF:hello\r\nevent: reset\r\ndata:\r\n\r\nid: 11_6_1_100\r\ndata: {"name":\r\ndata: "Žed"}\r\n\r\nevent: synced\r\ndata:\r\n\r\n';
  for(const c of text)parser.push(c);parser.finish();assert.equal(events.length,3);assert.equal(events[0].type,'reset');
  assert.equal(JSON.parse(events[1].data).name,'Žed');assert.equal(events[2].type,'synced');assert.equal(events[2].id,'11_6_1_100');
  const broken=new H.SSEParser(()=>{});broken.push('data: unfinished');assert.throws(()=>broken.finish());
 });
 await check('All three own rating models match retained reference outputs for48 actual public game records',()=>{
  assert.equal(normalized.length,48);
  for(const board of ['global','1v1','ffa']){
   const model=H.calculate(normalized,fixture.playerPublicKeys,fixture.playerSpoiledPublicKeys,board,true);
   assert.equal(model.rankings.length,expected[board].length,board);
   for(const e of expected[board]){const a=model.rankings.find(a=>a.id===e.id);assert.ok(a,e.id);for(const key of ['name','games','wins','losses','draws','eligible'])assert.equal(a[key],e[key],board+' '+key);
    if(e.rating===null)assert.equal(a.rating,null);else assert.ok(Math.abs(a.rating-e.rating)<1e-8);
    assert.ok(Math.abs(a.researchRatio-e.researchRatio)<1e-8);
   }
  }
 });
 await check('Incomplete history never publishes a rank/rating, while actual result rows remain queryable',()=>{
  const model=H.calculate(normalized,fixture.playerPublicKeys,fixture.playerSpoiledPublicKeys,'global',false);
  assert.ok(model.rankings.every(a=>a.rating===null&&a.rank===null&&!a.eligible));
  assert.equal(H.query(model,{view:'rankings'}).available,false);assert.equal(H.query(model,{view:'rankings'}).items.length,0);
  const results=H.query(model,{view:'results',limit:3});assert.equal(results.items.length,3);assert.ok(results.items.every(g=>g.valid===null));
 });
 await check('Search is literal text, pagination bounded, aliases searchable and player/match details retain native identities',()=>{
  const model=H.calculate(normalized,fixture.playerPublicKeys,fixture.playerSpoiledPublicKeys,'global',true);
  assert.equal(H.query(model,{search:'.*'}).total,0);assert.equal(H.query(model,{limit:999}).items.length,48);
  const rows=H.query(model,{search:'rbabbit',limit:2});assert.ok(rows.total>0);assert.equal(rows.items.length,2);
  const player=rows.items[0].players.find(p=>p.name.toLowerCase().includes('rbabbit'));
  const detail=H.query(model,{view:'player',playerId:player.id,limit:1});assert.equal(detail.player.id,player.id);assert.equal(detail.items.length,1);
  assert.equal(H.query(model,{view:'match',matchId:rows.items[0].id}).match.id,rows.items[0].id);
 });
 await check('Synthetic short/cheated/unequal-team/early-quit cases preserve the documented rating exclusions',()=>{
  const key=n=>Buffer.alloc(32,n).toString('base64');
  const raw=(i,extra={})=>({id:'11_6_'+i+'_100',game:{startDate:i,endDate:i+1,timeGameEnd:600000,mapName:'Synthetic fixture',version:'fixture',alliancesType:0,...extra},endDate:i+1,playerData:[{name:'Fixture A',publicKey:key(1),position:0,team:0,usertype:'winner',researchRatio:.5,recentPowerWon:100},{name:'Fixture B',publicKey:key(2),position:1,team:1,usertype:'loser',recentPowerWon:100}]});
  let rows=Array.from({length:11},(_,i)=>raw(i+1));const normal=H.calculate(rows,{}, {},'global',true);assert.ok(normal.rankings.every(a=>a.eligible));
  assert.ok(normal.games.every(g=>g.valid));assert.equal(normal.games[0].players[1].researchRatio,1,'Site arithmetic keeps its documented fallback');
  assert.equal(normal.games[0].players[1].researchRecorded,false,'UI must show unknown research as a dash');
  for(const extra of [{timeGameEnd:1000},{cheated:true}])assert.ok(H.calculate(rows.map(r=>({...r,game:{...r.game,...extra}})),{}, {},'global',true).games.every(g=>g.valid===false));
  const early=rows.map(r=>({...r,playerData:r.playerData.map((p,i)=>({...p,...(i?{}:{playerLeftGameTime:100})}))}));
  assert.ok(H.calculate(early,{}, {},'global',true).games.every(g=>g.players.find(p=>p.name==='Fixture A').earlyQuit));
  const uneven=rows.map(r=>({...r,game:{...r.game,alliancesType:2},playerData:[...r.playerData,{name:'Fixture C',publicKey:key(3),position:2,team:0,usertype:'winner',researchRatio:1,recentPowerWon:1}]}));
  assert.ok(H.calculate(uneven,{}, {},'global',true).games.every(g=>g.ratingReason==='Unequal team sizes'));
 });
 await check('Worker explicitly requests SSE, publishes complete only at synced and serves real paged data',async()=>{
  const f=workerFixture();f.send({type:'load'});await f.wait(()=>f.messages.some(m=>m.type==='state'&&m.status==='ready'&&m.summary.complete));
  assert.ok(f.requests.some(r=>r.url.endsWith('results.json?id=')&&r.accept==='text/event-stream'));
  f.send({type:'query',requestId:7,view:'results',limit:4});assert.equal(f.messages.at(-1).requestId,7);assert.equal(f.messages.at(-1).items.length,4);
  f.send({type:'query',requestId:8,view:'rankings'});assert.equal(f.messages.at(-1).available,true);
  assert.equal(f.store.get('complete').records.length,48);assert.equal(f.store.has('checkpoint'),false);
 });
 await check('A complete IndexedDB snapshot supports offline Results and honest cached rankings after network failure',async()=>{
  const store=new Map([['complete',{version:1,records:normalized,cursor:normalized.at(-1).id,complete:true,keys:fixture.playerPublicKeys,spoiled:fixture.playerSpoiledPublicKeys,lastUpdated:123}]]);
  const f=workerFixture({store,rejectNetwork:true});f.send({type:'load'});await f.wait(()=>f.messages.some(m=>m.type==='state'&&m.status==='offline'));
  assert.equal(f.messages.at(-1).summary.complete,true);f.send({type:'query',requestId:9,view:'rankings'});assert.equal(f.messages.at(-1).available,true);
 });
 await check('A saved incomplete checkpoint resumes with its cursor and server reset replaces the prefix without duplicates',async()=>{
  const prefix=normalized.slice(0,10),cursor=prefix.at(-1).id;
  const store=new Map([['checkpoint',{version:1,records:prefix,cursor,complete:false,keys:fixture.playerPublicKeys,spoiled:fixture.playerSpoiledPublicKeys,lastUpdated:123}]]);
  const f=workerFixture({store});f.send({type:'load'});await f.wait(()=>f.messages.some(m=>m.type==='state'&&m.status==='ready'&&m.summary.complete));
  assert.ok(f.requests.some(r=>r.url.endsWith('results.json?id='+cursor)));
  const rows=f.store.get('complete').records;assert.equal(rows.length,48);assert.equal(new Set(rows.map(r=>r.id)).size,48);
 });
 await check('An unsynced/truncated history stays incomplete and cannot expose global rankings',async()=>{
  const f=workerFixture({streamMode:'truncated'});f.send({type:'load'});await f.wait(()=>f.messages.some(m=>m.type==='state'&&m.status==='error'));
  assert.equal(f.messages.at(-1).summary.complete,false);f.send({type:'query',view:'rankings'});assert.equal(f.messages.at(-1).available,false);assert.equal(f.messages.at(-1).items.length,0);
 });
 await check('Cancellation aborts the active request and a stale completion cannot publish ready',async()=>{
  const f=workerFixture({hold:true});f.send({type:'load'});await f.wait(()=>f.requests.some(r=>r.accept==='text/event-stream'));
  f.send({type:'cancel'});f.release();await new Promise(r=>setTimeout(r,30));assert.ok(f.aborted>0);assert.equal(f.messages.at(-1).status,'cancelled');
  assert.ok(!f.messages.some(m=>m.status==='ready'));
 });
 const inputs=[base+'hub-data.js',base+'hub-worker.js','tools/test-hub-data-075.cjs','tools/fixtures/hub-075/public-sample.json','tools/fixtures/hub-075/reference-expected.json'];
 const report={version:'0.75',passed:true,emulatorUsed:false,actualAndroidViewsExecuted:false,actualNativeEngineExecuted:false,
  scope:'Actual independent Hub data/worker code; retained actual public records and synthetic fetch/IndexedDB transport fixtures',checksPassed:checks.length,checks,
  sources:inputs.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
 fs.writeFileSync(path.join(root,'qa/hub-075/data-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length,report:'qa/hub-075/data-checks.json'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
