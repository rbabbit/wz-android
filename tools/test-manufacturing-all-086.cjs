'use strict';
// Actual command/UI functions under native-API/DOM fixtures. No engine/emulator.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa/manufacturing-all-086');fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),clone=v=>JSON.parse(JSON.stringify(v));
const load=(file,marker,names)=>new Function('require','__dirname',read(file).split(marker)[0]+'\nreturn {'+names.join(',')+'};')(require,__dirname);
const native=load('tools/test-manufacturing-native-077.cjs','for(const mode of Object.keys(files)){',['fixture','files']);
const ui=load('tools/test-manufacturing-ui-077.cjs','(async()=>{',['fixture']);
const checks=[];async function check(name,fn){await fn();checks.push(name);}
(async()=>{
for(const mode of Object.keys(native.files)){
 await check(mode+': one authoritative ALL command manufactures once at each owned completed compatible vehicle factory',()=>{
  const f=native.fixture(mode);f.factory(30,2);f.factory(40,1,1);f.factory(50).status=0;f.factory(60,3);
  const r=f.send('queue-production',{factoryId:10,templateId:'gun',count:1,all:true,repeat:true},'batch');
  assert.equal(r.ok,true);assert.deepEqual(clone(r.result.factoryIds),[10,20]);assert.equal(r.result.count,2);
  assert.deepEqual(f.starts.map(s=>s.factoryId),[10,20]);assert.equal(f.policy(f.first).enabled,true);assert.equal(f.policy(f.other).enabled,true);
  const ids=[f.c.wtcmd_factoryActive['10'].id,f.c.wtcmd_factoryActive['20'].id];assert.equal(new Set(ids).size,2);
  for(let i=0;i<5;i++){f.finish(f.first);f.finish(f.other);f.tick();}
  assert.equal(f.starts.length,12);assert.equal(f.c.wtcmd_production['10'].length,0);assert.equal(f.c.wtcmd_production['20'].length,0);
  f.send('queue-production',{factoryId:10,templateId:'gun',all:true,repeat:true},'batch');assert.equal(f.starts.length,12);assert.equal(f.c.wtcmd_production['10'].length,0,'Native nonce replay never enqueues batch again');
 });
 await check(mode+': cyborg ALL is independent, skips uncompleted lower IDs, and vehicle designs cannot reach cyborgs',()=>{
  const f=native.fixture(mode);f.factory(2,2).status=0;const a=f.factory(30,2),b=f.factory(40,2);f.factory(50,2,1);
  let r=f.send('queue-production',{factoryId:30,templateId:'cyborg',all:true,repeat:true});assert.equal(r.ok,true);assert.deepEqual(clone(r.result.factoryIds),[30,40]);
  assert.deepEqual(f.starts.map(s=>s.factoryId),[30,40]);assert.equal(f.policy(a).enabled,true);assert.equal(f.policy(b).enabled,true);assert.equal(f.policy().enabled,false);
  r=f.send('queue-production',{factoryId:10,templateId:'cyborg',all:true});assert.equal(r.ok,false);assert.equal(r.reason,'factory-incompatible');
  f.finish(a);f.finish(b);f.tick();assert.equal(f.starts.length,4);
 });
 await check(mode+': stale/nonfirst/VTOL ALL requests fail before mutation and first changes follow actual native inventory',()=>{
  const f=native.fixture(mode);for(const all of [true,'true']){const r=f.send('queue-production',{factoryId:20,templateId:'gun',all});assert.equal(r.ok,false);}
  assert.equal(f.starts.length,0);const a=f.factory(30,3);assert.equal(f.send('queue-production',{factoryId:a.id,templateId:'gun',all:true}).ok,false);
  f.factories.delete(10);const r=f.send('queue-production',{factoryId:20,templateId:'gun',all:true});assert.equal(r.ok,true);assert.deepEqual(clone(r.result.factoryIds),[20]);
 });
 await check(mode+': module and 64-job capacity checks skip peers without touching unrelated queues',()=>{
  const f=native.fixture(mode);f.c.wtcmd_native.Body1.value.Size=1;f.first.modules=1;f.other.modules=0;const third=f.factory(30);third.modules=1;
  f.c.wtcmd_production['30']=Array.from({length:64},(_,i)=>({id:'old-'+i,design:{name:'old'},status:'queued'}));third.idle=false;
  const before=clone(f.c.wtcmd_production['30']),r=f.send('queue-production',{factoryId:10,templateId:'gun',all:true,repeat:true});
  assert.equal(r.ok,true);assert.deepEqual(clone(r.result.factoryIds),[10]);assert.deepEqual(clone(r.result.skippedFactoryIds),[30]);assert.deepEqual(clone(f.c.wtcmd_production['30']),before);
  assert.equal(f.policy(f.other).enabled,false);assert.equal(f.policy(third).enabled,false);assert.equal(f.starts.length,1);
 });
 await check(mode+': ALL cycle OFF preserves active units/FIFO and a different repeat design; STOP stays local',()=>{
  const f=native.fixture(mode),third=f.factory(30);f.send('queue-production',{factoryId:10,templateId:'gun',all:true,count:2,repeat:true});
  f.send('queue-production',{factoryId:30,templateId:'truck',repeat:true});assert.equal(f.policy(third).design.turrets[0],'Spade1Mk1');
  let r=f.send('set-production-repeat',{factoryId:10,templateId:'gun',all:true,enabled:false});assert.equal(r.ok,true);
  assert.deepEqual(clone(r.result.factories.map(s=>s.factoryId)),[10,20]);assert.equal(f.cancels.length,0);assert.equal(f.policy().enabled,false);assert.equal(f.policy(f.other).enabled,false);assert.equal(f.policy(third).enabled,true);
  assert.equal(f.c.wtcmd_production['10'].length,1);assert.equal(f.c.wtcmd_production['20'].length,1);
  r=f.send('set-production-repeat',{factoryId:10,templateId:'gun',all:true,enabled:true});assert.equal(r.ok,true);
  r=f.send('stop-production',{factoryId:20});assert.equal(r.ok,true);assert.equal(f.policy(f.other).enabled,false);assert.equal(f.policy().enabled,true);assert.equal(f.policy(third).enabled,true);
 });
 await check(mode+': ALL cycle on idle factories cannot create manufacture; capacity waits and peer native rejections remain bounded',()=>{
  const f=native.fixture(mode);assert.equal(f.send('set-production-repeat',{factoryId:10,templateId:'gun',all:true,enabled:true}).ok,false);assert.equal(f.starts.length,0);
  for(let i=0;i<3;i++)f.units.push({type:2,player:0,droidType:2});let r=f.send('queue-production',{factoryId:10,templateId:'truck',all:true,repeat:true});assert.equal(r.ok,true);
  for(let i=0;i<10;i++)f.tick();assert.equal(f.starts.length,0);assert.equal(f.c.wtcmd_production['10'].length,1);assert.equal(f.c.wtcmd_production['20'].length,1);
  f.units.length=0;f.accept(false);f.tick();const attempts=f.starts.length;for(let i=0;i<10;i++)f.tick();assert.equal(f.starts.length,attempts);
 });
 await check(mode+': batch repeat state survives ordinary script save/load and does not auto-enroll new factories',()=>{
  const f=native.fixture(mode);f.send('queue-production',{factoryId:10,templateId:'gun',all:true,repeat:true});const saved=f.save(),g=native.fixture(mode);Object.assign(g.c,saved);Object.assign(g.first,clone(f.first));Object.assign(g.other,clone(f.other));
  g.c.wtcmd_eventGameLoaded();assert.equal(g.policy().enabled,true);assert.equal(g.policy(g.other).enabled,true);g.finish();g.finish(g.other);g.factory(30);g.tick();assert.deepEqual(g.starts.map(s=>s.factoryId),[10,20]);
 });
}
for(const mode of ['towers','ffa','campaign','multiplayer']){
 await check(mode+': ALL appears only beside cycles on first vehicle/cyborg factory, not factory 2 or VTOL',()=>{
  const f=ui.fixture(mode);let html=f.c.factoryRecipeRow(f.recipe());assert.match(html,/wt-factory-repeat[\s\S]*data-production-all=[\s\S]*MANUFACTURE/);
  f.state.factory=22;assert.doesNotMatch(f.c.factoryRecipeRow(f.recipe(f.truck,f.other)),/data-production-all=/);
  const a=f.factory(33,{kind:'Cyborg factory'}),b=f.factory(44,{kind:'Cyborg factory'});f.state.snapshot.factories.push(a,b);f.state.factory=33;assert.match(f.c.factoryRecipeRow(f.recipe(f.truck,a)),/data-production-all=/);f.state.factory=44;assert.doesNotMatch(f.c.factoryRecipeRow(f.recipe(f.truck,b)),/data-production-all=/);
  const v=f.factory(55,{kind:'VTOL factory'});f.state.snapshot.factories.push(v);f.state.factory=55;assert.doesNotMatch(f.c.factoryRecipeRow(f.recipe(f.truck,v)),/data-production-all=/);assert.equal(f.sent.length,0);
 });
 await check(mode+': idle ALL/cycle only arm scope; Manufacture sends one explicit native batch and suppresses peer racing requests',async()=>{
  const f=ui.fixture(mode),all={dataset:{productionAll:f.c.templateParts(f.truck)}};f.c.toggleProductionAll(all);f.c.toggleProductionRepeat(f.repeatButton());
  for(let i=0;i<5;i++)f.c.renderFactory();assert.equal(f.sent.length,0);assert.equal(f.c.allForRecipe(f.first,f.recipe()),true);
  f.c.queueProduction(f.manufactureButton());assert.equal(f.sent.length,1);assert.deepEqual(f.sent[0].data,{factoryId:11,count:1,repeat:true,all:true,templateId:f.truck.id});
  f.c.queueProduction(f.manufactureButton());f.state.factory=22;f.c.queueProduction(f.manufactureButton());f.c.stopFactoryProduction({dataset:{stopProduction:'22'}});assert.equal(f.sent.length,1);
  const policy={enabled:true,key:f.c.templateParts(f.truck),design:f.truck};await f.ack('queue-production',{ok:true,result:{all:true,count:2,factories:[{factoryId:11,repeat:policy},{factoryId:22,repeat:policy}]}});
  assert.equal(f.c.repeatForRecipe(f.other,f.recipe(f.truck,f.other)),true);assert.equal(f.state.productionRequests.size,0);
 });
 await check(mode+': ALL cycle toggle addresses matching peer state, rolls back failure and preserves factory/page callback identity',async()=>{
  const f=ui.fixture(mode);f.work();f.work(f.other);f.c.toggleProductionAll({dataset:{productionAll:f.c.templateParts(f.truck)}});f.c.toggleProductionRepeat(f.repeatButton());
  assert.deepEqual(f.sent[0].data,{factoryId:11,enabled:true,all:true,templateId:f.truck.id});assert.equal(f.state.productionRepeatRequests.size,2);
  f.state.factory=22;f.c.toggleProductionRepeat(f.repeatButton());assert.equal(f.sent.length,1);await f.ack('set-production-repeat',{ok:false,reason:'production-changed'});assert.equal(f.state.productionRepeatRequests.size,0);assert.equal(f.c.repeatForRecipe(f.first,f.recipe()),false);
 });
 await check(mode+': new session/rewind and destroyed source clear ALL drafts without changing finite default or unrelated category',()=>{
  const f=ui.fixture(mode);f.c.toggleProductionAll({dataset:{productionAll:f.c.templateParts(f.truck)}});assert.equal(f.state.productionAllDrafts.size,1);
  f.c.reconcileManufacturingDisplay(f.state.snapshot,{...f.state.snapshot,gameTime:0});assert.equal(f.state.productionAllDrafts.size,0);f.c.queueProduction(f.manufactureButton());assert.equal(f.sent[0].data.all,undefined);assert.equal(f.sent[0].data.repeat,false);
 });
 await check(mode+': after STOP on factory 1 the ALL cycle still exposes and disables matching sibling repeat policies',async()=>{
  const f=ui.fixture(mode),policy={enabled:true,key:f.c.templateParts(f.truck),design:f.truck};f.work();f.work(f.other);f.first.repeat=clone(policy);f.other.repeat=clone(policy);
  f.c.toggleProductionAll({dataset:{productionAll:f.c.templateParts(f.truck)}});f.c.stopFactoryProduction({dataset:{stopProduction:'11'}});
  await f.ack('stop-production',{ok:true,result:{repeat:{enabled:false,key:'',design:null}}});
  assert.equal(f.c.repeatForRecipe(f.first,f.recipe()),true,'Sibling repeats must remain visible in the active ALL scope');
  f.c.toggleProductionRepeat(f.repeatButton());const request=f.sent.find(s=>s.action==='set-production-repeat');assert.ok(request);assert.equal(request.data.all,true);assert.equal(request.data.enabled,false);
 });
}
// Retain the previous finite/FIFO/repeat/STOP regression suite, writing fresh
// evidence to this revision rather than overwriting historical v0.77 proofs.
for(const type of ['native','ui']){
 const original=read('tools/test-manufacturing-'+type+'-077.cjs');
 const fresh=original.replaceAll('qa/manufacturing-clean-077','qa/manufacturing-all-086').replaceAll("version:'0.77'","version:'0.86'").replaceAll('/'+type+'.json','/baseline-'+type+'.json');
 const file=path.join(out,'run-baseline-'+type+'.cjs');
 // The helper is executed at its original tools location through eval, so all
 // relative imports stay stable; the generated report path is the only change.
 const wrapper='const requireOriginal=require;const {createRequire}=require("node:module");const path=require("node:path");const req=createRequire('+JSON.stringify(path.join(root,'tools/test-manufacturing-'+type+'-077.cjs'))+');new Function("require","__dirname",'+JSON.stringify(fresh)+')(req,'+JSON.stringify(path.join(root,'tools'))+');';
 fs.writeFileSync(file,wrapper);cp.execFileSync(process.execPath,[file],{cwd:root,stdio:'inherit'});
}
const files=['scenario/warzone-towers-commands.js','campaign/commands.js','scenario/ffa/commands.js','app/src/main/assets/multiplayer/mobile-ui-runtime.js','app/src/main/assets/warzone-command-pages.js','app/src/main/assets/warzone/ui/towers-commands.css','tools/test-manufacturing-all-086.cjs'];
const report={version:'0.86',passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,checksPassed:checks.length,checks,sources:files.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};fs.writeFileSync(path.join(out,'all.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length,report:'qa/manufacturing-all-086/all.json',actualNativeEngineExecuted:false}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
