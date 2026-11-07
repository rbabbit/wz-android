'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const events=[],timers=new Map(),windowListeners=new Map(),documentListeners=new Map();let serial=0,hostFocused=true,now=1000;
class Input{constructor(type,init){this.type=type;Object.assign(this,init);}}
// Fixed native SDL 4.7 semantics: any LMB press inside 250ms becomes
// KEY_DOUBLECLICK regardless of position. mouseReleased() then fires at that
// press, and motion cannot turn that state into a drag (PRESSED/DOWN only).
const sdl={state:'UP',last:-Infinity,x:0,y:0,startX:0,startY:0,downs:[],moves:[]};
function nativeEvent(e){
 if(e.type==='pointerdown'&&e.button===0){const gap=now-sdl.last;sdl.state=gap<250?'DOUBLECLICK':'PRESSED';sdl.last=now;sdl.x=sdl.startX=e.clientX;sdl.y=sdl.startY=e.clientY;sdl.downs.push({at:now,gap,x:e.clientX,y:e.clientY});}
 if(e.type==='pointermove'){sdl.x=e.clientX;sdl.y=e.clientY;if(e.buttons===1&&['PRESSED','DOWN'].includes(sdl.state)&&(Math.abs(sdl.startX-sdl.x)>5||Math.abs(sdl.startY-sdl.y)>5))sdl.state='DRAG';}
 if(e.type==='pointerup'&&e.button===0){sdl.x=e.clientX;sdl.y=e.clientY;sdl.state=sdl.state==='DRAG'?'DRAG_RELEASE':'CLICK_RELEASE';}
}
function nativeTick(){if(['DOUBLECLICK','CLICK_RELEASE'].includes(sdl.state)){sdl.moves.push({at:now,x:sdl.x,y:sdl.y,state:sdl.state});sdl.state='UP';}else if(sdl.state==='DRAG_RELEASE')sdl.state='UP';else if(sdl.state==='PRESSED')sdl.state='DOWN';}
const canvas={style:{},focus(){},dispatchEvent(e){events.push(e);nativeEvent(e);return true;},getBoundingClientRect:()=>({left:0,top:0,right:1000,bottom:600,width:1000,height:600}),releasePointerCapture(){}};
const gl={COLOR_BUFFER_BIT:16384,FRAMEBUFFER_BINDING:36006,getParameter:()=>null,clear:()=>7};
const context={console,Map,Set,WeakSet,Math,Date,Promise,JSON,performance:{now:()=>now},navigator:{vibrate(){}},innerWidth:1000,innerHeight:600,devicePixelRatio:1,LaunchedModule:{ctx:gl},KeyboardEvent:Input,PointerEvent:Input,WheelEvent:Input,CustomEvent:Input,
 setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,due:now+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(){return 0;},clearInterval(){},addEventListener:(type,handler)=>windowListeners.set(type,handler),dispatchEvent(){},
 document:{createElement:()=>({style:{},remove(){}}),body:{style:{},appendChild(){}},documentElement:{style:{}},hasFocus:()=>hostFocused,getElementById:id=>id==='canvas'?canvas:null,addEventListener:(type,handler)=>documentListeners.set(type,handler)}};context.window=context;context.parent=context;
