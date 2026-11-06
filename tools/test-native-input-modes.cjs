'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const events=[],timers=new Map();let serial=0;
class Input {constructor(type,init){this.type=type;Object.assign(this,init);}}
const canvas={style:{},focus(){},dispatchEvent(e){events.push(e);return true;},getBoundingClientRect(){return {left:0,top:0,right:1000,bottom:600,width:1000,height:600};},releasePointerCapture(){}};
const context={console,Map,Set,WeakSet,Math,Date,Promise,JSON,performance:{now:()=>0},navigator:{vibrate(){}},innerWidth:1000,innerHeight:600,devicePixelRatio:1,
 KeyboardEvent:Input,PointerEvent:Input,WheelEvent:Input,CustomEvent:Input,
 setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(){return 0;},clearInterval(){},
 addEventListener(){},dispatchEvent(){},document:{body:{style:{}},documentElement:{style:{}},getElementById:id=>id==='canvas'?canvas:null,addEventListener(){}}};context.window=context;context.parent=context;
vm.createContext(context);vm.runInContext(fs.readFileSync('app/src/main/assets/warzone-engine-input.js','utf8'),context);
const controls=context.__kalaWarzoneTouch;
for(const fn of ['toggleQueueMode','toggleCombatLock','toggleBoxMode','toggleAutoFight']){assert.equal(controls[fn](true),true);assert.equal(controls[fn](false),false);}
for(const [id,timer]of [...timers])if(timer.ms<1000){timers.delete(id);timer.fn();}
assert.equal(events.some(e=>e.code==='KeyQ'),false,'Turning Patrol on then off without a destination must never arm a native patrol order.');
assert.equal(controls.report().patrolOrders,0,'No patrol order exists until a destination is chosen.');
assert.equal(controls.report().queueModifierHeld,false,'Merely arming Queue must not hold Ctrl over menu selection.');
console.log('PASS: active native input modes leave no armed Patrol order or Queue modifier without a destination');
