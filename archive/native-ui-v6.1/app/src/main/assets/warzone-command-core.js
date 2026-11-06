/* Towers command transport and original native construction FIFO. No app DOM UI. */
(()=>{'use strict';if(window.__warzoneCommands)return;
  const PATH = '/data/mp/multiplay/script/rules/warzone-towers-command.json';
  const state = {page:'',catalog:null,snapshot:null,pending:new Map(),serial:0,writes:0,acks:0,
    timeouts:0,lastWrite:0,lastPoll:0,nativeMenu:'',history:[],placement:null,session:'',category:'DEFENCES',search:'',buildChoice:'',buildOpen:false,siteChecks:0,cancelSerial:0,nativeHudHidden:false,pendingItem:'',designStep:'body',designSearch:'',nativeItem:'',
    selected:'',deletePending:'',confirmNew:false,draftOriginal:'',saved:[],draft:{id:'',name:'',body:'',propulsion:'',turrets:['']},validation:null,
    validationSerial:0,saving:new Set(),factory:0,productionCount:1,menuRevision:0,nativeMenuPending:false,
    navigationSerial:0,nativeBuildGeneration:0,nativeToolReady:false,nativeToolSelectionAt:0,nativePendingSites:[],exitPromise:null,exitingBuild:false,nativeBuildGroup:[],nativeBuildPlaced:false,nativeBuildSawWork:false,nativeBuildIdleAt:0,buildingOpening:false,notice:'',size:1,opens:0,closes:0,placements:0,rejects:0,scroll:{}};


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
 try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{captures.delete(id);reject(Error('Battlefield capture did not complete.'));},2200);captures.set(id,ok=>{clearTimeout(timeout);ok?resolve():reject(Error('Battlefield is not ready.'));});window.BlockNightAndroid.nativeFreeze(window.__towersNative.session,id,true);});}catch(e){holds--;throw e;}
}
async function releaseBattlefield(){holds=Math.max(0,holds-1);if(holds)return;await nativeFrames(1);if(!holds)window.BlockNightAndroid.nativeFreeze(window.__towersNative.session,0,false);}
function requestState(){if(!Array.from(state.pending.values()).some(p=>p.command.action==='state'))send('state');state.lastPoll=Date.now();}
function cancelPlacement(){state.placement=null;window.WarzoneTerrain?.active(false);updateHUD();}
async function close(){if(!state.page)return;state.page='';state.closes++;window.__kalaWarzoneTouch?.releaseAll(true);await send('native-menu',{menu:'close'});publish();}
async function open(page){
 if(page==='build')return openSidebar();
 const navigation=++state.navigationSerial;await selectMode();if(navigation!==state.navigationSerial)return {cancelled:true};
 window.__blockNightResearch?.close();state.page=page;state.notice='';window.__kalaWarzoneTouch?.releaseAll(true);await send('native-menu',{menu:'close'});if(navigation!==state.navigationSerial)return {cancelled:true};requestState();publish();
}
async function openResearch(){const navigation=++state.navigationSerial;await selectMode();if(navigation!==state.navigationSerial)return {cancelled:true};return window.__blockNightResearch.open();}
async function exit(discard=false){++state.navigationSerial;window.__blockNightResearch?.close();return selectMode(discard);}
async function openSidebar(){const navigation=++state.navigationSerial;state.sidebarOpening=true;try{if(state.exitPromise)await state.exitPromise;while(state.buildingOpening){if(navigation!==state.navigationSerial)return {cancelled:true};await pause(20);}window.__blockNightResearch?.close();if(state.page)await close();if(state.nativeMenu&&state.nativeMenu!=='build')await closeNative();if(navigation!==state.navigationSerial)return {cancelled:true};state.buildOpen=true;requestState();publish();}finally{state.sidebarOpening=false;}}
async function openNative(menu){const navigation=++state.navigationSerial;await selectMode();if(navigation!==state.navigationSerial)return {cancelled:true};window.__blockNightResearch?.close();state.nativeMenu=menu;state.nativeMenuPending=true;const revision=++state.menuRevision;publish();try{const r=await send('native-menu',{menu});if(navigation!==state.navigationSerial||revision!==state.menuRevision)return {cancelled:true};if(!r.ok){state.nativeMenu='';notify(reason(r.reason));}return r;}finally{if(revision===state.menuRevision)state.nativeMenuPending=false;publish();}}
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