vm.createContext(context);vm.runInContext(fs.readFileSync('app/src/main/assets/warzone-touch-controls.js','utf8'),context);const controls=context.__kalaWarzoneTouch,blurTarget=vm.runInContext('window',context);
function due(){for(const [id,t]of [...timers].sort((a,b)=>a[1].due-b[1].due))if(t.due<=now){timers.delete(id);t.fn();}}
function frame(){now+=20;nativeTick();gl.clear(gl.COLOR_BUFFER_BIT);due();}
async function finish(promise){let done=false,value;promise.then(v=>{done=true;value=v;});for(let i=0;i<300&&!done;i++){frame();await Promise.resolve();}assert.equal(done,true,'bounded native input fixture completes');return value;}
function pressStarted(previous){for(let i=0;i<100&&sdl.downs.length===previous;i++)frame();assert.equal(sdl.downs.length,previous+1);}
(async()=>{
 const first=controls.nativeBoxSelect(300,100,700,400,false);now+=20;due();assert.equal(sdl.downs.length,0,'wall-clock/browser timers cannot press without a fresh native frame');
 frame();assert.equal(sdl.downs.length,1);frame();assert.equal(sdl.state,'DRAG');assert.equal(await finish(first),true);assert.deepEqual(sdl.moves,[]);
 // Rapid consecutive rectangles, including the exact previously failing narrow
 // strip, must remain genuine drags rather than DOUBLECLICK MOVE-at-start.
 for(const r of [[296.333,488,780,515],[52,488,60,515],[320,120,640,360]])assert.equal(await finish(controls.nativeBoxSelect(...r,true)),true);
 assert.ok(sdl.downs.slice(1).every(d=>d.gap>=300),'every automated BOX waits beyond native SDL double-click cadence');assert.deepEqual(sdl.moves,[],'rapid selection rectangles never generate MOVE at press or release');
 const oldDown=sdl.downs.length,cancelled=controls.nativeBoxSelect(320,120,640,360,true);pressStarted(oldDown);controls.releaseAll(true);assert.equal(sdl.state==='CLICK_RELEASE',false,'cancel after down cannot release on the starting ground point');assert.equal(await finish(cancelled),false);assert.deepEqual(sdl.moves,[],'cancellation still completes a real drag');
 const pending=controls.nativeBoxSelect(320,120,640,360);controls.releaseAll(true);assert.equal(await pending,false);
 assert.equal(await controls.nativeBoxSelect(0,0,3,3),false);assert.equal(await controls.nativeBoxSelect(-1,20,50,50),false);
 // Ordinary clicks retain their fast/double-click behavior. A later BOX must
 // pace itself relative to those LMB downs, not only previous BOX operations.
 const normal=await finish(controls.nativeMenuClick(200,200));assert.equal(normal,true);const prior=sdl.downs.at(-1).at;await finish(controls.nativeMenuClick(450,250));assert.ok(sdl.downs.at(-1).at-prior<250,'ordinary native clicks are not slowed by BOX cadence');
 const movesBefore=sdl.moves.length;assert.equal(await finish(controls.nativeBoxSelect(300,100,700,400)),true);assert.ok(sdl.downs.at(-1).gap>=300);assert.equal(sdl.moves.length,movesBefore,'BOX cadence also follows ordinary native left clicks');
 const raw=new Input('pointerdown',{target:canvas,pointerType:'mouse',pointerId:77,button:0,buttons:1,clientX:200,clientY:200});documentListeners.get('pointerdown')(raw);canvas.dispatchEvent(raw);canvas.dispatchEvent(new Input('pointerup',{button:0,clientX:200,clientY:200}));frame();const rawAt=sdl.last,afterRawMoves=sdl.moves.length;assert.equal(await finish(controls.nativeBoxSelect(300,100,700,400)),true);assert.ok(sdl.downs.at(-1).at-rawAt>=300,'real canvas mouse-down is included in BOX cadence');assert.equal(sdl.moves.length,afterRawMoves);
 for(const mode of [{buildOpen:true,selectingTrucks:true},{buildOpen:true,selectingTrucks:false},{buildOpen:false,selectingTrucks:true}]){
  context.__warzoneCommands={isOpen:()=>false,report:()=>mode};hostFocused=true;const count=sdl.downs.length,active=controls.nativeBoxSelect(300,100,700,400);pressStarted(count);let stopped=false;windowListeners.get('blur')({target:blurTarget,stopImmediatePropagation(){stopped=true;}});assert.equal(stopped,true,'same-WebView BUILD/TRUCKS focus transfer stops SDL blur cancellation');assert.equal(await finish(active),true);
 }
 context.__warzoneCommands={isOpen:()=>false,report:()=>({buildOpen:true,selectingTrucks:true})};hostFocused=false;
 let count=sdl.downs.length;const backgrounded=controls.nativeBoxSelect(300,100,700,400);pressStarted(count);let stopped=false;windowListeners.get('blur')({target:blurTarget,stopImmediatePropagation(){stopped=true;}});assert.equal(stopped,false);assert.equal(await finish(backgrounded),false,'actual app/window focus loss safely cancels input');
 context.__warzoneCommands={isOpen:()=>false,report:()=>({buildOpen:false,selectingTrucks:false})};hostFocused=true;count=sdl.downs.length;const unrelated=controls.nativeBoxSelect(300,100,700,400);pressStarted(count);windowListeners.get('blur')({target:blurTarget,stopImmediatePropagation(){throw Error('Unrelated blur must propagate');}});assert.equal(await finish(unrelated),false);
 assert.equal(sdl.moves.length,afterRawMoves,'all subsequent BOX and blur/cancellation paths remain order-free');
 console.log('PASS: native SDL 250ms DOUBLECLICK/MOVE model, BOX-only 300ms cadence after all LMB sources, fresh input frame, normal fast clicks, cancellation and focus preservation');
})().catch(error=>{console.error(error);process.exitCode=1;});
