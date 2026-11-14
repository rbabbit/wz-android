'use strict';
// Execute the actual bridge/UI functions with a bounded synthetic native API.
// This is source/VM evidence, never native engine or emulator verification.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),bridge='scenario/warzone-towers-commands.js',ui='app/src/main/assets/warzone-command-pages.js';
const source=fs.readFileSync(path.join(root,bridge),'utf8'),uiSource=fs.readFileSync(path.join(root,ui),'utf8');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(campaign=false){
 let builders=[],selected=[],structures=[],file={},sequence=0,orders=[];
 const catalog={buildings:[{id:'Tower',name:'Tower',kind:'DEFENSE',category:'DEFENCES',width:1,breadth:1,points:100,power:100},{id:'Factory',name:'Factory',kind:'FACTORY',category:'STRUCTURES',width:2,breadth:2,points:100,power:100},{id:'Module',name:'Module',kind:'FACTORY MODULE',category:'MODULES',width:1,breadth:1,points:100,power:100}],components:{}};
 const c={namespace(){},includeJSON:name=>name==='warzone-towers-catalog.json'?catalog:file,selectedPlayer:0,gameTime:5000,BUILT:2,DROID:1,STRUCTURE:2,DROID_ANY:99,DROID_CONSTRUCT:3,DROID_CYBORG_CONSTRUCT:4,DORDER_BUILD:10,DORDER_HELPBUILD:11,DORDER_LINEBUILD:12,DORDER_STOP:13,RESEARCH_LAB:21,POWER_GEN:22,FACTORY:23,VTOL_FACTORY:24,HQ:25,TER_WATER:2,TER_CLIFFFACE:3,mapWidth:128,mapHeight:128,Stats:{},Upgrades:{},enumDroid:()=>builders,enumSelected:()=>selected,enumStruct:(player,item)=>structures.filter(s=>s.player===player&&(!item||s.itemId===item)),playerPower:()=>1000,droidCanReach:d=>!d.unreachable,propulsionCanReach:()=>true,getObject:(kind,player,id)=>(kind===2?structures:builders).find(v=>v.id===id&&v.player===player),dump(){},queue(){},terrainType:()=>0,pickStructLocation:(d,item,x,y)=>({x,y}),getStructureLimit:()=>99,isStructureAvailable:()=>true,orderDroidObj:(d,order,s)=>{orders.push({worker:d.id,order,target:s.id});d.order=order;return true;},orderDroidBuild:(d,order,item,x,y)=>{orders.push({worker:d.id,order,item,x,y});d.order=order;return true;},orderDroid:(d,order)=>{orders.push({worker:d.id,order});d.order=order;return true;}};
 if(campaign)c.campmobile_level='cam1a';
 vm.createContext(c);vm.runInContext(source,c,{filename:bridge});c.wtcmd_started=true;c.wtcmd_constructorRate=()=>10;
 const truck=(id,extra={})=>({id,type:1,player:0,droidType:3,x:4,y:4,order:0,action:0,propulsion:'wheels',...extra});
 const structure=(id,extra={})=>({id,type:2,player:0,itemId:'Tower',name:'Tower',x:4,y:4,status:1,health:50,modules:0,...extra});
 const job=(id,extra={})=>({id,itemId:'Tower',x:4,y:4,workers:[10],status:'working',created:0,attempts:{},issued:{},...extra});
 function add(j){c.wtcmd_jobs.push(j);c.wtcmd_nativeSites.push({...clone(j),...(structures.find(s=>s.x===j.x&&s.y===j.y)?{structureId:structures.find(s=>s.x===j.x&&s.y===j.y).id}:{})});for(const id of j.workers)(c.wtcmd_workers[id]||= []).push(j.id);return j;}
 const dispatch=(action,data={})=>{const nonce='test-'+(++sequence);file={revision:nonce,commands:[{nonce,action,...data}]};c.wtcmd_poll();return clone(c.wtcmd_replies[nonce]);};
 return {c,catalog,orders,truck,structure,job,add,dispatch,setBuilders:v=>{builders=v;},setSelected:v=>{selected=v;},setStructures:v=>{structures=v;}};
}
function uiFunctions(names,extra={}){
 const starts=[...uiSource.matchAll(/^  (?:async )?function ([A-Za-z0-9_]+)\(/gm)],functions=new Map(starts.map((m,i)=>[m[1],uiSource.slice(m.index,i+1<starts.length?starts[i+1].index:uiSource.length)]));
 const context=vm.createContext({state:{snapshot:null,catalog:{buildings:[{id:'Tower',name:'Tower'}]},siteNumbers:new Map()},campaign:false,polishedTowers:true,esc:String,image:()=>'',button:(text,attrs)=>`<button ${attrs}>${text}</button>`,...extra});
 for(const name of names){assert(functions.has(name),name);vm.runInContext(functions.get(name),context,{filename:ui+'#'+name});}return context;
}
function baseline(){
 const f=fixture();f.setStructures([f.structure(50)]);f.add(f.job('old'));f.c.wtcmd_tickBuildsImpl();const native=f.c.wtcmd_constructionState();
 assert.equal(f.c.wtcmd_jobs[0].reason,'builder-lost');assert.deepEqual(clone(f.c.wtcmd_jobs[0].workers),[]);assert.deepEqual(clone(native.sites[0].workers),[10]);assert.equal(native.sites[0].status,'waiting-trucks');
 f.setBuilders([f.truck(31,{x:70,y:70,order:10}),f.truck(32,{x:72,y:70,order:10})]);const automatic=f.c.wtcmd_chooseWorkers({},4,4);assert.equal(automatic.automatic,true);assert.equal(automatic.units.length,2);
 f.setStructures([]);f.setBuilders([]);f.c.wtcmd_nativeSites=[f.job('old')];const unstarted=f.c.wtcmd_constructionState();assert.equal(unstarted.sites[0].status,'interrupted');
 const u=uiFunctions(['constructionRows','currentConstruction']);u.state.snapshot={jobs:f.c.wtcmd_jobs,construction:[],constructionSites:unstarted.sites,finishedBuilds:[]};const rows=u.constructionRows();assert.equal(u.currentConstruction(rows),null);
 const target=path.join(root,'archive/construction-recovery-0.52-baseline.json');assert(!fs.existsSync(target),'Baseline proof is immutable');
 fs.writeFileSync(target,JSON.stringify({version:'0.52',baseline:'0.51',reproduced:true,emulatorUsed:false,scope:'Actual bridge/UI functions with synthetic native API only',foundation:{job:clone(f.c.wtcmd_jobs[0]),journal:clone(native.sites[0])},retryImplicitRemoteWorkers:automatic.units.map(d=>({id:d.id,x:d.x,y:d.y,order:d.order})),unstartedJournal:clone(unstarted.sites[0]),compactSummary:null,sources:[bridge,ui,'app/src/main/assets/warzone/ui/build-display.js'].map(p=>({path:p,sha256:hash(p)})),recordedUTC:new Date().toISOString()},null,2)+'\n');
 console.log('PASS baseline reproduced and immutable proof saved');
}
async function current(){
 const checks=[];
 const check=async(name,body)=>{await body();checks.push(name);};
 const fields=f=>({workerIds:[31],recoveryContext:f.c.wtcmd_recoveryContext,issuedGameTime:f.c.gameTime});
 function paused(extra={}){
  const f=fixture();const foundation=f.structure(50);f.setStructures([foundation]);
  f.add(f.job('a',{buildSession:'group-a',...extra}));f.add(f.job('b',{x:5,buildSession:'group-a',...extra}));
  f.c.wtcmd_tickBuildsImpl();f.c.wtcmd_constructionState();
  const replacement=f.truck(31),remote=f.truck(99,{x:90,y:90,order:10});f.setBuilders([replacement,remote]);f.setSelected([replacement]);
  return {...f,foundation,replacement,remote};
 }
 const resume=(f,extra={})=>f.dispatch('resume-builds',{...fields(f),jobIds:['a','b'],recoveryGroup:f.c.wtcmd_jobs[0].recoveryGroup,...extra});
 await check('Partial builder loss prunes job, journal and dead FIFO keys together without recruiting anyone',()=>{
  const f=fixture(),survivor=f.truck(11),remote=f.truck(31,{x:70,y:70});f.setBuilders([survivor,remote]);f.setStructures([f.structure(50)]);
  f.add(f.job('a',{workers:[10,11],buildSession:'one'}));f.c.wtcmd_tickBuildsImpl();
  assert.deepEqual(clone(f.c.wtcmd_jobs[0].workers),[11]);assert.deepEqual(clone(f.c.wtcmd_nativeSites[0].workers),[11]);
  assert.deepEqual(clone(f.c.wtcmd_jobs[0].originalWorkers),[10,11]);assert.equal(f.c.wtcmd_workers[10],undefined);assert(f.orders.every(o=>o.worker===11));
 });
 await check('All builders lost retains both foundation and future blueprint as Waiting for trucks with one group Resume',()=>{
  const f=paused(),s=f.c.wtcmd_constructionState();assert(f.c.wtcmd_jobs.every(j=>j.status==='blocked'&&j.reason==='builder-lost'));
  assert(s.sites.every(j=>j.status==='waiting-trucks'&&j.workers.length===0&&j.remaining===null));
  const u=uiFunctions(['siteStatus','remainingTime','constructionRows','currentConstruction','constructionResumeControl','currentConstructionRow','compactSiteRow']);
  u.state.snapshot={jobs:clone(f.c.wtcmd_jobs),construction:clone(s.active),constructionSites:clone(s.sites),finishedBuilds:[]};
  const rows=u.constructionRows(),first=u.currentConstruction(rows);assert(first);assert.equal(first.status,'waiting-trucks');
  assert.match(u.currentConstructionRow(first),/WAITING FOR TRUCKS/);assert.match(u.currentConstructionRow(first),/RESUME 2/);
  assert(rows.some(j=>j.id==='b'&&j.pausedPlan));assert.equal(rows.map(j=>u.compactSiteRow(j)).join('').match(/data-resume-jobs=/g).length,1);
 });
 await check('Explicit replacement resumes exact existing foundation then the original next job, retaining progress and normal build orders',()=>{
  const f=paused(),before=f.foundation.health;const result=resume(f);assert.equal(result.ok,true);
  assert.deepEqual(result.result.workerIds,[31]);assert(f.c.wtcmd_jobs.every(j=>j.workers.length===1&&j.workers[0]===31));
  assert.deepEqual(clone(f.c.wtcmd_workers[31]),['a','b']);assert.deepEqual(f.orders,[{worker:31,order:11,target:50}]);assert.equal(f.foundation.health,before);
  assert.equal(f.c.playerPower(),1000);assert.equal(f.remote.order,10);assert.deepEqual(clone(f.c.wtcmd_nativeSites[0].workers),[31]);
  f.foundation.status=2;f.replacement.order=0;f.c.gameTime+=1400;f.c.wtcmd_tickBuildsImpl();
  assert.equal(f.c.wtcmd_jobs[0].status,'done');assert.deepEqual(f.orders.at(-1),{worker:31,order:10,item:'Tower',x:5,y:4});
  const next=f.structure(51,{x:5,status:2});f.setStructures([f.foundation,next]);f.replacement.order=0;f.c.gameTime+=1400;f.c.wtcmd_tickBuildsImpl();assert(f.c.wtcmd_jobs.every(j=>j.status==='done'));
 });
 await check('A living assigned truck en route to an existing foundation shows Trucks en route; later FIFO sites stay Queued, and last-worker loss shows Waiting for trucks',()=>{
  const f=paused();f.replacement.x=50;f.replacement.y=50;assert.equal(resume(f).ok,true);
  let observed=f.c.wtcmd_constructionState();assert.equal(observed.active[0].workers,0);
  assert.equal(observed.active[0].status,'travelling');assert.equal(observed.sites.find(j=>j.id==='a').status,'travelling');assert.equal(observed.sites.find(j=>j.id==='b').status,'queued');
  f.setBuilders([f.remote]);observed=f.c.wtcmd_constructionState();assert.equal(observed.active[0].status,'waiting-trucks');assert(observed.sites.every(j=>j.status==='waiting-trucks'));
 });
 await check('FIFO status follows actual worker queues even when a recovered foundation was adopted after older queued plans',()=>{
  const f=paused();f.c.wtcmd_finishJob(f.c.wtcmd_jobs[0],'cancelled');f.replacement.x=50;f.replacement.y=50;
  const foundation=f.dispatch('resume-structure',{...fields(f),structureId:50});assert.equal(foundation.ok,true);
  const second=f.dispatch('resume-builds',{...fields(f),jobIds:['b'],recoveryGroup:f.c.wtcmd_jobs.find(j=>j.id==='b').recoveryGroup});assert.equal(second.ok,true);
  const observed=f.c.wtcmd_constructionState();assert.equal(observed.sites.find(j=>j.id===foundation.result.jobIds[0]).status,'travelling');assert.equal(observed.sites.find(j=>j.id==='b').status,'queued');
  assert(f.c.wtcmd_jobs.find(j=>j.id==='b').created<f.c.wtcmd_jobs.find(j=>j.id===foundation.result.jobIds[0]).created);
 });
 await check('A selected group keeps its existing FIFO ahead of resumed work; other original sessions are excluded',()=>{
  const f=paused();f.add(f.job('other-session',{x:6,workers:[],status:'blocked',reason:'builder-lost',buildSession:'different',originalWorkers:[10]}));
  const working=f.job('existing',{x:8,workers:[31],issued:{31:4000}});f.c.wtcmd_jobs.unshift(working);f.c.wtcmd_workers[31]=['existing'];f.replacement.order=10;
  const result=f.dispatch('resume-builds',{...fields(f),jobIds:['a','b'],recoveryGroup:f.c.wtcmd_jobs.find(j=>j.id==='a').recoveryGroup});
  assert.equal(result.ok,true);assert.deepEqual(clone(f.c.wtcmd_workers[31]),['existing','a','b']);assert.equal(f.c.wtcmd_jobs.find(j=>j.id==='other-session').workers.length,0);assert.equal(f.orders.length,0);
 });
 await check('No selection, changed/foreign/non-constructor IDs, duplicates, stale context/time and unreachable groups issue no orders',()=>{
  for(const variant of ['empty','changed','foreign','combat','duplicate','stale','future','unreachable']){
   const f=paused();let extra={};
   if(variant==='empty')extra.workerIds=[];
   if(variant==='changed'){f.setSelected([]);}
   if(variant==='foreign'){f.replacement.player=1;}
   if(variant==='combat'){f.replacement.droidType=8;}
   if(variant==='duplicate')extra.workerIds=[31,31];
   if(variant==='stale')extra.recoveryContext='old-world';
   if(variant==='future')extra.issuedGameTime=9000;
   if(variant==='unreachable')f.replacement.unreachable=true;
   const result=resume(f,extra);assert.equal(result.ok,false,variant);assert.equal(f.orders.length,0,variant);assert(f.c.wtcmd_jobs.every(j=>j.workers.length===0),variant);
  }
 });
 await check('A changed exact group, reordered IDs, missing jobs and completed/deleted bound targets cannot be resurrected',()=>{
  for(const variant of ['subset','reverse','missing','completed','deleted']){
   const f=paused();let extra={};if(variant==='subset')extra.jobIds=['a'];if(variant==='reverse')extra.jobIds=['b','a'];if(variant==='missing')extra.jobIds=['a','absent'];
   if(variant==='completed')f.foundation.status=2;
   if(variant==='deleted'){f.c.wtcmd_jobs[0].resumeStructureId=50;f.setStructures([]);}
   assert.equal(resume(f,extra).ok,false,variant);assert.equal(f.orders.length,0,variant);
  }
 });
 await check('Orphan native foundations recover by exact owned target and ordinary HELPBUILD, without new building costs',()=>{
  const f=fixture(),target=f.structure(70),worker=f.truck(31);f.setStructures([target]);f.setBuilders([worker]);f.setSelected([worker]);
  const reply=f.dispatch('resume-structure',{...fields(f),structureId:70});assert.equal(reply.ok,true);
  assert.deepEqual(f.orders,[{worker:31,order:11,target:70}]);assert.equal(target.health,50);assert.equal(f.c.playerPower(),1000);
  const before=clone(f.c.wtcmd_jobs);assert.equal(f.dispatch('resume-structure',{...fields(f),structureId:70}).ok,false);assert.deepEqual(clone(f.c.wtcmd_jobs),before);
  for(const extra of [{status:2},{player:1},{type:1}]){const g=fixture(),d=g.truck(31);g.setBuilders([d]);g.setSelected([d]);g.setStructures([g.structure(70,extra)]);assert.equal(g.dispatch('resume-structure',{...fields(g),structureId:70}).ok,false);assert.equal(g.orders.length,0);}
 });
 await check('Legacy observer-only plans disappear when their native worker queue dies; a real unfinished legacy foundation remains resumable',()=>{
  const f=fixture();f.c.wtcmd_nativeSites=[f.job('legacy-plan')];let state=f.c.wtcmd_constructionState();
  assert.equal(state.sites[0].status,'interrupted');
  const u=uiFunctions(['constructionRows']);u.state.snapshot={jobs:[],construction:clone(state.active),constructionSites:clone(state.sites),finishedBuilds:[]};assert.equal(u.constructionRows().length,0);
  const g=fixture();g.setStructures([g.structure(70)]);g.c.wtcmd_nativeSites=[g.job('legacy-foundation',{structureId:70})];state=g.c.wtcmd_constructionState();assert.equal(state.sites[0].status,'waiting-trucks');
  const d=g.truck(31);g.setBuilders([d]);g.setSelected([d]);assert.equal(g.dispatch('resume-structure',{...fields(g),structureId:70}).ok,true);assert.deepEqual(g.orders,[{worker:31,order:11,target:70}]);
 });
 await check('Two factory module levels remain serialized; an unfinished current level receives HELPBUILD before the next module is built',()=>{
  const f=fixture(),parent=f.structure(80,{itemId:'Factory',name:'Factory',stattype:23,modules:1});f.setStructures([parent]);
  f.add(f.job('a',{itemId:'Module',parentId:80,targetModules:1,buildSession:'modules'}));f.add(f.job('b',{itemId:'Module',parentId:80,targetModules:2,buildSession:'modules'}));
  f.c.wtcmd_tickBuildsImpl();const d=f.truck(31);f.setBuilders([d]);f.setSelected([d]);assert.equal(resume(f).ok,true);assert.deepEqual(f.orders,[{worker:31,order:11,target:80}]);
  parent.status=2;d.order=0;f.c.gameTime+=1400;f.c.wtcmd_tickBuildsImpl();assert.deepEqual(f.orders.at(-1),{worker:31,order:10,item:'Module',x:4,y:4});
  parent.modules=2;parent.status=2;d.order=0;f.c.gameTime+=1400;f.c.wtcmd_tickBuildsImpl();assert(f.c.wtcmd_jobs.every(j=>j.status==='done'));assert.equal(f.c.playerPower(),1000);
 });
 await check('Native-only interrupted module recovery helps the exact current module instead of purchasing the next level',()=>{
  const f=fixture(),parent=f.structure(80,{itemId:'Factory',name:'Factory',stattype:23,modules:1});f.setStructures([parent]);
  f.c.wtcmd_nativeSites=[f.job('native-module',{itemId:'Module',parentId:80,targetModules:1,structureId:80,status:'waiting-trucks',reason:'builder-lost',workers:[]})];
  const d=f.truck(31);f.setBuilders([d]);f.setSelected([d]);assert.equal(f.dispatch('resume-structure',{...fields(f),structureId:80}).ok,true);
  assert.deepEqual(f.orders,[{worker:31,order:11,target:80}]);assert.equal(f.c.wtcmd_jobs[0].targetModules,1);
 });
 await check('STOP/manual movement cancels only affected assigned FIFOs and preserves unrelated orphan plans; cancel remains real native STOP',()=>{
  const f=paused();f.add(f.job('unrelated',{workers:[],status:'blocked',reason:'builder-lost',buildSession:'other',originalWorkers:[22]}));assert.equal(resume(f).ok,true);
  f.replacement.order=99;f.c.gameTime+=1500;f.c.wtcmd_tickBuildsImpl();assert.equal(f.c.wtcmd_jobs.find(j=>j.id==='a').status,'cancelled');assert.equal(f.c.wtcmd_jobs.find(j=>j.id==='b').status,'cancelled');assert.equal(f.c.wtcmd_jobs.find(j=>j.id==='unrelated').status,'blocked');
  const g=paused();assert.equal(resume(g).ok,true);assert.equal(g.dispatch('cancel-job',{jobId:'a'}).ok,true);assert.equal(g.c.wtcmd_jobs[0].status,'cancelled');assert.equal(g.c.wtcmd_nativeSites[0].status,'cancelled');assert.deepEqual(g.orders.at(-1),{worker:31,order:13});
 });
 await check('A canceled unstarted journal cannot steal the later real foundation or obscure its live progress',()=>{
  const f=fixture(),worker=f.truck(10);f.setBuilders([worker]);f.add(f.job('old'));f.dispatch('cancel-job',{jobId:'old'});
  f.add(f.job('new'));const foundation=f.structure(50);f.setStructures([foundation]);f.c.wtcmd_bindNativeSites([foundation]);
  assert.equal(f.c.wtcmd_nativeSites[0].structureId,undefined);assert.equal(f.c.wtcmd_nativeSites[1].structureId,50);
  worker.action=2;const live=f.c.wtcmd_constructionState();assert.equal(live.active[0].status,'building');
 });
 await check('Legacy loaded lost jobs infer identity from the retained journal, retain original plans through JSON save, and revoke stale recovery context',()=>{
  const f=paused();delete f.c.wtcmd_jobs[0].originalWorkers;delete f.c.wtcmd_jobs[0].recoveryGroup;delete f.c.wtcmd_jobs[0].buildSession;f.c.wtcmd_nativeSites[0].workers=[10];delete f.c.wtcmd_nativeSites[0].originalWorkers;
  f.c.wtcmd_reconcileBuilders([]);assert.deepEqual(clone(f.c.wtcmd_jobs[0].originalWorkers),[10]);assert.equal(f.c.wtcmd_jobs[0].recoveryGroup,'legacy:a');
  const saved=clone({jobs:f.c.wtcmd_jobs,sites:f.c.wtcmd_nativeSites,workers:f.c.wtcmd_workers});const g=fixture();g.c.wtcmd_jobs=saved.jobs;g.c.wtcmd_nativeSites=saved.sites;g.c.wtcmd_workers=saved.workers;g.c.wtcmd_recoveryContext='pre-load';g.c.wtcmd_eventGameLoaded();assert.notEqual(g.c.wtcmd_recoveryContext,'pre-load');
  assert.equal(g.c.wtcmd_jobs[0].x,4);assert.equal(g.c.wtcmd_nativeSites[0].structureId,50);assert.equal(g.c.wtcmd_jobs[1].recoveryGroup,f.c.wtcmd_jobs[1].recoveryGroup);
 });
 await check('UI Resume obtains fresh explicit constructor IDs, never a stale build group; pending STOP cancels the unsent action',async()=>{
  const requests=[],messages=[],state={constructionResuming:null,stopGeneration:0,nativeBuildGroup:[99]};
  const u=uiFunctions(['resumeConstruction'],{state,window:{__towersHtml:{session:'battle',isEnded:()=>false}},refreshLive(){},requestState(){},reason:s=>s,notify:s=>messages.push(s),send:async(action,data)=>{requests.push({action,data});return action==='state'?{ok:true,result:{selectedUnits:[{id:31,constructor:true},{id:9,constructor:false}],gameTime:5000,recoveryContext:'fresh'}}:{ok:true,result:{jobIds:['a','b']}};}});
  await u.resumeConstruction({dataset:{resumeJobs:'["a","b"]',recoveryGroup:'group'}});assert.equal(requests.length,2);assert.deepEqual(clone(requests[1].data.workerIds),[31]);assert.equal(requests[1].data.recoveryContext,'fresh');assert.equal(requests[1].action,'resume-builds');
  let release;requests.length=0;u.send=(action,data)=>{requests.push({action,data});return new Promise(resolve=>{release=resolve;});};const pending=u.resumeConstruction({dataset:{resumeStructure:'50'}});state.stopGeneration++;release({ok:true,result:{selectedUnits:[{id:31,constructor:true}],gameTime:5000,recoveryContext:'fresh'}});await pending;assert.equal(requests.length,1);
 });
 // Later authorized cross-mode work can reuse these behavior cases without
 // rewriting the historical v0.52 Campaign-freeze proof or its report file.
 if(process.argv.includes('--behavior-only')){
  console.log(JSON.stringify({passed:true,checks:checks.length,behaviorOnly:true,emulatorUsed:false,historicalReleasePreservationChecked:false}));return;
 }
 await check('Campaign policy and frozen generated Campaign source/data remain untouched',()=>{
  const f=fixture(true);f.setStructures([f.structure(50)]);f.add(f.job('a'));f.c.wtcmd_tickBuildsImpl();const live=f.c.wtcmd_constructionState();assert.deepEqual(clone(live.sites[0].workers),[10]);assert.equal(f.dispatch('resume-builds',{...fields(f),jobIds:['a']}).ok,false);
  const u=uiFunctions(['constructionResumeControl'],{campaign:true});assert.equal(u.constructionResumeControl({id:'a',status:'waiting-trucks'}),'');
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'archive/fallback-0.52.json'),'utf8'));assert.equal(baseline.baseline,'0.51');
  const verified=JSON.parse(cp.execFileSync('python',['-c',String.raw`import hashlib,json,pathlib,sys,zipfile
r=pathlib.Path(sys.argv[1]);fallback=json.loads((r/'archive/fallback-0.52.json').read_text());src=next(pathlib.Path(x['path']) for x in fallback['files'] if x['path'].endswith('.zip'))
with zipfile.ZipFile(src) as z:
 names=[n for n in z.namelist() if n.startswith('campaign/') or n.startswith('app/src/main/assets/') and 'campaign' in n.lower()]
 for n in names:
  with z.open(n) as old,(r/n).open('rb') as current: assert hashlib.file_digest(old,'sha256').hexdigest()==hashlib.file_digest(current,'sha256').hexdigest(),n
print(json.dumps({'frozenCampaignFiles':len(names),'passed':True}))`,root],{encoding:'utf8'}));
  assert(verified.passed&&verified.frozenCampaignFiles>=8);
 });
 const inputs=[bridge,ui,'app/src/main/assets/warzone/ui/build-display.js','tools/check-construction-recovery-052.cjs'];
 const report={version:'0.52',passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,gameplayVerified:false,scope:'Actual bridge/UI functions with bounded synthetic API; no native gameplay assertion',baselineProof:'archive/construction-recovery-0.52-baseline.json',checksPassed:checks.length,checks,sources:inputs.map(p=>({path:p,sha256:hash(p)})),recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(root,'archive/construction-recovery-0.52-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,report:'archive/construction-recovery-0.52-checks.json'}));
}
if(process.argv.includes('--baseline'))baseline();
else if(require.main===module)current().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,uiFunctions,clone,hash,root,bridge,ui,source,uiSource};
