'use strict';
// Real Android button/radar touches on ordinary fresh maps. CDP observes native
// replies and renderer state; no units, resources, research or world data seeded.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const live=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const {controls}=require('./audit-smooth-building.cjs');
const {out,screen,delay,adb}=live;
const fixtures={
 td1:{name:'dustfall',target:[8,72],ids:[160001,160003],count:4,site:[8,71],alternate:[27,21],alternateIds:[160005]},
 td2:{name:'iron-valley',target:[10,38],ids:[160003,160005,160011],count:6,site:[9,42],alternate:[58,8],alternateIds:[160001,160007,160009]}
};
const sorted=values=>Array.from(values).sort((a,b)=>a-b);
const readExpression=`(()=>{const r=__warzoneCommands.report(),t=__kalaWarzoneTouch.report(),f=parent.document.getElementById('warzone-game-frame'),b=parent.document.getElementById('wt-build-busy'),cv=document.getElementById('canvas');return{ms:performance.now(),clock:__warzoneTowersWaves.report().snapshot.gameTime,frames:t.nativeRenderFrames,selected:r.snapshot?.selectedUnits||[],trucks:r.snapshot?.trucks||[],group:r.nativeBuildGroup,placement:r.placement,buildOpen:r.buildOpen,selecting:r.selectingTrucks,exiting:r.exitingBuild,acks:r.acks,writes:r.writes,covered:Boolean(b&&!b.hidden),viewport:[parent.innerWidth,parent.innerHeight,innerWidth,innerHeight],frame:[f.clientWidth,f.clientHeight],canvas:[cv.width,cv.height],zoom:[t.zoomWheelEvents,t.zoomCommandWrites],terrain:r.terrain,ended:window.__towersHtml?.isEnded?.()||false}})()`;
async function observe(c){return c.evaluate(readExpression);}
async function monitor(c){
 await c.evaluate(`if(window.__selectionJourney)clearInterval(__selectionJourney.timer);window.__selectionJourney={samples:[],clicks:[]};__selectionJourney.read=()=>${readExpression};__selectionJourney.timer=setInterval(()=>__selectionJourney.samples.push(__selectionJourney.read()),80);if(!window.__selectionJourneyClickInstalled){window.__selectionJourneyClickInstalled=true;parent.document.addEventListener('click',e=>{const b=e.target.closest?.('[data-build],#wt-select-trucks');if(e.isTrusted&&b&&window.__selectionJourney)__selectionJourney.clicks.push({id:b.dataset.build||b.id,at:performance.now(),state:__selectionJourney.read()});});}true`);
}
async function stopMonitor(c){return c.evaluate('(()=>{const r=window.__selectionJourney;if(!r)return null;clearInterval(r.timer);return{samples:r.samples,clicks:r.clicks};})()');}
async function fresh(c){const reply=await c.evaluate('__warzoneCommands.send("state")');assert.equal(reply.ok,true,'fresh native state reply');return reply.result;}
async function waitSelection(c,expected){
 await c.wait('!__warzoneCommands.report().selectingTrucks&&!__warzoneCommands.report().exitingBuild',10000);
 const snapshot=await fresh(c),r=await observe(c);
 const selected=sorted(snapshot.selectedUnits.map(u=>u.id)),group=sorted(r.group);
 assert.deepEqual(group,selected,'logical build group must equal the actual native selected-unit IDs');
 assert.ok(snapshot.selectedUnits.every(u=>u.constructor),'selection contains only genuine construction trucks');
 assert.ok(snapshot.trucks.filter(t=>group.includes(t.id)).every(t=>t.selected),'native trucks carry their real selected flags/highlights');
 if(expected)assert.deepEqual(selected,sorted(expected),'the prepared visible platform group is selected');
 return r;
}
async function chooseFirst(c){
 // No state/terrain/native-picker wait between BUILD and its first item tap.
 await c.tap('#wt-open-build');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');
 assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1','the first trusted item tap is accepted immediately');
}
async function revealField(c){
 const visible=`(()=>{const e=parent.document.getElementById('wt-select-trucks'),s=e&&parent.getComputedStyle(e);return Boolean(e&&!e.closest('[inert]')&&s.visibility==='visible'&&s.display!=='none'&&e.getBoundingClientRect().height>0)})()`;
 if(!await c.evaluate(visible))await c.tap('#wt-field-toggle');
 await c.wait(visible,5000);
}
async function closeBuild(c){
 if(await c.evaluate('__warzoneCommands.report().buildOpen'))await c.tap('#wt-build-sidebar [data-action="select-mode"]');
 await c.wait('!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().exitingBuild',10000);
}
async function cameraFixture(c,target,ids){
 const a=await controls(c);await a.camera(...target);
 assert.equal(await c.evaluate('WarzoneTerrain.refresh()'),true,'native camera has rendered the requested map view');
 const data=await c.evaluate(`(()=>{const s=__warzoneCommands.report().snapshot;return{centre:WarzoneTerrain.pick(innerWidth/2,innerHeight/2),trucks:s.trucks.filter(t=>${JSON.stringify(ids)}.includes(t.id)).map(t=>{const x=(t.x+.5)*128,y=(t.y+.5)*128,z=WarzoneTerrain.heightAt(x,y),p=WarzoneTerrain.project(x,y,z+32);return{...t,point:p,field:Boolean(p&&__kalaWarzoneTouch.isBattlefieldPoint(p.x,p.y)),viewport:[innerWidth,innerHeight]}})}})()`);
 assert.ok(data.centre&&Math.hypot(data.centre.x-target[0],data.centre.y-target[1])<8,'observed native camera reaches the requested platform');
 assert.equal(data.trucks.length,ids.length,'ordinary authored trucks exist before selection');
 assert.ok(data.trucks.every(t=>t.point&&t.field&&t.point.x>=4&&t.point.x<t.viewport[0]-4&&t.point.y>=4&&t.point.y<t.viewport[1]-24),'fixture truck bodies fit above the native footer');
 return data;
}
function unchangedOrders(before,after){
 const orders=rows=>rows.trucks.map(t=>[t.id,t.order,t.x,t.y]).sort((a,b)=>a[0]-b[0]);
 assert.deepEqual(orders(after),orders(before),'selecting trucks must not issue movement/build orders or change their native positions');
}
async function truckButton(c,ids){
 await revealField(c);const before=await observe(c);await c.tap('#wt-select-trucks');
 // Require native replies after the trusted action, even when IDs already match.
 await c.wait(`__warzoneCommands.report().acks>${before.acks+1}&&!__warzoneCommands.report().selectingTrucks&&!__warzoneCommands.report().exitingBuild`,10000);
 return waitSelection(c,ids);
}
async function mapJourney(map,report,options={}){
 const f=fixtures[map];assert.ok(f,'supported map');let c;
 const r={map,name:f.name,passed:false,seeded:false,reusedPreparedState:Boolean(options.reuse),phase:'startup',checks:[]};report.maps.push(r);
 try{
  c=options.reuse?await journey.connectReady():await journey.start(map);await journey.resume(c);
  r.identity=journey.installedIdentity(options.apk);r.initial=await observe(c);
  assert.equal(r.initial.trucks.length,f.count,'fresh authored starting truck count; no prepared/seeded army');
  const png=adb('exec-out','screencap','-p');r.viewport={pixels:[png.readUInt32BE(16),png.readUInt32BE(20)],css:r.initial.viewport};
  assert.ok(r.viewport.pixels[0]>r.viewport.pixels[1],'actual emulator viewport is landscape');
  await monitor(c);
  r.phase='cold-selection';await chooseFirst(c);r.cold=await waitSelection(c);screen(f.name+'-01-cold-selected');
  await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');r.coldRepeat=await waitSelection(c);
  assert.deepEqual(sorted(r.coldRepeat.group),sorted(r.cold.group),'first and repeated building choices use the same real worker group');
  r.checks.push('cold BUILD plus immediate item, repeated choice, native selected IDs and highlights');
  await closeBuild(c);
  if(map==='td1'){
    const native=await c.save('dustfall-starting-camera-native');
    const hq=Object.values(native['struct.json']).find(s=>s.name==='A0CommandCentre'&&s.player===0);
    assert.ok(hq,'authored human Command Centre exists');
    r.startingCamera=await c.evaluate(`({point:WarzoneTerrain.project(${hq.position[0]},${hq.position[1]},${hq.position[2]}),width:innerWidth,height:innerHeight})`);
    r.startingCamera.rotation=native['gam.json'].viewDataR;r.startingCamera.position=native['gam.json'].viewDataP;
    assert.equal(r.startingCamera.rotation.y,0,'native camera actually faces north');
    const p=r.startingCamera.point;
    assert.ok(p&&p.y>r.startingCamera.height*.7&&p.y<r.startingCamera.height-8,'Command Centre base is visible toward the footer');
    screen('dustfall-starting-view-footer');
  }
  r.phase='known-camera-fixture';r.fixture=await cameraFixture(c,f.target,f.ids);
  const preview=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${f.site[0]},y:${f.site[1]},workerIds:${JSON.stringify(f.ids)}})`);
  assert.equal(preview.ok,true,'prepared platform site has a legal footprint reachable by the authored group');r.fixture.preview=preview;
  r.phase='known-selection';const before=await observe(c);await chooseFirst(c);r.known=await waitSelection(c,f.ids);unchangedOrders(before,r.known);
  await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');r.knownRepeat=await waitSelection(c,f.ids);unchangedOrders(before,r.knownRepeat);screen(f.name+'-02-known-platform-highlights');
  await closeBuild(c);r.phase='alternate-camera-fixture';r.alternateFixture=await cameraFixture(c,f.alternate,f.alternateIds);
  r.phase='trucks-change-group';const alternateBefore=await observe(c);r.trucksChanged=await truckButton(c,f.alternateIds);unchangedOrders(alternateBefore,r.trucksChanged);screen(f.name+'-03-trucks-changed-group');
  r.trucksRepeated=[];
  for(let i=0;i<2;i++){r.phase='trucks-repeat-'+(i+1);r.trucksRepeated.push(await truckButton(c,f.alternateIds));unchangedOrders(alternateBefore,r.trucksRepeated.at(-1));}
  r.checks.push('TRUCKS replaces distant selection; repeated compact-field reopening; native orders/positions unchanged');
  r.phase='monitor-check';r.monitor=await stopMonitor(c);const samples=r.monitor.samples;
  assert.ok(samples.length>3,'renderer observations cover the actual interaction journey');
  assert.ok(samples.every(s=>!s.covered),'no captured battlefield/input cover is shown during BUILD or TRUCKS');
  assert.ok(samples.every(s=>!s.ended),'selection never leaves the active game');
  const first=samples[0],last=samples.at(-1);assert.ok(last.frames>first.frames&&last.clock>first.clock,'actual native rendering and simulation advance throughout the live journey');
  assert.ok(samples.every(s=>s.frame.join()===first.frame.join()&&s.canvas.join()===first.canvas.join()),'selection never changes the native viewport or canvas size');
  assert.ok(samples.every(s=>s.zoom.join()===first.zoom.join()),'selection sends no zoom commands');
  assert.deepEqual(c.errors,[],'no uncaught WebView runtime exceptions');r.checks.push('live native frames/clock, stable viewport/zoom, no field cover or runtime exceptions');r.passed=true;
 }catch(error){r.failure=String(error.stack||error);r.failureKind=/startup|fixture/.test(r.phase)?'fixture-readiness':'product-check';try{screen(f.name+'-failure');r.failureState=await observe(c);}catch{}throw error;
 }finally{
  if(c){try{if(!r.monitor)r.monitor=await stopMonitor(c);if(!await c.evaluate('window.__towersHtml?.isEnded?.()||false'))r.pausedAt=await journey.pause(c);}catch(error){r.recoveryFailure=String(error.stack||error);}c.close();}
  r.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'selection-journey.json'),JSON.stringify(report,null,2));
 }
 return r;
}
async function run(options={}){
 const report={passed:false,seeded:false,started:new Date().toISOString(),maps:[],scope:'fresh maps; real BUILD/TRUCKS/radar touches; read-only previews; no construction, movement or production orders issued'};
 report.identity=journey.installedIdentity(options.apk);
 try{for(const map of options.maps||['td1','td2']){console.log('START selection '+map);await mapJourney(map,report,options);console.log('PASS selection '+map);}report.afterIdentity=journey.installedIdentity(options.apk);assert.equal(report.afterIdentity.candidateAPK_SHA256,report.identity.candidateAPK_SHA256);report.passed=true;return report;
 }finally{report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'selection-journey.json'),JSON.stringify(report,null,2));}
}
module.exports={run,mapJourney,observe,monitor,stopMonitor,fresh,waitSelection,chooseFirst,revealField,closeBuild,cameraFixture,truckButton};
if(require.main===module){const args=process.argv.slice(2),map=args.indexOf('--map'),apk=args.indexOf('--apk');run({maps:map>=0?[args[map+1]]:undefined,apk:apk>=0?args[apk+1]:process.env.WZ_QA_APK,reuse:args.includes('--reuse')}).then(r=>console.log(JSON.stringify({passed:r.passed,maps:r.maps.map(m=>({map:m.map,checks:m.checks}))}))).catch(error=>{console.error(error);process.exitCode=1;});}
