/* v0.82 spectator capability checks using actual shipped scripts.
 * Local VM only: no emulator, WASM, build or network. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/session.js'),'utf8');
function fixture(options={}){let musicSession="",musicSerial=0;const musicCalls=[],musicPlayers=[];let clock=0,seq=0,mode=0,closes=0,refreshes=0,name='Player',saved=[];const nodes=new Map(),timers=new Map(),intervals=new Map(),frames=[],lifecycle=[],listeners=new Map(),lookups=[],buttons=[],controlCalls={toggle:0,refresh:0,command:[],pages:[],phases:[]};
 const absent=new Set(['home','blocknight-help','warzone-towers-help-overlay']);
 const classList=()=>{const names=new Set();return{toggle(name,force){const enabled=force===undefined?!names.has(name):Boolean(force);enabled?names.add(name):names.delete(name);return enabled},contains:name=>names.has(name)}};
 const get=id=>{lookups.push(id);if(absent.has(id))throw Error('Removed MP node accessed: '+id);if(!nodes.has(id))nodes.set(id,{id,hidden:true,value:'',style:{setProperty(){}},dataset:{},children:[],attributes:{},classList:classList(),append(n){this.children.push(n)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]},addEventListener(){},getBoundingClientRect(){return{height:58}},focus(){},blur(){}});return nodes.get(id)};
 const markup=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/index.html'),'utf8');
 for(const match of markup.matchAll(/<button\b([^>]*)>/g)){const action=match[1].match(/data-command="([^"]+)"/);if(!action)continue;const id=match[1].match(/\bid="([^"]+)"/),button=get(id?id[1]:'fixture-button-'+buttons.length);button.dataset.command=action[1];buttons.push(button)}
 let controlState={combatLock:false,combatLockRequested:false,combatLockSuspended:false},researchOpen=false,intelOpen=false,buildOpen=false;
 const researchNode={hidden:true};
 const commands={setPhase(value){controlCalls.phases.push(value)},releaseAll(){if(options.music)lifecycle.push('controls-release')},report(){return controlState},toggleCombatLock(){controlCalls.toggle++;controlState.combatLockRequested=!controlState.combatLockRequested;return controlState.combatLockRequested},refreshCombatLock(){controlCalls.refresh++;return controlState.combatLock},command(action){controlCalls.command.push(action);return true}};
 const pages={toggle(kind){controlCalls.pages.push(kind);if(kind==='build'){buildOpen=!buildOpen;get('wt-command-pages').hidden=true}else{buildOpen=false;get('wt-command-pages').hidden=!get('wt-command-pages').hidden}},toggleDemolish(){buildOpen=false},close(){if(options.music)lifecycle.push('pages-close');buildOpen=false;get('wt-command-pages').hidden=true},report(){return{buildOpen}},isOpen(){return!get('wt-command-pages').hidden}};
 const research={report(){return{open:researchOpen}},open(){researchOpen=true;researchNode.hidden=false},close(){if(options.music)lifecycle.push('research-close');researchOpen=false;researchNode.hidden=true}};
 const intelligence={isOpen:()=>intelOpen,toggle(){intelOpen=!intelOpen;return true},close(){intelOpen=false}};
 const sandbox={Date:{now:()=>clock},TextEncoder,addEventListener(name,fn){listeners.set(name,fn)},setTimeout(fn,delay){const id=++seq;timers.set(id,{fn,at:clock+delay});return id},clearTimeout(id){timers.delete(id)},setInterval(fn){const id=++seq;intervals.set(id,fn);return id},clearInterval(id){intervals.delete(id)},document:{getElementById:get,documentElement:{style:{setProperty(){}}},body:{dataset:{},classList:classList()},querySelectorAll:s=>s==='[data-command]'?buttons:[],createElement(){lifecycle.push('frame-created');const frame={contentWindow:{document:{getElementById:id=>id==='blocknight-research-shell'?researchNode:null},LaunchedModule:{getMultiplayerGameMode:()=>mode},PcMultiplayerState:{},PcMultiplayerControls:commands,__warzoneCommands:pages,__blockNightResearch:research,__warzoneIntelligence:intelligence},remove(){this.removed=true;lifecycle.push('frame-removed')}};if(options.music)attachMusic(frame);frames.push(frame);return frame}},AndroidMultiplayer:{getPlayerName(){return name},setPlayerName(value){saved.push(value);if(!value||value.includes('\n'))return JSON.stringify({ok:false,name,error:'Invalid name'});name=value.trim();return JSON.stringify({ok:true,name,error:''})},setSessionActive(active){lifecycle.push('native-active:'+active);if(options.music){if(active&&!musicSession)musicSession='mp-fixture-'+(++musicSerial);if(!active)musicSession='';}},setViewportState(){},closeConnections(){closes++;lifecycle.push('connections-closed')},leave(){},home(){}},PcSocket:{receive(){}},refreshPcLobby(){refreshes++},innerWidth:1231,innerHeight:554};

 function attachMusic(frame){
  const state={battleActive:false,menuOpen:false,disposed:false};musicPlayers.push(state);
  frame.contentWindow.WarzoneMapMusic={
   setBattleActive(value){state.battleActive=Boolean(value);if(!value)state.menuOpen=false;musicCalls.push(['active',Boolean(value)]);},
   showMenu(button,host){musicCalls.push(['menu',button,host]);lifecycle.push('music-menu');if(!state.battleActive||state.disposed)return false;state.menuOpen=!state.menuOpen;button.setAttribute('aria-expanded',String(state.menuOpen));return true;},
   closeMenu(focus){musicCalls.push(['close',focus]);state.menuOpen=false;get('blocknight-music').setAttribute('aria-expanded','false');},
   dispose(){musicCalls.push(['dispose']);lifecycle.push('music-dispose');state.disposed=true;state.battleActive=false;state.menuOpen=false;},
   report(){return {...state};}
  };
  let url='';Object.defineProperty(frame,'src',{get:()=>url,set(value){url=value;lifecycle.push('frame-src:'+value);}});
 }
 if(options.music)sandbox.AndroidMultiplayerMusic={musicState(){lifecycle.push('music-state:'+musicSession);return JSON.stringify({session:musicSession});}};
 const roomUi={visible:false,generation:null,packets:[],shows:0,hides:0,resets:0,backs:[],valid(value){return value?.version===79&&value.ready===true&&value.generation!==undefined;},accept(value){this.packets.push(value);this.generation=value.generation;},show(value){this.visible=true;this.generation=value?.generation;this.shows++;},hide(){this.visible=false;this.hides++;},reset(){this.visible=false;this.generation=null;this.resets++;},handleBack(generation){this.backs.push(generation);return this.visible&&generation===this.generation;},report(){return {visible:this.visible,generation:this.generation};}};
 sandbox.PcMultiplayerRoomUI=roomUi;
 vm.runInNewContext(fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/lobby-config.js'),'utf8'),sandbox);
 vm.runInNewContext(source,sandbox,{filename:'session.js'});
 return{roomUi,sandbox,document:sandbox.document,musicCalls,musicPlayers,musicSession:()=>musicSession,session:sandbox.PcMultiplayerSession,node:get,frames,saved,lifecycle,lookups,buttons,controlCalls,setControlState(value){Object.assign(controlState,value)},pagehide(){listeners.get('pagehide')?.()},start(){return sandbox.start(['--join=test.invalid:2100'])},socket:(id,type,payload='')=>sandbox.PcSocket.receive(id,type,payload),mode(v){mode=v},poll(){for(const fn of intervals.values())fn()},step(ms){clock+=ms;let row;while(row=[...timers].find(([,t])=>t.at<=clock)){timers.delete(row[0]);row[1].fn()}},get closes(){return closes},get refreshes(){return refreshes}};
}

const adapterPath=path.join(root,'app/src/main/assets/multiplayer/native-ui-adapter.js'),adapterSource=fs.readFileSync(adapterPath,'utf8');
function adapterFixture(){
 let clock=0,serial=0,renameFails=false;const timers=new Map(),listeners=new Map(),files=new Map(),writes=[],deliveries=[];
 const state={phase:'room',roomGeneration:'room-1',lobbyReady:true,rendered:true,worldReady:false};
 const room={version:79,ready:true,generation:'room-1',revision:1,local:{allocated:true}};
 files.set('/tmp/mp-mobile-state.json',JSON.stringify(state));files.set('/tmp/mp-mobile-room.json',JSON.stringify(room));
 const sandbox={Promise,Date:{now:()=>clock},performance:{now:()=>clock},console:{warn(){}},setInterval(){},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout(id){timers.delete(id);},addEventListener(type,fn){listeners.set(type,fn)},CustomEvent:class{constructor(type,value){this.detail=value.detail;}},dispatchEvent(){},document:{body:{addEventListener(){}},documentElement:{},getElementById(){return null;}},parent:{PcMultiplayerSession:{nativeState(value){deliveries.push(['state',value.phase,value.roomGeneration]);},roomState(value){deliveries.push(['room',value.generation,value.revision]);}}}};
 vm.runInNewContext(adapterSource,sandbox,{filename:'native-ui-adapter.js'});
 const module={FS:{readFile(name){if(!files.has(name))throw Error('ENOENT');return files.get(name);},writeFile(name,value){files.set(name,value);writes.push(['write',name]);},rename(from,to){if(renameFails)throw Error('rename failed');files.set(to,files.get(from));files.delete(from);writes.push(['rename',from,to]);},unlink(name){files.delete(name);}}};
 sandbox.PcMultiplayerNativeUI.attach(module);
 return {sandbox,native:sandbox.PcMultiplayerNative,files,writes,deliveries,room,state,
  request(){return JSON.parse(files.get('/tmp/mp-mobile-room-input.json'));},
  ack(value={}){const request=this.request();files.set('/tmp/mp-mobile-room-input-result.json',JSON.stringify({...request,ok:true,...value}));},
  changeState(value){Object.assign(state,value);files.set('/tmp/mp-mobile-state.json',JSON.stringify(state));},
  changeRoom(value){Object.assign(room,value);files.set('/tmp/mp-mobile-room.json',JSON.stringify(room));},
  step(ms){clock+=ms;let next,guard=0;while(next=[...timers].find(([,r])=>r.at<=clock)){if(++guard>100)throw Error('Fixture timer loop');timers.delete(next[0]);next[1].fn();}},
  failRename(value){renameFails=value;},pagehide(){listeners.get('pagehide')?.();}};
}

const controlsSource=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/mobile-controls.js'),'utf8'),failures=[];
function controlFixture(options={}){
  let now=0,serial=0;const timers=new Map(),listeners=new Map(),windowListeners=new Map(),events=[],calls=[],menus=[];
  const cameraRequests=[];let pendingCamera=null,cameraCancels=0;
  const flags={intel:false,commands:false,research:false,blocker:false};
  const rect={left:20,top:10,right:820,bottom:510,width:800,height:500};
  const frameRect={left:100,top:58,right:900,bottom:558,width:800,height:500};
  const add=(map,type,fn)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(fn);};
  const timeout=(fn,delay=0)=>{const id=++serial;timers.set(id,{fn,due:now+Math.max(0,Number(delay)||0)});return id;};
  const clear=id=>timers.delete(id);
  class Event{
    constructor(type,options={}){this.type=type;Object.assign(this,options);}
    preventDefault(){this.defaultPrevented=true;}stopImmediatePropagation(){this.stopped=true;}
  }
  const node=id=>({id,hidden:false,setAttribute(name,value){this[name]=value;},classList:{toggle(){}},closest(){return null;}});
  const nodes=new Map();
  const frameElement={id:'warzone-game-frame',getBoundingClientRect:()=>frameRect,closest:s=>s==='#warzone-game-frame'?frameElement:null};
  const blocker=node('wt-build-sidebar');
  const parentDocument={body:{dataset:{research:'false'}},getElementById:id=>nodes.get(id)||null,
    elementFromPoint:()=>flags.blocker?blocker:frameElement};
  const canvas={id:'canvas',style:{},getBoundingClientRect:()=>rect,focus(){},setPointerCapture(){},releasePointerCapture(){},
    dispatchEvent(event){event.target=canvas;events.push(event);for(const fn of listeners.get(event.type)||[])fn(event);return true;}};
  const document={hidden:false,getElementById:id=>id==='canvas'?canvas:nodes.get(id)||null,
    addEventListener:(type,fn)=>add(listeners,type,fn),elementFromPoint:()=>flags.intel?node('mp-intelligence'):canvas};
  const limits={yawPeriod:65536,pitchMin:49516,pitchMax:65353,distanceMin:0,distanceMax:5000};
  const camera={x:2048,y:2048,yaw:10000,pitch:60000,distance:2600,limits};
  function applyCamera(target){
    if(Number.isFinite(target.yaw))camera.yaw=((Math.round(target.yaw)%65536)+65536)%65536;
    if(Number.isFinite(target.pitch))camera.pitch=Math.max(limits.pitchMin,Math.min(limits.pitchMax,Math.round(target.pitch)));
    if(Number.isFinite(target.distance))camera.distance=Math.max(limits.distanceMin,Math.min(limits.distanceMax,target.distance));
  }
  const native={state:{worldReady:true,nativeMenuOpen:false,view:{width:1600,height:1000,camera},radar:{visible:true,left:1200,top:600,right:1600,bottom:1000}},
    setCamera:target=>{cameraRequests.push({at:now,...target});pendingCamera={...target};if(!options.deferCamera){applyCamera(pendingCamera);pendingCamera=null;}return true;},
    cancelCamera:()=>{cameraCancels++;pendingCamera=null;return true;},
    command:(action,payload)=>{calls.push({action,payload});return Promise.resolve({ok:true});}};
  const commands={isOpen:()=>flags.commands,isPlacement:()=>false,isDemolishing:()=>false,beginLinePlacement:()=>null,
    selectNearbyTrucks:()=>{calls.push({action:'visible-trucks'});return Promise.resolve([101]);},toggle:()=>true};
  const parent={document:parentDocument,WarzoneHost:{},PcMultiplayerSession:{command:action=>{menus.push(action);return true;}}};
  const state={phase:'game',worldReady:true,nativeMenuOpen:false};
  const window={document,parent,frameElement,PcMultiplayerState:state,PcMultiplayerNative:native,__warzoneCommands:commands,
    __warzoneIntelligence:{isOpen:()=>flags.intel,report:()=>({open:flags.intel}),close:()=>{flags.intel=false;}},
    __blockNightResearch:{report:()=>({open:flags.research}),close:()=>{flags.research=false;}},
    addEventListener:(type,fn)=>add(windowListeners,type,fn)};
  vm.runInNewContext(controlsSource,{window,document,devicePixelRatio:2,performance:{now:()=>now},
    setTimeout:timeout,clearTimeout:clear,requestAnimationFrame:fn=>timeout(()=>fn(now),16),
    PointerEvent:Event,KeyboardEvent:Event,WheelEvent:Event,console});
  const control=window.PcMultiplayerControls,touch=window.__kalaWarzoneTouch;control.enable();
  const micro=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  async function advance(ms){const end=now+ms;await micro();let turns=0;
    while(turns++<20000){const next=[...timers.entries()].sort((a,b)=>a[1].due-b[1].due)[0];if(!next||next[1].due>end)break;
      timers.delete(next[0]);now=next[1].due;next[1].fn();await micro();}
    now=end;await micro();
  }
  async function until(predicate,label,limit=2500){for(let elapsed=0;elapsed<=limit;elapsed+=16){await micro();if(predicate())return true;await advance(16);}failures.push('Timed out: '+label);return false;}
  async function result(promise,label){let settled=false,value;Promise.resolve(promise).then(v=>{settled=true;value=v;},error=>{settled=true;failures.push(label+': '+error);});await until(()=>settled,label);return value;}
  const emit=(type,x,y,id=1)=>{const event=new Event(type,{pointerType:'touch',pointerId:id,clientX:x,clientY:y,target:canvas});for(const fn of listeners.get(type)||[])fn(event);return event;};
  const fire=(type)=>{for(const fn of windowListeners.get(type)||[])fn();};
  const idle=()=>!control.report().queued&&!control.report().activeJob;
  return {control,touch,flags,nodes,events,calls,menus,emit,advance,until,result,idle,fire,state,native,document,parentDocument,camera,cameraRequests,
    consumeCamera(){if(pendingCamera){applyCamera(pendingCamera);pendingCamera=null;}},cameraCancels:()=>cameraCancels,
    rect,frameRect,window,dispose(){fire('pagehide');timers.clear();}};
}

const checks=[];async function test(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const world={phase:'game',worldReady:true,worldSafe:true,cameraSafe:true,rendered:true,player:0,realPlayer:0,spectator:false,canIssueOrders:true};
const observer={...world,player:14,realPlayer:14,spectator:true,canIssueOrders:false};
function capabilities(f,value){Object.assign(f.state,value);Object.assign(f.native.state,value);}
async function controlCheck(run){const f=controlFixture();try{await run(f);}finally{f.dispose();}}
function adapterWorld(f,value){f.changeState({...world,...value});f.native.poll();}
const micro=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
(async()=>{let fatal;try{
await test('rendered spectator world reveals without owned facilities and preserves Music, Lobby and native status',async()=>{
 const f=fixture({music:true});assert.equal(f.start(),true);
 f.session.nativeState({...observer,power:0,queuedPower:0,uiStatus:{timerText:'00:03:21',connectionText:'',kind:'normal'}});
 assert.equal(f.session.phase,'game');assert.equal(f.node('loading-cover').hidden,true);assert.equal(f.frames[0].inert,false);
 for(const id of ['blocknight-tech','wt-open-factory','wt-open-queue','blocknight-base','blocknight-combat','unit-controls','mp-power-hud'])assert.equal(f.node(id).hidden,true,id);
 assert.equal(f.node('warzone-command-strip').hidden,false);assert.equal(f.node('mp-native-timer').textContent,'00:03:21');
 assert.equal(f.document.body.classList.contains('mp-observer'),true);assert.equal(f.session.command('music'),true);assert.equal(f.musicPlayers[0].battleActive,true);
 for(const name of ['research','manufacturing','queue','build','demolish','intelligence','combat','all-units','trucks','stop','deselect','base'])assert.equal(f.session.command(name),false,name);
 assert.equal(f.controlCalls.toggle,0);assert.deepEqual(f.controlCalls.command,[]);assert.deepEqual(f.controlCalls.pages,[]);
 f.poll();assert.equal(f.node('unit-controls').hidden,true);assert.equal(f.node('blocknight-combat').attributes['aria-pressed'],'false');
});
await test('watching another player never grants their owner menus even with inconsistent allow flag',async()=>{
 const f=fixture();f.start();f.session.nativeState({...world,realPlayer:14,player:0,canIssueOrders:true,spectator:false});
 assert.equal(f.session.phase,'game');assert.equal(f.node('unit-controls').hidden,true);assert.equal(f.session.command('research'),false);assert.equal(f.session.command('combat'),false);
 assert.equal(f.frames[0].contentWindow.PcMultiplayerState.realPlayer,14);assert.equal(f.frames[0].contentWindow.PcMultiplayerState.cameraSafe,true);
});
await test('player-to-observer transition closes stale owner overlays once and normal owner state restores controls',async()=>{
 const f=fixture({music:true});f.start();f.session.nativeState({...world,power:2500,queuedPower:0});
 assert.equal(f.session.command('research'),true);assert.equal(f.session.command('manufacturing'),true);f.setControlState({combatLock:true});
 f.session.nativeState(observer);assert.equal(f.node('wt-command-pages').hidden,true);assert.equal(f.node('mp-power-hud').hidden,true);
 const releases=f.lifecycle.filter(v=>v==='controls-release').length;f.session.nativeState(observer);assert.equal(f.lifecycle.filter(v=>v==='controls-release').length,releases);
 f.session.nativeState({...world,power:2400,queuedPower:0});f.poll();
 assert.equal(f.document.body.classList.contains('mp-observer'),false);assert.equal(f.node('unit-controls').hidden,false);assert.equal(f.node('blocknight-tech').hidden,false);assert.equal(f.node('mp-power-hud').hidden,false);assert.equal(f.session.command('research'),true);
});
await test('adapter denies all owner input and automatic Combat for spectator and watched-player identities',async()=>{
 for(const flags of [observer,{...world,realPlayer:14,player:0}]){
  const f=adapterFixture();adapterWorld(f,flags);const before=f.writes.length;
  for(const action of ['select-box','deselect','stop','trucks'])assert.equal((await f.native.command(action,{})).reason,'spectator-read-only');
  assert.equal(f.native.setCombatLock({enabled:true,suspended:false,activation:'owner'}),false);
  assert.equal(f.sandbox.__towersHtml.isEnded(),true);assert.equal(f.sandbox.__towersHtml.isActive(),false);
  assert.equal(f.writes.length,before);assert.equal(f.native.setCombatLock({enabled:false,suspended:true}),true,'OFF is permitted for teardown');
 }
});
await test('adapter camera capability is separate from ownership and rejects explicit unsafe camera frames',async()=>{
 const f=adapterFixture();adapterWorld(f,{...observer,worldSafe:false,cameraSafe:true});assert.equal(f.native.setCamera({yaw:2000,pitch:60000,distance:1600}),true);
 assert.ok(f.files.has('/tmp/mp-mobile-camera.json'));adapterWorld(f,{...observer,worldSafe:true,cameraSafe:false});
 const before=f.writes.length;assert.equal(f.native.setCamera({yaw:3000}),false);assert.equal(f.writes.length,before);
 adapterWorld(f,world);assert.equal(f.native.setCamera({yaw:4000}),true);assert.equal(f.sandbox.__towersHtml.isEnded(),false);
});
await test('same-poll observer transition cannot accept an old owner input acknowledgement',async()=>{
 const f=adapterFixture();adapterWorld(f,world);const pending=f.native.command('select-box',{});await micro();
 const request=JSON.parse(f.files.get('/tmp/mp-mobile-input.json'));f.files.set('/tmp/mp-mobile-input-result.json',JSON.stringify({nonce:request.nonce,ok:true}));
 f.changeState(observer);f.step(16);assert.equal((await pending).ok,false);assert.equal(f.native.state.spectator,true);
});
await test('late facility callback cannot open owner pages after its refresh becomes observer-only',async()=>{
 const f=adapterFixture();adapterWorld(f,world);let opened=0;
 f.sandbox.__warzoneCommands={send:async()=>{adapterWorld(f,observer);return{ok:true};},openFactory(){opened++;}};
 f.sandbox.__blockNightResearch={openForLabId(){opened++;}};
 f.sandbox.wz_js_mp_facility_selected(15,'research');f.step(0);await micro();assert.equal(opened,0);
 f.sandbox.wz_js_mp_facility_selected(16,'factory');f.step(0);await micro();assert.equal(opened,0);
});
await test('observer cannot receive stale owned research reports while terrain remains usable',async()=>{
 const f=adapterFixture();let accepted=0;f.sandbox.__warzoneIntelligence={acceptReports(){accepted++;}};
 f.files.set('/tmp/mp-mobile-terrain.json',JSON.stringify({revision:1000,width:4,height:4}));f.files.set('/tmp/mp-mobile-reports.json',JSON.stringify({ready:true,reports:[{id:'old'}]}));
 adapterWorld(f,{...observer,gameTime:1000});assert.equal(f.native.terrain.width,4);assert.equal(f.native.reports.ready,false);assert.equal(accepted,0);
});
await test('spectator short and held world taps forward no selection or orders',()=>controlCheck(async f=>{
 capabilities(f,observer);f.emit('pointerdown',250,150);f.emit('pointerup',250,150);await f.advance(300);
 f.emit('pointerdown',250,150);await f.advance(350);f.emit('pointerup',250,150);await f.advance(300);
 assert.equal(f.events.filter(e=>e.type==='pointerdown').length,0);assert.deepEqual(f.calls,[]);
 for(const name of ['research','manufacturing','build','queue','combat','all-units','trucks','stop','deselect','base'])assert.equal(f.control.command(name),false,name);
 assert.equal(f.control.setCombatLock(true),false);assert.equal(await f.touch.nativeWorldClick(250,150),false);assert.equal(await f.touch.nativeBoxSelect(100,100,200,200),false);assert.equal(f.touch.nativePressKey('u','KeyU',85),false);assert.equal(f.touch.activateFooterBuild(),false);
}));
await test('spectator delayed swipe pans with middle drag rather than box selection',()=>controlCheck(async f=>{
 capabilities(f,observer);f.emit('pointerdown',250,150);await f.advance(350);f.emit('pointermove',300,180);assert.equal(await f.until(()=>f.control.report().heldMouse===1,'observer pan'),true);
 f.emit('pointerup',330,190);await f.until(f.idle,'pan release');assert.equal(f.control.report().boxes,0);assert.equal(f.control.report().pans,1);
 assert.ok(f.events.some(e=>e.type==='pointerdown'&&e.button===1));assert.ok(!f.events.some(e=>e.type==='pointerdown'&&e.button===0));assert.deepEqual(f.calls,[]);
}));
await test('spectator pinch and minimap camera remain available even without world-owner safety',()=>controlCheck(async f=>{
 capabilities(f,{...observer,worldSafe:false,cameraSafe:true});f.emit('pointerdown',350,200,1);f.emit('pointerdown',450,200,2);
 f.emit('pointermove',320,200,1);f.emit('pointermove',480,200,2);await f.advance(40);
 assert.ok(f.cameraRequests.some(v=>v.distance<2600));f.emit('pointerup',320,200,1);f.emit('pointerup',480,200,2);await f.advance(150);
 f.emit('pointerdown',700,400);f.emit('pointerup',700,400);await f.until(f.idle,'radar camera');assert.ok(f.events.some(e=>e.type==='pointerdown'&&e.button===2));assert.deepEqual(f.calls,[]);
}));
await test('watched-player and unsafe-camera packets cannot bypass facade or queued touch guards',()=>controlCheck(async f=>{
 capabilities(f,world);const click=f.touch.nativeWorldClick(250,150);capabilities(f,{...world,realPlayer:14});assert.equal(await f.result(click,'cancel owner click'),false);
 assert.ok(!f.events.some(e=>e.type==='pointerdown'));assert.equal(f.control.command('all-units'),false);
 capabilities(f,{...observer,worldSafe:true,cameraSafe:false});f.emit('pointerdown',250,150);f.emit('pointermove',300,180);f.emit('pointerup',330,190);await f.advance(250);
 assert.equal(f.control.report().cameraSafe,false);assert.equal(f.cameraRequests.length,0);assert.ok(!f.events.some(e=>e.type==='pointerdown'));
}));
await test('normal owner taps, truck routing, box selection and legacy packets retain their paths',()=>controlCheck(async f=>{
 capabilities(f,world);f.emit('pointerdown',250,150);f.emit('pointerup',250,150);await f.until(f.idle,'player tap');assert.ok(f.events.some(e=>e.type==='pointerdown'&&e.button===0));
 assert.notEqual(f.control.command('trucks'),false);assert.ok(f.calls.some(v=>v.action==='visible-trucks'));
 assert.equal(await f.touch.nativeBoxSelect(100,100,200,200),true);assert.ok(f.calls.some(v=>v.action==='select-box'));
 for(const key of ['canIssueOrders','spectator','realPlayer','player','cameraSafe'])delete f.state[key];assert.equal(f.control.command('base'),true);await f.until(f.idle,'legacy owner shortcut');assert.ok(f.events.some(e=>e.type==='keydown'&&e.code==='KeyB'));
}));
await test('observer-only CSS fences dynamically recreated shared panels without affecting room or normal players',async()=>{
 const css=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/multiplayer.css'),'utf8');
 assert.match(css,/body\.mp-shell\.mp-observer #lab-ops[^}]*#unit-controls[^}]*#wt-build-sidebar[^}]*#wt-command-pages[^}]*#mp-power-hud\{display:none!important\}/);
 const f=fixture();f.start();f.session.nativeState(observer);f.session.nativeState({phase:'room',lobbyReady:true,rendered:true,roomGeneration:'room-2'});
 assert.equal(f.document.body.classList.contains('mp-observer'),false);
});
assert.deepEqual(failures,[]);
}catch(error){fatal=error.stack||String(error);console.error(fatal);process.exitCode=1;}
const crypto=require('node:crypto'),files=['app/src/main/assets/multiplayer/session.js','app/src/main/assets/multiplayer/native-ui-adapter.js','app/src/main/assets/multiplayer/mobile-controls.js','app/src/main/assets/multiplayer/multiplayer.css','app/src/main/assets/multiplayer/lobby-config.js','tools/test-multiplayer-spectator-ui-082.cjs'];
const proof={version:'0.82',passed:!fatal,emulatorUsed:false,engineExecuted:false,actualAndroidTouchVerified:false,scope:'Actual Multiplayer session, adapter and touch source in deterministic VM with synthetic capability/native packets; no native engine, Android, network or public-room actions.',checks,checksPassed:checks.length,sources:files.map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')})),fatal:fatal||null};
fs.mkdirSync(path.join(root,'qa/multiplayer-spectator-082'),{recursive:true});fs.writeFileSync(path.join(root,'qa/multiplayer-spectator-082/ui-host.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:!fatal,checksPassed:checks.length}));
})();

