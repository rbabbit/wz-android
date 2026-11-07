'use strict';
// Genuine native F7 / F8 only. No save-file replacement, seeded objects,
// research assignment, production request, design edit or world order.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const live=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const {out,screen,adb}=live;
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const byId=(a,b)=>Number(a.id)-Number(b.id);
const globals=save=>save['scriptstate.json']?.globals_0||{};
const rows=save=>Object.values(save||{}).filter(row=>row&&typeof row==='object'&&Number.isFinite(row.id));
const queueMap=snapshot=>Object.fromEntries(snapshot.researchQueues.map(q=>[String(q.labId),q.topicIds]));
function productionRows(g){
 const result=[];
 for(const [factoryId,jobs] of Object.entries(g.wtcmd_production||{}))for(const job of jobs||[])result.push({...job,factoryId:Number(factoryId)});
 for(const [factoryId,job] of Object.entries(g.wtcmd_factoryActive||{}))if(job)result.push({...job,factoryId:Number(factoryId)});
 return result;
}
async function fresh(c){const r=await c.evaluate('__warzoneCommands.send("state")');assert.equal(r.ok,true,'fresh native command acknowledgement after QuickLoad');return r.result;}
function installResearchObserver(){
 const w=window;
 if(w.__roundtripResearch?.stop)w.__roundtripResearch.stop();
 if(w.__roundtripResearchObserver){w.removeEventListener('blocknight-engine-output',w.__roundtripResearchObserver);w.removeEventListener('blocknight-research-completed',w.__roundtripResearchObserver);}
 const module=w.LaunchedModule?.FS?w.LaunchedModule:w.Module,fs=module?.FS;
 if(!fs?.readdir||!fs?.stat||!fs?.open||!fs?.read||!fs?.close)throw Error('Native research log filesystem is not ready');
 const directory=(module.WZVAL_configDirPath||'/warzone2100')+'/logs';
 const state={source:'read-only fresh native FS logs + native completion event',snapshots:[],completed:[],offsets:{},partials:{},decoders:{},errors:[],reads:0,running:true};
 let timer;
 function remember(error){state.errors.push(String(error.stack||error));if(state.errors.length>20)state.errors.shift();}
 function paths(){return fs.readdir(directory).filter(name=>name.endsWith('.log')).map(name=>directory+'/'+name);}
 function checkpoint(){
  state.snapshots=[];state.completed=[];state.offsets={};state.partials={};state.decoders={};
  // Existing log history must not count as evidence for this F8. Newly created
  // logs discovered later are read from zero, retaining their first packet.
  for(const file of paths()){state.offsets[file]=fs.stat(file).size;state.partials[file]='';state.decoders[file]=new TextDecoder();}
  return {offsets:{...state.offsets}};
 }
 function line(text){
  const marker='BNTECH:',at=text.indexOf(marker);if(at<0)return;
  const payload=JSON.parse(text.slice(at+marker.length));
  if(!Array.isArray(payload.topics)||!Array.isArray(payload.labs))throw Error('Native BNTECH snapshot lacks topics/labs');
  state.snapshots.push(payload);if(state.snapshots.length>24)state.snapshots.shift();
 }
 function poll(){
  if(!state.running)return;
  try{for(const file of paths()){
   const size=fs.stat(file).size;
   if(!Object.prototype.hasOwnProperty.call(state.offsets,file)){state.offsets[file]=0;state.partials[file]='';state.decoders[file]=new TextDecoder();}
   if(state.offsets[file]>size){state.offsets[file]=0;state.partials[file]='';state.decoders[file]=new TextDecoder();}
   // Bounded append-only reads; never copy old logs or write native files.
   for(let batch=0;batch<4&&state.offsets[file]<size;batch++){
    const buffer=new Uint8Array(Math.min(size-state.offsets[file],128*1024)),stream=fs.open(file,'r');let count;
    try{count=fs.read(stream,buffer,0,buffer.length,state.offsets[file]);}finally{fs.close(stream);}
    if(!count)break;
    const addition=state.partials[file]+state.decoders[file].decode(buffer.subarray(0,count),{stream:true});
    state.offsets[file]+=count;state.reads++;
    const lines=addition.split(/\r?\n/);state.partials[file]=lines.pop();
    for(const text of lines)try{line(text);}catch(error){remember(error);}
   }
  }}catch(error){remember(error);}
 }
 function completed(event){state.completed.push(event.detail);if(state.completed.length>200)state.completed.shift();}
 function report(){return {source:state.source,snapshots:state.snapshots,completed:state.completed,offsets:{...state.offsets},errors:state.errors,reads:state.reads};}
 function stop(){poll();state.running=false;clearInterval(timer);w.removeEventListener('blocknight-research-completed',completed);return report();}
 checkpoint();w.addEventListener('blocknight-research-completed',completed);
 timer=setInterval(poll,200);
 w.__roundtripResearch={get snapshots(){return state.snapshots;},get completed(){return state.completed;},reset:checkpoint,poll,stop,report};
 w.__roundtripResearchObserver=completed;
 return report();
}
async function observeResearch(c){return c.evaluate('('+installResearchObserver.toString()+')()');}
async function stopResearch(c){return c.evaluate('window.__roundtripResearch?.stop?.()||{snapshots:[],completed:[],errors:[]}');}
function checkNativeSave(saved,loaded,report){
 const before=saved['gam.json'],after=loaded['gam.json'];
 assert.equal(after.levelName,before.levelName,'native map survives QuickLoad');
 for(const key of ['netSelectedPlayer','savePlayer','playerNames','alliances','sPlayerIndices','netPlayers'])if(before[key]!==undefined)assert.deepEqual(after[key],before[key],'native player ownership/roster '+key);
 const oldStructures=rows(saved['struct.json']).sort(byId),newStructures=new Map(rows(loaded['struct.json']).map(s=>[s.id,s]));
 for(const old of oldStructures){const current=newStructures.get(old.id);assert.ok(current,'saved native structure ID '+old.id+' remains present');assert.deepEqual([current.player,current.name,current.position],[old.player,old.name,old.position],'static native ownership and position '+old.id);}
 const oldDroids=rows(saved['droid.json']),newDroids=new Map(rows(loaded['droid.json']).map(d=>[d.id,d]));
 const stationary=oldDroids.filter(d=>[0,1].includes(d['order/type'])&&Number(d.moveStatus||0)===0);
 for(const old of stationary){const current=newDroids.get(old.id);assert.ok(current,'saved stationary native unit '+old.id+' remains present');assert.deepEqual([current.player,current.position],[old.player,old.position],'stationary native position restored '+old.id);}
 report.native={structuresCompared:oldStructures.length,stationaryUnitsCompared:stationary.length,playersInSavedWorld:[...new Set([...oldStructures,...oldDroids].map(o=>o.player))].sort(),playersInLoadedWorld:[...new Set([...newStructures.values(),...newDroids.values()].map(o=>o.player))].sort(),movingUnitsObserved:oldDroids.filter(d=>!stationary.includes(d)).map(d=>({id:d.id,savedPosition:d.position,loadedPosition:newDroids.get(d.id)?.position||null,savedOrder:d['order/type']}))};
 assert.deepEqual(report.native.playersInLoadedWorld,report.native.playersInSavedWorld,'native world retains every player represented in the save');
}
function checkQueues(saved,loaded,snapshot,research,events,report){
 const a=globals(saved),b=globals(loaded),savedQueues=a.blockNightV28Queues||{},loadedQueues=b.blockNightV28Queues||{};
 const nativeQueues=queueMap(snapshot),latest=events.snapshots.at(-1)||{},done=new Set(events.completed.map(t=>String(t.id||t.topicId||t.research?.id||'')));
 for(const topic of latest.topics||[])if(topic.done)done.add(String(topic.id));
 const active=new Map(research.labs.map(lab=>[String(lab.id),String(lab.topicId||'')]));
 const transitions=[];
 for(const [labId,topics]of Object.entries(savedQueues)){
  const now=loadedQueues[labId]||[],missing=topics.filter(id=>!now.includes(id));
  assert.ok(missing.every(id=>active.get(labId)===id||done.has(id)),'saved waiting research topics remain queued, are genuinely active, or have a native completion event: '+labId);
  assert.deepEqual(now,topics.filter(id=>!missing.includes(id)),'remaining waiting research keeps its saved FIFO order: '+labId);
  transitions.push({labId,saved:topics,loaded:now,advancedNormally:missing});
 }
 for(const [labId,topics]of Object.entries(loadedQueues)){const current=nativeQueues[labId]||[],advanced=topics.filter(id=>!current.includes(id));assert.ok(advanced.every(id=>active.get(labId)===id||done.has(id)),'fresh native queues preserve loaded waiting topics or verify normal advancement: '+labId);assert.deepEqual(current,topics.filter(id=>!advanced.includes(id)),'fresh native waiting FIFO order after loaded checkpoint: '+labId);}
 const names=new Map((latest.topics||[]).map(t=>[String(t.id),String(t.name)]));
 for(const [index,lab]of research.labs.entries()){
  const ids=nativeQueues[String(lab.id)]||[],display=research.queues[index]||[];
  assert.equal(display.length,ids.length,'visible research queue length matches native state: '+lab.id);
  for(let i=0;i<ids.length;i++)if(names.has(ids[i]))assert.equal(display[i],names.get(ids[i]),'visible research topic follows the restored native queue');
 }
 const expectedProduction=productionRows(a),actualProduction=productionRows(b),productionIds=new Set(actualProduction.map(j=>j.id)),finished=b.wtcmd_finishedUnits||[];
 for(const job of expectedProduction)if(!productionIds.has(job.id))assert.ok(finished.some(unit=>unit.factoryId===job.factoryId&&unit.gameTime>=saved['gam.json'].gameTime&&unit.name===job.design?.name),'a saved production job is restored or has a genuine native produced-unit record: '+job.id);
 for(const f of snapshot.factories){const ids=new Set([...(f.queue||[]),...(f.active?[f.active]:[])].map(j=>j.id));for(const job of actualProduction.filter(j=>j.factoryId===f.id))assert.ok(ids.has(job.id)||(snapshot.finishedUnits||[]).some(u=>u.factoryId===f.id&&u.gameTime>=loaded['gam.json'].gameTime&&u.name===job.design?.name),'factory model shows loaded production job or its genuine completion '+job.id);}
 const completedBuilds=b.wtcmd_finishedBuilds||[],nativeJobs=b.wtcmd_jobs||[],jobIds=new Set([...nativeJobs,...completedBuilds].map(j=>j.id));
 for(const job of a.wtcmd_jobs||[])if(!['done','cancelled'].includes(job.status))assert.ok(jobIds.has(job.id),'saved construction job ID survives native load/completion: '+job.id);
 report.queues={research:transitions,waitingResearchCount:Object.values(savedQueues).reduce((n,q)=>n+q.length,0),savedProductionIds:expectedProduction.map(j=>j.id),loadedProductionIds:actualProduction.map(j=>j.id),savedConstructionIds:(a.wtcmd_jobs||[]).map(j=>j.id),loadedConstructionIds:nativeJobs.map(j=>j.id),uiLabs:research.labs.map((l,i)=>({id:l.id,active:l.topicId,queue:research.queues[i]}))};
}
async function run(options={}){
 const r={passed:false,seeded:false,started:new Date().toISOString(),phase:'fixture-readiness',method:'ordinary installed Iron Valley; genuine F7 then genuine F8; no save replacement or world edits'};let c;
 try{
  r.identity=journey.installedIdentity(options.apk);c=await journey.connectReady();await journey.resume(c);await journey.closeOverlays(c);
  r.before=await fresh(c);assert.equal(r.before.mapHeight,64,'prepared ordinary Iron Valley is active');
  await c.wait('!__blockNightResearch.report().runner&&!__blockNightResearch.report().pendingCommand&&__blockNightResearch.report().dirtyLabIds.length===0',12000);
  const designs=await c.evaluate('BlockNightAndroid.loadDesigns()');await observeResearch(c);
  r.phase='native-quicksave';const saved=await c.save('roundtrip-native-save'),savedTime=Number(saved['gam.json'].gameTime);assert.ok(Number.isFinite(savedTime),'genuine F7 creates readable native gam.json');
  r.saved={gameTime:savedTime,level:saved['gam.json'].levelName,files:Object.keys(saved).filter(k=>k.endsWith('.json')),path:path.join(out,'roundtrip-native-save.json')};screen('roundtrip-01-saved');
  const advance=Math.max(5000,Number(options.advanceMs||10000));await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+String(savedTime+advance),40000);
  r.preLoadClock=await clock(c);assert.ok(r.preLoadClock>savedTime+5000,'native simulation genuinely advances beyond the saved checkpoint before F8');
  const sync=await c.evaluate('__blockNightResearch.report().bridgeSyncs');r.researchLogCheckpoint=await c.evaluate('__roundtripResearch.reset()');
  r.phase='native-quickload';const loadStarted=Date.now();r.nativeLoading={started:new Date(loadStarted).toISOString(),cdpTimeoutMs:90000};
  try{
   await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true',{timeoutMs:90000});
   await c.wait(`!__towersHtml.isEnded()&&__warzoneTowersWaves.report().snapshot.gameTime>=${savedTime-500}&&__warzoneTowersWaves.report().snapshot.gameTime<${r.preLoadClock-3000}`,90000,{timeoutMs:90000});
   r.nativeLoading.observedRewind=true;
  }finally{r.nativeLoading.wallMs=Date.now()-loadStarted;}
  r.rewoundClock=await clock(c);assert.ok(r.rewoundClock<r.preLoadClock-3000,'F8 produces an observable native rewind, not a stale same-time snapshot');
  r.loadReadiness=await require('./observe-native-load.cjs').observe(c,{label:'genuine-quickload'});
  await c.wait('__blockNightResearch.report().bridgeSyncs>'+sync+'&&__roundtripResearch.snapshots.length>0',15000);
  const snapshot=await fresh(c);assert.ok(snapshot.gameTime>=savedTime-500&&snapshot.gameTime<r.preLoadClock-3000,'a new native command acknowledgement belongs to the loaded timeline');
  r.afterFresh=snapshot;r.phase='native-save-comparison';const loaded=await c.save('roundtrip-native-loaded'),current=await fresh(c),research=await c.evaluate('__blockNightResearch.report()'),events=await stopResearch(c);
  r.loaded={gameTime:loaded['gam.json'].gameTime,path:path.join(out,'roundtrip-native-loaded.json')};r.researchBridge={before:sync,after:research.bridgeSyncs,source:events.source,nativeSnapshots:events.snapshots.map(s=>s.gameTime),completed:events.completed,logReads:events.reads,logErrors:events.errors};
  assert.deepEqual(events.errors,[],'native research observer reads complete fresh snapshots without parse/filesystem errors');
  checkNativeSave(saved,loaded,r);checkQueues(saved,loaded,current,research,events,r);
  assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),designs,'normal save/load does not alter the phone design library');
  screen('roundtrip-02-loaded');r.phase='input-return';await journey.openPage(c,'factory');screen('roundtrip-03-factory');adb('shell','input','keyevent','4');
  await c.wait('!__warzoneCommands.report().page&&!parent.document.getElementById("warzone-game-frame").inert',8000);
  const running=await clock(c);await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+String(running+500),8000);r.input={factoryBackRestored:true,clockBefore:running,clockAfter:await clock(c)};screen('roundtrip-04-restored-input');
  r.afterIdentity=journey.installedIdentity(options.apk);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);assert.deepEqual(c.errors,[],'no uncaught WebView exceptions during native roundtrip');r.passed=true;
 }catch(error){r.failure=String(error.stack||error);r.failureKind=r.phase==='fixture-readiness'?'fixture-readiness':'product-check';try{screen('roundtrip-failure');r.failureState=await c.evaluate('({commands:__warzoneCommands.report(),research:__blockNightResearch.report(),wave:__warzoneTowersWaves.report()})');}catch{}throw error;
 }finally{
  if(c){try{await stopResearch(c);if(!await c.evaluate('__towersHtml.isEnded()'))r.pausedAt=await journey.pause(c);}catch(error){r.recoveryFailure=String(error.stack||error);}c.close();}
  r.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'save-roundtrip.json'),JSON.stringify(r,null,2));
 }
 return r;
}
module.exports={run,checkNativeSave,checkQueues,installResearchObserver};
if(require.main===module){const args=process.argv.slice(2),apk=args.indexOf('--apk');run({apk:apk>=0?args[apk+1]:process.env.WZ_QA_APK}).then(r=>console.log(JSON.stringify({passed:r.passed,identity:r.identity,rewind:[r.preLoadClock,r.rewoundClock],native:r.native,queues:r.queues}))).catch(error=>{console.error(error);process.exitCode=1;});}
