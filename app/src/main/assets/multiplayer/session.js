/* Owns one stock engine session; Towers engines and saves never enter this mode. */
(() => {
 'use strict';
 const byId=id=>document.getElementById(id), sockets=new Map();
 let frame=null,poll=null,closeTimer=null,generation=0,everReceived=false,roomEstablished=false;
 let nativeLoading=false,terminalJoinFailure=false,lastMessage='',lastReason='',lastReasonKind='',lastMode=null,reasonCapture=null;
 let matchStartCounted=false;
 let nativeUi=null,roomSnapshot=null,joinName='',returning=false,toastTimer=null,lastPowerLayout=0,lastPowerKey='',ownerUiDenied=false;
 const revealable=s=>Boolean(s?.rendered&&(s.phase==='room'?s.lobbyReady:s.phase==='game'?s.worldReady:false));
 const ownerAllowed=()=>nativeUi?.canIssueOrders!==false&&nativeUi?.spectator!==true&&!(Number.isInteger(nativeUi?.realPlayer)&&Number.isInteger(nativeUi?.player)&&nativeUi.realPlayer!==nativeUi.player);
 const session=globalThis.PcMultiplayerSession={active:false,phase:'lobby',arguments:[],events:[],errors:[],loading:()=>{},status:()=>{}};
 function nativeSessionActive(active){try{AndroidMultiplayer.setSessionActive(Boolean(active));return true;}catch{return false;}}
 // Back must read Java's cache immediately, even while the WASM thread is busy.
 nativeSessionActive(false);
 globalThis.addEventListener?.('pagehide',()=>{child()?.WarzoneMapMusic?.dispose?.();nativeSessionActive(false);});
 function record(type,detail){session.events.push({at:Date.now(),type,detail});if(session.events.length>200)session.events.shift();}
 function child(){try{return frame?.contentWindow;}catch{return null;}}
 // Android lifecycle controls the pump, never the session's join/leave state.
 session.setBackground=value=>{
  session.background=Boolean(value);child()?.PcBackgroundFrames?.setBackground?.(session.background);
  if(session.background)child()?.PcMultiplayerControls?.releaseAll?.();
  record('background',session.background);
 };
 session.backgroundPulse=()=>{if(session.active&&session.background)child()?.PcBackgroundFrames?.pulse?.();};
 function viewport(){
  const header=byId('warzone-command-strip');
  const height=session.phase==='game'&&header&&!header.hidden?Math.ceil(header.getBoundingClientRect?.().height||58):0;
  if(height)document.documentElement?.style?.setProperty('--wt-command-top',height+'px');
  powerLayout(true);
  try{AndroidMultiplayer.setViewportState?.(session.active,height);}catch{}
 }
 function cover(title='Joining game',detail='Connecting to the room…'){
  globalThis.PcMultiplayerRoomUI?.hide?.();if(frame)frame.inert=true;
  const overlay=byId('loading-cover');if(overlay)overlay.hidden=false;
  if(byId('loading-title')&&byId('loading-title').textContent!==title)byId('loading-title').textContent=title;
  if(byId('loading-detail')&&byId('loading-detail').textContent!==detail)byId('loading-detail').textContent=detail;
 }
 function uncover(){if(byId('loading-cover'))byId('loading-cover').hidden=true;}
 function setPhase(phase){
  const changed=session.phase!==phase;session.phase=phase;if(changed)record('phase',phase);else return;
  const playing=phase==='game';document.body.classList.toggle('in-game',playing);
  if(frame)frame.inert=!playing;
  if(phase==='room')globalThis.PcMultiplayerRoomUI?.show?.(roomSnapshot);else globalThis.PcMultiplayerRoomUI?.hide?.();
  byId('game-controls').hidden=!playing;byId('unit-controls').hidden=!playing;
  if(byId('warzone-command-strip'))byId('warzone-command-strip').hidden=!playing;
  byId('room-leave').hidden=!session.active||phase!=='room';
  if(!playing){if(byId('wt-field-centre'))byId('wt-field-centre').hidden=true;byId('wt-field-toggle')?.setAttribute?.('aria-expanded','false');}
  const w=child();if(w?.PcMultiplayerState)w.PcMultiplayerState.phase=phase;
  if(!playing)w?.WarzoneNotices?.clear?.();
  w?.PcMultiplayerControls?.setPhase(phase);w?.WarzoneMapMusic?.setBattleActive?.(playing);renderOwnership();renderStatus();viewport();renderPower();
 }
 function renderOwnership(){
  const denied=session.phase==='game'&&!ownerAllowed(),w=child();
  document.body.classList.toggle('mp-observer',denied);
  for(const id of ['blocknight-tech','wt-open-factory','wt-open-queue','blocknight-base','blocknight-combat','blocknight-repair','blocknight-patrol']){const node=byId(id);if(node)node.hidden=denied;}
  if(denied){
   byId('unit-controls').hidden=true;
   for(const id of ['wt-field-centre','wt-build-sidebar']){const node=byId(id);if(node)node.hidden=true;}
   byId('wt-field-toggle')?.setAttribute?.('aria-expanded','false');
   const pages=w?.__warzoneCommands?.report?.();if(pages?.page!=='players'){const panel=byId('wt-command-pages');if(panel)panel.hidden=true;}
   if(!ownerUiDenied){if(pages?.page!=='players')w?.__warzoneCommands?.close?.();w?.__blockNightResearch?.close?.();w?.__warzoneIntelligence?.close?.();globalThis.TowersStatus?.close?.();w?.PcMultiplayerControls?.resetCombatMode?.();w?.PcMultiplayerControls?.releaseAll?.();}
  }
  ownerUiDenied=denied;
 }
 function renderStatus(){
  const box=byId('mp-header-status');if(!box)return;
  const state=nativeUi?.uiStatus,visible=session.phase==='game'&&nativeUi?.phase==='game'&&!nativeLoading&&nativeUi?.worldReady===true&&nativeUi?.rendered===true;
  const timer=visible&&typeof state?.timerText==='string'?state.timerText:'',connection=visible&&typeof state?.connectionText==='string'?state.connectionText:'';
  // Native labels own countdowns and connection warnings. Never synthesize them
  // from the browser clock or transport logs, or insert native text as HTML.
  for(const [id,text]of[['mp-native-timer',timer],['mp-native-connection',connection]]){
   const node=byId(id);if(!node)continue;
   if(node.textContent!==text)node.textContent=text;
   node.hidden=!text.trim();node.title=text;
  }
  box.hidden=!timer.trim()&&!connection.trim();box.dataset.kind=state?.kind==='warning'?'warning':'normal';
 }
 function powerLayout(force=false){
  const hud=byId('mp-power-hud');if(!hud||hud.hidden)return;
  const now=Date.now();if(!force&&now-lastPowerLayout<500)return;lastPowerLayout=now;
  const width=globalThis.innerWidth,frameBox=frame?.getBoundingClientRect?.(),dock=byId('lab-ops'),dockBox=dock&&!dock.hidden?dock.getBoundingClientRect?.():null;
  if(!Number.isFinite(width)||width<80)return;
  const radar=nativeUi?.radar,view=nativeUi?.view;
  let right=width-12;
  if(radar?.visible===true&&Number.isFinite(radar.left)&&view?.width>0&&frameBox?.width>0)right=Math.min(right,frameBox.left+radar.left*frameBox.width/view.width-12);
  let left=dockBox&&Number.isFinite(dockBox.right)?dockBox.right+12:62;
  const wanted=Math.min(308,width-24);let bottom=6;
  if(right-left<160){left=12;bottom=Math.max(58,Number(dockBox?.height||0)+14);}
  const span=Math.max(40,right-left),barWidth=Math.min(wanted,span),center=Math.max(left+barWidth/2,Math.min(width/2,right-barWidth/2));
  hud.style.width=barWidth+'px';hud.style.left=center+'px';hud.style.bottom=bottom+'px';
 }
 function renderPower(){
  const hud=byId('mp-power-hud');if(!hud)return;
  const power=nativeUi?.power,queued=nativeUi?.queuedPower;
  const valid=session.phase==='game'&&ownerAllowed()&&!nativeLoading&&nativeUi?.worldReady===true&&nativeUi?.rendered===true&&Number.isInteger(power);
  hud.hidden=!valid;if(!valid)return;
  const key=String(power)+'/'+String(queued);if(key===lastPowerKey){powerLayout();return;}lastPowerKey=key;
  const queueKnown=Number.isInteger(queued)&&queued>=0,available=queueKnown?power-queued:power;
  let range=5000;while(Math.max(Math.abs(power),queueKnown?queued:0)>range)range*=2;
  const fill=Math.max(0,Math.min(1,available/range))*100,reserved=queueKnown?Math.max(0,Math.min(power,queued))/range*100:0;
  const label=String(power),description='Power '+label+(queueKnown&&queued?' · '+queued+' queued · '+available+' available':'');
  if(byId('mp-power-value').textContent!==label)byId('mp-power-value').textContent=label;
  if(hud.getAttribute?.('aria-label')!==description)hud.setAttribute?.('aria-label',description);
  hud.title=description;byId('mp-power-available').style.width=fill+'%';byId('mp-power-reserved').style.left=fill+'%';byId('mp-power-reserved').style.width=reserved+'%';
  powerLayout();
 }
 function addError(message){
  if(session.errors[session.errors.length-1]!==message)session.errors.push(message);
  if(session.errors.length>80)session.errors.shift();
 }
 function cancelReturn(){clearTimeout(closeTimer);closeTimer=null;byId('transition').hidden=true;}
 function queueReturn(terminal=false){
  if(!session.active)return;
  if(terminal)child()?.WarzoneMapMusic?.setBattleActive?.(false);
  clearTimeout(closeTimer);byId('transition').hidden=false;
  const token=generation;
  // NETclose can precede the native kick-reason log. Let that native turn finish;
  // a newly opened fallback transport cancels a nonterminal exit.
  closeTimer=setTimeout(()=>{
   closeTimer=null;
   if(session.active&&token===generation&&(terminal||!sockets.size)){
    session.returnToLobby(lastReason||'The connection ended. Choose a room to join again.');
   }else byId('transition').hidden=true;
  },250);
 }
 function markEstablished(){
  if(roomEstablished)return;
  roomEstablished=true;record('room-established',true);
  if(lastReasonKind==='transport'){lastReason='';lastReasonKind='';reasonCapture=null;}
 }
 function updateMode(){
  if(!session.active||returning)return;
  const mode=child()?.LaunchedModule?.getMultiplayerGameMode?.();
  if(mode!==lastMode){lastMode=mode;record('native-mode',mode);}
  // Native mode is diagnostic only: TITLE also includes lobby pages, and NORMAL
  // is set before loading begins. Only the rendered native UI signal may reveal.
  if(nativeLoading||nativeUi?.phase==='loading'){
   setPhase('loading');cover('Loading battlefield',session.statusText||'Preparing the game…');
  }else if(revealable(nativeUi)&&(nativeUi.phase!=='room'||globalThis.PcMultiplayerRoomUI?.valid?.(roomSnapshot)&&nativeUi.roomGeneration===roomSnapshot.generation)){
   if(nativeUi.phase==='room')markEstablished();
   setPhase(nativeUi.phase);uncover();
   if(!matchStartCounted&&nativeUi.phase==='game'&&nativeUi.canIssueOrders===true&&ownerAllowed()){
    matchStartCounted=true;
    AndroidMultiplayer.countMatchStart?.();
   }
  }else{
   setPhase('connecting');cover('Joining game',session.statusText||'Connecting to the room…');
  }
 }
 session.nativeState=value=>{
  if(!session.active||returning)return;
  let snapshot=value;try{if(typeof snapshot==='string')snapshot=JSON.parse(snapshot);}catch{return;}
  if(!snapshot||typeof snapshot!=='object')return;
  nativeUi=snapshot;
  const w=child();if(w?.PcMultiplayerState)Object.assign(w.PcMultiplayerState,{nativeMenuOpen:Boolean(snapshot.nativeMenuOpen),radar:snapshot.radar,worldReady:Boolean(snapshot.worldReady&&snapshot.rendered),worldSafe:snapshot.worldSafe,cameraSafe:snapshot.cameraSafe,canIssueOrders:snapshot.canIssueOrders,spectator:snapshot.spectator,realPlayer:snapshot.realPlayer,player:snapshot.player});
  if(snapshot.phase==='leaving'){child()?.WarzoneMapMusic?.setBattleActive?.(false);renderStatus();if(byId('mp-power-hud'))byId('mp-power-hud').hidden=true;cover('Leaving game','Returning to the multiplayer lobby…');if(!closeTimer)queueReturn(true);return;}
  updateMode();renderOwnership();renderStatus();renderPower();
 };
 session.roomState=value=>{
  if(!session.active||returning||nativeLoading||nativeUi?.phase!=='room'||nativeUi.roomGeneration!==value?.generation||!globalThis.PcMultiplayerRoomUI?.valid?.(value))return false;
  if(roomSnapshot?.generation===value.generation&&value.revision<roomSnapshot.revision)return false;
  roomSnapshot=value;globalThis.PcMultiplayerRoomUI.accept(value);updateMode();return true;
 };
 session.roomCommand=(action,data={})=>{
  const bridge=child()?.PcMultiplayerNative;
  if(!session.active||returning||session.phase!=='room'||!roomSnapshot||nativeUi?.roomGeneration!==roomSnapshot.generation||typeof bridge?.roomCommand!=='function')return Promise.resolve({ok:false,reason:'The room is not ready.'});
  return bridge.roomCommand(action,data);
 };
 session.roomMapPreview=()=>{
  if(!session.active||returning||session.phase!=='room'||nativeUi?.roomGeneration!==roomSnapshot?.generation)return null;
  const preview=child()?.PcMultiplayerNative?.roomMapPreview?.();
  return preview?.generation===roomSnapshot.generation?preview:null;
 };
 session.handleBack=expectedGeneration=>globalThis.PcMultiplayerRoomUI?.handleBack?.(expectedGeneration)||false;
 function captureReason(kind,text){
  const lines=String(text||'').replace(/\r/g,'').trim().split('\n').slice(0,10);
  reasonCapture={kind,lines,at:Date.now()};lastReason=lines.join('\n');lastReasonKind='terminal';
  addError(lastReason);
 }
 session.message=(value,forceError=false)=>{
  const message=String(value||'').replace(/\r/g,'');if(!message.trim())return;
  lastMessage=message;record('native-message',message);
  const structured=/^\s*[a-z_0-9]+\s*\|/i.test(message);
  const kick=message.match(/You have been kicked, because\s*([\s\S]*)/i);
  const failed=message.match(/Failed to join with error:\s*([\s\S]*)/i);
  const timeout=message.match(/Failed to join with timeout, state:\s*([^\n]*)/i);
  // An autohost can cancel its waiting room, restart NET, and connect to the
  // match port. The new native join supersedes that room's pending exit.
  if(/\[updateJoiningStatus:\d+\]\s*Establishing connection with host/i.test(message)){
   cancelReturn();nativeUi=null;roomSnapshot=null;globalThis.PcMultiplayerRoomUI?.reset?.();cover('Joining match','Connecting to the match room…');terminalJoinFailure=false;roomEstablished=false;reasonCapture=null;
   lastReason='';lastReasonKind='';updateMode();
  }
  if(kick)captureReason('kick',kick[1]);
  else if(failed){captureReason('join',failed[1]);terminalJoinFailure=true;queueReturn(true);}
  else if(timeout){captureReason('join','Host did not respond before timeout. Join stage: '+timeout[1]);terminalJoinFailure=true;queueReturn(true);}
  else if(!forceError&&reasonCapture&&!structured&&Date.now()-reasonCapture.at<1000&&reasonCapture.lines.length<10){
   // stderr callbacks can split one native multiline rejection into separate calls.
   const previous=lastReason;reasonCapture.lines.push(...message.trim().split('\n').slice(0,10-reasonCapture.lines.length));
   lastReason=reasonCapture.lines.join('\n');reasonCapture.at=Date.now();
   if(session.errors[session.errors.length-1]===previous)session.errors[session.errors.length-1]=lastReason;else addError(lastReason);
  }else{
   if(structured)reasonCapture=null;
   const reason=message.match(/(The host has quit!|Host connection was lost!|Host connection was broken[^\n]*|Different game data[^\n]*)/i);
   if(reason){lastReason=reason[1];lastReasonKind='terminal';addError(lastReason);}
   else if(forceError){if(lastReasonKind!=='terminal'){lastReason=message;lastReasonKind='transport';}addError(message);}
   else if(/^\s*(?:error|fatal|warning|warn)\s*\|/i.test(message)||/^\s*(?:Engine error:|Uncaught\b|(?:Type|Reference|Range|Runtime)?Error:)/i.test(message))addError(message);
  }
  if(/(?:& local Options Received \(MP game\)|Accepted into the game|Synchronizing data with host)/i.test(message)){
   markEstablished();updateMode();
  }
  // Overall native cancel/failure paths also cover failure before any data.
  // Individual endpoint failures and NET_REJECTED redirects do not end a join.
  if(/(?:We have stopped joining\.|Canceling game\.\.\.)/i.test(message)){terminalJoinFailure=true;queueReturn(true);}
 };
 session.failed=reason=>{session.message(reason,true);session.returnToLobby(reason);};
 session.loading=on=>{nativeLoading=Boolean(on);if(nativeLoading){nativeUi=null;roomSnapshot=null;globalThis.PcMultiplayerRoomUI?.reset?.();}record('loading',nativeLoading);if(session.active)updateMode();renderPower();};
 session.status=text=>{session.statusText=String(text||'');if(session.active&&byId('loading-cover')&&!byId('loading-cover').hidden&&byId('loading-detail'))byId('loading-detail').textContent=session.statusText||'Connecting to the room…';};
 session.engineReady=()=>{
  record('engine-ready',true);
  if(poll)clearInterval(poll);
  updateMode();poll=setInterval(updateMode,100);
 };
 session.requestReturn=reason=>{
  if(!session.active)return;returning=true;cover('Leaving game','Returning to the multiplayer lobby…');child()?.PcMultiplayerControls?.releaseAll();session.returnToLobby(reason);
 };
 session.returnToLobby=reason=>{
  if(!session.active)return;nativeSessionActive(false);returning=true;cover('Leaving game','Returning to the multiplayer lobby…');
  generation++;session.active=false;roomSnapshot=null;globalThis.PcMultiplayerRoomUI?.reset?.();byId('transition').hidden=false;
  clearInterval(poll);clearTimeout(closeTimer);poll=null;closeTimer=null;
  child()?.PcMultiplayerControls?.releaseAll();child()?.WarzoneMapMusic?.dispose?.();
  const engine=child();if(engine)engine.dispatchEvent(new engine.Event('warzone-battle-ended'));
  try{AndroidMultiplayer.closeConnections();}catch{}
  sockets.clear();frame?.remove();frame=null;byId('engine-host').replaceChildren();
  byId('engine-host').hidden=true;byId('setup').hidden=false;setPhase('lobby');
  byId('room-leave').hidden=true;byId('notice').textContent=reason||'Returned to the multiplayer lobby.';byId('notice').style.whiteSpace='pre-line';byId('notice').hidden=false;
  byId('transition').hidden=true;record('returned-to-lobby',reason||'');uncover();viewport();
  // Shared page readers install timers and event handlers in the host document.
  // Reload the app-owned list so a new engine cannot inherit old reader closures.
  if(globalThis.location?.replace&&globalThis.sessionStorage){try{sessionStorage.setItem('mp-return-notice',reason||'Returned to the multiplayer lobby.');location.replace('index.html');return;}catch{}}
  returning=false;globalThis.refreshPcLobby?.();
 };
 const receive=PcSocket.receive.bind(PcSocket);
 PcSocket.receive=(id,type,payload)=>{
  receive(id,type,payload);
  if(!session.active)return;
  if(type==='open'){sockets.set(id,{received:0});terminalJoinFailure=false;cancelReturn();record('socket-open',id);}
  if(type==='data'){const socket=sockets.get(id);if(socket){socket.received+=Math.floor(String(payload||'').length*3/4);everReceived=true;}}
  if(type==='error')session.message(String(payload||'Connection error'),true);
  if(type==='close'){
   const socket=sockets.get(id);sockets.delete(id);record('socket-close',{id,received:socket?.received||0});
   // A failed candidate can receive bytes before a redirect/fallback endpoint.
   if(roomEstablished&&!sockets.size)queueReturn(false);
  }
 };
 globalThis.start=args=>{
  if(session.active)return false;
  if(!savePlayerName())return false;
  if(!nativeSessionActive(true)){byId('notice').textContent='Could not start multiplayer. Please reopen Multiplayer.';byId('notice').hidden=false;return false;}
  generation++;session.active=true;session.arguments=Array.from(args);everReceived=false;roomEstablished=false;matchStartCounted=false;
  nativeLoading=false;nativeUi=null;roomSnapshot=null;globalThis.PcMultiplayerRoomUI?.reset?.();returning=false;terminalJoinFailure=false;lastMessage='';lastReason='';lastReasonKind='';lastMode=null;reasonCapture=null;sockets.clear();cancelReturn();cover('Joining game','Starting Warzone…');
  byId('setup').hidden=true;byId('notice').hidden=true;byId('engine-host').hidden=false;byId('room-leave').hidden=false;
  let musicSession='';try{musicSession=String(JSON.parse(AndroidMultiplayerMusic.musicState()).session||'');}catch{}
  frame=document.createElement('iframe');frame.id='warzone-game-frame';frame.title='Warzone multiplayer game';frame.allow='autoplay; fullscreen';frame.src='engine.html'+(musicSession?'?battle_session='+encodeURIComponent(musicSession):'');byId('engine-host').append(frame);setPhase('connecting');record('join-requested',args[0]);return true;
 };
 function leave(){AndroidMultiplayer.leave();}
 byId('leave').onclick=leave;byId('room-leave').onclick=leave;
 byId('direct-join').onclick=()=>{const host=byId('address').value.trim();if(host&&!/\s/.test(host))start(['--join='+host,'--window','--resolution='+innerWidth+'x'+innerHeight,'--noshadows']);};
 function toast(message){const node=byId('mp-toast');if(!node)return;node.textContent=message;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{node.hidden=true;},3500);}
 function command(action){
  try{return dispatchCommand(action);}finally{child()?.PcMultiplayerControls?.refreshCombatLock?.();syncCombatButton();syncRepairButton();}
 }
 function dispatchCommand(action){
  const w=child();if(!w||session.phase!=='game'||!['music','players'].includes(action)&&!ownerAllowed())return false;
  if (action !== 'patrol' && action !== 'repair') w.PcMultiplayerControls?.cancelPatrol?.();
  if(['research','manufacturing','queue','build','demolish','intelligence','music','players'].includes(action)){byId('wt-field-centre').hidden=true;byId('wt-field-toggle')?.setAttribute?.('aria-expanded','false');}
  const commands=w.__warzoneCommands,research=w.__blockNightResearch;
  if(action!=='music')w.WarzoneMapMusic?.closeMenu?.(false);
  if(action!=='intelligence')w.__warzoneIntelligence?.close?.();
  if(action==='music'){
   if(!w.WarzoneMapMusic){toast('Music is connecting to the game…');return false;}
   commands?.close?.();research?.close?.();globalThis.TowersStatus?.close?.();w.PcMultiplayerControls?.releaseAll?.();
   return w.WarzoneMapMusic.showMenu(byId('blocknight-music'),document);
  }
  if(action==='players'){if(!commands){toast('Players are connecting to the game…');return false;}research?.close?.();return commands.toggle('players');}
  if(action==='research'){
   if(!research){toast('Research is connecting to the game…');return false;}
   const open=research.report?.();if(open?.open||open?.opening)research.close();else research.open();return true;
  }
  if(['manufacturing','queue','build'].includes(action)){
   if(!commands){toast('Commands are connecting to the game…');return false;}
   commands.toggle(action==='manufacturing'?'factory':action);return true;
  }
  if(action==='demolish'){if(!commands)return false;commands.toggleDemolish?.();return true;}
  if(action==='intelligence')return w.__warzoneIntelligence?.toggle?.()||w.WarzoneIntelligence?.toggle?.()||toast('No intelligence reports are available yet.');
   if(action==='combat'){const value=w.PcMultiplayerControls?.toggleCombatLock?.()||false;commands?.afterBuildExit?.(()=>true);return value;}
  if(action==='repair')return w.PcMultiplayerControls?.toggleRepairPolicy?.()||false;
  if(action==='patrol'){
   const armed=w.PcMultiplayerControls?.patrolState?.().armed;
   const toggle=()=>{const result=w.PcMultiplayerControls?.togglePatrol?.(!armed);syncPatrolButton();return result;};
   return commands?.afterBuildExit ? commands.afterBuildExit(toggle) : toggle();
  }
  return w.PcMultiplayerControls?.command(action);
 }
 session.command=command;
 document.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>command(button.dataset.command));
 byId('wt-field-toggle')?.addEventListener?.('click',()=>{if(session.phase!=='game'||!ownerAllowed())return;const drawer=byId('wt-field-centre');drawer.hidden=!drawer.hidden;byId('wt-field-toggle').setAttribute('aria-expanded',String(!drawer.hidden));child()?.PcMultiplayerControls?.releaseAll?.();});
 if(byId('cancel-join'))byId('cancel-join').onclick=()=>session.requestReturn('Joining cancelled.');
 function savePlayerName(){
  const field=byId('player-name');if(!field)return true;
  try{
   const raw=AndroidMultiplayer.setPlayerName(field.value);
   const result=typeof raw==='string'?JSON.parse(raw):raw;
   if(!result?.ok){byId('profile-status').textContent=result?.error||'Could not save your player name.';field.focus?.();return false;}
   const full=globalThis.PcLobbyConfig.validatePlayerName(result.name),base=globalThis.PcLobbyConfig.playerBaseName(result.baseName??full);
   if(!session.active)joinName=full;field.value=base;byId('profile-status').textContent='';return true;
  }catch{byId('profile-status').textContent='Could not save your player name. Try again.';return false;}
 }
 session.playerName=()=>joinName;
 try{const field=byId('player-name');if(field){const stored=AndroidMultiplayer.getPlayerName()||'Player(m)';joinName=globalThis.PcLobbyConfig.validatePlayerName(stored);field.value=globalThis.PcLobbyConfig.playerBaseName(AndroidMultiplayer.getPlayerBaseName?.()??stored);field.maxLength=24;const clampName=()=>{const points=Array.from(field.value);if(points.length>12)field.value=points.slice(0,12).join('');};field.addEventListener?.('input',e=>{if(!e?.isComposing)clampName();});field.addEventListener?.('compositionend',clampName);field.addEventListener?.('change',savePlayerName);field.addEventListener?.('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(savePlayerName())field.blur();}});}}catch{}
 try{const notice=globalThis.sessionStorage?.getItem('mp-return-notice');if(notice){byId('notice').textContent=notice;byId('notice').hidden=false;sessionStorage.removeItem('mp-return-notice');}}catch{}
 globalThis.WarzoneHost={
  resetScroll(){globalThis.scrollTo?.(0,0);},
  setResearchOpen(open){document.body.dataset.research=String(Boolean(open));byId('blocknight-tech')?.setAttribute?.('aria-expanded',String(Boolean(open)));},
  restoreBattlefield(){if(session.phase!=='game')return false;const f=byId('warzone-game-frame');if(f)f.inert=false;return true;},
  setPlaying(){return session.phase==='game';},
  endBattle(){if(session.active)cover('Game ended','Returning to the multiplayer lobby…');}
 };
 if(globalThis.ResizeObserver&&byId('warzone-command-strip'))new ResizeObserver(viewport).observe(byId('warzone-command-strip'));
 globalThis.addEventListener?.('resize',viewport);viewport();
 let combatSelectionWatch=null;
 function confirmedCombatSelection(){
  const w=child(),value=w?.PcMultiplayerNative?.state,view=value?.view;
  const now=typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
  const valid=session.phase==='game'&&ownerAllowed()&&value?.phase==='game'&&value.worldReady===true&&value.worldSafe===true
   &&value.canIssueOrders===true&&value.spectator!==true&&Number.isInteger(value.player)&&value.player===value.realPlayer
   &&Number.isInteger(view?.frame)&&view.frame>=0&&Number.isFinite(value.gameTime)&&!document.hidden;
  if(!valid){combatSelectionWatch=null;return false;}
  const previous=combatSelectionWatch;
  if(!previous||previous.window!==w||previous.generation!==generation||previous.player!==value.player||view.frame<previous.frame||value.gameTime<previous.gameTime)
   combatSelectionWatch={window:w,generation,player:value.player,frame:view.frame,gameTime:value.gameTime,at:now,ready:false};
  else{if(view.frame>previous.frame){previous.frame=view.frame;previous.at=now;previous.ready=true;}previous.gameTime=value.gameTime;}
  if(!combatSelectionWatch.ready||now-combatSelectionWatch.at>=1500)return false;
  const combat=value.combatLock?.commandableIds??value.combatLock?.combatIds,selected=value.combatLock?.selectedIds;
  if(!Array.isArray(combat)||!Array.isArray(selected)||combat.length!==selected.length||![...combat,...selected].every(id=>Number.isInteger(id)&&id>0))return false;
  const wanted=new Set(combat),actual=new Set(selected);
  return wanted.size===combat.length&&actual.size===selected.length&&selected.every(id=>wanted.has(id));
 }
 function menuNote(button,enabled,text){
  const hud=byId('blocknight-combat-hud');let note=button.querySelector('.wt-menu-note');
  if(!note){note=document.createElement('small');note.className='wt-menu-note';note.id=button.id+'-note';note.textContent=text;button.append(note);}
  note.hidden=!enabled;if(enabled)button.setAttribute('aria-describedby',note.id);else button.removeAttribute('aria-describedby');
  hud.classList.toggle('wt-show-notes',!!hud.querySelector('.wt-menu-note:not([hidden])'));
 }
 function syncCombatButton(){
  const button=byId('blocknight-combat');if(!button)return;
  const state=child()?.PcMultiplayerControls?.report?.(),enabled=session.phase==='game'&&ownerAllowed()&&Boolean(state?.combatLock);
  const selected=confirmedCombatSelection();button.dataset.combatSelected=String(selected);button.dataset.combatEnabled=String(enabled);
  button.setAttribute('aria-pressed',String(enabled));button.classList.toggle('active',enabled);
  menuNote(button,enabled,'All Combat Units Selected');
  button.dataset.suspended=String(enabled&&Boolean(state?.combatLockSuspended));
 }
 function syncRepairButton(){
  const button=byId('blocknight-repair');if(!button)return;
  const state=child()?.PcMultiplayerControls?.report?.(),allowed=session.phase==='game'&&ownerAllowed();
  const enabled=allowed&&state?.repairPolicyEnabled===true,pending=allowed&&state?.repairPolicyPending===true;
  button.dataset.repairEnabled=String(enabled);button.dataset.repairPending=String(pending);
  button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-busy',String(pending));button.classList.toggle('active',enabled);
  menuNote(button,enabled,'Med dmg');
  button.disabled=!allowed||state?.repairPolicyCanToggle!==true;
  button.title=state?.repairPolicyError||(pending?(enabled
    ?'Automatic repair retreat is ON; applying Medium damage to new combat units'
    :'Waiting for the native game to apply the repair setting'):enabled
    ?'Automatic repair retreat at 75% health is ON for all your combat units and new production; press to turn OFF'
    :'Enable automatic repair retreat at 75% health for all your combat units and new production');
 }
 function syncChrome(){
  syncCombatButton();syncRepairButton();syncPatrolButton();renderOwnership();if(session.phase!=='game')return;
  const w=child(),page=byId('wt-command-pages'),research=w?.document?.getElementById('blocknight-research-shell');
  const full=Boolean(page&&!page.hidden||research&&!research.hidden||w?.__warzoneIntelligence?.isOpen?.());
  byId('unit-controls').hidden=full||!ownerAllowed();
  if(full){byId('wt-field-centre').hidden=true;byId('wt-field-toggle')?.setAttribute?.('aria-expanded','false');}
  w?.PcMultiplayerControls?.refreshCombatLock?.();
 }
 function syncPatrolButton(){
  const button=byId('blocknight-patrol');if(!button)return;
  const state=child()?.PcMultiplayerControls?.patrolState?.();
  button.disabled=session.phase!=='game'||!ownerAllowed()||!state?.available||state.pending;
  button.classList.toggle('active',Boolean(state?.armed));
  button.setAttribute('aria-pressed',String(Boolean(state?.armed)));
  button.setAttribute('aria-busy',String(Boolean(state?.pending)));
  button.title=state?.status||'Select combat units, tap Patrol, then choose a destination';
  menuNote(button,Boolean(state?.status),state?.status||'');
  const note=button.querySelector('.wt-menu-note');
  if(note&&note.textContent!==(state?.status||''))note.textContent=state?.status||'';
 }
 setInterval(syncChrome,250);
 session.report=()=>({active:session.active,phase:session.phase,nativeMode:lastMode,nativeUi,room:globalThis.PcMultiplayerRoomUI?.report?.()||null,loading:nativeLoading,loadingCoverVisible:Boolean(byId('loading-cover')&&!byId('loading-cover').hidden),roomEstablished,everReceived,status:session.statusText,playerName:joinName,sockets:[...sockets].map(([id,v])=>({id,...v})),events:session.events.slice(-40),errors:session.errors.slice(-20),controls:child()?.PcMultiplayerControls?.report()||null});
})();