function loadSaved(){
    try { const value=JSON.parse(window.BlockNightAndroid?.loadDesigns?.() || localStorage.getItem('wt-designs-v1') || '{}');
      state.saved=Array.isArray(value.designs)?value.designs.filter(d=>d&&d.id&&d.name&&d.body&&d.propulsion&&Array.isArray(d.turrets)&&d.turrets.length>0&&d.turrets.length<=3).slice(0,100):[];
      state.size=Number(localStorage.getItem('wt-command-size'))||1;
    } catch (_) {state.saved=[];}
  }

function persist(){
    const json=JSON.stringify({version:1,designs:state.saved});
    try {if(window.BlockNightAndroid?.saveDesigns)return window.BlockNightAndroid.saveDesigns(json)===true;
      localStorage.setItem('wt-designs-v1',json);return true;}catch(_){return false;}
  }

function send(action,data={}){
    if(action==='state'){const existing=Array.from(state.pending.values()).find(p=>p.command.action==='state');if(existing?.promise)return existing.promise;}
    if(state.pending.size>=64)return Promise.resolve({ok:false,reason:'Too many pending commands. Wait for the game.'});
    const nonce=`cmd-${Date.now()}-${++state.serial}`;
    const entry={command:{...data,action,nonce},at:Date.now(),warned:false};
    const promise=new Promise(resolve=>{entry.resolve=resolve;state.pending.set(nonce,entry);flush();});entry.promise=promise;return promise;
  }

function flush(force=false){
    const fs=module()?.FS;
    if(!fs?.writeFile||!fs?.rename)return;
    if(!state.pending.size){if(force)try{fs.writeFile(PATH+'.tmp',JSON.stringify({revision:'idle',commands:[]}),{encoding:'utf8'});fs.rename(PATH+'.tmp',PATH);}catch(_){}return;}
    if(!force&&Date.now()-state.lastWrite<25){setTimeout(flush,30);return;}
    try {const commands=Array.from(state.pending.values()).slice(0,8).map(p=>p.command);
      fs.writeFile(PATH+'.tmp',JSON.stringify({revision:`r-${Date.now()}-${++state.writes}`,commands}),{encoding:'utf8'});
      fs.rename(PATH+'.tmp',PATH);state.lastWrite=Date.now();
    }catch(_){/* Engine filesystem is not ready during launcher startup. */}
  }

function accept(reply){
    if(reply.action==='build-ready'){if(state.nativeMenu==='build'&&reply.generation===state.nativeBuildGeneration&&state.nativeToolSelectionAt){state.nativeToolReady=true;flushNativeSites();}return;}
    if(reply.action==='selection'&&state.snapshot){state.snapshot.selectedUnits=reply.result;const ids=new Set(reply.result.map(u=>u.id));state.snapshot.trucks.forEach(t=>t.selected=ids.has(t.id));updateHUD();return;}
    const pending=state.pending.get(reply.nonce);if(!pending)return;
    state.pending.delete(reply.nonce);state.acks++;
    if(!['state','preview-build','validate-design'].includes(reply.action)){state.history.push(reply);state.history=state.history.slice(-100);}
    if(reply.action==='state'&&reply.ok){const before=state.snapshot;
      if(before&&reply.result.gameTime<before.gameTime){state.nativeToolReady=false;state.nativeItem='';renderSidebar();}
      const changed=before&&(before.buildings.map(b=>b.id).join()!==reply.result.buildings.map(b=>b.id).join()||before.parts.join()!==reply.result.parts.join()||JSON.stringify(before.factories.map(f=>[f.id,f.ready,f.modules,f.templates]))!==JSON.stringify(reply.result.factories.map(f=>[f.id,f.ready,f.modules,f.templates]))||JSON.stringify(before.templates)!==JSON.stringify(reply.result.templates));
      state.snapshot=reply.result;window.__blockNightResearch?.acceptQueues(reply.result.researchQueues);updateHUD();refreshLive();if(changed&&['build','saved','factory'].includes(state.page))render();if(changed&&state.buildOpen)renderSidebar();}
    if(!reply.ok)state.rejects++;
    pending.resolve(reply);flush(true);
  }

