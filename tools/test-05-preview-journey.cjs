'use strict';
// Actual Android input and ordinary authored units only. CDP observes native
// replies/geometry; preview-build is read-only. No script-sent queue-build,
// granted units/research/power or injected native save fields.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-05/preview-journey');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs'),m=require('./test-04-module-journey.cjs');
const {controls}=require('./audit-smooth-building.cjs'),selection=require('./test-02-selection-journey.cjs');
const {adb,screen,out,device}=live,json=JSON.stringify,asyncExec=promisify(execFile);
const catalogue=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/warzone/command-catalog.json'),'utf8'));
const sites=[{itemId:'A0ResearchFacility',x:23,y:18},{itemId:'A0PowerGenerator',x:32,y:18},{itemId:'A0CyborgFactory',x:32,y:21},{itemId:'GuardTower1',x:34,y:18}];
const authoredWorkerIds=[160005],preparedWorkerIds=[160005,160143],moduleId='A0ResearchModule1';
const rows=data=>Object.values(data||{}).filter(x=>x&&typeof x==='object'&&Number.isFinite(x.id));
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
class FixtureError extends Error{constructor(message){super(message);this.name='FixtureError';}}
const fixture=(ok,message)=>{if(!ok)throw new FixtureError(message);};
const centre=(site,item)=>[(site.x+(item.width%2?.5:0))*128,(site.y+(item.breadth%2?.5:0))*128];

