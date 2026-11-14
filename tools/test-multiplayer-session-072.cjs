/* v0.72 session/music regressions; copied from retained v0.71 and extended.
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
 vm.runInNewContext(source,sandbox,{filename:'session.js'});
 return{sandbox,document:sandbox.document,musicCalls,musicPlayers,musicSession:()=>musicSession,session:sandbox.PcMultiplayerSession,node:get,frames,saved,lifecycle,lookups,buttons,controlCalls,setControlState(value){Object.assign(controlState,value)},pagehide(){listeners.get('pagehide')?.()},start(){return sandbox.start(['--join=test.invalid:2100'])},socket:(id,type,payload='')=>sandbox.PcSocket.receive(id,type,payload),mode(v){mode=v},poll(){for(const fn of intervals.values())fn()},step(ms){clock+=ms;let row;while(row=[...timers].find(([,t])=>t.at<=clock)){timers.delete(row[0]);row[1].fn()}},get closes(){return closes},get refreshes(){return refreshes}};
}
let count=0;const checks=[];function test(name,fn){fn();count++;checks.push(name);console.log('PASS '+name)}
test('joining is opaque before engine creation and ordinary socket/acceptance do not reveal it',()=>{const f=fixture();assert.equal(f.start(),true);assert.equal(f.node('loading-cover').hidden,false);assert.equal(f.frames[0].id,'warzone-game-frame');f.socket(1,'open');f.session.message('Accepted into the game');f.session.engineReady();f.mode(1);f.poll();assert.equal(f.node('loading-cover').hidden,false);assert.equal(f.session.phase,'connecting');assert.equal(f.node('game-controls').hidden,true)});
test('room requires both actual readiness and a rendered frame',()=>{const f=fixture();f.start();f.session.nativeState({phase:'room',lobbyReady:true,rendered:false});assert.equal(f.session.phase,'connecting');f.session.nativeState({phase:'room',lobbyReady:true,rendered:true});assert.equal(f.session.phase,'room');assert.equal(f.node('loading-cover').hidden,true);assert.equal(f.node('room-leave').hidden,false);assert.equal(f.node('game-controls').hidden,true)});
test('loading invalidates previous room/game readiness, including mode transition gap',()=>{const f=fixture();f.start();f.session.nativeState({phase:'room',lobbyReady:true,rendered:true});f.session.loading(true);assert.equal(f.node('loading-cover').hidden,false);f.mode(1);f.session.loading(false);assert.equal(f.session.phase,'connecting');assert.equal(f.node('game-controls').hidden,true);f.session.nativeState({phase:'game',worldReady:true,rendered:true,radar:{visible:false}});assert.equal(f.session.phase,'game');assert.equal(f.node('loading-cover').hidden,true);assert.equal(f.node('game-controls').hidden,false)});
test('autohost redirect re-covers and socket-open cannot hide joining cover',()=>{const f=fixture();f.start();f.session.nativeState({phase:'room',lobbyReady:true,rendered:true});f.session.message('net |17:06:44: [stopJoining:1] Canceling game...');f.session.message('net |17:06:44: [updateJoiningStatus:1485] Establishing connection with host');f.socket(2,'open');f.step(1000);assert.equal(f.session.active,true);assert.equal(f.node('loading-cover').hidden,false);assert.equal(f.session.phase,'connecting');f.session.nativeState({phase:'room',lobbyReady:true,rendered:true});assert.equal(f.node('loading-cover').hidden,true)});
test('profile is saved before native start and invalid names cannot start an engine',()=>{const f=fixture();assert.equal(f.node('player-name').value,'Player');f.node('player-name').value='noobcrusher';assert.equal(f.start(),true);assert.equal(f.saved[0],'noobcrusher');assert.equal(f.session.playerName(),'noobcrusher');const bad=fixture();bad.node('player-name').value='bad\nname';assert.equal(bad.start(),false);assert.equal(bad.frames.length,0);assert.equal(bad.session.active,false);assert.equal(bad.node('profile-status').textContent,'Invalid name')});
test('Java Back cache is updated synchronously before native start and teardown, then cleared on pagehide',()=>{const f=fixture();assert.deepEqual(f.lifecycle,['native-active:false']);assert.equal(f.start(),true);assert.ok(f.lifecycle.indexOf('native-active:true')<f.lifecycle.indexOf('frame-created'));f.session.returnToLobby('Return');const clear=f.lifecycle.lastIndexOf('native-active:false');assert.ok(clear<f.lifecycle.indexOf('connections-closed'));assert.ok(clear<f.lifecycle.indexOf('frame-removed'));assert.equal(f.start(),true);assert.equal(f.lifecycle[f.lifecycle.length-2],'native-active:true');f.pagehide();assert.equal(f.lifecycle[f.lifecycle.length-1],'native-active:false');const invalid=fixture();invalid.node('player-name').value='bad\nname';assert.equal(invalid.start(),false);assert.deepEqual(invalid.lifecycle,['native-active:false'])});
test('terminal error keeps full reason and app return tears down the engine',()=>{const f=fixture();f.start();f.socket(1,'open');f.session.message('Failed to join with error: Wrong password');f.session.message('Contact host.');f.step(250);assert.equal(f.session.active,false);assert.equal(f.node('notice').textContent,'Wrong password\nContact host.');assert.equal(f.frames[0].removed,true);assert.equal(f.closes,1);assert.equal(f.refreshes,1)});
test('native leaving covers before teardown and never reveals stock frontend',()=>{const f=fixture();f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});f.session.nativeState({phase:'leaving',rendered:false});assert.equal(f.node('loading-cover').hidden,false);f.step(250);assert.equal(f.session.active,false);assert.equal(f.node('engine-host').hidden,true)});
test('repeated leaving frames cannot postpone return forever',()=>{const f=fixture();f.start();for(let i=0;i<4;i++){f.session.nativeState({phase:'leaving',rendered:false});f.step(70)}assert.equal(f.session.active,false)});
test('pre-acceptance endpoint close leaves time for native fallback',()=>{const f=fixture();f.start();f.socket(1,'open');f.socket(1,'data','QUJDRA==');f.socket(1,'close');f.step(1000);assert.equal(f.session.active,true);assert.equal(f.session.report().roomEstablished,false);assert.equal(f.node('loading-cover').hidden,false);f.socket(2,'open');assert.equal(f.node('transition').hidden,true)});
test('native kick after socket close retains terminal multiline reason',()=>{const f=fixture();f.start();f.socket(1,'open');f.session.message('Accepted into the game');f.socket(1,'close');f.session.message('You have been kicked, because Data check failed');f.session.message('Different ruleset');f.socket(1,'error','Connection closed');f.step(250);assert.equal(f.session.active,false);assert.equal(f.node('notice').textContent,'Data check failed\nDifferent ruleset')});
test('power HUD uses actual native integers and updates spending, income and queued reservations',()=>{const f=fixture();f.start();f.step(500);f.session.nativeState({phase:'game',worldReady:true,rendered:true,power:2415,queuedPower:0});assert.equal(f.node('mp-power-hud').hidden,false);assert.equal(f.node('mp-power-value').textContent,'2415');assert.equal(f.node('mp-power-available').style.width,'48.3%');f.session.nativeState({phase:'game',worldReady:true,rendered:true,power:2100,queuedPower:400});assert.equal(f.node('mp-power-value').textContent,'2100');assert.equal(f.node('mp-power-available').style.width,'34%');assert.equal(f.node('mp-power-reserved').style.width,'8%');assert.match(f.node('mp-power-hud').attributes['aria-label'],/400 queued.*1700 available/);f.session.nativeState({phase:'game',worldReady:true,rendered:true,power:12000,queuedPower:0});assert.equal(f.node('mp-power-value').textContent,'12000');assert.equal(f.node('mp-power-available').style.width,'60%');f.session.nativeState({phase:'game',worldReady:true,rendered:true,power:0,queuedPower:0});assert.equal(f.node('mp-power-value').textContent,'0');assert.equal(f.node('mp-power-available').style.width,'0%');f.session.loading(true);assert.equal(f.node('mp-power-hud').hidden,true)});
test('power HUD hides missing/fractional state and avoids footer/radar overlap',()=>{const f=fixture();f.start();f.step(500);f.session.nativeState({phase:'room',lobbyReady:true,rendered:true,power:2500,queuedPower:0});assert.equal(f.node('mp-power-hud').hidden,true);f.session.nativeState({phase:'game',worldReady:true,rendered:true});assert.equal(f.node('mp-power-hud').hidden,true);f.session.nativeState({phase:'game',worldReady:true,rendered:true,power:12.5});assert.equal(f.node('mp-power-hud').hidden,true);const dock=f.node('lab-ops');dock.hidden=false;dock.getBoundingClientRect=()=>({right:344,height:45});f.frames[0].getBoundingClientRect=()=>({left:0,width:1231});f.step(500);f.session.nativeState({phase:'game',worldReady:true,rendered:true,power:2500,queuedPower:0,view:{width:1231},radar:{visible:true,left:1000}});const h=f.node('mp-power-hud'),w=parseFloat(h.style.width),x=parseFloat(h.style.left);assert.ok(x-w/2>=356);assert.ok(x+w/2<=988);dock.getBoundingClientRect=()=>({right:1050,height:45});f.step(500);f.session.nativeState({phase:'game',worldReady:true,rendered:true,power:2500,queuedPower:0,view:{width:1231},radar:{visible:true,left:1000}});assert.equal(h.style.bottom,'59px')});
test('header shows only actual visible native timer and connection text and clears stale status',()=>{const f=fixture();f.start();const state={phase:'game',worldReady:true,rendered:true,uiStatus:{timerText:'00:01:53',connectionText:'Waiting for other players',kind:'warning'}};f.session.nativeState({...state,rendered:false});assert.equal(f.node('mp-header-status').hidden,true);f.session.nativeState(state);assert.equal(f.node('mp-header-status').hidden,false);assert.equal(f.node('mp-native-timer').textContent,'00:01:53');assert.equal(f.node('mp-native-connection').textContent,'Waiting for other players');assert.equal(f.node('mp-header-status').dataset.kind,'warning');f.session.nativeState({...state,uiStatus:{timerText:'00:01:52',connectionText:'',kind:'normal'}});assert.equal(f.node('mp-native-timer').textContent,'00:01:52');assert.equal(f.node('mp-native-connection').hidden,true);f.session.nativeState({...state,uiStatus:{timerText:'',connectionText:'<player> dropped',kind:'warning'}});assert.equal(f.node('mp-native-timer').hidden,true);assert.equal(f.node('mp-native-connection').textContent,'<player> dropped');assert.equal(f.node('mp-native-connection').innerHTML,undefined);f.session.nativeState({...state,uiStatus:{timerText:'',connectionText:''}});assert.equal(f.node('mp-header-status').hidden,true);f.session.nativeState(state);f.session.loading(true);assert.equal(f.node('mp-header-status').hidden,true);f.session.loading(false);f.session.nativeState(state);f.session.nativeState({phase:'room',lobbyReady:true,rendered:true,uiStatus:state.uiStatus});assert.equal(f.node('mp-header-status').hidden,true);f.session.nativeState(state);f.session.nativeState({phase:'leaving',uiStatus:state.uiStatus});assert.equal(f.node('mp-header-status').hidden,true)});
test('native status mount precedes Lobby and has bounded shrinking text without resizing the button',()=>{const html=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/index.html'),'utf8'),css=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/multiplayer.css'),'utf8');assert.ok(html.indexOf('id="mp-header-status"')<html.indexOf('id="leave"'));assert.match(html,/id="mp-native-timer" hidden role="timer" aria-live="off"/);assert.match(html,/id="mp-native-connection" hidden role="status" aria-live="polite"/);assert.match(css,/#mp-header-status\{[^}]*min-width:0;[^}]*max-width:26vw;[^}]*max-height:36px/);assert.match(css,/#mp-header-status span\{[^}]*text-overflow:ellipsis;white-space:nowrap/);assert.match(css,/#leave\{flex:none/)});
test('config seeds stock HUD settings and saved name without losing unrelated options',()=>{const sandbox={TextEncoder};vm.runInNewContext(fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/lobby-config.js'),'utf8'),sandbox);const config=sandbox.PcLobbyConfig.update('[General]\nplayerName=Old\ngroupmenu=1\ngroupmenu=1\noptionsButtonVisibility=2\nvolume=75\n[Video]\nwidth=1231\n','noobcrusher');assert.match(config,/playerName=noobcrusher/);assert.equal((config.match(/groupmenu=0/g)||[]).length,1);assert.match(config,/optionsButtonVisibility=0/);assert.match(config,/volume=75/);assert.match(config,/\[Video\]\nwidth=1231/);assert.throws(()=>sandbox.PcLobbyConfig.update('', 'a\nplayerName=x'));assert.throws(()=>sandbox.PcLobbyConfig.validatePlayerName('1234567890123456'));assert.equal(sandbox.PcLobbyConfig.validatePlayerName('[RB]A'),'[RB]A')});
test('removed Home and Help nodes have no session lookup or command wiring',()=>{const f=fixture();assert.equal(f.start(),true);f.session.nativeState({phase:'game',worldReady:true,rendered:true});for(const action of['research','research','manufacturing','queue','build','intelligence','deselect'])f.session.command(action);f.poll();f.session.returnToLobby('Return');assert.ok(!f.lookups.some(id=>['home','blocknight-help','warzone-towers-help-overlay'].includes(id)));assert.ok(!f.buttons.some(b=>b.dataset.command==='help'));assert.doesNotMatch(source,/byId\(['"](?:home|blocknight-help|warzone-towers-help-overlay)['"]\)/);assert.doesNotMatch(source,/action\s*===\s*['"]help['"]/)});
test('header Combat toggles persistent lock exactly once and leaves All Units as its own action',()=>{const f=fixture();f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});const combat=f.node('blocknight-combat');combat.onclick();assert.equal(f.controlCalls.toggle,1);assert.deepEqual(f.controlCalls.command,[]);assert.equal(combat.attributes['aria-pressed'],'false','pending requested ON must not imply native confirmation');combat.onclick();assert.equal(f.controlCalls.toggle,2);assert.deepEqual(f.controlCalls.command,[]);const all=f.buttons.find(b=>b.dataset.command==='all-units');all.onclick();assert.deepEqual(f.controlCalls.command,['all-units']);assert.equal(f.controlCalls.toggle,2)});
test('Combat highlight follows confirmed native state, including suspension and phase resets',()=>{const f=fixture();f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});const b=f.node('blocknight-combat');f.setControlState({combatLockRequested:true,combatLock:false});f.poll();assert.equal(b.attributes['aria-pressed'],'false');assert.equal(b.classList.contains('active'),false);f.setControlState({combatLock:true,combatLockSuspended:true});f.poll();assert.equal(b.attributes['aria-pressed'],'true');assert.equal(b.classList.contains('active'),true);assert.equal(b.dataset.suspended,'true');f.setControlState({combatLock:false,combatLockRequested:true,combatLockSuspended:false});f.poll();assert.equal(b.attributes['aria-pressed'],'false');assert.equal(b.classList.contains('active'),false);assert.equal(b.dataset.suspended,'false');f.setControlState({combatLock:true});f.session.loading(true);f.poll();assert.equal(b.attributes['aria-pressed'],'false');assert.equal(b.classList.contains('active'),false)});
test('command/page/build transitions and periodic chrome synchronization refresh Combat lock',()=>{const f=fixture();f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});for(const action of['research','research','manufacturing','queue','build','build','demolish','intelligence','deselect']){const before=f.controlCalls.refresh;f.session.command(action);assert.equal(f.controlCalls.refresh,before+1,'refresh after '+action)}const page=f.node('wt-command-pages');page.hidden=false;f.poll();assert.equal(f.node('unit-controls').hidden,true);assert.equal(f.node('wt-field-centre').hidden,true);const before=f.controlCalls.refresh;page.hidden=true;f.poll();assert.equal(f.node('unit-controls').hidden,false);assert.equal(f.controlCalls.refresh,before+1);assert.deepEqual(f.controlCalls.pages,['factory','queue','build','build'])});
test('native activation precedes music-token read and iframe URL, with a distinct token for the next join',()=>{
 const f=fixture({music:true});f.start();
 const active=f.lifecycle.indexOf('native-active:true'),read=f.lifecycle.indexOf('music-state:mp-fixture-1');
 const src=f.lifecycle.findIndex(v=>v.startsWith('frame-src:'));
 assert.ok(active<read&&read<src);assert.equal(f.frames[0].src,'engine.html?battle_session=mp-fixture-1');
 f.session.returnToLobby('Return');assert.equal(f.musicSession(),'');f.start();
 assert.equal(f.frames[1].src,'engine.html?battle_session=mp-fixture-2');
 assert.equal(f.musicPlayers[0].disposed,true);assert.equal(f.musicPlayers[1].disposed,false);
});
test('invalid player names do not mint/read a music token or create an engine',()=>{
 const f=fixture({music:true});f.node('player-name').value='bad\nname';
 assert.equal(f.start(),false);assert.equal(f.musicSession(),'');assert.equal(f.frames.length,0);
 assert.ok(!f.lifecycle.some(v=>v.startsWith('music-state:')));
});
test('Music commands are available only after an actual rendered game',()=>{
 const f=fixture({music:true});assert.equal(f.session.command('music'),false);f.start();
 assert.equal(f.session.command('music'),false);
 f.session.nativeState({phase:'room',lobbyReady:true,rendered:true});assert.equal(f.session.command('music'),false);
 f.session.nativeState({phase:'game',worldReady:true,rendered:false});assert.equal(f.session.command('music'),false);
 assert.equal(f.musicCalls.filter(c=>c[0]==='menu').length,0);
 f.session.nativeState({phase:'game',worldReady:true,rendered:true});assert.equal(f.session.command('music'),true);
 assert.equal(f.musicPlayers[0].battleActive,true);assert.equal(f.musicPlayers[0].menuOpen,true);
});
test('soundtrack battle-active follows rendered game readiness and suspends in loading/room',()=>{
 const f=fixture({music:true});f.start();const player=f.musicPlayers[0];assert.equal(player.battleActive,false);
 f.session.nativeState({phase:'room',lobbyReady:true,rendered:true});assert.equal(player.battleActive,false);
 f.session.nativeState({phase:'game',worldReady:false,rendered:true});assert.equal(player.battleActive,false);
 f.session.nativeState({phase:'game',worldReady:true,rendered:false});assert.equal(player.battleActive,false);
 f.session.nativeState({phase:'game',worldReady:true,rendered:true});assert.equal(player.battleActive,true);
 const count=f.musicCalls.filter(c=>c[0]==='active').length;
 f.session.nativeState({phase:'game',worldReady:true,rendered:true});assert.equal(f.musicCalls.filter(c=>c[0]==='active').length,count);
 f.session.loading(true);assert.equal(player.battleActive,false);f.session.loading(false);assert.equal(player.battleActive,false);
 f.session.nativeState({phase:'game',worldReady:true,rendered:true});assert.equal(player.battleActive,true);
 f.session.nativeState({phase:'room',lobbyReady:true,rendered:true});assert.equal(player.battleActive,false);
});
test('Music opens the compact shared menu in the parent document and the second header press closes it',()=>{
 const f=fixture({music:true});let statusCloses=0;f.sandbox.TowersStatus={close(){statusCloses++;}};
 f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});
 f.session.command('research');f.session.command('manufacturing');
 f.node('wt-field-centre').hidden=false;
 const before=f.lifecycle.length;assert.equal(f.session.command('music'),true);
 const call=f.musicCalls.find(c=>c[0]==='menu');assert.equal(call[1],f.node('blocknight-music'));assert.equal(call[2],f.document);
 const trace=f.lifecycle.slice(before);assert.ok(trace.indexOf('pages-close')<trace.indexOf('music-menu'));
 assert.ok(trace.indexOf('research-close')<trace.indexOf('music-menu'));assert.ok(trace.indexOf('controls-release')<trace.indexOf('music-menu'));
 assert.equal(f.node('wt-command-pages').hidden,true);assert.equal(f.node('wt-field-centre').hidden,true);
 assert.equal(statusCloses,1);assert.equal(f.node('blocknight-music').attributes['aria-expanded'],'true');
 assert.equal(f.session.command('music'),true);assert.equal(f.musicPlayers[0].menuOpen,false);
 assert.equal(f.node('blocknight-music').attributes['aria-expanded'],'false');assert.deepEqual(f.controlCalls.command,[]);
});
test('every non-music command closes the soundtrack menu without using native hotkeys',()=>{
 for(const action of ['research','manufacturing','queue','build','demolish','intelligence','base','combat','all-units','deselect','stop','trucks']){
  const f=fixture({music:true});f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});
  f.session.command('music');f.session.command(action);
  assert.equal(f.musicPlayers[0].menuOpen,false,action);assert.ok(f.musicCalls.some(c=>c[0]==='close'&&c[1]===false),action);
  assert.equal(f.node('blocknight-music').attributes['aria-expanded'],'false');
 }
});
test('return and pagehide dispose soundtrack players and revoke native session before another game',()=>{
 const f=fixture({music:true});f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});
 f.session.command('music');f.session.returnToLobby('Return');
 assert.equal(f.musicPlayers[0].disposed,true);assert.equal(f.musicPlayers[0].menuOpen,false);
 assert.ok(f.lifecycle.indexOf('music-dispose')<f.lifecycle.indexOf('frame-removed'));
 assert.equal(f.musicSession(),'');
 f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});f.pagehide();
 assert.equal(f.musicPlayers[1].disposed,true);assert.equal(f.musicSession(),'');
});
test('native leaving and terminal join errors stop music before the delayed teardown',()=>{
 const f=fixture({music:true});f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});
 f.session.command('music');f.session.nativeState({phase:'leaving',rendered:false});
 assert.equal(f.session.active,true,'The existing bounded leave transition remains active');
 assert.equal(f.musicPlayers[0].disposed,false,'Music pauses before the engine is removed');
 assert.equal(f.musicPlayers[0].battleActive,false);assert.equal(f.musicPlayers[0].menuOpen,false);
 f.step(250);assert.equal(f.musicPlayers[0].disposed,true);
 const g=fixture({music:true});g.start();g.session.nativeState({phase:'game',worldReady:true,rendered:true});
 g.session.command('music');g.session.message('Failed to join with error: Host stopped');
 assert.equal(g.session.active,true);assert.equal(g.musicPlayers[0].battleActive,false);
 assert.equal(g.musicPlayers[0].menuOpen,false);g.step(250);assert.equal(g.musicPlayers[0].disposed,true);
});
test('unavailable music controller stays recoverable and cannot change Combat or All Units',()=>{
 const f=fixture({music:true});f.start();f.session.nativeState({phase:'game',worldReady:true,rendered:true});
 const player=f.frames[0].contentWindow.WarzoneMapMusic;delete f.frames[0].contentWindow.WarzoneMapMusic;
 assert.equal(f.session.command('music'),false);assert.equal(f.node('mp-toast').textContent,'Music is connecting to the game…');
 assert.equal(f.controlCalls.toggle,0);assert.deepEqual(f.controlCalls.command,[]);
 f.frames[0].contentWindow.WarzoneMapMusic=player;assert.equal(f.session.command('music'),true);
 f.node('blocknight-combat').onclick();assert.equal(f.controlCalls.toggle,1);
 f.buttons.find(b=>b.dataset.command==='all-units').onclick();assert.deepEqual(f.controlCalls.command,['all-units']);
});
test('Music header/scripts and stock music-disable setting are isolated to Multiplayer',()=>{
 const html=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/index.html'),'utf8');
 const engine=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/engine.html'),'utf8');
 assert.equal((html.match(/data-command="music"/g)||[]).length,1);
 assert.ok(html.indexOf('id="blocknight-music"')>html.indexOf('id="game-controls"'));
 assert.ok(engine.indexOf('src="/warzone/music-catalog.js"')<engine.indexOf('src="music.js"'));
 assert.ok(engine.indexOf('src="music.js"')<engine.indexOf('src="warzone2100.js"'));
 const sandbox={TextEncoder};vm.runInNewContext(fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/lobby-config.js'),'utf8'),sandbox);
 const config=sandbox.PcLobbyConfig.update('[General]\nmusic_enabled=1\nmusic_enabled=1\nsound_enabled=1\nvoicevol=65\n','Player');
 assert.equal((config.match(/music_enabled=0/g)||[]).length,1);assert.doesNotMatch(config,/music_enabled=1/);
 assert.match(config,/sound_enabled=1/);assert.match(config,/voicevol=65/);
});
const crypto=require('node:crypto');
const inputs=['app/src/main/assets/multiplayer/session.js','app/src/main/assets/multiplayer/index.html',
 'app/src/main/assets/multiplayer/engine.html','app/src/main/assets/multiplayer/lobby-config.js','tools/test-multiplayer-session-072.cjs'];
fs.writeFileSync(path.join(root,'qa/multiplayer-072/session-checks.json'),JSON.stringify({version:'0.72',passed:true,
 emulatorUsed:false,actualNativeEngineExecuted:false,scope:'Actual session/config JavaScript in bounded DOM and music-controller fixtures',
 checksPassed:count,checks,sources:inputs.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))},null,2)+'\n');
console.log(`${count} v0.72 MP session checks passed.`);