function availableBuildings(){const live=new Map((state.snapshot?.buildings||[]).map(b=>[b.id,b]));
    const native=state.snapshot?.nativeBuildOptions;
    return (state.catalog?.buildings||[]).filter(b=>live.has(b.id)&&(!native||native.includes(b.id))).map(b=>({...b,power:live.get(b.id).power}));}

function availableParts(group){const available=new Set(state.snapshot?.parts||[]);
    return (state.catalog?.components[group]||[]).filter(p=>available.has(p.id));}

function findPart(id){return Object.values(state.catalog?.components||{}).flat().find(p=>p.id===id);}

function availableDesign(d){const parts=new Set(state.snapshot?.parts||[]);return [d.body,d.propulsion,...d.turrets].every(id=>parts.has(id));}

function constructionRows(){
    const s=state.snapshot;if(!s)return [];
    const sites=(s.constructionSites||[]).filter(j=>j.status!=='interrupted').map(j=>({...j,name:state.catalog?.buildings.find(b=>b.id===j.itemId)?.name||'Structure'}));
    for(const b of s.construction||[])if(!sites.some(j=>j.structureId===b.id))sites.push(b);
    const rank={building:0,'waiting-power':1,'waiting-trucks':2,travelling:3,queued:4,done:5};
    return sites.sort((a,b)=>(rank[a.status]??4)-(rank[b.status]??4));
  }

async function nativeFrames(count=2){const frame=window.__kalaWarzoneTouch.report().nativeRenderFrames;for(let i=0;i<80;i++){await pause(20);if(window.__kalaWarzoneTouch.report().nativeRenderFrames>=frame+count)return;}}

async function setNativeHudHidden(hidden){
    if(state.nativeHudHidden===hidden)return;
    // Keep Warzone's widget processing running: it commits native build orders.
    // Extend the real viewport below the clipped host to put its bottom truck
    // window/radar outside the playing surface. SDL and terrain picking still
    // share the same viewport; no finished-frame scaling or hidden hit regions.
    state.nativeHudHidden=hidden;
    element('warzone-game-frame').style.height=hidden?'calc(100% + 232px)':'';
    await nativeFrames(1);
    publish();
  }

async function nativeTap(x,y,add=false){
    if(window.__kalaWarzoneTouch.nativeMenuClick)return window.__kalaWarzoneTouch.nativeMenuClick(x,y,add);
    window.__kalaWarzoneTouch.nativeSelectClick(x,y,add);
    for(let i=0;i<80;i++){await pause(50);if(!window.__kalaWarzoneTouch.report().pendingClicks)break;}
  }

function nativeConstructionFinished(build,group,gameTime,pending){
    if(group.some(t=>t.building)){build.nativeBuildSawWork=true;build.nativeBuildIdleAt=0;return false;}
    if(!build.nativeBuildSawWork||pending||group.some(t=>t.order!==0)){build.nativeBuildIdleAt=0;return false;}
    // Native queued orders can briefly report idle between sites. Require
    // continued simulation time at idle before closing the placement tool.
    if(!build.nativeBuildIdleAt){build.nativeBuildIdleAt=gameTime;return false;}
    return gameTime-build.nativeBuildIdleAt>=1200;
  }

function nearbyBuildGroup(trucks,selected,anchor,forceNearby){
    const anchors=!forceNearby&&selected.length>1?selected:[anchor];
    const ids=new Set(anchors.filter(Boolean).map(t=>t.id));
    // Include the whole connected local cluster. A single radius around an
    // edge truck dropped constructors at the other edge of the same area.
    let changed=true;
    while(changed){changed=false;for(const t of trucks){if(ids.has(t.id))continue;if(trucks.some(a=>ids.has(a.id)&&Math.hypot(t.x-a.x,t.y-a.y)<=8)){ids.add(t.id);changed=true;}}}
    return trucks.filter(t=>ids.has(t.id));
  }

