/* Matched4.7 client UI bridge: no WASM addresses, rules mods or simulation hooks. */
(() => {
 'use strict';
 let prepared=null,module=null,serial=0,cameraSerial=0,combatSerial=0,lastEvent=0,lastAcknowledgedEvent=0,lastTerrainRevision=-1,lastRoomKey='',lastRoomDelivery=0,roomPending=false,queue=Promise.resolve(),polling=false,stopped=false;
 const prefix='/data/mp/multiplay/script/rules/';
 const fencedInput={pointer:0,mouse:0,touch:0,wheel:0};
 let roomPreviewCache=null;
 const native=globalThis.PcMultiplayerNative={state:null,room:null,terrain:null,reports:{ready:false,reports:[]},errors:[],
  prepare,ready:initialize,poll,refresh:()=>{poll();return Promise.resolve(native.state);},command,roomCommand,roomMapPreview,setCamera,cancelCamera,setCombatLock,combatLockIntent:null,researchReports:()=>native.reports};
 const ordersAllowed=()=>native.state?.canIssueOrders!==false&&native.state?.spectator!==true&&!(Number.isInteger(native.state?.realPlayer)&&Number.isInteger(native.state?.player)&&native.state.realPlayer!==native.state.player);
 function fail(error){const text=String(error?.message||error);if(native.errors.at(-1)!==text)native.errors.push(text);if(native.errors.length>30)native.errors.shift();console.warn('Multiplayer UI: '+text);}
 function prepare(){
  if(!prepared)prepared=Promise.all([fetch('mobile-ui-runtime.js').then(r=>{if(!r.ok)throw Error('Mobile controls could not load');return r.text();}),fetch('/warzone/command-catalog.json').then(r=>{if(!r.ok)throw Error('Unit catalogue could not load');return r.text();})]);
  return prepared;
 }
 function initialize(value){
  module=value;roomPreviewCache=null;const fs=module?.FS;if(!fs)throw Error('Native filesystem is not available');
  fs.mkdirTree('/tmp');fs.mkdirTree(prefix);
  // prepare() has completed before createWZModule begins. Its continuation runs
  // before the first useful world frame; native retries bootstrap until present.
  prepare().then(([script,catalog])=>{if(stopped)return;fs.writeFile('/tmp/mp-mobile-ui.js',script);fs.writeFile(prefix+'warzone-towers-catalog.json',catalog);}).catch(fail);
 }
 function attach(value){module=value;if(!module?.FS)return;poll();}
 function read(path){try{return JSON.parse(module.FS.readFile(path,{encoding:'utf8'}));}catch{return null;}}
 function receive(value){
  if(stopped)return;let state=value;
  try{if(typeof value==='string')state=JSON.parse(value);}catch{return;}
  if(!state||typeof state!=='object')return;
  const previouslyAllowed=ordersAllowed();native.state=state;globalThis.PcMultiplayerState=Object.assign(globalThis.PcMultiplayerState||{},state);
  if(!ordersAllowed()){
   native.reports={ready:false,reports:[]};
   if(previouslyAllowed){globalThis.PcMultiplayerControls?.setCombatLock?.(false);globalThis.PcMultiplayerControls?.releaseAll?.();}
  }
  if(state.phase!=='room'||native.room?.generation!==state.roomGeneration){native.room=null;lastRoomKey='';roomPreviewCache=null;}
  globalThis.__warzoneMultiplayerMode=true;
  try{parent.PcMultiplayerSession?.nativeState(state);}catch(error){fail(error);}
 }
 globalThis.wz_js_mp_native_state=receive;
 // SDL also observes document-level mouse state. Stop overlay events after
 // their HTML target handlers, before they reach those native document hooks.
 // Canvas events (including our explicit touch-to-SDL forwarding) remain intact.
 for(const type of ['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','touchstart','touchmove','touchend','touchcancel','wheel','contextmenu']){
  document.body.addEventListener(type,event=>{
   const target=event.target;
   if(!native.state?.worldReady||!target||target===document.body||target===document.documentElement||target===document.getElementById('canvas'))return;
   event.stopImmediatePropagation();
   const group=type.startsWith('pointer')?'pointer':type.startsWith('touch')?'touch':type==='wheel'?'wheel':'mouse';fencedInput[group]++;
  },{passive:true});
 }
 globalThis.wz_js_mp_facility_selected=(id,kind)=>setTimeout(async()=>{
  if(stopped||!native.state?.worldReady||!ordersAllowed())return;
  const pages=globalThis.__warzoneCommands;
  if(pages?.isPlacement?.()||pages?.isDemolishing?.())return;
  try{
   await pages?.send?.('state',{}, {fresh:true});
   if(stopped||!native.state?.worldReady||!ordersAllowed())return;
   if(kind==='research')globalThis.__blockNightResearch?.openForLabId?.(id);
   else if(kind==='factory')pages?.openFactory?.(id);
  }catch(error){fail(error);}
 },0);
 function emit(text){dispatchEvent(new CustomEvent('blocknight-engine-output',{detail:{text}}));}
 function poll(){
  if(stopped||polling||!module?.FS)return;polling=true;
  try{
   const state=read('/tmp/mp-mobile-state.json');if(state)receive(state);
   if(native.state?.phase==='room'&&native.state?.roomGeneration){
    const room=read('/tmp/mp-mobile-room.json');
    if(room?.version===79&&room.ready===true&&room.generation===native.state.roomGeneration){
     native.room=room;const key=room.generation+':'+String(room.revision);
     if(key!==lastRoomKey||Date.now()-lastRoomDelivery>=250){lastRoomKey=key;lastRoomDelivery=Date.now();try{parent.PcMultiplayerSession?.roomState(room);}catch(error){fail(error);}}
    }
   }
   const events=read('/tmp/mp-mobile-events.json');
   if(events&&Array.isArray(events.messages)){
    const first=Number(events.first)||1;
    events.messages.forEach((text,i)=>{const id=first+i;if(id>lastEvent){emit(String(text));lastEvent=id;}});
    if(lastEvent>lastAcknowledgedEvent){module.FS.writeFile('/tmp/mp-mobile-events-ack',String(lastEvent));lastAcknowledgedEvent=lastEvent;}
   }
   if(native.state?.worldReady&&(!native.terrain||Number(native.state.gameTime)-lastTerrainRevision>=750)){
    const terrain=read('/tmp/mp-mobile-terrain.json');if(terrain){native.terrain=terrain;lastTerrainRevision=Number(terrain.revision)||0;}
    const reports=ordersAllowed()?read('/tmp/mp-mobile-reports.json'):null;if(reports){native.reports=reports;globalThis.__warzoneIntelligence?.acceptReports?.(reports);}
   }
  }catch(error){fail(error);}finally{polling=false;}
 }
 function command(action,data={}){
  const run=()=>new Promise(resolve=>{
   if(stopped||!module?.FS||!native.state?.worldReady){resolve({ok:false,reason:'world-not-ready'});return;}
   if(!ordersAllowed()){resolve({ok:false,reason:'spectator-read-only'});return;}
   const nonce='mp-ui-'+Date.now()+'-'+(++serial),request={...data,action,nonce};
   try{module.FS.writeFile('/tmp/mp-mobile-input.json',JSON.stringify(request));}catch(error){fail(error);resolve({ok:false,reason:'native-unavailable'});return;}
   const start=performance.now();
   const inspect=()=>{
    if(stopped){resolve({ok:false,reason:'session-ended'});return;}
    poll();
    if(stopped||!native.state?.worldReady||!ordersAllowed()){resolve({ok:false,reason:stopped?'session-ended':!ordersAllowed()?'spectator-read-only':'world-not-ready'});return;}
    const response=read('/tmp/mp-mobile-input-result.json');
    if(response?.nonce===nonce){resolve(response);return;}
    if(performance.now()-start>=2500){resolve({ok:false,reason:'native-timeout'});return;}
    setTimeout(inspect,16);
   };inspect();
  });
  const promise=queue.then(run,run);queue=promise.catch(()=>{});return promise;
 }
 function roomCommand(action,data={}){
  if(roomPending)return Promise.resolve({ok:false,reason:'A room change is already pending.'});
  if(stopped||!module?.FS||native.state?.phase!=='room'||!native.room?.ready||native.room.generation!==native.state.roomGeneration)return Promise.resolve({ok:false,reason:'The room is not ready.'});
  if(!['ready','chat','team','spectator'].includes(action))return Promise.resolve({ok:false,reason:'Unknown room action.'});
  const generation=native.room.generation,nonce='mp-room-'+Date.now()+'-'+(++serial),request={generation,nonce,action};
  if(action==='ready'){if(typeof data.ready!=='boolean')return Promise.resolve({ok:false,reason:'Invalid ready state.'});request.ready=data.ready;}
  if(action==='team'){if(!Number.isInteger(data.team))return Promise.resolve({ok:false,reason:'Invalid team.'});request.team=data.team;}
  if(action==='spectator'){if(typeof data.spectator!=='boolean')return Promise.resolve({ok:false,reason:'Invalid spectator state.'});request.spectator=data.spectator;}
  if(action==='chat'){if(typeof data.text!=='string'||!data.text.trim()||data.text.length>2048)return Promise.resolve({ok:false,reason:'Invalid chat message.'});request.text=data.text;}
  roomPending=true;
  return new Promise(resolve=>{
   const finish=response=>{roomPending=false;resolve(response);};
   try{module.FS.writeFile('/tmp/mp-mobile-room-input.json.tmp',JSON.stringify(request));module.FS.rename('/tmp/mp-mobile-room-input.json.tmp','/tmp/mp-mobile-room-input.json');}
   catch(error){fail(error);finish({ok:false,generation,nonce,reason:'The room connection is unavailable.'});return;}
   const start=performance.now();
   const inspect=()=>{
    if(stopped||native.state?.phase!=='room'||native.state.roomGeneration!==generation){finish({ok:false,generation,nonce,reason:'The room changed.'});return;}
    poll();
    // A new native frame can leave the room while this inspection is polling.
    // Never let that frame's stale mailbox acknowledgement confirm old intent.
    if(stopped||native.state?.phase!=='room'||native.state.roomGeneration!==generation){finish({ok:false,generation,nonce,reason:'The room changed.'});return;}
    const response=read('/tmp/mp-mobile-room-input-result.json');
    if(response?.nonce===nonce&&response.generation===generation){finish(response);return;}
    if(performance.now()-start>=5000){finish({ok:false,generation,nonce,reason:'The host did not acknowledge the room change. Please try again.'});return;}
    setTimeout(inspect,25);
   };inspect();
  });
 }
 function roomMapPreview(){
  const room=native.room,meta=room?.mapPreview;
  const unavailable=reason=>{roomPreviewCache=null;return{status:'unavailable',reason};};
  if(stopped||!module?.FS||native.state?.phase!=='room'||!room?.ready||room.generation!==native.state.roomGeneration)return unavailable('The waiting room is not ready.');
  if(room.blind===true){roomPreviewCache=null;return{status:'blind',generation:room.generation,reason:'The host has hidden the map preview in this blind room.'};}
  if(!meta||meta.generation!==room.generation||meta.mapName!==room.mapName||typeof meta.mapHash!=='string'||meta.mapHash!==room.mapHash)return unavailable('Waiting for the current map preview.');
  const summary={status:meta.status,generation:room.generation,mapName:meta.mapName,mapHash:meta.mapHash,revision:meta.revision,width:meta.width,height:meta.height,channels:3,reason:String(meta.reason||'')};
  if(meta.status!=='ready'){roomPreviewCache=null;return['loading','unavailable','blind'].includes(meta.status)?summary:unavailable('The native map preview is unavailable.');}
  if(!Number.isInteger(meta.revision)||meta.revision<0||!Number.isInteger(meta.width)||!Number.isInteger(meta.height)||meta.width<1||meta.height<1||meta.width>256||meta.height>256||meta.channels!==3||meta.file!=='/tmp/mp-mobile-room-preview.rgb')return unavailable('The native map preview is invalid.');
  const key=JSON.stringify([room.generation,meta.mapHash,meta.revision,meta.width,meta.height]);
  if(roomPreviewCache?.key===key)return roomPreviewCache.value;
  try{
   const pixels=module.FS.readFile(meta.file);
   if(!ArrayBuffer.isView(pixels)||pixels.BYTES_PER_ELEMENT!==1||pixels.byteLength!==meta.width*meta.height*3)return unavailable('The native map preview is incomplete.');
   const value={...summary,pixels:new Uint8Array(pixels)};
   roomPreviewCache={key,value};return value;
  }catch{return{...summary,status:'loading',reason:'Preparing the current map preview.'};}
 }
 function setCamera(value){
  if(stopped||!module?.FS||!(typeof native.state?.cameraSafe==='boolean'?native.state.cameraSafe:native.state?.worldSafe===true)||!value||typeof value!=='object')return false;
  const request={nonce:'mp-camera-'+Date.now()+'-'+(++cameraSerial)};
  let count=0;
  for(const key of ['yaw','pitch','distance'])if(Object.hasOwn(value,key)){
   if(typeof value[key]!=='number'||!Number.isFinite(value[key]))return false;
   request[key]=value[key];count++;
  }
  if(!count)return false;
  try{module.FS.writeFile('/tmp/mp-mobile-camera.json.tmp',JSON.stringify(request));module.FS.rename('/tmp/mp-mobile-camera.json.tmp','/tmp/mp-mobile-camera.json');return true;}
  catch(error){fail(error);return false;}
 }
 function cancelCamera(){
  if(!module?.FS)return false;
  for(const name of ['/tmp/mp-mobile-camera.json','/tmp/mp-mobile-camera.json.tmp'])try{module.FS.unlink(name);}catch{}
  return true;
 }
 function setCombatLock(value){
  if(!module?.FS||!value||typeof value.enabled!=='boolean'||typeof value.suspended!=='boolean')return false;
  // OFF must remain writable during teardown/unsafe frames. This mailbox is
  // synchronous and latest-write-only, so no queued ON can follow a newer OFF.
  if(value.enabled&&(stopped||native.state?.worldReady!==true||!ordersAllowed()))return false;
  const activation=value.activation===undefined&&!value.enabled?native.combatLockIntent?.activation||'':value.activation;
  if(typeof activation!=='string'||activation.length>160||value.enabled&&!activation.length)return false;
  const request={nonce:'mp-combat-'+Date.now()+'-'+(++combatSerial),activation,enabled:value.enabled,suspended:value.suspended};
  try{
   module.FS.writeFile('/tmp/mp-mobile-combat.json.tmp',JSON.stringify(request));
   module.FS.rename('/tmp/mp-mobile-combat.json.tmp','/tmp/mp-mobile-combat.json');
   native.combatLockIntent=Object.freeze(request);return true;
  }catch(error){fail(error);return false;}
 }
 globalThis.__towersHtml={session:'multiplayer-'+Date.now(),isActive:()=>!!native.state?.worldReady&&ordersAllowed(),isEnded:()=>stopped||!ordersAllowed(),
  consume(name,nonce,revision){
   if(!module?.FS)return false;const path=prefix+name,value=read(path);
   if(!value||nonce&&value.nonce!==nonce||revision&&value.revision!==revision)return false;
   try{module.FS.unlink(path);return true;}catch{return false;}
  }};
 globalThis.PcMultiplayerNativeUI={prepare,initialize,attach,researchReports:()=>native.reports,report:()=>({state:native.state,room:native.room,roomPending,terrainRevision:native.terrain?.revision,errors:native.errors.slice(),lastEvent,fencedInput:{...fencedInput}})};
 setInterval(poll,50);
 addEventListener('pagehide',()=>{setCombatLock({enabled:false,suspended:true});roomPreviewCache=null;stopped=true;});
})();
