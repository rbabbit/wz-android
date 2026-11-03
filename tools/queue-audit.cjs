'use strict';
// Real Android touches plus native QuickSave order lists; wrapper counters alone
// are not treated as proof that the engine accepted a build queue.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {adb}=require('./android-sdk.cjs');
const device=process.env.WZ_QA_DEVICE||'emulator-5554',out=path.resolve(__dirname,'..',process.env.WZ_QA_OUTPUT||'qa/v4.6');
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
async function button(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing button');const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`,false);await hostTap(...p);if(selector==='#blocknight-stop'){for(let i=0;i<120;i++){if(!await evaluate('__kalaWarzoneTouch.report().stopPending'))return;await wait(25)}throw Error('STOP acknowledgement did not arrive')}if(selector==='#blocknight-music'){const deadline=Date.now()+90000;while(Date.now()<deadline){if(!await evaluate('__kalaWarzoneTouch.report().musicOpening'))return;await wait(100)}throw Error('Music menu transition did not finish')}}
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
async function waitReady(){const deadline=Date.now()+180000;while(Date.now()<deadline){try{if(await evaluate("(()=>{const t=document.getElementById('warzone-game-frame')?.contentWindow?.__kalaWarzoneTouch;return Boolean(t?.report().hudVisible&&!t?.report().cameraFacingPending)})()",false))return}catch(error){if(!String(error.message).includes('evaluation timed out'))throw error}await wait(500)}throw Error('Battlefield did not become ready')}
async function dismissPreparation(){
 for(let i=0;i<50;i++){if(await evaluate("Boolean(document.getElementById('warzone-towers-preparation'))",false))break;await wait(100)}
 for(let i=0;i<10;i++){
  if(!await evaluate("Boolean(document.getElementById('warzone-towers-preparation')?.open)",false))return;
  await button('#warzone-towers-preparation button');await wait(250);
 }
 throw Error('Preparation dialog did not close; refusing to send gameplay gestures behind it');
}
async function matrix(){
 const assert=require('node:assert/strict');
 await waitReady();
 await dismissPreparation();
 const [w,h]=await evaluate('[innerWidth,innerHeight]');assert.equal(w,800,'calibrated real Android case uses the existing 800px viewport');
 const results=[];
 async function capture(name){const s=await save('matrix-'+name);const b=builders(s).filter(d=>d.selected);const summary={name,mode:s.touch.queueMode,modifier:s.touch.queueModifierHeld,plan:[...buildPlan(s)],selected:b.map(d=>({id:d.id,current:d['order/type'],stats:d['order/stats'],queued:d['orderList/size']})),view:s['gam.json'].viewDataP,rotation:s['gam.json'].viewDataR};results.push(summary);fs.writeFileSync(path.join(out,'queue-matrix-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(summary));return s}
 async function guard(name){const s=await capture(name);assert.equal(s.touch.queueMode,true,name+': +Q stays armed');assert.ok(builders(s).filter(d=>d.selected).every(d=>d['order/type']!==2),name+': no accidental move replacing construction');return s}
 await button('#blocknight-stop');await button('#blocknight-base');await wait(700);
 await tap(105,h-55);await tap(144+(w-640)/2+32,h-51);
 await button('#blocknight-zoom-close');await wait(400);
 const setup=await capture('truck-selected');
 if(!await evaluate('__kalaWarzoneTouch.report().queueMode'))await button('#blocknight-queue-orders');
 await tap(56,h-437);await tap(103,h-403);
 for(const [x,y] of [[400,250],[450,250],[500,250],[400,300],[450,300],[500,300]])await tap(x,y);
 const initial=await guard('initial-placements');assert.ok(buildPlan(initial).size>=buildPlan(setup).size+2,'at least two new real build intents accepted');
 await tap(400,250);await guard('duplicate-occupied-tap');
 await tap(710,210);await tap(430,280);await guard('edge-then-resume');
 await swipe(480,240,480,240,450);await tap(490,210);await guard('held-tap-then-resume');
 await swipe(430,250,470,250,300);await tap(520,230);await guard('pan-then-resume');
 const beforeRadar=await capture('before-minimap');
 await swipe(w-120,h-115,w-117,h-113,100);await guard('minimap-drift-tap');
 await tap(w-175,h-42);await tap(470,280);const afterRadar=await guard('minimap-return-and-build');
 assert.equal(afterRadar['gam.json'].viewDataR.y,beforeRadar['gam.json'].viewDataR.y,'minimap must not rotate the map');
 await button('#blocknight-help');await button('.wt-help-close');await tap(500,260);await guard('help-then-build');
 await button('#blocknight-tech');
 const p=await evaluate("(()=>{const r=document.querySelector('.bn-tech-done').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");await tap(...p);
 await tap(530,290);await guard('tech-then-build');
 const stopTargets=builders(await save('matrix-before-stop')).filter(d=>d.selected).map(d=>d.id);assert.ok(stopTargets.length,'STOP must have actual selected trucks to test');
 await button('#blocknight-stop');const stopped=await capture('explicit-stop');assert.equal(stopped.touch.queueMode,false);assert.ok(builders(stopped).filter(d=>stopTargets.includes(d.id)).every(d=>d['orderList/size']===0&&d['order/type']===0),'STOP must clear the original trucks, even if the engine deselects them');
 shot('matrix-after-stop');console.log('PASS: native queue matrix completed');
}
async function protocol(method,params){const n=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timed out'))},15000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}))})}
async function touch(type,points=[]){const f=await evaluate("document.getElementById('warzone-game-frame').getBoundingClientRect().toJSON()",false);await protocol('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({id,x:x+f.x,y:y+f.y,force:.5,radiusX:3,radiusY:3}))})}
async function hostSwipe(x1,y1,x2,y2){const [w,h]=await evaluate('[innerWidth,innerHeight]',false),[l,t,r,b]=windowBounds();run('shell','input','swipe',...[x1,y1,x2,y2].map((v,i)=>String(Math.round((i%2?t:l)+v*(i%2?(b-t)/h:(r-l)/w)))),'300');await wait(300)}
async function extended(){
 const assert=require('node:assert/strict'),results=[];
 async function selectTrucks(){await evaluate("(()=>{const c=document.querySelector('canvas');c.focus();c.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',code:'ShiftLeft',location:1,keyCode:16,which:16,shiftKey:true,bubbles:true}));setTimeout(()=>__kalaWarzoneTouch.nativePressKey('T','KeyT',84,true),60);setTimeout(()=>c.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',code:'ShiftLeft',location:1,keyCode:16,which:16,bubbles:true})),150);return true})()");await wait(400)}
 async function capture(name){const s=await save('extended-'+name);const summary={name,mode:s.touch.queueMode,selected:builders(s).filter(d=>d.selected).map(d=>({id:d.id,current:d['order/type'],stats:d['order/stats'],queued:d['orderList/size']})),plan:[...buildPlan(s)],rotation:s['gam.json'].viewDataR,wave:s.wave};results.push(summary);fs.writeFileSync(path.join(out,'extended-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(summary));return s}
 async function guard(name){const s=await capture(name),selected=builders(s).filter(d=>d.selected);assert.equal(s.touch.queueMode,true);assert.ok(selected.length>=2,name+': retain multiple selected trucks');assert.ok(selected.every(d=>d['order/type']!==2),name+': no accidental MOVE');return s}
 await button('#blocknight-stop');await button('#blocknight-base');await wait(700);
 // The reticle opens the truck list first. Open its real stats before restoring
 // the six-truck selection; clicking a list entry itself selects one truck.
 await tap(105,451);await tap(256,414);await selectTrucks();
 const selected=await capture('all-trucks');assert.equal(builders(selected).filter(d=>d.selected).length,6,'native Shift+T selects all six starting trucks');
 await button('#blocknight-queue-orders');await tap(56,69);await tap(103,103);
 for(const x of [300,340,380,420,460,500])await tap(x,180);
 const first=await guard('group-build');assert.ok(builders(first).filter(d=>d.selected).every(d=>d['order/type']===4&&d['orderList/size']>=1),'all six trucks must receive multiple native build orders');
 await tap(105,451);await tap(256,414);await selectTrucks();await tap(56,69);await tap(37,159);
 for(const y of [140,180,220])for(const x of [320,360,400,440,480])await tap(x,y);
 const changed=await guard('change-defence-once');assert.ok(builders(changed).filter(d=>d.selected).every(d=>['order',...Array.from({length:d['orderList/size']||0},(_,i)=>'orderList/'+i)].some(p=>d[p+'/type']===4&&d[p+'/stats']==='GuardTower6')),'one cannon-hardpoint selection must enqueue that native defence for every selected truck');
 for(const p of [[340,200],[380,220],[420,240],[460,260],[500,280],[540,300]]){await touch('touchStart',[p]);await touch('touchEnd')}
 await guard('rapid-touch-burst');
 await touch('touchStart',[[420,240]]);await touch('touchCancel');await tap(490,220);await guard('cancelled-touch-then-build');
 const beforePinch=await capture('before-pinch');
 await touch('touchStart',[[350,220],[450,220]]);
 for(const spread of [30,60,90]){await touch('touchMove',[[350-spread,220],[450+spread,220]]);await wait(60)}
 await touch('touchEnd');await tap(490,220);
 const pinched=await guard('pinch-then-build');assert.ok(pinched.touch.pinchSteps>beforePinch.touch.pinchSteps);assert.equal(pinched['gam.json'].viewDataR.y,beforePinch['gam.json'].viewDataR.y);shot('extended-pinch');
 for(const preset of ['battle','map','close']){await button('#blocknight-zoom-'+preset);for(let i=0;i<80;i++){if(!await evaluate('__kalaWarzoneTouch.report().zoomPending'))break;await wait(50)}}
 await tap(500,250);const zoomed=await guard('three-zoom-presets-then-build');assert.equal(zoomed.touch.lastZoomDistance,1600);assert.ok(zoomed.touch.zoomAcks>=pinched.touch.zoomAcks+3);
 await swipe(430,270,430,210,300);await tap(490,220);let vertical=await guard('vertical-pan-then-build');
 if(vertical['gam.json'].viewDataP.z===zoomed['gam.json'].viewDataP.z){await swipe(430,210,430,330,350);await tap(490,220);vertical=await guard('reverse-vertical-pan')}
 assert.notEqual(vertical['gam.json'].viewDataP.z,zoomed['gam.json'].viewDataP.z,'one-finger vertical pan must move the native camera');
 await touch('touchStart',[[340,230],[430,230]]);
 for(const dx of [20,40,60,80]){await touch('touchMove',[[340+dx,230],[430+dx,230]]);await wait(50)}await touch('touchEnd');await tap(490,220);
 const multiPan=await guard('two-finger-horizontal-pan-then-build');assert.notEqual(multiPan['gam.json'].viewDataP.x,vertical['gam.json'].viewDataP.x);assert.equal(multiPan['gam.json'].viewDataR.y,vertical['gam.json'].viewDataR.y);
 const beforeTilt=await capture('before-tilt');await touch('touchStart',[[350,220],[440,220]]);
 for(const dy of [20,40,60,80]){await touch('touchMove',[[350,220+dy],[440,220+dy]]);await wait(30)}await touch('touchEnd');await tap(510,230);
 const tilted=await guard('two-finger-tilt-then-build');assert.notEqual(tilted['gam.json'].viewDataR.x,beforeTilt['gam.json'].viewDataR.x);assert.equal(tilted['gam.json'].viewDataR.y,beforeTilt['gam.json'].viewDataR.y);
 const gap=await evaluate("(()=>{const strip=document.getElementById('warzone-command-strip'),r=strip.getBoundingClientRect();for(let y=r.top+20;y<r.bottom-8;y+=8)for(let x=r.left+20;x<r.right-10;x+=2){const e=document.elementFromPoint(x,y);if(e&&strip.contains(e)&&!e.closest('button,aside'))return [x,y]}return null})()",false);
 assert.ok(gap,'the header-gap case must have a real non-button target');
 await hostTap(...gap);await tap(480,250);await guard('blank-header-tap-then-build');
 if(tilted.wave.wave===0){
  await button('#warzone-towers-next-wave');
  for(let i=0;i<80;i++){if(await evaluate('(__warzoneTowersWaves.report().snapshot?.enemyDroids||0)>0'))break;await wait(200)}
 }
 const active=await guard('active-wave-before-radar');assert.ok(active.wave.wave>=1&&active.wave.enemyDroids>0,'minimap and HELP tests must run with real wave enemies present');
 for(const p of [[650,355],[700,400],[620,440],[740,330],[660,390],[710,460],[630,350],[720,420],[680,370],[625,464]])await tap(...p);
 const radar=await guard('ten-minimap-taps');assert.equal(radar['gam.json'].viewDataR.y,tilted['gam.json'].viewDataR.y);
 for(let i=0;i<3;i++){
  await button('#blocknight-help');await hostSwipe(650,460,650,180);
  await evaluate("document.getElementById('warzone-towers-help').scrollTop=10000",false);
  await button('.wt-help-back');await tap(490+i*15,240+i*10);await guard('scrolled-help-return-'+(i+1));
 }
 const ids=builders(await save('extended-before-stop')).filter(d=>d.selected).map(d=>d.id);await button('#blocknight-stop');const stopped=await capture('stop-six-trucks');assert.equal(stopped.touch.queueMode,false);assert.ok(builders(stopped).filter(d=>ids.includes(d.id)).every(d=>d['order/type']===0&&d['orderList/size']===0));
 shot('extended-final');console.log('PASS: six-truck building, changing defence once, rapid touch burst, cancellation, tilt, ten minimap taps, three scrolled HELP returns and stopping all original trucks');
}
async function main(){
 await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));fs.mkdirSync(out,{recursive:true});
 const [action,...args]=process.argv.slice(2);
 if(action==='prepare'){
  await waitReady();
  await dismissPreparation();
  await save('baseline-native-start');shot('baseline-ready');
 }else if(action==='tap')await tap(Number(args[0]),Number(args[1]));
 else if(action==='swipe')await swipe(...args.map(Number));
 else if(action==='mouse'){
  const f=await evaluate("document.getElementById('warzone-game-frame').getBoundingClientRect().toJSON()",false);
  const x=Number(args[0])+f.x,y=Number(args[1])+f.y;
  await protocol('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0});
  await protocol('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
  await wait(80);
  await protocol('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
  await wait(500);
 }
 else if(action==='button')await button(args[0]);
 else if(action==='save'){const result=await save(args[0]);console.log(JSON.stringify({files:result.files,touch:result.touch}));}
 else if(action==='shot')shot(args[0]);
 else if(action==='key'){const code=/^[a-z]$/i.test(args[0])?'Key'+args[0].toUpperCase():args[0];await evaluate(`__kalaWarzoneTouch.nativePressKey(${JSON.stringify(args[0])},${JSON.stringify(code)},${Number(args[1])});true`);await wait(1000)}
 else if(action==='matrix')await matrix();
 else if(action==='startupmusic'){
  const assert=require('node:assert/strict');await waitReady();await dismissPreparation();
  const expected=JSON.parse(fs.readFileSync(path.join(out,'startup-music-results.json'),'utf8')).selectedTrack;
  for(let i=0;i<100;i++){if(await evaluate(`WarzoneMusic.report().nativeTracks.includes('/data/music/albums/'+${JSON.stringify(expected)})`))break;await wait(100)}
  const report=await evaluate('WarzoneMusic.report()');
  assert.equal(report.loaded,true);assert.equal(report.selectionApplied,true);assert.deepEqual(report.selectedTracks,[expected]);
  assert.ok(report.nativeReadBytes>4096,'the engine must stream actual original audio');
  assert.ok(report.nativeTracks.includes('/data/music/albums/'+expected),'the official engine must open the selected battle track');
  assert.ok(report.nativeTracks.every(p=>p==='/data/music/menu.opus'||p==='/data/music/albums/'+expected),'an excluded battle track must not play');
  const preferences=await evaluate("JSON.parse(LaunchedModule.FS.readFile((LaunchedModule.WZVAL_configDirPath||'/warzone2100')+'/music.json',{encoding:'utf8'}))");
  for(const [id,value] of Object.entries(preferences.tracks))assert.deepEqual(value.settings.music_modes,Array(4).fill(id===expected));
  const header=await evaluate("({musicButton:!!document.getElementById('blocknight-music'),musicMode:document.body.dataset.nativeMusic,buttons:[...document.querySelectorAll('#blocknight-combat-hud button')].map(e=>({id:e.id,visible:!!e.getClientRects().length,enabled:!e.disabled}))})",false);
  assert.equal(header.musicButton,false);assert.equal(header.musicMode,undefined);assert.equal(header.buttons.length,11);assert.ok(header.buttons.every(b=>b.visible&&b.enabled));
  const saved=await save('startup-music-battle');shot('startup-music-battle');
  fs.writeFileSync(path.join(out,'startup-music-battle-report.json'),JSON.stringify({expected,report,preferences,header,wave:saved.wave},null,2));
  console.log('PASS: startup playlist drives actual native Opus playback; all eleven battle controls remain visible and active');
 }
 else if(action==='extended')await extended();
 else if(action==='pancheck'){
  const assert=require('node:assert/strict'),before=await save('pancheck-before');
  await touch('touchStart',[[340,230],[430,230]]);
  for(const dx of [20,40,60,80]){await touch('touchMove',[[340+dx,230],[430+dx,230]]);await wait(50)}await touch('touchEnd');
  const after=await save('pancheck-after');
  console.log(JSON.stringify({before:before['gam.json'].viewDataP,after:after['gam.json'].viewDataP,touch:after.touch}));
  assert.notEqual(after['gam.json'].viewDataP.x,before['gam.json'].viewDataP.x);console.log('PASS: two-finger native pan after confirmed QuickSave resume');
 }
 else if(action==='layout'){
  const assert=require('node:assert/strict');
  const layout=await evaluate("(()=>{const strip=document.getElementById('warzone-command-strip').getBoundingClientRect();return {width:innerWidth,strip:strip.toJSON(),items:[...document.querySelectorAll('#blocknight-combat-hud button,#warzone-towers-wave-hud')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,r:e.getBoundingClientRect().toJSON()}))}})()",false);
  assert.ok(layout.items.length>=12,'all battle commands and the wave panel must be visible');
  for(const {id,r} of layout.items)assert.ok(r.left>=0&&r.right<=layout.width+1&&r.top>=0&&r.bottom<=layout.strip.bottom+1,id+' must fit inside the command area');
  for(let i=0;i<layout.items.length;i++)for(let j=i+1;j<layout.items.length;j++){
   const a=layout.items[i],b=layout.items[j];assert.ok(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)<=1||Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)<=1,a.id+' overlaps '+b.id);
  }
  assert.ok(!layout.items.some(i=>i.id==='blocknight-music'),'Music belongs on the start screen');
  fs.writeFileSync(path.join(out,'header-layout.json'),JSON.stringify(layout,null,2));console.log('PASS: all eleven commands and the wave panel fit without overlap; Music is absent');
 }
 else if(action==='inspect')console.log(JSON.stringify({nativeFrame:windowBounds(),...await evaluate('({view:[innerWidth,innerHeight],touch:__kalaWarzoneTouch.report(),wave:__warzoneTowersWaves.report().snapshot})')}));
 else throw Error('Unknown audit action');
 socket.close();
}
const timeout=setTimeout(()=>process.exit(1),process.argv[2]==='extended'?480000:['matrix','startupmusic','prepare'].includes(process.argv[2])?300000:120000);main().then(()=>{clearTimeout(timeout);process.exit(0)}).catch(error=>{console.error(error);process.exit(1)});