function constructionParticipants(group,trucks){
    // Native builder cards can change the selection after automatic grouping.
    // Keep prior participants too: their earlier queued work must still finish.
    return Array.from(new Set([...group,...trucks.filter(t=>t.selected).map(t=>t.id)]));
  }

function buildGroup(snapshot,forceNearby){
    const trucks=snapshot.trucks,visibleHeight=Math.min(innerHeight,host.innerHeight-element('warzone-game-frame').getBoundingClientRect().y);
    const centre=window.WarzoneTerrain?.pick(innerWidth/2,visibleHeight/2)||{x:snapshot.mapWidth/2,y:snapshot.mapHeight/2};
    const selected=trucks.filter(t=>t.selected),anchor=(forceNearby?trucks:selected.length?selected:trucks).slice().sort((a,b)=>Math.hypot(a.x-centre.x,a.y-centre.y)-Math.hypot(b.x-centre.x,b.y-centre.y))[0];
    return nearbyBuildGroup(trucks,selected,anchor,forceNearby);
  }

function buildSelectionMatches(snapshot,group){const selected=snapshot.selectedUnits||snapshot.trucks.filter(t=>t.selected);return selected.length===group.length&&group.every(t=>selected.some(d=>d.id===t.id));}

async function openBuild(forceNearby=false,keepPage=false,forPlacement=false,context=null){
    if(state.buildingOpening)return;
    if(window.__kalaWarzoneTouch?.report().pendingClicks){const navigation=++state.navigationSerial;await selectMode();if(navigation!==state.navigationSerial)return;}
    state.buildingOpening=true;renderSidebar();let frozen=false;const navigation=state.navigationSerial,openingRevision=state.menuRevision;
    try{
      await freezeBattlefield();frozen=true;if(navigation!==state.navigationSerial||openingRevision!==state.menuRevision||state.exitingBuild)return;if(!forPlacement)await setNativeHudHidden(false);
      state.nativeBuildPlaced=false;state.nativeBuildSawWork=false;state.nativeBuildIdleAt=0;state.nativeToolReady=false;state.nativeToolSelectionAt=0;state.nativePendingSites=[];
      cancelPlacement();if(!keepPage)close();window.__blockNightResearch?.close?.();window.__kalaWarzoneTouch.releaseAll(true);
      const reply=context?{ok:true,result:context}:await send('state');if(!reply.ok||navigation!==state.navigationSerial||openingRevision!==state.menuRevision||state.exitingBuild)return;
      const trucks=reply.result.trucks;if(!trucks.length){
        state.nativeBuildGroup=[];await closeNative(true);
        // Warzone's Select All Trucks binding clears the previous selection
        // even when it finds no constructors. Never leave a combat unit or an
        // old construction ghost selected as a substitute.
        await window.__kalaWarzoneTouch.selectAllTrucks();
        await nativeFrames(2);await send('state');notify(reason('no-truck'));return;
      }
      window.WarzoneTerrain?.active(true);
      // The observer sleeps between placements. Let the current camera render
      // before choosing its local group, rather than using the previous view.
      if(!window.WarzoneTerrain?.report?.().ready)await nativeFrames(1);
      const group=buildGroup(reply.result,forceNearby),matches=buildSelectionMatches(reply.result,group);
      state.nativeBuildGroup=group.map(t=>t.id);state.nativeBuildPlaced=false;state.nativeBuildSawWork=false;
      state.nativeMenu='build';state.nativeMenuPending=true;const revision=++state.menuRevision;
      const opened=await send('native-menu',{menu:'build'});if(revision!==state.menuRevision||!opened.ok)return;
      state.nativeMenuPending=false;state.nativeBuildGeneration=opened.result.generation;
      // Stock BuildController reverses enumDroid order. Select through its real
      // builder cards; this also works when the chosen trucks are off camera.
      const builders=trucks.slice().reverse(),base=144+(innerWidth-640)/2;let builderPage=0;
      for(let i=0;!matches&&i<group.length;i++){
        if(revision!==state.menuRevision)return;
        const index=builders.findIndex(t=>t.id===group[i].id),targetPage=Math.floor(index/5);
        if(targetPage!==builderPage){await nativeTap(base+22+targetPage*28,innerHeight-125);builderPage=targetPage;}
        await nativeTap(base+34+(index%5)*62,innerHeight-85,i>0);
      }
      const check=matches?reply:await send('state');if(revision!==state.menuRevision)return;
      if(!buildSelectionMatches(check.result,group))throw Error('Truck selection could not be completed. Try again.');
      window.__kalaWarzoneTouch.toggleQueueMode(true);updateHUD();return check.result;
    }finally{state.buildingOpening=false;if(!forPlacement)await closeNative(true);if(frozen)await releaseBattlefield();renderSidebar();}
  }

