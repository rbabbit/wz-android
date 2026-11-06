// One-time source migration. Acorn is supplied explicitly; not a build dependency.
const fs = require('fs'), path = require('path');
const acorn = require(process.argv[2]);
const dir = path.resolve(__dirname, '../app/src/main/assets');
function source(name) {
  const text = fs.readFileSync(path.resolve(__dirname, '../archive/legacy-html-ui',name), 'utf8');
  const body = acorn.parse(text, {ecmaVersion:'latest'}).body[0].expression.callee.body.body;
  return {text, fn(name) {const node = body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name); if (!node) throw Error(name); return text.slice(node.start,node.end);}};
}
const old = source('warzone-command-pages.js');
const names = ['loadSaved','persist','send','flush','accept','availableBuildings','availableParts','findPart','availableDesign','constructionRows','nativeFrames','setNativeHudHidden','nativeTap','nativeConstructionFinished','nearbyBuildGroup','constructionParticipants','buildGroup','buildSelectionMatches','openBuild','beginPlacement','nativeBuildTap','nativeBuildMenuTap','flushNativeSites','queueNativeSite','drainBuildInput','selectMode','afterBuildExit','selectNearbyTrucks','designFitsFactory','templateParts'];
let functions = names.map(name => old.fn(name)).join('\n\n');
functions = functions
 .replace("element('wt-native-back').hidden=true;",'')
 .replace("state.notice='';element('wt-sidebar-notice').hidden=true;", "state.notice='';")
 .replace("state.buildOpen=true;element('wt-build-sidebar').hidden=false;",'state.buildOpen=true;')
 .replace("state.scroll.build=element('wt-page-content').scrollTop;state.page='';state.closes++;", "state.page='';state.closes++;")
 .replace("element('wt-command-pages').hidden=true;delete doc.body.dataset.commandPage;",'')
 .replace("state.buildOpen=Boolean(keepSidebar&&state.buildOpen);element('wt-build-sidebar').hidden=!state.buildOpen;",'state.buildOpen=Boolean(keepSidebar&&state.buildOpen);')
 .replace("if(element('wt-placement-map'))element('wt-placement-map').hidden=!hidden;",'publish();')
 .replace('    install();if(state.buildingOpening)return;', '    if(state.buildingOpening)return;');
