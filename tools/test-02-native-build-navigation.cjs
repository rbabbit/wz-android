'use strict';
// Running native STATS/COMMANDERS -> immediate BUILD, plus paused STATS ->
// TRUCKS. Reuses ordinary authored units; never places a structure or unit order.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const live=require('./native-live.cjs'),journey=require('./lab-journey.cjs'),selection=require('./test-02-selection-journey.cjs');
const {out,screen,adb}=live;
const ids=[160003,160005,160011];
const sorted=x=>Array.from(x).sort((a,b)=>a-b);
async function state(c){return c.evaluate(`(()=>{const r=__warzoneCommands.report(),f=parent.document.getElementById('warzone-game-frame');return{...r,frameInert:f.inert,nativeBackVisible:!parent.document.getElementById('wt-native-back').hidden,clock:__warzoneTowersWaves.report().snapshot.gameTime,session:__towersHtml.report(),busyVisible:!parent.document.getElementById('wt-build-busy').hidden}})()`);}
function orders(s){return s.snapshot.trucks.map(t=>[t.id,t.order,t.x,t.y]).sort((a,b)=>a[0]-b[0]);}
async function run(options={}){
 const r={passed:false,seeded:false,started:new Date().toISOString(),phase:'fixture-readiness',cases:[],scope:'native panel entry and immediate BUILD/TRUCKS navigation only; no construction or movement orders'};let c;
 try{
  r.identity=journey.installedIdentity(options.apk);c=await journey.connectReady();await journey.resume(c);await journey.closeOverlays(c);
  const initial=await journey.commandState(c);assert.equal(initial.mapHeight,64,'ordinary prepared Iron Valley is active');const group=initial.trucks.filter(t=>ids.includes(t.id));assert.equal(group.length,3,'three authored western trucks exist');
  assert.ok(group.every(t=>[0,1].includes(t.order)&&!t.building),'prepared native workers are idle before navigation-only checks');
  const target=[Math.round(group.reduce((n,t)=>n+t.x,0)/3),Math.round(group.reduce((n,t)=>n+t.y,0)/3)];r.fixture=await selection.cameraFixture(c,target,ids);r.before=await state(c);
  await selection.monitor(c);
  for(const menu of ['stats','commanders']){
   r.phase=menu+'-to-build';const record={menu,entry:menu==='stats'?'real visible STATS header touch':'real HELP -> COMMANDERS button touches'};r.cases.push(record);
   if(menu==='stats')await c.tap('#wt-open-stats');else{await c.tap('#blocknight-help');await c.wait('parent.document.getElementById("warzone-towers-help-overlay")?.hidden===false',6000);await c.tap('#warzone-towers-help-overlay [data-commanders]');}
   await c.wait('__warzoneCommands.report().nativeMenu==='+JSON.stringify(menu),6000);
   record.nativeOpened=await journey.commandState(c);assert.equal(record.nativeOpened.nativeMenu,menu,'actual native scenario acknowledges the panel request (an empty Commanders panel may only show its engine banner)');record.openScreen=screen(menu+'-to-build-01-native-open');
   // The first item tap is deliberately immediate; no native-close wait here.
   await selection.chooseFirst(c);record.immediate=await state(c);assert.equal(record.immediate.placement,'GuardTower1');
   await c.wait('!__warzoneCommands.report().nativeClosing&&!__warzoneCommands.report().selectingTrucks',10000);
   record.selected=await selection.waitSelection(c,ids);record.nativeClosed=await journey.commandState(c);record.returned=await state(c);
   assert.equal(record.nativeClosed.nativeMenu,'','the original native panel is closed before selecting real field workers');
   assert.equal(record.returned.nativeMenu,'');assert.equal(record.returned.nativeBackVisible,false,'native BACK TO BATTLE control is gone');assert.equal(record.returned.frameInert,false);assert.equal(record.returned.busyVisible,false);
   assert.deepEqual(orders(record.returned),orders(r.before),'native panel navigation and selection do not change truck orders or positions');record.buildScreen=screen(menu+'-to-build-02-live-selection');
   await selection.closeBuild(c);
  }
  r.phase='paused-stats-to-trucks';const paused={};r.cases.push({name:'paused STATS request -> TRUCKS -> ordinary Resume -> TRUCKS',record:paused});
  paused.stoppedAt=await journey.pause(c);await c.tap('#wt-open-stats');await c.wait('__warzoneCommands.report().nativeMenu==="stats"',6000);paused.opened=await state(c);paused.openedScreen=screen('paused-stats-to-trucks-01-open');
  await selection.revealField(c);const started=Date.now();await c.tap('#wt-select-trucks');
  await c.wait('!__warzoneCommands.report().exitingBuild&&!__warzoneCommands.report().selectingTrucks&&!__warzoneCommands.report().nativeMenu',6500);
  paused.elapsedMs=Date.now()-started;paused.returned=await state(c);assert.ok(paused.elapsedMs<6500,'paused native close does not hold the UI indefinitely');
  assert.equal(paused.returned.frameInert,false);assert.equal(paused.returned.buildOpen,false);assert.equal(paused.returned.busyVisible,false);assert.equal(paused.returned.session.phase,'playing');
  paused.toast=await c.host(`(()=>{const e=document.getElementById('wt-command-toast');if(!e)return{present:false};const s=getComputedStyle(e),b=e.getBoundingClientRect();return{present:true,hidden:e.hidden,display:s.display,visibility:s.visibility,text:e.textContent,rect:{x:b.x,y:b.y,left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height},viewport:{width:innerWidth,height:innerHeight}}})()`);
  if(paused.toast.present&&paused.toast.display!=='none'&&paused.toast.visibility!=='hidden'){const t=paused.toast;assert.ok(t.rect.height>0&&t.rect.height<100,'visible Resume notification stays a compact toast');assert.ok(t.rect.left>=-1&&t.rect.top>=-1&&t.rect.right<=t.viewport.width+1&&t.rect.bottom<=t.viewport.height+1,'visible Resume notification fits inside the actual viewport');}
  assert.equal(await journey.waitPausedClock(c,5000),paused.stoppedAt,'navigation does not silently resume the game');paused.returnedScreen=screen('paused-stats-to-trucks-02-bounded-return');
  paused.resumedAt=await journey.resume(c);await c.wait('!__warzoneCommands.report().nativeClosing',8000);assert.equal((await journey.commandState(c)).nativeMenu,'','the retained native close finishes normally on Resume');
  paused.reselected=await selection.truckButton(c,ids);paused.restored=await state(c);assert.deepEqual(sorted(paused.restored.snapshot.selectedUnits.map(t=>t.id)),sorted(ids));assert.deepEqual(orders(paused.restored),orders(r.before));paused.restoredScreen=screen('paused-stats-to-trucks-03-restored');
  r.monitor=await selection.stopMonitor(c);assert.ok(r.monitor.samples.every(s=>!s.covered),'navigation never captures or covers the battlefield');
  assert.deepEqual(c.errors,[],'no uncaught WebView exceptions');r.afterIdentity=journey.installedIdentity(options.apk);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);r.passed=true;
 }catch(error){r.failure=String(error.stack||error);r.failureKind=r.phase==='fixture-readiness'?'fixture-readiness':'product-check';try{screen('native-build-navigation-failure');r.failureState=await state(c);}catch{}throw error;
 }finally{
  if(c){try{if(!r.monitor)r.monitor=await selection.stopMonitor(c);if(!await c.evaluate('__towersHtml.isEnded()'))r.pausedAt=await journey.pause(c);}catch(error){r.recoveryFailure=String(error.stack||error);}c.close();}
  r.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'native-build-navigation.json'),JSON.stringify(r,null,2));
 }
 return r;
}
module.exports={run,state};
if(require.main===module){const args=process.argv.slice(2),apk=args.indexOf('--apk');run({apk:apk>=0?args[apk+1]:process.env.WZ_QA_APK}).then(r=>console.log(JSON.stringify({passed:r.passed,identity:r.identity,cases:r.cases.map(c=>c.menu||c.name)}))).catch(error=>{console.error(error);process.exitCode=1;});}
