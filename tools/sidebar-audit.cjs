'use strict';
// Real Android input, screenshots and fresh native saves on the installed APK.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=process.env.WZ_QA_OUT?path.resolve(process.env.WZ_QA_OUT):path.join(root,'qa/v5.7');fs.mkdirSync(out,{recursive:true});
const device=process.env.WZ_QA_DEVICE||'emulator-5556';
const adbExe=path.join(process.env.ANDROID_HOME||'C:/Users/punke/AppData/Local/Android/Sdk','platform-tools/adb.exe');
const adb=(...args)=>execFileSync(adbExe,['-s',device,...args],{timeout:20000,maxBuffer:20*1024*1024});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results={device,seeded:false,screens:[],cases:[],errors:[]};
const screensResume=process.argv.includes('--screens');
const mixedResume=process.argv.includes('--mixed');
const controlsOnly=process.argv.includes('--controls');
const largeOnly=process.argv.includes('--large');
const compactOnly=process.argv.includes('--compact'),continuation=process.argv.includes('--continue')||compactOnly||controlsOnly||largeOnly;if(continuation||mixedResume||screensResume){Object.assign(results,JSON.parse(fs.readFileSync(path.join(out,'delivery-failure.json'),'utf8')));delete results.failure;results.errors=[];results.resumedAt=new Date().toISOString();}
let evaluate,socket,id=0;const pending=new Map();
async function until(expression,label,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const v=await evaluate(expression);if(v)return v;await sleep(100);}throw Error('Timed out: '+label);}
async function screen(name){await evaluate('new Promise(resolve=>parent.requestAnimationFrame(()=>parent.requestAnimationFrame(resolve)))');await sleep(150);fs.writeFileSync(path.join(out,name+'.png'),adb('exec-out','screencap','-p'));results.screens.push(name);}
async function pointTap(x,y){
 assert.equal(await evaluate('parent.document.visibilityState'),'visible','refuse background taps');
 assert.notEqual(await evaluate('window.__warzoneTowersWaves?.report().snapshot?.phase'),'defeated','refuse input into replay overlay');
 const [w,h]=await evaluate('[parent.innerWidth,parent.innerHeight]'),png=adb('exec-out','screencap','-p');
 assert.ok(png.readUInt32BE(16)>png.readUInt32BE(20),'landscape app must be foreground');
 adb('shell','input','tap',String(Math.round(x*png.readUInt32BE(16)/w)),String(Math.round(y*png.readUInt32BE(20)/h)));
 await sleep(180);
}
async function tap(selector){
 const p=await evaluate(`(()=>{const e=parent.document.querySelector(${JSON.stringify(selector)})||document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),o=e.ownerDocument===document?parent.document.getElementById('warzone-game-frame').getBoundingClientRect():{x:0,y:0};if(e.disabled||!r.width||!r.height)throw Error('Not tappable '+${JSON.stringify(selector)});return{x:r.x+o.x+r.width/2,y:r.y+o.y+r.height/2};})()`);
 await pointTap(p.x,p.y);
}
async function settle(){await until('__warzoneCommands.report().pending===0&&!__warzoneCommands.report().buildingOpening&&!__kalaWarzoneTouch.report().pendingClicks','native input and replies');}
let radarInverted=true;
async function map(x,y){
 assert.equal(await evaluate('__warzoneCommands.report().nativeHudHidden'),false,'restore minimap before a radar tap');
 for(let attempt=0;attempt<2;attempt++){
  const rx=radarInverted?64-x:x,ry=radarInverted?64-y:y;
  const p=await evaluate(`(()=>{const r=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:r.x+innerWidth-216+${rx}*3,y:r.y+innerHeight-216+${ry}*3};})()`);
  await pointTap(p.x,p.y);await evaluate('WarzoneTerrain.active(true);true');const frame=await evaluate('__kalaWarzoneTouch.report().nativeRenderFrames');await until('__kalaWarzoneTouch.report().nativeRenderFrames>'+frame+'+3','radar view renders');
  const c=await evaluate('WarzoneTerrain.pick(innerWidth/2,innerHeight/2)');
  if(c&&Math.abs(c.x-x)<=6&&Math.abs(c.y-y)<=6)return;
  if(c&&Math.abs(c.x-(64-x))<=7&&Math.abs(c.y-(64-y))<=7){radarInverted=!radarInverted;continue;}
  throw Error('Radar target mismatch: '+JSON.stringify({x,y,c,radarInverted}));
 }
 throw Error('Radar calibration failed');
}
async function world(wx,wy,z=0){
 await evaluate('WarzoneTerrain.active(true);true');
 const frames=await evaluate('__kalaWarzoneTouch.report().nativeRenderFrames');await until(`__kalaWarzoneTouch.report().nativeRenderFrames>${frames+1}`,'fresh terrain frame');
 const p=await evaluate(`(()=>{let z=${z};for(let i=0;i<30;i++){const p=WarzoneTerrain.project(${wx},${wy},z),q=p&&WarzoneTerrain.pick(p.x,p.y);if(!q)throw Error('Site outside viewport');if(Math.hypot(q.worldX-${wx},q.worldY-${wy})<2){const r=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();if(parent.document.elementFromPoint(p.x+r.x,p.y+r.y)?.id!=='warzone-game-frame')throw Error('Site covered by HUD');return{x:p.x+r.x,y:p.y+r.y};}z=(z+q.height)/2;}throw Error('Terrain projection did not converge');})()`);
 await pointTap(p.x,p.y);
}
async function tile(x,y,even=false){await world((x+(even?0:.5))*128+(even?1:0),(y+(even?0:.5))*128+(even?1:0));}
async function save(name){
 await settle();const directory="LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave'";
 const stamp=`(()=>{try{return LaunchedModule.FS.stat(${directory}+'/droid.json').mtime.getTime()}catch(_){return 0}})()`;
 const before=await evaluate(stamp);await evaluate('__kalaWarzoneTouch.nativePressKey("F7","F7",118);true');await until(`(${stamp})>${before}`,'fresh native QuickSave');
 const data=await evaluate(`(()=>{const f=LaunchedModule.FS,p=${directory},r={commands:__warzoneCommands.report(),wave:__warzoneTowersWaves.report().snapshot};for(const n of ['droid.json','struct.json'])r[n]=JSON.parse(f.readFile(p+'/'+n,{encoding:'utf8'}));return r;})()`);
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));await until(`__warzoneCommands.report().snapshot.gameTime>${data.commands.snapshot.gameTime}`,'simulation resumes after save');return data;
}
async function layout(name){
 await until('Array.from(parent.document.querySelectorAll("#wt-sidebar-catalogue img")).every(i=>i.complete&&i.naturalWidth>0)','stock artwork loaded',7000);
 const v=await evaluate(`(()=>{const d=parent.document,rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};},ids=['wt-open-build','wt-open-design','wt-open-factory','wt-open-queue','blocknight-tech','blocknight-help','warzone-towers-next-wave'];return{viewport:[parent.innerWidth,parent.innerHeight],frame:rect(d.getElementById('warzone-game-frame')),inert:d.getElementById('warzone-game-frame').inert,header:ids.map(id=>{const e=d.getElementById(id),r=e.getBoundingClientRect();return{id,inside:r.x>=0&&r.y>=0&&r.right<=parent.innerWidth&&r.bottom<=parent.innerHeight,hit:d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e};}),sidebar:rect(d.getElementById('wt-build-sidebar')),field:rect(d.getElementById('wt-field-centre')),footer:rect(d.querySelector('.wt-sidebar-exit')),grid:rect(d.getElementById('wt-sidebar-catalogue')),images:Array.from(d.querySelectorAll('#wt-sidebar-catalogue img')).map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0}))};})()`);
 assert.ok(v.header.every(b=>b.inside&&b.hit),JSON.stringify(v.header));
 if(await evaluate('__warzoneCommands.report().buildOpen')){assert.equal(v.inert,false);assert.ok(v.sidebar.b<=v.viewport[1]);if(await evaluate('parent.document.body.dataset.fieldCompact==="true"'))assert.ok(v.sidebar.b>=v.viewport[1]-9);else if(await evaluate('parent.document.body.dataset.fieldExpanded==="true"'))assert.ok(v.sidebar.b<=v.field.y);assert.ok(v.footer.b<=v.sidebar.b);assert.ok(v.grid.h>=68);assert.ok(v.images.every(i=>i.loaded));}
 fs.writeFileSync(path.join(out,name+'-layout.json'),JSON.stringify(v,null,2));await screen(name);return v;
}
async function build(){await tap('#wt-open-build');await until('__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().buildingOpening','build sidebar');await settle();}
async function choose(item,category='DEFENCES'){await tap(`#wt-build-sidebar [data-category="${category}"]`);await tap(`#wt-build-sidebar [data-build="${item}"]`);await until(`__warzoneCommands.report().nativeToolReady&&__warzoneCommands.report().nativeItem===${JSON.stringify(item)}`,'selected native structure');await settle();}
async function closeBuild(){await tap('.wt-sidebar-exit');await until('!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().nativeMenu&&!__warzoneCommands.report().exitingBuild','exit keeps orders');await settle();}
async function prepareHQ(){
 await tap('#blocknight-base');await until('__kalaWarzoneTouch.report().zoomPending===false','BASE centres HQ');await map(12,46);if(await evaluate('parent.document.body.dataset.fieldExpanded!=="true"'))await tap('#wt-field-toggle');await tap('#wt-select-trucks');await settle();
 await until('__warzoneCommands.report().snapshot.trucks.filter(t=>t.selected).length>=3&&__warzoneCommands.report().snapshot.trucks.filter(t=>t.selected).every(t=>t.x<32)','HQ constructors');
 const candidates=[[14,46],[12,46],[12,48],[14,44],[12,44],[10,48],[10,46]],sites=[];
 for(const [x,y]of candidates){const v=await evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${x},y:${y}})`);if(v.ok)sites.push({x,y});if(sites.length===5)break;}assert.equal(sites.length,5,'validate five reachable clear HQ sites before the run');
 await build();await choose('GuardTower1');for(const p of sites)await tile(p.x,p.y);await closeBuild();
 await until('__warzoneCommands.report().snapshot.construction.length===0&&__warzoneCommands.report().snapshot.trucks.filter(t=>t.x<32).every(t=>t.order===0)','normally constructed HQ defenses',100000);
 const data=await save('hq-ready-native');for(const p of sites)assert.ok(Object.values(data['struct.json']).some(s=>s.name==='GuardTower1'&&s.position[0]===p.x*128+64&&s.position[1]===p.y*128+64&&s.currentBuildPts>=300),'native HQ tower completed');
 results.hqSites=sites;await screen('hq-ready');fs.writeFileSync(path.join(out,'hq-setup-results.json'),JSON.stringify(results,null,2));
}
async function smoothJourney(){
 if(process.argv.includes('--smooth-layouts')){Object.assign(results,JSON.parse(fs.readFileSync(path.join(out,'delivery-failure.json'),'utf8')));delete results.failure;results.errors=[];}else{
 let q0,ids;
 if(process.argv.includes('--smooth-continue')){
   ids=JSON.parse(fs.readFileSync(path.join(out,'exit-native-queued.json'),'utf8')).commands.nativeBuildGroup;
   await map(10,37);await build();q0=await evaluate('parent.document.getElementById("wt-catalogue-wrap").getBoundingClientRect().toJSON()');await closeBuild();
 }else{
 await map(10,37);await build();await choose('GuardTower1');await until('parent.document.getElementById("wt-build-busy").hidden','first transition settled');
 const refs=await evaluate(`(()=>{const d=parent.document;parent.__smoothCards=Array.from(d.querySelectorAll('#wt-sidebar-catalogue [data-build]'));parent.__smoothSidebarHides=[];parent.__smoothObserve=true;const s=d.getElementById('wt-build-sidebar');const o=new parent.MutationObserver(()=>{if(parent.__smoothObserve&&s.hidden)parent.__smoothSidebarHides.push(performance.now())});o.observe(s,{attributes:true,attributeFilter:['hidden']});return parent.__smoothCards.length})()`);assert.ok(refs>5);
 await choose('GuardTower6');await until('parent.document.getElementById("wt-build-busy").hidden&&!__warzoneCommands.report().pendingItem','changed item transition settled');
 assert.ok(await evaluate('parent.__smoothCards.every(e=>e.isConnected&&e===parent.document.querySelector(`[data-build="${e.dataset.build}"]`))'),'item change keeps actual card/image nodes');assert.deepEqual(await evaluate('parent.__smoothSidebarHides'),[],'item change never hides sidebar');
 await choose('GuardTower1');for(const y of [39,41])assert.ok((await evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:7,y:${y}})`)).ok,'clear reachable native sites');
 await tile(7,39);await tile(7,41);await until('__warzoneCommands.report().snapshot.constructionSites.length===2','native FIFO sites');
 q0=await evaluate('parent.document.getElementById("wt-catalogue-wrap").getBoundingClientRect().toJSON()');await screen('orders-before-exit');
 // Keep both accepted native orders while switching tools and exiting promptly.
 await choose('GuardTower6');await until('!__warzoneCommands.report().pendingItem','changed item ready');await closeBuild();await until('parent.document.getElementById("wt-build-busy").hidden','exit transition finished');
 const queued=await save('exit-native-queued');ids=queued.commands.nativeBuildGroup;assert.equal(ids.length,3);for(const d of Object.values(queued['droid.json']).filter(d=>ids.includes(d.id))){const orders=[d['order/stats'],...Array.from({length:d['orderList/size']||0},(_,i)=>d['orderList/'+i+'/stats'])];assert.ok(orders.filter(n=>n==='GuardTower1').length>=1,'native accepted orders survive exit');}await screen('orders-after-exit');
 }
 await until(`__warzoneCommands.report().snapshot.construction.length===0&&__warzoneCommands.report().snapshot.trucks.filter(t=>${JSON.stringify(ids)}.includes(t.id)).every(t=>t.order===0)`,'ordinary two-tower completion',60000);
 const done=await save('exit-native-completed');for(const y of [39,41])assert.ok(Object.values(done['struct.json']).some(s=>s.name==='GuardTower1'&&s.position[0]===960&&s.position[1]===y*128+64&&s.currentBuildPts>=300),'both queued towers actually completed');
 await build();await choose('GuardTower1');const q1=await evaluate('parent.document.getElementById("wt-catalogue-wrap").getBoundingClientRect().toJSON()');assert.equal(q1.height,q0.height,'queue contents do not resize catalogue');
 await evaluate('parent.__smoothSidebarHides=[];true');await tap('#wt-placement-map');await until('!__warzoneCommands.report().nativeHudHidden&&__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().exitingBuild','Map exit keeps sidebar');assert.deepEqual(await evaluate('parent.__smoothSidebarHides'),[],'Map retains sidebar without a hidden frame');await screen('map-exit-sidebar');
 await choose('GuardTower1');if(await evaluate('parent.document.body.dataset.fieldExpanded!=="true"'))await tap('#wt-field-toggle');await tap('#wt-select-trucks');await settle();await until('!__warzoneCommands.report().nativeMenu&&!__warzoneCommands.report().buildOpen','Trucks exits placement');assert.deepEqual((await evaluate('__warzoneCommands.report().snapshot.trucks.filter(t=>t.selected).map(t=>t.id)')).sort(),ids.slice().sort());await screen('trucks-after-placement');
 await map(10,40);const beforeMove=await save('movement-before'),truck=Object.values(beforeMove['droid.json']).find(d=>ids.includes(d.id));let moveSite;for(const [x,y]of [[9,42],[8,43],[9,40]])if((await evaluate(`__warzoneCommands.send('preview-build',{itemId:'A0TankTrap',x:${x},y:${y}})`)).ok){moveSite={x,y};break;}assert.ok(moveSite,'validated clear reachable move destination');await tile(moveSite.x,moveSite.y);await settle();const moving=await save('movement-after-exit');assert.ok(Object.values(moving['droid.json']).some(d=>ids.includes(d.id)&&(d['order/type']===2||Math.hypot(d.position[0]-beforeMove['droid.json'][Object.keys(beforeMove['droid.json']).find(k=>beforeMove['droid.json'][k].id===d.id)].position[0],d.position[1]-beforeMove['droid.json'][Object.keys(beforeMove['droid.json']).find(k=>beforeMove['droid.json'][k].id===d.id)].position[1])>50)),'field MOVE or completed native movement restored');await until(`__warzoneCommands.report().snapshot.trucks.some(t=>t.id===${truck.id}&&Math.hypot(t.x-${truck.position[0]/128},t.y-${truck.position[1]/128})>.4)`,'native movement after build exit',10000);
 results.cases.push('stable card nodes and sidebar, Map retained without blink, real multi-truck FIFO survives item change/Exit, both towers complete, fixed catalogue height, Trucks selection and native MOVE');
 await evaluate('parent.__smoothObserve=false;true');
 // Check the other explicit exit, plus actual automatic completion.
 await build();await choose('GuardTower1');if(await evaluate('parent.document.body.dataset.fieldExpanded!=="true"'))await tap('#wt-field-toggle');await tap('#wt-select-move');await settle();await until('!__warzoneCommands.report().nativeHudHidden','Select/Move restores viewport');
 await build();await choose('A0TankTrap');let target;for(const [x,y]of [[9,40],[10,41],[9,42],[11,42]])if((await evaluate(`__warzoneCommands.send('preview-build',{itemId:'A0TankTrap',x:${x},y:${y}})`)).ok){target={x,y};break;}assert.ok(target);await tile(target.x,target.y);await until('__warzoneCommands.report().snapshot.construction.some(s=>s.itemId==="A0TankTrap"&&s.workers>0)','ordinary tank trap starts',25000);await until('!__warzoneCommands.report().nativeMenu&&!__warzoneCommands.report().nativeHudHidden&&!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().exitingBuild','automatic completion restores battle',30000);await until('parent.document.getElementById("wt-build-busy").hidden','automatic transition finished');const auto=await save('automatic-native-completed');assert.ok(Object.values(auto['struct.json']).some(s=>s.name==='A0TankTrap'&&s.position[0]===target.x*128+64&&s.position[1]===target.y*128+64&&s.currentBuildPts>=40));await screen('automatic-exit');
 await tap('#blocknight-tech');await until('__blockNightResearch.report().open','research return');await tap('.bn-tech-done');await settle();await tap('#wt-open-factory');await settle();await tap('#wt-command-pages [data-action="back"]');await settle();assert.equal(await evaluate('parent.document.getElementById("warzone-game-frame").inert'),false);
 results.cases.push('Select/Move exit, ordinary construction automatic exit, Research and Factory returns restore field input');
 }
 for(const [label,size,density,w,h]of [['compact','900x1620','240',1080,600],['standard','1080x2400','300',1280,576],['large','1080x2400','240',1600,720]]){
   adb('shell','wm','size',size);adb('shell','wm','density',density);await until(`parent.innerWidth===${w}&&parent.innerHeight===${h}`,label+' viewport');await map(10,40);await build();await choose('GuardTower1');await until('!__warzoneCommands.report().pendingItem&&parent.document.getElementById("wt-build-busy").hidden',label+' item settled');await layout(label+'-placement');await closeBuild();await until('parent.document.getElementById("wt-build-busy").hidden',label+' exit settled');await screen(label+'-exit');assert.equal(await evaluate('parent.document.getElementById("warzone-game-frame").inert'),false);
 }
 results.cases.push('compact, standard and large placement/exit screens and hit targets');
 await map(10,37);await build();await choose('GuardTower1');const peakSites=[];for(const [x,y]of [[7,39],[7,41],[9,39],[9,41],[11,39],[11,41],[8,43]]){if((await evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${x},y:${y}})`)).ok)peakSites.push({x,y});if(peakSites.length===3)break;}assert.equal(peakSites.length,3,'three clear queue sites');for(const {x,y}of peakSites)await tile(x,y);await until(`__warzoneCommands.report().snapshot.constructionSites.filter(s=>${JSON.stringify(peakSites)}.some(p=>p.x===s.x&&p.y===s.y)).length===3`,'three real queued sites',6000);await screen('three-site-queue');
 const peak=await evaluate(`(()=>{const d=parent.document,b=d.querySelector('.wt-all-sites'),q=d.getElementById('wt-sidebar-queue');return {queue:q.getBoundingClientRect().toJSON(),button:b?.getBoundingClientRect().toJSON(),hit:b&&d.elementFromPoint(b.getBoundingClientRect().x+20,b.getBoundingClientRect().y+b.offsetHeight/2)?.closest('button')===b}})()`);fs.writeFileSync(path.join(out,'three-site-layout.json'),JSON.stringify(peak,null,2));await save('three-site-native');assert.ok(peak.button&&peak.button.bottom<=peak.queue.bottom&&peak.hit,'View All is fully visible with a three-site native queue');await closeBuild();results.cases.push('three native queue sites and fully visible View All control');
 const apk=path.join(root,'app/build/outputs/apk/debug/app-debug.apk');results.apkSHA256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');const apkPath=adb('shell','pm','path','com.rbabbit.warzonetowers').toString().trim().replace(/^package:/,'');results.installedSHA256=adb('shell','sha256sum',apkPath).toString().split(/\s/)[0];assert.equal(results.installedSHA256,results.apkSHA256);assert.deepEqual(await evaluate('parent.__quietHudViolations'),[]);assert.deepEqual(results.errors,[]);results.passed=true;
 await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');let paused=false;for(let i=0;i<3;i++){const clock=await evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await sleep(1400);if(await evaluate('__warzoneTowersWaves.report().snapshot.gameTime')===clock){paused=true;break;}}assert.ok(paused,'native test state paused');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS:',results.cases.join('; '));
}
async function modAudit(){
 const details={seeded:false,apkSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app/build/outputs/apk/debug/app-debug.apk'))).digest('hex')};
 const readSave=()=>evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',r={};for(const n of f.readdir(p))if(n.endsWith('.json'))r[n]=JSON.parse(f.readFile(p+'/'+n,{encoding:'utf8'}));return r;})()`);
 await tap('#blocknight-tech');await until('__blockNightResearch.report().open','research opens');
 assert.ok((await evaluate('__blockNightResearch.report().labs')).every(l=>l.idle),'human research was not automatically assigned by the mod');
 const add=async(lab,name)=>{await tap(`.bn-tech-lab[data-lab="${lab}"]`);const selector=await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('.bn-tech-card')).find(e=>e.textContent.includes(${JSON.stringify(name)}));if(!b)throw Error('Missing native topic '+${JSON.stringify(name)});return '.bn-tech-card[data-topic-id="'+b.dataset.topicId+'"]';})()`);await tap(selector);await tap('.bn-tech-assign');};
 await add(0,'Hover Propulsion');await add(0,'Composite Alloys');await add(1,'Fuel Injection Engine Mk3');
 await tap('.bn-tech-done');await until('!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose&&!__blockNightResearch.report().runner','research commands committed',30000);
 await until('__blockNightResearch.report().labs[0].topicName.includes("Hover")&&__blockNightResearch.report().labs[1].topicName.includes("Fuel")','different native lab topics',15000);
 details.research=await evaluate('__blockNightResearch.report()');assert.equal(details.research.queues[0][0],'Composite Alloys');
 await tap('#blocknight-tech');await until('__blockNightResearch.report().open','research reopen');
 for(const [lab,name]of [[0,'Hover Propulsion'],[1,'Fuel Injection Engine Mk3']]){await tap(`.bn-tech-lab[data-lab="${lab}"]`);assert.ok(await evaluate(`document.querySelector('.bn-tech-detail').textContent.includes(${JSON.stringify(name)})`));await screen('mod-research-lab-'+(lab+1));}
 await tap('.bn-tech-done');await until('!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose','return from labs');await settle();
 const before=await save('mod-before-skip'),oldWave=before.wave.wave,oldIds=Object.values(before['droid.json']).filter(d=>d.player===1).map(d=>d.id);
 assert.ok(before.wave.canSkip);await tap('#warzone-towers-next-wave');await until(`__warzoneTowersWaves.report().snapshot.wave===${oldWave+1}&&!__warzoneTowersWaves.report().pendingCommand`,'Skip advances authored round once',15000);
 await until('__warzoneTowersWaves.report().snapshot.queuedEnemies===0','authored spawn queue drains',10000);
 const skipped=await save('mod-after-skip');assert.equal(skipped.wave.wave,oldWave+1);const enemies=Object.values(skipped['droid.json']).filter(d=>d.player===1);assert.ok(enemies.some(d=>oldIds.includes(d.id)),'Skip keeps surviving enemies');details.skip={before:before.wave,after:skipped.wave,survivorsRetained:true};await screen('mod-skip-survivors');
 const stored=await readSave(),g=stored['scriptstate.json'].globals_0;assert.equal(g.scriptName,'init');assert.ok(g.SaveLoad_objects[0].locations.length);details.beforeLoad={time:skipped.wave.gameTime,wave:g.warzoneTowersWaves_state,index:g.index,spawner:g.SaveLoad_objects[0],labs:g.warzoneTowersLabResearch};
 fs.writeFileSync(path.join(out,'mod-before-load-native.json'),JSON.stringify(stored,null,2));
 // Let the clock move beyond the saved state, then load only from normal play.
 await until(`__warzoneCommands.report().snapshot.gameTime>${skipped.commands.snapshot.gameTime+3000}`,'clock advances before load',8000);
 const loadAt=await evaluate('__warzoneCommands.report().snapshot.gameTime');await evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
 await until(`__warzoneCommands.report().snapshot.gameTime<${loadAt-1500}`,'native QuickLoad restores earlier clock',45000);
 const reply=await evaluate('__warzoneCommands.send("state",{})');assert.ok(reply.ok&&reply.result.trucks.length>=6,'fresh command reply after load');
 const loaded=await save('mod-after-load'),restored=await readSave(),h=restored['scriptstate.json'].globals_0;
 assert.equal(h.scriptName,'init');assert.equal(h.index,g.index);assert.equal(h.warzoneTowersWaves_state.wave,g.warzoneTowersWaves_state.wave);assert.equal(h.warzoneTowersWaves_state.deadline,g.warzoneTowersWaves_state.deadline);assert.equal(h.scavAI,g.scavAI);
 const a=g.SaveLoad_objects[0],b=h.SaveLoad_objects[0];assert.deepEqual(b.locations,a.locations);assert.equal(b.player,a.player);assert.equal(b.rank,a.rank);assert.ok(b.queue.length<=a.queue.length);assert.deepEqual(b.queue,a.queue.slice(a.queue.length-b.queue.length),'restored spawning continues through the saved FIFO');
 assert.deepEqual(Object.keys(h.warzoneTowersLabResearch),Object.keys(g.warzoneTowersLabResearch));for(const key of Object.keys(g.warzoneTowersLabResearch))assert.equal(h.warzoneTowersLabResearch[key].topicId,g.warzoneTowersLabResearch[key].topicId);
 details.afterLoad={time:loaded.wave.gameTime,wave:h.warzoneTowersWaves_state,index:h.index,spawner:h.SaveLoad_objects[0],labs:h.warzoneTowersLabResearch,freshCommandReply:true};fs.writeFileSync(path.join(out,'mod-after-load-native.json'),JSON.stringify(restored,null,2));await screen('mod-loaded-battle');
 const rewards=await evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/logs/init.0.log';return f.readFile(p,{encoding:'utf8'}).split(/\r?\n/).filter(l=>l.includes('BNTDREWARD:')).map(l=>JSON.parse(l.slice(l.indexOf('BNTDREWARD:')+11)));})()`);
 assert.ok(rewards.length>=35,'ordinary native combat kills');for(const r of rewards){assert.equal(r.credited,r.expected);assert.equal(r.after-r.before,r.expected);assert.equal(r.player,0);}
 details.rewards={events:rewards.length,allExact:true,samples:rewards.slice(0,12),current:loaded.wave};
 await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');details.passed=true;fs.writeFileSync(path.join(out,'mod-gameplay-results.json'),JSON.stringify(details,null,2));console.log('PASS: native cost-based rewards, manual multi-lab research/queues, Skip survivors and native mod Save/Load');
}
async function main(){
 const pid=adb('shell','pidof','com.rbabbit.warzonetowers').toString().trim();adb('forward','tcp:9227',`localabstract:webview_devtools_remote_${pid}`);
 const tabs=await(await fetch('http://127.0.0.1:9227/json')).json(),tab=tabs.find(t=>t.url.includes('/mobile.html'));assert.ok(tab);
 socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 socket.onmessage=e=>{const m=JSON.parse(String(e.data));if(m.method==='Runtime.exceptionThrown')results.errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error||m.result.exceptionDetails?p.reject(m.error||m.result.exceptionDetails):p.resolve(m.result.result?.value);}};
 const request=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject,timer:setTimeout(()=>reject(Error('CDP timeout')),45000)});socket.send(JSON.stringify({id:key,method,params}));});
 evaluate=expression=>request('Runtime.evaluate',{expression:`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(expression)})`,returnByValue:true,awaitPromise:true});await request('Runtime.enable');await evaluate('parent.__quietHudViolations=[];new parent.MutationObserver(()=>{const d=parent.document;for(const id of ["wt-build-status","wt-command-toast"]){const e=d.getElementById(id);if(e&&!e.hidden&&getComputedStyle(e).display!=="none"&&/preparing|selected\. choose|placement closed|queued for production/i.test(e.textContent))parent.__quietHudViolations.push(e.textContent);}}).observe(parent.document.body,{subtree:true,childList:true,attributes:true,characterData:true});true');
 await until('window.__warzoneCommands?.report().snapshot?.trucks.length>=6','ordinary native starting units',120000);
 // This run starts in the ordinary native Escape pause menu, preserving the
 // ready fixture while writing this audit. No objects/research/power are seeded.
 if(process.argv.includes('--fresh')){assert.equal(await evaluate('Boolean(parent.document.getElementById("warzone-towers-preparation")?.open)'),false,'no routine preparation modal');}else if(!process.argv.includes('--running')){const before=await evaluate('__warzoneCommands.report().snapshot.gameTime');await sleep(700);if(await evaluate('__warzoneCommands.report().snapshot.gameTime')===before){await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await until(`__warzoneCommands.report().snapshot.gameTime>${before}`,'resume prepared native game');}}
 if(process.argv.includes('--setup-hq')){await prepareHQ();await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');console.log('PASS: five ordinary HQ defenses completed');return;}
 if(process.argv.includes('--mod')){await modAudit();return;}
 if(process.argv.includes('--smooth')||process.argv.includes('--smooth-continue')||process.argv.includes('--smooth-layouts')){await smoothJourney();return;}
 let complete,ids;if(!continuation){
 if(!screensResume){
 if(!mixedResume){
 await build();await tap('#wt-build-sidebar [data-category="DEFENCES"]');const first=await layout('delivery-wide-build');assert.deepEqual(first.viewport,[1280,576]);
 assert.equal(await evaluate('__warzoneCommands.report().nativeBuildGroup.length'),3);
 assert.equal(await evaluate('parent.document.body.dataset.fieldExpanded'),'false');
 assert.equal(await evaluate('parent.document.querySelectorAll("#wt-build-sidebar h1").length'),0);
 assert.ok(first.grid.h>280,'expanded build catalogue uses reclaimed left height');
 await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="true"','expand field controls');await sleep(150);await screen('delivery-controls-expanded');
 const controls=await evaluate(`(()=>{const d=parent.document;return ['wt-select-move','blocknight-select-all','blocknight-auto-fight','blocknight-box-select','blocknight-stop','wt-select-trucks'].map(id=>{const e=d.getElementById(id),r=e.getBoundingClientRect();return{id,hit:d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e,inside:r.right<=parent.innerWidth&&r.bottom<=parent.innerHeight};});})()`);assert.ok(controls.every(b=>b.hit&&b.inside),JSON.stringify(controls));
 await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="false"','collapse field controls');

 const scroll=await evaluate(`(()=>{const e=parent.document.getElementById('wt-sidebar-catalogue'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,h:r.height,overflow:e.scrollHeight>e.clientHeight};})()`);assert.ok(scroll.overflow);
 const png=adb('exec-out','screencap','-p'),scale=png.readUInt32BE(16)/1280;
 adb('shell','input','swipe',String(Math.round(scroll.x*scale)),String(Math.round((scroll.y+scroll.h/3)*scale)),String(Math.round(scroll.x*scale)),String(Math.round((scroll.y-scroll.h/3)*scale)),'450');
 await until('parent.document.getElementById("wt-sidebar-catalogue").scrollTop>0','real structure-list scroll');const scrolled=await layout('delivery-wide-scroll');assert.equal(scrolled.footer.y,first.footer.y);
 await tap('#wt-build-sidebar [data-category="STRUCTURES"]');await layout('delivery-stock-base-icons');
 await map(10,37);await choose('GuardTower1');
 for(const y of [39,41]){const r=await evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:7,y:${y}})`);assert.ok(r.ok,'validate clear reachable site before tapping');await tile(7,y);}
 await until('__warzoneCommands.report().snapshot.constructionSites.length===2','both native sites journalled');
 const queued=await save('delivery-native-queued');ids=queued.commands.nativeBuildGroup;
 for(const truck of Object.values(queued['droid.json']).filter(d=>ids.includes(d.id))){assert.equal(truck['order/stats'],'GuardTower1');assert.equal(truck['orderList/size'],1);assert.equal(truck['orderList/0/stats'],'GuardTower1');assert.deepEqual(truck['orderList/0/pos'],[960,5312]);}
 await until('__warzoneCommands.report().snapshot.construction.some(b=>b.remaining>0&&b.workers>0)','live native work and estimate',60000);await screen('delivery-live-time-and-queue');
 const timed=await evaluate('__warzoneCommands.report().snapshot.construction');results.timingSample=timed;
 await tile(7,39);await settle();assert.equal(await evaluate('__warzoneCommands.report().snapshot.constructionSites.length'),2,'duplicate site rejected');
 }else{await build();ids=await evaluate('__warzoneCommands.report().nativeBuildGroup');await map(10,37);}


 await choose('A0TankTrap');
 const reclaimed=await evaluate(`(async()=>{WarzoneTerrain.active(true);const points=[];for(let x=5;x<=15;x++)for(let y=30;y<=40;y++){let z=256,p,ok=false;for(let k=0;k<20;k++){p=WarzoneTerrain.project((x+.5)*128,(y+.5)*128,z);const q=p&&WarzoneTerrain.pick(p.x,p.y);if(!q)break;if(Math.hypot(q.worldX-(x+.5)*128,q.worldY-(y+.5)*128)<2){ok=true;break;}z=(z+q.height)/2;}if(ok&&p.x>=innerWidth/2-170&&p.x<innerWidth/2+138&&p.y>parent.innerHeight-parent.document.getElementById("warzone-game-frame").getBoundingClientRect().y-126&&p.y<parent.innerHeight-parent.document.getElementById("warzone-game-frame").getBoundingClientRect().y-25)points.push({x,y});}const found=await Promise.all(points.map(async p=>({...p,result:await __warzoneCommands.send('preview-build',{itemId:'A0TankTrap',...p})})));return found.find(p=>p.result.ok);})()`);
 assert.ok(reclaimed,'validated reachable site in the former native truck window');await tile(reclaimed.x,reclaimed.y);await until('__warzoneCommands.report().snapshot.constructionSites.some(s=>s.itemId==="A0TankTrap")','former window terrain tap accepted');const recovered=await save('delivery-reclaimed-window-native');assert.ok(Object.values(recovered['droid.json']).some(d=>d['order/stats']==='A0TankTrap'||Array.from({length:d['orderList/size']||0},(_,i)=>d['orderList/'+i+'/stats']).includes('A0TankTrap')),'native FIFO contains site tapped inside former truck window');results.reclaimedSite=reclaimed;await screen('delivery-reclaimed-window');
 // Restore the map without dropping either accepted native order.
 await tap('#wt-placement-map');await until('!__warzoneCommands.report().nativeHudHidden&&__warzoneCommands.report().buildOpen','map restores native HUD');await settle();
 assert.equal(await evaluate('parent.document.querySelectorAll("#wt-sidebar-catalogue button.active").length'),0,'selection clears on leaving placement');await screen('delivery-minimap-restored');
 await choose('A0ResearchFacility','STRUCTURES');
 const facilityPlan=await evaluate("__warzoneCommands.send('preview-build',{itemId:'A0ResearchFacility',x:8,y:38})");assert.ok(facilityPlan.ok,'2x2 fixture is clear and reachable');await tile(8,38,true);
 await until('__warzoneCommands.report().snapshot.constructionSites.some(s=>s.itemId==="A0ResearchFacility")','2x2 site journalled');
 await choose('A0FacMod1','MODULES');await tile(4,38);await until('__warzoneCommands.report().snapshot.constructionSites.some(s=>s.itemId==="A0FacMod1")','module site journalled');
 await until('__warzoneCommands.report().snapshot.constructionSites.some(s=>s.itemId==="A0ResearchFacility"&&s.observed&&s.structureId)','2x2 queue follows the real native foundation');const mixed=await save('delivery-native-mixed-queue');assert.ok(!mixed.commands.snapshot.constructionSites.some(j=>j.itemId==='A0ResearchFacility'&&j.status==='interrupted')); for(const d of Object.values(mixed['droid.json']).filter(d=>ids.includes(d.id))){const orders=[d['order/stats'],...Array.from({length:d['orderList/size']||0},(_,i)=>d['orderList/'+i+'/stats'])];assert.ok(orders.includes('A0ResearchFacility'),'switching item keeps the facility order');assert.ok(orders.includes('A0FacMod1'),'module appends to the native queue');}
 await screen('delivery-mixed-queue');
 await tap('#wt-open-queue');await until('__warzoneCommands.report().page==="queue"','queue screen');await settle();await screen('delivery-queue-details');
 await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await sleep(350);
 const paused=await evaluate('({time:__warzoneCommands.report().snapshot.gameTime,text:parent.document.getElementById("wt-live-queue").textContent})');await sleep(1200);assert.deepEqual(await evaluate('({time:__warzoneCommands.report().snapshot.gameTime,text:parent.document.getElementById("wt-live-queue").textContent})'),paused,'time display freezes with native simulation');
 await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await until(`__warzoneCommands.report().snapshot.gameTime>${paused.time}`,'native resume');await tap('#wt-command-pages [data-action="back"]');await settle();
 results.cases.push('scrolling catalogue, fixed footer, genuine artwork, three native builders, two FIFO orders, duplicate rejection, live ETA, pause/resume, queue return');
 }
 // Production runs while the ordinary native construction jobs finish.
 await tap('#wt-open-factory');await settle();await tap('[data-produce-template="ConstructionDroid"]');await settle();await screen('delivery-normal-production');
 await tap('#wt-open-design');await until('__warzoneCommands.report().page==="design"','designer');
 await tap('[data-part="Body1REC"]');await tap('[data-step="propulsion"]');await tap('[data-part="wheeled01"]');await tap('[data-step="0"]');await tap('[data-part="MG1Mk1"]');
 await until('!parent.document.getElementById("wt-save-design").disabled','native-valid design');await tap('#wt-design-name');let keyboard=false;for(let i=0;i<30;i++){if(/mInputShown=true|isInputViewShown=true/.test(adb('shell','dumpsys','input_method').toString())){keyboard=true;break;}await sleep(100);}assert.ok(keyboard,'Android keyboard must be visibly open before Back');await screen('delivery-keyboard-visible');adb('shell','input','keyevent','4');await until('parent.innerWidth===1280&&parent.innerHeight===576','viewport restored after Android keyboard');assert.deepEqual(await evaluate('[parent.innerWidth,parent.innerHeight]'),[1280,576]);
 await tap('#wt-save-design');await until('__warzoneCommands.report().page==="saved"','saved design');await screen('delivery-saved-design');const savedId=await evaluate('__warzoneCommands.report().saved.at(-1).id');await tap('[data-produce-design="'+savedId+'"]');await settle();await tap('[data-produce="'+savedId+'"]');await settle();
 await evaluate('__warzoneCommands.open("design");true');await until('__warzoneCommands.report().page==="design"','rapid navigation source');await settle();
 await evaluate('__warzoneCommands.open("build");__warzoneCommands.open("build");true');await until('__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().buildingOpening','double Build request resolves to one visible sidebar');await settle();await tap('#wt-open-factory');await settle();await tap('#wt-command-pages [data-action="back"]');await settle();
 for(let i=0;i<2;i++){
  await tap('#blocknight-tech');await until('__blockNightResearch.report().open','research open');await tap('.bn-tech-lab[data-lab="1"]');await tap('.bn-tech-lab[data-lab="0"]');await screen('delivery-research-return-'+i);await tap('.bn-tech-done');await settle();
  await tap('#wt-open-factory');await settle();await tap('#wt-command-pages [data-action="back"]');await settle();
 }
 await until('__warzoneCommands.report().snapshot.finishedUnits.length>=2','ordinary factory truck/combat completion',60000);
 await until('__warzoneCommands.report().snapshot.construction.length===0&&__warzoneCommands.report().snapshot.factories.find(f=>f.id===160167)?.modules===2&&__warzoneCommands.report().snapshot.factories.find(f=>f.id===160167)?.ready','mixed native construction and module completion',90000);
 complete=await save('delivery-native-completed');
 }else complete=JSON.parse(fs.readFileSync(path.join(out,'delivery-native-completed.json'),'utf8'));
 if(!compactOnly&&!controlsOnly&&!largeOnly){
 for(const y of [5056,5312])assert.ok(Object.values(complete['struct.json']).some(s=>s.player===0&&s.name==='GuardTower1'&&s.position[0]===960&&s.position[1]===y&&(s.status??1)===1&&s.currentBuildPts>=300),'native completion at queued site');
 assert.ok(Object.values(complete['struct.json']).some(s=>s.name==='A0ResearchFacility'&&s.position[0]===1024&&s.position[1]===4864&&s.currentBuildPts>=500),'native 2x2 completion');assert.ok(Object.values(complete['struct.json']).some(s=>s.id===160167&&s.modules===2),'native factory-module completion');
 const unit=complete.commands.snapshot.finishedUnits[0],truck=Object.values(complete['droid.json']).find(d=>d.id===unit.id);assert.ok(truck);
 await map(60,3);await world(truck.position[0],truck.position[1],truck.position[2]);await settle();const selected=await save('delivery-produced-selected');assert.ok(Object.values(selected['droid.json']).some(d=>d.id===truck.id&&d.selected),'produced unit selected by field tap');
 await tile(55,8);await settle();const moving=await save('delivery-produced-moving'),moved=Object.values(moving['droid.json']).find(d=>d.id===truck.id);assert.equal(moved['order/type'],2,'ordinary MOVE order');
 await until(`(()=>{const s=__warzoneCommands.report().snapshot.trucks.find(t=>t.id===${truck.id});return s&&Math.hypot(s.x-${truck.position[0]/128},s.y-${truck.position[1]/128})>.5;})()`,'native produced truck moves',12000);await screen('delivery-movement-restored');
 results.cases.push('native construction completion, mixed tower/facility/module queue and completion, ordinary factory production, valid design/save, Android keyboard return, repeated research/factory/battle returns, produced-unit selection and movement');
 }

 if(!largeOnly){
 // Expanded commands operate the ordinarily produced units.
 const combat=complete.commands.snapshot.finishedUnits[1];assert.ok(combat,'ordinary combat production');
 await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="true"','expand unit commands');await tap('#blocknight-select-all');await settle();
 await until('__warzoneCommands.report().snapshot.selectedUnits.some(u=>u.id==='+combat.id+')','All Units selects combat unit');assert.equal(await evaluate('parent.document.body.dataset.fieldExpanded'),'false','action collapses compact controls');
 await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="true"','expand patrol');await tap('#blocknight-auto-fight');await settle();await tile(55,5);await until('__warzoneCommands.report().snapshot.selectedUnits.some(u=>u.id==='+combat.id+'&&u.order===31)','native patrol begins after destination tap');const patrol=await save('delivery-patrol-native');results.patrolOrder=Object.values(patrol['droid.json']).find(d=>d.id===combat.id)['order/type'];assert.equal(results.patrolOrder,31,'native PATROL order active');
 await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="true"','expand stop');await tap('#blocknight-stop');await settle();await until('__kalaWarzoneTouch.report().stoppedUnitIds.includes('+combat.id+')&&__warzoneCommands.report().snapshot.selectedUnits.every(u=>[0,25,41].includes(u.order))','native STOP returns to idle/guard');const stopped=await save('delivery-stopped-native'),stoppedDroid=Object.values(stopped['droid.json']).find(d=>d.id===combat.id);assert.equal(stoppedDroid.action,0);assert.equal(stoppedDroid['orderList/size']||0,0);
 await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="true"','expand trucks');await tap('#wt-select-trucks');await settle();await until('__warzoneCommands.report().snapshot.selectedUnits.length>=3&&__warzoneCommands.report().snapshot.selectedUnits.every(u=>u.constructor)','nearby truck selection');

 const boxState=await save('delivery-before-box'),target=Object.values(boxState['droid.json']).find(d=>d.id===combat.id);assert.ok(!target.selected,'combat unit is unselected before box gesture');
 await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="true"','expand box');await tap('#blocknight-box-select');await until('__kalaWarzoneTouch.report().boxMode','box mode armed');
 const boxPoint=await evaluate(`(()=>{WarzoneTerrain.active(true);const p=WarzoneTerrain.project(${target.position[0]},${target.position[1]},${target.position[2]}),r=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y,w:parent.innerWidth,h:parent.innerHeight};})()`);assert.ok(boxPoint.x>280&&boxPoint.x<boxPoint.w-230&&boxPoint.y>90&&boxPoint.y<boxPoint.h-80,'box fixture in clear visible field');
 const boxPng=adb('exec-out','screencap','-p'),sx=boxPng.readUInt32BE(16)/boxPoint.w,sy=boxPng.readUInt32BE(20)/boxPoint.h;adb('shell','input','swipe',String(Math.round((boxPoint.x-28)*sx)),String(Math.round((boxPoint.y-30)*sy)),String(Math.round((boxPoint.x+28)*sx)),String(Math.round((boxPoint.y+30)*sy)),'450');
 await until('__warzoneCommands.report().snapshot.selectedUnits.some(u=>u.id==='+combat.id+')','box selects actual produced combat unit');await save('delivery-box-selected-native');
 await build();await choose('GuardTower6');await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="true"','expand select/move');await tap('#wt-select-move');await until('!__warzoneCommands.report().nativeHudHidden&&!__warzoneCommands.report().nativeMenu&&!__warzoneCommands.report().buildOpen','Select/Move exits placement and restores map');
 results.cases.push('collapsed controls expand, real combat selection/patrol/STOP and nearby truck selection, BOX and Select/Move');
 // Compact viewport is a separate relevant layout/input regression pass.

 adb('shell','wm','size','900x1620');adb('shell','wm','density','240');adb('shell','wm','user-rotation','lock','1');
 await until('parent.innerWidth===1080&&parent.innerHeight===600','compact viewport');await sleep(900);await build();await layout('delivery-compact-build');await choose('GuardTower6');await layout('delivery-compact-placement');await closeBuild();
 await tap('#blocknight-tech');await until('__blockNightResearch.report().open','compact research');await screen('delivery-compact-research');await tap('.bn-tech-done');await settle();await layout('delivery-compact-battle');
 results.cases.push('1080x600 compact sidebar, placement, field controls, top bar, research and return');
 }
 if(largeOnly)results.largeFreshOrdinaryMatch=true;
 adb('shell','wm','size','1080x2400');adb('shell','wm','density','240');await until('parent.innerWidth===1600&&parent.innerHeight===720','large viewport');await until('parent.document.body.dataset.fieldCompact==="false"&&parent.document.body.dataset.fieldExpanded==="true"','large controls remain expanded');
 await build();await until('Array.from(parent.document.querySelectorAll("#wt-sidebar-catalogue img")).every(i=>i.complete&&i.naturalWidth>0)','large artwork');
 const large=await evaluate(`(()=>{const d=parent.document,a=d.getElementById('wt-build-sidebar').getBoundingClientRect(),b=d.getElementById('wt-field-centre').getBoundingClientRect();return{sidebarBottom:a.bottom,controlsTop:b.y,controlsBottom:b.bottom,width:parent.innerWidth,height:parent.innerHeight};})()`);assert.ok(large.sidebarBottom<large.controlsTop);assert.ok(large.controlsBottom<large.height);await screen('delivery-large-expanded');await tap('#wt-field-toggle');await until('parent.document.body.dataset.fieldExpanded==="false"','large controls manually collapse');await screen('delivery-large-collapsed');results.large=large;
 const anchor=await evaluate('__warzoneCommands.report().snapshot.trucks.find(t=>t.selected)');assert.ok(anchor);await map(anchor.x,anchor.y);
 const candidates=anchor.x<32?[[7,39],[8,40],[9,41]]:[[56,8],[55,10],[56,11]];let autoSite;
 for(const [x,y] of candidates){const v=await evaluate(`__warzoneCommands.send('preview-build',{itemId:'A0TankTrap',x:${x},y:${y}})`);if(v.ok){autoSite={x,y};break;}}assert.ok(autoSite,'reachable automatic-completion fixture');
 await choose('A0TankTrap');await tile(autoSite.x,autoSite.y);await until('__warzoneCommands.report().snapshot.construction.some(s=>s.itemId==="A0TankTrap"&&s.workers>0)','real construction starts before automatic exit');await screen('delivery-auto-completion-building');
 await until('!__warzoneCommands.report().nativeMenu&&!__warzoneCommands.report().nativeHudHidden&&!__warzoneCommands.report().buildOpen','automatic completion clears tool and restores minimap',35000);const auto=await save('delivery-auto-completed-native');assert.ok(Object.values(auto['struct.json']).some(s=>s.name==='A0TankTrap'&&s.position[0]===autoSite.x*128+64&&s.position[1]===autoSite.y*128+64&&(s.status??1)===1));assert.equal(auto.commands.nativeToolReady,false);assert.equal(auto.commands.nativeItem,'');await screen('delivery-auto-completion-restored');await build();assert.equal(await evaluate('parent.document.querySelectorAll("#wt-sidebar-catalogue button.active").length'),0,'reopened catalogue has no stale selected card');await closeBuild();results.cases.push('1600x720 expanded/collapsed console, actual construction and automatic placement/minimap restoration');

 const apk=path.join(root,'app/build/outputs/apk/debug/app-debug.apk');results.apkSHA256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
 const apkPath=adb('shell','pm','path','com.rbabbit.warzonetowers').toString().trim().replace(/^package:/,'');results.installedSHA256=adb('shell','sha256sum',apkPath).toString().split(/\s/)[0];assert.equal(results.installedSHA256,results.apkSHA256);
 results.quietHudViolations=await evaluate('parent.__quietHudViolations');assert.deepEqual(results.quietHudViolations,[]);assert.equal(results.errors.length,0,JSON.stringify(results.errors));results.passed=true;results.finishedAt=new Date().toISOString();
 fs.writeFileSync(path.join(out,'delivery-results.json'),JSON.stringify(results,null,2));
 await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');
 console.log('PASS:',results.cases.join('; '));
}
main().then(()=>socket?.close()).catch(async e=>{results.failure=String(e.stack||JSON.stringify(e));fs.writeFileSync(path.join(out,'delivery-failure.json'),JSON.stringify(results,null,2));try{await screen('delivery-failure');const t=await evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await sleep(1300);if(await evaluate('__warzoneTowersWaves.report().snapshot.gameTime')>t){await evaluate('__warzoneCommands.selectMode()');await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');}}catch(_){}console.error(e);socket?.close();process.exitCode=1;});