const initial = old.text.slice(old.text.indexOf('  const PATH'), old.text.indexOf('  const esc'));
const support = `
const host=window.parent, doc=host.document;
const element=id=>doc.getElementById(id);
const module=()=>window.LaunchedModule?.FS?window.LaunchedModule:window.Module;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const publish=()=>window.__towersNative?.publish();
const render=publish, renderSidebar=publish, refreshLive=publish;
function reason(code){return ({'no-truck':'You need a construction truck.','invalid-site':'Choose an open, level site.','unreachable':'No assigned truck can reach that site.','already-queued':'A build is already queued here.','components-unavailable':'Some components are not researched yet.','incompatible-design':'These components are incompatible.','factory-incompatible':'This factory cannot produce this design.','occupied':'A completed structure occupies this site.','module-parent':'Choose a completed matching building.','module-limit':'This building has all its modules.','structure-limit':'The structure limit has been reached.','hq-required':'Complete a Command Centre first.','timeout':'The game has not replied yet. Your accepted orders are kept.'})[code]||String(code||'Warzone did not accept this command.');}
function notify(message){state.notice=message;window.__towersNative?.notice(message);publish();}
function updateHUD(){
 if(state.snapshot&&state.nativeMenu==='build'&&!state.buildingOpening)state.nativeBuildGroup=constructionParticipants(state.nativeBuildGroup,state.snapshot.trucks);
 if(state.snapshot&&state.nativeMenu==='build'&&state.nativeBuildPlaced&&!state.exitingBuild&&!state.pendingItem&&!state.buildingOpening){const group=state.snapshot.trucks.filter(t=>state.nativeBuildGroup.includes(t.id));if(nativeConstructionFinished(state,group,state.snapshot.gameTime,Boolean(state.siteChecks||state.nativePendingSites.length||window.__kalaWarzoneTouch.report().pendingClicks))){state.nativeBuildSawWork=false;state.nativeBuildIdleAt=0;selectMode();}}
 publish();
}
let holds=0, captureSerial=0;const captures=new Map();
async function freezeBattlefield(){
 if(++holds>1)return;
 const id=++captureSerial;
 try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{captures.delete(id);reject(Error('Battlefield capture did not complete.'));},2200);captures.set(id,ok=>{clearTimeout(timeout);ok?resolve():reject(Error('Battlefield is not ready.'));});window.BlockNightAndroid.nativeFreeze(id,true);});}catch(e){holds--;throw e;}
}
async function releaseBattlefield(){holds=Math.max(0,holds-1);if(holds)return;await nativeFrames(1);if(!holds)window.BlockNightAndroid.nativeFreeze(0,false);}
function requestState(){if(!Array.from(state.pending.values()).some(p=>p.command.action==='state'))send('state');state.lastPoll=Date.now();}
function cancelPlacement(){state.placement=null;window.WarzoneTerrain?.active(false);updateHUD();}
async function close(){if(!state.page)return;state.page='';state.closes++;window.__kalaWarzoneTouch?.releaseAll(true);await send('native-menu',{menu:'close'});publish();}
async function open(page){
 if(page==='build')return openSidebar();
 await selectMode();window.__blockNightResearch?.close();state.page=page;state.notice='';window.__kalaWarzoneTouch?.releaseAll(true);await send('native-menu',{menu:'close'});requestState();publish();
}
async function openSidebar(){if(state.buildingOpening||state.sidebarOpening)return;state.sidebarOpening=true;++state.navigationSerial;try{window.__blockNightResearch?.close();if(state.page)await close();state.buildOpen=true;requestState();publish();}finally{state.sidebarOpening=false;}}
async function openNative(menu){await selectMode();window.__blockNightResearch?.close();state.nativeMenu=menu;state.nativeMenuPending=true;publish();try{const r=await send('native-menu',{menu});if(!r.ok){state.nativeMenu='';notify(reason(r.reason));}return r;}finally{state.nativeMenuPending=false;publish();}}
async function closeNative(discard=false){
 if(!discard&&(state.nativeMenu==='build'||window.__kalaWarzoneTouch?.report().pendingClicks))return selectMode();
 state.nativeToolReady=false;state.nativeItem='';state.nativePendingSites=[];
 if(!state.nativeMenu&&!state.nativeMenuPending)return setNativeHudHidden(false);
 window.__kalaWarzoneTouch?.releaseAll(true);++state.menuRevision;state.nativeMenuPending=false;state.nativeMenu='';
 const r=await send('native-menu',{menu:'close'});await setNativeHudHidden(false);if(!r.ok)notify(reason(r.reason));publish();return r;
}
async function saveBlueprint(design){
 if(state.saving.has(design.id))throw Error('This design is already saving.');
 if(!state.saved.some(d=>d.id===design.id)&&state.saved.length>=100)throw Error('The library holds 100 designs. Delete one first.');
 state.saving.add(design.id);try{const r=await send('save-design',{design});if(!r.ok)throw Error(reason(r.reason));const d={...r.result,id:design.id};delete d.native;const before=state.saved.slice(),i=state.saved.findIndex(v=>v.id===d.id);if(i>=0)state.saved[i]=d;else state.saved.push(d);if(!persist()){state.saved=before;throw Error('Could not save to this device. Your previous library was kept.');}publish();return d;}finally{state.saving.delete(design.id);}
}
function deleteBlueprint(id){const before=state.saved.slice();state.saved=state.saved.filter(d=>d.id!==id);if(!persist()){state.saved=before;throw Error('Could not delete from this device.');}publish();return true;}
`;
const tail = `
loadSaved();
window.addEventListener('warzone-command-reply',e=>accept(e.detail));
window.addEventListener('warzone-native-input-finished',()=>{if(!state.pendingItem&&!state.buildingOpening)requestState();});
window.__warzoneCommands={tower:true,nativeUI:true,open,close,closeNative,openNative,beginPlacement,cancelPlacement,placeAt:()=>false,previewAt:()=>null,hidePreview:()=>{},send,accept,
 isOpen:()=>Boolean(state.page),isPlacement:()=>false,nativeMenuOpen:()=>Boolean(state.nativeMenu&&state.nativeMenu!=='build'),nativeBuildOpen:()=>state.nativeMenu==='build',nativeBuildMenuOpen:()=>state.nativeMenu==='build'&&!state.nativeToolReady,nativeHudHidden:()=>state.nativeHudHidden,nativeBuildTap,nativeBuildMenuTap,queueNativeSite,selectMode,afterBuildExit,selectNearbyTrucks,openBuild,
 freezeComplete:(id,ok)=>{const callback=captures.get(id);captures.delete(id);callback?.(ok);},saveBlueprint,deleteBlueprint,
 model:()=>({page:state.page,buildOpen:state.buildOpen,notice:state.notice,pendingItem:state.pendingItem,busy:state.buildingOpening||Boolean(state.pendingItem)||state.exitingBuild,nativeMenu:state.nativeMenu,nativeItem:state.nativeItem,nativeToolReady:state.nativeToolReady,nativeHudHidden:state.nativeHudHidden,saved:state.saved,snapshot:state.snapshot,buildings:availableBuildings(),construction:constructionRows(),catalog:state.catalog}),
 report:()=>({...state,pending:state.pending.size,saving:[...state.saving],nativePendingSites:state.nativePendingSites.length,captures:captures.size,holds,terrain:window.WarzoneTerrain?.report()})};
fetch('/warzone/command-catalog.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(c=>{state.catalog=c;publish();}).catch(()=>notify('The command catalogue could not load. Restart the app.'));
setInterval(()=>{
 if(!state.pendingItem&&!state.buildingOpening&&window.__kalaWarzoneTouch?.report().hudVisible&&Date.now()-state.lastPoll>(state.nativeMenu==='build'?250:state.page?1000:1200))requestState();
 if(state.pending.size){window.__blockNightResearch?.pollOutput();if(Date.now()-state.lastWrite>1500)flush(true);for(const p of state.pending.values())if(!p.warned&&Date.now()-p.at>12000){p.warned=true;state.timeouts++;if(p.command.action!=='state')notify(reason('timeout'));}}
},150);
`;
functions=functions.replace("const nonce=", "if(state.pending.size>=64)return Promise.resolve({ok:false,reason:'Too many pending commands. Wait for the game.'});\n    const nonce=");
fs.writeFileSync(path.join(dir,'warzone-command-core.js'),`/* Towers command transport and original native construction FIFO. No app DOM UI. */\n(()=>{'use strict';if(window.__warzoneCommands)return;\n${initial}\n${support}\n${functions}\n${tail}\n})();\n`);

