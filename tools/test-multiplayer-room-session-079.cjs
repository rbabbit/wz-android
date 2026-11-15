/* v0.79 room/session/adapter regressions using actual shipped scripts.
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
const checks=[];async function test(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{let fatal;try{
await test('opaque join requires matching complete native room snapshot and rendered identity',async()=>{
 const f=fixture();assert.equal(f.start(),true);assert.equal(f.node('loading-cover').hidden,false);
 f.session.nativeState({phase:'room',roomGeneration:'g1',lobbyReady:true,rendered:true});assert.equal(f.node('loading-cover').hidden,false);assert.equal(f.roomUi.visible,false);
 assert.equal(f.session.roomState({version:79,ready:true,generation:'wrong',revision:1}),false);
 assert.equal(f.session.roomState({version:79,ready:false,generation:'g1',revision:1}),false);
 assert.equal(f.session.roomState({version:79,ready:true,generation:'g1',revision:1}),true);
 assert.equal(f.session.phase,'room');assert.equal(f.node('loading-cover').hidden,true);assert.equal(f.roomUi.visible,true);assert.equal(f.frames[0].inert,true);assert.equal(f.node('game-controls').hidden,true);
});
await test('room snapshots reject regressing revisions and wrong phases and recover after loading',async()=>{
 const f=fixture();f.start();f.session.nativeState({phase:'room',roomGeneration:'g1',lobbyReady:true,rendered:true});f.session.roomState({version:79,ready:true,generation:'g1',revision:5});
 assert.equal(f.session.roomState({version:79,ready:true,generation:'g1',revision:4}),false);f.session.loading(true);assert.equal(f.roomUi.visible,false);assert.equal(f.node('loading-cover').hidden,false);assert.equal(f.session.roomState({version:79,ready:true,generation:'g1',revision:6}),false);
 f.session.loading(false);assert.equal(f.node('loading-cover').hidden,false);f.session.nativeState({phase:'room',roomGeneration:'g2',lobbyReady:true,rendered:true});assert.equal(f.session.roomState({version:79,ready:true,generation:'g1',revision:99}),false);assert.equal(f.session.roomState({version:79,ready:true,generation:'g2',revision:1}),true);assert.equal(f.roomUi.visible,true);
});
await test('room commands delegate only within current room and never enter world command queue',async()=>{
 const f=fixture();let calls=[];f.start();f.frames[0].contentWindow.PcMultiplayerNative={roomCommand(action,data){calls.push([action,data]);return Promise.resolve({ok:true});}};
 assert.equal((await f.session.roomCommand('chat',{text:'fixture'})).ok,false);f.session.nativeState({phase:'room',roomGeneration:'g1',lobbyReady:true,rendered:true});f.session.roomState({version:79,ready:true,generation:'g1',revision:1});
 for(const[action,data]of[['ready',{ready:true}],['chat',{text:'private fixture'}],['team',{team:1}],['spectator',{spectator:true}]])assert.equal((await f.session.roomCommand(action,data)).ok,true);
 assert.deepEqual(calls.map(c=>c[0]),['ready','chat','team','spectator']);assert.deepEqual(f.controlCalls.command,[]);
 assert.equal(f.session.handleBack('g1'),true);assert.equal(f.session.handleBack('old'),false);
 f.session.nativeState({phase:'game',worldReady:true,rendered:true});assert.equal(f.roomUi.visible,false);assert.equal(f.frames[0].inert,false);assert.equal((await f.session.roomCommand('ready',{ready:true})).ok,false);
});
await test('room leave rejoin and pagehide clear room identity under cover before transport teardown',async()=>{
 const f=fixture();f.start();f.session.nativeState({phase:'room',roomGeneration:'g1',lobbyReady:true,rendered:true});f.session.roomState({version:79,ready:true,generation:'g1',revision:1});f.session.returnToLobby('Private fixture exit');assert.equal(f.roomUi.visible,false);assert.equal(f.session.active,false);assert.equal(f.frames[0].removed,true);assert.equal((await f.session.roomCommand('chat',{text:'late'})).ok,false);
 assert(f.lifecycle.indexOf('native-active:false',1)<f.lifecycle.indexOf('connections-closed'));f.start();assert.equal(f.node('loading-cover').hidden,false);assert.equal(f.session.report().room.generation,null);f.pagehide();assert.equal(f.roomUi.visible,false);
});
await test('room bridge publishes native state before room and redelivers unchanged packets for cover recovery',async()=>{
 const f=adapterFixture();assert.deepEqual(f.deliveries.slice(0,2),[['state','room','room-1'],['room','room-1',1]]);f.deliveries.length=0;f.native.poll();assert.equal(f.deliveries.filter(v=>v[0]==='room').length,0);f.step(250);f.native.poll();assert.equal(f.deliveries.filter(v=>v[0]==='room').length,1);f.changeRoom({revision:2});f.native.poll();assert.equal(f.deliveries.at(-1)[2],2);f.changeRoom({generation:'old'});f.native.poll();assert.notEqual(f.deliveries.at(-1)[1],'old');
});
await test('ready requests use one atomic mailbox and wait matching native acknowledgement',async()=>{
 const f=adapterFixture(),pending=f.native.roomCommand('ready',{ready:true});const req=f.request();assert.equal(req.action,'ready');assert.equal(req.ready,true);assert.equal(req.generation,'room-1');assert.equal(f.files.has('/tmp/mp-mobile-room-input.json.tmp'),false);assert.deepEqual(f.writes.slice(-2).map(x=>x[0]),['write','rename']);assert.equal((await f.native.roomCommand('ready',{ready:false})).ok,false);
 f.ack({nonce:'wrong'});f.step(25);assert.equal(f.sandbox.PcMultiplayerNativeUI.report().roomPending,true);f.ack({generation:'wrong'});f.step(25);assert.equal(f.sandbox.PcMultiplayerNativeUI.report().roomPending,true);f.ack({ok:false,reason:'Host locked the room.'});f.step(25);const result=await pending;assert.equal(result.ok,false);assert.equal(result.reason,'Host locked the room.');assert.equal(f.sandbox.PcMultiplayerNativeUI.report().roomPending,false);assert.equal(f.native.room.revision,1,'ACK must not synthesize a new native roster or Ready state');
});
await test('team spectator and literal UTF8 chat preserve native payload types without client state mutation',async()=>{
 for(const[action,data]of[['team',{team:1}],['spectator',{spectator:true}],['chat',{text:'<b>你好</b>'}]]){const f=adapterFixture(),p=f.native.roomCommand(action,data),request=f.request();assert.equal(request.action,action);assert.equal(request[Object.keys(data)[0]],Object.values(data)[0]);f.ack();f.step(25);assert.equal((await p).ok,true);assert.equal(f.native.room.revision,1);}
});
await test('unknown or malformed room actions cannot write native mailbox',async()=>{
 const f=adapterFixture(),before=f.writes.length;for(const[action,data]of[['cheat',{}],['ready',{ready:'true'}],['team',{team:1.5}],['spectator',{}],['chat',{text:''}],['chat',{text:'x'.repeat(2049)}]])assert.equal((await f.native.roomCommand(action,data)).ok,false);assert.equal(f.writes.length,before);
});
await test('old matching ACK cannot survive a phase or generation change consumed by the same poll',async()=>{
 for(const next of [{phase:'game',worldReady:true},{phase:'room',roomGeneration:'room-2'}]){const f=adapterFixture(),p=f.native.roomCommand('ready',{ready:true});f.ack();f.changeState(next);f.step(25);assert.equal((await p).ok,false);assert.equal(f.sandbox.PcMultiplayerNativeUI.report().roomPending,false);}
});
await test('pending room intent cancels on pagehide and bounded timeout rather than retrying into a new session',async()=>{
 const f=adapterFixture(),p=f.native.roomCommand('chat',{text:'private fixture'});f.pagehide();f.step(25);assert.equal((await p).ok,false);assert.equal((await f.native.roomCommand('ready',{ready:true})).ok,false);
 const timeout=adapterFixture(),pending=timeout.native.roomCommand('ready',{ready:true});timeout.step(5000);const result=await pending;assert.equal(result.ok,false);assert.match(result.reason,/acknowledge/);assert.equal(timeout.sandbox.PcMultiplayerNativeUI.report().roomPending,false);
});
await test('atomic mailbox failure is reported and does not permanently block future room commands',async()=>{
 const f=adapterFixture();f.failRename(true);assert.equal((await f.native.roomCommand('ready',{ready:true})).ok,false);assert.equal(f.sandbox.PcMultiplayerNativeUI.report().roomPending,false);f.failRename(false);const p=f.native.roomCommand('ready',{ready:false});f.ack();f.step(25);assert.equal((await p).ok,true);
});
}catch(error){fatal=error.stack||String(error);console.error(fatal);process.exitCode=1;}
const crypto=require('node:crypto'),files=['app/src/main/assets/multiplayer/session.js','app/src/main/assets/multiplayer/native-ui-adapter.js','tools/test-multiplayer-room-session-079.cjs'];
const proof={version:'0.79',passed:!fatal,emulatorUsed:false,engineExecuted:false,actualAndroidKeyboardVerified:false,scope:'Actual shipped session and adapter functions in local VM with synthetic DOM, FS, timers and native packets. No network, native game or Android execution.',checks,checksPassed:checks.length,sources:files.map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')})),fatal:fatal||null};
fs.writeFileSync(path.join(root,'qa/multiplayer-room-079/session-host.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({passed:!fatal,checksPassed:checks.length}));
})();
