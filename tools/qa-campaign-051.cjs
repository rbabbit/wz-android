'use strict';
// Real Android input + observed native state. No seeded units, grants or debug orders.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const q=require('./campaign-live-051.cjs');
const out=q.out,results=[];
const apk=path.join(q.root,'app/build/outputs/apk/debug/app-debug.apk');
const sha=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
function record(name,data){results.push({name,data});fs.writeFileSync(path.join(out,'integrated.json'),JSON.stringify({candidateAPK_SHA256:sha,results},null,2));console.log('PASS '+name);}
function assert(ok,why){if(!ok)throw Error(why);}
let c;
async function connectReady(){
  const end=Date.now()+30000;
  while(Date.now()<end){try{return await q.connect();}catch(error){if(!/not ready/.test(String(error.message||error)))throw error;await q.delay(120);}}
  throw Error('Campaign WebView did not become ready');
}
async function nativeWorld(){
  const s=await c.evaluate('window.__warzoneCampaign?.report?.()');
  if(s?.nativeState?.paused&&!s.nativeState.video){
    const visible=await c.evaluate('(()=>{const b=parent.document.getElementById("wt-campaign-native-back");return !!b&&!b.hidden})()');
    if(visible){
      await c.tap('#wt-campaign-native-back');
      // The observer is sampled by the HUD. Do not click Back again while its
      // previous paused packet is still cached after a successful native exit.
      await c.wait('__warzoneCampaign.report().nativeState.worldSafe',5000);
    }
  }
}
async function until(expression,ms=40000){
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){const value=await c.evaluate(expression);if(value)return value;await nativeWorld();await q.delay(120);}
  throw Error('Native condition missing: '+expression);
}
async function worldPoint(x,y){
  assert(await c.evaluate('WarzoneTerrain.refresh()'),'Actual terrain projection unavailable');
  return c.evaluate(`(()=>{const p=WarzoneTerrain.project(${x}*128+64,${y}*128+64,0),f=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{...p,hostY:p.y+f.y,hostX:p.x+f.x,w:parent.innerWidth,h:parent.innerHeight,pick:WarzoneTerrain.pick(p.x,p.y)}})()`);
}
function inputPoint(p){
  const png=q.adb('exec-out','screencap','-p');
  const x=Math.round(p.hostX*png.readUInt32BE(16)/p.w),y=Math.round(p.hostY*png.readUInt32BE(20)/p.h);
  q.adb('shell','input','tap',String(x),String(y));
}
async function build(item,x,y){
  const open=await c.evaluate('__warzoneCommands.report().buildOpen');
  if(!open)await c.tap('#wt-open-build');
  await c.tap('button[data-category="STRUCTURES"]');
  // Choose the item immediately; waiting on the truck picker first hides input races.
  await c.tap(`button[data-build="${item}"]`);
  await until(`__warzoneCommands.report().nativeToolReady&&__warzoneCommands.report().placement===${JSON.stringify(item)}&&__warzoneCommands.report().nativeBuildGroup.length>=3`);
  const preview=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:${JSON.stringify(item)},x:${x},y:${y},workerIds:__warzoneCommands.report().nativeBuildGroup})`);
  assert(preview.ok,'Native footprint/reachability rejected: '+JSON.stringify(preview));
  const p=await worldPoint(x,y);assert(p.pick?.x===x&&p.pick?.y===y,'Projected site did not match native tile');
  inputPoint(p);
  const site=await until(`__warzoneCommands.report().snapshot?.constructionSites?.find(s=>s.itemId===${JSON.stringify(item)}&&s.x===${x}&&s.y===${y})`);
  await until(item==='A0CommandCentre'?'__warzoneCommands.report().snapshot?.hasHQ':`__warzoneCommands.report().snapshot?.factories?.some(f=>f.x===${x}&&f.y===${y}&&f.ready)`,50000);
  await nativeWorld();
  record('Native construction '+item,{preview,site,final:await c.evaluate('({hq:__warzoneCommands.report().snapshot.hasHQ,factories:__warzoneCommands.report().snapshot.factories})')});
  if(await c.evaluate('__warzoneCommands.report().buildOpen'))await c.tap('#wt-open-build');
}
async function restoredWorld(saved){
  await c.wait('window.WarzoneSavedGames?.loading&&window.WarzoneSavedGames?.ready',45000);
  // Save hydration is acknowledged before the mobile command bridge's first
  // native snapshot. Require both independently rather than dereferencing null.
  await c.wait('__warzoneCommands.report().snapshot?.hasHQ&&__warzoneCommands.report().snapshot.trucks.length===4&&__warzoneCommands.report().snapshot.factories.some(f=>f.ready)',15000);
  const restored=await c.evaluate(String.raw`({save:WarzoneSavedGames.report(),campaign:__warzoneCampaign.report(),snapshot:__warzoneCommands.report().snapshot,errors:(errorLog||[]).filter(v=>/error\s*\||Uncaught|Assert in Warzone/.test(v))})`);
  assert(restored.save.slotId===saved.savedId,'Restored save identity differs');
  assert(!restored.errors.length,'Native load errors: '+JSON.stringify(restored.errors));
  record('Continue restores actual campaign world',restored);c.screen('final-alpha-continued');
}
function complete(resume){
  fs.writeFileSync(path.join(out,'integrated-passed.json'),JSON.stringify({passed:true,candidateAPK_SHA256:sha,resumedPreparedWorld:resume,fixtureCorrections:['Await the original Alpha guide before battlefield checks','Wait for observed native return after one Back press; never automatically press it twice against a cached paused packet','Wait separately for native save hydration and the command bridge first snapshot'],results},null,2));
  console.log('INTEGRATED CAMPAIGN PASS '+results.length);
}
(async()=>{
  const remote=q.adb('shell','pm','path',q.packageId).toString().trim().split('\n').find(v=>v.endsWith('/base.apk'))?.replace(/^package:/,'');
  assert(/^\/data\/app\/[A-Za-z0-9_~+=.\/-]+\/base\.apk$/.test(remote||''),'Installed package path invalid');
  assert(q.adb('shell','sha256sum',remote).toString().startsWith(sha),'Installed APK differs from candidate');
  if(process.argv.includes('--resume-after-load')){
    const previous=JSON.parse(fs.readFileSync(path.join(out,'integrated.json'),'utf8'));
    assert(previous.candidateAPK_SHA256===sha&&previous.results.length===12,'Load resume evidence does not match exact APK/journey');
    results.push(...previous.results);c=await connectReady();
    await restoredWorld(results.find(r=>r.name==='Campaign phone save').data);complete(true);return;
  }
  const resume=process.argv.includes('--resume-after-production');
  if(resume){
    const previous=JSON.parse(fs.readFileSync(path.join(out,'integrated.json'),'utf8'));
    assert(previous.candidateAPK_SHA256===sha&&previous.results.length===7,'Resume evidence does not match this exact APK/journey');
    c=await connectReady();
    assert(await c.evaluate('__warzoneCommands.report().snapshot?.hasHQ&&__warzoneCommands.report().snapshot.trucks.length===4&&__warzoneCommands.report().snapshot.factories.some(f=>f.ready)'),'Prepared campaign world changed');
    results.push(...previous.results);
    console.log('RESUME existing native world after seven passed cases; fixture double-Back wait corrected');
  }else{
  await q.nativeTap('Open the original campaign');await q.nativeTap('NEW CAMPAIGN');
  c=await connectReady();
  await c.wait('window.__warzoneCampaign?.report().nativeState?.video',45000);
  await c.wait('performance.getEntriesByType("resource").some(e=>e.name.includes("/sequences/cam1/c001.ogg")&&e.responseEnd>0)',30000);
  const videoClock=await c.evaluate('__warzoneCampaign.report().nativeState.realTime');
  await c.wait('__warzoneCampaign.report().nativeState.video&&__warzoneCampaign.report().nativeState.realTime>'+Number(videoClock+400));
  c.screen('final-alpha-video');
  record('Opening movie from private offline route',await c.evaluate('({native:__warzoneCampaign.report().nativeState,resources:performance.getEntriesByType("resource").filter(e=>e.name.includes("/sequences/")).map(e=>e.name)})'));
  const viewport=await c.host('({w:innerWidth,h:innerHeight})');
  inputPoint({hostX:viewport.w/2,hostY:viewport.h/2,...viewport});
  await until('window.__warzoneCampaign?.report().snapshot?.mission==="cam1a"');
  // Alpha schedules its original HQ guide at three simulation seconds. Verify
  // and close that actual starting panel before exercising battlefield input.
  await c.wait('__warzoneCampaign.report().nativeState?.paused&&__warzoneCampaign.report().nativeState.gameTime>=3002',15000);
  c.screen('final-alpha-guide');
  await nativeWorld();
  await until('window.__warzoneCampaign?.report().nativeState?.worldSafe===true');
  await until('__warzoneCommands.report().snapshot?.trucks?.length===3');
  record('Alpha mission and original guide return',await c.evaluate('({campaign:__warzoneCampaign.report(),trucks:__warzoneCommands.report().snapshot.trucks})'));
  await c.tap('#wt-campaign-all-combat');
  await until('__warzoneCampaign.report().selectedCount===4&&__warzoneCommands.report().snapshot.selectedUnits.length===4');
  const selected=await c.evaluate('__warzoneCommands.report().snapshot.selectedUnits');
  assert(selected.every(u=>u.constructor===false),'Constructor selected by ALL COMBAT');
  for(const targetX of [16,14,16]){
    const move=await worldPoint(targetX,50);assert(move.pick?.x===targetX&&move.pick?.y===50,'Movement projection missed native tile');inputPoint(move);
    const average='(__warzoneCommands.report().snapshot.selectedUnits.reduce((a,u)=>a+u.x,0)/4)';
    await until(average+(targetX===16?'>=15':'<=14.5'));
  }
  record('ALL COMBAT selects and moves four combat units, excluding trucks',{before:selected,after:await c.evaluate('__warzoneCommands.report().snapshot.selectedUnits')});
  await build('A0CommandCentre',16,54);
  await build('A0LightFactory',12,48);
  await c.tap('#wt-open-factory');
  await c.tap('button[data-produce-template]');
  await until('__warzoneCommands.report().snapshot.factories.some(f=>f.active)');
  await c.tap('button[data-produce-template]');
  const queued=await until('__warzoneCommands.report().snapshot.factories.find(f=>f.queue?.length>0&&f.progress?.available)');
  record('Native production progress and queued quantity',queued);
  await c.tap('#wt-open-queue');
  await c.tap('[data-production-cancel-factory]:not([data-production-cancel-current])');
  await until('__warzoneCommands.report().snapshot.factories.every(f=>f.queue.length===0)');
  await c.tap('#wt-open-queue');
  await until('__warzoneCommands.report().snapshot.trucks.length===4',50000);
  await until('__warzoneCampaign.report().allCombat&&__warzoneCommands.report().snapshot.selectedUnits.length===4&&__warzoneCommands.report().snapshot.trucks.every(t=>!t.selected)');
  record('Queue cancellation and one actual completed truck',await c.evaluate('({factories:__warzoneCommands.report().snapshot.factories,trucks:__warzoneCommands.report().snapshot.trucks})'));
  }
  for(const id of ['#blocknight-tech','#wt-open-factory','#wt-open-queue','#blocknight-help']){await c.tap(id);await c.tap(id);}
  await c.tap('#wt-campaign-intel');
  await c.wait('__warzoneCampaign.report().nativeState?.intelligenceOpen===true');
  const intelClock=await c.evaluate('__warzoneCampaign.report().nativeState.realTime');
  // A late HTML cleanup must preserve a native screen it does not own.
  await c.evaluate('__warzoneCommands.closeNative();true');
  await c.wait('__warzoneCampaign.report().nativeState.intelligenceOpen&&__warzoneCampaign.report().nativeState.realTime>'+Number(intelClock+800));
  assert(await c.host('getComputedStyle(document.getElementById("lab-ops")).visibility==="hidden"&&document.getElementById("lab-ops").inert'),'HTML footer leaked over native Intelligence');
  c.screen('final-campaign-intelligence');
  await c.tap('#wt-campaign-native-back');await c.wait('__warzoneCampaign.report().nativeState.worldSafe');
  record('Research, Manufacturing, Queue, Help and native Intelligence returns',await c.evaluate('__warzoneCampaign.report()'));
  const radar=await c.evaluate('(()=>{const r=__warzoneCampaign.report().nativeState.radar,f=parent.document.getElementById("warzone-game-frame").getBoundingClientRect();return{...r,hostX:f.x+r.centerX*f.width/r.viewportWidth,hostY:f.y+r.centerY*f.height/r.viewportHeight,w:parent.innerWidth,h:parent.innerHeight}})()');
  assert(radar.visible,'Native radar not visible after Command Centre construction');
  const oldRadar=await c.evaluate('__kalaWarzoneTouch.report().radarDrags');
  const image=q.adb('exec-out','screencap','-p'),sx=image.readUInt32BE(16)/radar.w,sy=image.readUInt32BE(20)/radar.h;
  q.adb('shell','input','swipe',String(Math.round(radar.hostX*sx)),String(Math.round(radar.hostY*sy)),String(Math.round((radar.hostX+10)*sx)),String(Math.round((radar.hostY+10)*sy)),'220');
  await c.wait('__kalaWarzoneTouch.report().radarDrags>'+oldRadar);
  record('Actual mission minimap drag uses native geometry',{radar,touch:await c.evaluate('__kalaWarzoneTouch.report()')});
  const p0=await worldPoint(16,50);
  q.adb('shell','input','swipe','1600','420','1840','520','240');
  await c.wait('__kalaWarzoneTouch.report().panPhase==="idle"');
  const p1=await worldPoint(16,50),touch=await c.evaluate('__kalaWarzoneTouch.report()');
  assert(touch.pans>=1&&Math.hypot(p1.x-p0.x,p1.y-p0.y)>10,'Campaign camera did not move');
  record('Finger pan releases cleanly with native camera movement',{before:p0,after:p1,touch});
  c.screen('final-alpha-gameplay');
  await c.tap('#blocknight-save');await until('WarzoneSavedGames.report().phase==="saved"||WarzoneSavedGames.report().phase==="error"');
  const saved=await c.evaluate('WarzoneSavedGames.report()');assert(saved.phase==='saved',saved.error);record('Campaign phone save',saved);
  const errors=await c.evaluate(String.raw`(errorLog||[]).filter(v=>/error\s*\||Uncaught|Assert in Warzone/.test(v))`);
  assert(!errors.length,'Native runtime errors: '+JSON.stringify(errors));
  q.adb('shell','input','keyevent','4');await q.nativeTap('Cancel');await until('__warzoneCampaign.report().nativeState.worldSafe');
  q.adb('shell','input','keyevent','4');await q.nativeTap('Return');c.close();c=null;
  record('Android Back Cancel and Return',true);
  await q.nativeTap('Open the original campaign');await q.nativeTap('CONTINUE');await q.nativeTap('LOAD');
  c=await connectReady();await restoredWorld(saved);complete(resume);
})().catch(async e=>{try{if(c){c.screen('failure-integrated');fs.writeFileSync(path.join(out,'failure-integrated.json'),JSON.stringify(await c.evaluate('({campaign:window.__warzoneCampaign?.report(),commands:window.__warzoneCommands?.report(),save:window.WarzoneSavedGames?.report(),errors:window.errorLog?.slice(-20)})'),null,2));}}catch(_){}console.error(e);process.exitCode=1;}).finally(()=>c?.close());