const research=source('warzone-mobile-research.js');
const head=research.text.slice(0,research.text.indexOf('  function createShell()'));
const selected=['queueModule','writeQueueCommand','clearRunnerTimers','finishRunnerFailure','startQueueSync','processQueues','assignTopic','removeQueuedTopic','report'].map(n=>research.fn(n)).join('\n');
fs.writeFileSync(path.join(dir,'warzone-research-core.js'),head+`
// Native Android owns the screen; these hooks publish data only.
const renderAll=()=>window.__towersNative?.publish(),renderLabs=renderAll,renderSummary=renderAll;
function showQueueStatus(message,tone){window.__towersNative?.notice(message,tone==='error');}
function finishClose(){state.open=false;state.opening=false;state.closes++;renderAll();return true;}
function close(){if(state.runner)state.runner.background=true;state.syncBlocked=false;processQueues();return finishClose();}
function open(){state.open=true;state.opens++;state.syncBlocked=false;processQueues();renderAll();return true;}
${selected}
window.__blockNightResearch={version:VERSION,nativeUI:true,open,close,removeQueuedTopic,processQueues,pollOutput:pollResearchLogs,report,
 enqueue:(labId,topicId)=>{state.activeLab=state.engineLabs.findIndex(l=>l.id===labId);return assignTopic(state.catalog.find(t=>t.id===topicId)?.nativeIndex??-1);},
 remove:(labId,topicId)=>removeQueuedTopic(labId,queueForLab(labId).findIndex(t=>t.id===topicId)),
 model:()=>({...report(),catalog:state.catalog,error:state.assignmentError,queueItems:state.engineLabs.map(l=>({labId:l.id,topics:queueForLab(l.id)}))})};
})();\n`);

const waves=source('warzone-towers-wave-hud.js');
let wavehead=waves.text.slice(0,waves.text.indexOf('  function hudDocument()'));
fs.writeFileSync(path.join(dir,'warzone-wave-core.js'),wavehead+`
${waves.fn('nextWave')}
function render(){
 const wave=state.snapshot;if(!wave)return;
 if(['defeated','victory'].includes(wave.phase)&&!state.failureShown){state.failureShown=true;window.__kalaWarzoneTouch?.releaseAll();if(wave.phase==='victory')window.BlockNightAndroid?.battleWon();else window.BlockNightAndroid?.battleFinished();}
 if(state.pendingCommand&&(wave.lastCommand===state.pendingCommand||Date.now()-state.commandSentAt>5000))state.pendingCommand='';
 window.__towersNative?.publish();
}
${waves.fn('consumeLine')}
${waves.fn('pollLogs')}
setTimeout(pollLogs,250);setInterval(pollLogs,500);
window.__warzoneTowersWaves={version:VERSION,nativeUI:true,nextWave,report:()=>({...state,active:true})};
})();\n`);

const touch=source('warzone-touch-controls.js');
const replacements={
 updateCombatHud:`function updateCombatHud(){window.__towersNative?.publish();}`,
 feedback:`function feedback(x,y,kind='tap'){state.feedbacks++;window.BlockNightAndroid?.nativeFeedback(x,y,window.parent.innerWidth,window.parent.innerHeight,kind);}`,
 showCombatHud:`function showCombatHud(){state.hudVisible=true;showBattlefieldViewport();updateCombatHud();return true;}`,
 showHelp:`function showHelp(){window.BlockNightAndroid?.nativeNavigate('help');return true;}`
};
let input=touch.text;
for(const [name,value] of Object.entries(replacements))input=input.replace(touch.fn(name),value);
fs.writeFileSync(path.join(dir,'warzone-engine-input.js'),input);