async function start(){
 adb('shell','am','force-stop',live.packageId);adb('shell','am','start','-n',live.packageId+'/com.rbabbit.blocknight.warzone.MainActivity','--es','map','td1');
 await live.nativeTap('Start game, Dustfall');
 let c,last;const end=Date.now()+15000;
 while(Date.now()<end){try{c=await live.connect();break;}catch(error){last=error;if(!/not ready|ECONNREFUSED|fetch failed/i.test(String(error)))throw error;await live.delay(150);}}
 if(!c)throw last||new FixtureError('Fresh Dustfall WebView did not register');
 try{
  // Only startup receives the larger transport budget. Ordinary observations,
  // actions and all later CDP requests retain native-live's 20-second bound.
  await c.wait('(()=>{if(window.__blockNightLastWindowError)throw Error(window.__blockNightLastWindowError.detail||window.__blockNightLastWindowError.event);return Boolean(window.__warzoneCommands?.report().snapshot&&window.__blockNightResearch&&window.__kalaWarzoneTouch?.report().hudVisible&&!window.__kalaWarzoneTouch.report().cameraFacingPending&&window.WarzoneBuildDisplay?.report().models===165)})()',90000,{timeoutMs:90000});
  return c;
 }catch(error){c.close();throw error;}
}
async function preparedSave(c,report){
 const proof={source:'Existing app-private QuickSave from the prior real completed factory2/2 checkpoint; genuine native F8 after APK update. No save-file injection. Truck count and any produced unit are verified from the actual saved files.'};report.preparedSave=proof;
 proof.saved=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',read=n=>JSON.parse(f.readFile(p+'/'+n,{encoding:'utf8'})),gam=read('gam.json'),structures=Object.values(read('struct.json')),droids=Object.values(read('droid.json')),globals=read('scriptstate.json').globals_0;return{path:p,gam,factory:structures.find(x=>x.id===160121),producedTruck:droids.find(x=>x.id===160143),truckIds:droids.filter(x=>x.player===0&&x.droidType===3).map(x=>x.id).sort((a,b)=>a-b),finishedUnits:globals.wtcmd_finishedUnits||[],pendingJobs:(globals.wtcmd_jobs||[]).filter(x=>!['done','cancelled','interrupted'].includes(x.status)),mtime:f.stat(p+'/gam.json').mtime.getTime()};})()`);
 const saved=proof.saved;fixture(saved.gam.levelName==='td1_v3-T1'&&Number.isFinite(saved.gam.gameTime)&&saved.gam.gameTime>0,'prepared native save must be authored Dustfall with valid simulation time');
 fixture(saved.factory?.name==='A0LightFactory'&&saved.factory.modules===2&&saved.factory.currentBuildPts===500,'prepared native factory must be genuinely completed at2/2');
 proof.includesProducedTruck=Boolean(saved.producedTruck);
 if(proof.includesProducedTruck){
  fixture(saved.producedTruck.parts?.construct==='Spade1Mk1'&&saved.producedTruck.parts.body==='Body1REC'&&saved.producedTruck.name.endsWith('F160121'),'optional saved Truck160143 must be a real factory-produced Truck Viper');
  assert.deepEqual(saved.truckIds,[160001,160003,160005,160007,160143],'exact five genuine saved construction trucks');fixture(saved.finishedUnits.some(x=>x.id===160143&&x.factoryId===160121),'optional produced saved truck retains its genuine producing-factory completion record');
 }else assert.deepEqual(saved.truckIds,[160001,160003,160005,160007],'completed factory checkpoint retains the four original saved construction trucks');
 fixture(saved.pendingJobs.length===0,'prepared save must not contain pending construction');
 proof.beforeLoad={clock:await clock(c),snapshot:await m.fresh(c)};
 // The load gets the same bounded transport/readiness allowance as the
 // established native-load helper. No Escape or speculative Resume is sent.
 const loadingClient={...c,evaluate:(expression,options={})=>c.evaluate(expression,{...options,timeoutMs:90000})};
 await loadingClient.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
 await c.wait(`__warzoneTowersWaves.report().snapshot.gameTime>=${saved.gam.gameTime-500}&&__warzoneTowersWaves.report().snapshot.gameTime<${saved.gam.gameTime+25000}`,90000,{timeoutMs:90000});
 try{proof.readiness=await require('./observe-native-load.cjs').observe(loadingClient,{label:'preview05-prepared-native-load',timeout:90000});}catch(error){proof.readinessFailure=error.nativeLoadProof||String(error);throw error;}
 const restored=await m.fresh(c);fixture(restored.mapWidth===63&&restored.mapHeight===79,'native F8 restored the correct Dustfall map');assert.deepEqual(restored.trucks.map(x=>x.id).sort((a,b)=>a-b),saved.truckIds,'native F8 restored the exact real saved truck IDs');
 fixture(restored.factories.some(x=>x.id===160121&&x.modules===2&&x.ready),'native F8 restored completed factory2/2');if(proof.includesProducedTruck)fixture(restored.finishedUnits.some(x=>x.id===160143&&x.factoryId===160121),'native F8 restored the optional real PRODUCE1 completion');fixture(restored.jobs.length===0&&!restored.constructionSites.some(x=>!['done','cancelled','interrupted'].includes(x.status)),'restored fixture has no pending construction');
 proof.restored=restored;proof.screen=await m.shot(c,'preview05-prepared-native-save-loaded');return restored;
}
async function display(c,label){
 const d=await c.evaluate('WarzoneBuildDisplay.report()'),terrain=await c.evaluate('WarzoneTerrain.report()');assert.equal(d.error,'',label+': no internally caught renderer errors');assert.equal(terrain.error,'',label+': native terrain observation remains readable');return {...d,terrain};
}
async function projectTile(c,x,y){
 fixture(await c.evaluate('WarzoneTerrain.refresh()'),'fresh native camera before a real terrain touch');
 let point;
 try{point=await c.evaluate(`(()=>{const wx=(${x}+.5)*128,wy=(${y}+.5)*128;let z=WarzoneTerrain.heightAt(wx,wy);if(!Number.isFinite(z))throw Error('Fixture tile has no observed native height');for(let i=0;i<30;i++){const p=WarzoneTerrain.project(wx,wy,z),q=p&&WarzoneTerrain.pick(p.x,p.y);if(!q)throw Error('Fixture tile is not visibly pickable');if(Math.hypot(q.worldX-wx,q.worldY-wy)<2)return {...p,pick:q};z=(z+q.height)/2;}throw Error('Fixture projection did not converge')})()`);}catch(error){throw new FixtureError('Cannot project a real visible fixture tile '+x+','+y+': '+json(error));}
 await assertWorldPoint(c,point,{x,y});return point;
}
async function assertWorldPoint(c,point,site){
 const hit=await c.evaluate(`(()=>{const x=${point.x},y=${point.y},f=parent.document.getElementById('warzone-game-frame'),b=f.getBoundingClientRect(),cv=document.getElementById('canvas'),r=cv.getBoundingClientRect(),hostAt=parent.document.elementFromPoint(x+b.left,y+b.top),childAt=document.elementFromPoint(x,y);return{field:__kalaWarzoneTouch.isBattlefieldPoint(x,y),hostCanvas:hostAt===f,childCanvas:childAt===cv,aboveFooter:y<r.bottom-24,inside:x>=r.left+2&&x<r.right-2&&y>=r.top+2&&y<r.bottom-24,pick:WarzoneTerrain.pick(x,y),point:{x,y},hostAt:hostAt?.id,childAt:childAt?.id}})()`);
 fixture(hit.field&&hit.hostCanvas&&hit.childCanvas&&hit.aboveFooter&&hit.inside,'Refusing world touch outside the unobstructed actual battlefield: '+json(hit));
 if(site)fixture(hit.pick?.x===site.x&&hit.pick?.y===site.y,'Fresh terrain pick does not match the intended fixture tile: '+json({site,hit}));
 return hit;
}
async function safeTile(c,ctl,site,report){
 try{return await projectTile(c,site.x,site.y);}catch(error){
  // This known right-hand tile can project onto Dustfall's rectangular radar.
  // Reposition once, before any world input, rather than touching the radar by
  // accident or retrying a stale projection.
  if(site.x!==34||site.y!==18)throw error;
  const before=await m.fresh(c),placement=await c.evaluate('__warzoneCommands.report().placement');
  const recovery={site,reason:String(error.message||error),beforeSelected:before.selectedUnits.map(x=>x.id),camera:[32,18]};
  await ctl.camera(...recovery.camera);assert.equal(await c.evaluate('__warzoneCommands.report().placement'),placement,'fixture camera move preserves active structure');
  const after=await m.fresh(c);recovery.afterSelected=after.selectedUnits.map(x=>x.id);assert.deepEqual(recovery.afterSelected.slice().sort((a,b)=>a-b),recovery.beforeSelected.slice().sort((a,b)=>a-b),'fixture camera move preserves actual selected workers');
  const point=await projectTile(c,site.x,site.y);recovery.point=point;(report.cameraRecovery??=[]).push(recovery);return point;
 }
}
async function heldPreview(c,point,site){
 await assertWorldPoint(c,point,site);
 const scaled=await c.evaluate(`(()=>{const f=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:${point.x}+f.x,y:${point.y}+f.y,width:parent.innerWidth,height:parent.innerHeight}})()`),png=adb('exec-out','screencap','-p');
 const x=Math.round(scaled.x*png.readUInt32BE(16)/scaled.width),y=Math.round(scaled.y*png.readUInt32BE(20)/scaled.height);
 live.assertLabForeground();
 // An asynchronous real stationary ADB swipe holds the finger while CDP reads
 // the preview. This is not a synthetic DOM pointer or a JS placement call.
 let holdingEnded=false,holdingError,captured;
 const holding=asyncExec(require('./android-sdk.cjs').adb,['-s',device,'shell','input','swipe',String(x),String(y),String(x),String(y),'4500'],{timeout:9000,maxBuffer:1024*1024}).then(()=>{holdingEnded=true;},error=>{holdingEnded=true;holdingError=error;});
 let held;
 try{
  await c.wait(`(()=>{const d=WarzoneBuildDisplay.report();if(d.error)throw Error(d.error);return d.preview===${json(site.itemId)}&&d.drawn.some(x=>x.id==='preview'&&x.itemId===${json(site.itemId)}&&x.model&&x.triangles>0);})()`,2600);
  const d=await display(c,'held ordinary preview'),paint=d.drawn.find(x=>x.id==='preview');
  fixture(!holdingEnded&&d.preview===site.itemId,'Held-preview observation arrived after physical release; reject this capture');
  assert.equal(paint.validation,'pending');assert.equal(paint.colour,'#bac7cc','pre-submit preview is neutral until an actual native decision');
  captured=screen('preview05-01-research-held-neutral');
  const after=await c.evaluate('WarzoneBuildDisplay.report()');
  fixture(!holdingEnded&&after.preview===site.itemId,'Held-preview PNG was captured after physical release; reject this capture');
  fixture(after.drawn.some(x=>x.id==='preview'&&x.itemId===site.itemId&&x.validation==='pending'&&x.colour==='#bac7cc'),'Held-preview PNG lacks the current neutral ordinary preview');
  held={point,androidPoint:{x,y},physicalHoldMs:4500,holdingEndedBeforePNG:false,holdingEndedAfterPNG:false,display:d,afterDisplay:after,screen:captured};
 }catch(error){
  if(captured){const rejected=path.join(out,'fixture-rejected-'+path.basename(captured));fs.renameSync(captured,rejected);error.message+='; rejected capture preserved at '+rejected;}
  throw error;
 }finally{await holding;if(holdingError)throw holdingError;}
 return held;
}
async function acceptedReply(c,site,workerIds=authoredWorkerIds){
 await c.wait(`__warzoneCommands.report().history.some(x=>x.action==='queue-build'&&x.result?.itemId===${json(site.itemId)}&&x.result.x===${site.x}&&x.result.y===${site.y})`,12000);
 const reply=await c.evaluate(`__warzoneCommands.report().history.filter(x=>x.action==='queue-build'&&x.result?.itemId===${json(site.itemId)}&&x.result.x===${site.x}&&x.result.y===${site.y}).at(-1)`);
 assert.equal(reply.ok,true,'real touch queued '+json(site));assert.deepEqual(reply.result.workers,workerIds,'actual accepted worker group');return reply;
}
async function acceptedPaint(c,site,reply,label){
 await c.wait(`(()=>{const d=WarzoneBuildDisplay.report();if(d.error)throw Error(d.error);return d.drawn.some(x=>x.id===${json(reply.result.id)}&&x.itemId===${json(site.itemId)}&&x.model&&x.triangles>0&&Number.isFinite(x.number));})()`,12000);
 const d=await display(c,label),paint=d.drawn.find(x=>x.id===reply.result.id),item=catalogue.buildings.find(x=>x.id===site.itemId),[x,y]=centre(site,item);
 const projection=await c.evaluate(`WarzoneTerrain.project(${x},${y},${paint.height})`);
 assert.ok(projection&&Math.hypot(projection.x-paint.screenX,projection.y-paint.screenY)<1,'custom mesh centre follows final native footprint parity');
 assert.equal(paint.validation,'accepted');return {site,reply,paint,expectedWorldCentre:[x,y],projection,display:d,screen:await m.shot(c,label)};
}
async function waitJobs(c,ids,deadline,label){
 const remaining=deadline-Date.now();assert.ok(remaining>0,label+': shared construction deadline not exhausted');
 await c.wait(`(()=>{if(__towersHtml.isEnded())throw Error('Battle ended during ${label}');const s=__warzoneCommands.report().snapshot;if(s?.hasHQ===false)throw Error('HQ lost during ${label}');if(s?.jobs.some(x=>${json(ids)}.includes(x.id)&&x.status==='blocked'))throw Error('Actual native job blocked during ${label}');const d=WarzoneBuildDisplay.report();if(d.error)throw Error('Caught renderer error during ${label}: '+d.error);return ${json(ids)}.every(id=>(s?.finishedBuilds||[]).some(x=>x.id===id));})()`,remaining);
 return m.fresh(c);
}
async function returns(c,labId,workerIds=authoredWorkerIds){
 const rounds=[];
 for(let round=1;round<=2;round++){
  await j.closeOverlays(c);await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');
  const help=await m.shot(c,'preview05-return-'+round+'-help');await c.tap('.wt-help-back');
  await j.openPage(c,'queue');const queue=await m.shot(c,'preview05-return-'+round+'-queue');adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page&&!parent.document.getElementById("warzone-game-frame").inert');
  await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().labs.some(x=>x.id==='+labId+')');
  const research=await m.shot(c,'preview05-return-'+round+'-research');adb('shell','input','keyevent','4');await c.wait('!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose&&!parent.document.getElementById("warzone-game-frame").inert');
  const advancing=await j.waitAdvancingClock(c,await clock(c),10000);await m.item(c,'GuardTower1','DEFENCES');assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1');await selection.waitSelection(c,workerIds);await m.exitBuild(c);
  const d=await display(c,'menu return '+round);assert.equal(d.preview,'');rounds.push({round,help,queue,research,advancing,display:d,screen:await m.shot(c,'preview05-return-'+round+'-restored-input')});
 }
 return rounds;
}
function verifyCompleted(save,accepted,labId){
 const native=rows(save['struct.json']);
 return accepted.map(({site,reply})=>{
  const item=catalogue.buildings.find(x=>x.id===site.itemId),expected=centre(site,item),building=native.find(x=>x.name===site.itemId&&x.position[0]===expected[0]&&x.position[1]===expected[1]);
  assert.ok(building,'genuine native completed building at parity-correct centre '+site.itemId);assert.equal(building.currentBuildPts,item.points,'actual native construction points complete '+site.itemId);
  if(site.itemId==='A0ResearchFacility'){assert.equal(building.id,labId);assert.equal(building.modules,1,'new actual Research Facility has its completed module');}
  assert.ok(save.commands.snapshot.finishedBuilds.some(x=>x.id===reply.result.id),'the exact accepted job completed');
  return {id:building.id,itemId:site.itemId,expectedCentre:expected,position:building.position,currentBuildPts:building.currentBuildPts,modules:building.modules||0};
 });
}
async function run(options={}){
 let workerIds=authoredWorkerIds;
 const r={passed:false,seeded:false,started:new Date().toISOString(),phase:'initial',method:options.preparedSave?'Prepared real Dustfall game from prior completed factory2/2 checkpoint; genuine app-private native F8 after APK update, followed by real ADB catalogue/held/terrain/mesh-body touches and F7 evidence. Original trucks are reused; any additional produced truck must be verified in the actual saved files. No save-file injection or granted world state.':'Fresh authored Dustfall; real ADB catalogue, held-finger, terrain and mesh-body touches; genuine native F7 observations. No script-sent build orders or seeded world state.',identity:j.installedIdentity(options.apk),preparedSaveRequested:Boolean(options.preparedSave),expectedWorkerIds:workerIds,sites,checks:[]};let c;
 const write=()=>fs.writeFileSync(path.join(out,'preview-journey.json'),json(r,null,2)+'\n');
 try{
  c=options.reuse?await j.connectReady():await start();await j.resume(c);
  if(options.preparedSave){r.phase='prepared-native-save-load';console.log('START '+r.phase);const restored=await preparedSave(c,r);workerIds=r.preparedSave.includesProducedTruck?preparedWorkerIds:authoredWorkerIds;r.expectedWorkerIds=workerIds;r.preparedTruckCount=restored.trucks.length;r.checks.push('genuine cross-APK native F8 restores real factory2/2 and exact '+restored.trucks.length+' saved trucks'+(r.preparedSave.includesProducedTruck?', including verified produced Truck160143':''));}
  const rawControls=await controls(c),ctl={...rawControls,touch:async(x,y)=>{const hit=await assertWorldPoint(c,{x,y});(r.worldTouchChecks??=[]).push(hit);return rawControls.touch(x,y);}};await ctl.camera(28,20);
  r.initialSave=await c.save('preview05-00-initial-native');const initial=await m.fresh(c);fixture(initial.mapHeight===79&&initial.mapWidth===63&&initial.trucks.length===(options.preparedSave?r.preparedTruckCount:4),'fixture must be authored Dustfall with the expected genuine construction trucks');
  fixture(initial.jobs.length===0&&(options.preparedSave?!initial.constructionSites.some(x=>!['done','cancelled','interrupted'].includes(x.status)):initial.constructionSites.length===0),'fixture must not contain pending construction');
  const worker=rows(r.initialSave['droid.json']).find(x=>x.id===160005);fixture(worker&&worker.position.every(Number.isFinite),'local authored native worker exists with valid position');
  r.fixture={worker,initialState:initial,viewport:await c.host('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'),screen:await m.shot(c,'preview05-00-initial')};r.validations=[];
  for(const site of sites){const validation=await c.evaluate(`__warzoneCommands.send('preview-build',${json({...site,workerIds})})`);r.validations.push({site,validation});fixture(validation.ok,'fixture site is not genuinely clear/reachable: '+json({site,validation}));}
  await selection.monitor(c);
  r.phase='immediate-first-and-repeat-item';console.log('START '+r.phase);await c.tap('#wt-open-build');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1','first immediate actual item tap is accepted');
  await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1','repeat item stays selected');r.selection=await selection.waitSelection(c,workerIds);r.checks.push('immediate first item and repeat; exact native selected trucks/highlights');
  r.phase='held-neutral-preview-and-mixed-ordinary-queue';console.log('START '+r.phase);r.accepted=[];
  for(let index=0;index<sites.length;index++){
   const site=sites[index];await m.item(c,site.itemId,site.itemId==='GuardTower1'?'DEFENCES':'STRUCTURES');
   const point=await safeTile(c,ctl,site,r);await assertWorldPoint(c,point,site);
   if(index===0)r.held=await heldPreview(c,point,site);else await ctl.touch(point.x,point.y);
   const reply=await acceptedReply(c,site,workerIds);r.accepted.push(await acceptedPaint(c,site,reply,'preview05-0'+(index+2)+'-'+site.itemId+'-queued'));write();
  }
  if(r.cameraRecovery?.length){await ctl.camera(28,20);assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1');await m.group(c,workerIds,'return from safe right-hand tile camera');r.cameraRecoveryReturn={camera:[28,20],screen:await m.shot(c,'preview05-safe-camera-return')};}
  // Four ordinary sites plus a module total 2300 build points for one authored
  // worker. Leave bounded room for real travel and emulator scheduling; native
  // blocked/HQ/error states are still observed continuously and fail early.
  const deadline=Date.now()+360000;r.constructionDeadlineUTC=new Date(deadline).toISOString();
  r.nativeQueued=await c.save('preview05-06-ordinary-native-orders');r.nativeWorkers=rows(r.nativeQueued['droid.json']).filter(x=>workerIds.includes(x.id));assert.ok(r.nativeWorkers.some(x=>[4,5].includes(x['order/type'])),'actual native worker has BUILD/HELPBUILD, not an unrelated order');r.checks.push('held neutral real mesh; four accepted real mesh/site labels; odd/even/one-even-axis footprints');
  r.phase='ordinary-and-module-same-frame';console.log('START '+r.phase);const first=r.accepted[0].reply.result;await waitJobs(c,[first.id],deadline,'first Research Facility');
  const state=await m.fresh(c),initialStructureIds=new Set(rows(r.initialSave['struct.json']).map(x=>x.id)),newLab=state.moduleTargets.find(x=>x.itemId==='A0ResearchFacility'&&x.x===sites[0].x&&x.y===sites[0].y&&!initialStructureIds.has(x.id));
  fixture(newLab,'completed new Research Facility is an actual eligible module target');r.newLabId=newLab.id;
  assert.ok(r.accepted.slice(1).some(x=>state.jobs.some(job=>job.id===x.reply.result.id)),'ordinary construction still pending when module picker is exercised');
  await m.item(c,moduleId);await m.group(c,workerIds,'new Research Module selection');await m.target(c,newLab.id,moduleId);
  await c.wait(`(()=>{const d=WarzoneBuildDisplay.report();if(d.error)throw Error(d.error);return d.moduleDrawn.some(x=>x.id===${newLab.id})&&d.drawn.some(x=>x.parentId===0&&x.model&&x.triangles>0)})()`,10000);
  r.mixed={display:await display(c,'ordinary and module frame'),screen:await m.shot(c,'preview05-07-ordinary-and-module-highlights')};
  await ctl.camera(29,20);assert.equal(await c.evaluate('__warzoneCommands.report().placement'),moduleId);await ctl.camera(28,20);assert.equal(await c.evaluate('__warzoneCommands.report().placement'),moduleId);await m.group(c,workerIds,'radar preserves real selected worker');
  r.radar={display:await display(c,'module radar return'),screen:await m.shot(c,'preview05-08-radar-preserves-targets')};
  r.module=await m.tapParent(c,ctl,newLab.id,moduleId,'lower','preview05-09-new-research-module-body-queued');r.checks.push('actual ordinary mesh and actual module highlights paint together; radar and module-body queue');write();
  await m.exitBuild(c);r.moduleQueuedNative=await c.save('preview05-10-module-native-orders');const jobs=[...r.accepted.map(x=>x.reply.result),r.module.reply.result];
  r.phase='native-fifo-and-completion';console.log('START '+r.phase);r.finishedState=await waitJobs(c,jobs.map(x=>x.id),deadline,'ordinary and Research Module FIFO');
  const finished=r.finishedState.finishedBuilds.filter(x=>jobs.some(job=>job.id===x.id));assert.deepEqual(finished.map(x=>x.id),jobs.map(x=>x.id),'actual native worker completion order is the exact requested FIFO');r.fifo=finished;
  r.completeNative=await c.save('preview05-11-native-complete');r.nativeBuildings=verifyCompleted(r.completeNative,r.accepted,newLab.id);r.completeScreen=await m.shot(c,'preview05-11-complete-correct-footprints');r.checks.push('genuine native completed parity positions, construction points, FIFO and new lab module1');
  r.phase='repeated-menu-and-input-returns';console.log('START '+r.phase);r.returns=await returns(c,newLab.id,workerIds);r.checks.push('two Help, Queue, Research, Build returns with restored input');
  r.monitor=await selection.stopMonitor(c);assert.ok(r.monitor.samples.length>5);assert.ok(r.monitor.samples.every(x=>!x.covered&&!x.ended),'no frozen/ended battlefield overlay');assert.ok(r.monitor.samples.every(x=>x.zoom.join()===r.monitor.samples[0].zoom.join()),'no automatic camera zoom');assert.ok(r.monitor.samples.every(x=>x.viewport.join()===r.monitor.samples[0].viewport.join()),'constant actual viewport');
  r.finalDisplay=await display(c,'final');r.finalTerrain=r.finalDisplay.terrain;assert.deepEqual(c.errors,[],'no uncaught WebView exceptions');r.afterIdentity=j.installedIdentity(options.apk);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);r.passed=true;
 }catch(error){const message=String(error.stack||error.exception?.description||error.description||error);r.failure={kind:error instanceof FixtureError||/HQ lost during|Battle ended during/.test(message)?'fixture':'product-or-unverified',message,phase:r.phase};if(c)try{r.failureScreen=screen('preview05-failure');r.failureState=await m.ui(c);}catch(capture){r.failureCaptureError=String(capture);}throw error;
 }finally{
  if(c){try{r.cleanupMonitor=await selection.stopMonitor(c);if(!await c.evaluate('__towersHtml.isEnded()'))r.pausedAt=await j.pause(c);}catch(error){r.cleanupFailure=String(error.stack||error);r.passed=false;}c.close();}
  // Native saves were separately written by save(); avoid duplicating their
  // multi-megabyte full world payloads in the concise journey result.
  for(const key of ['initialSave','nativeQueued','moduleQueuedNative','completeNative'])if(r[key])r[key]={file:key==='initialSave'?'preview05-00-initial-native.json':key==='nativeQueued'?'preview05-06-ordinary-native-orders.json':key==='moduleQueuedNative'?'preview05-10-module-native-orders.json':'preview05-11-native-complete.json'};
  r.finished=new Date().toISOString();write();
 }
 if(!r.passed)throw Error(r.cleanupFailure||'Preview journey failed');return r;
}
module.exports={run,start,preparedSave,sites,centre,verifyCompleted,projectTile,assertWorldPoint,safeTile,heldPreview,returns};
if(require.main===module){const args=process.argv.slice(2),at=args.indexOf('--apk');run({apk:at>=0?args[at+1]:process.env.WZ_QA_APK,reuse:args.includes('--reuse'),preparedSave:args.includes('--prepared-save')}).then(r=>console.log(json({passed:r.passed,identity:r.identity,checks:r.checks}))).catch(error=>{console.error(error);process.exitCode=1;});}
