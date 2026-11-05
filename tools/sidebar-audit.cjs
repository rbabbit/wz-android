'use strict';
// Real Android input, screenshots and fresh native saves on the installed APK.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa/v5.5');
const device=process.env.WZ_QA_DEVICE||'emulator-5556';
const adbExe=path.join(process.env.ANDROID_HOME||'C:/Users/punke/AppData/Local/Android/Sdk','platform-tools/adb.exe');
const adb=(...args)=>execFileSync(adbExe,['-s',device,...args],{timeout:20000,maxBuffer:20*1024*1024});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results={device,seeded:false,screens:[],cases:[],errors:[]};
const screensResume=process.argv.includes('--screens');
const mixedResume=process.argv.includes('--mixed');
const compactOnly=process.argv.includes('--compact'),continuation=process.argv.includes('--continue')||compactOnly;if(continuation||mixedResume||screensResume){Object.assign(results,JSON.parse(fs.readFileSync(path.join(out,'delivery-failure.json'),'utf8')));delete results.failure;results.errors=[];}
let evaluate,socket,id=0;const pending=new Map();
async function until(expression,label,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const v=await evaluate(expression);if(v)return v;await sleep(100);}throw Error('Timed out: '+label);}
async function screen(name){fs.writeFileSync(path.join(out,name+'.png'),adb('exec-out','screencap','-p'));results.screens.push(name);}
async function pointTap(x,y){
 assert.equal(await evaluate('parent.document.visibilityState'),'visible','refuse background taps');
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
async function map(x,y){const p=await evaluate(`(()=>{const r=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:r.x+innerWidth-216+(64-${x})*3,y:r.y+innerHeight-216+(64-${y})*3};})()`);await pointTap(p.x,p.y);await sleep(500);await evaluate('WarzoneTerrain.active(true);true');}
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
 if(await evaluate('__warzoneCommands.report().buildOpen')){assert.equal(v.inert,false);assert.ok(v.sidebar.b<v.field.y);assert.ok(v.footer.b<=v.sidebar.b);assert.ok(v.grid.h>=68);assert.ok(v.images.every(i=>i.loaded));}
 fs.writeFileSync(path.join(out,name+'-layout.json'),JSON.stringify(v,null,2));await screen(name);return v;
}
async function build(){await tap('#wt-open-build');await until('__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().buildingOpening','build sidebar');await settle();}
async function choose(item,category='DEFENCES'){await tap(`#wt-build-sidebar [data-category="${category}"]`);await tap(`#wt-build-sidebar [data-build="${item}"]`);await until(`__warzoneCommands.report().nativeToolReady&&__warzoneCommands.report().nativeItem===${JSON.stringify(item)}`,'selected native structure');await settle();}
async function closeBuild(){await tap('.wt-sidebar-exit');await until('!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().nativeMenu&&!__warzoneCommands.report().exitingBuild','exit keeps orders');await settle();}
async function main(){
 const pid=adb('shell','pidof','com.rbabbit.warzonetowers').toString().trim();adb('forward','tcp:9227',`localabstract:webview_devtools_remote_${pid}`);
 const tabs=await(await fetch('http://127.0.0.1:9227/json')).json(),tab=tabs.find(t=>t.url.includes('/mobile.html'));assert.ok(tab);
 socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 socket.onmessage=e=>{const m=JSON.parse(String(e.data));if(m.method==='Runtime.exceptionThrown')results.errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error||m.result.exceptionDetails?p.reject(m.error||m.result.exceptionDetails):p.resolve(m.result.result?.value);}};
 const request=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject,timer:setTimeout(()=>reject(Error('CDP timeout')),45000)});socket.send(JSON.stringify({id:key,method,params}));});
 evaluate=expression=>request('Runtime.evaluate',{expression:`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(expression)})`,returnByValue:true,awaitPromise:true});await request('Runtime.enable');
 await until('__warzoneCommands.report().snapshot?.trucks.length>=6','ordinary native starting units',60000);
 // This run starts in the ordinary native Escape pause menu, preserving the
 // ready fixture while writing this audit. No objects/research/power are seeded.
 if(process.argv.includes('--fresh')){await until('Boolean(parent.document.getElementById("warzone-towers-preparation")?.open)','preparation dialog');await tap('#warzone-towers-preparation button');}else if(!process.argv.includes('--running')){const before=await evaluate('__warzoneCommands.report().snapshot.gameTime');await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await until(`__warzoneCommands.report().snapshot.gameTime>${before}`,'resume prepared native game');}
 let complete,ids;if(!continuation){
 if(!screensResume){
 if(!mixedResume){
 await build();await tap('#wt-build-sidebar [data-category="DEFENCES"]');const first=await layout('delivery-wide-build');assert.deepEqual(first.viewport,[1280,576]);
 assert.equal(await evaluate('__warzoneCommands.report().nativeBuildGroup.length'),3);
 const scroll=await evaluate(`(()=>{const e=parent.document.getElementById('wt-sidebar-catalogue'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,h:r.height,overflow:e.scrollHeight>e.clientHeight};})()`);assert.ok(scroll.overflow);
 const png=adb('exec-out','screencap','-p'),scale=png.readUInt32BE(16)/1280;
 adb('shell','input','swipe',String(Math.round(scroll.x*scale)),String(Math.round((scroll.y+scroll.h/3)*scale)),String(Math.round(scroll.x*scale)),String(Math.round((scroll.y-scroll.h/3)*scale)),'450');
 await until('parent.document.getElementById("wt-sidebar-catalogue").scrollTop>0','real structure-list scroll');const scrolled=await layout('delivery-wide-scroll');assert.equal(scrolled.footer.y,first.footer.y);
 await tap('#wt-build-sidebar [data-category="STRUCTURES"]');await layout('delivery-stock-base-icons');
 await choose('GuardTower1');await map(10,37);
 for(const y of [39,41]){const r=await evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:7,y:${y}})`);assert.ok(r.ok,'validate clear reachable site before tapping');await tile(7,y);}
 await until('__warzoneCommands.report().snapshot.constructionSites.length===2','both native sites journalled');
 const queued=await save('delivery-native-queued');ids=queued.commands.nativeBuildGroup;
 for(const truck of Object.values(queued['droid.json']).filter(d=>ids.includes(d.id))){assert.equal(truck['order/stats'],'GuardTower1');assert.equal(truck['orderList/size'],1);assert.equal(truck['orderList/0/stats'],'GuardTower1');assert.deepEqual(truck['orderList/0/pos'],[960,5312]);}
 await until('__warzoneCommands.report().snapshot.construction.some(b=>b.remaining>0&&b.workers>0)','live native work and estimate');await screen('delivery-live-time-and-queue');
 const timed=await evaluate('__warzoneCommands.report().snapshot.construction');results.timingSample=timed;
 await tile(7,39);await settle();assert.equal(await evaluate('__warzoneCommands.report().snapshot.constructionSites.length'),2,'duplicate site rejected');
 }else{await build();ids=await evaluate('__warzoneCommands.report().nativeBuildGroup');await map(10,37);}
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
 await tap('#wt-save-design');await until('__warzoneCommands.report().page==="saved"','saved design');await screen('delivery-saved-design');
 await evaluate('__warzoneCommands.open("design");true');await until('__warzoneCommands.report().page==="design"','rapid navigation source');await settle();
 await evaluate('__warzoneCommands.open("build");__warzoneCommands.open("build");true');await until('__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().buildingOpening','double Build request resolves to one visible sidebar');await settle();await tap('#wt-open-factory');await settle();await tap('#wt-command-pages [data-action="back"]');await settle();
 for(let i=0;i<2;i++){
  await tap('#blocknight-tech');await until('__blockNightResearch.report().open','research open');await tap('.bn-tech-lab[data-lab="1"]');await tap('.bn-tech-lab[data-lab="0"]');await screen('delivery-research-return-'+i);await tap('.bn-tech-done');await settle();
  await tap('#wt-open-factory');await settle();await tap('#wt-command-pages [data-action="back"]');await settle();
 }
 await until('__warzoneCommands.report().snapshot.finishedUnits.length>0','ordinary factory truck completion',60000);
 await until('__warzoneCommands.report().snapshot.construction.length===0&&__warzoneCommands.report().snapshot.factories.find(f=>f.id===160167)?.modules===2&&__warzoneCommands.report().snapshot.factories.find(f=>f.id===160167)?.ready','mixed native construction and module completion',90000);
 complete=await save('delivery-native-completed');
 }else complete=JSON.parse(fs.readFileSync(path.join(out,'delivery-native-completed.json'),'utf8'));
 if(!compactOnly){
 for(const y of [5056,5312])assert.ok(Object.values(complete['struct.json']).some(s=>s.player===0&&s.name==='GuardTower1'&&s.position[0]===960&&s.position[1]===y&&(s.status??1)===1&&s.currentBuildPts>=300),'native completion at queued site');
 assert.ok(Object.values(complete['struct.json']).some(s=>s.name==='A0ResearchFacility'&&s.position[0]===1024&&s.position[1]===4864&&s.currentBuildPts>=500),'native 2x2 completion');assert.ok(Object.values(complete['struct.json']).some(s=>s.id===160167&&s.modules===2),'native factory-module completion');
 const unit=complete.commands.snapshot.finishedUnits[0],truck=Object.values(complete['droid.json']).find(d=>d.id===unit.id);assert.ok(truck);
 await map(60,3);await world(truck.position[0],truck.position[1],truck.position[2]);await settle();const selected=await save('delivery-produced-selected');assert.ok(Object.values(selected['droid.json']).some(d=>d.id===truck.id&&d.selected),'produced unit selected by field tap');
 await tile(55,8);await settle();const moving=await save('delivery-produced-moving'),moved=Object.values(moving['droid.json']).find(d=>d.id===truck.id);assert.equal(moved['order/type'],2,'ordinary MOVE order');
 await until(`(()=>{const s=__warzoneCommands.report().snapshot.trucks.find(t=>t.id===${truck.id});return s&&Math.hypot(s.x-${truck.position[0]/128},s.y-${truck.position[1]/128})>.5;})()`,'native produced truck moves',12000);await screen('delivery-movement-restored');
 results.cases.push('native construction completion, mixed tower/facility/module queue and completion, ordinary factory production, valid design/save, Android keyboard return, repeated research/factory/battle returns, produced-unit selection and movement');
 }
 // Compact viewport is a separate relevant layout/input regression pass.
 adb('shell','wm','size','900x1620');adb('shell','wm','density','240');adb('shell','wm','user-rotation','lock','1');
 await until('parent.innerWidth===1080&&parent.innerHeight===600','compact viewport');await sleep(900);await build();await layout('delivery-compact-build');await choose('GuardTower6');await layout('delivery-compact-placement');await closeBuild();
 await tap('#blocknight-tech');await until('__blockNightResearch.report().open','compact research');await screen('delivery-compact-research');await tap('.bn-tech-done');await settle();await layout('delivery-compact-battle');
 results.cases.push('1080x600 compact sidebar, placement, field controls, top bar, research and return');
 const apk=path.join(root,'app/build/outputs/apk/debug/app-debug.apk');results.apkSHA256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
 const apkPath=adb('shell','pm','path','com.rbabbit.warzonetowers').toString().trim().replace(/^package:/,'');results.installedSHA256=adb('shell','sha256sum',apkPath).toString().split(/\s/)[0];assert.equal(results.installedSHA256,results.apkSHA256);
 assert.equal(results.errors.length,0,JSON.stringify(results.errors));results.passed=true;results.finishedAt=new Date().toISOString();
 fs.writeFileSync(path.join(out,'delivery-results.json'),JSON.stringify(results,null,2));
 await evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');
 console.log('PASS:',results.cases.join('; '));
}
main().then(()=>socket?.close()).catch(async e=>{results.failure=String(e.stack||JSON.stringify(e));fs.writeFileSync(path.join(out,'delivery-failure.json'),JSON.stringify(results,null,2));try{await screen('delivery-failure');}catch(_){}console.error(e);socket?.close();process.exitCode=1;});