async function beginPlacement(itemId){
    const item=availableBuildings().find(b=>b.id===itemId);if(!item||state.buildingOpening||state.pendingItem)return;
    state.pendingItem=itemId;state.notice='';renderSidebar();
    let frozen=false;const navigation=state.navigationSerial,openingRevision=state.menuRevision,current=()=>navigation===state.navigationSerial&&openingRevision===state.menuRevision&&!state.exitingBuild;try{
      window.WarzoneTerrain?.active(true);
      // Cover item changes before any asynchronous read: an early terrain tap
      // must never place the previously active structure during the handoff.
      await freezeBattlefield();frozen=true;if(!current())return;
      const fresh=await send('state');if(!fresh.ok||!current())return;
      // The engine can close placement on focus/save transitions without a new
      // script event. Reconfirm even the same item through its native picker;
      // a cached build-ready flag cannot prove the next tap is a build order.
      // The native reticule command replaces its picker without hiding our
      // sidebar or shrinking/re-expanding the engine viewport between items.
      if(state.nativeMenu==='build')await drainBuildInput();if(!current())return;
      state.buildOpen=true;
      const context=await openBuild(true,true,true,fresh.result);if(!context)return;
      const revision=state.menuRevision;
      const options=context.nativeBuildOptions||[],index=options.indexOf(itemId);
      if(index<0)throw Error('This structure needs a matching building or has reached its limit.');
      const page=Math.floor(index/12),cell=index%12;
      await nativeTap(28+page*28,innerHeight-437);
      if(revision!==state.menuRevision)return;
      state.nativeToolReady=false;state.nativeToolSelectionAt=Date.now();
      await nativeTap(40+(cell%2)*62,innerHeight-403+Math.floor(cell/2)*48);
      for(let i=0;i<60&&!state.nativeToolReady&&revision===state.menuRevision;i++){window.__blockNightResearch?.pollOutput?.();await pause(50);}
      if(revision!==state.menuRevision)return;
      if(!state.nativeToolReady)throw Error('The build tool did not activate. Please choose the structure again.');
      state.nativeItem=itemId;
      // Keep the real native build tool and its queued blueprints alive. Closing
      // a normal command page sends menu/close and would cancel that tool.
      state.page='';state.closes++;
      
      element('warzone-game-frame').inert=false;host.WarzoneHost?.restoreBattlefield?.();
      document.getElementById('canvas')?.focus({preventScroll:true});
      await setNativeHudHidden(true);
      renderSidebar();updateHUD();
    }catch(error){if(state.nativeMenu==='build')await closeNative(true);notify(error.message);}
    finally{if(frozen)await releaseBattlefield();state.pendingItem='';renderSidebar();}
  }

function nativeBuildTap(){if(state.nativeMenu==='build')state.nativeBuildPlaced=true;}

function nativeBuildMenuTap(x,y){
    if(state.nativeMenu!=='build'||state.nativeHudHidden)return;
    const base=144+(innerWidth-640)/2;
    if(x>=base&&x<base+320&&y>innerHeight-136){state.nativeToolReady=false;state.nativeToolSelectionAt=0;}
    else if(x>=6&&x<140&&y>innerHeight-430&&y<innerHeight-138){state.nativeToolReady=false;state.nativeToolSelectionAt=Date.now();}
  }

