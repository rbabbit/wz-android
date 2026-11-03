'use strict';
// Real Android touches plus native QuickSave order lists; wrapper counters alone
// are not treated as proof that the engine accepted a build queue.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {adb}=require('./android-sdk.cjs');
const device=process.env.WZ_QA_DEVICE||'emulator-5554',out=path.resolve(__dirname,'..',process.env.WZ_QA_OUTPUT||'qa/v4.9');
const socket=new WebSocket(fs.readFileSync(path.join(__dirname,'live-cdp-url.txt'),'utf8').trim());
let id=0;const pending=new Map();
socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data)),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(m.error):p.resolve(m.result)}});
function connectionFailed(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('WebView debugger disconnected'))}pending.clear()}
socket.addEventListener('close',connectionFailed);socket.addEventListener('error',connectionFailed);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function run(...args){return execFileSync(adb,['-s',device,...args],{maxBuffer:24*1024*1024,timeout:20000})}
async function evaluate(expression,engine=true){const n=++id;const r=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(n);reject(Error('WebView evaluation timed out: '+expression.slice(0,120)))},15000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression:engine?`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(expression)})`:expression,returnByValue:true,awaitPromise:true}}))});if(r.exceptionDetails)throw r.exceptionDetails;return r.result.value}
function windowBounds(){const dump=run('shell','dumpsys','window','windows').toString();const sections=dump.split(/\n\s*Window #\d+ /);const app=sections.find(s=>/^Window\{[^\n]*com\.rbabbit\.warzonetowers\/com\.rbabbit\.blocknight\.warzone\.MainActivity\}/.test(s));const m=app?.match(/Frames:.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);if(!m)throw Error('Cannot locate actual app frame');return m.slice(1).map(Number)}
async function hostTap(x,y){const [w,h]=await evaluate('[innerWidth,innerHeight]',false),[l,t,r,b]=windowBounds();run('shell','input','tap',String(Math.round(l+x*(r-l)/w)),String(Math.round(t+y*(b-t)/h)));await wait(450)}
async function tap(x,y){const p=await evaluate(`(()=>{const r=document.getElementById('warzone-game-frame').getBoundingClientRect();return [r.x+${x},r.y+${y}]})()`,false);await hostTap(...p)}
async function button(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:"nearest",inline:"nearest"})`,false);await wait(100);const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing button');const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`,false);await hostTap(...p);if(selector==='#blocknight-stop'){for(let i=0;i<120;i++){if(!await evaluate('__kalaWarzoneTouch.report().stopPending'))return;await wait(25)}throw Error('STOP acknowledgement did not arrive')}if(selector==='#blocknight-music'){const deadline=Date.now()+90000;while(Date.now()<deadline){if(!await evaluate('__kalaWarzoneTouch.report().musicOpening'))return;await wait(100)}throw Error('Music menu transition did not finish')}}
async function swipe(x1,y1,x2,y2,duration=300){const [w,h]=await evaluate('[innerWidth,innerHeight]',false),f=await evaluate("document.getElementById('warzone-game-frame').getBoundingClientRect().toJSON()",false),[l,t,r,b]=windowBounds();const point=(x,y)=>[Math.round(l+(f.x+x)*(r-l)/w),Math.round(t+(f.y+y)*(b-t)/h)];run('shell','input','swipe',...point(x1,y1).map(String),...point(x2,y2).map(String),String(duration));await wait(450)}
function shot(name){fs.writeFileSync(path.join(out,name+'.png'),run('exec-out','screencap','-p'))}
async function save(name){
 for(let i=0;i<120;i++){if(!await evaluate('__kalaWarzoneTouch.report().pendingClicks||0'))break;await wait(50)}
 const before=await evaluate("(()=>{try{return LaunchedModule.FS.stat((LaunchedModule.WZVAL_configDirPath||'/warzone2100')+'/savegames/skirmish/QuickSave/droid.json').mtime.getTime()}catch(_){return 0}})()");
 await evaluate('__kalaWarzoneTouch.nativePressKey("F7","F7",118);true');
 let fresh=false;for(let i=0;i<60;i++){await wait(100);const stamp=await evaluate("(()=>{try{return LaunchedModule.FS.stat((LaunchedModule.WZVAL_configDirPath||'/warzone2100')+'/savegames/skirmish/QuickSave/droid.json').mtime.getTime()}catch(_){return 0}})()");if(stamp>before){fresh=true;break}}
 if(!fresh)throw Error('Native QuickSave did not update; refusing to use stale order data');
 await wait(150);
 const state=await evaluate(`(()=>{const m=LaunchedModule,p=(m.WZVAL_configDirPath||'/warzone2100')+'/savegames/skirmish/QuickSave';const names=m.FS.readdir(p);const result={touch:__kalaWarzoneTouch.report(),wave:__warzoneTowersWaves.report().snapshot,files:names};for(const f of names){if(f.endsWith('.json')){try{result[f]=JSON.parse(m.FS.readFile(p+'/'+f,{encoding:'utf8'}))}catch(_){}}}return result})()`);
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(state,null,2));
 // Saving can briefly suspend native simulation after the files appear. Never
 // fire a short camera gesture into that pause and call the lost motion a bug.
 if(!state.touch.musicOpen&&state.wave?.phase!=='defeated'){
  let resumed=false;for(let i=0;i<100;i++){if(await evaluate(`(__warzoneTowersWaves.report().snapshot?.gameTime||0)>${state.wave?.gameTime||0}`)){resumed=true;break}await wait(100)}
  if(!resumed)throw Error('The native battle did not resume after QuickSave');
 }
 return state;
}
function builders(state){return Object.values(state['droid.json']).filter(d=>d.player===0&&d.droidType===3)}
function buildPlan(state){const plan=new Set();for(const d of builders(state)){for(const prefix of ['order',...Array.from({length:d['orderList/size']||0},(_,i)=>'orderList/'+i)]){if(d[prefix+'/type']===4)plan.add(d[prefix+'/stats']+'@'+d[prefix+'/pos'].join(','))}}for(const s of Object.values(state['struct.json']))if(s.player===0&&/GuardTower|PillBox|WallTower|Emplacement|Howitzer|Cannon|MG/i.test(s.name||''))plan.add(s.name+'@'+s.position.slice(0,2).join(','));return plan}
async function waitReady(){const deadline=Date.now()+180000;while(Date.now()<deadline){try{if(await evaluate("(()=>{const t=document.getElementById('warzone-game-frame')?.contentWindow?.__kalaWarzoneTouch;return Boolean(t?.report().hudVisible&&!t?.report().cameraFacingPending&&document.getElementById('warzone-game-frame').contentWindow.__warzoneTowersWaves?.report().snapshot?.phase!=='defeated')})()",false))return}catch(error){if(!String(error.message).includes('evaluation timed out'))throw error}await wait(500)}throw Error('Battlefield did not become ready')}
async function dismissPreparation(){
 for(let i=0;i<50;i++){if(await evaluate("Boolean(document.getElementById('warzone-towers-preparation'))",false))break;await wait(100)}
 for(let i=0;i<10;i++){
  if(!await evaluate("Boolean(document.getElementById('warzone-towers-preparation')?.open)",false))return;
  await button('#warzone-towers-preparation button');await wait(250);
 }
 throw Error('Preparation dialog did not close; refusing to send gameplay gestures behind it');
}
async function screenshot(name){fs.writeFileSync(path.join(out,name+'.png'),run('exec-out','screencap','-p'));}
async function snapshot(name){const report=await evaluate('__warzoneCommands.report()');fs.writeFileSync(path.join(out,name+'-commands.json'),JSON.stringify(report,null,2));return report;}
async function settle(){for(let i=0;i<50;i++){if(!await evaluate('__warzoneCommands.report().pending'))return;await wait(200)}throw Error('command replies did not settle');}
async function engineButton(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing engine button');const r=e.getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2]})()`);await tap(...p);}
async function mapTo(x,y){const [w,h]=await evaluate('[innerWidth,innerHeight]');await tap(w-24-192+(64-x)*3,h-24-192+(64-y)*3);await wait(1800);}
async function projectTile(x,y,height=256){const p=await evaluate(`WarzoneTerrain.project(${(x+.5)*128},${(y+.5)*128},${height})`);if(!p)throw Error('Projection unavailable');return[p.x,p.y];}
async function touch(x,y){
 const p=await evaluate(`(()=>{const r=document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:r.x+${x},y:r.y+${y}}})()`,false);
 const request=(method,params)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(Error('touch timeout')),5000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});
 await request('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1,radiusX:2,radiusY:2}]});await wait(30);
 await request('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function rawTouch(type,points){
 const offset=await evaluate(`(()=>{const r=document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:r.x,y:r.y}})()`,false);
 const n=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('gesture timeout')),5000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method:'Input.dispatchTouchEvent',params:{type,touchPoints:points.map((p,i)=>({x:p[0]+offset.x,y:p[1]+offset.y,id:i+1,radiusX:2,radiusY:2}))}}));});
}
async function gesture(start,end){await rawTouch('touchStart',start);await wait(80);for(let k=1;k<=6;k++){await rawTouch('touchMove',start.map((p,i)=>[p[0]+(end[i][0]-p[0])*k/6,p[1]+(end[i][1]-p[1])*k/6]));await wait(110);}await rawTouch('touchEnd',[]);await wait(400);}
async function cdp(method,params){const n=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(method+' timeout')),10000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});}
async function mouseAt(x,y,pointerType='mouse'){
 const offset=await evaluate(`(()=>{const r=document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:r.x,y:r.y}})()`,false);
 const point={x:x+offset.x,y:y+offset.y,button:'left',clickCount:1,pointerType};
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...point});await wait(50);await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...point});await wait(800);
}
async function selectNative(selector,label){
 await button(selector);
 execFileSync(process.env.WZ_PYTHON||'C:/Users/punke/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[path.join(__dirname,'native-choice.py'),label],{env:{...process.env,WZ_QA_DEVICE:device},timeout:25000});await wait(250);
}
async function typeName(text){
 await button('#wt-design-name');await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
 await cdp('Input.insertText',{text});run('shell','input','keyevent','KEYCODE_BACK');await wait(250);
}
async function main(){
 fs.mkdirSync(out,{recursive:true});await waitReady();await dismissPreparation();await settle();
 const action=process.argv[2]||'repro-mouse';
 if(action==='repro-mouse'){
  await button('#wt-open-build');await button('[data-build="WallTower02"]');await button('#blocknight-zoom-close');await mapTo(7,36);
  const before=await evaluate('__warzoneCommands.report().placements');const point=await projectTile(8,36);await mouseAt(...point);await settle();
  const report=await snapshot('baseline-mouse-build');await screenshot('baseline-mouse-build');
  console.log(JSON.stringify({before,after:report.placements,pointer:'mouse',terrain:report.terrain}));
 }
 if(action==='combat-fallback'){
  const assert=require('node:assert/strict'),d=(await evaluate('__warzoneCommands.report().saved'))[0];
  await button('#wt-open-factory');await button(`[data-produce="${d.id}"]`);await settle();await button('[data-action="back"]');
  let produced=false;for(let i=0;i<500;i++){if((await evaluate('__warzoneCommands.report().snapshot.finishedUnits')).length){produced=true;break;}await wait(200);}assert.ok(produced);
  await button('#wt-open-more');await button('[data-control="toggleCombatLock"]');await evaluate('__warzoneCommands.send("state")');
  assert.equal((await evaluate('__warzoneCommands.report().snapshot.trucks.filter(t=>t.selected)')).length,0);
  const native=await save('combat-selection-native');const combat=Object.values(native['droid.json']).filter(u=>u.player===0&&u.selected&&u.droidType===0);assert.ok(combat.length,'actual combat unit selected');
  await button('#wt-open-build');await button('[data-category="ALL"]');await button('[data-build="PillBox1"]');await button('#blocknight-zoom-close');await mapTo(7,36);
  let tile;for(const [x,y]of [[6,39],[6,35],[9,38],[7,40],[10,38]]){const r=await evaluate(`__warzoneCommands.send('preview-build',{itemId:'PillBox1',x:${x},y:${y}})`);if(r.ok){tile=[x,y];break;}}assert.ok(tile);
  await tap(...await projectTile(...tile));await settle();const r=await snapshot('combat-fallback'),reply=r.history.filter(h=>h.action==='queue-build').at(-1);assert.equal(reply.ok,true);assert.equal(reply.result.automatic,true);assert.equal(reply.result.workers.length,1);
  await button('[data-action="cancel-placement"]');let complete=false;for(let i=0;i<500;i++){if((await evaluate('__warzoneCommands.report().snapshot.finishedBuilds')).some(j=>j.id===reply.nonce)){complete=true;break;}await wait(200);}assert.ok(complete);await save('combat-fallback-native');
  fs.writeFileSync(path.join(out,'combat-fallback-results.json'),JSON.stringify({combat:combat.map(u=>({id:u.id,name:u.name,selected:u.selected})),reply,completed:true},null,2));console.log('PASS: selected real combat unit falls back to an automatic constructor and native defence completes');
 }
 if(action==='restart'){
  const assert=require('node:assert/strict');const expected=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../qa/v4.9/design-library-results.json'),'utf8')).saved;
  const current=await evaluate('__warzoneCommands.report().saved');for(const d of expected)assert.deepEqual(current.find(s=>s.id===d.id),d);
  await button('#wt-open-design');await button('[data-page="saved"]');await button(`[data-edit="${expected[1].id}"]`);await wait(700);await settle();
  assert.equal(await evaluate('parent.document.getElementById("wt-save-design").disabled'),false);await screenshot('restart-editor');await button('[data-action="back"]');
  const graphics=await evaluate('WarzoneGraphics.report()');fs.writeFileSync(path.resolve(__dirname,'../qa/v4.9/restart-results.json'),JSON.stringify({expected,current,graphics,persisted:true,editValidated:true},null,2));console.log('PASS: all saved design identities and components survive process restart; existing design reopens and validates');
 }
 if(action==='single-truck'){
  const assert=require('node:assert/strict');await button('#blocknight-zoom-close');await mapTo(7,36);
  let selected=[];
  const trucks=await evaluate('__warzoneCommands.report().snapshot.trucks.filter(t=>t.x<20)');
  for(const t of trucks){const p=await projectTile(t.x,t.y);await tap(...p);await evaluate('__warzoneCommands.send("state")');selected=await evaluate('__warzoneCommands.report().snapshot.trucks.filter(t=>t.selected)');if(selected.length===1)break;}
  assert.equal(selected.length,1,'native battlefield tap selects one constructor');
  await button('#wt-open-build');await button('[data-category="ALL"]');await button('[data-build="PillBox1"]');
  let tile;for(const [x,y] of [[7,39],[8,40],[6,39],[9,38],[6,35]]){const r=await evaluate(`__warzoneCommands.send('preview-build',{itemId:'PillBox1',x:${x},y:${y}})`);if(r.ok){tile=[x,y];break;}}assert.ok(tile);
  await tap(...await projectTile(...tile));await settle();const report=await snapshot('single-truck'),reply=report.history.filter(h=>h.action==='queue-build').at(-1);
  assert.equal(reply.ok,true);assert.equal(reply.result.automatic,false);assert.equal(reply.result.workers.length,1);assert.equal(reply.result.workers[0],selected[0].id);
  await button('[data-action="cancel-placement"]');let complete=false;for(let i=0;i<500;i++){if((await evaluate('__warzoneCommands.report().snapshot.finishedBuilds')).some(j=>j.id===reply.nonce)){complete=true;break;}await wait(200);}assert.ok(complete);
  const native=await save('single-truck-native');fs.writeFileSync(path.join(out,'single-truck-results.json'),JSON.stringify({selected,reply,completed:true},null,2));console.log('PASS: native battlefield tap selects one truck; that truck builds and completes the selected defence');
 }
 if(action==='pages'){
  const assert=require('node:assert/strict');
  for(let i=0;i<4;i++){
   for(const selector of ['#wt-open-design','[data-page="saved"]','[data-page="factory"]','[data-page="queue"]','[data-page="more"]','[data-page="build"]'])await button(selector);
   await button('[data-action="back"]');await button('#wt-open-stats');await button('#wt-open-build');await settle();
   assert.equal(await evaluate('__warzoneCommands.report().page'),'build');assert.equal(await evaluate('parent.document.getElementById("wt-native-back").hidden'),true);
  }
  await button('#wt-build-search');await cdp('Input.insertText',{text:'Cannon'});await wait(100);
  assert.equal(await evaluate('parent.document.activeElement.id'),'wt-build-search');assert.equal(await evaluate('parent.document.getElementById("wt-build-search").value'),'Cannon');
  await cdp('Input.insertText',{text:' test'});assert.equal(await evaluate('parent.document.getElementById("wt-build-search").value'),'Cannon test');run('shell','input','keyevent','KEYCODE_BACK');
  await screenshot('pages-search');await button('[data-action="back"]');const r=await snapshot('pages');
  assert.equal(await evaluate('parent.document.getElementById("warzone-game-frame").inert'),false);
  fs.writeFileSync(path.join(out,'page-results.json'),JSON.stringify({cycles:4,searchFocus:true,searchTyping:true,nativeBackHidden:true,page:r.page},null,2));console.log('PASS: four repeated command-page/native-menu cycles and continuous search typing preserve page, focus and battlefield input');
 }
 if(action==='large-build'){
  const assert=require('node:assert/strict');await button('#wt-open-build');await button('[data-category="STRUCTURES"]');await button('[data-build="A0ResearchFacility"]');await button('#blocknight-zoom-close');await mapTo(7,36);
  const candidates=Array.from({length:99},(_,i)=>[3+i%9,30+Math.floor(i/9)]),checks=[];let tile;
  for(const [x,y] of candidates){const r=await evaluate(`__warzoneCommands.send('preview-build',{itemId:'A0ResearchFacility',x:${x},y:${y}})`);checks.push({x,y,r});if(r.ok){tile=[x,y];break;}}
  assert.ok(tile,JSON.stringify(checks));await mapTo(...tile);const p=await projectTile(...tile);await tap(...p);await settle();const r=await snapshot('large-build-queued'),reply=r.history.filter(h=>h.action==='queue-build').at(-1);assert.ok(reply.ok,JSON.stringify(reply));
  await button('[data-action="cancel-placement"]');let done=false;for(let i=0;i<700;i++){if((await evaluate('__warzoneCommands.report().snapshot.finishedBuilds')).some(j=>j.id===reply.nonce)){done=true;break;}await wait(200);}
  assert.ok(done,'2x2 structure must finish');const native=await save('large-build-native');const structures=Object.values(native['struct.json']).filter(s=>s.player===0&&s.name==='A0ResearchFacility');assert.ok(structures.length);await snapshot('large-build-completed');
  fs.writeFileSync(path.join(out,'large-build-results.json'),JSON.stringify({tile,checks,structures},null,2));console.log('PASS: real touch places 2x2 research facility and native simulation completes it');
 }
 if(action==='inputs'){
  const assert=require('node:assert/strict');await button('#wt-open-build');await button('[data-build="PillBox1"]');await button('#blocknight-zoom-close');await mapTo(7,36);
  const results=[];
  for(const [i,kind] of ['mouse','pen','touch-drift'].entries()){
   const p=await projectTile(6+i,39),before=await evaluate('__warzoneCommands.report().placements');
   if(kind==='touch-drift'){await rawTouch('touchStart',[p]);await rawTouch('touchMove',[[p[0]+11,p[1]]]);await rawTouch('touchEnd',[]);}else await mouseAt(...p,kind);
   await settle();const r=await snapshot('input-'+kind);assert.equal(r.placements,before+1);const reply=r.history.filter(h=>h.action==='queue-build').at(-1);assert.equal(reply.ok,true,JSON.stringify(reply));results.push({kind,reply});
  }
  await button('[data-action="cancel-placement"]');await save('inputs-native');await screenshot('inputs');
  fs.writeFileSync(path.join(out,'input-results.json'),JSON.stringify(results,null,2));console.log('PASS: trusted mouse, pen and 11px drifting touch each enqueue exactly one native build');
 }
 if(action==='production'){
  const assert=require('node:assert/strict');const designs=await evaluate('__warzoneCommands.report().saved');const d=designs.find(d=>d.name.startsWith('QA '));assert.ok(d);
  await button('#wt-open-factory');await selectNative('#wt-produce-count','5');
  const factories=await evaluate('__warzoneCommands.report().snapshot.factories.filter(f=>f.ready)');assert.ok(factories.length>=2);
  await button(`[data-produce="${d.id}"]`);await settle();
  await selectNative('#wt-factory-select',`${factories[1].kind||'Factory'} ${factories[1].number} · ${factories[1].modules} module${factories[1].modules===1?'':'s'}`);
  assert.equal(await evaluate('parent.document.getElementById("wt-produce-count").value'),'5','quantity survives factory change');
  await button(`[data-produce="${d.id}"]`);await settle();await button('[data-action="back"]');
  let complete=false;for(let i=0;i<700;i++){const units=await evaluate('__warzoneCommands.report().snapshot.finishedUnits');if(factories.slice(0,2).every(f=>units.some(u=>u.factoryId===f.id))){complete=true;break;}await wait(200);}
  assert.ok(complete,'both factories deliver actual native units');const native=await save('production-native');const units=Object.values(native['droid.json']).filter(u=>u.player===0&&u.name?.startsWith(d.name));assert.ok(units.length>=2);
  assert.ok(units.every(u=>u.parts.body===d.body&&u.parts.propulsion===d.propulsion&&u.parts['weapon/1']===d.turrets[0]));
  await snapshot('production');await screenshot('production');fs.writeFileSync(path.join(out,'production-results.json'),JSON.stringify({design:d,units:units.map(u=>({id:u.id,name:u.name,parts:u.parts})),quantityPreserved:true},null,2));console.log('PASS: native quantity selection retained across factory change; both factories produce tanks with the saved parts');
 }
 if(action==='design-library'){
  const assert=require('node:assert/strict');
  const prefix='QA '+Date.now();
  async function create(name){
   await button('[data-action="new-design"]');await typeName(name);
   await selectNative('#wt-design-body','Viper');await selectNative('#wt-design-propulsion','Wheels');await selectNative('[data-turret="0"]','Light Cannon');
   await wait(700);await settle();assert.equal(await evaluate("parent.document.getElementById('wt-save-design').disabled"),false);
   await button('#wt-save-design');await settle();
   return (await evaluate('__warzoneCommands.report().saved')).find(d=>d.name===name);
  }
  await button('#wt-open-design');const first=await create(prefix+' A');assert.ok(first);
  const second=await create(prefix+' B');assert.ok(second);assert.notEqual(first.id,second.id);
  await button(`[data-edit="${first.id}"]`);await typeName(prefix+' A edited');await wait(700);await settle();await button('#wt-save-design');await settle();
  let saved=await evaluate('__warzoneCommands.report().saved');assert.equal(saved.find(d=>d.id===second.id).name,prefix+' B');assert.equal(saved.find(d=>d.id===first.id).name,prefix+' A edited');
  await button(`[data-edit="${first.id}"]`);await wait(700);await settle();await button('#wt-save-as-new');await settle();
  saved=await evaluate('__warzoneCommands.report().saved');assert.equal(saved.filter(d=>d.name===prefix+' A edited').length,2);
  const report=await snapshot('design-library');await screenshot('design-library');
  fs.writeFileSync(path.join(out,'design-library-results.json'),JSON.stringify({first,second,saved:report.saved,realNativeSelectors:true},null,2));
  console.log('PASS: two designs created with native pickers, edit preserves second, Save as New preserves original');
 }
 if(action==='repro-design'){
  await evaluate(`parent.__wtInputAudit=[];for(const type of ['input','change','focusin','focusout'])parent.document.addEventListener(type,e=>{if(e.target.closest?.('#wt-design-form'))parent.__wtInputAudit.push({type,id:e.target.id,turret:e.target.dataset.turret,value:e.target.value,trusted:e.isTrusted})},true);true`);
  await button('#wt-open-design');await typeName('Real Picker Cannon');await selectNative('#wt-design-body','Viper');await selectNative('#wt-design-propulsion','Wheels');await selectNative('[data-turret="0"]','Light Cannon');
  await wait(1200);await settle();
  const result=await evaluate(`({name:parent.document.getElementById('wt-design-name').value,disabled:parent.document.getElementById('wt-save-design').disabled,message:parent.document.getElementById('wt-design-valid').textContent,events:parent.__wtInputAudit,canStartNew:!!parent.document.querySelector('[data-action="new-design"]'),snapshot:__warzoneCommands.report()})`);
  fs.writeFileSync(path.join(out,'baseline-real-design.json'),JSON.stringify(result,null,2));await screenshot('baseline-real-design');console.log(JSON.stringify({disabled:result.disabled,message:result.message,newButton:result.canStartNew,events:result.events}));
 }
}
socket.addEventListener('open',()=>main().then(()=>socket.close()).catch(e=>{console.error(e);socket.close();process.exitCode=1;}));
