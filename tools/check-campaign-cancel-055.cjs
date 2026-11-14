/* Real Campaign bridge functions; synthetic native API/accepted-order fixtures only. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),backend='campaign/commands.js',source=fs.readFileSync(path.join(root,backend),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
function fixture(){
 let builders=[],structures=[],input={},serial=0;const orders=[],timers=[],queued=[];
 const catalog={buildings:[{id:'Lab',name:'Research Facility',kind:'RESEARCH',category:'STRUCTURES',width:2,breadth:2,points:100,power:100},{id:'Power',name:'Power Generator',kind:'POWER GENERATOR',category:'STRUCTURES',width:2,breadth:2,points:100,power:50}],components:{}};
 const context={namespace(){},includeJSON:name=>name==='mobile/warzone-towers-catalog.json'?catalog:name==='mobile/warzone-towers-command.json'?input:{},selectedPlayer:0,gameTime:10000,campmobile_level:'cam1a',BUILT:2,DROID:1,STRUCTURE:2,DROID_ANY:99,DROID_CONSTRUCT:3,DROID_CYBORG_CONSTRUCT:4,DORDER_BUILD:10,DORDER_HELPBUILD:11,DORDER_LINEBUILD:12,DORDER_STOP:13,
  Stats:{Construct:{Spade:{Id:'Spade1Mk1'}}},Upgrades:{0:{Construct:{Spade:{ConstructorPoints:10}}}},enumDroid:()=>builders,enumStruct:(player,item)=>structures.filter(s=>s.player===player&&(!item||s.itemId===item)),getObject:(kind,player,id)=>(kind===2?structures:builders).find(v=>v.id===id&&v.player===player),playerPower:()=>1000,hideInterface(){},dump(){},queue:(...args)=>queued.push(args),campmobile_setTimer:(...args)=>timers.push(args),
  orderDroid:(d,order)=>{orders.push({worker:d.id,order});d.order=order;d.action=0;return true;},orderDroidBuild:(d,order,item,x,y)=>{orders.push({worker:d.id,order,item,x,y});d.order=order;return true;},orderDroidObj:(d,order,s)=>{orders.push({worker:d.id,order,target:s.id});d.order=order;return true;}};
 vm.createContext(context);vm.runInContext(source,context,{filename:backend});context.wtcmd_initialize();
 const truck=(id,extra={})=>({id,type:1,player:0,droidType:3,x:5,y:5,order:10,action:2,body:'Body1REC',...extra});
 const structure=(id,itemId='Lab',extra={})=>({id,type:2,player:0,itemId,name:catalog.buildings.find(b=>b.id===itemId).name,x:5,y:5,status:1,health:55,modules:0,...extra});
 const job=(id,itemId='Lab',extra={})=>({id,itemId,x:5,y:5,workers:[10],automatic:false,status:'working',created:100,attempts:{10:1},issued:{10:5000},parentId:0,targetModules:0,reason:'',...extra});
 function add(j,extra={}){context.wtcmd_jobs.push(j);context.wtcmd_nativeSites.push({...clone(j),knownStructures:[],idleAt:null,remaining:null,...extra});for(const id of j.workers)(context.wtcmd_workers[id]||=[]).push(j.id);return j;}
 function dispatch(action,data={}){const nonce='test-'+(++serial);input={revision:nonce,commands:[{nonce,action,...data}]};context.wtcmd_poll();return clone(context.wtcmd_replies[nonce]);}
 const serialize=()=>clone({jobs:context.wtcmd_jobs,sites:context.wtcmd_nativeSites,workers:context.wtcmd_workers,sessionWorkers:context.wtcmd_sessionWorkers,finishedBuilds:context.wtcmd_finishedBuilds});
 const hydrate=data=>{context.wtcmd_jobs=clone(data.jobs);context.wtcmd_nativeSites=clone(data.sites);context.wtcmd_workers=clone(data.workers);context.wtcmd_sessionWorkers=clone(data.sessionWorkers);context.wtcmd_finishedBuilds=clone(data.finishedBuilds);context.wtcmd_eventGameLoaded();for(const[name]of queued.splice(0))context[name]?.();};
 return {c:context,orders,timers,catalog,truck,structure,job,add,dispatch,serialize,hydrate,setBuilders:value=>{builders=value},setStructures:value=>{structures=value},nativeStructures:()=>structures};
}
function activeWithFuture(){
 const f=fixture(),worker=f.truck(10),foundation=f.structure(50);f.setBuilders([worker]);f.setStructures([foundation]);f.add(f.job('lab'),{structureId:50});f.add(f.job('power','Power',{x:9,y:9,status:'queued',attempts:{},issued:{}}));return {...f,worker,foundation};
}
function writeProof(name,value){const target=path.join(root,'archive',name);if(name.endsWith('baseline.json'))assert(!fs.existsSync(target),'Baseline proof is immutable');fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n');}
function baseline(){
 const f=activeWithFuture();const answer=f.dispatch('cancel-job',{jobId:'power'});assert.equal(answer.ok,true);assert(!f.c.wtcmd_openJobs().some(j=>j.id==='power'));assert.deepEqual(clone(f.c.wtcmd_workers[10]),['lab']);assert.equal(f.orders.length,0);
 f.c.gameTime+=12000;const construction=clone(f.c.wtcmd_constructionState());assert.equal(construction.sites.find(j=>j.id==='power').status,'queued');
 writeProof('campaign-cancel-0.55-baseline.json',{version:'0.55',baseline:'0.54',reproduced:true,scope:'Actual Campaign backend dispatch and construction journal with synthetic native accepted-order state; no emulator actions by this checker.',issue:'Successful queued-job cancellation leaves its independent journal queued while shared workers build an earlier foundation.',answer,gameTime:f.c.gameTime,state:f.serialize(),construction,orders:f.orders,sources:[backend,'tools/check-campaign-cancel-055.cjs'].map(p=>({path:p,sha256:sha(p)})),recordedUTC:new Date().toISOString()});console.log('PASS pre-fix Campaign cancelled-journal delay reproduced');
}
function current(){
 const checks=[],check=(name,body)=>{body();checks.push({name,passed:true});console.log('PASS '+name);};
 check('Cancelling a future site removes only that journal immediately while the same workers continue the active structure',()=>{
  const f=activeWithFuture();assert.equal(f.dispatch('cancel-job',{jobId:'power'}).ok,true);assert.equal(f.c.wtcmd_jobs.find(j=>j.id==='power').status,'cancelled');assert.deepEqual(clone(f.c.wtcmd_workers[10]),['lab']);assert.equal(f.worker.order,f.c.DORDER_BUILD);assert.deepEqual(f.orders,[]);
  for(let i=0;i<4;i++){f.c.gameTime+=5000;f.c.wtcmd_tickBuilds();const state=f.c.wtcmd_constructionState();assert(!state.sites.some(j=>j.id==='power'));assert(state.sites.some(j=>j.id==='lab'&&j.status==='building'));}assert.equal(f.foundation.health,55);assert.equal(f.c.playerPower(),1000);
 });
 check('Cancelling active construction keeps its actual unfinished native foundation and existing STOP semantics',()=>{
  const f=activeWithFuture(),nativeBefore=clone(f.foundation);assert.equal(f.dispatch('cancel-job',{jobId:'lab'}).ok,true);assert.deepEqual(f.orders,[{worker:10,order:f.c.DORDER_STOP}]);assert.deepEqual(clone(f.foundation),nativeBefore);assert.deepEqual(clone(f.c.wtcmd_workers[10]),['power']);assert(!f.c.wtcmd_nativeSites.some(j=>j.id==='lab'));const state=f.c.wtcmd_constructionState();assert(state.active.some(s=>s.id===50&&s.status==='waiting-trucks'));assert(state.sites.some(s=>s.id==='power'));assert.equal(f.c.playerPower(),1000);
 });
 check('Cancellation preserves other workers, FIFO positions, unrelated native-only journals and exact job-ID matching',()=>{
  const f=activeWithFuture(),other=f.truck(20,{x:30,y:30,action:0});f.setBuilders([f.worker,other]);f.add(f.job('elsewhere','Power',{x:30,y:30,workers:[20]}));f.c.wtcmd_nativeSites.push({id:'power-similar',itemId:'Power',x:32,y:30,status:'queued',workers:[20],created:9000});const unrelated=clone(f.c.wtcmd_nativeSites.filter(j=>!['power','lab'].includes(j.id)));
  assert.equal(f.dispatch('cancel-job',{jobId:'power'}).ok,true);assert.deepEqual(clone(f.c.wtcmd_workers[20]),['elsewhere']);assert.equal(other.order,f.c.DORDER_BUILD);assert.deepEqual(f.orders,[]);assert.deepEqual(clone(f.c.wtcmd_nativeSites.filter(j=>!['power','lab'].includes(j.id))),unrelated);assert.equal(f.dispatch('cancel-job',{jobId:'missing'}).reason,'job-missing');assert.deepEqual(f.orders,[]);
 });
 check('Saved cancelled state reloads through the actual GameLoaded initializer without restoring a removed blueprint or issuing its order',()=>{
  const f=activeWithFuture();f.dispatch('cancel-job',{jobId:'power'});const saved=f.serialize(),g=fixture();g.setBuilders([g.truck(10)]);g.setStructures([g.structure(50)]);g.hydrate(saved);assert.deepEqual(g.timers.at(-1),['wtcmd_tick',250]);g.c.wtcmd_tickBuilds();const state=g.c.wtcmd_constructionState();assert(!state.sites.some(j=>j.id==='power'));assert.deepEqual(clone(g.c.wtcmd_workers[10]),['lab']);assert(!g.orders.some(o=>o.item==='Power'));assert.equal(g.c.wtcmd_jobs.find(j=>j.id==='power').status,'cancelled');
 });
 check('Cancelled plans cannot capture a later foundation at the same coordinates, while the new job journal binds it',()=>{
  const f=activeWithFuture();f.dispatch('cancel-job',{jobId:'power'});f.add(f.job('new-power','Power',{x:9,y:9,status:'queued',attempts:{},issued:{}}));const built=f.structure(60,'Power',{x:9,y:9});f.setStructures([f.foundation,built]);const state=f.c.wtcmd_constructionState();assert(!state.sites.some(j=>j.id==='power'));assert.equal(state.sites.find(j=>j.id==='new-power').structureId,60);
 });
 check('Done and blocked jobs retain their existing journals; cancellation is the only changed terminal path',()=>{
  const f=activeWithFuture();f.c.wtcmd_finishJob(f.c.wtcmd_jobs[0],'done');assert(f.c.wtcmd_nativeSites.some(j=>j.id==='lab'));assert.equal(f.c.wtcmd_finishedBuilds[0].id,'lab');f.c.wtcmd_finishJob(f.c.wtcmd_jobs[1],'blocked');assert(f.c.wtcmd_nativeSites.some(j=>j.id==='power'));
 });
 check('Existing Stop override cancellation drops only app journals while preserving all native structures',()=>{
  const f=activeWithFuture();f.c.wtcmd_stopWorkers([10]);assert(f.c.wtcmd_jobs.every(j=>j.status==='cancelled'));assert.equal(f.c.wtcmd_nativeSites.length,0);assert.equal(f.nativeStructures()[0].id,50);assert.deepEqual(clone(f.c.wtcmd_workers[10]),[]);
 });
 writeProof('campaign-cancel-0.55-checks.json',{version:'0.55',passed:true,scope:'Actual Campaign backend dispatch, job completion, construction snapshot and reload initializer in native API VM fixtures only. Exact delivery APK gameplay checks are separate.',checks,sources:[backend,'tools/check-campaign-cancel-055.cjs'].map(p=>({path:p,sha256:sha(p)})),recordedUTC:new Date().toISOString()});
}
try{process.argv.includes('--baseline')?baseline():current()}catch(error){console.error(error);process.exitCode=1;}
