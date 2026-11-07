'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const events=[],timers=new Map();let serial=0;
class Input {constructor(type,init){this.type=type;Object.assign(this,init);}}
const canvas={style:{},focus(){},dispatchEvent(e){events.push(e);return true;},getBoundingClientRect(){return {left:0,top:0,right:1000,bottom:600,width:1000,height:600};},releasePointerCapture(){}};
const context={console,Map,Set,WeakSet,Math,Date,Promise,JSON,performance:{now:()=>0},navigator:{vibrate(){}},innerWidth:1000,innerHeight:600,devicePixelRatio:1,
 KeyboardEvent:Input,PointerEvent:Input,WheelEvent:Input,CustomEvent:Input,
 setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(){return 0;},clearInterval(){},
 addEventListener(){},dispatchEvent(){},document:{createElement:()=>({style:{},remove(){}}),body:{style:{},appendChild(){}},documentElement:{style:{}},getElementById:id=>id==='canvas'?canvas:null,addEventListener(){}}};context.window=context;context.parent=context;
vm.createContext(context);vm.runInContext(fs.readFileSync('app/src/main/assets/warzone-touch-controls.js','utf8').replace('  window.__kalaWarzoneTouch = {','  window.__inputAudit={queueCombatOrder,handlePointer,state};\n  window.__kalaWarzoneTouch = {'),context);
const controls=context.__kalaWarzoneTouch;
for(const fn of ['toggleQueueMode','toggleCombatLock','toggleBoxMode','toggleAutoFight']){assert.equal(controls[fn](true),true);assert.equal(controls[fn](false),false);}
for(const [id,timer]of [...timers])if(timer.ms<1000){timers.delete(id);timer.fn();}
assert.equal(events.some(e=>e.code==='KeyQ'),false,'Turning Patrol on then off without a destination must never arm a native patrol order.');
assert.equal(controls.report().patrolOrders,0,'No patrol order exists until a destination is chosen.');
assert.equal(controls.report().queueModifierHeld,false,'Merely arming Queue must not hold Ctrl over menu selection.');
events.length=0;context.__inputAudit.queueCombatOrder(300,200,true);controls.releaseAll(true);for(const [id,timer]of [...timers])if(timer.ms<1000){timers.delete(id);timer.fn();}assert.equal(events.some(e=>e.code==='KeyQ'||e.type==='pointerdown'),false,'navigation cancels delayed Patrol and destination clicks');
context.__inputAudit.queueCombatOrder(300,200,true);
for(const [id,timer]of [...timers])if(timer.ms<=88){timers.delete(id);timer.fn();}
events.length=0;
assert.equal(controls.releaseAll(true),true,'Back can detect that canceling Patrol already sent Escape');
assert.equal(events.filter(e=>e.type==='keydown'&&e.code==='Escape').length,1,'armed Patrol cancellation sends exactly one Escape');
let nativeClosing=true,buildOpen=true,selectingTrucks=false,placed=0;
context.__warzoneCommands={nativeClosing:()=>nativeClosing,report:()=>({buildOpen,selectingTrucks}),isPlacement:()=>true,nativeBuildOpen:()=>true,nativeMenuOpen:()=>false,previewAt(){},placeAt(){placed++;return true;}};
const touch=type=>({type,target:canvas,pointerType:'touch',pointerId:44,isPrimary:true,clientX:400,clientY:250,button:0,buttons:type==='pointerup'?0:1,preventDefault(){},stopImmediatePropagation(){}});
events.length=0;context.__inputAudit.handlePointer(touch('pointerdown'));context.__inputAudit.handlePointer(touch('pointerup'));
assert.equal(placed,0,'an immediate field tap cannot reach a closing native panel');assert.equal(context.__inputAudit.state.pointerQueue.length,2);
nativeClosing=false;controls.resumeInput();
for(let steps=0;steps<30;steps++){const next=[...timers].filter(([,t])=>t.ms<1000).sort((a,b)=>a[1].ms-b[1].ms)[0];if(!next)break;timers.delete(next[0]);next[1].fn();}
assert.equal(placed,1,'the accepted field tap is delivered once after native close acknowledgement');
nativeClosing=true;context.__inputAudit.handlePointer(touch('pointerdown'));context.__inputAudit.handlePointer(touch('pointerup'));controls.releaseAll(true);buildOpen=false;nativeClosing=false;controls.resumeInput();
assert.equal(placed,1,'exiting while a native close is pending discards its queued placement tap');
selectingTrucks=true;buildOpen=true;context.__inputAudit.handlePointer(touch('pointerdown'));context.__inputAudit.handlePointer(touch('pointerup'));
assert.equal(placed,1,'physical field taps wait while native BOX filtering temporarily changes selection');assert.equal(context.__inputAudit.state.pointerQueue.length,2);
selectingTrucks=false;controls.resumeInput();for(let steps=0;steps<30;steps++){const next=[...timers].filter(([,t])=>t.ms<1000).sort((a,b)=>a[1].ms-b[1].ms)[0];if(!next)break;timers.delete(next[0]);next[1].fn();}
assert.equal(placed,2,'accepted field input resumes once after the native constructor group is verified');
context.__warzoneCommands=undefined;
context.__inputAudit.queueCombatOrder(300,200,true);
for(const [id,timer]of [...timers])if(timer.ms<=88){timers.delete(id);timer.fn();}
events.length=0;controls.setBattleActive(false);
assert.equal(events.some(e=>e.code==='Escape'),false,'battle exit never sends Escape into the next native screen');
events.length=0;
controls.nativeClick(200,200);controls.nativePressKey('Escape','Escape',27);controls.zoom(1);controls.applyZoomPreset('map');
assert.equal(events.length,0,'ended battles reject synthetic native input');
assert.equal(controls.report().hudVisible,false);assert.equal(controls.report().battleActive,false);
assert.equal(controls.showCombatHud(),false,'ended battles cannot restore stale HUD');
console.log('PASS: Patrol/Queue cancellation, one-Escape Back and ended-battle native input isolation (code checks only)');
