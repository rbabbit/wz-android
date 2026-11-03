'use strict';
// Real Android touches plus native QuickSave order lists; wrapper counters alone
// are not treated as proof that the engine accepted a build queue.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {adb}=require('./android-sdk.cjs');
const device=process.env.WZ_QA_DEVICE||'emulator-5554',out=path.resolve(__dirname,'..',process.env.WZ_QA_OUTPUT||'qa/v4.8');
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
async function main(){
 fs.mkdirSync(out,{recursive:true});await waitReady();await dismissPreparation();await settle();
 const action=process.argv[2]||'prepare';
 if(action==='prepare'){await screenshot('battle-ready');await snapshot('battle-ready');console.log('Battle ready, command bridge responding');}
 if(action==='build'){
  await button('#wt-open-build');await wait(300);await screenshot('build-page');
  await button('[data-build="WallTower02"]');await wait(500);
  const terrain=await evaluate('WarzoneTerrain.report()');console.log('terrain',JSON.stringify(terrain));
  const points=await evaluate(`(()=>{const a=[];for(let y=90;y<innerHeight-140;y+=38)for(let x=200;x<innerWidth-160;x+=40){const p=WarzoneTerrain.pick(x,y);if(p)a.push({screen:[x,y],tile:[p.x,p.y]});}return a})()`);
  fs.writeFileSync(path.join(out,'placement-points.json'),JSON.stringify(points,null,2));
  console.log('visible tiles',JSON.stringify(points.filter((p,i)=>i%5===0)));
  await screenshot('placement-ready');
 }
 if(action==='save'){const s=await save('native-'+(process.argv[3]||'state'));await snapshot('native-'+(process.argv[3]||'state'));console.log(JSON.stringify({gameTime:s.wave?.gameTime,structures:Object.values(s['struct.json']).filter(s=>s.player===0).length,droids:builders(s).map(d=>({id:d.id,selected:d.selected,order:d['order/type'],position:d.position}))}));}
 if(action==='tap'){await tap(Number(process.argv[3]),Number(process.argv[4]));await wait(700);await snapshot('after-tap');await screenshot('after-tap');}
 if(action==='button'){await button(process.argv[3]);await settle();await screenshot(process.argv[4]||'after-button');}
 if(action==='shot')await screenshot(process.argv[3]||'screen');
 if(action==='design'){
  await button('#wt-open-design');await wait(250);
  await evaluate(`(()=>{const doc=parent.document;for(const [id,value]of Object.entries({'wt-design-name':'QA Cannon','wt-design-body':'Body1REC','wt-design-propulsion':'wheeled01'})){const el=doc.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}const turret=doc.querySelector('[data-turret="0"]');turret.value='Cannon1Mk1';turret.dispatchEvent(new Event('input',{bubbles:true}));turret.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await settle();await wait(500);await screenshot('design-valid');
  await button('#wt-save-design');await settle();await screenshot('saved-designs');await snapshot('saved-designs');
 }
 if(action==='produce'){
  await button('#wt-open-factory');await wait(350);await screenshot('factory-page');
  const selector=await evaluate(`'[data-produce="'+__warzoneCommands.report().saved[0].id+'"]'`);
  await button(selector);await settle();await snapshot('production-start');await screenshot('production-start');
 }
 if(action==='final-design'){
  const assert=require('node:assert/strict');
  const library=await evaluate('__warzoneCommands.report().saved');assert.ok(library.length,'saved library survives process/APK restart');
  await button('#wt-open-design');await button('[data-page="saved"]');await button(`[data-edit="${library[0].id}"]`);await settle();
  const name='Native Cannon v48';
  await evaluate(`(()=>{const e=parent.document.getElementById('wt-design-name');e.value=${JSON.stringify(name)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await wait(400);await settle();await screenshot('final-design-valid');await button('#wt-save-design');await settle();
  const saved=await evaluate('__warzoneCommands.report().saved');assert.equal(saved.length,library.length,'editing updates the same blueprint');assert.equal(saved[0].name,name);
  await screenshot('final-saved-library');await snapshot('final-saved-library');
  await button('[data-page="factory"]');await wait(200);
  await evaluate(`parent.document.getElementById('wt-produce-count').value='5';true`);
  await button(`[data-produce="${saved[0].id}"]`);await settle();
  let report=await snapshot('final-factory-first');const factories=report.snapshot.factories;assert.ok(factories.length>=2);
  await evaluate(`(()=>{const e=parent.document.getElementById('wt-factory-select');e.value=${JSON.stringify(String(factories[1].id))};e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await button(`[data-produce="${saved[0].id}"]`);await settle();await screenshot('final-two-factories');
  console.log('Saved design edited and queued at two real factories; waiting for native units');
  await button('[data-action="back"]');let complete=false;
  for(let i=0;i<350;i++){
   const finished=await evaluate('__warzoneCommands.report().snapshot.finishedUnits');
   if(finished.filter(d=>d.factoryId===factories[0].id).length>=2&&finished.some(d=>d.factoryId===factories[1].id)){complete=true;break;}
   await wait(200);
  }
  assert.equal(complete,true,'both factories must deliver units without cancelling each other');
  const s=await save('final-produced-units');report=await snapshot('final-produced-units');
  const native=Object.values(s['droid.json']).filter(d=>d.player===0&&d.droidType===0&&d.name.startsWith(name));assert.ok(native.length>=3,'real native tank objects required');
  assert.ok(native.every(d=>d.parts.body==='Body1REC'&&d.parts.propulsion==='wheeled01'&&d.parts['weapon/1']==='Cannon1Mk1'));
  fs.writeFileSync(path.join(out,'design-production-results.json'),JSON.stringify({persistedBeforeTest:library[0],edited:saved[0],nativeUnits:native.map(d=>({id:d.id,name:d.name,parts:d.parts})),finished:report.snapshot.finishedUnits},null,2));
  console.log('PASS: saved library survives restart, reopens/edits without duplication, and two native factories deliver real tanks');
 }
 if(action==='matrix'){
  const assert=require('node:assert/strict');
  await button('#wt-open-build');await button('[data-category="ALL"]');await button('[data-build="WallTower02"]');await button('#blocknight-zoom-close');await mapTo(7,36);
  const historyStart=await evaluate('__warzoneCommands.report().history.length');
  const results=[];
  const sites=JSON.parse(process.env.WZ_QA_SITES||'[[8,36],[9,36],[8,38]]');
  for(const tile of sites){const p=await projectTile(...tile);assert.ok(p[1]>30&&p[1]<await evaluate('innerHeight-55'));await tap(...p);}
  await settle();let report=await snapshot('matrix-automatic');
  const accepted=report.history.slice(historyStart).filter(r=>r.action==='queue-build'&&r.ok);assert.equal(accepted.length,3,'three real touches must queue three builds');
  assert.equal(new Set(accepted.map(r=>r.result.workers[0])).size,1,'same automatic builder stays assigned');
  results.push({case:'automatic-three',accepted:accepted.map(r=>r.result)});
  console.log('Three automatic placements queued; waiting for actual native completion');
  let complete=false;for(let i=0;i<300;i++){const ids=await evaluate('__warzoneCommands.report().snapshot.finishedBuilds.map(j=>j.id)');if(accepted.every(r=>ids.includes(r.nonce))){complete=true;break;}await wait(200);}
  assert.equal(complete,true,'three queued builds must actually complete');await save('matrix-automatic-completed');await snapshot('matrix-automatic-completed');
  // Repeat an occupied/pending site. It must not cancel the sticky item.
  await tap(...await projectTile(...sites[0]));await settle();report=await snapshot('matrix-duplicate');assert.equal(report.placement,'WallTower02');assert.equal(report.history.at(-1).ok,false);
  assert.equal(await evaluate('document.querySelector("#wt-build-ghost polygon").getAttribute("stroke")'),'#f28777');await screenshot('invalid-site-preview');
  await button('#blocknight-base');await button('#blocknight-zoom-map');await button('#blocknight-zoom-close');await mapTo(7,36);
  assert.equal(await evaluate('__warzoneCommands.report().placement'),'WallTower02');
  await button('[data-action="cancel-placement"]');
  // A normal native Ctrl+A selects the six starting constructors. The backend
  // then uses this manually selected group rather than assigning an auto truck.
  await evaluate('__kalaWarzoneTouch.selectAllUnits();true');await wait(300);
  await evaluate('__warzoneCommands.send("state")');report=await snapshot('matrix-manual-selected');assert.equal(report.snapshot.trucks.filter(t=>t.selected).length,6);
  await button('#wt-open-build');await button('[data-category="ALL"]');await button('[data-build="PillBox1"]');
  const p=await projectTile(7,35);await tap(...p);await settle();report=await snapshot('matrix-manual-six');
  const manual=report.history.filter(r=>r.action==='queue-build').at(-1);assert.equal(manual.ok,true);assert.equal(manual.result.automatic,false);assert.equal(manual.result.workers.length,6);
  results.push({case:'manual-six',accepted:manual.result});
  await button('#blocknight-stop');await evaluate('__warzoneCommands.send("state")');report=await snapshot('matrix-stopped');assert.equal(report.snapshot.jobs.length,0,'STOP clears every selected builder queue');
  await button('[data-action="cancel-placement"]');
  // Exercise a burst larger than the eight-command filesystem batch limit.
  const burst=await evaluate('Promise.all(Array.from({length:25},()=>__warzoneCommands.send("state"))).then(r=>({count:r.length,ok:r.every(x=>x.ok)}))');
  assert.deepEqual(burst,{count:25,ok:true});results.push({case:'transport-burst-25',...burst});
  fs.writeFileSync(path.join(out,'matrix-results.json'),JSON.stringify(results,null,2));await screenshot('matrix-finished');console.log('PASS: real automatic placements, invalid tap retention, BASE/zoom, manual six-truck assignment, STOP and 25-command burst');
 }
 if(action==='overlays'){
  const assert=require('node:assert/strict'),results=[];
  for(let i=0;i<6;i++){
   await button('#blocknight-help');
   await evaluate('parent.document.getElementById("warzone-towers-help").scrollTop=300;true');
   await button('.wt-help-back');await button('.wt-help-back').catch(()=>{});
   await button('#blocknight-tech');await wait(100);await engineButton('.bn-tech-done');
   const r=await evaluate(`({help:parent.document.getElementById('warzone-towers-help-overlay').hidden,tech:__blockNightResearch.report().open,inert:parent.document.getElementById('warzone-game-frame').inert,hud:parent.document.getElementById('blocknight-combat-hud').hidden})`);
   assert.equal(r.help,true);assert.equal(r.tech,false);assert.equal(r.inert,false);assert.equal(r.hud,false);results.push(r);
  }
  fs.writeFileSync(path.join(out,'overlay-results.json'),JSON.stringify(results,null,2));await screenshot('after-overlay-matrix');console.log('PASS: six repeated HELP scroll/return and TECH return cycles preserve controls and frame input');
 }
 if(action==='gestures'){
  const assert=require('node:assert/strict');
  await button('#wt-open-build');await button('[data-category="ALL"]');await button('[data-build="WallTower02"]');await button('#blocknight-zoom-close');await mapTo(7,36);
  const before=await save('gestures-before'),[w,h]=await evaluate('[innerWidth,innerHeight]'),count=await evaluate('__warzoneCommands.report().placements');
  await gesture([[w*.4,h*.35]],[[w*.52,h*.46]]);const panned=await save('gestures-pan');
  assert.notDeepEqual(panned['gam.json'].viewDataP,before['gam.json'].viewDataP,'one finger changes native camera position');
  await gesture([[w*.4,h*.4],[w*.6,h*.4]],[[w*.36,h*.4],[w*.64,h*.4]]);
  const pinched=await save('gestures-pinch');assert.ok(pinched.touch.pinchSteps>before.touch.pinchSteps,'native pinch wheel steps');
  await gesture([[w*.4,h*.4],[w*.6,h*.4]],[[w*.4,h*.4+90],[w*.6,h*.4+90]]);
  const tilted=await save('gestures-tilt');assert.ok(tilted.touch.tiltMoves>before.touch.tiltMoves);
  assert.notEqual(tilted['gam.json'].viewDataR.x,pinched['gam.json'].viewDataR.x,'native pitch changes');
  assert.equal(tilted['gam.json'].viewDataR.y,pinched['gam.json'].viewDataR.y,'tilting must not flip heading');
  for(let i=0;i<4;i++)await mapTo(i%2?7:59,i%2?36:8);
  await rawTouch('touchStart',[[w*.4,h*.4]]);await rawTouch('touchCancel',[]);
  await button('#blocknight-help');await button('.wt-help-back');await button('#blocknight-tech');await engineButton('.bn-tech-done');
  assert.equal(await evaluate('__warzoneCommands.report().placement'),'WallTower02');assert.equal(await evaluate('__warzoneCommands.report().placements'),count,'gestures/minimap/overlays never place a building');
  await button('#blocknight-zoom-close');await mapTo(7,36);
  const point=await projectTile(9,38);await rawTouch('touchStart',[point]);await wait(400);
  const ghost=await evaluate(`(()=>{const e=document.getElementById('wt-build-ghost');return{hidden:e.hidden,position:getComputedStyle(e).position,points:e.querySelector('polygon').getAttribute('points')}})()`);
  assert.equal(ghost.hidden,false);assert.equal(ghost.position,'fixed');assert.ok(ghost.points);await screenshot('held-build-preview');
  await rawTouch('touchEnd',[]);await settle();await screenshot('placed-preview');await snapshot('gestures-finished');
  fs.writeFileSync(path.join(out,'gesture-results.json'),JSON.stringify({pan:true,pinch:true,tilt:true,headingStable:true,noAccidentalPlacement:true,ghost,nativeViewBefore:before['gam.json'].viewDataP,nativeViewAfterPan:panned['gam.json'].viewDataP},null,2));
  console.log('PASS: native pan/pinch/tilt, stable heading, minimap/cancel/overlay retention and visible held placement footprint');
 }
 if(action==='layout'){
  const assert=require('node:assert/strict');
  await button('#wt-open-more');await evaluate(`(()=>{const e=parent.document.getElementById('wt-command-size');e.value='1.4';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);await wait(400);
  await button('[data-page="build"]');await screenshot('final-build-extra-large');
  const layout=await evaluate(`(()=>{const d=parent.document,h=d.getElementById('blocknight-combat-hud').getBoundingClientRect(),w=d.getElementById('warzone-towers-wave-hud').getBoundingClientRect(),f=d.getElementById('warzone-game-frame').getBoundingClientRect(),buttons=[...d.querySelectorAll('#blocknight-combat-hud button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>({id:b.id,r:b.getBoundingClientRect().toJSON()}));return{width:parent.innerWidth,height:parent.innerHeight,hud:h.toJSON(),wave:w.toJSON(),frame:f.toJSON(),buttons,buildButtonHeight:d.querySelector('[data-build]').getBoundingClientRect().height,stockImages:[...d.querySelectorAll('.wt-command-card img')].map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0}))}})()`);
  assert.ok(layout.frame.height>=482);assert.ok(layout.frame.width>=642);assert.ok(layout.hud.right<=layout.wave.left||layout.hud.top>=layout.wave.bottom);
  assert.ok(layout.buttons.every(b=>b.r.left>=0&&b.r.right<=layout.width&&b.r.bottom<=layout.frame.top));assert.ok(layout.buildButtonHeight>=49);
  assert.ok(layout.stockImages.length>=8);assert.ok(layout.stockImages.every(i=>i.loaded));
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify(layout,null,2));
  await button('[data-page="more"]');await evaluate(`(()=>{const e=parent.document.getElementById('wt-command-size');e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);await button('[data-action="back"]');
  await screenshot('final-battle-standard');console.log('PASS: all header commands and wave panel fit; Extra large build buttons, stock images and engine minimum verified');
 }
 if(action==='native-panels'){
  const assert=require('node:assert/strict'),results=[];
  await button('#wt-open-stats');await settle();await screenshot('final-native-stats');
  await evaluate('__warzoneCommands.send("state")');assert.equal((await snapshot('final-native-stats')).snapshot.nativeMenu,'stats');await button('#wt-native-back');
  await button('#wt-open-factory');await button('[data-action="native-factory"]');await settle();await screenshot('final-native-factory');
  await evaluate('__warzoneCommands.send("state")');assert.equal((await snapshot('final-native-factory')).snapshot.nativeMenu,'factory');await button('#wt-native-back');
  await button('#wt-open-more');await button('[data-action="commanders"]');await settle();await screenshot('final-native-commanders');
  await evaluate('__warzoneCommands.send("state")');assert.equal((await snapshot('final-native-commanders')).snapshot.nativeMenu,'commanders');await button('#wt-native-back');
  await evaluate('__warzoneCommands.send("state")');const final=await snapshot('final-native-panels-closed');assert.equal(final.snapshot.nativeMenu,'');
  assert.equal(await evaluate('parent.document.getElementById("warzone-game-frame").inert'),false);await screenshot('final-native-panels-closed');
  console.log('PASS: native player/kills, factory and commanders panels open/return with the header and minimap preserved');
 }
}
socket.addEventListener('open',()=>main().then(()=>socket.close()).catch(e=>{console.error(e);socket.close();process.exitCode=1;}));
