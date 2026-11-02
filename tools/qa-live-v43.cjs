"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),{execFileSync}=require("node:child_process");
const {adb}=require('./android-sdk.cjs'),out=path.join(__dirname,"../qa/v4.3");fs.mkdirSync(out,{recursive:true});
const socket=new WebSocket(fs.readFileSync(path.join(__dirname,"live-cdp-url.txt"),"utf8").trim());let seq=0;const pending=new Map();
socket.addEventListener("message",e=>{const m=JSON.parse(String(e.data)),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
async function host(expression){const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw r.exceptionDetails;return r.result.value}
const engine=expression=>host(`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(expression)})`);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function shot(name){execFileSync(adb,['-s','emulator-5554','shell','screencap','-p','/sdcard/towers-v43.png']);execFileSync(adb,['-s','emulator-5554','pull','/sdcard/towers-v43.png',path.join(out,name+'.png')],{stdio:'ignore'})}
async function camera(name){await engine('__kalaWarzoneTouch.nativePressKey("F7","F7",118)');await wait(650);return {name,...await engine(`(()=>{const j=JSON.parse(Module.FS.readFile('/warzone2100/savegames/skirmish/QuickSave/gam.json',{encoding:'utf8'}));return {position:j.viewDataP,rotation:j.viewDataR,touch:__kalaWarzoneTouch.report()}})()`)};}
async function gesture(kind){
 const points=(step)=>kind==='pinch'?[{x:600-step*3,y:380,id:31},{x:680+step*3,y:380,id:32}]:[{x:600,y:420+step*(kind==='tilt-up'?-4:4),id:31},{x:680,y:420+step*(kind==='tilt-up'?-4:4),id:32}];
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(0)});
 for(let i=1;i<=20;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(i)});await wait(20)}
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(250);
}
async function layout(){return host(`(()=>{const f=document.getElementById('warzone-game-frame'),w=f.contentWindow,c=w.document.getElementById('canvas'),b=document.getElementById('blocknight-combat-hud'),h=document.getElementById('warzone-towers-wave-hud');const r=e=>e.getBoundingClientRect().toJSON();return {view:[innerWidth,innerHeight],frame:r(f),canvas:r(c),bar:r(b),barScroll:[b.scrollWidth,b.clientWidth],wave:r(h),waveText:h.innerText,waveScroll:[h.scrollWidth,h.clientWidth],isolated:[crossOriginIsolated,w.crossOriginIsolated],transform:w.getComputedStyle(c.parentElement).transform,research:w.__blockNightResearch.report().open}})()`)}
function check(m,research=false){const [width,height]=m.view,top=research?0:(width<=1000?94:50);assert.equal(m.frame.x,0);assert.equal(m.frame.y,top);assert.equal(m.frame.width,width);assert.equal(m.frame.height,height-top);assert.equal(m.canvas.width,width);assert.equal(m.canvas.height,height-top);assert.equal(m.canvas.x,0);assert.equal(m.canvas.y,0);assert.deepEqual(m.isolated,[true,true]);if(!research){assert.equal(m.wave.y,7);assert.ok(Math.abs(m.wave.right-(width-7))<1);assert.ok(m.bar.bottom<=top);assert.ok(m.barScroll[0]<=m.barScroll[1]+1);assert.ok(m.waveScroll[0]<=m.waveScroll[1]+1);assert.ok(m.bar.right<m.wave.x||m.bar.y>=m.wave.bottom,'command bar and wave panel must never overlap')}}
async function main(){
 await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let ready=false;for(let i=0;i<80;i++){ready=await engine('Boolean(window.__kalaWarzoneTouch?.report().hudVisible&&window.__warzoneTowersWaves?.report().snapshot)');if(ready)break;await wait(500)}assert.ok(ready);
 const first=await engine('__warzoneTowersWaves.report().snapshot');assert.equal(first.wave,0);assert.equal(first.phase,'countdown');assert.equal(first.humanPower,0);
 let preparation;for(let i=0;i<40;i++){preparation=await host("(()=>{const d=document.getElementById('warzone-towers-preparation');return {open:d?.open,text:d?.textContent}})()");if(preparation.open||process.argv.includes('--resume'))break;await wait(100)}if(!process.argv.includes('--resume'))assert.equal(preparation.open,true);assert.ok(preparation.text.includes('You have 4 minutes to prepare your defences.'));if(preparation.open){shot('preparation-dialog');await host("document.querySelector('#warzone-towers-preparation button').click();true")}
 console.log('Preparation dialog verified; first snapshot '+JSON.stringify(first));
 const startupCamera=await camera('startup-before-test-reset');assert.equal(startupCamera.rotation.y,32768,'cold-start orientation must complete before the preparation dialog');
 await engine('__kalaWarzoneTouch.nativePressKey("5","Numpad5",101)');await wait(200); // Reset native pitch before measuring both directions, including resumed runs.
 const cameras=[await camera('initial')];
 for(const [name,coords] of [['up',[1400,1050,1400,650]],['down',[1400,650,1400,1050]],['above-radar-down',[2300,700,2300,900]]]){execFileSync(adb,['-s','emulator-5554','shell','input','swipe',...coords.map(String),'400']);await wait(250);cameras.push(await camera(name))}
 fs.writeFileSync(path.join(out,'pan-results.json'),JSON.stringify(cameras,null,2));
 assert.equal(cameras[0].rotation.y,32768,'intro must not interrupt the initial south-facing camera command');assert.ok(cameras[1].position.z>cameras[0].position.z);assert.ok(cameras[2].position.z<cameras[1].position.z);assert.ok(cameras[3].position.z<cameras[2].position.z,'drag above actual radar must move the camera');assert.equal(cameras[3].touch.radarDrags,cameras[2].touch.radarDrags);
 await gesture('tilt-up');cameras.push(await camera('tilt-up'));assert.ok(cameras[4].rotation.x<cameras[3].rotation.x,'native camera pitch must change for two-finger upward tilt');assert.ok(cameras[3].rotation.x-cameras[4].rotation.x<6500,'short tilt stroke must not slam to a near-vertical limit');assert.equal(cameras[4].position.x,cameras[3].position.x,'tilt must not pan on X');assert.equal(cameras[4].position.z,cameras[3].position.z,'tilt must not pan on Z'); // Native camera altitude adapts to pitch.
 await gesture('tilt-down');cameras.push(await camera('tilt-down'));assert.ok(cameras[5].rotation.x>cameras[4].rotation.x);
 for(const c of cameras){assert.equal(c.rotation.y,cameras[0].rotation.y,'no gesture may change heading');assert.equal(c.touch.tiltHeld,null);assert.equal(c.touch.gestureActive,false);assert.deepEqual(c.touch.heldKeys,[])}
 const pinchesBefore=cameras[5].touch.pinchSteps;await gesture('pinch');const pinch=await engine('__kalaWarzoneTouch.report()');assert.ok(pinch.pinchSteps>pinchesBefore);assert.equal(pinch.tiltHeld,null);assert.equal(pinch.gestureActive,false);
 console.log('Native camera positions/pitch verified '+JSON.stringify(cameras.map(({name,position,rotation})=>({name,position,rotation}))));
 const layouts=[];let m=await layout();check(m);layouts.push({name:'native',...m});shot('top-right-native');
 for(const [name,width,height] of [['phone',1182,532],['tablet',1024,768],['compact',900,650],['minimum',642,576]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:false});await wait(900);m=await layout();check(m);layouts.push({name,...m});shot(name+'-layout');
  await host("document.getElementById('blocknight-tech').click();true");await wait(450);m=await layout();check(m,true);assert.equal(m.research,true);await engine("document.querySelector('.bn-tech-done').click();true");await wait(500);check(await layout());
  await host("document.getElementById('blocknight-help').click();true");assert.ok(await host("document.getElementById('warzone-towers-help').textContent.includes('tilt the camera')"));await host("document.querySelector('#warzone-towers-help .wt-help-back').click();true");
 }
 await send('Emulation.clearDeviceMetricsOverride');await wait(900);check(await layout());
 fs.writeFileSync(path.join(out,'camera-layout-results.json'),JSON.stringify({first,preparation,startupCamera,cameras,pinch,layouts},null,2));
 if(process.argv.includes('--camera-only')){console.log('PASS: final camera sensitivity, panning, heading, header layout, research and HELP return');socket.close();return}
 console.log('Phone/tablet/compact layout, research and HELP return passed. Waiting for natural four-minute wave with no construction.');
 const history=[first];let wave=await engine('__warzoneTowersWaves.report().snapshot'),lastSecond=-1;
 const estimatedDeadline=first.gameTime+first.nextWaveIn*1000;
 while(wave.wave===0){assert.equal(wave.phase,'countdown');assert.equal(wave.humanPower,0);assert.equal(wave.enemyDroids,0);if(wave.nextWaveIn!==lastSecond&&wave.nextWaveIn%10===0){console.log('Preparation '+wave.nextWaveIn+'s remaining');history.push(wave);lastSecond=wave.nextWaveIn}await wait(650);wave=await engine('__warzoneTowersWaves.report().snapshot')}
 assert.equal(wave.wave,1);assert.ok(wave.gameTime>=estimatedDeadline-1000&&wave.gameTime<=estimatedDeadline+2000,'first wave must begin at four-minute deadline');await wait(4200);wave=await engine('__warzoneTowersWaves.report().snapshot');history.push(wave);assert.equal(wave.humanPower,0);assert.ok(wave.enemyDroids>0);assert.equal(wave.pulsesRemaining,0);shot('automatic-wave1-without-building');
 const beforeSkip=wave;const p=await host("(()=>{const r=document.getElementById('warzone-towers-next-wave').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");execFileSync(adb,['-s','emulator-5554','shell','input','tap',String(Math.round(p[0]*2)),String(Math.round(p[1]*2))]);await wait(4200);wave=await engine('__warzoneTowersWaves.report().snapshot');history.push(wave);assert.equal(wave.wave,2);assert.ok(wave.enemyDroids>beforeSkip.enemyDroids);shot('wave2-early-keep-survivors');
 const finalCamera=await camera('after-wave-and-skip');assert.equal(finalCamera.rotation.y,cameras[0].rotation.y);assert.equal(finalCamera.rotation.x,cameras[5].rotation.x);
 fs.writeFileSync(path.join(out,'automatic-wave-results.json'),JSON.stringify({estimatedDeadline,history,beforeSkip,afterSkip:wave,finalCamera},null,2));console.log('PASS: natural four-minute wave spawned '+beforeSkip.enemyDroids+' enemies with no construction; Skip Wave kept survivors and increased total to '+wave.enemyDroids);socket.close();
}
const timeout=setTimeout(()=>{console.error('Live v4.3 QA timed out');process.exit(1)},330000);main().then(()=>{clearTimeout(timeout);process.exit(0)}).catch(e=>{console.error(e);socket.close();process.exit(1)});
