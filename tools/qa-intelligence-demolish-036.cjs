'use strict';
// Observes the exact installed APK. Setup orders use the existing game command
// adapter; world selection/targeting and menu actions use measured Android taps.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const action=process.argv[2]||'demolish',r={version:'0.36',action,identity:j.installedIdentity(),startedUTC:new Date().toISOString(),passed:false};
const file=path.join(l.out,'delivery-'+action+'.json');
async function world(c,p){const v=await c.host('(()=>{const f=document.getElementById("warzone-game-frame").getBoundingClientRect();return {x:f.x,y:f.y,w:innerWidth,h:innerHeight}})()'),png=l.adb('exec-out','screencap','-p');l.adb('shell','input','tap',String(Math.round((v.x+p.x)*png.readUInt32BE(16)/v.w)),String(Math.round((v.y+p.y)*png.readUInt32BE(20)/v.h)));await c.paint();}
const native=c=>c.evaluate('__warzoneCommands.send("state",{},{fresh:true}).then(r=>{if(!r.ok)throw Error(r.reason);return r.result})');
async function field(c){if(!await c.host('(()=>{let e=document.getElementById("wt-demolish"),b=e?.getBoundingClientRect();return !!b&&b.height>0&&e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})()'))await c.tap('#wt-field-toggle');}
async function arm(c){await field(c);await c.tap('#wt-demolish');await c.wait('!!__warzoneCommands.report().demolition');return c.evaluate('WarzoneBuildDisplay.demolitionReport(true)');}
async function selectTruck(c,id){
 const p=await c.evaluate(`(()=>{let t=__warzoneCommands.report().snapshot.trucks.find(t=>t.id===${id}),v=WarzoneTerrain.view(),m=v.matrix,x=(t.x+.5)*128,y=(t.y+.5)*128,z=t.z*128+15,w=m[3]*x+m[7]*z-m[11]*y+m[15];return {x:v.left+((m[0]*x+m[4]*z-m[8]*y+m[12])/w+1)*v.width/2,y:v.top+(1-(m[1]*x+m[5]*z-m[9]*y+m[13])/w)*v.height/2}})()`);
 await world(c,p);await c.wait(`__warzoneCommands.report().snapshot.selectedUnits.length===1&&__warzoneCommands.report().snapshot.selectedUnits[0].id===${id}`);return p;
}
(async()=>{let c;try{
 for(let i=0;i<80&&!c;i++){try{c=await l.connect()}catch{await l.delay(200)}}assert(c,'Game WebView');await c.wait('Boolean(__warzoneCommands.report().snapshot&&(WarzoneBriefing.report().phase==="released"||(WarzoneSavedGames.report().loading&&WarzoneSavedGames.report().ready)))',90000);
 if(action==='prepare'){
  await c.save('ordinary-starting-checkpoint');
  const files=await c.evaluate('(()=>{let f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+"/savegames/skirmish/QuickSave";return Object.fromEntries(f.readdir(p).filter(n=>!n.startsWith(".")).map(n=>[n,Array.from(f.readFile(p+"/"+n))]));})()');
  const target='C:/timerApp/_release-records/036-ordinary-start.json';fs.writeFileSync(target,JSON.stringify({seeded:false,files}));r.fixture=target;
  await c.tap('#blocknight-tech');await c.tap('[data-topic-id="R-Vehicle-Body05"]');await c.tap('.bn-tech-assign');await c.tap('#blocknight-tech');r.labs=await c.evaluate('__blockNightResearch.report().labs');
 }else if(action==='demolish'){
  if(await c.evaluate('!!__warzoneCommands.report().demolition'))await c.tap('#wt-demolish-bar button');
  let s=await native(c);r.initialTrucks=s.trucks;
  r.selectedAt=await selectTruck(c,160001);let g=await arm(c);r.targets=g.targets.map(t=>({id:t.id,name:t.name,eligible:t.eligible,protected:t.protected,visible:t.visible}));
  const hq=g.targets.find(t=>t.protected&&t.hitPoints.length);assert(hq);await world(c,hq.hitPoints[0]);await l.delay(350);
  assert.equal((await native(c)).trucks.find(t=>t.id===160001).order,0);assert(await c.evaluate('!!__warzoneCommands.report().demolition'));r.hqProtected=true;
  const target=g.targets.find(t=>t.itemId==='GuardTower1'&&t.hitPoints.length)||g.targets.find(t=>t.name==='Heavy Machinegun Guard Tower'&&t.hitPoints.length);assert(target);
  await world(c,target.hitPoints[0]);await c.wait('!__warzoneCommands.report().demolition');
  r.orderReply=await c.evaluate('__warzoneCommands.report().history.filter(h=>h.action==="demolish").at(-1)');assert(r.orderReply.ok);assert.deepEqual(r.orderReply.result.workerIds,[160001]);
  s=await native(c);r.nativeAfterOrder=s.trucks;assert(s.trucks.find(t=>t.id===160001).order!==0);assert(s.trucks.filter(t=>t.id!==160001).every(t=>t.order===0));
  r.orderedFrame=l.screen('delivery-demolish-ordered');
  await c.wait(`__warzoneCommands.send('demolish-state',{}, {fresh:true}).then(r=>r.ok&&!r.result.targets.some(t=>t.id===${target.id}))`,45000);r.completedTargetRemoved=target.id;
  r.completedSave=path.basename('delivery-demolish-native.json');const saved=await c.save('delivery-demolish-native');
  assert(!Object.values(saved['struct.json']).some(t=>t.id===target.id));assert(Object.values(saved['struct.json']).some(t=>t.id===hq.id));
  assert(Object.values(saved['droid.json']).filter(t=>t.player===0&&[160003,160005,160007].includes(t.id)).every(t=>t['order/type']===0));
  r.otherGroupPreserved=true;r.completionFrame=l.screen('delivery-demolish-completed');
 }else if(action==='foundation'){
  r.setupDisclosure='Ordinary paid factory construction submitted through the existing command adapter to avoid rebuilding units; no objects, research, power or positions are seeded.';
  r.previews=await c.evaluate('Promise.all([[30,66],[34,66],[30,62],[26,64],[28,68]].map(async([x,y])=>({x,y,r:await __warzoneCommands.send("preview-build",{itemId:"A0LightFactory",x,y,workerIds:[160003],session:"qa036"})})))');r.site=r.previews.find(p=>p.r.ok);assert(r.site,'Validated reachable empty footprint with a living assigned builder');
  const {x,y}=r.site;r.setup=await c.evaluate(`__warzoneCommands.send("queue-build",{itemId:"A0LightFactory",x:${x},y:${y},workerIds:[160003],session:"qa036"})`);assert(r.setup.ok);
  await c.wait(`__warzoneCommands.send("demolish-state",{},{fresh:true}).then(r=>r.ok&&r.result.targets.some(t=>t.itemId==="A0LightFactory"&&t.x===${x}&&t.y===${y}&&t.foundation))`,45000);
  r.selectedAt=await selectTruck(c,160001);let g=await arm(c);let t=g.targets.find(t=>t.itemId==='A0LightFactory'&&t.x===x&&t.y===y);assert(t);assert(t.foundation);assert(!t.eligible);assert.equal(t.statusReason,'construction-busy');assert(t.hitPoints.length);r.busyTarget=t;
  await world(c,t.hitPoints[0]);await l.delay(300);assert(await c.evaluate('!!__warzoneCommands.report().demolition'));r.unselectedBuilderPreserved=(await native(c)).trucks.find(t=>t.id===160003);assert(r.unselectedBuilderPreserved.order!==0);
  r.busyFrame=l.screen('delivery-foundation-other-group-protected');await c.tap('#wt-demolish-bar button');
  await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().selectingTrucks');await c.tap('#wt-open-build');g=await arm(c);t=g.targets.find(v=>v.id===t.id);assert(t.eligible&&t.hitPoints.length);r.selectedWorkers=await c.evaluate('__warzoneCommands.report().demolition.workerIds');assert(r.selectedWorkers.includes(160003));
  await world(c,t.hitPoints[0]);await c.wait('!__warzoneCommands.report().demolition');r.reply=await c.evaluate('__warzoneCommands.report().history.filter(h=>h.action==="demolish").at(-1)');assert(r.reply.ok);assert.equal(r.reply.result.targetId,t.id);
  await c.wait(`__warzoneCommands.send('demolish-state',{},{fresh:true}).then(r=>r.ok&&!r.result.targets.some(t=>t.id===${t.id}))`,30000);r.partialRemoved=true;r.frame=l.screen('delivery-foundation-removed');
 }else if(action==='intelligence'){
  await field(c);await c.tap('#wt-intelligence');await c.wait('__warzoneIntelligence.report().open');
  await c.tap('[data-intel-filter="all"]');await c.tap('[data-intel-topic="R-Wpn-Cannon1Mk1"]');
  await c.wait('__warzoneIntelligence.report().preview?.active');r.before=await c.evaluate('__warzoneIntelligence.report()');
  r.frameA=l.screen('delivery-native-model-a');await l.delay(550);r.after=await c.evaluate('__warzoneIntelligence.report()');r.frameB=l.screen('delivery-native-model-b');
  assert(r.after.preview.frames>r.before.preview.frames);assert(r.after.preview.realTime>r.before.preview.realTime);assert.equal(r.after.preview.rotationPeriodMs,2000);assert(r.after.selected.description.some(t=>t.includes('40mm')));
  r.audioDisclosure='Original native click/category playback requested on a real completed topic; emulator is configured without audible output. No claim of listening.';
  r.layout=await c.host('(()=>{let p=document.getElementById("wt-intelligence-panel"),s=document.getElementById("wt-intelligence-preview"),b=p.getBoundingClientRect(),q=s.getBoundingClientRect();return {panel:b.toJSON(),slot:q.toJSON(),hole:p.classList.contains("has-native-preview"),clip:getComputedStyle(p,"::before").clipPath,viewport:{w:innerWidth,h:innerHeight}}})()');assert(r.layout.hole);assert(r.layout.panel.bottom<r.layout.viewport.h);
  l.adb('shell','input','keyevent','4');await c.wait('!__warzoneIntelligence.report().open&&!__warzoneIntelligence.report().closing');
  r.afterBack=await c.evaluate('__warzoneIntelligence.report()');assert(!r.afterBack.preview.active);r.closedFrame=l.screen('delivery-model-closed');
  for(const selector of ['#blocknight-tech','#wt-open-factory','#blocknight-help']){
   await field(c);await c.tap('#wt-intelligence');await c.wait('__warzoneIntelligence.report().open');await c.tap(selector);await c.wait('!__warzoneIntelligence.report().open&&!__warzoneIntelligence.report().closing');
   r.navigation??=[];r.navigation.push({selector,preview:await c.evaluate('__warzoneIntelligence.report().preview')});
   await c.tap(selector);
  }
 }else if(action==='research'){
  if(await c.evaluate('__warzoneIntelligence.report().open'))await c.evaluate('__warzoneIntelligence.close()');
  await c.tap('#blocknight-tech');await c.tap('[data-topic-id="R-Vehicle-Metals01"]');await c.tap('.bn-tech-assign');await c.tap('#blocknight-tech');r.startedLab=await c.evaluate('__blockNightResearch.report().labs');
  await field(c);await c.tap('#wt-intelligence');await c.wait('__warzoneIntelligence.report().open');
  r.cobra=await c.evaluate('__warzoneIntelligence.report()');assert(r.cobra.history.some(t=>t.id==='R-Vehicle-Body05'&&t.hasMessage));r.cobraFrame=l.screen('delivery-cobra-report');
  await c.wait('WarzoneNotices.report().lastNotice?.description==="Composite Alloys"&&!parent.document.getElementById("wt-game-notice").hidden',120000);
  r.notice=await c.evaluate('WarzoneNotices.report()');r.noticeFrame=l.screen('delivery-research-completed');await c.tap('#wt-game-notice');
  await c.wait('__warzoneIntelligence.report().selectedId==="R-Vehicle-Metals01"&&__warzoneIntelligence.report().preview.active');
  r.report=await c.evaluate('__warzoneIntelligence.report()');assert(r.report.selected.hasMessage);assert.equal(r.report.selected.read,true);assert(r.report.selected.description.length);r.frame=l.screen('delivery-alloys-report');
  await c.tap('#blocknight-save');await c.wait('!WarzoneSavedGames.report().busy');r.save=await c.evaluate('WarzoneSavedGames.report()');assert.equal(r.save.phase,'saved');await c.wait('!__warzoneIntelligence.report().open&&!__warzoneIntelligence.report().closing');
 }else if(action==='load-cancel'){
  await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().selectingTrucks');await c.tap('#wt-open-build');
  let g=await arm(c);const t=g.targets.find(t=>t.eligible&&t.hitPoints.length);assert(t);
  r.before=await c.evaluate('({intent:JSON.parse(LaunchedModule.FS.readFile("/data/mp/multiplay/script/rules/warzone-towers-demolition-intent.json",{encoding:"utf8"})),clock:__warzoneTowersWaves.report().snapshot.gameTime,workers:__warzoneCommands.report().demolition.workerIds})');r.target=t.id;
  await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
  await c.wait(`__warzoneTowersWaves.report().snapshot.gameTime<${r.before.clock}&&!__warzoneCommands.report().demolition`,90000);
  const before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await c.wait(`__warzoneTowersWaves.report().snapshot.gameTime>${before+500}`,15000);
  r.after=await native(c);r.cancelled=true;r.frame=l.screen('delivery-load-targeting-cancelled');
  r.stale=await c.evaluate(`__warzoneCommands.send("demolish",{targetId:${t.id},workerIds:${JSON.stringify(r.before.workers)},intent:${JSON.stringify(r.before.intent.intent)},issuedGameTime:${r.before.clock}})`);assert(!r.stale.ok);assert(['cancelled','game-reloaded'].includes(r.stale.reason));r.historyAfter=await c.evaluate('__warzoneIntelligence.open().then(()=>__warzoneIntelligence.report())');
  assert(r.historyAfter.history.some(t=>t.id==='R-Vehicle-Body05'&&t.hasMessage));await c.evaluate('__warzoneIntelligence.close()');
 }else if(action==='small'){
  await c.wait('WarzoneSavedGames.report().ready');r.restoredSave=await c.evaluate('WarzoneSavedGames.report()');assert(r.restoredSave.loading&&r.restoredSave.ready);
  await field(c);r.fieldFrame=l.screen('delivery-small-field-controls');
  await c.tap('#wt-intelligence');await c.wait('__warzoneIntelligence.report().open');await c.tap('[data-intel-topic="R-Vehicle-Body05"]');await c.wait('__warzoneIntelligence.report().preview.active&&__warzoneIntelligence.report().preview.topicId==="R-Vehicle-Body05"');await l.delay(200);
  r.modelFrame=l.screen('delivery-small-cobra-model');r.report=await c.evaluate('__warzoneIntelligence.report()');
  r.bounds=await c.host('(()=>{let p=document.getElementById("wt-intelligence-panel"),q=document.getElementById("wt-intelligence-preview"),h=document.getElementById("wt-intelligence-list"),b=document.getElementById("wt-intelligence-copy");return{viewport:{w:innerWidth,h:innerHeight},panel:p.getBoundingClientRect().toJSON(),slot:q.getBoundingClientRect().toJSON(),history:{height:h.clientHeight,scroll:h.scrollHeight},copy:{height:b.clientHeight,scroll:b.scrollHeight},overflow:document.documentElement.scrollWidth>innerWidth}})()');assert(!r.bounds.overflow);assert(r.bounds.panel.bottom<=r.bounds.viewport.h);assert(r.bounds.copy.height>30);
  await c.tap('[data-intel-filter="all"]');r.allFrame=l.screen('delivery-small-all-research');
  const area=await c.host('(()=>{let e=document.getElementById("wt-intelligence-list"),b=e.getBoundingClientRect();return {x:b.x+b.width/2,y1:b.bottom-12,y2:b.top+12,w:innerWidth,h:innerHeight}})()'),png=l.adb('exec-out','screencap','-p');l.adb('shell','input','swipe',String(Math.round(area.x*png.readUInt32BE(16)/area.w)),String(Math.round(area.y1*png.readUInt32BE(20)/area.h)),String(Math.round(area.x*png.readUInt32BE(16)/area.w)),String(Math.round(area.y2*png.readUInt32BE(20)/area.h)),'350');await l.delay(350);r.historyScroll=await c.host('document.getElementById("wt-intelligence-list").scrollTop');assert(r.historyScroll>20);r.scrolledFrame=l.screen('delivery-small-history-scrolled');
  await c.tap('#wt-intelligence-search');let keyboard=false;for(let i=0;i<20&&!keyboard;i++){keyboard=/mInputShown=true|mIsInputViewShown=true/.test(l.adb('shell','dumpsys','input_method').toString());if(!keyboard)await l.delay(100)}assert(keyboard,'Native keyboard visibly open before Back');l.adb('shell','input','text','Cobra');await c.wait('__warzoneIntelligence.report().query==="cobra"');l.adb('shell','input','keyevent','4');await l.delay(250);assert(await c.evaluate('__warzoneIntelligence.report().open'));r.keyboardReturnFrame=l.screen('delivery-small-keyboard-return');
  l.adb('shell','input','keyevent','4');await c.wait('!__warzoneIntelligence.report().open&&!__warzoneIntelligence.report().closing');
  await c.tap('#blocknight-save');await c.wait('!WarzoneSavedGames.report().busy');r.savedAgain=await c.evaluate('WarzoneSavedGames.report()');assert.equal(r.savedAgain.phase,'saved');r.afterFrame=l.screen('delivery-small-gameplay-restored');
 }else if(action==='save'){
  await c.tap('#blocknight-save');await c.wait('!WarzoneSavedGames.report().busy');r.save=await c.evaluate('WarzoneSavedGames.report()');assert.equal(r.save.phase,'saved');r.frame=l.screen('delivery-save');
 }else throw Error('Unknown action');
 r.passed=true;
 }catch(error){r.error=String(error.stack||error);try{r.failureFrame=l.screen('failure-'+action)}catch{}throw error}
 finally{if(c)c.close();fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n')}})().catch(e=>{console.error(e);process.exitCode=1});
