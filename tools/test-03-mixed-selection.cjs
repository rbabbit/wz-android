'use strict';
// Real UI selection/orders on six authored constructors and two ordinarily
// produced tanks. The only restored data is a complete ordinary native save.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const selection=require('./test-02-selection-journey.cjs');
const {controls}=require('./audit-smooth-building.cjs');
const {screen,out,adb}=live;
const IDS=[160003,160005,160011],TANK=160193;
const sorted=a=>Array.from(a).sort((a,b)=>a-b);
const units=save=>Object.values(save['droid.json']).filter(d=>d.player===save.commands.snapshot.player).sort((a,b)=>a.id-b.id);
const nativeOrder=d=>[d.id,d.player,d.position,d['order/type'],d['order/stats']??null,d['order/pos']??null,d['order/object']??null,d.orderList??null];
const write=r=>fs.writeFileSync(path.join(out,'mixed-selection.json'),JSON.stringify(r,null,2)+'\n');
async function fresh(c){const r=await c.evaluate('__warzoneCommands.send("state",{}, {fresh:true})');assert.equal(r.ok,true);return r.result;}
async function observe(c){return c.evaluate('({commands:__warzoneCommands.report(),touch:__kalaWarzoneTouch.report(),session:__towersHtml.report()})');}
async function selected(c){
 await c.wait('!__warzoneCommands.report().selectingTrucks&&!__warzoneCommands.report().exitingBuild&&!__warzoneCommands.report().nativeClosing',20000);
 const s=await fresh(c),r=await observe(c);assert.deepEqual(sorted(s.selectedUnits.map(d=>d.id)),IDS,'exact visible native constructor group');
 assert.ok(s.selectedUnits.every(d=>d.constructor));assert.ok(s.trucks.filter(t=>IDS.includes(t.id)).every(t=>t.selected),'native highlights');
 assert.deepEqual(sorted(r.commands.nativeBuildGroup),IDS,'logical/native selection agree');return r;
}
async function field(c,selector){await selection.revealField(c);await c.tap(selector);}
async function stop(c){const before=await c.evaluate('__kalaWarzoneTouch.report().stopAcks');await field(c,'#blocknight-stop');await c.wait('__kalaWarzoneTouch.report().stopAcks>'+before,10000);}
async function save(c,name){const r=await c.save(name);assert.equal(units(r).length,8,'ordinary six trucks and two produced tanks');return r;}
function unchanged(before,after){assert.deepEqual(units(after).map(nativeOrder),units(before).map(nativeOrder),'selection changes no native unit positions or orders');}
async function visible(c,save){
 assert.equal(await c.evaluate('WarzoneTerrain.refresh(8000)'),true,'observe a fresh terrain draw after native QuickSave before validating fixture coordinates');
 const rows=units(save).map(d=>({id:d.id,position:d.position}));
 const r=await c.evaluate(`(()=>{const side=parent.document.getElementById('wt-build-sidebar'),css=parent.getComputedStyle(side),right=parseFloat(css.left)+parseFloat(css.width);return ${JSON.stringify(rows)}.map(d=>{const [x,y,z]=d.position,h=WarzoneTerrain.heightAt(x,y),p=WarzoneTerrain.project(x,y,(h??z)+32);return {...d,point:p,field:Boolean(p&&__kalaWarzoneTouch.isBattlefieldPoint(p.x,p.y)),outsideSidebar:Boolean(p&&p.x>right+2),viewport:[innerWidth,innerHeight]};})})()`);
 for(const id of [...IDS,TANK]){const d=r.find(d=>d.id===id);assert.ok(d?.point&&d.field&&d.outsideSidebar&&d.point.x>4&&d.point.x<d.viewport[0]-4&&d.point.y>4&&d.point.y<d.viewport[1]-24,'mixed fixture has visible body outside controls: '+id);}
 return r;
}
async function returns(c,r){
 await selection.closeBuild(c);await c.tap('#wt-open-stats');await c.wait('__warzoneCommands.report().nativeMenu==="stats"');
 const opened=await fresh(c);assert.equal(opened.nativeMenu,'stats');await selection.chooseFirst(c);
 r.statsBuild=await selected(c);assert.equal((await fresh(c)).nativeMenu,'');screen('mixed-09-stats-build');await selection.closeBuild(c);
 r.returns=[];
 for(const name of ['factory','help','research']){
  if(name==='factory'){await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');}
  if(name==='help'){await c.tap('#blocknight-help');await c.wait('parent.document.getElementById("warzone-towers-help-overlay")?.hidden===false');}
  if(name==='research'){await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open');}
  screen('mixed-return-'+name+'-open');adb('shell','input','keyevent','4');
  await c.wait('!__warzoneCommands.report().page&&!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose&&parent.document.getElementById("warzone-towers-help-overlay")?.hidden!==false&&!parent.document.getElementById("warzone-game-frame").inert',10000);
  r.returns.push({name,native:await fresh(c),state:await observe(c)});screen('mixed-return-'+name+'-restored');
 }
}
async function run(options={}){
 const r={passed:false,seeded:false,started:new Date().toISOString(),phase:'fixture-readiness',scope:'mixed visible combat/constructor selection, real two-site construction FIFO, selection during work, noncentral movement/STOP and related returns',cases:[]};let c,priorMonitor;
 try{
  if(options.resumeMovement){const prior=JSON.parse(fs.readFileSync(path.join(out,'mixed-selection.json')));assert.equal(prior.phase,'noncentral-movement-stop');assert.equal(prior.identity.candidateAPK_SHA256,j.installedIdentity(options.apk).candidateAPK_SHA256);assert.equal(prior.structures.length,2);Object.assign(r,prior);priorMonitor=r.monitor;delete r.monitor;(r.fixtureRetries??=[]).push({phase:prior.phase,failure:prior.failure,correction:'Reuse the completed ordinary two-tower fixture; validate a clear reachable move destination before the actual touch.'});delete r.failure;delete r.failureState;delete r.recoveryFailure;c=await j.connectReady();await j.resume(c);await selection.monitor(c);}
  else{
  r.identity=j.installedIdentity(options.apk);r.reusedPreparedState=Boolean(options.reuse);c=options.reuse||options.reuseStart?await j.connectReady():await j.start('td2');if(!options.reuse)await j.restoreFixture(c,'early',r);await j.resume(c);
  const initial=await fresh(c);assert.equal(initial.trucks.length,6);assert.equal(initial.mapHeight,64);
  // ALL UNITS is the ordinary combat-only field command; STOP halts both
  // genuinely produced tanks before the selection-only position oracle.
  if(!options.reuse){await field(c,'#blocknight-select-all');await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length===2&&__warzoneCommands.report().snapshot.selectedUnits.every(d=>!d.constructor)',12000);await stop(c);}
  await c.wait('__warzoneCommands.report().snapshot.selectedUnits.every(d=>[0,1,25].includes(d.order))');
  const a=await controls(c);await a.camera(5,37);r.baseline=await save(c,'mixed-01-native-baseline');
  assert.ok(units(r.baseline).every(d=>[0,1,25].includes(d['order/type'])&&Number(d.moveStatus||0)===0),'all eight native units are stationary after STOP; combat tanks normally resume stationary GUARD25');
  r.visibility=await visible(c,r.baseline);screen('mixed-01-combat-and-trucks');await selection.monitor(c);
  r.phase='mixed-build-selection';await selection.chooseFirst(c);r.immediate=await observe(c);assert.equal(r.immediate.commands.placement,'GuardTower1');
  r.mixed=await selected(c);r.afterBuild=await save(c,'mixed-02-native-after-build');unchanged(r.baseline,r.afterBuild);screen('mixed-02-constructor-only-highlights');
  r.mixedCombatOracle={tankId:TANK,visible:r.visibility.find(d=>d.id===TANK),selectedIds:r.afterBuild.commands.snapshot.selectedUnits.map(d=>d.id),trace:r.mixed.commands.truckSelection};
  await selection.closeBuild(c);await field(c,'#wt-select-trucks');r.repeated=await selected(c);r.afterTrucks=await save(c,'mixed-03-native-after-trucks');unchanged(r.baseline,r.afterTrucks);
  r.cases.push('visible combat excluded; exact native constructor IDs/highlights; all eight native orders/positions unchanged');
  r.phase='two-site-fifo';await selection.chooseFirst(c);await selected(c);r.sites=[];
  for(const [x,y]of [[8,40],[9,40]]){
   const preview=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${x},y:${y},workerIds:__warzoneCommands.report().nativeBuildGroup})`);assert.equal(preview.ok,true,'reachable ordinary tower site');
   await a.tile(x,y);await c.wait(`__warzoneCommands.report().snapshot.jobs.some(j=>j.itemId==='GuardTower1'&&j.x===${x}&&j.y===${y})`,10000);
   const s=await fresh(c);r.sites.push(s.jobs.find(j=>j.itemId==='GuardTower1'&&j.x===x&&j.y===y));
  }
  await selection.closeBuild(c);r.duringBefore=await save(c,'mixed-04-native-building-before-trucks');assert.ok(r.duringBefore.commands.snapshot.jobs.length,'construction is active before TRUCKS');
  const cancelCount=await c.evaluate('__warzoneCommands.report().history.filter(h=>h.action==="cancel-job").length');
  await field(c,'#wt-select-trucks');r.duringSelection=await selected(c);r.duringAfter=await save(c,'mixed-05-native-building-after-trucks');
  const continuing=[...r.duringAfter.commands.snapshot.jobs,...r.duringAfter.commands.snapshot.finishedBuilds];
  assert.ok(r.sites.every(job=>continuing.some(j=>j.id===job.id)),'accepted job IDs survive TRUCKS selection');
  assert.equal(await c.evaluate('__warzoneCommands.report().history.filter(h=>h.action==="cancel-job").length'),cancelCount,'selection issues no job cancellation');screen('mixed-05-trucks-while-building');
  await c.wait(`(()=>{const done=__warzoneCommands.report().snapshot.finishedBuilds;return ${JSON.stringify(r.sites.map(s=>s.id))}.every(id=>done.some(j=>j.id===id))})()`,90000);
  r.completed=await save(c,'mixed-06-native-two-towers-completed');const done=r.completed.commands.snapshot.finishedBuilds.filter(s=>r.sites.some(j=>j.id===s.id));assert.deepEqual(done.map(j=>j.id),r.sites.map(j=>j.id),'native FIFO completion order');
  r.structures=r.sites.map(j=>{const d=Object.values(r.completed['struct.json']).find(s=>s.name==='GuardTower1'&&s.position[0]===(j.x+.5)*128&&s.position[1]===(j.y+.5)*128);assert.ok(d);assert.equal(d.currentBuildPts,300);return d;});
  r.cases.push('two ordinary GuardTower1 jobs survive EXIT and TRUCKS during work, then complete FIFO at native300points');
  }
  const a=await controls(c);r.phase='noncentral-movement-stop';await j.closeOverlays(c);const beforeMove=await fresh(c);let move;
  for(const [x,y]of [[8,35],[6,36],[9,35],[7,35]]){const p=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${x},y:${y},workerIds:${JSON.stringify(IDS)}})`);if(p.ok){move={x,y};break;}}
  assert.ok(move,'native clear reachable movement destination exists');r.moveTarget=move;await a.tile(move.x,move.y);
  await c.wait(`(()=>{const s=__warzoneCommands.report().snapshot;return s.trucks.some(t=>${JSON.stringify(beforeMove.trucks.filter(t=>IDS.includes(t.id)).map(t=>[t.id,t.x,t.y]))}.some(([id,x,y])=>id===t.id&&(x!==t.x||y!==t.y)))})()`,20000);
  await stop(c);r.moved=await save(c,'mixed-07-native-noncentral-stop');await a.camera(5,37);r.movedVisibility=await visible(c,r.moved);
  await selection.chooseFirst(c);r.afterMove=await selected(c);await c.tap('#wt-sidebar-catalogue [data-build="A0HardcreteMk1Wall"]');assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'A0HardcreteMk1Wall');
  await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1');r.rechosen=await selected(c);screen('mixed-08-noncentral-reselection');
  r.cases.push('ordinary movement/STOP away from camera centre, repeated real selection and item choices retained');
  r.phase='related-returns';await returns(c,r);r.cases.push('native STATS to immediate BUILD; Factory, Help and Research Back restore actual input');
  r.monitor=await selection.stopMonitor(c);if(priorMonitor){r.monitor.samples=[...priorMonitor.samples,...r.monitor.samples];r.monitor.clicks=[...priorMonitor.clicks,...r.monitor.clicks];}const samples=r.monitor.samples;assert.ok(samples.length>3&&samples.every(s=>!s.covered&&!s.ended));
  assert.ok(samples.at(-1).frames>samples[0].frames&&samples.at(-1).clock>samples[0].clock);
  assert.ok(samples.every(s=>s.frame.join()===samples[0].frame.join()&&s.canvas.join()===samples[0].canvas.join()&&s.zoom.join()===samples[0].zoom.join()),'no viewport change or automatic zoom');
  r.errors=c.errors;assert.deepEqual(r.errors,[]);r.afterIdentity=j.installedIdentity(options.apk);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);r.passed=true;
 }catch(error){r.failure=String(error.stack||error);r.failureKind=r.phase==='fixture-readiness'?'fixture-readiness':'product-check';if(c)try{r.failureState=await observe(c);screen('mixed-selection-failure');}catch{}throw error;
 }finally{
  if(c){try{if(!r.monitor)r.monitor=await selection.stopMonitor(c);if(!await c.evaluate('__towersHtml.isEnded()'))r.pausedAt=await j.pause(c);}catch(error){r.recoveryFailure=String(error.stack||error);}c.close();}
  r.finished=new Date().toISOString();write(r);
 }
 return r;
}
module.exports={run};
if(require.main===module){const args=process.argv.slice(2),n=args.indexOf('--apk');run({apk:n>=0?args[n+1]:process.env.WZ_QA_APK,reuse:args.includes('--reuse'),reuseStart:args.includes('--reuse-start'),resumeMovement:args.includes('--resume-movement')}).then(r=>console.log(JSON.stringify({passed:r.passed,identity:r.identity,cases:r.cases}))).catch(e=>{console.error(e);process.exitCode=1;});}