function flushNativeSites(){
    if(!state.nativeToolReady||state.nativeMenu!=='build')return;
    const points=state.nativePendingSites.splice(0);
    points.forEach(p=>window.__kalaWarzoneTouch.queuedClick(p.x,p.y));
  }

function queueNativeSite(x,y,preaccepted=false){
    if(state.nativeMenu!=='build')return false;
    if(state.exitingBuild&&!preaccepted)return true;
    if(!state.nativeToolReady&&Date.now()-state.nativeToolSelectionAt>2500){notify('Open BUILD and choose a structure first.');return true;}
    const point=window.WarzoneTerrain?.pick(x,y),itemId=state.nativeItem,cancellation=state.cancelSerial;
    if(!point){notify('Wait for the battlefield view to settle, then tap clear terrain.');return true;}
    // Validate and journal the intended site without issuing script build orders.
    // Only the original native Ctrl-click owns the real construction FIFO.
    state.siteChecks++;
    send('track-site',{itemId,x:point.x,y:point.y}).then(r=>{
      if(cancellation!==state.cancelSerial)return;
      if(!r.ok){notify(reason(r.reason));return;}
      state.nativeBuildPlaced=true;state.nativePendingSites.push({x,y});flushNativeSites();requestState();
    }).finally(()=>state.siteChecks--);
    if(!state.nativeToolReady){const generation=state.nativeBuildGeneration,selection=state.nativeToolSelectionAt;
      setTimeout(()=>{if(state.nativeMenu==='build'&&!state.nativeToolReady&&state.nativeBuildGeneration===generation&&state.nativeToolSelectionAt===selection&&state.nativePendingSites.length){state.nativePendingSites=[];notify('The build tool did not activate. No sites were queued; choose an available structure.');window.__kalaWarzoneTouch?.resumeInput?.();}},2600);
    }
    flushNativeSites();return true;
  }

async function drainBuildInput(){
    const started=Date.now();let warned=false;
    while(state.siteChecks||state.nativePendingSites.length||window.__kalaWarzoneTouch?.report().pendingClicks){flushNativeSites();window.__blockNightResearch?.pollOutput?.();if(!warned&&Date.now()-started>5000){warned=true;notify('Waiting for accepted game input. STOP cancels pending taps.');}await pause(40);}
  }

function selectMode(discard=false,keepSidebar=false){
    if(discard)++state.cancelSerial;
    if(state.exitPromise){if(discard){state.nativePendingSites=[];window.__kalaWarzoneTouch?.releaseAll?.(true);}return state.exitPromise;}
    state.exitingBuild=true;++state.menuRevision;
    state.exitPromise=(async()=>{
      if(discard){state.nativePendingSites=[];window.__kalaWarzoneTouch?.releaseAll?.(true);}
      else await drainBuildInput();
      let frozen=false;try{
        if(state.nativeMenu==='build'||state.nativeHudHidden){await freezeBattlefield();frozen=true;}
        state.buildOpen=Boolean(keepSidebar&&state.buildOpen);cancelPlacement();window.__kalaWarzoneTouch?.releaseAll?.(true);await close();await closeNative(true);
        host.WarzoneHost?.restoreBattlefield?.();document.getElementById('canvas')?.focus({preventScroll:true});updateHUD();
      }finally{if(frozen)await releaseBattlefield();}
    })().finally(()=>{state.exitPromise=null;state.exitingBuild=false;});return state.exitPromise;
  }

async function afterBuildExit(action,discard=false){const navigation=++state.navigationSerial;await selectMode(discard);if(navigation===state.navigationSerial)return action();}

async function selectNearbyTrucks(){
    const navigation=++state.navigationSerial;
    // BUILD already selected this local group in the common case. Keep that
    // real selection instead of reopening the native truck cards a second time.
    const s=state.snapshot,visibleHeight=Math.min(innerHeight,host.innerHeight-element('warzone-game-frame').getBoundingClientRect().y),centre=window.WarzoneTerrain?.pick(innerWidth/2,visibleHeight/2);
    if(centre&&s?.trucks.length){const anchor=s.trucks.slice().sort((a,b)=>Math.hypot(a.x-centre.x,a.y-centre.y)-Math.hypot(b.x-centre.x,b.y-centre.y))[0],group=nearbyBuildGroup(s.trucks,[],anchor,true),selected=s.selectedUnits||s.trucks.filter(t=>t.selected);if(selected.length===group.length&&group.every(t=>selected.some(d=>d.id===t.id))){await selectMode();return;}}
    await selectMode();if(navigation!==state.navigationSerial)return;const selected=await openBuild(true);if(selected&&navigation===state.navigationSerial)await selectMode();
  }

