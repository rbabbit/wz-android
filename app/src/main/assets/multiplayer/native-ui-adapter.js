/* Matched4.7 client UI bridge: no WASM addresses, rules mods or simulation hooks. */
(() => {
 'use strict';
 let prepared=null,module=null,serial=0,cameraSerial=0,combatSerial=0,lastEvent=0,lastAcknowledgedEvent=0,lastTerrainRevision=-1,queue=Promise.resolve(),polling=false,stopped=false;
 const prefix='/data/mp/multiplay/script/rules/';
 const fencedInput={pointer:0,mouse:0,touch:0,wheel:0};
 const native=globalThis.PcMultiplayerNative={state:null,terrain:null,reports:{ready:false,reports:[]},errors:[],
  prepare,ready:initialize,poll,refresh:()=>{poll();return Promise.resolve(native.state);},command,setCamera,cancelCamera,setCombatLock,combatLockIntent:null,researchReports:()=>native.reports};
 function fail(error){const text=String(error?.message||error);if(native.errors.at(-1)!==text)native.errors.push(text);if(native.errors.length>30)native.errors.shift();console.warn('Multiplayer UI: '+text);}
 function prepare(){
  if(!prepared)prepared=Promise.all([fetch('mobile-ui-runtime.js').then(r=>{if(!r.ok)throw Error('Mobile controls could not load');return r.text();}),fetch('/warzone/command-catalog.json').then(r=>{if(!r.ok)throw Error('Unit catalogue could not load');return r.text();})]);
  return prepared;
 }
 function initialize(value){
  module=value;const fs=module?.FS;if(!fs)throw Error('Native filesystem is not available');
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
  native.state=state;globalThis.PcMultiplayerState=Object.assign(globalThis.PcMultiplayerState||{},state);
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
  if(stopped||!native.state?.worldReady)return;
  const pages=globalThis.__warzoneCommands;
  if(pages?.isPlacement?.()||pages?.isDemolishing?.())return;
  try{
   await pages?.send?.('state',{}, {fresh:true});
   if(kind==='research')globalThis.__blockNightResearch?.openForLabId?.(id);
   else if(kind==='factory')pages?.openFactory?.(id);
  }catch(error){fail(error);}
 },0);
 function emit(text){dispatchEvent(new CustomEvent('blocknight-engine-output',{detail:{text}}));}
 function poll(){
  if(stopped||polling||!module?.FS)return;polling=true;
  try{
   const state=read('/tmp/mp-mobile-state.json');if(state)receive(state);
   const events=read('/tmp/mp-mobile-events.json');
   if(events&&Array.isArray(events.messages)){
    const first=Number(events.first)||1;
    events.messages.forEach((text,i)=>{const id=first+i;if(id>lastEvent){emit(String(text));lastEvent=id;}});
    if(lastEvent>lastAcknowledgedEvent){module.FS.writeFile('/tmp/mp-mobile-events-ack',String(lastEvent));lastAcknowledgedEvent=lastEvent;}
   }
   if(native.state?.worldReady&&(!native.terrain||Number(native.state.gameTime)-lastTerrainRevision>=750)){
    const terrain=read('/tmp/mp-mobile-terrain.json');if(terrain){native.terrain=terrain;lastTerrainRevision=Number(terrain.revision)||0;}
    const reports=read('/tmp/mp-mobile-reports.json');if(reports){native.reports=reports;globalThis.__warzoneIntelligence?.acceptReports?.(reports);}
   }
  }catch(error){fail(error);}finally{polling=false;}
 }
 function command(action,data={}){
  const run=()=>new Promise(resolve=>{
   if(stopped||!module?.FS||!native.state?.worldReady){resolve({ok:false,reason:'world-not-ready'});return;}
   const nonce='mp-ui-'+Date.now()+'-'+(++serial),request={...data,action,nonce};
   try{module.FS.writeFile('/tmp/mp-mobile-input.json',JSON.stringify(request));}catch(error){fail(error);resolve({ok:false,reason:'native-unavailable'});return;}
   const start=performance.now();
   const inspect=()=>{
    if(stopped){resolve({ok:false,reason:'session-ended'});return;}
    poll();const response=read('/tmp/mp-mobile-input-result.json');
    if(response?.nonce===nonce){resolve(response);return;}
    if(performance.now()-start>=2500){resolve({ok:false,reason:'native-timeout'});return;}
    setTimeout(inspect,16);
   };inspect();
  });
  const promise=queue.then(run,run);queue=promise.catch(()=>{});return promise;
 }
 function setCamera(value){
  if(stopped||!module?.FS||native.state?.worldSafe!==true||!value||typeof value!=='object')return false;
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
  if(value.enabled&&(stopped||native.state?.worldReady!==true))return false;
  const activation=value.activation===undefined&&!value.enabled?native.combatLockIntent?.activation||'':value.activation;
  if(typeof activation!=='string'||activation.length>160||value.enabled&&!activation.length)return false;
  const request={nonce:'mp-combat-'+Date.now()+'-'+(++combatSerial),activation,enabled:value.enabled,suspended:value.suspended};
  try{
   module.FS.writeFile('/tmp/mp-mobile-combat.json.tmp',JSON.stringify(request));
   module.FS.rename('/tmp/mp-mobile-combat.json.tmp','/tmp/mp-mobile-combat.json');
   native.combatLockIntent=Object.freeze(request);return true;
  }catch(error){fail(error);return false;}
 }
 globalThis.__towersHtml={session:'multiplayer-'+Date.now(),isActive:()=>!!native.state?.worldReady,isEnded:()=>stopped,
  consume(name,nonce,revision){
   if(!module?.FS)return false;const path=prefix+name,value=read(path);
   if(!value||nonce&&value.nonce!==nonce||revision&&value.revision!==revision)return false;
   try{module.FS.unlink(path);return true;}catch{return false;}
  }};
 globalThis.PcMultiplayerNativeUI={prepare,initialize,attach,researchReports:()=>native.reports,report:()=>({state:native.state,terrainRevision:native.terrain?.revision,errors:native.errors.slice(),lastEvent,fencedInput:{...fencedInput}})};
 setInterval(poll,50);
 addEventListener('pagehide',()=>{setCombatLock({enabled:false,suspended:true});stopped=true;});
})();
