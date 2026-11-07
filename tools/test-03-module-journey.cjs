'use strict';
// Focused real Dustfall gameplay. No grants, seeded units, save replacement,
// research assignment, design edits, or direct script build orders.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-03/module-journey');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs'),{controls}=require('./audit-smooth-building.cjs');
const {adb,screen,out}=live,reportFile=path.join(out,'module-journey.json');
const expectedWorkers=[160001,160003],sort=ids=>ids.slice().sort((a,b)=>a-b),json=JSON.stringify;
const worldRows=data=>Object.values(data||{}).filter(row=>row&&typeof row==='object'&&Number.isFinite(row.id));
const saveRow=(save,id)=>worldRows(save['struct.json']).find(row=>row.id===id);
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const state=async c=>{const r=await c.evaluate('__warzoneCommands.send("state")');assert.equal(r.ok,true,'fresh ordinary native acknowledgement');return r.result;};
const write=r=>fs.writeFileSync(reportFile,JSON.stringify(r,null,2)+'\n');
async function budget(c,label){
 const session=await c.evaluate('__towersHtml.report()');assert.notEqual(session.phase,'ended',label+': native battle has not ended');
 const fresh=await state(c),wave=await c.evaluate('__warzoneTowersWaves.report().snapshot');assert.equal(fresh.hasHQ,true,label+': actual native HQ remains present');
 assert.ok(wave.gameTime<225000,label+': focused QA fixture remains within its bounded native-time budget');return wave.gameTime;
}
async function exitBuild(c){if(await c.evaluate('__warzoneCommands.report().buildOpen'))await c.tap('#wt-build-sidebar [data-action="select-mode"]');await c.wait('!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().exitingBuild&&!__warzoneCommands.report().selectingTrucks',10000);}
async function selectItem(c,id,category){
 const cat='#wt-build-sidebar [data-category="'+category+'"]';
 const selected=await c.host(`document.querySelector(${json(cat)})?.classList.contains('active')`);
 if(!selected)await c.tap(cat);
 await c.tap('#wt-sidebar-catalogue [data-build="'+id+'"]');
 assert.equal(await c.evaluate('__warzoneCommands.report().placement'),id,'the actual catalogue tap chooses requested '+id);
}
async function assertWorkers(c,label,record){
 await c.wait('!__warzoneCommands.report().selectingTrucks',10000);
 const fresh=await state(c),report=await c.evaluate('__warzoneCommands.report()');
 assert.deepEqual(sort(fresh.selectedUnits.map(d=>d.id)),expectedWorkers,label+': two actual native selected/highlighted trucks');
 assert.deepEqual(sort(report.nativeBuildGroup),expectedWorkers,label+': UI group is the native group');
 assert.ok(fresh.selectedUnits.every(d=>d.constructor),label+': no combat units selected');
 record.selection={native:fresh.selectedUnits,group:report.nativeBuildGroup,clock:fresh.gameTime};
 record.selectionScreen=screen(label+'-two-native-highlights');return fresh;
}
async function openBuildWith(c,id,category,label,record){
 await c.tap('#wt-open-build');
 // Do not wait for selection setup before the first actual catalogue choice.
 await selectItem(c,id,category);
 record.requestedItem=id;await assertWorkers(c,label,record);
}
async function queueAt(c,ctl,id,x,y,record,expectOk=true){
 assert.equal(await c.evaluate('__warzoneCommands.report().placement'),id,'requested item still active immediately before world touch');
 const before=await c.evaluate('__warzoneCommands.report().history.length');
 record.point=await ctl.tile(x,y);
 await c.wait(`__warzoneCommands.report().history.slice(${before}).some(r=>r.action==='queue-build')`,10000);
 const replies=await c.evaluate(`__warzoneCommands.report().history.slice(${before}).filter(r=>r.action==='queue-build')`),reply=replies.at(-1);
 assert.equal(reply.ok,expectOk,'actual native result for '+id+' at '+x+','+y+': '+json(reply));
 if(expectOk){assert.equal(reply.result.itemId,id);assert.equal(reply.result.x,x);assert.equal(reply.result.y,y);assert.deepEqual(sort(reply.result.workers),expectedWorkers);}
 record.reply=reply;record.queuedScreen=screen('module-'+(expectOk?'accepted':'rejected')+'-'+id+'-'+x+'-'+y);return reply;
}
async function waitDone(c,jobs,label,timeout){
 await c.wait(`(()=>{const s=__warzoneCommands.report().snapshot;if(__towersHtml.isEnded()||s?.hasHQ===false)throw Error('Native battle/HQ ended while waiting for ${label}');const f=s?.finishedBuilds||[];return ${json(jobs.map(j=>j.id))}.every(id=>f.some(row=>row.id===id));})()`,timeout);
 await exitBuild(c);return state(c);
}
function assertModule(save,parentId,label){
 const row=saveRow(save,parentId);assert.ok(row,label+': same genuine native parent ID');
 assert.equal(row.modules,1,label+': one actual native module');assert.equal(row.currentBuildPts,500,label+': native build points complete');
 return {id:row.id,name:row.name,modules:row.modules,currentBuildPts:row.currentBuildPts,position:row.position,statusEvidence:'native finishedBuilds requires parent status BUILT; genuine F7 confirms modules/build points'};
}
async function clearNativeSelection(c,label,record){
 await exitBuild(c);const before=await state(c);assert.ok(await c.evaluate('WarzoneTerrain.refresh()'),'fresh camera before native RMB selection clear');
 const p=await c.evaluate(`(()=>{const x=innerWidth/2,y=innerHeight/2;if(!__kalaWarzoneTouch.isBattlefieldPoint(x,y))throw Error('Clear-selection centre is not a free non-radar field point');if(!WarzoneTerrain.pick(x,y))throw Error('Clear-selection centre has no observed terrain');return{x,y};})()`);
 await c.evaluate(`__kalaWarzoneTouch.nativeWorldClick(${p.x},${p.y},false,2)`);
 const after=await state(c);assert.equal(after.selectedUnits.length,0,'real native RMB clears selection');
 for(const d of before.trucks){const next=after.trucks.find(t=>t.id===d.id);assert.equal(next.order,d.order,'RMB selection clear does not issue a move order');}
 record.clearSelection={point:p,before:before.selectedUnits,after:after.selectedUnits};record.clearScreen=screen(label+'-real-rmb-cleared');
}
async function trucks(c,label,record){
 const visible=await c.host(`(()=>{const e=document.getElementById('wt-select-trucks');return e&&!e.closest('[inert]')&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().height>0;})()`);
 if(!visible)await c.tap('#wt-field-toggle');
 await c.tap('#wt-select-trucks');await assertWorkers(c,label,record);
}
function assertNativeModuleOrder(save,job){
 const droids=worldRows(save['droid.json']).filter(d=>expectedWorkers.includes(d.id));
 const working=droids.filter(d=>d['order/type']===4&&d['order/stats']===job.itemId);
 assert.ok(working.length,'genuine F7 records DORDER_BUILD for exact module '+job.itemId);
 return {parentId:job.parentId,itemId:job.itemId,workers:droids.map(d=>({id:d.id,order:d['order/type'],item:d['order/stats'],position:d.position,orderPosition:d['order/pos']}))};
}
async function roundtrip(c,r,parents,tower){
 await exitBuild(c);const library=await c.evaluate('BlockNightAndroid.loadDesigns()'),saved=await c.save('module-roundtrip-before'),at=saved['gam.json'].gameTime;
 await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+String(at+4500),12000);
 const pre=await clock(c),started=Date.now();r.quickload={savedTime:at,preLoadClock:pre,cdpTimeoutMs:90000};
 try{await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true',{timeoutMs:90000});await c.wait(`__warzoneTowersWaves.report().snapshot.gameTime>=${at-500}&&__warzoneTowersWaves.report().snapshot.gameTime<${pre-2000}`,90000,{timeoutMs:90000});}finally{r.quickload.loadingWallMs=Date.now()-started;}
 r.quickload.readiness=await require('./observe-native-load.cjs').observe(c,{label:'module-genuine-quickload'});
 r.quickload.rewoundClock=await clock(c);const current=await state(c);assert.equal(current.mapHeight,79);
 const loaded=await c.save('module-roundtrip-loaded');r.quickload.parents=parents.map(id=>assertModule(loaded,id,'QuickLoad parent '+id));
 const restoredTower=saveRow(loaded,tower.id);assert.ok(restoredTower);assert.equal(restoredTower.name,tower.name);assert.equal(restoredTower.currentBuildPts,tower.currentBuildPts);assert.deepEqual(restoredTower.position,tower.position);
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),library,'native save/load leaves phone designs unchanged');
 await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');r.quickload.factoryScreen=screen('module-roundtrip-factory');adb('shell','input','keyevent','4');
 await c.wait('!__warzoneCommands.report().page&&!parent.document.getElementById("warzone-game-frame").inert',8000);
 const running=await clock(c);r.quickload.inputClock=await j.waitAdvancingClock(c,running,10000);r.quickload.inputScreen=screen('module-roundtrip-restored-input');
}
async function run(options={}){
 const r={passed:false,seeded:false,started:new Date().toISOString(),method:'fresh authored Dustfall; real catalogue/world touches, native orders/completion and genuine F7/F8 only',phases:[],phase:'startup'};let c;
 try{
  r.identity=j.installedIdentity(options.apk);c=await j.start('td1');const png=adb('exec-out','screencap','-p');assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),600);
  const ctl=await controls(c);await ctl.camera(8,72);assert.ok(await c.evaluate('WarzoneTerrain.refresh()'));
  const initial=await c.save('module-native-initial');r.initial=await state(c);assert.equal(r.initial.mapHeight,79);
  const labs=[[4,71],[4,74]].map(([x,y])=>worldRows(initial['struct.json']).find(s=>s.name==='A0ResearchFacility'&&s.position[0]/128===x&&s.position[1]/128===y));assert.ok(labs.every(Boolean),'authored research parents exist');
  const power=saveRow(initial,160119);assert.ok(power&&power.name==='A0PowerGenerator');assert.deepEqual(power.position.slice(0,2),[6*128,57*128]);
  r.initialParents=[...labs,power].map(s=>({id:s.id,name:s.name,modules:s.modules||0,position:s.position}));assert.ok([...labs,power].every(s=>(s.modules||0)===0),'fresh authored parents have no modules');
  r.phase='research-modules';const research={};r.research=research;await budget(c,r.phase);await openBuildWith(c,'A0ResearchModule1','MODULES','research-first-build',research);
  const researchJobs=[];for(const [index,[x,y]]of [[4,71],[4,74]].entries()){const record={};(research.sites??=[]).push(record);const reply=await queueAt(c,ctl,'A0ResearchModule1',x,y,record);assert.equal(reply.result.parentId,labs[index].id);researchJobs.push(reply.result);}
  await exitBuild(c);research.orders=assertNativeModuleOrder(await c.save('module-research-native-orders'),researchJobs[0]);
  const done=await waitDone(c,researchJobs,'two research modules',75000);research.finished=done.finishedBuilds.filter(j=>researchJobs.some(job=>job.id===j.id));const researchSave=await c.save('module-research-native-complete');research.parents=labs.map(lab=>assertModule(researchSave,lab.id,'research module'));research.completeScreen=screen('module-research-complete');r.phases.push(r.phase);write(r);
  r.phase='power-module';const p={};r.power=p;await budget(c,r.phase);await clearNativeSelection(c,'after-research-movement',p);await openBuildWith(c,'A0PowMod1','MODULES','power-moved-workers-build',p);
  await ctl.camera(6,57);assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'A0PowMod1','radar keeps Power Module active');assert.deepEqual(sort((await state(c)).selectedUnits.map(t=>t.id)),expectedWorkers,'radar keeps the genuine selected group');
  const powerReply=await queueAt(c,ctl,'A0PowMod1',6,57,p);assert.equal(powerReply.result.parentId,160119);await exitBuild(c);p.orders=assertNativeModuleOrder(await c.save('module-power-native-orders'),powerReply.result);
  await waitDone(c,[powerReply.result],'power module',65000);p.parent=assertModule(await c.save('module-power-native-complete'),160119,'Power Module');p.completeScreen=screen('module-power-complete');r.phases.push(r.phase);write(r);
  r.phase='repeat-selection-and-module-limit';r.repeat={trucks:{},build:{}};await budget(c,r.phase);await clearNativeSelection(c,'power-after-travel',r.repeat.trucks);await trucks(c,'power-repeated-trucks',r.repeat.trucks);await clearNativeSelection(c,'power-before-repeat-build',r.repeat.build);
  await c.tap('#wt-open-build');await assertWorkers(c,'power-repeated-build',r.repeat.build);await c.tap('#wt-build-sidebar [data-category="MODULES"]');
  const beforeLimit=await state(c),powerAvailable=await c.host('Boolean(document.querySelector("#wt-sidebar-catalogue [data-build=\\"A0PowMod1\\"]"))');let rejected;
  if(powerAvailable){
   await selectItem(c,'A0PowMod1','MODULES');rejected=await queueAt(c,ctl,'A0PowMod1',6,57,r.repeat.build,false);r.repeat.build.limitCheck='actual catalogue/world touches';
  }else{
   // A full generator may legitimately remove Power Module from the catalogue.
   // Never force unavailable UI; use only the existing read-only native planner.
   r.repeat.build.expectedUiUnavailability=true;r.repeat.build.unavailableScreen=screen('module-power-capacity-unavailable');
   rejected=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'A0PowMod1',x:6,y:57,workerIds:${json(expectedWorkers)}})`);
   assert.equal(rejected.ok,false);r.repeat.build.preview=rejected;r.repeat.build.limitCheck='read-only native preview; full module unavailable in actual catalogue';
  }
  assert.equal(rejected.reason,'module-limit');await exitBuild(c);const afterLimit=await state(c);assert.deepEqual(afterLimit.jobs,beforeLimit.jobs,'duplicate module adds no native job');assert.equal(saveRow(await c.save('module-duplicate-rejected'),160119).modules,1,'duplicate module adds no capacity');r.phases.push(r.phase);write(r);
  r.phase='ordinary-tower';const t={};r.tower=t;await budget(c,r.phase);await openBuildWith(c,'GuardTower1','DEFENCES','ordinary-tower-build',t);
  let location;for(const [x,y]of [[8,56],[8,57],[7,55],[5,55],[4,57]]){const preview=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${x},y:${y},workerIds:${json(expectedWorkers)}})`);if(preview.ok){location={x,y};break;}}
  assert.ok(location,'prepared ordinary tower site is reachable and natively valid');const towerReply=await queueAt(c,ctl,'GuardTower1',location.x,location.y,t);await exitBuild(c);t.orders=await c.save('module-tower-native-orders');t.orders=worldRows(t.orders['droid.json']).filter(d=>expectedWorkers.includes(d.id)).map(d=>({id:d.id,order:d['order/type'],item:d['order/stats']}));assert.ok(t.orders.some(d=>d.order===4&&d.item==='GuardTower1'));
  await waitDone(c,[towerReply.result],'ordinary guard tower',40000);const towerSave=await c.save('module-tower-native-complete'),tower=worldRows(towerSave['struct.json']).find(s=>s.name==='GuardTower1'&&Math.floor(s.position[0]/128)===location.x&&Math.floor(s.position[1]/128)===location.y);assert.ok(tower);assert.equal(tower.currentBuildPts,300);t.native=tower;t.completeScreen=screen('module-tower-complete');r.phases.push(r.phase);write(r);
  r.phase='genuine-save-load-input';await budget(c,r.phase);await roundtrip(c,r,[...labs.map(lab=>lab.id),160119],tower);r.phases.push(r.phase);
  r.finishedNativeTime=await budget(c,'complete focused module journey');r.afterIdentity=j.installedIdentity(options.apk);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);assert.deepEqual(c.errors,[],'no unhandled WebView exceptions');r.passed=true;
 }catch(error){r.failure=String(error.stack||error);try{r.failureScreen=screen('module-journey-failure');r.failureState=await c.evaluate('({commands:__warzoneCommands.report(),research:__blockNightResearch.report(),wave:__warzoneTowersWaves.report(),touch:__kalaWarzoneTouch.report()})');}catch(capture){r.captureFailure=String(capture);}throw error;
 }finally{
  if(c){try{await j.closeOverlays(c);const stopped=await j.waitPausedClock(c,2600);if(stopped!==null)r.cleanup={alreadyStopped:true,clock:stopped,screen:screen('module-journey-cleanup-stopped')};else{adb('shell','input','keyevent','4');const at=await j.waitPausedClock(c,8000);assert.notEqual(at,null,'one Back pauses the observed active fixture');r.cleanup={oneActualAndroidBack:true,clock:at,screen:screen('module-journey-final-paused')};}}catch(error){r.cleanupFailure=String(error.stack||error);}c.close();}
  r.finished=new Date().toISOString();write(r);
 }
 if(r.cleanupFailure&&r.passed){r.passed=false;write(r);throw Error('Gameplay checks passed but paused cleanup failed: '+r.cleanupFailure);}
 return r;
}
module.exports={run,assertModule,assertNativeModuleOrder};
if(require.main===module){const args=process.argv.slice(2),a=args.indexOf('--apk');run({apk:a>=0?args[a+1]:process.env.WZ_QA_APK}).then(r=>console.log(json({passed:r.passed,identity:r.identity,phases:r.phases,nativeTime:r.finishedNativeTime}))).catch(error=>{console.error(error);process.exitCode=1});}