function designFitsFactory(d,f){
    if(!f)return false;
    const cyborg=/cyborg/i.test(d.body+' '+d.propulsion),flying=/vtol|v-tol/i.test(d.propulsion)||findPart(d.propulsion)?.propulsionType==='Lift';
    if(cyborg)return /cyborg/i.test(f.kind);
    if(/cyborg/i.test(f.kind)||flying!==/vtol/i.test(f.kind))return false;
    const size=['LIGHT','MEDIUM','HEAVY','SUPER HEAVY'].indexOf(findPart(d.body)?.size);
    return /vtol/i.test(f.kind)||size<0||size<=Number(f.modules||0);
  }

function templateParts(d){return JSON.stringify([d.body,d.propulsion,d.turrets||[...(d.weapons||[]),d.construct,d.sensor,d.repair,d.brain,d.ecm].filter(id=>id&&!/^ZNULL/.test(id))]);}

loadSaved();
window.addEventListener('warzone-command-reply',e=>accept(e.detail));
window.addEventListener('warzone-native-input-finished',()=>{if(!state.pendingItem&&!state.buildingOpening)requestState();});
window.__warzoneCommands={tower:true,nativeUI:true,open,openResearch,exit,close,closeNative,openNative,beginPlacement,cancelPlacement,placeAt:()=>false,previewAt:()=>null,hidePreview:()=>{},send,accept,
 isOpen:()=>Boolean(state.page),isPlacement:()=>false,nativeMenuOpen:()=>Boolean(state.nativeMenu&&state.nativeMenu!=='build'),nativeBuildOpen:()=>state.nativeMenu==='build',nativeBuildMenuOpen:()=>state.nativeMenu==='build'&&!state.nativeToolReady,nativeHudHidden:()=>state.nativeHudHidden,nativeBuildTap,nativeBuildMenuTap,queueNativeSite,selectMode,afterBuildExit,selectNearbyTrucks,openBuild,
 freezeComplete:(id,ok)=>{const callback=captures.get(id);captures.delete(id);callback?.(ok);},saveBlueprint,deleteBlueprint,
 model:()=>({page:state.page,buildOpen:state.buildOpen,notice:state.notice,pendingItem:state.pendingItem,busy:state.buildingOpening||Boolean(state.pendingItem)||state.exitingBuild,nativeMenu:state.nativeMenu,nativeItem:state.nativeItem,nativeToolReady:state.nativeToolReady,nativeHudHidden:state.nativeHudHidden,saved:state.saved,snapshot:state.snapshot,buildings:availableBuildings(),construction:constructionRows(),catalog:state.catalog}),
 report:()=>({...state,pending:state.pending.size,saving:[...state.saving],nativePendingSites:state.nativePendingSites.length,captures:captures.size,holds,terrain:window.WarzoneTerrain?.report()})};
fetch('/warzone/command-catalog.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(c=>{state.catalog=c;publish();}).catch(()=>notify('The command catalogue could not load. Restart the app.'));
setInterval(()=>{
 if(!state.pendingItem&&!state.buildingOpening&&window.__kalaWarzoneTouch?.report().hudVisible&&Date.now()-state.lastPoll>(state.nativeMenu==='build'?250:state.page?1000:1200))requestState();
 if(state.pending.size){window.__blockNightResearch?.pollOutput();if(Date.now()-state.lastWrite>1500)flush(true);for(const p of state.pending.values())if(!p.warned&&Date.now()-p.at>12000){p.warned=true;state.timeouts++;if(p.command.action!=='state')notify(reason('timeout'));}}
},150);

})();
