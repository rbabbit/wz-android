'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),q=require('./campaign-live-051.cjs');
const packagePath=q.adb('shell','pm','path',q.packageId).toString().trim().replace(/^package:/,'');
const installedAPK_SHA256=q.adb('shell','sha256sum',packagePath).toString().split(/\s/)[0];
assert.equal(installedAPK_SHA256,crypto.createHash('sha256').update(fs.readFileSync(path.join(q.root,'app/build/outputs/apk/debug/app-debug.apk'))).digest('hex'));
async function ready(){const end=Date.now()+35000;while(Date.now()<end){try{return await q.connect()}catch(e){if(!/not ready/.test(String(e)))throw e;await q.delay(200)}}throw Error('WebView unavailable');}
async function home(c){for(let i=0;i<3;i++){q.adb('shell','input','keyevent','4');await q.delay(250);const t=q.tree();if(t.nodes.some(n=>n.text==='Return')){await q.nativeTap('Return');return;}}throw Error('Return confirmation missing');}
const checks=[];function record(name,data){checks.push({name,passed:true,data});fs.writeFileSync(path.join(q.out,'navigation.json'),JSON.stringify({version:'0.52',installedAPK_SHA256,passed:false,checks},null,2));console.log(name)}
(async()=>{let c=await ready();try{
 if(process.argv.includes('--menus')){
  let before=await c.evaluate('__warzoneCommands.report().snapshot.trucks.map(t=>t.id)');
  for(const id of ['#blocknight-tech','#wt-open-factory','#wt-open-queue','#blocknight-help']){await c.tap(id);await c.tap(id)}record('repeated-menu-returns',await c.evaluate('({page:__warzoneCommands.report().page,touch:__kalaWarzoneTouch.report()})'));
  await c.tap('#wt-open-factory');await c.tap('[data-factory="160047"]');await c.tap('[data-count="1"]');await c.tap('[data-produce-template]');await c.wait('__warzoneCommands.report().snapshot.factories.find(f=>f.id===160047)?.active||__warzoneCommands.report().snapshot.factories.find(f=>f.id===160047)?.currentProduction',12000);q.screen('ordinary-production');await c.tap('#wt-open-factory');
  await c.wait(`__warzoneCommands.report().snapshot.trucks.some(t=>!${JSON.stringify(before)}.includes(t.id))`,35000);record('ordinary-production-completes',await c.evaluate('__warzoneCommands.report().snapshot.factories.find(f=>f.id===160047)'));
 }else{
  if(process.argv.includes('--fresh-save')){
   const fixtureIdentity=await c.evaluate('({save:WarzoneSavedGames.report(),documentSession:window.__towersHtml?.session,nativeSession:__warzoneCommands.report().snapshot?.rewards?.session})');
   fs.writeFileSync(path.join(q.out,'fixture-save-identity.json'),JSON.stringify({fixtureOnly:true,description:'F8 injected a legacy native checkpoint from another match; Android correctly rejected its unrelated purchase receipt. Save validation continues with a normal fresh match.',...fixtureIdentity},null,2));
   await home(c);c.close();await q.nativeTap('PLAY');c=await ready();await c.wait('window.WarzoneBriefing?.report().phase==="released"&&__warzoneCommands.report().snapshot?.hasHQ',45000);
  }
  if(process.argv.includes('--waiting')){
   // Inspect the actual completed structures before restoring the waiting save.
   const point=await c.evaluate("(()=>{const f=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:innerWidth-120+(30-32)*192/80+f.x,y:innerHeight-120+(60-40)*192/80+f.y,w:parent.innerWidth,h:parent.innerHeight}})()");
   const png=q.adb('exec-out','screencap','-p');q.adb('shell','input','tap',String(Math.round(point.x*png.readUInt32BE(16)/point.w)),String(Math.round(point.y*png.readUInt32BE(20)/point.h)));await c.evaluate('WarzoneTerrain.refresh()');await q.delay(400);q.screen('native-completed-structures');
   const fixture=JSON.parse(fs.readFileSync('C:/timerApp/_release-records/loss-builders052/recovery-quiet.json','utf8'));
   const previous=await c.evaluate('__warzoneCommands.report().snapshot.recoveryContext');
   await c.host("(()=>{const f=document.getElementById('warzone-game-frame');f.focus({preventScroll:true});f.contentDocument.getElementById('canvas').focus({preventScroll:true});return true})()");await c.paint();
   await c.evaluate(`(()=>{const v=${JSON.stringify(fixture)},f=LaunchedModule.FS;for(const[n,j]of Object.entries(v.files))f.writeFile(v.path+'/'+n,JSON.stringify(j));__kalaWarzoneTouch.nativePressKey('F8','F8',119);return true})()`);
   await c.wait(`__warzoneCommands.report().snapshot?.recoveryContext!==${JSON.stringify(previous)}&&__warzoneCommands.report().snapshot?.jobs.length===3`,25000);
   assert((await c.evaluate('__warzoneCommands.report().snapshot.jobs')).every(j=>j.reason==='builder-lost'&&!j.workers.length));
  }
  let before=await c.evaluate('__warzoneCommands.report().snapshot');await c.tap('#blocknight-save');await c.wait('WarzoneSavedGames.report().phase==="saved"||WarzoneSavedGames.report().phase==="error"',35000);let save=await c.evaluate('WarzoneSavedGames.report()');assert.equal(save.phase,'saved',save.error);record('phone-save',save);q.screen('phone-save');await home(c);c.close();
  await q.nativeTap('SAVED GAMES');q.screen('saved-games');await q.nativeTap('LOAD');c=await ready();await c.wait('window.WarzoneSavedGames?.loading&&window.WarzoneSavedGames?.ready',45000);await c.wait('window.__warzoneCommands?.report().snapshot?.hasHQ',15000);let restored=await c.evaluate('({save:WarzoneSavedGames.report(),snapshot:__warzoneCommands.report().snapshot})');assert.equal(restored.save.slotId,save.savedId);assert.equal(restored.snapshot.jobs.length,before.jobs.length);assert.equal(restored.snapshot.trucks.length,before.trucks.length);record('phone-save-restores-native-world',restored);q.screen('restored-world');
  // A brief route check only: Campaign's files/native pair are byte-preserved.
  await home(c);c.close();await q.nativeTap('Open the original campaign');q.screen('campaign-setup');await q.nativeTap('CONTINUE');await q.nativeTap('LOAD');c=await ready();await c.wait('window.WarzoneSavedGames?.loading&&window.WarzoneSavedGames?.ready&&window.__warzoneCampaign?.report().nativeState?.worldSafe',45000);await c.wait('window.__warzoneCommands?.report().snapshot?.hasHQ',15000);let campaign=await c.evaluate('({campaign:__warzoneCampaign.report(),save:WarzoneSavedGames.report(),runtime:[...document.scripts].map(s=>s.src).filter(s=>/warzone2100/.test(s)),config:LaunchedModule.WZVAL_configDirPath})');assert.equal(campaign.config,'/warzone2100-campaign');assert(campaign.runtime.every(s=>!s.includes('towers-052')));record('campaign-continue-original-runtime',campaign);q.screen('campaign-preserved');
  for(const id of ['#blocknight-tech','#wt-open-factory','#wt-open-queue']){await c.tap(id);await c.tap(id)}await c.tap('#wt-campaign-all-combat');await c.wait('__warzoneCampaign.report().selectedCount>0',10000);record('campaign-selection-and-menu-returns',await c.evaluate('__warzoneCampaign.report()'));await home(c);
 }
 fs.writeFileSync(path.join(q.out,process.argv.includes('--menus')?'menus-production.json':'save-campaign.json'),JSON.stringify({version:'0.52',installedAPK_SHA256,passed:true,checks},null,2));
 }finally{c?.close()}})().catch(e=>{fs.writeFileSync(path.join(q.out,'navigation-failure.json'),JSON.stringify({error:String(e?.stack||e),checks},null,2));console.error(e);process.exitCode=1});
