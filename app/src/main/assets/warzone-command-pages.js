/* Tower command pages: native-validated orders; app-private design library. */
(() => {
  'use strict';
  if (window.__warzoneCommands) return;
  const host = window.parent?.WarzoneHost ? window.parent : window;
  const doc = host.document;
  const campaign = window.__warzoneCampaignMode === true || (typeof location !== 'undefined' && typeof URLSearchParams === 'function' && new URLSearchParams(location.search).get('mode') === 'campaign');
  const polishedTowers = window.__warzoneDuelConfig?.mode !== 'duel';
  const powerSymbol = polishedTowers ? '\u26a1\ufe0e' : '\u26a1';
  const blueprintBridge = window.BlockNightAndroid?.loadDesigns ? window.BlockNightAndroid
    : window.AndroidMultiplayer?.loadDesigns ? window.AndroidMultiplayer : null;
  const blueprintStorageKey = 'wt-designs-v1';
  const blueprintLimit = 200;
  const PATH = (campaign ? '/data/base/script/campaign/mobile/' : '/data/mp/multiplay/script/rules/') + 'warzone-towers-command.json';
  const state = {page:'',catalog:null,snapshot:null,pending:new Map(),serial:0,writes:0,acks:0,
    timeouts:0,lastWrite:0,lastPoll:0,nativeMenu:'',history:[],placement:null,session:'',category:'DEFENCES',search:'',buildChoice:'',buildOpen:false,siteChecks:0,cancelSerial:0,nativeHudHidden:false,pendingItem:'',designStep:'body',designSearch:'',nativeItem:'',
    selected:'',deletePending:'',confirmNew:false,draftOriginal:'',saved:[],draft:{id:'',name:'',body:'',propulsion:'',turrets:['']},validation:null,
    validationSerial:0,saving:new Set(),factory:0,productionCount:1,factoryRecipeKey:'',factoryByFamily:{},factoryQueueOpen:false,factoryMenuOpen:false,menuRevision:0,nativeMenuPending:false,nativeClosePromise:null,
    navigationSerial:0,nativeBuildGeneration:0,nativeToolReady:false,nativeToolSelectionAt:0,nativePendingSites:[],exitPromise:null,deselectPromise:null,exitingBuild:false,nativeBuildGroup:[],buildSelectionView:'',nativeBuildPlaced:false,nativeBuildSawWork:false,nativeBuildIdleAt:0,buildingOpening:false,selectionPromise:null,selectionSerial:0,selectionEventSerial:0,autoSelectionRevision:0,autoSelectionIntent:0,manualSelectionIntent:0,manualSelectionView:'',buildParticipants:[],siteNumbers:new Map(),truckSelectionCache:new Map(),modulePending:new Map(),moduleSerial:0,previewPoint:null,notice:'',size:1,opens:0,closes:0,placements:0,rejects:0,scroll:{}};
  Object.assign(state,{placementGeneration:0,stopGeneration:0,lineSerial:0,linePlacement:null,linePreviewToken:0,lineDrafts:new Map(),lineSubmissions:new Map(),lineValidationCount:0,buildOrder:Promise.resolve(),lastLine:null});
  Object.assign(state,{headerRequest:null,productionRequests:new Map(),productionFeedback:new Map(),productionSerial:0});
  Object.assign(state,{demolition:null,demolitionSerial:0,demolitionOpening:false});
  Object.assign(state,{productionCancellations:new Map()});
  Object.assign(state,{productionRepeatDrafts:new Map(),productionRepeatRequests:new Map(),productionAllDrafts:new Map(),manufacturingEpoch:0});
  Object.assign(state,{constructionResuming:null});
  Object.assign(state,{designContextSerial:0,designRename:null});
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element = id => doc.getElementById(id);
  const module = () => window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
  const reason = code => ({'invalid-site':'This tile is blocked. Choose an open, level site.',
    occupied:'A completed structure already occupies this site.','already-queued':'A build is already queued here.',
    'site-too-close':'Leave one clear tile between base buildings. Choose another site.',
    unavailable:'This structure is not available yet.',unreachable:'No assigned truck can reach that site.',
    'fortress-used':'Your purchased fortress has already been used this match.',
    'fortress-reserved':'Your purchased fortress is already queued.',
    'no-visible-truck':'No construction truck is selected. Tap TRUCKS with your trucks in view.','view-changed':'The view changed while selecting trucks. Tap the site again.','no-truck':'You need a construction truck.','queue-full':'The queue is full.',
    'selection-changed':'Your selected trucks changed. Choose DEMOLISH again.',
    'friendly-structure':'Tap one of your structures or foundations.',
    'hq-protected':'Your Command Centre cannot be demolished.',
    'construction-busy':'Other trucks are assigned to this foundation. Stop them or cancel their queued order first.',
    'cancelled':'Demolition targeting ended.',
    'game-reloaded':'The game was loaded. Choose DEMOLISH again.',
    'demolishing':'This structure is being demolished.',
    'demolition-unavailable':'Demolition is not available in this game.',
    'structure-limit':'The structure limit has been reached.','module-parent':'Place this module on a completed matching building.',
    'module-limit':'This building is fully upgraded.', 'module-pending':'An upgrade is already queued or in progress on this building.', 'builder-lost':campaign||!polishedTowers?'The assigned truck was destroyed. Choose Retry to assign another.':'Waiting for trucks. Select construction trucks, then Resume.',
    'no-selected-trucks':'Select construction trucks, then Resume.',
    'construction-selection-changed':'Your selected trucks changed. Select them again, then Resume.',
    'construction-changed':'This construction order has changed. Check the updated queue.',
    'construction-unreachable':'The selected trucks cannot reach every site. Choose a reachable group.',
    'build-blocked':'The truck could not finish this site. Clear the obstruction, then Retry.',
    'hq-required':'A completed Command Centre is required to design units.',
    'components-unavailable':'Some components are not researched yet.',
    'incomplete-design':'Choose a name, body, propulsion and weapon or system.',
    'incompatible-design':'These components are incompatible. Try another combination.',
    'factory-incompatible':'This factory cannot produce the design. Check factory type and modules.',
    'factory-missing':'Build and complete a factory first.',
    'template-unavailable':'This unit is no longer available. Check its researched components.',
    'unit-capacity':'Waiting for unit capacity',
    'production-changed':polishedTowers?'Manufacturing has changed. Check the updated queue.':'Production has changed. Check the updated queue.',
    'production-unavailable':polishedTowers?'This factory could not be stopped. Check the updated queue.':'This production cannot be cancelled here.',
    'job-missing':polishedTowers?'That waiting manufacturing order has already changed. Check the updated queue.':'That waiting production has already changed. Check the updated queue.',
    timeout:'No reply yet. Your command is kept; Retry uses the same order.',
    'engine-rejected':'Warzone rejected this command. Your other queued orders were kept.'}[code] || String(code||''));

  function readLibrary(data) {
    const value = JSON.parse(data || '{}');
    return Array.isArray(value.designs) ? value.designs.filter(d=>
      d && d.id && d.name && d.body && d.propulsion && Array.isArray(d.turrets) &&
      d.turrets.length > 0 && d.turrets.length <= 3).slice(0,blueprintLimit) : [];
  }
  function loadSaved() {
    try {
      state.saved = readLibrary(blueprintBridge ? blueprintBridge.loadDesigns() : localStorage.getItem(blueprintStorageKey));
    } catch (_) {}
  }
  function persistDesign(id, design) {
    try {
      if (blueprintBridge) {
        const document = design ? blueprintBridge.writeDesign(JSON.stringify(design)) : blueprintBridge.deleteDesign(id);
        if (!document) return false;
        state.saved = readLibrary(document);
      } else {
        const designs = readLibrary(localStorage.getItem(blueprintStorageKey));
        const index = designs.findIndex(item=>item.id===id);
        if (design) {
          if (index < 0 && designs.length >= blueprintLimit) return false;
          designs[index < 0 ? designs.length : index] = design;
        } else if (index >= 0) designs.splice(index,1);
        localStorage.setItem(blueprintStorageKey,JSON.stringify({version:1,designs}));
        state.saved = designs;
      }
      return true;
    } catch (_) { return false; }
  }
  function send(action,data={},options={}){
    if(window.__towersHtml?.isEnded?.())return Promise.resolve({action,ok:false,reason:'battle-ended'});
    if(action==='state'&&!options.fresh){const existing=Array.from(state.pending.values()).find(p=>p.command.action==='state');if(existing?.promise)return existing.promise;}
    const nonce=`cmd-${Date.now()}-${++state.serial}`;
    const entry={command:{...data,action,nonce},at:Date.now(),warned:false};
    const promise=new Promise(resolve=>{entry.resolve=resolve;state.pending.set(nonce,entry);flush();});entry.promise=promise;return promise;
  }
  function flush(force=false){
    const fs=module()?.FS;
    if(!fs?.writeFile||!fs?.rename||!state.pending.size)return;
    if(!force&&Date.now()-state.lastWrite<25){setTimeout(flush,30);return;}
    try {const commands=Array.from(state.pending.values()).slice(0,8).map(p=>p.command);
      const revision=`r-${Date.now()}-${++state.writes}`;fs.writeFile(PATH+'.tmp',JSON.stringify({revision,commands}),{encoding:'utf8'});
      fs.rename(PATH+'.tmp',PATH);state.lastWrite=Date.now();state.lastBatch={revision,nonces:commands.map(c=>c.nonce)};
    }catch(_){/* Engine filesystem is not ready during launcher startup. */}
  }
  function accept(reply){
    if(reply.action==='demolish-reset'){cancelDemolish();return;}
    if(reply.action==='build-ready'){if(state.nativeMenu==='build'&&reply.generation===state.nativeBuildGeneration&&state.nativeToolSelectionAt){state.nativeToolReady=true;flushNativeSites();}return;}
    if(reply.action==='selection'&&state.snapshot){state.selectionEventSerial++;state.snapshot.selectedUnits=reply.result;const ids=new Set(reply.result.map(u=>u.id));state.snapshot.trucks.forEach(t=>t.selected=ids.has(t.id));if(state.demolition&&!sameDemolitionWorkers(state.demolition.workers,reply.result.filter(u=>u.constructor).map(u=>u.id)))cancelDemolish();syncBuildGroup();updateHUD();return;}
    const pending=state.pending.get(reply.nonce);if(!pending)return;
    state.pending.delete(reply.nonce);state.acks++;
    if(state.lastBatch&&state.lastBatch.nonces.every(n=>!state.pending.has(n))){window.__towersHtml?.consume('warzone-towers-command.json',null,state.lastBatch.revision);state.lastBatch=null;}
    if(!['state','demolish-state','preview-build','validate-design'].includes(reply.action)){state.history.push(reply);state.history=state.history.slice(-100);}
    if(reply.action==='state'&&reply.ok){const before=state.snapshot;
      if(polishedTowers)reconcileManufacturingDisplay(before,reply.result);
      if(before&&reply.result.gameTime<before.gameTime){cancelDemolish();state.siteNumbers.clear();state.truckSelectionCache?.clear();state.modulePending?.clear();state.buildSelectionView='';window.WarzoneBuildDisplay?.reset();cancelPlacement();state.nativeToolReady=false;state.nativeItem='';renderSidebar();}
      const changed=before&&(before.buildings.map(b=>b.id).join()!==reply.result.buildings.map(b=>b.id).join()||before.parts.join()!==reply.result.parts.join()||JSON.stringify(before.factories.map(f=>[f.id,f.ready,f.modules,f.templates]))!==JSON.stringify(reply.result.factories.map(f=>[f.id,f.ready,f.modules,f.templates]))||JSON.stringify(before.templates)!==JSON.stringify(reply.result.templates));
      const designChanged=campaign&&(!before||before.hasHQ!==reply.result.hasHQ||before.parts.join()!==reply.result.parts.join()||reply.result.gameTime<before.gameTime);
      state.snapshot=reply.result;if(designChanged)invalidateCampaignDesign(false,Boolean(before&&reply.result.gameTime<before.gameTime));reconcileModuleRequests();window.__blockNightResearch?.acceptQueues?.(reply.result.researchQueues,reply.result.gameTime,Boolean(before&&reply.result.gameTime<before.gameTime));if(before&&before.parts.join()!==reply.result.parts.join())syncDesignParts();else if(designChanged&&state.page==='design')validateDraft();updateHUD();refreshLive();if(changed&&['build','saved','factory'].includes(state.page))render();if(changed&&state.buildOpen)renderSidebar();}
    if(reply.action==='state'&&reply.ok&&polishedTowers)window.WarzoneBuildDisplay?.setFacilityTargets?.(reply.result.facilityTargets||[],reply.result.facilityBlockers||[],state.catalog);
    if(!reply.ok)state.rejects++;
    pending.resolve(reply);flush(true);
  }
  window.addEventListener('warzone-command-reply',event=>accept(event.detail));
  window.addEventListener('warzone-native-input-finished',()=>{if(!state.pendingItem&&!state.buildingOpening)requestState();});
  function notify(message){
    state.notice=message;const target=element('wt-command-notice');if(target)target.textContent=message;
    const inline=element('wt-sidebar-notice');if(inline){inline.textContent=message;inline.hidden=true;}
    const toast=element('wt-command-toast');if(toast){toast.textContent=message;toast.hidden=Boolean(state.page);
      clearTimeout(toast._timer);toast._timer=setTimeout(()=>{toast.hidden=true;},4500);}
  }
  function image(item){
    if(item?.image)return `<img loading="lazy" src="/warzone/${esc(item.image)}" alt="">`;
    if(item?.group==='Construct')return '<img loading="lazy" src="/warzone/research-icons/Engineering.gif" alt="">';
    const drawing=item?.group==='Body'?'<path d="M22 12h20l9 13v22l-9 7H22l-9-7V25z"/><path d="M24 22h16l5 8v13H19V30z"/><circle cx="32" cy="33" r="7"/>':item?.group==='Propulsion'?'<path d="M21 13h22v38H21z"/><rect x="9" y="11" width="10" height="14" rx="3"/><rect x="9" y="39" width="10" height="14" rx="3"/><rect x="45" y="11" width="10" height="14" rx="3"/><rect x="45" y="39" width="10" height="14" rx="3"/><path d="M9 30h10m26 0h10"/>':'<path d="M14 44l18-25 18 25zM23 44v10h18V44M32 19V9"/><circle cx="32" cy="34" r="5"/>';
    return `<span class="wt-stock-fallback" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2">${drawing}</svg></span>`;
  }
  function button(label,attrs='',kind=''){return `<button type="button" ${attrs} class="${kind}">${label}</button>`;}
  function availableBuildings(){const live=new Map((state.snapshot?.buildings||[]).map(b=>[b.id,b]));
    const native=state.snapshot?.nativeBuildOptions;
    return (state.catalog?.buildings||[]).filter(b=>live.has(b.id)&&(!native||native.includes(b.id))).map(b=>({...b,power:live.get(b.id).power}));}
  function availableParts(group){const available=new Set(state.snapshot?.parts||[]);
    return (state.catalog?.components[group]||[]).filter(p=>available.has(p.id));}
  function findPart(id){return Object.values(state.catalog?.components||{}).flat().find(p=>p.id===id);}
  function availableDesign(d){const parts=new Set(state.snapshot?.parts||[]);return Boolean(d.factoryTemplate&&state.snapshot?.templates?.some(t=>templateParts(t)===templateParts(d)))||[d.body,d.propulsion,...d.turrets].every(id=>parts.has(id));}


  const playersState={watch:null,value:null,key:'',serial:0,pending:null,nativeMenu:null,nativeAfterFrame:-1,pointers:new Set(),inputUntil:0,keys:new Set(),keyUntil:0,panel:null,disposed:false,tab:'participants',detailTab:'economy',viewRevision:0,viewScroll:{}};
  const playersNow=()=>typeof performance!=='undefined'?performance.now():Date.now();
  const playersSession=()=>window.__towersHtml?.session||'';
  function playersMessage(message){return `<p class="wt-players-message" role="status">${esc(message)}</p>`;}
  function clearPlayersKeys(){playersState.keys.clear();playersState.keyUntil=0;}
  function resetPlayersView(){playersState.tab='participants';playersState.detailTab='economy';playersState.viewScroll={};playersState.viewRevision++;}
  function clearPlayers(){playersState.watch=null;playersState.value=null;playersState.key='';clearPlayersKeys();resetPlayersView();}
  function playersCanDetails(value){return value?.capabilities?.fullSpectatorStats===true&&['spectator','replay'].includes(value.viewer?.role);}
  function playersTabs(value){return ['participants',...(value?.mode==='multiplayer'?['spectators']:[]),...(playersCanDetails(value)?['details']:[])];}
  function playersViewKey(){return playersState.tab==='details'?'details:'+playersState.detailTab:playersState.tab;}
  function playersViewerKey(viewer){return JSON.stringify([viewer.realPlayer,viewer.viewedPlayer,viewer.role,viewer.ownsViewedPlayer,viewer.canIssueOrders]);}
  function validPlayersPacket(value){
    return value?.schemaVersion===91&&value.ready===true&&typeof value.context==='string'&&value.context.length>0&&value.context.length<=160
      &&Number.isInteger(value.frame)&&value.frame>=0&&Number.isFinite(value.gameTime)&&Number.isFinite(value.realTime)
      &&['campaign','offline-scenario','offline-skirmish','multiplayer','replay'].includes(value.mode)
      &&(value.mode!=='replay'||value.viewer?.role==='replay'&&value.viewer?.canIssueOrders===false&&value.viewer?.ownsViewedPlayer===false)
      &&Number.isInteger(value.viewer?.realPlayer)&&Number.isInteger(value.viewer?.viewedPlayer)
      &&['local','player','spectator','replay','view-only'].includes(value.viewer?.role)&&value.capabilities?.readOnly===true
      &&Array.isArray(value.players)&&Array.isArray(value.spectators)&&value.players.length<=64&&value.spectators.length<=64
      &&value.spectators.every(row=>row?.allocated===true&&row.spectator===true)
      &&[...value.players,...value.spectators].every(row=>Number.isInteger(row?.id)&&typeof row.name==='string'&&row.name.length<=512
        &&(!row.observerDetails||typeof row.observerDetails==='object'&&Array.isArray(row.observerDetails.weaponGrades)&&row.observerDetails.weaponGrades.length<=128
          &&row.observerDetails.weaponGrades.every(weapon=>Number.isInteger(weapon?.id)&&typeof weapon.name==='string'&&weapon.name.length<=128)));
  }
  function playersPacket(){
    const current=module(),session=playersSession(),now=playersNow();let value=null;
    try{const text=current?.FS?.readFile('/tmp/warzone-players-v91.json',{encoding:'utf8'});if(typeof text==='string'&&text.length<=512*1024)value=JSON.parse(text);}catch(_){}
    const mp=window.PcMultiplayerNative?.state;
    if(playersState.disposed||current?.calledRun!==true||!validPlayersPacket(value)
      ||mp&&(mp.phase!=='game'||mp.worldReady!==true||!['multiplayer','replay'].includes(value.mode)
        ||Number.isInteger(mp.realPlayer)&&mp.realPlayer!==value.viewer.realPlayer||Number.isInteger(mp.player)&&mp.player!==value.viewer.viewedPlayer
        ||mp.canIssueOrders===false&&value.viewer.canIssueOrders===true
        ||mp.spectator===true&&!['spectator','view-only','replay'].includes(value.viewer.role))){
      clearPlayers();return null;
    }
    const signature=playersViewerKey(value.viewer),capabilities=JSON.stringify([value.mode,playersCanDetails(value),value.capabilities.teamMode===true]),before=playersState.watch;
    if(!before||before.module!==current||before.session!==session||before.context!==value.context||before.viewer!==signature||before.capabilities!==capabilities
        ||value.frame<before.frame||value.realTime<before.realTime||value.gameTime<before.gameTime){
      clearPlayersKeys();resetPlayersView();
      playersState.watch={module:current,session,context:value.context,viewer:signature,capabilities,realPlayer:value.viewer.realPlayer,viewedPlayer:value.viewer.viewedPlayer,frame:value.frame,realTime:value.realTime,gameTime:value.gameTime,at:now,ready:false};
      playersState.value=null;return null;
    }
    if(value.frame>before.frame&&value.realTime>before.realTime){before.frame=value.frame;before.realTime=value.realTime;before.gameTime=value.gameTime;before.at=now;before.ready=true;}
    if(!before.ready||now-before.at>3500){playersState.value=null;clearPlayersKeys();return null;}
    playersState.value=value;return value;
  }
  function playersNumber(value,suffix=''){
    if(typeof value==='number'&&Number.isFinite(value))return esc(String(Math.round(value*100)/100)+suffix);
    if(typeof value==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(value))return esc(value+suffix);
    return '<span class="wt-players-unavailable" aria-label="Not available">—</span>';
  }
  function playersType(row){
    return ({local:'Local',human:'Human',ai:'AI',scenario:'Scenario','former-human':'Human',spectator:'Spectator','recorded-human':'Human','recorded-ai':'AI'})[row.kind]||'Participant';
  }
  function playersBadges(row){
    return [row.local?'You':'',row.host?'Host':'',row.viewed&&!row.local?'Viewed side':'',
      row.state==='former'&&row.allocated!==true?'Disconnected':'',row.state==='spectating'?'Now spectating':'',row.state==='inactive'?'Inactive':''].filter(Boolean).map(text=>`<span>${esc(text)}</span>`).join('');
  }
  function playersIdentity(row,spectator=false){
    const rgb=row.colorRGB,color=Array.isArray(rgb)&&rgb.length===3&&rgb.every(x=>Number.isInteger(x)&&x>=0&&x<=255)?`rgb(${rgb.join(',')})`:null;
    const marker=spectator?'<img class="wt-players-eye" src="/warzone/ui/icons/eye.svg" alt="" aria-hidden="true">':color?`<i class="wt-players-color" style="background:${color}" aria-label="Army colour"></i>`:'<i class="wt-players-color wt-players-no-color" aria-hidden="true"></i>';
    return `<div class="wt-players-identity">${marker}<div class="wt-players-name"><strong>${esc(row.name||'Unnamed participant')}</strong><div class="wt-players-badges">${playersBadges(row)}</div></div></div>`;
  }
  function playersRow(row,mode){
    const stats=row.stats||{},fields=mode==='offline-scenario'?[['UNITS',stats.units],['STRUCTURES',stats.structures],['POWER',stats.power]]:[['SCORE',stats.score],['KILLS',stats.kills],['UNITS',stats.units],['STRUCTURES',stats.structures],['POWER',stats.power]];
    return `<article class="wt-players-summary" data-player-id="${row.id}">${playersIdentity(row)}<dl style="--wt-players-metrics:${fields.length}">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${playersNumber(value)}</dd></div>`).join('')}</dl></article>`;
  }
  function playersRoster(value){
    const team=value.capabilities.teamMode===true;
    const columns=[...(team?[['TEAM',row=>Number.isInteger(row.team)?row.team+1:null]]:[]),['TYPE',row=>playersType(row),true],['SCORE',row=>row.stats?.score],['KILLS',row=>row.stats?.kills],['UNITS',row=>row.stats?.units],['STRUCTURES',row=>row.stats?.structures],['POWER',row=>row.stats?.power],['PING',row=>row.stats?.pingMs,false,' ms']];
    if(!value.players.length)return playersMessage('No participants are available.');
    return `<div class="wt-players-table-wrap" tabindex="0" aria-label="Participants; scroll horizontally"><table><thead><tr><th scope="col">PLAYER</th>${columns.map(([label])=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${value.players.map(row=>`<tr data-player-id="${row.id}"><th scope="row">${playersIdentity(row)}</th>${columns.map(([,get,text,suffix])=>`<td>${text?esc(get(row)):playersNumber(get(row),suffix||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function playersSpectators(value){
    return value.spectators.length?`<div class="wt-players-watchers">${value.spectators.map(row=>`<article class="wt-players-watcher" data-player-id="${row.id}">${playersIdentity(row,true)}</article>`).join('')}</div>`:playersMessage('No connected spectators.');
  }
  function playersObserverDetails(value){
    if(!playersCanDetails(value))return '';
    const rows=value.players.filter(row=>row.observerDetails&&typeof row.observerDetails==='object');
    const economy=playersState.detailTab!=='upgrades',weapons=new Map();
    for(const row of rows)for(const weapon of row.observerDetails.weaponGrades||[])if(Number.isInteger(weapon.id)&&typeof weapon.name==='string')weapons.set(weapon.id,weapon.name);
    const columns=economy?[['POWER',d=>d.power],['RATE',d=>d.powerRate,'',true],['LOST',d=>d.powerLost],['WON',d=>d.powerWon],['LAB USE',d=>d.labUsePercent,'%'],['KILLS',d=>d.kills],['UNITS',d=>d.units]]:
      [['TANK ARMOR',d=>d.kineticArmor?.tank],['CYBORG ARMOR',d=>d.kineticArmor?.cyborg],['TANK THERMAL',d=>d.thermalArmor?.tank],['CYBORG THERMAL',d=>d.thermalArmor?.cyborg],...Array.from(weapons,([id,name])=>[name,d=>(d.weaponGrades||[]).find(w=>w.id===id)?.grade])];
    const tabs=`<div class="wt-players-detail-tabs" role="tablist" aria-label="Observer details">${[['economy','ECONOMY &amp; ARMY'],['upgrades','UPGRADES']].map(([tab,label])=>button(label,`data-players-detail="${tab}" role="tab" aria-selected="${playersState.detailTab===tab}" aria-controls="wt-players-detail-content"`,playersState.detailTab===tab?'active':'')).join('')}</div>`;
    return `${tabs}<div id="wt-players-detail-content" role="tabpanel">${rows.length?`<div class="wt-players-table-wrap" tabindex="0" aria-label="Observer statistics; scroll horizontally"><table><thead><tr><th scope="col">PLAYER</th>${columns.map(([name])=>`<th scope="col">${esc(name)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${playersIdentity(row)}</th>${columns.map(([,get,suffix,rate])=>{const value=get(row.observerDetails),prefix=rate&&typeof value==='number'&&value>0?'+':'';return `<td>${prefix}${playersNumber(value,suffix||'')}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`:playersMessage('Observer statistics are not available.')}</div>`;
  }
  function renderPlayers(value=playersState.value){
    if(!value)return playersMessage('Waiting for current player information…');
    const tabs=playersTabs(value);if(!tabs.includes(playersState.tab))playersState.tab='participants';
    const tab=playersState.tab,detail=playersState.detailTab,network=['multiplayer','replay'].includes(value.mode);
    const navigation=network?`<nav class="wt-players-tabs" role="tablist" aria-label="Players view">${tabs.map(name=>button(`${name.toUpperCase()}${name==='participants'?` <span>${value.players.length}</span>`:name==='spectators'?` <span>${value.spectators.length}</span>`:''}`,`data-players-tab="${name}" role="tab" aria-selected="${tab===name}" aria-controls="wt-players-tab-content"`,tab===name?'active':'')).join('')}</nav>`:'';
    const body=tab==='spectators'?playersSpectators(value):tab==='details'?playersObserverDetails(value):['campaign','offline-scenario'].includes(value.mode)?value.players.map(row=>playersRow(row,value.mode)).join('')||playersMessage('No participants are available.'):playersRoster(value);
    return `<div class="wt-players-content" data-players-view="${playersViewKey()}" data-players-view-revision="${playersState.viewRevision}">${navigation}<div id="wt-players-tab-content"${network?' role="tabpanel"':''}>${body}</div></div>`;
  }
  function rememberPlayersView(content){
    const view=content?.querySelector('.wt-players-content');
    if(!view||Number(view.dataset.playersViewRevision)!==playersState.viewRevision)return;
    const table=content.querySelector('.wt-players-table-wrap');
    playersState.viewScroll[view.dataset.playersView]={top:content.scrollTop,left:table?.scrollLeft||0};
  }
  function paintPlayers(force=false){
    if(state.page!=='players')return;
    const content=element('wt-page-content');if(!content)return;
    const value=playersPacket(),key=JSON.stringify([value,playersState.tab,playersState.detailTab]);
    if(!force&&value&&((playersState.pointers.size&&playersNow()<playersState.inputUntil+1800)||playersNow()<playersState.inputUntil))return;
    if(!force&&value&&playersNow()<playersState.keyUntil)return;
    if(playersState.key===key)return;playersState.key=key;
    rememberPlayersView(content);
    const table=content.querySelector('.wt-players-table-wrap'),active=doc.activeElement,tableFocused=Boolean(table&&active===table);
    const focused=active?.dataset||{},tabFocus=focused.playersTab,detailFocus=focused.playersDetail;
    content.innerHTML=renderPlayers(value);
    const saved=playersState.viewScroll[playersViewKey()];content.scrollTop=saved?.top||0;
    const next=content.querySelector('.wt-players-table-wrap');if(next){next.scrollLeft=saved?.left||0;if(tableFocused)next.focus({preventScroll:true});}
    if(tabFocus)content.querySelector(`[data-players-tab="${tabFocus}"]`)?.focus({preventScroll:true});
    else if(detailFocus)content.querySelector(`[data-players-detail="${detailFocus}"]`)?.focus({preventScroll:true});
  }
  function changePlayersView(tab,detail){
    if(state.page!=='players')return false;
    const value=playersPacket();if(!value)return false;
    if(tab&&!playersTabs(value).includes(tab)||detail&&(!playersCanDetails(value)||!['economy','upgrades'].includes(detail)))return false;
    rememberPlayersView(element('wt-page-content'));
    if(tab)playersState.tab=tab;if(detail)playersState.detailTab=detail;
    playersState.key='';paintPlayers(true);return true;
  }
  function playersPointer(event){
    if(state.page!=='players')return;
    if(event.type==='pointerdown')playersState.pointers.add(event.pointerId);else playersState.pointers.delete(event.pointerId);
    playersState.inputUntil=playersNow()+200;
  }
  function playersKeyboard(event){
    const key=event.code==='Space'||[' ','Spacebar'].includes(event.key)?'Space':event.key==='Enter'?'Enter':'';
    if(!key)return;
    if(event.type==='keyup'){if(playersState.keys.delete(key))playersState.keyUntil=playersNow()+200;return;}
    const target=event.target?.closest?.('[data-players-native],[data-players-tab],[data-players-detail]');
    if(state.page!=='players'||!target||target.disabled||playersState.keys.has(key))return;
    playersState.keys.add(key);playersState.keyUntil=playersNow()+2000;
  }
  function paintPlayersNative(menu){
    const visible=Boolean(menu?.players||menu?.spectatorStats);playersState.nativeMenu=visible?menu:null;
    if(visible)doc.body.dataset.playersNative='true';else delete doc.body.dataset.playersNative;
    const back=element('wt-players-native-back');if(back){back.hidden=!visible;back.disabled=Boolean(playersState.pending);back.textContent=playersState.pending?'OPENING…':'BACK TO GAME';}
  }
  function cancelPlayersNavigation(){
    ++playersState.serial;const pending=playersState.pending;playersState.pending=null;
    if(pending)try{const fs=pending.module.FS,path='/tmp/warzone-players-nav-v91.json',value=JSON.parse(fs.readFile(path,{encoding:'utf8'}));
      if(value.nonce===pending.request.nonce){fs.writeFile(path+'.tmp',JSON.stringify({...pending.request,nonce:pending.request.nonce+'-cancel',action:'cancel'}));fs.rename(path+'.tmp',path);}}
    catch(_){}
  }
  async function navigatePlayers(action){
    if(!['legacy-players','legacy-spectator-stats','close'].includes(action)||playersState.pending)return false;
    const value=playersPacket(),current=module(),watch=playersState.watch;
    if(!watch?.context||current!==watch.module||action!=='close'&&(!value||value.capabilities[action==='legacy-players'?'legacyPlayers':'legacySpectatorStats']!==true))return false;
    const serial=++playersState.serial,session=playersSession(),context=watch.context;
    const request={nonce:'players-nav-'+Date.now()+'-'+serial,context,action};
    await close();if(playersState.disposed||serial!==playersState.serial||current!==module()||session!==playersSession())return false;
    const pending=playersState.pending={module:current,request};
    paintPlayersNative({players:action==='legacy-players'||playersState.nativeMenu?.players,spectatorStats:action==='legacy-spectator-stats'||playersState.nativeMenu?.spectatorStats});
    try{
      current.FS.writeFile('/tmp/warzone-players-nav-v91.json.tmp',JSON.stringify(request));current.FS.rename('/tmp/warzone-players-nav-v91.json.tmp','/tmp/warzone-players-nav-v91.json');
      const started=playersNow();
      while(playersNow()-started<2500){
        playersPacket();
        if(playersState.disposed||serial!==playersState.serial||current!==module()||session!==playersSession()||playersState.watch?.context!==context){cancelPlayersNavigation();paintPlayersNative(null);return false;}
        let ack;try{ack=JSON.parse(current.FS.readFile('/tmp/warzone-players-nav-result-v91.json',{encoding:'utf8'}));}catch(_){}
        if(ack?.nonce===request.nonce&&ack.context===context&&ack.action===action){
          playersState.pending=null;playersState.nativeAfterFrame=value?.frame??watch.frame;paintPlayersNative(ack.nativeMenu);
          if(ack.ok!==true)notify('Player controls are unavailable in this view.');return ack.ok===true;
        }
        await pause(25);
      }
      cancelPlayersNavigation();paintPlayersNative(null);notify('Player controls did not respond.');return false;
    }catch(_){if(playersState.pending===pending)playersState.pending=null;paintPlayersNative(null);notify('Player controls are unavailable.');return false;}
  }
  function pollPlayers(){
    const watch=playersState.watch,mp=window.PcMultiplayerNative?.state;
    if(watch&&(watch.module!==module()||watch.session!==playersSession()||mp&&(mp.phase!=='game'||mp.worldReady!==true||Number.isInteger(mp.realPlayer)&&mp.realPlayer!==watch.realPlayer||Number.isInteger(mp.player)&&mp.player!==watch.viewedPlayer)))clearPlayers();
    if(state.page==='players')paintPlayers();
    if(playersState.nativeMenu&&!playersState.pending){const value=playersPacket();if(value&&value.frame>playersState.nativeAfterFrame){playersState.nativeAfterFrame=value.frame;paintPlayersNative(value.nativeMenu);}else if(!playersState.watch)paintPlayersNative(null);}
  }

  function install(){
    if(element('wt-command-pages'))return;
    const displayScript=document.createElement('script');displayScript.src='/warzone/ui/build-display.js';document.head.appendChild(displayScript);
    const link=doc.createElement('link');link.rel='stylesheet';link.href='/warzone/ui/command-pages.css';doc.head.appendChild(link);
    for(const name of ['lab-shell','lab-commands']){const theme=doc.createElement('link');theme.rel='stylesheet';theme.href=`/warzone/ui/${name}.css`;doc.head.appendChild(theme);}
    const researchTheme=document.createElement('link');researchTheme.rel='stylesheet';researchTheme.href='/warzone/ui/lab-research.css';document.head.appendChild(researchTheme);
    const labScript=doc.createElement('script');labScript.src='/warzone/ui/lab-ui.js';doc.head.appendChild(labScript);
    if(polishedTowers){
      doc.documentElement.classList.add('wt-towers-polished');document.documentElement.classList.add('wt-towers-polished');
      const towersTheme=doc.createElement('link');towersTheme.rel='stylesheet';towersTheme.href='/warzone/ui/towers-commands.css';doc.head.appendChild(towersTheme);
    }
    const panel=doc.createElement('section');panel.id='wt-command-pages';panel.hidden=true;
    panel.setAttribute('aria-label','Warzone command centre');
    panel.innerHTML=`<header class="wt-command-title"><div><span class="wt-eyebrow">WARZONE TOWERS / COMMAND CENTRE</span><h1 id="wt-page-title">BUILD</h1><span id="wt-command-resources"></span></div>
      <nav id="wt-command-tabs" aria-label="${polishedTowers?'Manufacturing pages':'Command pages'}">${(polishedTowers?['factory','design','saved']:['build','design','saved','factory','queue']).map(p=>button(polishedTowers?({factory:'←',design:'Design',saved:'Blueprints'})[p]:p==='saved'?'BLUEPRINTS':p.toUpperCase(),`data-page="${p}"${polishedTowers&&p==='factory'?' aria-label="Back to manufacturing" title="Back to manufacturing"':''}`)).join('')}</nav>${button('CLOSE','data-action="back" id="wt-players-close"','wt-players-close')}${polishedTowers?'':button('BATTLE ↗','data-action="back"','wt-primary')}</header>
      <div id="wt-command-notice" role="status" aria-live="polite"></div><div id="wt-page-content"></div>`;
    doc.body.appendChild(panel);const busy=doc.createElement('canvas');busy.id='wt-build-busy';busy.hidden=true;busy.setAttribute('aria-hidden','true');doc.body.appendChild(busy);
    const playersBack=doc.createElement('button');playersBack.id='wt-players-native-back';playersBack.type='button';playersBack.textContent='BACK TO GAME';playersBack.hidden=true;playersBack.addEventListener('click',()=>navigatePlayers('close'));doc.body.appendChild(playersBack);
    playersState.panel=panel;for(const type of ['pointerdown','pointerup','pointercancel'])panel.addEventListener(type,playersPointer,{capture:true,passive:true});
    for(const type of ['keydown','keyup'])panel.addEventListener(type,playersKeyboard,{capture:true,passive:true});
    panel.addEventListener('click',onClick);panel.addEventListener('input',onInput);panel.addEventListener('change',onChange);
    if(polishedTowers)panel.addEventListener('pointerdown',event=>{if(state.factoryMenuOpen&&!event.target.closest('#wt-factory-menu,#wt-factory-menu-toggle'))closeFactoryMenu();});
    panel.addEventListener('submit',event=>event.preventDefault());
    if(polishedTowers){
      const rename=doc.createElement('div');rename.id='wt-design-rename';rename.hidden=true;
      rename.innerHTML=`<form id="wt-design-rename-form" role="dialog" aria-modal="true" aria-labelledby="wt-design-rename-label"><label id="wt-design-rename-label" for="wt-design-rename-input">Unit name</label><div class="wt-design-rename-row"><input id="wt-design-rename-input" type="text" maxlength="48" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done"><button type="submit" class="wt-primary">Save</button><button type="button" data-action="cancel-design-rename">Cancel</button></div><p id="wt-design-rename-error" role="status" hidden></p></form>`;
      doc.body.appendChild(rename);
      rename.addEventListener('click',event=>{event.stopPropagation();if(event.target.closest('[data-action="cancel-design-rename"]'))finishDesignRename(false);});
      rename.addEventListener('submit',event=>{event.preventDefault();if(!state.designRename?.composing)finishDesignRename(true);});
      rename.addEventListener('compositionstart',()=>{if(state.designRename)state.designRename.composing=true;});
      rename.addEventListener('compositionend',()=>{if(state.designRename)state.designRename.composing=false;});
      rename.addEventListener('input',()=>{element('wt-design-rename-input').removeAttribute('aria-invalid');element('wt-design-rename-error').hidden=true;});
      rename.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finishDesignRename(false);}
        else if(event.key==='Enter'&&event.target.id==='wt-design-rename-input'&&!event.isComposing&&event.keyCode!==229&&!state.designRename?.composing){event.preventDefault();finishDesignRename(true);}
        else if(event.key==='Tab'){
          const controls=Array.from(rename.querySelectorAll('input,button')).filter(node=>!node.disabled);
          const index=controls.indexOf(doc.activeElement),next=(index+(event.shiftKey?-1:1)+controls.length)%controls.length;
          event.preventDefault();controls[next]?.focus({preventScroll:true});
        }
      });
      host.addEventListener('pagehide',()=>finishDesignRename(false,false));
    }
    const hud=doc.createElement('div');hud.id='wt-build-status';hud.hidden=true;
    hud.innerHTML=`<span id="wt-power">POWER —</span>${button('SELECTION','data-action="select-mode" id="wt-field-status"')}<span id="wt-placement-label"></span><span id="wt-builder-summary"></span>${button('CHANGE','data-page="build"')}${button('DONE','data-action="cancel-placement"')}`;
    hud.addEventListener('click',onClick);doc.body.appendChild(hud);
    const sidebar=doc.createElement('section');sidebar.id='wt-build-sidebar';sidebar.hidden=true;sidebar.setAttribute('aria-label','Construction');
    sidebar.innerHTML=`<header><span id="wt-sidebar-power"></span><span id="wt-sidebar-builders"></span><span class="wt-sidebar-spinner" aria-hidden="true"></span></header><nav aria-label="Structure category">${[['DEFENCES','DEFENCE'],['STRUCTURES','BASE'],['MODULES','MODULES'],['ALL','ALL']].map(([id,label])=>button(label,`data-category="${id}"`)).join('')}</nav><div id="wt-module-guidance" role="status" aria-live="polite" hidden></div><div id="wt-sidebar-notice" role="status" hidden></div><div id="wt-catalogue-wrap"><div id="wt-sidebar-catalogue" tabindex="0" aria-label="Available structures; scroll for more"></div><span id="wt-catalogue-track" aria-hidden="true"><i></i></span></div><section id="wt-sidebar-queue" aria-label="${polishedTowers?'Current construction':'Live construction queue'}"${polishedTowers?' hidden':''}></section>${polishedTowers?'':button('EXIT · KEEP ORDERS','data-action="select-mode"','wt-sidebar-exit')}`;
    sidebar.addEventListener('click',onClick);doc.body.appendChild(sidebar);
    element('wt-sidebar-catalogue').addEventListener('scroll',updateCatalogueScroll,{passive:true});
    if(host.ResizeObserver)new host.ResizeObserver(()=>{fitCatalogueRows();updateCatalogueScroll();}).observe(element('wt-catalogue-wrap'));
    doc.fonts?.ready.then(()=>{fitCatalogueRows();updateCatalogueScroll();});
    const nativeMask=doc.createElement('div');nativeMask.id='wt-native-build-mask';nativeMask.hidden=true;nativeMask.setAttribute('aria-hidden','true');doc.body.appendChild(nativeMask);
    const toast=doc.createElement('div');toast.id='wt-command-toast';toast.hidden=true;toast.setAttribute('role','status');doc.body.appendChild(toast);
    const ghost=document.createElementNS('http://www.w3.org/2000/svg','svg');ghost.id='wt-build-ghost';ghost.style.pointerEvents='none';
    const ghostStyle=document.createElement('style');ghostStyle.textContent='#wt-build-ghost{position:fixed;inset:0;z-index:2147483600;pointer-events:none}#wt-build-ghost[hidden]{display:none!important}';document.head.appendChild(ghostStyle);
    ghost.innerHTML='<polygon fill="#a7cf5b44" stroke="#b5e56d" stroke-width="2"/><text fill="#fff" stroke="#000" stroke-width=".4" font-size="13"/>';
    ghost.setAttribute('hidden','');document.body.appendChild(ghost);
    const back=doc.createElement('button');back.id='wt-native-back';back.hidden=true;back.textContent='BACK TO BATTLE';back.addEventListener('click',()=>closeNative());doc.body.appendChild(back);
    doc.addEventListener('keydown',e=>{if(e.key==='Escape'){if(state.designRename){e.preventDefault();finishDesignRename(false);}else if(state.page)close();else if(state.placement)cancelPlacement();else if(state.nativeMenu)closeNative();}});
    document.addEventListener('keydown',e=>{if(state.nativeHudHidden&&e.isTrusted&&(e.key==='Escape'||e.key==='Tab')){e.preventDefault();e.stopImmediatePropagation();selectMode();}},true);
    applySize(state.size);
    const strip=element('warzone-command-strip');
    if(strip&&host.ResizeObserver){let scheduled=false;const observed=new WeakSet();const resize=()=>{
      scheduled=false;
      const hud=element('blocknight-combat-hud'),wave=element('warzone-towers-wave-hud');
      const measured=Math.ceil(Math.max(hud?hud.offsetTop+hud.offsetHeight:0,wave?wave.offsetTop+wave.offsetHeight:0)+7);
      const height=Math.max(46,Math.ceil(measured/2)*2);
      if(height>20&&doc.documentElement.style.getPropertyValue('--wt-command-top')!==`${height}px`)doc.documentElement.style.setProperty('--wt-command-top',`${height}px`);
    };
      const schedule=()=>{if(!scheduled){scheduled=true;host.requestAnimationFrame(resize);}};
      const observer=new host.ResizeObserver(schedule),watch=()=>{for(const id of ['blocknight-combat-hud','warzone-towers-wave-hud']){const e=element(id);if(e&&!observed.has(e)){observed.add(e);observer.observe(e);}}schedule();};
      new host.MutationObserver(watch).observe(strip,{childList:true});watch();host.addEventListener('resize',schedule);doc.fonts?.ready.then(schedule);doc.fonts?.addEventListener('loadingdone',schedule);}
  }
  function openFactory(id){
    loadSaved();
    const factory=state.snapshot?.factories.find(f=>f.id===Number(id)&&f.ready);
    if(!polishedTowers||!factory)return false;
    state.factory=factory.id;open('factory');return true;
  }
  function headerPage(page){return ['factory','design','saved'].includes(page)?'factory':page;}
  function updateHeaderMenus(){
    for(const [page,visible] of [['build',state.buildOpen],['factory',headerPage(state.page)==='factory'],['queue',state.page==='queue'],['players',state.page==='players']]){
      const control=element('wt-open-'+page);if(control)control.setAttribute('aria-expanded',String(Boolean(visible)));
      window.__kalaWarzoneTouch?.setHeaderMenuState?.(page,Boolean(visible));
    }
  }
  function toggle(page='build'){
    if(!polishedTowers)return open(page);
    const target=headerPage(page),pending=state.headerRequest;
    const samePending=pending?.page===target&&pending.navigation===state.navigationSerial;
    const visible=target==='build'?state.buildOpen||state.sidebarOpening||Boolean(state.placement)||state.nativeMenu==='build':headerPage(state.page)===target;
    if(visible||samePending){
      state.headerRequest=null;++state.navigationSerial;
      return target==='build'?selectMode():close();
    }
    const result=open(page);state.headerRequest={page:target,navigation:state.navigationSerial};return result;
  }
  function toggleBuild(){return toggle('build');}
  function open(page='build'){
    if(page==='saved'||page==='design'||page==='factory')loadSaved();
    finishDesignRename(false,false);
    if(campaign&&window.__warzoneCampaign?.nativeUiActive?.()){window.__warzoneCampaign.revealNativeUi();return false;}
    cancelDemolish();
    if(page==='players'&&(playersState.nativeMenu||playersState.pending)){notify('Close player controls first.');return false;}
    if(page==='players'&&(state.placement||state.buildOpen||state.selectionPromise)){
      const navigation=++state.navigationSerial;return selectMode().then(()=>{if(navigation===state.navigationSerial)return open('players');});
    }
    if(polishedTowers)host.TowersStatus?.close?.();
    if(page==='build'){openSidebar();return;}
    if(page!=='players'){cancelPlayersNavigation();if(playersState.nativeMenu){notify('Close player controls first.');return false;}}
    const previousContent=element('wt-page-content');rememberPanelScroll(previousContent);if(previousContent)delete previousContent.dataset.labScrollKey;
    state.buildOpen=false;if(element('wt-build-sidebar'))element('wt-build-sidebar').hidden=true;
    host.WarzoneHost?.resetScroll?.();install();const navigation=++state.navigationSerial;if(state.nativeMenu==='build'||window.__kalaWarzoneTouch?.report().pendingClicks){selectMode().then(()=>{if(navigation===state.navigationSerial)open(page);});return;}window.__blockNightResearch?.close?.();
    const help=element('warzone-towers-help-overlay');
    if(help&&!help.hidden)window.__kalaWarzoneTouch?.closeHelp?.();
    if(state.nativeMenu||state.nativeMenuPending)closeNative();
    if(page==='stats'||page==='commanders'){openNative(page);return;}
    if(state.page)state.scroll[state.page]=element('wt-page-content')?.scrollTop||0;
    if(polishedTowers&&page==='saved'&&state.page==='design'&&state.saved.some(d=>d.id===state.draft.id))state.libraryReveal={id:state.draft.id};
    if(state.page!==page){state.notice='';state.deletePending='';if(polishedTowers)state.factoryMenuOpen=false;}
    state.page=page;if(polishedTowers&&page==='factory')state.revealFactory=true;state.opens++;element('wt-command-pages').hidden=false;
    doc.body.dataset.commandPage=page;updateHeaderMenus();const toast=element('wt-command-toast');if(toast){clearTimeout(toast._timer);toast.hidden=true;}
    window.__warzoneCommands?.hidePreview?.();
    const frame=element('warzone-game-frame');if(frame)frame.inert=true;
    window.__kalaWarzoneTouch?.releaseAll?.(true);playersState.key='';render();element('wt-page-content').scrollTop=state.confirmNew&&page==='design'?0:state.scroll[page]||0;if(page!=='players')requestState();
    if(page==='design'&&(campaign||!state.validation))validateDraft();
    if(page==='factory'&&state.selected){const content=element('wt-page-content'),card=content.querySelector('[data-selected-design="true"]');if(card){const scroller=card.closest('.wt-work-list')||content,r=card.getBoundingClientRect(),v=scroller.getBoundingClientRect();if(r.top<v.top)scroller.scrollTop+=r.top-v.top;else if(r.bottom>v.bottom)scroller.scrollTop+=r.bottom-v.bottom;}}
  }
  function close(){
    finishDesignRename(false,false);
    if(!state.page)return Promise.resolve();
    const previousContent=element('wt-page-content');rememberPanelScroll(previousContent);if(previousContent)delete previousContent.dataset.labScrollKey;
    state.scroll[state.page]=element('wt-page-content')?.scrollTop||0;
    playersState.pointers.clear();playersState.inputUntil=0;clearPlayersKeys();
    state.page='';state.headerRequest=null;if(state.factoryMenuOpen)state.factoryMenuOpen=false;state.closes++;element('wt-command-pages').hidden=true;updateHeaderMenus();
    delete doc.body.dataset.commandPage;state.deletePending='';
    const frame=element('warzone-game-frame');if(frame)frame.inert=true;
    if(element('wt-command-pages')?.contains(doc.activeElement))doc.activeElement.blur();
    window.__kalaWarzoneTouch?.releaseAll?.(true);
    // HTML pages do not open a stock native widget. A paused game cannot
    // acknowledge script commands, so restoring touch input must never depend
    // on an unnecessary native-menu reply. A genuinely open native panel still
    // receives its ordered close command, independently of this HTML return.
    if(state.nativeMenu||state.nativeMenuPending)closeNative(true);
    if(frame)frame.inert=false;host.WarzoneHost?.restoreBattlefield?.();document.getElementById('canvas')?.focus({preventScroll:true});
    return Promise.resolve();
  }
  async function openSidebar(){
    finishDesignRename(false,false);
    if(campaign&&window.__warzoneCampaign?.nativeUiActive?.()){window.__warzoneCampaign.revealNativeUi();return false;}
    cancelDemolish();
    if(polishedTowers)host.TowersStatus?.close?.();
    if(window.__towersHtml?.isEnded?.())return;
    install();if(state.buildingOpening||state.sidebarOpening)return;
    state.sidebarOpening=true;const navigation=++state.navigationSerial;
    try{
      window.__blockNightResearch?.close?.();
      const help=element('warzone-towers-help-overlay');if(help&&!help.hidden)window.__kalaWarzoneTouch?.closeHelp?.();
      if(state.page)await close();
      if(navigation!==state.navigationSerial)return;
      // The catalogue stays immediate, while selection waits for the original
      // STATS/COMMANDERS panel to acknowledge its ordered native close.
      if(state.nativeMenu||state.nativeMenuPending)closeNative(true);
      state.buildOpen=true;window.dispatchEvent(new Event('warzone-build-sidebar-open'));element('wt-build-sidebar').hidden=false;renderSidebar();updateHeaderMenus();
      // Opening the catalogue must not disable its first item tap while an
      // unseen truck picker runs. The chosen item owns that native setup.
      selectVisibleTrucks().catch(error=>notify(error.message));
      if(navigation===state.navigationSerial){renderSidebar();updateHUD();}
    }catch(error){await closeNative(true);notify(error.message);}finally{state.sidebarOpening=false;}
  }
  function siteStatus(site){return polishedTowers&&site.status==='blocked'?'PAUSED':({building:'BUILDING',demolishing:'DEMOLISHING',queued:'QUEUED',travelling:'TRUCKS EN ROUTE','waiting-trucks':'WAITING FOR TRUCKS','waiting-power':'WAITING FOR POWER',done:'COMPLETE',interrupted:'ORDERS ENDED'})[site.status]||'PLANNED';}
  function remainingTime(seconds){return seconds==null?'':`~${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} LEFT`;}
  function constructionRows(){
    const s=state.snapshot;if(!s)return [];
    const sites=(s.constructionSites||[]).filter(j=>j.status!=='interrupted'&&(campaign||!polishedTowers||j.status!=='cancelled')).map(j=>({...j,name:state.catalog?.buildings.find(b=>b.id===j.itemId)?.name||'Structure'}));
    for(const job of s.jobs||[]){
      if(sites.some(j=>j.id===job.id))continue;
      const live=(s.construction||[]).find(b=>b.itemId===job.itemId&&b.x===job.x&&b.y===job.y);
      sites.push({...job,...live,id:job.id,structureId:live?.id,name:state.catalog?.buildings.find(b=>b.id===job.itemId)?.name||'Structure',status:live?.status||(job.status==='working'?'travelling':job.status)});
    }
    for(const b of s.construction||[])if(!sites.some(j=>j.structureId===b.id))sites.push({...b});
    for(const done of s.finishedBuilds||[])if(!sites.some(j=>j.id===done.id))sites.push({...done,status:'done',name:state.catalog?.buildings.find(b=>b.id===done.itemId)?.name||'Structure'});
    if(polishedTowers)for(const site of sites){
      const job=(s.jobs||[]).find(j=>j.id===site.id);
      if(job?.status==='blocked'&&site.status!=='done'){
        site.status='blocked';site.reason=job.reason;site.remaining=null;
      }
      if(!campaign&&job?.status==='blocked'&&job.reason==='builder-lost'&&!['building','waiting-power','demolishing','done'].includes(site.status)){
        site.status='waiting-trucks';site.reason='builder-lost';site.remaining=null;
      }
      if(site.status==='waiting-trucks'&&site.reason==='builder-lost'&&!site.structureId)site.pausedPlan=true;
    }
    const chronological=j=>String(j.id).match(/^cmd-(\d+)-/)?.[1]||'z'+j.id;
    for(const j of sites.slice().sort((a,b)=>chronological(a).localeCompare(chronological(b),undefined,{numeric:true})))if(!state.siteNumbers.has(j.id))state.siteNumbers.set(j.id,state.siteNumbers.size+1);
    for(const j of sites)j.number=state.siteNumbers.get(j.id);
    const rank={building:0,'waiting-power':1,'waiting-trucks':2,blocked:2,travelling:3,queued:4,done:5};
    return sites.sort((a,b)=>(rank[a.status]??4)-(rank[b.status]??4));
  }
  function constructionRow(j){return `<article class="wt-site-row" data-site-id="${esc(j.id)}" data-site-number="${j.number}" data-site-status="${esc(j.status)}"><span class="wt-site-number">#${j.number}</span><div><strong>${esc(j.name)}</strong><small>AT ${j.x},${j.y} · ${siteStatus(j)}${j.status!=='done'&&j.remaining!=null?' · '+remainingTime(j.remaining):''}</small>${j.progress!=null&&j.status!=='done'?`<progress max="1" value="${j.progress}" aria-label="Approximate construction progress"></progress>`:''}</div></article>`;}
  function currentConstruction(rows){
    // This is a live-work summary, not another view of completed site history.
    // A stable site number breaks equal-priority ties without changing orders.
    const rank={building:0,upgrading:0,'waiting-power':1,'waiting-trucks':2,blocked:2,travelling:3,working:3,queued:4};
    return rows.filter(j=>Object.prototype.hasOwnProperty.call(rank,j.status))
      .sort((a,b)=>rank[a.status]-rank[b.status]||a.number-b.number)[0]||null;
  }
  function currentConstructionRow(j){
    const blockedReason=j.status==='blocked'?({'site-too-close':'BUILDINGS TOO CLOSE','invalid-site':'SITE OBSTRUCTED','build-blocked':'CLEAR THE OBSTRUCTION','engine-rejected':'ORDER REJECTED','builder-lost':'WAITING FOR TRUCKS','construction-changed':'SITE CHANGED'}[j.reason]||'CHECK THE SITE'):'';
    const working=blockedReason|| (j.status==='upgrading'?'UPGRADING':j.status==='working'?'TRUCKS EN ROUTE':siteStatus(j));
    const remaining=j.remaining!=null&&Number.isFinite(Number(j.remaining))?` · ${remainingTime(j.remaining)}`:'';
    const progress=Number(j.progress),hasProgress=j.progress!=null&&Number.isFinite(progress);
    return `<article class="wt-site-row wt-current-site" data-site-id="${esc(j.id)}" data-site-number="${j.number}" data-site-status="${esc(j.status)}"><strong title="${esc(j.name)}"><span class="wt-site-number">#${j.number}</span> ${esc(j.name)}</strong><small>${working}${remaining}${constructionResumeControl(j,true)}</small>${hasProgress?`<progress max="1" value="${Math.min(1,Math.max(0,progress))}" aria-label="${esc(j.name)} construction progress"></progress>`:''}</article>`;
  }
  function constructionResumeControl(site,compact=false){
    if(!polishedTowers)return '';
    const jobs=state.snapshot?.jobs||[],job=jobs.find(j=>j.id===site.id),busy=Boolean(state.constructionResuming);
    if(job?.status==='blocked'){
      const lost=!campaign&&job.reason==='builder-lost',group=lost&&job.recoveryGroup?jobs.filter(j=>j.status==='blocked'&&j.reason==='builder-lost'&&j.recoveryGroup===job.recoveryGroup):[job];
      if(!compact&&lost&&group[0]?.id!==job.id)return '';
      const attrs=lost?`data-resume-jobs="${esc(JSON.stringify(group.map(j=>j.id)))}" data-recovery-group="${esc(job.recoveryGroup||'legacy:'+job.id)}"`:`data-retry-job="${esc(job.id)}"`;
      return button(busy?'ASSIGNING…':lost?`RESUME${group.length>1?' '+group.length:''}`:'RETRY',`${attrs} ${busy?'disabled aria-busy="true"':''} aria-label="Assign selected construction trucks to ${group.length} paused site${group.length===1?'':'s'}"`,'wt-subtle');
    }
    const id=site.structureId||(typeof site.id==='number'?site.id:0);
    if(!campaign&&!job&&site.status==='waiting-trucks'&&Number.isInteger(id)&&id>0)
      return button(busy?'ASSIGNING…':'RESUME',`data-resume-structure="${id}" ${busy?'disabled aria-busy="true"':''} aria-label="Resume this unfinished structure with selected trucks"`,'wt-subtle');
    return '';
  }
  async function resumeConstruction(control){
    if(!polishedTowers||state.constructionResuming||window.__towersHtml?.isEnded?.())return;
    const data=control.dataset,token={},stop=state.stopGeneration,battle=window.__towersHtml?.session||'';
    const active=()=>state.constructionResuming===token&&stop===state.stopGeneration&&battle===(window.__towersHtml?.session||'')&&!window.__towersHtml?.isEnded?.();
    let request,action;
    try{
      if(data.resumeJobs){request={jobIds:JSON.parse(data.resumeJobs),recoveryGroup:data.recoveryGroup};action='resume-builds';}
      else if(data.resumeStructure){request={structureId:Number(data.resumeStructure)};action='resume-structure';}
      else {request={jobId:data.retryJob};action='retry-job';}
    }catch(_){return;}
    state.constructionResuming=token;refreshLive();
    try{
      const fresh=await send('state',{}, {fresh:true});
      if(!active())return;
      if(!fresh.ok)throw Error(reason(fresh.reason));
      // This action never opens a truck picker or falls back to another group.
      // Capture a fresh native selection and let the server verify it again.
      const workerIds=(fresh.result.selectedUnits||[]).filter(u=>u.constructor).map(u=>u.id).sort((a,b)=>a-b);
      if(!workerIds.length)throw Error(reason('no-selected-trucks'));
      const reply=await send(action,{...request,workerIds,issuedGameTime:fresh.result.gameTime,recoveryContext:fresh.result.recoveryContext});
      if(!active())return;
      if(!reply.ok)throw Error(reason(reply.reason));
      notify(`${reply.result.jobIds.length} site${reply.result.jobIds.length===1?'':'s'} assigned to selected trucks.`);
    }catch(error){if(active())notify(error.message||'Construction could not be resumed. Check the updated queue.');}
    finally{if(state.constructionResuming===token){const refresh=active();state.constructionResuming=null;if(refresh){requestState();refreshLive();}}}
  }
  function renderSidebar(){
    const sidebar=element('wt-build-sidebar');if(!sidebar||!state.buildOpen)return;
    const items=availableBuildings().filter(b=>state.category==='ALL'||b.category===state.category),grid=element('wt-sidebar-catalogue');
    const active=state.placement?.id||(state.nativeToolReady&&state.nativeMenu==='build'?state.nativeItem:''),busy=Boolean(state.buildingOpening||state.pendingItem);
    sidebar.setAttribute('aria-busy',String(busy));
    // Keep cards/images/focus/scroll alive while the native picker changes.
    // Only a different catalogue needs new nodes, not busy/selection replies.
    const signature=JSON.stringify([state.category,items.map(b=>[b.id,b.name,b.image])]);
    if(grid.dataset.signature!==signature){const scroll=grid.dataset.category===state.category?grid.scrollTop:state.scroll['sidebar-'+state.category]||0;grid.innerHTML=items.map(b=>button(`${b.image?image(b):`<span class="wt-native-art-label">${b.width} × ${b.breadth}<small>FOOTPRINT</small></span>`}<strong>${esc(b.name)}</strong><small>${powerSymbol} ${Math.round(b.power)}</small>`,`data-build="${esc(b.id)}" aria-pressed="${active===b.id}" ${busy?'disabled':''}`,`${active===b.id?'active ':''}${state.pendingItem===b.id?'loading':''}`)).join('')||'<p class="wt-empty">No available structures. Unlock more in TECH.</p>';grid.dataset.signature=signature;grid.dataset.category=state.category;grid.scrollTop=scroll;}
    for(const b of grid.querySelectorAll('[data-build]')){const chosen=b.dataset.build===active;b.classList.toggle('active',chosen);b.classList.toggle('loading',b.dataset.build===state.pendingItem);b.setAttribute('aria-pressed',String(chosen));b.disabled=busy;const item=items.find(i=>i.id===b.dataset.build),cost=b.querySelector(':scope > small');if(cost&&item)cost.textContent=`${powerSymbol} ${Math.round(item.power)}`;}
    for(const b of sidebar.querySelectorAll('[data-category]')){b.classList.toggle('active',b.dataset.category===state.category);b.setAttribute('aria-pressed',String(b.dataset.category===state.category));}
    updateSidebarQueue();fitCatalogueRows();updateCatalogueScroll();
  }
  function fitCatalogueRows(){
    const wrap=element('wt-catalogue-wrap'),grid=element('wt-sidebar-catalogue');if(!wrap?.clientHeight||!grid?.children.length)return;
    const css=host.getComputedStyle(grid),gap=parseFloat(css.rowGap)||5,padding=parseFloat(css.paddingTop)+parseFloat(css.paddingBottom);
    const title=Math.max(23,...Array.from(grid.querySelectorAll('strong')).map(e=>e.scrollHeight));
    const available=wrap.getBoundingClientRect().height;
    if(polishedTowers){
      const height=wrap.clientHeight,towerGap=Math.max(0,parseFloat(css.rowGap)||0),minimum=Math.max(66*state.size,title+12),count=Math.max(1,Math.floor((height-padding+towerGap)/(minimum+towerGap)));
      const row=grid.children.length<=count?minimum:Math.floor((height-padding-towerGap*(count-1))/count*100)/100;
      grid.style.setProperty('--wt-catalogue-row',Math.max(minimum,row)+'px');grid.style.setProperty('--wt-build-art',Math.min(56*state.size,Math.max(42,row-10))+'px');return;
    }
    const count=Math.max(1,Math.floor((available-padding+gap)/(title+50+gap)));
    const row=Math.floor((available-padding-gap*(count-1))/count*100)/100;
    grid.style.setProperty('--wt-catalogue-row',row+'px');grid.style.setProperty('--wt-build-art',Math.min(47,Math.max(24,row-title-12))+'px');
  }
  function updateCatalogueScroll(){const grid=element('wt-sidebar-catalogue'),track=element('wt-catalogue-track');if(!grid||!track)return;const range=grid.scrollHeight-grid.clientHeight;track.hidden=range<2;if(range>0){const thumb=track.firstElementChild,height=Math.max(22,grid.clientHeight/grid.scrollHeight*grid.clientHeight);thumb.style.height=`${height}px`;thumb.style.transform=`translateY(${grid.scrollTop/range*(grid.clientHeight-height)}px)`;}}
  function updateSidebarQueue(){
    const rows=constructionRows();window.WarzoneBuildDisplay?.update(rows,state.catalog);
    const active=state.buildOpen&&state.placement?.category==='MODULES'?state.placement:null;
    window.WarzoneBuildDisplay?.setModuleTargets?.(active?moduleTargets():[],state.catalog,active);
    if(!state.buildOpen)return;
    updateModuleGuidance();
    const s=state.snapshot;const selected=(s?.trucks||[]).filter(t=>state.placement?state.nativeBuildGroup.includes(t.id):t.selected);
    element('wt-sidebar-power').textContent=s?`${powerSymbol} ${Math.floor(s.power)}`:'';
    element('wt-sidebar-builders').textContent=`${selected.length} TRUCK${selected.length===1?'':'S'}`;
    if(polishedTowers){
      const current=currentConstruction(rows),queue=element('wt-sidebar-queue');
      const hidden=!current,changed=queue.hidden!==hidden,html=current?currentConstructionRow(current):'';
      queue.hidden=hidden;
      if(queue._html!==html){queue.innerHTML=html;queue._html=html;}
      if(changed){fitCatalogueRows();updateCatalogueScroll();}
      return;
    }
    const live=rows.filter(j=>j.status!=='done'),done=rows.length-live.length;
    const empty=state.category==='MODULES'||active?'Choose a module, then tap a highlighted building.':'Choose a structure, then tap clear terrain.';
    const html=`<h2>CONSTRUCTION <span>${live.length} PENDING${done?' · '+done+' DONE':''}</span></h2><div class="wt-site-list">${rows.slice(0,2).map(constructionRow).join('')||`<p>${empty}</p>`}</div>${rows.length>2?button(`VIEW ALL ${rows.length} SITES →`,'data-page="queue"','wt-all-sites'):''}`;
    const queue=element('wt-sidebar-queue');if(queue._html!==html){queue.innerHTML=html;queue._html=html;}
  }
  function reconcileModuleRequests(){
    const snapshot=state.snapshot;if(!snapshot?.moduleTargets)return;
    for(const [key,pending] of state.modulePending||[]){
      const target=snapshot.moduleTargets.find(t=>t.id===pending.parentId);
      if(!target||pending.jobId&&((snapshot.jobs||[]).some(j=>j.id===pending.jobId)||Number(target.modules)>=pending.targetModules||snapshot.gameTime>pending.gameTime+1500))state.modulePending.delete(key);
    }
  }
  function moduleTargets(){
    return (state.snapshot?.moduleTargets||[]).map(target=>{
      const pending=Array.from(state.modulePending?.values()||[]).filter(p=>p.parentId===target.id&&p.itemId===target.moduleId);
      if(!pending.length)return target;
      const occupied=Math.max(Number(target.modules||0)+Number(target.reserved||0),...pending.map(p=>p.targetModules));
      const status=target.status==='upgrading'?'upgrading':'queued';
      return {...target,reserved:Math.max(0,occupied-Number(target.modules||0)),status,
        eligible:occupied<target.maximum&&target.status!=='unfinished'&&target.status!=='unavailable',
        statusReason:occupied>=target.maximum?'module-pending':target.statusReason};
    });
  }
  function updateModuleGuidance(){
    const hint=element('wt-module-guidance');if(!hint?.setAttribute)return;
    if(canLinePlace()){updateLineGuidance();return;}
    const item=state.placement?.category==='MODULES'?state.placement:null;
    hint.hidden=state.category!=='MODULES'&&!item;if(hint.hidden)return;
    if(!item){const html='<strong>Upgrade existing buildings</strong><small>Choose a module, then tap a matching building.</small>';if(hint._html!==html){hint.innerHTML=html;hint._html=html;}return;}
    const targets=moduleTargets().filter(t=>t.moduleId===item.id),ready=targets.filter(t=>t.eligible).length,
      busy=targets.filter(t=>t.status==='queued'||t.status==='upgrading').length,full=targets.filter(t=>t.status==='full').length;
    const what=item.id==='A0ResearchModule1'?'research lab':item.id==='A0PowMod1'?'power generator':'factory';
    const detail=state.snapshot?.moduleTargets?`${ready} ready · ${busy} upgrading · ${full} full`:'Checking buildings…';
    const title=!state.snapshot?.moduleTargets?'Checking matching buildings…':ready?`Tap a highlighted ${what}`:busy?'Upgrades already queued or underway':targets.some(t=>t.status==='unfinished')?`Finish building the ${what} first`:targets.length?'Matching buildings are fully upgraded':`Build a matching ${what} first`;
    const html=`<strong>${title}</strong><small>${detail}</small>`;if(hint._html!==html){hint.innerHTML=html;hint._html=html;}
  }
  function openNative(menu){
    cancelPlacement();close();window.__kalaWarzoneTouch?.releaseAll?.(true);window.__blockNightResearch?.close?.();
    const revision=++state.menuRevision;state.nativeMenu=menu;state.nativeMenuPending=true;element('wt-native-back').hidden=false;
    send('native-menu',{menu}).then(r=>{if(revision!==state.menuRevision)return;
      state.nativeMenuPending=false;
      if(!r.ok){state.nativeMenu='';element('wt-native-back').hidden=true;notify(reason(r.reason));return;}
      document.getElementById('canvas')?.focus({preventScroll:true});});
  }
  function closeNative(discard=false){
    // Generic HTML cleanup does not own original campaign panels. Only the
    // campaign's explicit Back action may dismiss a briefing, Intel or guide.
    if(campaign&&window.__warzoneCampaign?.nativeUiActive?.()){revealNativePause();return Promise.resolve({ok:true});}
    if(!discard&&(state.nativeMenu==='build'||window.__kalaWarzoneTouch?.report().pendingClicks))return selectMode();
    state.nativeToolReady=false;state.nativeItem='';state.nativePendingSites=[];
    if(!state.nativeMenu&&!state.nativeMenuPending)return state.nativeClosePromise||setNativeHudHidden(false);
    window.__kalaWarzoneTouch?.releaseAll?.(true);
    const revision=++state.menuRevision;state.nativeMenuPending=false;
    state.nativeMenu='';element('wt-native-back').hidden=true;
    const closing=send('native-menu',{menu:'close'}).then(async r=>{await setNativeHudHidden(false);if(!r.ok&&revision===state.menuRevision&&!window.__towersHtml?.isEnded?.())notify(reason(r.reason));renderSidebar();return r;});
    state.nativeClosePromise=closing;
    const finished=()=>{if(state.nativeClosePromise===closing){state.nativeClosePromise=null;window.__kalaWarzoneTouch?.resumeInput?.();}};closing.then(finished,finished);
    return closing;
  }
  function requestState(){if(state.page==='players')return;if(!Array.from(state.pending.values()).some(p=>p.command.action==='state'))send('state');state.lastPoll=Date.now();}
  // The Lab columns scroll independently. Keep their positions across live
  // state renders, component tabs and facility/page returns.
  const panelScrollers='.wt-workspace > .wt-rail,.wt-workspace > .wt-work-list,.wt-workspace > .wt-detail,.wt-factory-design-list,.wt-factory-roster,.wt-factory-queue-list'+(polishedTowers?',.wt-compact-library,.wt-design-picker .wt-parts-grid':'');
  function rememberPanelScroll(content){
    const key=content?.dataset.labScrollKey;if(!key)return;
    state.scroll['panels:'+key]=Array.from(content.querySelectorAll(panelScrollers),e=>e.scrollTop);
    if(polishedTowers)for(const strip of content.querySelectorAll('[data-factory-strip]')){state.scroll['factory-strip:'+strip.dataset.factoryStrip]=strip.scrollLeft;if(strip.classList.contains('wt-factory-roster'))state.scroll['factory-roster:'+strip.dataset.factoryStrip]=strip.scrollTop;}
  }
  function revealPanelItem(item,scroller){
    if(!item||!scroller)return;
    const view=scroller.getBoundingClientRect(),rect=item.getBoundingClientRect();
    if(rect.bottom>view.bottom)scroller.scrollTop+=rect.bottom-view.bottom;
    if(rect.top<view.top)scroller.scrollTop-=view.top-rect.top;
  }
  function revealLibraryRow(id,focus=''){
    const scroller=element('wt-page-content')?.querySelector('.wt-compact-library');
    const row=Array.from(scroller?.querySelectorAll('[data-library-id]')||[]).find(row=>row.dataset.libraryId===id);
    revealPanelItem(row,scroller);if(focus)row?.querySelector(focus)?.focus({preventScroll:true});
  }
  function render(){
    if(!state.page)return;
    element('wt-command-pages').dataset.page=state.page;
    element('wt-page-title').textContent=polishedTowers&&['factory','design','saved'].includes(state.page)?'MANUFACTURING':polishedTowers&&state.page==='more'?'CONTROLS':({build:'BUILD',design:'DESIGN',saved:'BLUEPRINTS',factory:'FACTORY',queue:'ORDERS',players:'PLAYERS'})[state.page]||'BUILD';
    if(polishedTowers)element('wt-command-tabs').hidden=!['design','saved'].includes(state.page);
    if(polishedTowers){const menu=element('wt-factory-menu-toggle');if(menu){menu.hidden=state.page!=='factory';menu.setAttribute('aria-expanded',String(state.page==='factory'&&state.factoryMenuOpen));}}
    for(const tab of element('wt-command-tabs').querySelectorAll('button')){tab.classList.toggle('active',tab.dataset.page===state.page);tab.setAttribute('aria-current',tab.dataset.page===state.page?'page':'false');}
    const content=element('wt-page-content');
    if(state.page==='players'){paintPlayers();return;}
    if(!state.snapshot||!state.catalog){content.innerHTML=`<p class="wt-empty">${state.catalogError?'The command catalogue could not load. Reopen the game.':'Connecting to the battlefield…'}</p>`;return;}
    const pages={build:renderBuild,design:renderDesign,saved:renderSaved,factory:renderFactory,queue:renderQueue,more:renderMore};
    const scroll=content.scrollTop;rememberPanelScroll(content);content.innerHTML=(pages[state.page]||renderBuild)();content.scrollTop=scroll;
    const scrollKey=state.page+(state.page==='factory'?':'+state.factory:state.page==='design'?':'+state.designStep:'');
    content.dataset.labScrollKey=scrollKey;
    if(polishedTowers&&state.page==='design'&&state.designResetScroll){for(const key of Object.keys(state.scroll))if(key.startsWith('panels:design:'))delete state.scroll[key];state.designResetScroll=false;}
    const offsets=state.scroll['panels:'+scrollKey]||[];
    Array.from(content.querySelectorAll(panelScrollers)).forEach((e,i)=>{e.scrollTop=offsets[i]||0;});
    if(polishedTowers&&state.page==='factory'){
      for(const strip of content.querySelectorAll('[data-factory-strip]')){strip.scrollLeft=state.scroll['factory-strip:'+strip.dataset.factoryStrip]||0;if(strip.classList.contains('wt-factory-roster'))strip.scrollTop=state.scroll['factory-roster:'+strip.dataset.factoryStrip]||0;}
      if(state.revealFactory){const selected=content.querySelector('[data-factory="'+state.factory+'"]'),strip=selected?.closest('[data-factory-strip]');if(strip){const item=selected.getBoundingClientRect(),view=strip.getBoundingClientRect();if(item.left<view.left)strip.scrollLeft-=view.left-item.left;else if(item.right>view.right)strip.scrollLeft+=item.right-view.right;if(item.top<view.top)strip.scrollTop-=view.top-item.top;else if(item.bottom>view.bottom)strip.scrollTop+=item.bottom-view.bottom;}state.revealFactory=false;}
    }
    if(polishedTowers&&state.page==='saved'&&state.libraryReveal){const reveal=state.libraryReveal;state.libraryReveal=null;revealLibraryRow(reveal.id,reveal.focus);}
    if(polishedTowers&&state.page==='design'&&state.designRevealPart){state.designRevealPart=false;const picker=content.querySelector('.wt-design-picker .wt-parts-grid');revealPanelItem(picker?.querySelector('.wt-part.active'),picker);}
    element('wt-command-notice').textContent=state.notice;
  }
  function renderBuild(){
    const items=availableBuildings().filter(b=>(state.category==='ALL'||b.category===state.category)&&b.name.toLowerCase().includes(state.search.toLowerCase()));
    if(!items.some(b=>b.id===state.buildChoice))state.buildChoice=items[0]?.id||'';
    const chosen=items.find(b=>b.id===state.buildChoice);
    return `<div class="wt-workspace"><aside class="wt-rail"><h2>CONSTRUCTION</h2>${['DEFENCES','STRUCTURES','MODULES','ALL'].map(c=>button(c,`data-category="${c}"`,state.category===c?'active':'')).join('')}<div class="wt-rail-note"><b>${state.snapshot.trucks.length} CONSTRUCTORS</b><p>Nearby trucks work together.<br>Every placed site queues.</p></div>${button('VIEW QUEUE','data-page="queue"')}</aside><section class="wt-work-list"><div class="wt-list-heading"><h2>AVAILABLE STRUCTURES <small>${items.length}</small></h2><input id="wt-build-search" type="search" placeholder="Find structure" aria-label="Find a structure" value="${esc(state.search)}"></div><div class="wt-card-grid" id="wt-build-grid">${buildCards(items)}</div></section><aside class="wt-detail">${chosen?`${image(chosen)}<span class="wt-eyebrow">${esc(chosen.category)}</span><h2>${esc(chosen.name)}</h2><dl><div><dt>POWER</dt><dd>${Math.round(chosen.power)}</dd></div><div><dt>FOOTPRINT</dt><dd>${chosen.width} × ${chosen.breadth}</dd></div><div><dt>ORDERS</dt><dd>QUEUED</dd></div></dl><p>Place on clear terrain. Green Warzone blueprints show the queued sites.</p>${button('PLACE STRUCTURE →',`data-build="${esc(chosen.id)}"`,'wt-primary wt-detail-action')}`:'<p>No structures in this category. Research more in TECH.</p>'}</aside></div>`;
  }
  function buildCards(items){return items.map(b=>`<article class="wt-command-card wt-build-card ${b.id===state.buildChoice?'selected':''}"><button class="wt-card-select" data-build-choice="${esc(b.id)}" aria-pressed="${b.id===state.buildChoice}">${image(b)}<div><h2>${esc(b.name)}</h2><p>${b.width} × ${b.breadth} <span>${powerSymbol} ${Math.round(b.power)}</span></p></div><span class="wt-chevron">›</span></button></article>`).join('')||'<p class="wt-empty">No matching structures. Choose another category or search.</p>';}

  function selectOptions(group,selected,placeholder){return `<option value="">${placeholder}</option>`+availableParts(group).map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');}
  function turretOptions(selected){return '<option value="">Choose weapon or system</option>'+['Weapon','Construct','Repair','Sensor','ECM','Brain'].map(g=>{
    const parts=availableParts(g);return parts.length?`<optgroup label="${g}">${parts.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('')}</optgroup>`:'';}).join('');}
  function componentButton(p,slot){return button(`${image(p)}<strong>${esc(p.name)}</strong><small>${p.group==='Body'?`${p.hitpoints} HP · ${p.slots} SLOT${p.slots===1?'':'S'}`:p.group==='Propulsion'?esc(p.propulsionType||'MOBILITY'):`${p.power} POWER`}</small>`,`data-part="${esc(p.id)}" data-slot="${slot}"`,(slot==='body'?state.draft.body:slot==='propulsion'?state.draft.propulsion:state.draft.turrets[Number(slot)])===p.id?'wt-part active':'wt-part');}
  function unitParts(d){const equipment=d.turrets||(d.weapons?.length?d.weapons:[d.construct,d.sensor,d.repair,d.brain,d.ecm].filter(id=>findPart(id)));return `<div class="wt-unit-parts">${[d.body,d.propulsion,...equipment].filter(Boolean).map(id=>`<span title="${esc(findPart(id)?.name||id)}">${image(findPart(id))}</span>`).join('')}</div>`;}
  function renderDesign(){
    const d=state.draft,b=findPart(d.body),slots=Math.min(3,b?.slots||1),slot=state.designStep;
    const editing=state.saved.some(s=>s.id===d.id),busy=state.saving.has(d.id);
    const steps=[['body','01','BODY',d.body],['propulsion','02','PROPULSION',d.propulsion],...Array.from({length:slots},(_,i)=>[String(i),String(i+3).padStart(2,'0'),i?'EXTRA WEAPON':'WEAPON / SYSTEM',d.turrets[i]])];
    if(!steps.some(a=>a[0]===slot))state.designStep='0';
    const active=state.designStep,flying=/vtol|v-tol/i.test(d.propulsion)||findPart(d.propulsion)?.propulsionType==='Lift';
    const parts=active==='body'?availableParts('Body'):active==='propulsion'?availableParts('Propulsion'):['Weapon','Construct','Repair','Sensor','ECM','Brain'].flatMap(availableParts).filter(p=>!d.propulsion||(flying?p.group==='Weapon'&&/vtol/i.test(p.id):p.group!=='Weapon'||!/vtol/i.test(p.id)));
    if(polishedTowers)return renderCompactDesign(d,steps,parts,active,slots,editing,busy);
    return `${state.confirmNew?`<div class="wt-draft-confirm"><span>Discard unsaved changes and start a new design?</span>${button('DISCARD CHANGES','data-action="discard-draft"')}${button('KEEP EDITING','data-action="keep-draft"','wt-primary')}</div>`:''}<div class="wt-workspace wt-design-workspace"><aside class="wt-rail"><h2>ASSEMBLE UNIT</h2>${steps.map(([key,n,label,id])=>button(`<span class="wt-step-number">${n}</span><span>${label}<small>${esc(findPart(id)?.name||'Choose component')}</small></span>`,`data-step="${key}"`,active===key?'wt-step active':'wt-step')).join('')}<div class="wt-rail-note">${state.snapshot.hasHQ?'Choose components, then save your blueprint.':'Complete a Command Centre to save designs.'}</div>${button('NEW DESIGN','data-action="new-design"')}</aside><section class="wt-work-list"><div class="wt-list-heading"><h2>${esc(steps.find(a=>a[0]===active)?.[2]||'COMPONENTS')} <small>${parts.length} AVAILABLE</small></h2></div><div class="wt-parts-grid">${Number(active)>0?button('EMPTY SLOT',`data-part="" data-slot="${active}"`,'wt-part'):''}${parts.map(p=>componentButton(p,active)).join('')||'<p class="wt-empty">Research components in TECH to unlock more choices.</p>'}</div></section><aside class="wt-detail wt-design-summary"><span class="wt-eyebrow">${editing?'EDIT BLUEPRINT':'NEW BLUEPRINT'}</span><form id="wt-design-form"><label for="wt-design-name">UNIT NAME</label><input id="wt-design-name" maxlength="48" value="${esc(d.name)}" placeholder="Name your unit"><select id="wt-design-body" hidden tabindex="-1">${selectOptions('Body',d.body,'Choose body')}</select><select id="wt-design-propulsion" hidden tabindex="-1">${selectOptions('Propulsion',d.propulsion,'Choose propulsion')}</select>${Array.from({length:slots},(_,i)=>`<select hidden tabindex="-1" data-turret="${i}">${turretOptions(d.turrets[i]||'')}</select>`).join('')}</form>${unitParts(d)}<h2 id="wt-blueprint-name">${esc(d.name||'New design')}</h2><div class="wt-configuration">${steps.map(([key,n,label,id])=>`<div><span>${label}</span><b>${esc(findPart(id)?.name||'—')}</b></div>`).join('')}</div><p id="wt-design-valid" role="status" aria-live="polite">${state.validation?.ok?`POWER ${state.validation.result.cost} · BUILD POINTS ${state.validation.result.points}`:esc(state.validation?reason(state.validation.reason):'Select every required component.')}</p>${button(busy?'SAVING…':editing?'SAVE CHANGES':'SAVE BLUEPRINT','data-action="save-design" id="wt-save-design"'+(!state.validation?.ok||busy?' disabled':''),'wt-primary wt-detail-action')}${editing?button('SAVE AS NEW','data-action="save-as-new" id="wt-save-as-new"'+(!state.validation?.ok||busy?' disabled':'')):''}${button('BLUEPRINT LIBRARY','data-page="saved"')}</aside></div>`;
  }

  function renderCompactDesign(d,steps,parts,active,slots,editing,busy){
    const status=state.validation?.ok?`POWER ${state.validation.result.cost} · BUILD POINTS ${state.validation.result.points}`:!state.snapshot.hasHQ?'Complete a Command Centre to save designs.':state.validation?reason(state.validation.reason):'Choose a body, propulsion and weapon.';
    return `${state.confirmNew?`<div class="wt-draft-confirm"><span>Discard unsaved changes and start a new design?</span>${button('DISCARD CHANGES','data-action="discard-draft"')}${button('KEEP EDITING','data-action="keep-draft"','wt-primary')}</div>`:''}<div class="wt-compact-design"><nav class="wt-design-slots" aria-label="Design components">${steps.map(([key,n,label,id])=>button(`${image(findPart(id)||{group:key==='body'?'Body':key==='propulsion'?'Propulsion':'Weapon'})}<span><small>${label}</small><strong>${esc(findPart(id)?.name||'Choose component')}</strong></span><span class="wt-slot-chevron" aria-hidden="true">⌄</span>`,`data-step="${key}" aria-pressed="${active===key}"`,active===key?'wt-step active':'wt-step')).join('')}</nav><section class="wt-design-picker"><h2>Choose ${active==='body'?'body':active==='propulsion'?'propulsion':Number(active)>0?'extra weapon':'weapon / system'}</h2><div class="wt-parts-grid">${Number(active)>0?button('EMPTY SLOT',`data-part="" data-slot="${active}"`,'wt-part'):''}${parts.map(p=>button(`${image(p)}<strong>${esc(p.name)}</strong><small>${esc(p.group==='Body'?p.size||'BODY':p.group==='Propulsion'?p.propulsionType||'PROPULSION':p.group)}</small>`,`data-part="${esc(p.id)}" data-slot="${active}"`,(active==='body'?d.body:active==='propulsion'?d.propulsion:d.turrets[Number(active)])===p.id?'wt-part active':'wt-part')).join('')||'<p class="wt-empty">Research components in TECH to unlock more choices.</p>'}</div></section><div class="wt-design-summary wt-compact-save"><p id="wt-design-valid" role="status" aria-live="polite">${esc(status)}</p><form id="wt-design-form"><label for="wt-design-name-button">Unit name</label><button type="button" id="wt-design-name-button" data-action="rename-design" aria-haspopup="dialog"${busy?' disabled':''}>${esc(d.name||'Name your unit')}</button><input id="wt-design-name" type="hidden" value="${esc(d.name)}"><select id="wt-design-body" hidden tabindex="-1">${selectOptions('Body',d.body,'Choose body')}</select><select id="wt-design-propulsion" hidden tabindex="-1">${selectOptions('Propulsion',d.propulsion,'Choose propulsion')}</select>${Array.from({length:slots},(_,i)=>`<select hidden tabindex="-1" data-turret="${i}">${turretOptions(d.turrets[i]||'')}</select>`).join('')}</form><span id="wt-blueprint-name" hidden>${esc(d.name||'New design')}</span>${button(busy?'SAVING…':editing?'SAVE CHANGES':'SAVE BLUEPRINT','data-action="save-design" id="wt-save-design"'+(!state.validation?.ok||busy?' disabled':''),'wt-primary')}${editing?button('SAVE AS NEW','data-action="save-as-new" id="wt-save-as-new"'+(!state.validation?.ok||busy?' disabled':''),'wt-subtle'):''}${button('New design','data-action="new-design"','wt-subtle')}</div></div>`;
  }
  function renderCompactSaved(){
    return `<div class="wt-compact-library"><p class="wt-library-note">Saved on this phone. Research components again in each battle.</p><div class="wt-card-grid">${state.saved.map(d=>`<article class="wt-command-card wt-library-row" data-library-id="${esc(d.id)}">${recipeArtwork(d)}<div class="wt-library-copy"><h2>${esc(d.name)}</h2><p>${esc(recipeDescription(d))}</p><small>${availableDesign(d)?`${powerSymbol} ${d.cost}`:'Research required this game'}</small></div><div class="wt-card-actions">${state.deletePending===d.id?`<span>Delete this design?</span>${button('DELETE',`data-confirm-delete="${esc(d.id)}"`)}${button('CANCEL',`data-cancel-delete="${esc(d.id)}"`,'wt-subtle')}`:`${!d.factoryTemplate||[d.body,d.propulsion,...d.turrets].every(id=>findPart(id))?button('EDIT',`data-edit="${esc(d.id)}"`,'wt-subtle'):''}${button('USE',`data-produce-design="${esc(d.id)}"`+(availableDesign(d)?'':' disabled'),'wt-primary')}${button('DELETE',`data-delete="${esc(d.id)}"`,'wt-subtle')}`}</div></article>`).join('')||'<p class="wt-empty">No saved blueprints yet. Open Design to create one.</p>'}</div></div>`;
  }
  function renderSaved(){if(polishedTowers)return renderCompactSaved();return `<div class="wt-page-intro"><p>Your designs and factory templates stay saved on this phone between games and app restarts. Components must be researched in the current battle to produce them.</p>${button('NEW DESIGN','data-action="new-design"','wt-primary')}</div>
    <div class="wt-card-grid">${state.saved.map(d=>`<article class="wt-command-card">${unitParts(d)}<div><h2>${esc(d.name)}</h2><p>${esc(findPart(d.body)?.name||d.body)} · ${esc(findPart(d.propulsion)?.name||d.propulsion)}</p><p>${availableDesign(d)?`${powerSymbol} ${d.cost} · Available`:'Research required this game'}</p></div><div class="wt-card-actions">${!d.factoryTemplate||[d.body,d.propulsion,...d.turrets].every(id=>findPart(id))?button('EDIT',`data-edit="${esc(d.id)}"`):'<span>FACTORY TEMPLATE · SAVED ON PHONE</span>'}${button(d.factoryTemplate?'USE TEMPLATE':'CHOOSE FACTORY',`data-produce-design="${esc(d.id)}"`+(availableDesign(d)?'':' disabled'),'wt-primary')}${state.deletePending===d.id?'<p>Delete this saved design?</p>'+button('DELETE PERMANENTLY',`data-confirm-delete="${esc(d.id)}"`)+button('CANCEL',`data-cancel-delete="${esc(d.id)}"`):button('DELETE',`data-delete="${esc(d.id)}"`,'wt-subtle')}</div></article>`).join('')||'<p class="wt-empty">No saved designs yet. Open DESIGN to create your first blueprint.</p>'}</div>`;}
  function templateEquipment(d){return d.turrets?.length?d.turrets.slice():d.weapons?.length?d.weapons.slice():[d.construct,d.repair,d.brain,d.ecm,d.sensor].filter(id=>id&&!/null/i.test(id)).slice(0,1);}
  function templateParts(d){return JSON.stringify([d.body,d.propulsion,templateEquipment(d)]);}
  function saveTemplate(id){
    const template=state.snapshot?.templates.find(t=>t.id===id);if(!template)return;
    if(state.saved.some(d=>templateParts(d)===templateParts(template))){notify('This template is already saved on your phone.');return;}
    if(state.saved.length>=blueprintLimit){notify('The blueprint library is full. Delete a design first.');return;}
    const turrets=templateEquipment(template);if(!template.body||!template.propulsion||!turrets.length||turrets.length>3){notify('This template cannot be saved.');return;}
    const name=String(template.fullname||template.name||'Unit template').replace(/(?: · F\d+)+$/,'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,48);
    const design={id:`design-${Date.now()}-${++state.serial}`,name,body:template.body,propulsion:template.propulsion,turrets,cost:Number(template.cost)||0,points:Number(template.points)||0,droidType:template.droidType,factoryTemplate:true};
    if(!persistDesign(design.id,design)){notify('Could not save this template on your phone.');return;}
    notify('Template saved on your phone. Available in BLUEPRINTS between games.');render();
  }
  function renderFactory(){
    const factories=state.snapshot.factories.filter(f=>f.ready);if(!factories.some(f=>f.id===state.factory))state.factory=factories[0]?.id||0;
    const factory=factories.find(f=>f.id===state.factory),designs=state.saved.filter(availableDesign),chosen=designs.find(d=>d.id===state.selected);
    if(polishedTowers)return renderTowersFactory(factories,factory,designs,chosen);
    return `<div class="wt-workspace"><aside class="wt-rail"><h2>PRODUCTION FACILITIES</h2>${factories.map(f=>button(`${esc(f.kind)} ${f.number}<small>${f.modules} MODULE${f.modules===1?'':'S'} · ${f.active?'PRODUCING':f.idle?'IDLE':'ACTIVE'}</small>`,`data-factory="${f.id}"`,f.id===state.factory?'active':'')).join('')}<input hidden id="wt-factory-select" value="${state.factory}"><div class="wt-rail-note">Units use normal power and production time.</div>${button('BUILD A FACTORY','data-page="build"')}</aside><section class="wt-work-list"><div class="wt-list-heading"><h2>UNIT DESIGNS</h2><div class="wt-quantity"><span>QUANTITY</span>${[1,5,10,20].map(n=>button(String(n),`data-count="${n}"`,n===state.productionCount?'active':'')).join('')}<input type="hidden" id="wt-produce-count" value="${state.productionCount}"></div></div>${factory?`${chosen?`<h2 class="wt-section-title">SELECTED DESIGN — ${esc(chosen.name)}</h2><div class="wt-card-grid">${productionCard(chosen,false)}</div>`:''}<h2 class="wt-section-title">EXISTING UNIT DESIGNS</h2><div class="wt-card-grid">${state.snapshot.templates.filter(d=>(!factory.templates||factory.templates.includes(d.id))&&(!String(d.id).startsWith('native:')||!designs.some(s=>templateParts(s)===templateParts(d)))).map(d=>productionCard(d,true)).join('')||'<p class="wt-empty">No compatible designs for this factory.</p>'}</div><h2 class="wt-section-title">SAVED DESIGNS</h2><div class="wt-card-grid">${designs.filter(d=>d!==chosen).map(d=>productionCard(d,false)).join('')||'<p class="wt-empty">Create a blueprint in DESIGN.</p>'}</div>`:'<p class="wt-empty">No completed factory. Open BUILD to construct one.</p>'}</section><aside class="wt-detail"><span class="wt-eyebrow">${factory?`${esc(factory.kind)} ${factory.number}`:'PRODUCTION'}</span><h2>FACTORY QUEUE</h2><div id="wt-factory-progress">${factory?factoryProgress(factory):'<p>No factory available.</p>'}</div>${button('ALL ACTIVITY','data-page="queue"')}${factory?button('MORE CONTROLS','data-action="native-factory"','wt-subtle'):''}</aside></div>`;
  }

  function factoryFamily(f){return /cyborg/i.test(f.kind)?'cyborg':/vtol/i.test(f.kind)?'vtol':'vehicle';}
  function factoryDisplayNumber(f){const group=state.snapshot.factories.filter(v=>v.ready&&factoryFamily(v)===factoryFamily(f)).sort((a,b)=>a.id-b.id),index=group.findIndex(v=>v.id===f.id);return index<0?f.number:index+1;}
  function factoryStatus(f){const activity=f.active||f.currentProduction?'PRODUCING':f.idle?'IDLE':'ACTIVE';return factoryFamily(f)==='cyborg'?activity:`${activity} · ${f.modules} MODULE${f.modules===1?'':'S'}`;}
  function factoryName(f){const family=factoryFamily(f);return `${family==='cyborg'?'CYBORG FACTORY':family==='vtol'?'VTOL FACTORY':'FACTORY'} ${factoryDisplayNumber(f)}`;}
  function selectFactoryFamily(family){
    const group=state.snapshot.factories.filter(f=>f.ready&&factoryFamily(f)===family).sort((a,b)=>a.id-b.id);if(!group.length)return;
    state.factoryByFamily ||= {};const current=state.snapshot.factories.find(f=>f.id===state.factory);
    if(current)state.factoryByFamily[factoryFamily(current)]=current.id;
    state.factory=group.find(f=>f.id===state.factoryByFamily[family])?.id||group[0].id;state.revealFactory=true;state.factoryMenuOpen=false;render();
  }
  function factoryRecipeFamily(d){return /cyborg/i.test(d.body+' '+d.propulsion)?'cyborg':/vtol|v-tol/i.test(d.propulsion)||findPart(d.propulsion)?.propulsionType==='Lift'?'vtol':'vehicle';}
  function factoryRecipes(factory){
    if(!factory)return [];
    const records=new Map(),family=factoryFamily(factory);
    for(const native of state.snapshot.templates||[]){if(factory.templates&&!factory.templates.includes(native.id))continue;const key=templateParts(native);if(!records.has(key))records.set(key,{key,native,saved:[]});}
    for(const saved of state.saved){if(factoryRecipeFamily(saved)!==family)continue;const key=templateParts(saved);if(!records.has(key))records.set(key,{key,native:null,saved:[]});records.get(key).saved.push(saved);}
    return Array.from(records.values()).map(record=>{
      const saved=record.saved.find(d=>d.id===state.selected)||record.saved[0],native=record.native;
      const display=saved||native,researched=Boolean(native)||(saved&&availableDesign(saved));
      // An available engine recipe remains usable even if a phone alias cannot
      // be validated by the custom component catalogue in this battle.
      const useNative=Boolean(native&&(!saved||!availableDesign(saved)));
      return {...record,display,cost:native?.cost??saved?.cost,researched,compatible:Boolean(native)||(researched&&designFitsFactory(display,factory)),
        name:String(display.fullname||display.name).replace(/(?:\s*·\s*F\d+)+$/,''),produceNative:useNative,produceId:useNative?native.id:saved.id};
    });
  }
  function renderFactoryRail(factories,factory){
    const family=factory?factoryFamily(factory):'vehicle',groups=['vehicle','cyborg','vtol'].filter(key=>factories.some(f=>factoryFamily(f)===key));
    if(factory){state.factoryByFamily ||= {};state.factoryByFamily[family]=factory.id;}
    return `<div class="wt-factory-toolbar"><div class="wt-factory-family-bar"><nav class="wt-factory-family-tabs" aria-label="Factory family">${groups.map(key=>button(key==='cyborg'?'Cyborgs':key==='vtol'?'VTOL':'Vehicles',`data-factory-family="${key}" aria-pressed="${key===family}"`,key===family?'active':'')).join('')}</nav><div class="wt-factory-picker"><div class="wt-factory-roster" data-factory-strip="${family}" tabindex="0" aria-label="${family==='cyborg'?'Cyborg factories':family==='vtol'?'VTOL factories':'Vehicle factories'}; swipe for more">${factories.filter(f=>factoryFamily(f)===family).sort((a,b)=>a.id-b.id).map(f=>button(`<img src="/warzone/build-icons/${family==='cyborg'?'A0CyborgFactory':family==='vtol'?'A0VTolFactory1':'A0LightFactory'}.png" alt=""><span>${factoryDisplayNumber(f)}</span><small hidden>${factoryStatus(f)}</small>`,`data-factory="${f.id}" aria-pressed="${f.id===state.factory}" aria-label="${esc(factoryName(f))}" title="${esc(factoryName(f)+' · '+factoryStatus(f))}"`,f.id===state.factory?'active':'')).join('')||'<p class="wt-empty">No completed factory.</p>'}</div></div></div><nav class="wt-factory-view-tabs" aria-label="Manufacturing pages">${button('Design','data-page="design"')}${button('Blueprints','data-page="saved"')}${button('•••',`id="wt-factory-menu-toggle" data-action="factory-menu" aria-label="Manufacturing options" aria-controls="wt-factory-menu" aria-expanded="${state.factoryMenuOpen}"`,'wt-factory-menu-toggle')}</nav></div><input hidden id="wt-factory-select" value="${state.factory}">`;
  }
  function recipeThumbnail(d){
    if(!d)return null;
    const equipment=templateEquipment(d).map(value=>typeof value==='string'?value:value?.id||value?.name).filter(Boolean);
    const part=equipment.map(findPart).find(p=>p?.image||p?.group==='Construct')||[findPart(d.body),findPart(d.propulsion)].find(p=>p?.image);
    if(!part)return null;
    return {src:part.image?`/warzone/${part.image}`:'/warzone/research-icons/Engineering.gif',name:part.name||d.name||'Unit'};
  }
  function recipeArtwork(d){
    const thumbnail=recipeThumbnail(d);
    if(thumbnail)return `<span class="wt-recipe-art" title="${esc(thumbnail.name)}"><img loading="lazy" src="${esc(thumbnail.src)}" alt=""></span>`;
    const equipment=templateEquipment(d),part=equipment.map(findPart).find(p=>p?.image||p?.group==='Construct')||[findPart(d.body),findPart(d.propulsion)].find(p=>p?.image)||equipment.map(findPart).find(Boolean)||{group:/Spade/i.test(equipment[0]||'')?'Construct':'Weapon'};
    return `<span class="wt-recipe-art" title="${esc(part.name||'Unit component')}">${image(part)}</span>`;
  }
  function recipeDescription(d){
    if(templateEquipment(d).some(id=>findPart(id)?.group==='Construct'||/Spade/i.test(id)))return 'Engineering';
    return [findPart(d.body)?.name||(/cyborg/i.test(d.body)?'Cyborg':''),findPart(d.propulsion)?.name||(/cyborg/i.test(d.propulsion)?'Legs':'')].filter(Boolean).join(' · ');
  }
  function factoryQuantity(recipe){
    return `<div class="wt-quantity" role="group" aria-label="Units to add on the next Produce tap for ${esc(recipe.name)}"><span>ADD</span>${[1,5,10,20].map(n=>button(String(n),`data-count="${n}" aria-pressed="${n===state.productionCount}" aria-label="Add ${n} unit${n===1?'':'s'} on the next Produce tap"`,n===state.productionCount?'active':'')).join('')}</div>`;
  }
  function reconcileManufacturingDisplay(before,next){
    if(before&&(next.gameTime<before.gameTime||next.player!==before.player)){
      state.manufacturingEpoch++;state.productionRepeatDrafts.clear();state.productionRepeatRequests.clear();state.productionAllDrafts.clear();
      state.productionCancellations.clear();state.productionRequests.clear();state.productionFeedback.clear();
    }
    const live=new Set((next.factories||[]).map(f=>String(f.id)));
    for(const key of state.productionRepeatDrafts.keys())if(!live.has(key.slice(0,key.indexOf(':'))))state.productionRepeatDrafts.delete(key);
    for(const key of state.productionAllDrafts.keys())if(!live.has(key.slice(0,key.indexOf(':'))))state.productionAllDrafts.delete(key);
  }
  function repeatDraftKey(factoryId,recipeKey){return `${factoryId}:${recipeKey}`;}
  function repeatForRecipe(factory,recipe){
    if(!factory||!recipe)return false;
    const peers=allForRecipe(factory,recipe)?allProductionPeers(factory,recipe):[factory];
    return peers.some(f=>{
      const key=repeatDraftKey(f.id,recipe.key);
      return state.productionRepeatDrafts.has(key)?state.productionRepeatDrafts.get(key):Boolean(f.repeat?.enabled&&f.repeat.design&&templateParts(f.repeat.design)===recipe.key);
    });
  }
  function factoryIsBusy(factoryId){return state.productionRepeatRequests.has(factoryId)||state.productionCancellations.has(factoryId);}
  function isAllProductionFactory(factory){
    if(!factory||!['vehicle','cyborg'].includes(factoryFamily(factory)))return false;
    return state.snapshot.factories.filter(f=>f.ready&&factoryFamily(f)===factoryFamily(factory)).sort((a,b)=>a.id-b.id)[0]?.id===factory.id;
  }
  function allProductionPeers(factory,recipe){
    if(!recipe||!isAllProductionFactory(factory))return [];
    const family=factoryFamily(factory),group=state.snapshot.factories.filter(f=>f.ready&&factoryFamily(f)===family).sort((a,b)=>a.id-b.id);
    if(group[0]?.id!==factory.id)return [];
    return group.filter(f=>factoryRecipes(f).some(r=>r.key===recipe.key&&r.compatible));
  }
  function allForRecipe(factory,recipe){return allProductionPeers(factory,recipe).length>0&&state.productionAllDrafts.get(repeatDraftKey(factory.id,recipe.key))===true;}
  function productionScope(factory,recipe){return allForRecipe(factory,recipe)?allProductionPeers(factory,recipe):[factory];}
  function productionScopeBusy(factory,recipe){return productionScope(factory,recipe).some(f=>factoryIsBusy(f.id)||productionRequestsFor(f.id).length>0);}
  function allProductionControl(recipe,factory){
    if(!isAllProductionFactory(factory))return '';
    const on=allForRecipe(factory,recipe),family=factoryFamily(factory)==='cyborg'?'cyborg':'vehicle',busy=productionScopeBusy(factory,recipe);
    return button('ALL',`data-production-all="${esc(recipe.key)}" aria-pressed="${on}" aria-label="All ${family} factories for ${esc(recipe.name)} ${on?'on':'off'}" title="Manufacture this design at all compatible ${family} factories"${!recipe.compatible||busy?' disabled':''}`,'wt-factory-all'+(on?' active':''));
  }
  function toggleProductionAll(b){
    const factory=state.snapshot?.factories.find(f=>f.id===state.factory&&f.ready),recipe=factoryRecipes(factory).find(r=>r.key===b.dataset.productionAll);
    if(!recipe?.compatible||!allProductionPeers(factory,recipe).length||productionScopeBusy(factory,recipe))return;
    state.productionAllDrafts.set(repeatDraftKey(factory.id,recipe.key),!allForRecipe(factory,recipe));
    updateFactoryRows(factory);
  }
  function repeatControl(recipe,factory){
    const on=repeatForRecipe(factory,recipe),busy=factory?productionScopeBusy(factory,recipe):false;
    const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7H8a4 4 0 0 0-4 4v1M17 4l3 3-3 3M4 17h12a4 4 0 0 0 4-4v-1M7 20l-3-3 3-3"/></svg>';
    return button(icon,`data-production-repeat="${esc(recipe.key)}" aria-pressed="${on}" aria-label="Repeat ${esc(recipe.name)} ${on?'on':'off'}" title="Repeat manufacturing ${on?'on':'off'}"${!recipe.compatible||busy?' disabled':''}${busy?' aria-busy="true"':''}`,'wt-factory-repeat'+(on?' active':''));
  }
  function factoryInlineStatus(recipe,factory){
    const observation=factory?productionStatus(factory):null;
    if(!observation?.design||templateParts(observation.design)!==recipe.key)return '';
    return `<span class="wt-factory-inline-label">${observation.mode==='building'?'<i class="wt-live-dot" aria-hidden="true"></i>':''}<b>${esc(observation.label)}</b>${observation.percent===null?'':`<small>${observation.percent}%</small>`}</span>${observation.percent===null?'':`<div class="wt-status-progress" role="progressbar" aria-label="${esc(recipe.name)} manufacturing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${observation.percent}" data-current-id="${esc(observation.currentId)}"><i style="width:${observation.percent}%"></i></div>`}`;
  }
  function updateFactoryRows(factory){
    if(state.page!=='factory'||factory.id!==state.factory)return;
    const recipes=factoryRecipes(factory),content=element('wt-page-content');
    for(const row of content?.querySelectorAll('.wt-factory-design-row')||[]){
      const recipe=recipes.find(r=>r.key===row.dataset.recipeKey);if(!recipe)continue;
      const status=row.querySelector('.wt-factory-inline-status'),html=factoryInlineStatus(recipe,factory);
      if(status&&status._html!==html){status.innerHTML=html;status._html=html;status.hidden=!html;}
      if(status)status.dataset.productionState=productionStatus(factory).mode;
      const repeat=row.querySelector('.wt-factory-repeat'),on=repeatForRecipe(factory,recipe);
      if(repeat){repeat.classList.toggle('active',on);repeat.setAttribute('aria-pressed',String(on));repeat.setAttribute('aria-label',`Repeat ${recipe.name} ${on?'on':'off'}`);repeat.title=`Repeat manufacturing ${on?'on':'off'}`;repeat.disabled=!recipe.compatible||productionScopeBusy(factory,recipe);repeat.setAttribute('aria-busy',String(productionScopeBusy(factory,recipe)));}
      const all=row.querySelector('.wt-factory-all'),allOn=allForRecipe(factory,recipe);
      if(all){all.classList.toggle('active',allOn);all.setAttribute('aria-pressed',String(allOn));all.setAttribute('aria-label',`All ${factoryFamily(factory)} factories for ${recipe.name} ${allOn?'on':'off'}`);all.disabled=!recipe.compatible||productionScopeBusy(factory,recipe);}
    }
    updateProductionFeedback();
  }
  function toggleProductionRepeat(b){
    const factory=state.snapshot?.factories.find(f=>f.id===state.factory&&f.ready),recipe=factoryRecipes(factory).find(r=>r.key===b.dataset.productionRepeat);
    if(!factory||!recipe?.compatible||productionScopeBusy(factory,recipe))return;
    const key=repeatDraftKey(factory.id,recipe.key),previous=repeatForRecipe(factory,recipe),enabled=!previous;
    state.productionRepeatDrafts.set(key,enabled);
    const all=allForRecipe(factory,recipe),peers=productionScope(factory,recipe);
    const livePlan=peers.some(f=>f.repeat?.enabled&&f.repeat.design&&templateParts(f.repeat.design)===recipe.key);
    const liveWork=peers.some(f=>[f.currentProduction,f.active?.design,...(f.queue||[]).map(j=>j.design)].some(d=>d&&templateParts(d)===recipe.key));
    if(!livePlan&&!liveWork){updateFactoryRows(factory);return;}
    const token={epoch:state.manufacturingEpoch};for(const f of peers)state.productionRepeatRequests.set(f.id,token);updateFactoryRows(factory);
    send('set-production-repeat',{factoryId:factory.id,enabled,...(all?{all:true}:{}),...(recipe.produceNative?{templateId:recipe.produceId}:{design:recipe.display})}).then(reply=>{
      if(state.productionRepeatRequests.get(factory.id)!==token||token.epoch!==state.manufacturingEpoch)return;
      if(!reply.ok){state.productionRepeatDrafts.set(key,previous);notify(reason(reply.reason));}
      else if(all){for(const row of reply.result?.factories||[]){const peer=peers.find(f=>f.id===row.factoryId);if(peer){peer.repeat=row.repeat;state.productionRepeatDrafts.set(repeatDraftKey(peer.id,recipe.key),enabled);}}}
      else factory.repeat=reply.result;
    }).catch(()=>{if(state.productionRepeatRequests.get(factory.id)===token){state.productionRepeatDrafts.set(key,previous);notify('Repeat manufacturing could not be confirmed.');}}).finally(()=>{
      if(state.productionRepeatRequests.get(factory.id)===token){for(const f of peers)if(state.productionRepeatRequests.get(f.id)===token)state.productionRepeatRequests.delete(f.id);updateFactoryRows(factory);requestState();}
    });
  }
  function factoryRecipeRow(recipe){
    const chosen=recipe.key===state.factoryRecipeKey,attrs=recipe.produceNative?`data-produce-template="${esc(recipe.produceId)}"`:`data-produce="${esc(recipe.produceId)}"`;
    const status=!recipe.researched?'RESEARCH REQUIRED':!recipe.compatible?'FACTORY MODULES REQUIRED':`${powerSymbol} ${esc(recipe.cost)}`;
    const pending=productionRequestsFor(state.factory,recipe.produceNative?'template':'design',recipe.produceId).length>0;
    const factory=state.snapshot.factories.find(f=>f.id===state.factory),activity=factoryInlineStatus(recipe,factory),busy=productionScopeBusy(factory,recipe);
    return `<article class="wt-command-card wt-factory-design-row" data-recipe-key="${esc(recipe.key)}" data-selected-design="${chosen}">${button(`${recipeArtwork(recipe.display)}<span class="wt-factory-design-copy"><strong>${esc(recipe.name)}</strong><span class="wt-recipe-description">${esc(recipeDescription(recipe.display))}</span><small class="${recipe.compatible?'':'wt-design-unavailable'}">${status}</small></span>`,`data-factory-recipe-select="${esc(recipe.key)}" aria-pressed="${chosen}"`,'wt-factory-design-select')}<div class="wt-factory-inline-status" data-production-state="${esc(factory?productionStatus(factory).mode:'idle')}" ${activity?'':'hidden'}>${activity}</div><div class="wt-factory-recipe-actions">${repeatControl(recipe,factory)}${allProductionControl(recipe,factory)}${button(pending?'ADDING…':'MANUFACTURE',attrs+` aria-busy="${pending}" aria-label="Manufacture ${esc(recipe.name)}" data-compatible="${recipe.compatible}"`+(!recipe.compatible||pending||busy?' disabled':''),'wt-primary wt-factory-produce'+(pending?' pending':''))}</div></article>`;
  }
  function factoryOverflow(recipe){
    return `<div id="wt-factory-menu" class="wt-factory-menu" ${state.factoryMenuOpen?'':'hidden'} aria-label="Factory options">${button('BLUEPRINT LIBRARY','data-page="saved"')}${recipe?.native&&!recipe.saved.length?button(`SAVE DESIGN TO PHONE<small>${esc(recipe.name)}</small>`,`data-save-template="${esc(recipe.native.id)}"`):recipe?.saved.length?'<p>Selected design is saved on this phone.</p>':'<p>Select a design to save it.</p>'}${button('BUILD A FACTORY','data-page="build"')}</div>`;
  }
  function renderTowersFactory(factories,factory,designs,chosen){
    const recipes=factoryRecipes(factory),selected=recipes.find(r=>r.saved.some(d=>d.id===state.selected));
    if(selected&&state.selected!==state.factorySelectionFromLibrary){state.factoryRecipeKey=selected.key;state.factorySelectionFromLibrary=state.selected;}
    if(!recipes.some(r=>r.key===state.factoryRecipeKey))state.factoryRecipeKey=recipes[0]?.key||'';
    const recipe=recipes.find(r=>r.key===state.factoryRecipeKey);
    return `<div class="wt-towers-factory-screen wt-compact-production"><section class="wt-factory-selector" aria-label="Manufacturing facilities">${renderFactoryRail(factories,factory)}</section><section class="wt-work-list wt-factory-main"><div class="wt-factory-design-list" tabindex="0" aria-label="Unit designs; scroll for more">${recipes.map(factoryRecipeRow).join('')||`<p class="wt-empty">${factory?'No designs for this factory. Save a blueprint in Design or research more components.':'Build and complete a factory to start manufacturing.'}</p>`}</div>${productionFeedbackMarkup()}</section>${factoryOverflow(recipe)}</div>`;
  }
  function productionRequestsFor(factoryId,kind,id){
    return Array.from(state.productionRequests.values()).filter(r=>(r.factoryId===factoryId||r.factoryIds?.includes(factoryId))&&(!kind||r.kind===kind&&r.id===id));
  }
  function productionFeedbackValue(factoryId=state.factory){
    const feedback=state.productionFeedback.get(factoryId),pending=productionRequestsFor(factoryId);
    if(!feedback)return {message:'',tone:'done'};
    if(pending.length){const count=pending.reduce((n,r)=>n+r.count,0),waiting=pending.some(r=>Date.now()-r.at>12000);
      return {message:feedback.error?`${feedback.error} · ${count} still pending`:waiting?`Waiting for ${feedback.factoryName} · ${count} pending`:`Adding ${count} to ${feedback.factoryName}…`,tone:feedback.error?'error':'pending'};}
    return feedback.error?{message:feedback.error,tone:'error'}:{message:`Added ${feedback.accepted} to ${feedback.factoryName}`,tone:'done'};
  }
  function productionFeedbackMarkup(){
    const value=productionFeedbackValue();return `<p id="wt-production-feedback" class="wt-production-feedback" role="status" aria-live="polite" data-tone="${value.tone}" ${value.message&&value.tone==='error'?'':'hidden'}>${esc(value.message)}</p>`;
  }
  function updateProductionFeedback(){
    if(!polishedTowers||state.page!=='factory')return;
    const value=productionFeedbackValue(),target=element('wt-production-feedback');
    if(target){target.hidden=!value.message||value.tone!=='error';target.dataset.tone=value.tone;if(target.textContent!==value.message)target.textContent=value.message;}
    for(const b of element('wt-page-content')?.querySelectorAll('.wt-factory-produce')||[]){
      const native=Boolean(b.dataset.produceTemplate),pending=productionRequestsFor(state.factory,native?'template':'design',native?b.dataset.produceTemplate:b.dataset.produce).length>0;
      const text=pending?'ADDING…':'MANUFACTURE';
      const factory=state.snapshot?.factories.find(f=>f.id===state.factory),recipe=factoryRecipes(factory).find(r=>r.produceNative===native&&String(r.produceId)===String(native?b.dataset.produceTemplate:b.dataset.produce));
      if(b.textContent!==text)b.textContent=text;b.classList.toggle('pending',pending);b.setAttribute('aria-busy',String(pending));b.disabled=pending||b.dataset.compatible==='false'||(recipe?productionScopeBusy(factory,recipe):factoryIsBusy(state.factory));
    }
  }
  function queueProduction(b){
    const factoryId=state.factory,factory=state.snapshot?.factories.find(f=>f.id===factoryId&&f.ready);
    if(!factory){notify(reason('factory-missing'));return;}
    const count=1,native=Boolean(b.dataset.produceTemplate),id=native?b.dataset.produceTemplate:b.dataset.produce;
    const saved=native?null:state.saved.find(s=>s.id===id),design=saved?JSON.parse(JSON.stringify(saved)):null;
    if(!native&&!design){notify('This blueprint is no longer available. Choose a design again.');return;}
    if(factoryIsBusy(factoryId)||productionRequestsFor(factoryId,native?'template':'design',id).length)return;
    const recipe=factoryRecipes(factory).find(r=>r.produceNative===native&&String(r.produceId)===String(id));
    if(!recipe?.compatible||productionScopeBusy(factory,recipe))return;
    const repeat=repeatForRecipe(factory,recipe),epoch=state.manufacturingEpoch,all=allForRecipe(factory,recipe),peers=productionScope(factory,recipe);
    const key=++state.productionSerial,pending=productionRequestsFor(factoryId);
    const previous=state.productionFeedback.get(factoryId);
    if(!pending.length&&previous?.error&&state.notice===previous.error){state.notice='';const notice=element('wt-command-notice');if(notice)notice.textContent='';}
    const feedback=pending.length&&state.productionFeedback.get(factoryId)||{accepted:0,error:'',factoryName:factoryName(factory).replace('CYBORG FACTORY','Cyborg Factory').replace('VTOL FACTORY','VTOL Factory').replace('FACTORY','Factory')};
    state.productionFeedback.set(factoryId,feedback);
    state.productionRequests.set(key,{factoryId,...(all?{factoryIds:peers.map(f=>f.id)}:{}),count,kind:native?'template':'design',id,at:Date.now()});
    updateProductionFeedback();
    send('queue-production',{factoryId,count,repeat,...(all?{all:true}:{}),...(native?{templateId:id}:{design})}).then(reply=>{
      if(!state.productionRequests.has(key)||epoch!==state.manufacturingEpoch)return;state.productionRequests.delete(key);
      if(reply.ok){
        feedback.accepted+=Number(reply.result?.count)||count;
        if(all)for(const row of reply.result?.factories||[]){const peer=peers.find(f=>f.id===row.factoryId);if(peer){peer.repeat=row.repeat;state.productionRepeatDrafts.set(repeatDraftKey(peer.id,recipe.key),Boolean(row.repeat?.enabled));}}
        if(all&&reply.result?.skippedFactoryIds?.length){feedback.error='Some factory queues are full. Check Queue.';notify(feedback.error);}
      }
      else {feedback.error=reason(reply.reason);notify(feedback.error);}
      updateProductionFeedback();
      // Only the native state reply updates jobs/counts; never invent a queue row.
      if(!window.__towersHtml?.isEnded?.())send('state',{}, {fresh:true});
      setTimeout(()=>{if(state.productionFeedback.get(factoryId)===feedback&&!productionRequestsFor(factoryId).length){state.productionFeedback.delete(factoryId);updateProductionFeedback();}},4000);
    }).catch(error=>{
      if(!state.productionRequests.delete(key))return;feedback.error=error.message||'Manufacturing could not be confirmed. Check the queue.';updateProductionFeedback();notify(feedback.error);
    });
  }
  function factoryWaitingGroups(queue){
    const groups=[];
    for(const job of queue||[]){const key=JSON.stringify([templateParts(job.design),job.status,job.reason||'']);let group=groups[groups.length-1];if(!group||group.key!==key){group={key,design:job.design,status:job.status,reason:job.reason||'',jobs:[],names:[]};groups.push(group);}group.jobs.push(job.id);const name=job.design.name||job.design.fullname;if(!group.names.includes(name))group.names.push(name);}
    return groups;
  }
  function factoryWaitingName(group){return `${group.names.join(' / ')}${group.jobs.length>1?' ×'+group.jobs.length:''}`;}
  function closeFactoryMenu(){state.factoryMenuOpen=false;const menu=element('wt-factory-menu');if(menu)menu.hidden=true;element('wt-factory-menu-toggle')?.setAttribute('aria-expanded','false');}
  function updateFactoryActivity(f){
    const target=element('wt-factory-progress');if(!target)return;
    const html=factoryProgress(f);if(target._html===html)return;
    const top=target.querySelector('.wt-factory-queue-list')?.scrollTop||0;
    target.innerHTML=html;target._html=html;const list=target.querySelector('.wt-factory-queue-list');if(list)list.scrollTop=top;
  }
  function handlePanelBack(){
    if(playersState.nativeMenu||playersState.pending){void navigatePlayers('close');return true;}
    if(state.page==='players'){void close();return true;}
    if(state.designRename){finishDesignRename(false);return true;}
    if(state.demolition||state.demolitionOpening){cancelDemolish();return true;}
    if(!polishedTowers||state.page!=='factory')return false;
    if(state.factoryMenuOpen){closeFactoryMenu();return true;}
    if(state.factoryQueueOpen){state.factoryQueueOpen=false;const factory=state.snapshot?.factories.find(f=>f.id===state.factory);if(factory)updateFactoryActivity(factory);return true;}
    return false;
  }
  function productionStatus(factory){
    const native=factory.progress||{},current=factory.currentProduction||(native.state==='idle'?null:factory.active?.design)||null;
    const cleanName=value=>String(value||'').replace(/(?: · F\d+)+$/,'');
    const fresh=Boolean(native.available===true&&native.currentId&&factory.currentProduction&&native.currentName&&cleanName(native.currentName)===cleanName(factory.currentProduction.name||factory.currentProduction.fullname));
    const ratio=native.ratio,completed=native.completedBuildPoints,total=native.totalBuildPoints;
    const percent=fresh&&Number.isFinite(ratio)&&ratio>=0&&ratio<=1&&Number.isFinite(completed)&&completed>=0&&Number.isFinite(total)&&total>0&&completed<=total?Math.floor(ratio*100):null;
    const currentCount=current?1:native.state==='idle'||factory.idle?0:null,waiting=Array.isArray(factory.queue)?factory.queue.length:null;
    const queueKnown=factory.queueKnown===true&&waiting!==null&&currentCount!==null;
    const remaining=queueKnown?currentCount+waiting:null;
    const rawState=String(native.state||'unavailable');
    const mode=fresh&&['building','paused','waiting-power','waiting-capacity'].includes(rawState)?rawState:current?'unavailable':factory.queue?.[0]?.status==='blocked'?'blocked':factory.queue?.[0]?.status==='waiting'?'waiting-capacity':factory.idle?'idle':'unavailable';
    const label=({'building':'PRODUCING','paused':'PAUSED','waiting-power':'WAITING FOR POWER','waiting-capacity':'WAITING FOR CAPACITY','blocked':'BLOCKED','idle':'READY'})[mode]||(current?'PRODUCING':'MANUFACTURING ACTIVE');
    const seconds=mode==='building'&&percent!==null&&native.remainingSeconds!=null&&Number.isFinite(Number(native.remainingSeconds))&&Number(native.remainingSeconds)>=0?Math.ceil(Number(native.remainingSeconds)):null;
    const time=seconds===null?'':`~${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} LEFT`;
    return {design:current,currentCount,waiting,queueKnown,remaining,mode,percent,currentId:percent===null?'':String(native.currentId),
      counts:[currentCount===null?'':`Current ${currentCount}`,queueKnown?`Waiting ${waiting}`:''].filter(Boolean).join(' · ')+(remaining===null?'':`\nRemaining ${remaining}`),
      label,activity:[label,percent===null?'':`${percent}%`,time].filter(Boolean).join(' · ')};
  }
  function towersFactoryProgress(f){
    const observation=productionStatus(f),current=observation.design,active=observation.currentCount!==0&&Boolean(current||!f.idle),groups=factoryWaitingGroups(f.queue),first=groups[0];
    const now=current?.name||current?.fullname||(active?'Manufacturing active':'Factory ready');
    const waiting=first?`${factoryWaitingName(first)}${groups.length>1?' · +'+(groups.length-1)+' more':''}`:'No waiting units';
    const expanded=Boolean(state.factoryQueueOpen);
    return `<div class="wt-factory-now-strip"><strong>${factoryName(f)}</strong><span class="wt-factory-now" title="${esc(now)}">${active?'<i class="wt-live-dot" aria-hidden="true"></i>':''}<b>${observation.currentCount===1?'NOW 1':active?'NOW':'READY'}</b><span>${esc(now)}</span></span>${observation.queueKnown?`<span class="wt-factory-next" title="${esc(waiting)}"><b>WAITING ${observation.waiting}</b><span>${esc(waiting)}</span></span>`:''}${button(expanded?'HIDE QUEUE':'SHOW QUEUE',`id="wt-factory-queue-toggle" data-action="factory-queue" aria-controls="wt-factory-queue" aria-expanded="${expanded}"`,'wt-subtle')}</div><div class="wt-factory-observation" data-production-state="${esc(observation.mode)}">${observation.remaining===null?'':`<strong>${observation.remaining} REMAINING</strong>`}<span>${esc(observation.activity)}</span>${observation.percent===null?'':`<div class="wt-status-progress" role="progressbar" aria-label="${esc(factoryName(f))}: current unit production progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${observation.percent}" aria-valuetext="${esc(observation.activity)}" data-current-id="${esc(observation.currentId)}"><i style="width:${observation.percent}%"></i></div>`}</div><section id="wt-factory-queue" class="wt-factory-queue" ${expanded?'':'hidden'} aria-label="Waiting production queue"><header><h3>WAITING · ${(f.queue||[]).length} UNIT${f.queue?.length===1?'':'S'}</h3>${f.queue?.length?button('CLEAR WAITING',`data-clear-production="${f.id}"`,'wt-subtle'):''}</header><ol class="wt-production-list wt-factory-queue-list" tabindex="0">${groups.map((group,index)=>`<li data-production-group="${index}" data-production-job-ids="${esc(JSON.stringify(group.jobs))}"><b class="wt-production-order">${index+1}</b>${unitParts(group.design)}<div><strong>${esc(factoryWaitingName(group))}</strong><small>${esc(String(group.status||'queued').toUpperCase())}${group.reason?' · '+esc(reason(group.reason)):''}</small></div></li>`).join('')||'<li class="wt-empty-queue">No waiting units.</li>'}</ol>${f.waitingReason?`<p class="wt-factory-capacity">WAITING: ${esc(String(f.waitingReason.kind).toUpperCase())} LIMIT ${f.waitingReason.current} / ${f.waitingReason.limit}. Recycle a unit to make room, or clear waiting units.</p>`:''}${f.queue?.[0]?.status==='blocked'?`<p>${esc(reason(f.queue[0].reason))} ${button('RETRY',`data-retry-production="${f.id}"`)}</p>`:''}</section>`;
  }

  function designFitsFactory(d,f){
    if(!f)return false;
    const cyborg=/cyborg/i.test(d.body+' '+d.propulsion),flying=/vtol|v-tol/i.test(d.propulsion)||findPart(d.propulsion)?.propulsionType==='Lift';
    if(cyborg)return /cyborg/i.test(f.kind);
    if(/cyborg/i.test(f.kind)||flying!==/vtol/i.test(f.kind))return false;
    const size=['LIGHT','MEDIUM','HEAVY','SUPER HEAVY'].indexOf(findPart(d.body)?.size);
    return /vtol/i.test(f.kind)||size<0||size<=Number(f.modules||0);
  }
  function productionCard(d,native){
    const researched=native||!polishedTowers||availableDesign(d),compatible=(native||designFitsFactory(d,state.snapshot.factories.find(f=>f.id===state.factory)))&&researched;
    return `<article class="wt-command-card" data-selected-design="${!native&&d.id===state.selected}">${unitParts(d)}<div><h2>${esc(native?String(d.fullname||d.name).replace(/\s*\u00b7\s*F\d+$/,''):d.fullname||d.name)}</h2>${!researched?'<p class="wt-design-unavailable">Research required this game</p>':`<p>${powerSymbol} ${d.cost}${compatible?'':' · Check factory type / modules'}</p>`}</div><div class="wt-card-actions">${button('PRODUCE',(native?`data-produce-template="${esc(d.id)}"`:`data-produce="${esc(d.id)}"`)+(compatible?'':' disabled'),'wt-primary')}${native?button('SAVE TO PHONE',`data-save-template="${esc(d.id)}"`,'wt-subtle'):''}${!native&&d.factoryTemplate?'<small>Saved on this phone</small>':''}</div></article>`;
  }
  function factoryProgress(f){if(polishedTowers)return towersFactoryProgress(f);return `${f.active?`<div class="wt-active-production"><span class="wt-live-dot"></span> ${esc(f.active.design.name)}</div>`:''}<ol class="wt-production-list">${f.queue.map(j=>`<li><b>${esc(j.design.name)}</b><span>${esc(j.status)}</span></li>`).join('')}</ol><p>${f.waitingReason?`WAITING: ${esc(f.waitingReason.kind.toUpperCase())} LIMIT ${f.waitingReason.current} / ${f.waitingReason.limit}`:f.active?`PRODUCING: ${esc(f.active.design.name)}`:f.idle?'IDLE':'PRODUCING FROM FACTORY CONTROLS'} · ${f.queue.length} queued</p>${f.waitingReason?'<p>Recycle an existing unit of this type to make room, or clear the waiting queue.</p>':''}${f.queue[0]?.status==='blocked'?`<p>${esc(reason(f.queue[0].reason))} ${button('RETRY',`data-retry-production="${f.id}"`)}</p>`:''}${f.queue.length?button('CLEAR WAITING QUEUE',`data-clear-production="${f.id}"`):''}`;}
  function compactSiteRow(j){
    const item=state.catalog.buildings.find(b=>b.id===j.itemId),job=state.snapshot.jobs?.find(job=>job.id===j.id);
    return `<article class="wt-site-row wt-order-site" data-site-id="${esc(j.id)}" data-site-number="${j.number}" data-site-status="${esc(j.status)}">${item?`<span class="wt-order-art">${image(item)}</span>`:''}<span class="wt-site-number">#${j.number}</span><div><strong>${esc(j.name)}</strong><small>${siteStatus(j)} · ${j.x},${j.y}${j.status!=='done'&&j.remaining!=null?' · '+remainingTime(j.remaining):''}</small>${j.progress!=null&&j.status!=='done'?`<progress max="1" value="${j.progress}" aria-label="Approximate construction progress"></progress>`:''}</div>${job?`<span class="wt-order-actions">${polishedTowers&&!campaign?constructionResumeControl(j):job.status==='blocked'?button('RETRY',`data-retry-job="${esc(job.id)}"`,'wt-subtle'):''}${button('REMOVE',`data-cancel-job="${esc(job.id)}"`,'wt-subtle')}</span>`:!campaign?constructionResumeControl(j):''}</article>`;
  }
  function productionCancelControl(f, ids, currentId=''){
    if(!ids.length)return '';
    const current=Boolean(currentId),label=current||ids.length===1?'CANCEL':`CANCEL ×${ids.length}`;
    const attrs=`data-production-cancel-factory="${f.id}" data-production-cancel-ids="${esc(JSON.stringify(ids))}"${current?` data-production-cancel-current="${esc(currentId)}"`:''}`;
    const description=`Cancel ${current?'current manufacturing':ids.length+' waiting unit'+(ids.length===1?'':'s')} at ${factoryName(f)}`;
    return button(state.productionCancellations.has(f.id)?'CANCELLING…':label,`${attrs} data-cancel-label="${esc(label)}" aria-label="${esc(description)}" ${state.productionCancellations.has(f.id)?'disabled aria-busy="true"':''}`,'wt-subtle wt-production-cancel');
  }
  function queueFactoryRow(f){
    const current=productionStatus(f).design||f.queue?.[0]?.design||f.repeat?.design;
    return `<article class="wt-queue-row wt-order-production" data-order-factory="${f.id}">${current?recipeArtwork(current):'<span class="wt-recipe-art"></span>'}<div class="wt-queue-production-copy">${queueFactoryCopy(f)}</div>${button(state.productionCancellations.has(f.id)?'STOPPING…':'STOP',`data-stop-production="${f.id}" aria-label="Stop all manufacturing at ${esc(factoryName(f))}"${factoryIsBusy(f.id)||productionRequestsFor(f.id).length?' disabled':''}`,'wt-production-stop')}</article>`;
  }
  function queueFactoryCopy(f){
    const observation=productionStatus(f),current=observation.design,groups=factoryWaitingGroups(f.queue);
    const name=current?.name||current?.fullname||groups[0]?.design?.name||f.repeat?.design?.name||'Manufacturing';
    const next=groups.length?groups.map(factoryWaitingName).join(' → '):f.repeat?.enabled?'Repeating':'';
    const activity=current?observation.label:groups[0]?.reason?reason(groups[0].reason):groups.length?'QUEUED':f.repeat?.enabled?'REPEATING':'';
    return `<small class="wt-queue-factory">${esc(factoryName(f))}</small><h3>${esc(name)}</h3><div class="wt-queue-inline-status" data-production-state="${esc(observation.mode)}"><span>${observation.mode==='building'?'<i class="wt-live-dot" aria-hidden="true"></i>':''}${esc(activity)}${observation.percent===null?'':` · ${observation.percent}%`}</span>${observation.percent===null?'':`<div class="wt-status-progress" role="progressbar" aria-label="${esc(factoryName(f))} manufacturing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${observation.percent}"><i style="width:${observation.percent}%"></i></div>`}</div>${next?`<small class="wt-queue-next">${groups.length?'Next · ':''}${esc(next)}</small>`:''}`;
  }
  function stopFactoryProduction(b){
    const factoryId=Number(b.dataset.stopProduction),factory=state.snapshot?.factories.find(f=>f.id===factoryId&&f.ready);
    if(!factory||factoryIsBusy(factoryId)||productionRequestsFor(factoryId).length)return;
    const token={epoch:state.manufacturingEpoch};state.productionCancellations.set(factoryId,token);refreshLive();
    send('stop-production',{factoryId}).then(reply=>{
      if(state.productionCancellations.get(factoryId)!==token||token.epoch!==state.manufacturingEpoch)return;
      if(reply.ok){for(const key of state.productionRepeatDrafts.keys())if(key.startsWith(`${factoryId}:`))state.productionRepeatDrafts.delete(key);factory.repeat=reply.result?.repeat||{enabled:false,key:'',design:null};}
      else if(reply.reason!=='battle-ended')notify(reason(reply.reason));
    }).catch(()=>{if(state.productionCancellations.get(factoryId)===token)notify('Stopping manufacturing could not be confirmed. Check the queue.');}).finally(()=>{
      if(state.productionCancellations.get(factoryId)===token){state.productionCancellations.delete(factoryId);requestState();refreshLive();}
    });
  }
  function cancelProductionOrder(b){
    const d=b.dataset,factoryId=Number(d.productionCancelFactory),currentId=d.productionCancelCurrent||'';
    let ids;try{ids=JSON.parse(d.productionCancelIds);}catch(_){return;}
    if(!Number.isInteger(factoryId)||!Array.isArray(ids)||!ids.length||state.productionCancellations.has(factoryId))return;
    const token={},action=currentId?'cancel-production':'remove-production';
    state.productionCancellations.set(factoryId,token);
    refreshLive();
    send(action,{factoryId,...(currentId?{jobId:ids[0],currentId}:{jobIds:ids})}).then(reply=>{
      if(state.productionCancellations.get(factoryId)!==token)return;
      if(reply.ok)notify(currentId?'Manufacturing cancelled.':`${reply.result?.jobIds?.length||ids.length} waiting unit${(reply.result?.jobIds?.length||ids.length)===1?'':'s'} cancelled.`);
      else if(reply.reason!=='battle-ended')notify(reason(reply.reason));
    }).catch(()=>{notify('Cancellation could not be confirmed. Check the updated queue.');}).finally(()=>{
      if(state.productionCancellations.get(factoryId)===token){state.productionCancellations.delete(factoryId);requestState();refreshLive();}
    });
  }
  function compactOrders(){
    const production=activeProductionFactories();
    return `<div class="wt-compact-orders"><section id="wt-order-factories" aria-label="Manufacturing orders">${production.map(queueFactoryRow).join('')}</section><div id="wt-order-construction">${compactConstructionOrders(production.length)}</div></div>`;
  }
  function activeProductionFactories(){return state.snapshot.factories.filter(f=>f.ready&&(f.active||f.currentProduction||!f.idle||f.queue.length||f.repeat?.enabled));}
  function compactConstructionOrders(productionCount){
    const sites=constructionRows(),active=sites.filter(j=>j.status!=='done'),done=sites.filter(j=>j.status==='done');
    return `${active.length?`<section><h2>Construction</h2>${active.map(compactSiteRow).join('')}</section>`:''}${!productionCount&&!active.length?'<p class="wt-empty">No active manufacturing or construction.</p>':''}${done.length?`<details id="wt-completed-builds" ${state.completedBuildsOpen?'open':''}><summary>Completed sites · ${done.length}</summary>${done.map(compactSiteRow).join('')}</details>`:''}`;
  }
  function updateCompactOrders(){
    const target=element('wt-order-factories');if(!target)return;
    const factories=activeProductionFactories(),rows=Array.from(target.querySelectorAll('[data-order-factory]'));
    if(rows.map(r=>Number(r.dataset.orderFactory)).join()!==factories.map(f=>f.id).join())target.innerHTML=factories.map(queueFactoryRow).join('');
    else for(const f of factories){
      const row=rows.find(r=>Number(r.dataset.orderFactory)===f.id),copy=row.querySelector('.wt-queue-production-copy'),html=queueFactoryCopy(f);
      if(copy._html!==html){copy.innerHTML=html;copy._html=html;}
      const artwork=productionStatus(f).design||f.queue?.[0]?.design||f.repeat?.design,art=artwork?recipeArtwork(artwork):'<span class="wt-recipe-art"></span>';
      if(row._art!==art){row.querySelector('.wt-recipe-art')?.remove();row.insertAdjacentHTML('afterbegin',art);row._art=art;}
      const stop=row.querySelector('.wt-production-stop'),pending=state.productionCancellations.has(f.id);
      stop.textContent=pending?'STOPPING…':'STOP';stop.disabled=factoryIsBusy(f.id)||productionRequestsFor(f.id).length>0;stop.setAttribute('aria-busy',String(pending));
    }
    const construction=element('wt-order-construction'),completed=construction?.querySelector('#wt-completed-builds');
    if(completed)state.completedBuildsOpen=completed.open;
    const html=compactConstructionOrders(factories.length);if(construction&&construction._html!==html){construction.innerHTML=html;construction._html=html;}
  }
  function renderQueue(){return `${polishedTowers?'':`<div class="wt-page-intro"><p>Live factory queues and construction activity. Construction times follow live truck activity. Remaining times are approximate; green blueprints mark native queued sites.</p>${button('VIEW BUILD SITES','data-action="back"','wt-primary')}</div>`}<div id="wt-live-queue">${liveQueueRows()}</div>`;}
  function liveQueueRows(){if(polishedTowers)return compactOrders();const s=state.snapshot,rows=[];for(const f of s.factories){if(f.active)rows.push(`<article class="wt-queue-row"><div><h2>${esc(f.kind)} ${polishedTowers?factoryDisplayNumber(f):f.number} — PRODUCING</h2><p>${esc(f.active.design.name)}</p></div></article>`);for(const [i,j]of f.queue.entries())rows.push(`<article class="wt-queue-row"><b>${i+1}</b><div><h2>${esc(j.design.name)}</h2><p>${esc(f.kind)} ${polishedTowers?factoryDisplayNumber(f):f.number} · ${esc(j.status.toUpperCase())}${j.reason?' · '+esc(reason(j.reason)):''}</p></div></article>`);}rows.push(...constructionRows().map(constructionRow));return rows.join('')||'<p class="wt-empty">No active construction or factory jobs. Further native site orders are shown on the battlefield.</p>';}
  function legacyRenderQueue(){return `<div class="wt-page-intro"><p>Orders run in order for each truck. A blocked site keeps its place until you retry or remove it.</p><span class="wt-tag">${state.snapshot.jobs.length} JOBS</span></div>
    <div id="wt-queue-list">${queueRows()}</div>`;}
  function queueRows(){return state.snapshot.jobs.map((j,i)=>`<article class="wt-queue-row"><b>${i+1}</b><div><h2>${esc(state.catalog.buildings.find(b=>b.id===j.itemId)?.name||j.itemId)}</h2><p>Tile ${j.x}, ${j.y} · ${j.automatic?'Auto truck':`${j.workers.length} selected truck${j.workers.length===1?'':'s'}`} · ${j.status.toUpperCase()}</p>${j.reason?`<p>${esc(reason(j.reason))}</p>`:''}</div>${j.status==='blocked'?button('RETRY',`data-retry-job="${esc(j.id)}"`):''}${button('REMOVE',`data-cancel-job="${esc(j.id)}"`)}</article>`).join('')||'<p class="wt-empty">The construction queue is clear.</p>';}
  function builderMode(){const count=state.snapshot?.trucks.filter(t=>t.selected).length||0;return `${count?`${count} TRUCK${count===1?'':'S'} SELECTED`:'AUTO TRUCK'} · ALWAYS QUEUE`;}
  function renderMore(){return `<div class="wt-page-intro"><p>Battle controls and interface size.</p></div><div class="wt-more-grid">${button('SELECT ALL COMBAT UNITS','data-control="toggleCombatLock"')}${button('AUTO PATROL','data-control="toggleAutoFight"')}${button('BOX SELECT → DRAG ON BATTLEFIELD','data-control="toggleBoxMode"')}${polishedTowers?'':button('COMMANDERS','data-action="commanders"')}</div>
    <label class="wt-size-label">CONTROL SIZE <select id="wt-command-size">${[[1,'Standard'],[1.2,'Large'],[1.4,'Extra large']].map(([v,label])=>`<option value="${v}" ${state.size===v?'selected':''}>${label}</option>`).join('')}</select></label><p>BUILD queues automatically and selects the nearby truck group. Multiple manually selected trucks stay selected. TRUCKS selects the nearby group for normal movement.</p>`;}
  function refreshLive(){
    updateProductionFeedback();
    updateSidebarQueue();
    if(state.page==='queue'&&element('wt-live-queue')){const target=element('wt-live-queue');if(polishedTowers)updateCompactOrders();else target.innerHTML=liveQueueRows();}
    if(element('wt-build-mode'))element('wt-build-mode').textContent=builderMode();
    if(state.page==='queue'&&element('wt-queue-list'))element('wt-queue-list').innerHTML=queueRows();
    else if(state.page==='factory'&&(polishedTowers||element('wt-factory-progress'))){const f=state.snapshot.factories.find(f=>f.id===state.factory);if(f){if(polishedTowers)updateFactoryRows(f);else element('wt-factory-progress').innerHTML=factoryProgress(f);for(const b of element('wt-page-content').querySelectorAll('[data-factory]')){const live=state.snapshot.factories.find(f=>f.id===Number(b.dataset.factory));if(live){b.querySelector('small').textContent=polishedTowers?factoryStatus(live):`${live.modules} MODULE${live.modules===1?'':'S'} · ${live.active?'PRODUCING':live.idle?'IDLE':'ACTIVE'}`;if(polishedTowers)b.title=factoryStatus(live);}}}else render();}
    else if(state.page&&element('wt-page-content')?.querySelector('.wt-empty')?.textContent.includes('Connecting'))render();
  }
  function updateHUD(){
    install();const hud=element('wt-build-status');hud.hidden=true;
    updateHeaderMenus();
    doc.body.dataset.buildSidebar=String(state.buildOpen);
    doc.body.dataset.modulePlacement=String(Boolean(state.buildOpen&&state.placement?.category==='MODULES'));
    if(doc.body.dataset.modulePlacement==='true'){
      const edge=element('wt-build-sidebar')?.getBoundingClientRect?.().right;
      if(Number.isFinite(edge))doc.documentElement?.style?.setProperty('--wt-module-toast-left',`${Math.ceil(edge)+8}px`);
    }

    if(!state.snapshot)return;
    element('wt-power').textContent=`POWER ${Math.floor(state.snapshot.power)}`;
    element('wt-command-resources').textContent=`${powerSymbol} ${Math.floor(state.snapshot.power)}`;
    const queue=element('wt-field-status');const selected=state.snapshot.selectedUnits||state.snapshot.trucks.filter(t=>t.selected);queue.textContent=state.nativeMenu==='build'?'EXIT BUILD / KEEP ORDERS':`${selected.length} UNIT${selected.length===1?'':'S'} SELECTED`;
    const badge=element('wt-field-toggle-count');if(badge){badge.textContent=selected.length||'';element('wt-field-toggle').setAttribute('aria-label',selected.length?`Unit controls: ${selected.length} selected`:'Unit controls');}
    if(state.nativeMenu==='build'&&!state.buildingOpening)state.nativeBuildGroup=constructionParticipants(state.nativeBuildGroup,state.snapshot.trucks);
    if((state.placement||state.nativeMenu==='build')&&state.placement?.category!=='MODULES'&&state.nativeBuildPlaced&&!state.exitingBuild&&!state.pendingItem&&!state.buildingOpening){const participants=new Set([...state.nativeBuildGroup,...(state.buildParticipants||[])]),group=state.snapshot.trucks.filter(t=>participants.has(t.id));if(nativeConstructionFinished(state,group,state.snapshot.gameTime,Boolean(state.siteChecks||state.lineDrafts.size||state.nativePendingSites.length||state.snapshot.jobs?.length||window.__kalaWarzoneTouch.report().pendingClicks))){state.nativeBuildSawWork=false;state.nativeBuildIdleAt=0;selectMode();}}
    const native=state.nativeMenu==='build',item=state.catalog?.buildings.find(b=>b.id===state.nativeItem);
    element('wt-native-build-mask').hidden=!native;
    hud.classList.toggle('placing',Boolean(state.placement)||native);
    hud.classList.toggle('native-building',native);
    const participants=state.snapshot.trucks.filter(t=>state.nativeBuildGroup.includes(t.id));
    element('wt-builder-summary').textContent=native?(state.nativeToolReady?'Tap clear terrain to queue. Green blueprints mark accepted sites.':'Choose a structure in the left panel.') :'';
    const line=state.lineDrafts.get(state.linePreviewToken);if(line&&!lineActive(line))cancelLinePlacement(line.token);
    updatePlacementLabel(line&&lineActive(line)?lineSummary(line):null);
    for(const b of hud.querySelectorAll('[data-action="cancel-placement"]'))b.hidden=!state.placement;
    for(const b of hud.querySelectorAll('[data-page="build"]'))b.hidden=!state.placement&&!native||state.buildOpen;
    updateSidebarQueue();
  }
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function setNativeHudHidden(){
    // Building never changes the engine viewport. The native minimap stays
    // visible and usable without leaving the selected structure.
    state.nativeHudHidden=false;
  }
  function nativeConstructionFinished(build,group,gameTime,pending){
    if(group.some(t=>t.building)){build.nativeBuildSawWork=true;build.nativeBuildIdleAt=0;return false;}
    if(!build.nativeBuildSawWork||pending||group.some(t=>t.order!==0)){build.nativeBuildIdleAt=0;return false;}
    // Native queued orders can briefly report idle between sites. Require
    // continued simulation time at idle before closing the placement tool.
    if(!build.nativeBuildIdleAt){build.nativeBuildIdleAt=gameTime;return false;}
    return gameTime-build.nativeBuildIdleAt>=1200;
  }
  function constructionParticipants(group,trucks){
    return Array.from(new Set([...group,...trucks.filter(t=>t.selected).map(t=>t.id)]));
  }
  function selectedBuildGroup(snapshot){
    const ids=new Set((snapshot?.selectedUnits||[]).filter(t=>t.constructor).map(t=>t.id));
    return (snapshot?.trucks||[]).filter(t=>ids.has(t.id)||t.selected);
  }
  function buildSelectionView(){
    const touch=window.__kalaWarzoneTouch?.report?.()||{};
    // Input revisions, rather than terrain frames, avoid reselecting every
    // frame or changing the camera just to find construction workers.
    return JSON.stringify([innerWidth,innerHeight,state.size||1,...['pans','panMoves','radarTaps','radarDrags','radarMoves','baseJumps','cameraFacings','zoomCommandWrites','zoomAcks','pinchSteps','tiltMoves','rotationMoves','zoomWheelEvents'].map(key=>Number(touch[key])||0)]);
  }
  function syncBuildGroup(){
    const intent=window.__kalaWarzoneTouch?.report?.().manualSelectionRevision,view=buildSelectionView();
    // Native selection events also come from our automatic rectangle scan.
    // A delayed scan event cannot masquerade as a manual choice in a new view.
    if(Number.isInteger(intent)){
      if(intent<=state.autoSelectionIntent)return;
      if(intent!==state.manualSelectionIntent){state.manualSelectionIntent=intent;state.manualSelectionView=view;}
      else if(state.manualSelectionView!==view)return;
    }
    if(!state.selectionPromise&&state.selectionEventSerial>state.autoSelectionRevision){
      state.nativeBuildGroup=selectedBuildGroup(state.snapshot).map(t=>t.id);
      state.autoSelectionRevision=state.selectionEventSerial;state.buildSelectionView=view;
    }
  }
  function refreshBuildSelection(){
    syncBuildGroup();const view=buildSelectionView();
    if(state.selectionPromise)return state.truckSelection?.view===view?state.selectionPromise:selectVisibleTrucks();
    return state.buildSelectionView===view?null:selectVisibleTrucks();
  }
  function subtractSelectionRect(rect,block){
    const hit={left:Math.max(rect.left,block.left),top:Math.max(rect.top,block.top),right:Math.min(rect.right,block.right),bottom:Math.min(rect.bottom,block.bottom)};
    if(hit.left>=hit.right||hit.top>=hit.bottom)return [rect];
    return [{...rect,bottom:hit.top},{...rect,top:hit.bottom},
      {left:rect.left,top:hit.top,right:hit.left,bottom:hit.bottom},
      {left:hit.right,top:hit.top,right:rect.right,bottom:hit.bottom}].filter(r=>r.right-r.left>=8&&r.bottom-r.top>=8);
  }
  function buildSelectionRegions(){
    const bounds=window.__kalaWarzoneTouch.nativeSelectionBounds(),frame=element('warzone-game-frame')?.getBoundingClientRect();
    if(!bounds||!frame)return [];
    let regions=[{left:Math.max(bounds.left,0)+3,top:Math.max(bounds.top,0)+3,
      right:Math.min(bounds.right,host.innerWidth-frame.left)-3,bottom:Math.min(bounds.bottom,host.innerHeight-frame.top)-3}];
    const blocks=bounds.radar?[bounds.radar]:[];
    // These are measured HTML occlusions, not guessed map/unit positions.
    for(const id of ['wt-build-sidebar','wt-field-centre','wt-field-toggle','lab-ops','lab-ops-toggle','wt-build-status','wt-native-back']){
      const e=element(id);if(!e||e.hidden||e.closest?.('[inert]'))continue;
      const css=host.getComputedStyle(e),b=e.getBoundingClientRect();
      if(css.display==='none'||css.visibility==='hidden'||!b.width||!b.height)continue;
      blocks.push({left:b.left-frame.left-2,top:b.top-frame.top-2,right:b.right-frame.left+2,bottom:b.bottom-frame.top+2});
    }
    for(const block of blocks)regions=regions.flatMap(r=>subtractSelectionRect(r,block));
    // SDL selection uses integer pixels. Round into the usable area so tiny
    // CSS layout fractions cannot put input across a panel edge.
    return regions.map(r=>({left:Math.ceil(r.left),top:Math.ceil(r.top),right:Math.floor(r.right),bottom:Math.floor(r.bottom)})).filter(r=>r.right-r.left>=8&&r.bottom-r.top>=8).sort((a,b)=>(b.right-b.left)*(b.bottom-b.top)-(a.right-a.left)*(a.bottom-a.top));
  }
  function splitSelectionRect(rect){
    const w=rect.right-rect.left,h=rect.bottom-rect.top;
    if(w>=h&&w>=16||h<16&&w>=16){const x=Math.floor((rect.left+rect.right)/2);return [{...rect,right:x},{...rect,left:x}];}
    if(h>=16){const y=Math.floor((rect.top+rect.bottom)/2);return [{...rect,bottom:y},{...rect,top:y}];}
    return [];
  }
  function truckSelectionSignature(snapshot){
    return JSON.stringify((snapshot.trucks||[]).map(t=>[t.id,t.x,t.y,t.z,t.order,t.action,t.queued]).sort((a,b)=>a[0]-b[0]));
  }
  function selectionCoverage(rects){
    // Rect subtraction can partition the same visible area differently when
    // a distant field control closes. Compare the covered union, not its cuts.
    const ys=Array.from(new Set(rects.flatMap(r=>[r.top,r.bottom]))).sort((a,b)=>a-b),bands=[];
    for(let i=1;i<ys.length;i++){
      const top=ys[i-1],bottom=ys[i],intervals=rects.filter(r=>r.top<=top&&r.bottom>=bottom).map(r=>[r.left,r.right]).sort((a,b)=>a[0]-b[0]),merged=[];
      for(const interval of intervals){const last=merged[merged.length-1];if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else merged.push(interval.slice());}
      if(!merged.length)continue;
      const key=JSON.stringify(merged),last=bands[bands.length-1];
      if(last&&last.bottom===top&&last.key===key)last.bottom=bottom;else bands.push({top,bottom,key});
    }
    return JSON.stringify(bands);
  }
  function truckSelectionRegions(snapshot,field){
    const terrain=window.WarzoneTerrain,rects=[],seen=new Set(),bounds=window.__kalaWarzoneTouch.nativeSelectionBounds();
    const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top,maxWidth=Math.max(96,width*.35),maxHeight=Math.max(96,height*.45),maxArea=width*height*.12;
    // Script positions are whole tiles. Cover the complete tile volume plus
    // the body's raised/tilted selection centre; never click a guessed centre.
    for(const truck of snapshot.trucks||[]){
      if(![truck.x,truck.y,truck.z].every(Number.isFinite))continue;
      const points=[];
      for(const x of [truck.x*128-64,(truck.x+1)*128+64])for(const y of [truck.y*128-64,(truck.y+1)*128+64])for(const z of [truck.z*128-96,(truck.z+1)*128+128]){
        const p=terrain.project(x,y,z);if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))points.push(p);
      }
      if(points.length!==8)continue;
      const projected={left:Math.floor(Math.min(...points.map(p=>p.x)))-3,top:Math.floor(Math.min(...points.map(p=>p.y)))-3,right:Math.ceil(Math.max(...points.map(p=>p.x)))+3,bottom:Math.ceil(Math.max(...points.map(p=>p.y)))+3};
      for(const r of field){
        const hit={left:Math.max(projected.left,r.left),top:Math.max(projected.top,r.top),right:Math.min(projected.right,r.right),bottom:Math.min(projected.bottom,r.bottom)};
        if(hit.right-hit.left<8||hit.bottom-hit.top<8)continue;
        const pending=[hit];
        while(pending.length){
          const candidate=pending.pop(),w=candidate.right-candidate.left,h=candidate.bottom-candidate.top;
          if(w>maxWidth||h>maxHeight||w*h>maxArea){pending.push(...splitSelectionRect(candidate));continue;}
          const key=JSON.stringify(candidate);if(!seen.has(key)){seen.add(key);rects.push({...candidate,field:r});}
        }
      }
    }
    // Nearby workers share one short gesture. A cluster may never grow into
    // the old whole-field strobing rectangle, or cross an HTML/radar occlusion.
    let changed=true;
    while(changed){changed=false;for(let i=0;i<rects.length&&!changed;i++)for(let j=i+1;j<rects.length;j++){
      const a=rects[i],b=rects[j];if(a.field!==b.field||a.right+12<b.left||b.right+12<a.left||a.bottom+12<b.top||b.bottom+12<a.top)continue;
      const joined={left:Math.min(a.left,b.left),top:Math.min(a.top,b.top),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom),field:a.field},w=joined.right-joined.left,h=joined.bottom-joined.top;
      if(w>maxWidth||h>maxHeight||w*h>maxArea)continue;
      rects[i]=joined;rects.splice(j,1);changed=true;break;
    }}
    return rects.map(({field,...rect})=>rect);
  }
  async function awaitNativeClose(closing=state.nativeClosePromise){
    if(!closing)return {ok:true};
    let timer;try{return await Promise.race([closing,new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,reason:'selection-paused'}),2500);})]);}finally{clearTimeout(timer);}
  }
  async function selectionState(timeout=2500){
    let timer,poll;
    const consume=()=>{try{window.__blockNightResearch?.pollOutput?.();}catch(_){}};
    try{
      const reply=send('state',{}, {fresh:true});
      // The existing incremental reader owns its offsets/decoder. During this
      // one pending native reply, consume new lines promptly instead of waiting
      // for the research UI's ordinary 650ms background cadence.
      poll=setInterval(consume,45);consume();
      return await Promise.race([reply,new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,reason:'selection-paused'}),timeout);})]);
    }finally{clearInterval(poll);clearTimeout(timer);}
  }
  async function selectVisibleTrucks(){
    if(window.__towersHtml?.isEnded?.())return [];
    const touch=window.__kalaWarzoneTouch;
    touch?.holdCombatSelection?.('constructors');
    const view=buildSelectionView();
    if(state.selectionPromise){
      if(state.truckSelection?.view===view)return state.selectionPromise;
      const previous=state.selectionPromise;++state.selectionSerial;
      await previous.catch(()=>{});return selectVisibleTrucks();
    }
    state.notice='';const previous=element('wt-command-toast');if(previous)previous.hidden=true;
    const inline=element('wt-sidebar-notice');if(inline)inline.hidden=true;
    const serial=++state.selectionSerial,manual=touch?.report?.().manualSelectionRevision||0;
    state.autoSelectionIntent=manual;
    const active=()=>serial===state.selectionSerial&&view===buildSelectionView()
      &&manual===(touch?.report?.().manualSelectionRevision||0)&&!window.__towersHtml?.isEnded?.();
    const trace={phase:'closing-menu',view,route:'native-visible-constructors',boxes:0,queries:0,wanted:[],selected:[]};state.truckSelection=trace;
    const task=(async()=>{
      const closed=await awaitNativeClose();if(!active())return [];
      if(closed?.ok===false)throw Error('Resume the game, then tap TRUCKS to select your trucks.');
      touch?.releaseAll?.(true);state.nativeBuildGroup=[];
      if(typeof touch?.nativeSelectVisibleTrucks!=='function')throw Error('Native truck selection is unavailable. Reopen the game.');
      trace.phase='native-selection';const started=performance.now();
      const reply=await touch.nativeSelectVisibleTrucks({current:active,timeout:2200});
      if(!active())return [];
      if(reply?.ok!==true||reply.current?.()===false)throw Error('Truck selection did not complete. Tap TRUCKS to try again.');
      const ids=reply.selectedIds;
      if(!Array.isArray(ids)||!ids.every(id=>Number.isInteger(id)&&id>0)||new Set(ids).size!==ids.length)throw Error('Truck selection changed. Tap TRUCKS to select again.');
      trace.wanted=ids.slice();trace.phase='verify-native-ids';
      const remaining=Math.max(1,2800-(performance.now()-started));
      const fresh=await selectionState(remaining);if(!active()||reply.current?.()===false)return [];
      const snapshot=fresh?.result,units=snapshot?.selectedUnits;
      if(!fresh?.ok||!Array.isArray(units)||snapshot.player!==reply.player||units.length!==ids.length
          ||units.some(unit=>unit.constructor!==true||!ids.includes(unit.id))||new Set(units.map(unit=>unit.id)).size!==ids.length)
        throw Error('Truck selection changed. Tap TRUCKS to select again.');
      const selected=selectedBuildGroup(snapshot);
      if(selected.length!==ids.length||selected.some(truck=>!ids.includes(truck.id)))throw Error('Truck selection changed. Tap TRUCKS to select again.');
      state.snapshot=snapshot;state.nativeBuildGroup=ids.slice();state.buildSelectionView=view;
      trace.queries=1;trace.selected=ids.slice();trace.phase=ids.length?'selected':'empty';
      updateHUD();if(!ids.length)notify('No construction trucks are visible. Move the view to your trucks.');
      return selected;
    })().catch(error=>{
      if(active()){state.nativeBuildGroup=[];state.buildSelectionView=view;trace.phase='stopped';trace.reason=error.message;notify(error.message);}
      return [];
    });
    state.selectionPromise=task;
    try{return await task;}finally{
      if(state.selectionPromise===task){state.selectionPromise=null;state.autoSelectionRevision=state.selectionEventSerial;
        if(!state.nativeBuildGroup.length)touch?.resumeCombatSelection?.('constructors');touch?.resumeInput?.();}
      renderSidebar();
    }
  }
  async function openBuild(forceNearby=false){
    install();return selectVisibleTrucks();
  }
  function beginPlacement(itemId){
    const item=availableBuildings().find(b=>b.id===itemId);
    if(!item||state.exitingBuild||state.buildingOpening||window.__towersHtml?.isEnded?.())return;
    cancelLinePlacement();++state.placementGeneration;
    // Selection is local and immediate. Actual terrain taps still go through
    // the existing native validator and ordinary engine construction orders.
    window.WarzoneTerrain?.active(true);
    if(!state.placement){state.session=`build-${Date.now()}-${++state.serial}`;state.buildParticipants=[];}
    state.placement=item;state.nativeItem=itemId;state.nativeToolReady=true;
    // Keep the chosen group in this view, including deliberate manual changes.
    // A different map view needs its own visible group, not the previous area's.
    refreshBuildSelection();
    state.nativeBuildPlaced=false;state.nativeBuildSawWork=false;state.nativeBuildIdleAt=0;
    document.getElementById('wt-build-ghost')?.setAttribute('hidden','');window.WarzoneBuildDisplay?.clearPreview();state.previewPoint=null;
    state.notice='';element('wt-sidebar-notice').hidden=true;const toast=element('wt-command-toast');if(toast)toast.hidden=true;
    state.buildOpen=true;element('wt-build-sidebar').hidden=false;
    renderSidebar();updateHUD();requestState();
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
    if(rewardBuilding(itemId)){
      // Reserve the paid single slot before any truck moves. Legacy Ctrl-clicks
      // must not bypass that reservation.
      const workers=state.nativeBuildGroup.slice();state.siteChecks++;
      send('queue-build',{itemId,x:point.x,y:point.y,session:state.session,workerIds:workers}).then(r=>{
        if(cancellation!==state.cancelSerial)return;
        if(!r.ok){notify(reason(r.reason));return;}
        state.nativeBuildPlaced=true;requestState();
      }).finally(()=>state.siteChecks--);
      return true;
    }
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
    const started=Date.now();let warned=false,lastClock=(campaign?window.__warzoneCampaign?.report?.().snapshot?.gameTime:['ffa','challenge'].includes(window.__warzoneFfaConfig?.mode)?window.__warzoneFfa?.report?.().snapshot?.gameTime:window.__warzoneTowersWaves?.report?.().snapshot?.gameTime),lastAdvance=Date.now();
    while(state.siteChecks||state.nativePendingSites.length||window.__kalaWarzoneTouch?.report().pendingClicks){flushNativeSites();window.__blockNightResearch?.pollOutput?.();const clock=(campaign?window.__warzoneCampaign?.report?.().snapshot?.gameTime:['ffa','challenge'].includes(window.__warzoneFfaConfig?.mode)?window.__warzoneFfa?.report?.().snapshot?.gameTime:window.__warzoneTowersWaves?.report?.().snapshot?.gameTime);if(clock!==lastClock){lastClock=clock;lastAdvance=Date.now();}if(Date.now()-lastAdvance>2500&&!state.nativePendingSites.length){if(state.nativeClosePromise){window.__kalaWarzoneTouch?.releaseAll?.(true);return false;}if(!window.__kalaWarzoneTouch?.report().pendingClicks)return false;}if(!warned&&Date.now()-started>5000){warned=true;notify('Waiting for accepted game input. STOP cancels pending taps.');}await pause(40);}
  }
  function sameDemolitionWorkers(a,b){return a.length===b.length&&a.every(id=>b.includes(id));}
  function writeDemolitionIntent(intent,active){
    const fs=module()?.FS,path=(campaign?'/data/base/script/campaign/mobile/':'/data/mp/multiplay/script/rules/')+'warzone-towers-demolition-intent.json';
    if(!fs)throw Error('The game is not ready for demolition.');
    fs.writeFile(path+'.tmp',JSON.stringify({intent,active}));fs.rename(path+'.tmp',path);
  }
  function demolitionActive(entry=state.demolition){return Boolean(entry&&state.demolition===entry&&entry.token===state.demolitionSerial
    &&entry.battle===(window.__towersHtml?.session||'')&&!window.__towersHtml?.isEnded?.());}
  function updateDemolitionUI(){
    const button=element('wt-demolish'),entry=state.demolition,active=demolitionActive(entry);
    if(button){button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-busy',String(state.demolitionOpening||entry?.busy===true));}
    let bar=element('wt-demolish-bar');
    if(!bar&&active){bar=doc.createElement('aside');bar.id='wt-demolish-bar';bar.setAttribute('aria-label','Demolition targeting');
      bar.innerHTML='<strong>DEMOLISH</strong><span role="status" aria-live="polite"></span><button type="button">CANCEL</button>';
      bar.querySelector('button').addEventListener('click',()=>cancelDemolish());doc.body.appendChild(bar);}
    if(bar){bar.hidden=!active;if(active){const target=entry.targets?.find(t=>t.id===entry.hoverId),copy=entry.busy?'Sending order…':target?(target.protected?'Command Centre · protected':target.name):`Tap a structure · ${entry.workers.length} truck${entry.workers.length===1?'':'s'}`;
      bar.querySelector('button').textContent=entry.busy?'CLOSE':'CANCEL';
      const text=bar.querySelector('span');if(text.textContent!==copy)text.textContent=copy;text.title=copy;}}
  }
  function cancelDemolish(){
    if(state.demolition)try{writeDemolitionIntent(state.demolition.intent,false);}catch(_){}
    ++state.demolitionSerial;state.demolition=null;state.demolitionOpening=false;
    window.WarzoneBuildDisplay?.clearDemolition?.();updateDemolitionUI();return true;
  }
  function demolitionReply(promise){return Promise.race([promise,pause(4000).then(()=>({ok:false,reason:'timeout'}))]);}
  function acceptDemolitionState(entry,reply){
    if(!demolitionActive(entry))return false;
    if(!reply.ok){cancelDemolish();notify(reason(reply.reason));return false;}
    const value=reply.result;
    if(!value||!Array.isArray(value.workerIds)||!sameDemolitionWorkers(entry.workers,value.workerIds)
        ||Number(value.gameTime)<entry.clock){cancelDemolish();notify(reason('selection-changed'));return false;}
    entry.clock=Number(value.gameTime);entry.targets=Array.isArray(value.targets)?value.targets:[];
    window.WarzoneBuildDisplay?.setDemolitionTargets?.(entry.targets,state.catalog,value.blockers||[]);updateDemolitionUI();return true;
  }
  async function toggleDemolish(){
    if(!polishedTowers||window.__towersHtml?.isEnded?.())return false;
    if(state.demolition||state.demolitionOpening){cancelDemolish();return false;}
    install();const token=++state.demolitionSerial,navigation=++state.navigationSerial;
    const intent=window.__kalaWarzoneTouch?.report?.().manualSelectionRevision||0;
    const current=()=>token===state.demolitionSerial&&navigation===state.navigationSerial
      &&intent===(window.__kalaWarzoneTouch?.report?.().manualSelectionRevision||0)&&!window.__towersHtml?.isEnded?.();
    state.demolitionOpening=true;updateDemolitionUI();
    window.__warzoneIntelligence?.close?.();window.WarzoneRewards?.cancelTarget?.();host.TowersStatus?.close?.();
    window.WarzoneMusic?.closeMenu?.(false);window.__blockNightResearch?.close?.();window.__kalaWarzoneTouch?.cancelFacilityNavigation?.();
    try{
      const closed=await selectMode(false,false,true);if(!current())return false;
      if(closed===false)throw Error('Resume the game before choosing DEMOLISH.');
      const reply=await demolitionReply(send('demolish-state',{}, {fresh:true}));if(!current())return false;
      if(!reply.ok)throw Error(reason(reply.reason));
      const workers=reply.result?.workerIds;
      if(!Array.isArray(workers)||!workers.length)throw Error('Select construction trucks first, then choose DEMOLISH.');
      const orderIntent=`demolish-${Date.now()}-${token}`;writeDemolitionIntent(orderIntent,true);
      const entry=state.demolition={token,intent:orderIntent,battle:window.__towersHtml?.session||'',workers:workers.slice(),clock:Number(reply.result.gameTime),targets:[],hoverId:0,busy:false,lastRefresh:Date.now(),refreshing:false};
      state.demolitionOpening=false;acceptDemolitionState(entry,reply);return demolitionActive(entry);
    }catch(error){if(current()){cancelDemolish();notify(error.message||'Demolition could not start.');}return false;}
    finally{if(token===state.demolitionSerial){state.demolitionOpening=false;updateDemolitionUI();}}
  }
  function refreshDemolition(){
    const entry=state.demolition;if(!demolitionActive(entry)||entry.busy||entry.refreshing)return;
    if(window.__warzoneIntelligence?.report?.().open||window.__blockNightResearch?.report?.().open||state.page||state.buildOpen){cancelDemolish();return;}
    entry.refreshing=true;entry.lastRefresh=Date.now();
    demolitionReply(send('demolish-state',{}, {fresh:true})).then(reply=>acceptDemolitionState(entry,reply)).finally(()=>entry.refreshing=false);
  }
  function previewDemolish(x,y){
    const entry=state.demolition;if(!demolitionActive(entry)||entry.busy)return null;
    const target=window.WarzoneBuildDisplay?.pickDemolitionTarget?.(x,y)||null;
    entry.hoverId=target?.id||0;window.WarzoneBuildDisplay?.highlightDemolition?.(entry.hoverId);updateDemolitionUI();return target;
  }
  function demolishAt(x,y){
    const entry=state.demolition;if(!demolitionActive(entry))return false;
    if(entry.busy)return true;
    const target=previewDemolish(x,y);
    if(!target){notify('Tap one of your structures or foundations. Use QUEUE to cancel an unstarted site.');return true;}
    if(!target.eligible){notify(reason(target.statusReason||'friendly-structure'));return true;}
    entry.busy=true;updateDemolitionUI();
    send('demolish',{targetId:target.id,workerIds:entry.workers.slice(),intent:entry.intent,issuedGameTime:entry.clock}).then(reply=>{
      if(!demolitionActive(entry))return;
      if(reply.ok){cancelDemolish();notify(`Demolition ordered · ${target.name}`);requestState();}
      else{entry.busy=false;if(['selection-changed','game-reloaded','cancelled'].includes(reply.reason)){cancelDemolish();notify(reason(reply.reason));}else{notify(reason(reply.reason));refreshDemolition();updateDemolitionUI();}}
    });return true;
  }
  function cancelDemolishForControl(target){
    if(!state.demolition&&!state.demolitionOpening)return false;
    const control=target?.closest?.('button,a,input');
    if(!control||control.closest('#wt-demolish, [data-command="demolish"], #wt-demolish-bar'))return false;
    return cancelDemolish();
  }
  doc.addEventListener('pointerdown',event=>cancelDemolishForControl(event.target),{capture:true,passive:true});
  document.addEventListener('keydown',event=>{
    if(event.key==='F8'||event.code==='F8')cancelDemolish();
    else if(event.key==='Escape'&&state.demolition){event.preventDefault();event.stopImmediatePropagation();cancelDemolish();}
  },{capture:true});
  function selectMode(discard=false,keepSidebar=false,keepDemolition=false,keepCombatOverride=false){
    if(!keepDemolition)cancelDemolish();
    cancelLinePlacement();
    if(discard)++state.cancelSerial;
    if(state.exitPromise){if(discard){state.nativePendingSites=[];window.__kalaWarzoneTouch?.releaseAll?.(true);}return state.exitPromise;}
    state.exitingBuild=true;++state.menuRevision;
    if(state.selectionPromise&&(discard||!state.siteChecks&&!window.__kalaWarzoneTouch?.report().queuedPointerEvents)){++state.selectionSerial;window.__kalaWarzoneTouch?.releaseAll?.(true);}
    state.exitPromise=(async()=>{
      if(discard){state.nativePendingSites=[];window.__kalaWarzoneTouch?.releaseAll?.(true);
        if(state.placement){
          await drainBuildInput();
          const fresh=await selectionState();
          if(fresh.ok)await Promise.all((fresh.result.jobs||[]).filter(j=>j.workers.some(id=>state.nativeBuildGroup.includes(id)||(state.buildParticipants||[]).includes(id))).map(j=>send('cancel-job',{jobId:j.id})));
        }
      }
      else await drainBuildInput();
      await Promise.resolve(state.selectionPromise).catch(()=>{});++state.selectionSerial;
      try{
        state.buildOpen=Boolean(keepSidebar&&state.buildOpen);element('wt-build-sidebar').hidden=!state.buildOpen;cancelPlacement();window.__kalaWarzoneTouch?.releaseAll?.(true);await close();const closed=await awaitNativeClose(closeNative(true));
        host.WarzoneHost?.restoreBattlefield?.();document.getElementById('canvas')?.focus({preventScroll:true});updateHUD();return closed?.ok!==false;
      }finally{renderSidebar();}
    })().finally(()=>{state.exitPromise=null;state.exitingBuild=false;if(!keepSidebar&&!keepDemolition&&!keepCombatOverride)window.__kalaWarzoneTouch?.resumeCombatSelection?.();});return state.exitPromise;
  }
  async function afterBuildExit(action,discard=false){if(campaign&&window.__warzoneCampaign?.nativeUiActive?.()){window.__warzoneCampaign.revealNativeUi();return false;}window.WarzoneRewards?.cancelTarget?.();const navigation=++state.navigationSerial;await selectMode(discard);if(navigation===state.navigationSerial)return action();}
  async function selectNearbyTrucks(){
    window.__kalaWarzoneTouch?.holdCombatSelection?.('constructors');
    const navigation=++state.navigationSerial,closed=await selectMode(false,false,false,true);
    if(polishedTowers&&navigation!==state.navigationSerial)return [];
    if(closed===false){notify('Resume the game, then tap TRUCKS to select your trucks.');return [];}
    try{await selectVisibleTrucks();}catch(error){notify(error.message);}
  }
  function deselectUnits(){
    if(!polishedTowers||window.__towersHtml?.isEnded?.())return Promise.resolve(false);
    if(state.deselectPromise)return state.deselectPromise;
    install();const navigation=++state.navigationSerial;++state.selectionSerial;
    const touch=window.__kalaWarzoneTouch,intent=touch?.report?.().manualSelectionRevision||0;
    touch?.holdCombatSelection?.('manual');
    let selection=null;
    const active=()=>navigation===state.navigationSerial&&!window.__towersHtml?.isEnded?.()
      &&intent===(touch?.report?.().manualSelectionRevision||0)&&(selection===null||selection===state.selectionSerial);
    const waitInput=async()=>{
      const started=Date.now();
      while(touch?.report?.().pendingClicks){
        if(!active())return false;
        if(Date.now()-started>2500)throw Error('Resume the game, then tap DESELECT again.');
        window.__blockNightResearch?.pollOutput?.();await pause(40);
      }
      return active();
    };
    const task=(async()=>{
      const closed=await awaitNativeClose(selectMode(false,false,false,true));if(!active())return false;
      if(closed===false||closed?.ok===false)throw Error('Resume the game, then tap DESELECT again.');
      touch?.releaseAll?.(true);
      if(!await waitInput())return false;
      selection=++state.selectionSerial;
      let reply=await selectionState();if(!active())return false;
      if(!reply.ok)throw Error('Resume the game, then tap DESELECT again.');
      const seen=new Set(),rects=buildSelectionRegions().flatMap(r=>[
        {left:r.left,top:r.top,right:r.left+8,bottom:r.top+8},
        {left:r.right-8,top:r.top,right:r.right,bottom:r.top+8},
        {left:r.left,top:r.bottom-8,right:r.left+8,bottom:r.bottom},
        {left:r.right-8,top:r.bottom-8,right:r.right,bottom:r.bottom}
      ]).filter(r=>{const key=JSON.stringify(r);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
      // A real empty drag clears selection in the engine without a ground
      // click or an order. The native reply must prove it before UI cleanup.
      for(const r of rects){
        if(!reply.result.selectedUnits.length)break;
        if(!active())return false;
        const selected=await awaitNativeClose(touch.nativeBoxSelect(r.left,r.top,r.right,r.bottom,false));
        if(!active())return false;
        if(selected!==true)throw Error('Resume the game, then tap DESELECT again.');
        reply=await selectionState();if(!active())return false;
        if(!reply.ok)throw Error('Resume the game, then tap DESELECT again.');
      }
      if(reply.result.selectedUnits.length)throw Error('Selection could not be cleared. Move the view, then tap DESELECT again.');
      state.snapshot=reply.result;state.nativeBuildGroup=[];state.buildParticipants=[];state.buildSelectionView='';
      state.truckSelectionCache.clear();state.truckSelection=null;
      state.autoSelectionRevision=state.selectionEventSerial;state.autoSelectionIntent=intent;
      state.manualSelectionIntent=intent;state.manualSelectionView='';
      state.notice='';const toast=element('wt-command-toast');if(toast)toast.hidden=true;
      updateHUD();renderSidebar();return true;
    })().catch(error=>{if(active())notify(error.message||'Selection could not be cleared. Tap DESELECT to retry.');return false;});
    state.deselectPromise=task;
    task.finally(()=>{if(state.deselectPromise===task)state.deselectPromise=null;touch?.resumeCombatSelection?.('manual');touch?.resumeInput?.();});
    return task;
  }
  function cancelPlacement(){cancelLinePlacement();++state.placementGeneration;window.WarzoneBuildDisplay?.clearPreview();state.previewPoint=null;if(state.placement){state.nativeToolReady=false;state.nativeItem='';}state.placement=null;window.WarzoneTerrain?.active(false);const ghost=document.getElementById('wt-build-ghost');if(ghost)ghost.setAttribute('hidden','');updateHUD();}
  const LINE_LIMIT=64,LINE_VALIDATIONS=4;
  function rewardBuilding(itemId){const r=state.snapshot?.rewards,slug=r?.nativeItems?.[itemId];return polishedTowers&&Boolean(slug)&&r?.natural?.[slug]!==true;}
  function rewardFortress(itemId){return rewardBuilding(itemId)&&state.catalog?.buildings?.some(item=>item.id===itemId&&item.kind==='FORTRESS');}
  function canLinePlace(){return polishedTowers&&!rewardFortress(state.placement?.id)&&state.placement?.category==='DEFENCES'&&['DEFENSE','WALL','CORNER WALL','WALLCORNER','GATE','FORTRESS'].includes(state.placement.kind);}
  function lineTerrainPoint(x,y){
    const bounds=window.__kalaWarzoneTouch?.nativeSelectionBounds?.();
    if(bounds&&(x<bounds.left||x>=bounds.right||y<bounds.top||y>=bounds.bottom||bounds.radar&&x>=bounds.radar.left&&x<bounds.radar.right&&y>=bounds.radar.top&&y<bounds.radar.bottom))return null;
    const frame=element('warzone-game-frame')?.getBoundingClientRect();
    if(frame&&typeof doc.elementFromPoint==='function'){
      const hit=doc.elementFromPoint(x+frame.left,y+frame.top);if(!hit?.closest?.('#warzone-game-frame'))return null;
    }
    return window.WarzoneTerrain?.pick(x,y)||null;
  }
  function lineActive(line){
    const touch=window.__kalaWarzoneTouch?.report?.()||{};
    return !line.cancelled&&!state.exitingBuild&&!state.page&&!window.__towersHtml?.isEnded?.()
      &&line.generation===state.placementGeneration&&line.nativeGeneration===state.nativeBuildGeneration
      &&line.cancellation===state.cancelSerial&&line.session===state.session&&line.item.id===state.placement?.id
      &&line.selection===state.selectionSerial&&line.intent===(touch.manualSelectionRevision||0)
      &&line.view===buildSelectionView()&&line.workers.length===state.nativeBuildGroup.length
      &&line.workers.every(id=>state.nativeBuildGroup.includes(id));
  }
  function lineTiles(item,start,end){
    // Bresenham follows native map tiles, independent of zoom, heading and
    // terrain height. Footprints use the same origin as the native validator.
    const points=[],width=Math.max(1,Number(item.width)||1),breadth=Math.max(1,Number(item.breadth)||1);
    let x=start.x,y=start.y,dx=Math.abs(end.x-x),dy=-Math.abs(end.y-y),sx=x<end.x?1:-1,sy=y<end.y?1:-1,error=dx+dy,limited=false;
    for(;;){
      if(!points.some(p=>Math.abs(p.x-x)<width&&Math.abs(p.y-y)<breadth)){
        if(points.length===LINE_LIMIT){limited=true;break;}
        points.push({x,y});
      }
      if(x===end.x&&y===end.y)break;
      const twice=2*error;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}
    }
    return {points,limited};
  }
  function lineSummary(line){
    const points=line.points.map(p=>({...p,validation:line.checks.get(p.x+','+p.y)?.validation||'pending'}));
    const valid=points.filter(p=>p.validation==='valid').length,invalid=points.filter(p=>p.validation==='invalid').length;
    return {token:line.token,itemId:line.item.id,start:line.start,end:line.end,points,valid,invalid,pending:points.length-valid-invalid,limited:line.limited,power:valid*Number(line.item.power||0),released:line.released};
  }
  function paintLine(line){
    if(state.linePreviewToken!==line.token||!lineActive(line))return;
    const summary=lineSummary(line);window.WarzoneBuildDisplay?.previewLine?.(line.item,summary.points);updatePlacementLabel(summary);
  }
  function updatePlacementLabel(line){
    const label=element('wt-placement-label');if(!label)return;
    label.textContent=line?`${state.placement?.name||''} · ${line.valid}/${line.points.length} CLEAR · ${powerSymbol} ${Math.round(line.power)}${line.pending?' · CHECKING':''}${line.limited?' · 64 MAX':''}`
      :state.placement?`${state.placement.name} · ${canLinePlace()?'TAP / DRAG TO QUEUE':'TAP TO QUEUE'}`:state.nativeMenu==='build'&&state.nativeToolReady?state.catalog?.buildings.find(b=>b.id===state.nativeItem)?.name||'CONSTRUCTION READY':state.nativeMenu==='build'?'CONSTRUCTION READY':'';
    if(canLinePlace())updateLineGuidance(line);
  }
  function updateLineGuidance(summary){
    const hint=element('wt-module-guidance');if(!hint||!canLinePlace())return;
    const line=state.lineDrafts.get(state.linePreviewToken);summary=summary||(line&&lineActive(line)?lineSummary(line):null);
    const title=summary?`${summary.valid} / ${summary.points.length} clear · COST ${powerSymbol} ${Math.round(summary.power)}`:'Tap one site or drag a line';
    const detail=summary?[summary.pending?`${summary.pending} checking`:summary.released?'Queuing clear sites':'Release to queue clear sites',summary.invalid?`${summary.invalid} blocked`:'',summary.limited?'64 site limit':''].filter(Boolean).join(' · '):'Defences, walls and gates · up to 64 sites';
    const html=`<strong>${title}</strong><small>${detail}</small>`;hint.hidden=false;if(hint._html!==html){hint.innerHTML=html;hint._html=html;}
  }
  let lineValidationTimer;
  function scheduleLineChecks(){if(!lineValidationTimer)lineValidationTimer=setTimeout(()=>{lineValidationTimer=null;pumpLineChecks();},35);}
  function pumpLineChecks(){
    for(const line of state.lineDrafts.values()){
      if(!lineActive(line)){cancelLinePlacement(line.token);continue;}
      for(const point of line.points){
        if(state.lineValidationCount>=LINE_VALIDATIONS)return;
        const check=line.checks.get(point.x+','+point.y);if(!check||check.started)continue;
        check.started=true;state.lineValidationCount++;
        send('preview-build',{itemId:line.item.id,x:point.x,y:point.y,session:line.session,workerIds:line.workers,linePreview:line.token}).then(reply=>{
          check.validation=reply.ok?'valid':'invalid';check.reason=reply.reason;check.done=true;check.resolve(reply);
          paintLine(line);
        }).catch(error=>{check.validation='invalid';check.reason=String(error.message||error);check.done=true;check.resolve({ok:false,reason:check.reason});})
          .finally(()=>{state.lineValidationCount--;scheduleLineChecks();});
      }
    }
  }
  function cancelLinePlacement(token,stopPending=false){
    if(stopPending)++state.stopGeneration;
    const lines=Array.from(new Set(token==null?[...state.lineDrafts.values(),...state.lineSubmissions.values()]:[state.lineDrafts.get(token),state.lineSubmissions.get(token)].filter(Boolean)));
    for(const line of lines){
      if(stopPending)line.stopRequested=true;
      line.cancelled=true;for(const check of line.checks.values())check.resolve({ok:false,reason:'cancelled'});
      state.lineDrafts.delete(line.token);if(state.linePlacement===line)state.linePlacement=null;
      // Preview requests are read-only. Resolve abandoned replies locally so a
      // paused or closed game cannot occupy all preview slots indefinitely.
      for(const [nonce,pending] of state.pending)if(pending.command.action==='preview-build'&&pending.command.linePreview===line.token){state.pending.delete(nonce);pending.resolve({ok:false,reason:'cancelled'});}
      if(state.linePreviewToken===line.token){state.linePreviewToken=0;window.WarzoneBuildDisplay?.clearPreview();state.previewPoint=null;updatePlacementLabel();}
    }
    return lines.length>0;
  }
  function beginLinePlacement(x,y){
    if(!canLinePlace()||state.exitingBuild||state.page||state.selectionPromise||!state.nativeBuildGroup.length||window.__towersHtml?.isEnded?.())return null;
    const point=lineTerrainPoint(x,y);if(!point)return null;
    if(state.linePlacement)cancelLinePlacement(state.linePlacement.token);
    const line={token:++state.lineSerial,item:state.placement,start:{x:point.x,y:point.y},end:{x:point.x,y:point.y},points:[],checks:new Map(),workers:state.nativeBuildGroup.slice(),
      generation:state.placementGeneration,nativeGeneration:state.nativeBuildGeneration,cancellation:state.cancelSerial,selection:state.selectionSerial,
      session:state.session,intent:window.__kalaWarzoneTouch?.report?.().manualSelectionRevision||0,view:buildSelectionView(),released:false,cancelled:false,limited:false};
    state.lineDrafts.set(line.token,line);state.linePlacement=line;state.linePreviewToken=line.token;updateLinePlacement(line.token,x,y);return line.token;
  }
  function updateLinePlacement(token,x,y){
    const line=state.lineDrafts.get(token);if(!line||line.released)return false;
    if(!lineActive(line)){cancelLinePlacement(token);return false;}
    const point=lineTerrainPoint(x,y);if(!point)return false;
    line.end={x:point.x,y:point.y};const tiles=lineTiles(line.item,line.start,line.end);line.points=tiles.points;line.limited=tiles.limited;
    const current=new Set(line.points.map(p=>p.x+','+p.y));
    for(const [key,check] of line.checks)if(!current.has(key)&&(!check.started||check.done)){check.resolve({ok:false,reason:'cancelled'});line.checks.delete(key);}
    for(const key of current)if(!line.checks.has(key)){const check={validation:'pending',started:false,done:false};check.promise=new Promise(resolve=>check.resolve=resolve);line.checks.set(key,check);}
    state.previewPoint=null;paintLine(line);scheduleLineChecks();return true;
  }
  function endLinePlacement(token,x,y){
    const line=state.lineDrafts.get(token);if(!line||!updateLinePlacement(token,x,y)){cancelLinePlacement(token);return false;}
    line.released=true;if(state.linePlacement===line)state.linePlacement=null;paintLine(line);
    // This is the same acceptance order used by individual taps. Only native
    // validated sites enter the ordinary queue-build FIFO with captured IDs.
    state.siteChecks++;const previous=state.buildOrder;
    const task=previous.catch(()=>{}).then(async()=>{
      await Promise.all(line.points.map(p=>line.checks.get(p.x+','+p.y).promise));
      if(!lineActive(line))return;
      const first=line.checks.get(line.start.x+','+line.start.y),valid=line.points.filter(p=>line.checks.get(p.x+','+p.y).validation==='valid');
      if(first?.validation!=='valid'){state.lastLine={...lineSummary(line),accepted:0,rejected:line.points.length,reason:first?.reason||'invalid-site',workerIds:line.workers.slice()};notify(`The line start could not be built. ${reason(first?.reason||'invalid-site')}`);return;}
      const replies=[];state.lineSubmissions.set(token,line);
      // Bound writes as well as previews. STOP invalidates later batches; an
      // order already crossing the bridge is cancelled by its exact job ID if
      // its acknowledgement arrives after STOP, never by reselecting trucks.
      for(let index=0;index<valid.length&&lineActive(line);index+=8){
        const batch=valid.slice(index,index+8);state.placements+=batch.length;
        replies.push(...await Promise.all(batch.map(point=>send('queue-build',{itemId:line.item.id,x:point.x,y:point.y,session:line.session,workerIds:line.workers,linePlacement:token}).then(async reply=>{
          if(reply.ok&&line.stopRequested){await send('cancel-job',{jobId:reply.result.id});return {ok:false,reason:'cancelled'};}
          return reply;
        }))));
      }
      const accepted=replies.filter(r=>r.ok);if(accepted.length){state.nativeBuildPlaced=true;state.buildParticipants=Array.from(new Set([...(state.buildParticipants||[]),...accepted.flatMap(r=>r.result.workers)]));}
      state.lastLine={...lineSummary(line),accepted:accepted.length,rejected:replies.length-accepted.length,skipped:line.points.length-replies.length,workerIds:line.workers.slice()};
      const failure=replies.find(r=>!r.ok);if(!line.cancelled&&failure&&failure.reason!=='cancelled'&&!window.__towersHtml?.isEnded?.())notify(reason(failure.reason));
      else if(!line.cancelled&&valid.length<line.points.length)notify(`${accepted.length} sites queued; ${line.points.length-valid.length} blocked sites skipped.`);
      requestState();updateSidebarQueue();
    }).catch(error=>{if(lineActive(line))notify(error.message||'The defence line could not be queued.');})
      .finally(()=>{state.siteChecks--;cancelLinePlacement(token);state.lineSubmissions.delete(token);});
    state.buildOrder=task;return true;
  }
  function previewAt(x,y){
    if(!state.placement)return null;
    if(state.placement.category==='MODULES'){
      const picked=window.WarzoneBuildDisplay?.pickModuleTarget?.(x,y),target=picked&&moduleTargets().find(t=>t.id===picked.id&&t.moduleId===state.placement.id);
      if(!target){state.previewPoint=null;window.WarzoneBuildDisplay?.clearPreview();return null;}
      const point={x:target.x,y:target.y,parentId:target.id,target};state.previewPoint=point;
      window.WarzoneBuildDisplay?.preview(state.placement,point);return point;
    }
    const point=window.WarzoneTerrain?.pick(x,y);
    if(!point){state.previewPoint=null;window.WarzoneBuildDisplay?.clearPreview();return null;}
    state.previewPoint=point;window.WarzoneBuildDisplay?.preview(state.placement,{...point,validation:'pending'});
    return point;
  }
  function placeAt(x,y,preaccepted=false){
    if(!state.placement||state.exitingBuild&&!preaccepted)return false;
    const point=previewAt(x,y);if(!point){notify(state.placement.category==='MODULES'?'Tap a highlighted matching building to add this module.':'No buildable terrain at this point. Tap the map after the view settles.');return true;}
    if(point.target&&!point.target.eligible){window.WarzoneBuildDisplay?.clearPreview();notify(reason(point.target.statusReason||'module-parent'));requestState();return true;}
    const selection=refreshBuildSelection(),view=buildSelectionView();
    const item=state.placement,session=state.session,assigned=state.nativeBuildGroup.slice(),cancellation=state.cancelSerial,stopGeneration=state.stopGeneration;state.placements++;state.siteChecks++;
    let moduleRequest;
    if(point.parentId){const key=++state.moduleSerial;moduleRequest={key,parentId:point.parentId,itemId:item.id,targetModules:Number(point.target.modules||0)+Number(point.target.reserved||0)+1};state.modulePending.set(key,moduleRequest);updateSidebarQueue();}
    const submission=(polishedTowers?state.buildOrder.catch(()=>{}).then(()=>Promise.resolve(selection)):Promise.resolve(selection)).then(group=>{
      if(cancellation!==state.cancelSerial||polishedTowers&&stopGeneration!==state.stopGeneration||window.__towersHtml?.isEnded?.())return {ok:false,reason:'cancelled'};
      if(view!==buildSelectionView())return {ok:false,reason:'view-changed'};
      const workers=selection?(group||[]).map(t=>t.id):assigned;
      if(!workers.length)return {ok:false,reason:'no-visible-truck'};
      return send('queue-build',{itemId:item.id,x:point.x,y:point.y,...(point.parentId?{parentId:point.parentId}:{}),session,workerIds:workers}).then(async reply=>{
        if(polishedTowers&&reply.ok&&stopGeneration!==state.stopGeneration){await send('cancel-job',{jobId:reply.result.id});return {ok:false,reason:'cancelled'};}
        return reply;
      });
    }).then(r=>{
      if(!r)return;
      if(moduleRequest){if(r.ok){Object.assign(moduleRequest,{jobId:r.result.id,targetModules:r.result.targetModules,gameTime:r.gameTime});reconcileModuleRequests();}else state.modulePending.delete(moduleRequest.key);}
      if(r.ok){state.nativeBuildPlaced=true;state.buildParticipants=Array.from(new Set([...(state.buildParticipants||[]),...r.result.workers]));
        if(state.placement?.id===item.id&&state.session===session){state.notice='';element('wt-sidebar-notice').hidden=true;}
        if(point.parentId&&state.placement?.id===item.id&&state.previewPoint?.parentId===point.parentId){window.WarzoneBuildDisplay?.clearPreview();state.previewPoint=null;const toast=element('wt-command-toast');if(toast)toast.hidden=true;}
      }
      const polygon=document.getElementById('wt-build-ghost')?.querySelector('polygon');
      if(!r.ok){if(polygon){polygon.setAttribute('stroke','#f28777');polygon.setAttribute('fill','#e2605044');}window.WarzoneBuildDisplay?.reject(item.id,point.x,point.y,point.parentId);}
      if(!r.ok&&r.reason!=='cancelled')notify(reason(r.reason));requestState();updateSidebarQueue();
    }).catch(error=>{if(moduleRequest)state.modulePending.delete(moduleRequest.key);if(!window.__towersHtml?.isEnded?.())notify(error.message||'The site could not be queued. Choose the site again.');}).finally(()=>{state.siteChecks--;if(moduleRequest)updateSidebarQueue();});if(polishedTowers)state.buildOrder=submission;return true;
  }
  // The engine WebView keeps a virtual minimum height. Android keyboards can
  // cover the bottom without resizing that layout, so naming uses a separate
  // top-anchored editor, not focus scrolling on the bottom Design strip.
  function positionDesignRename(){
    if(!state.designRename)return;
    const overlay=element('wt-design-rename'),view=host.visualViewport;
    const width=Math.max(1,Math.min(host.innerWidth||doc.documentElement.clientWidth,view?.width||Infinity));
    const height=Math.max(1,Math.min(host.innerHeight||doc.documentElement.clientHeight,view?.height||Infinity));
    overlay.style.setProperty('--wt-rename-left',Math.max(0,Number(view?.offsetLeft)||0)+'px');
    overlay.style.setProperty('--wt-rename-top',Math.max(0,Number(view?.offsetTop)||0)+'px');
    overlay.style.setProperty('--wt-rename-width',width+'px');overlay.style.setProperty('--wt-rename-height',height+'px');
  }
  function openDesignRename(){
    if(!polishedTowers||state.page!=='design'||state.saving.has(state.draft.id))return;
    if(state.designRename){element('wt-design-rename-input')?.focus({preventScroll:true});return;}
    readDraft();
    const overlay=element('wt-design-rename'),input=element('wt-design-rename-input'),panel=element('wt-command-pages');
    if(!overlay||!input)return;
    state.designRename={id:state.draft.id,context:state.designContextSerial,composing:false};
    input.value=state.draft.name;input.removeAttribute('aria-invalid');element('wt-design-rename-error').hidden=true;
    panel.inert=true;panel.classList.add('wt-design-renaming');overlay.hidden=false;
    host.addEventListener('resize',positionDesignRename);host.visualViewport?.addEventListener('resize',positionDesignRename);host.visualViewport?.addEventListener('scroll',positionDesignRename);
    positionDesignRename();window.__kalaWarzoneTouch?.releaseAll?.(true);
    // Synchronous focus from the actual name-button gesture opens Android's IME.
    input.focus({preventScroll:true});input.setSelectionRange(0,input.value.length);
  }
  function finishDesignRename(commit=false,restore=true){
    const edit=state.designRename;if(!edit)return false;
    const overlay=element('wt-design-rename'),input=element('wt-design-rename-input');
    const same=state.page==='design'&&edit.id===state.draft.id&&edit.context===state.designContextSerial;
    if(commit&&same&&!String(input?.value||'').trim()){
      input.setAttribute('aria-invalid','true');const error=element('wt-design-rename-error');error.textContent='Enter a unit name.';error.hidden=false;
      input.focus({preventScroll:true});return false;
    }
    if(commit&&same){state.draft.name=input.value;const field=element('wt-design-name');if(field)field.value=input.value;}
    state.designRename=null;
    host.removeEventListener('resize',positionDesignRename);host.visualViewport?.removeEventListener('resize',positionDesignRename);host.visualViewport?.removeEventListener('scroll',positionDesignRename);
    input?.blur();if(overlay)overlay.hidden=true;
    const panel=element('wt-command-pages');if(panel){panel.inert=false;panel.classList.remove('wt-design-renaming');}
    if(commit&&same)validateDraft();
    if(restore&&same){render();element('wt-design-name-button')?.focus({preventScroll:true});}
    return true;
  }
  let validationTimer;
  function resetDraft(saved){
    finishDesignRename(false,false);
    if(polishedTowers){state.designResetScroll=true;state.designRevealPart=true;}
    state.designStep='body';clearTimeout(validationTimer);++state.validationSerial;state.validation=null;
    let n=1;while(state.saved.some(d=>d.name===`Design ${n}`))n++;
    state.draft=saved?JSON.parse(JSON.stringify(saved)):{id:`design-${Date.now()}-${++state.serial}`,name:`Design ${n}`,body:'',propulsion:'',turrets:['']};state.scroll.design=0;state.confirmNew=false;state.draftOriginal=JSON.stringify(state.draft);
  }
  function syncDesignParts(){
    if(state.page!=='design')return;
    const d=state.draft;
    for(const [id,group,value] of [['wt-design-body','Body',d.body],['wt-design-propulsion','Propulsion',d.propulsion]]){
      const select=element(id);if(!select)continue;
      select.innerHTML=selectOptions(group,value,'Choose component');
      if(value&&!Array.from(select.options).some(o=>o.value===value))select.add(new host.Option(findPart(value)?.name||value,value,true,true));
      select.value=value||'';
    }
    for(const [i,select] of Array.from(element('wt-design-form')?.querySelectorAll('[data-turret]')||[]).entries()){
      const value=d.turrets[i]||'';select.innerHTML=turretOptions(value);
      if(value&&!Array.from(select.options).some(o=>o.value===value))select.add(new host.Option(findPart(value)?.name||value,value,true,true));
      select.value=value;
    }
    // The visible component choices can gain newly researched parts as well.
    const focused=Boolean(state.designRename)||element('wt-design-name')===doc.activeElement;
    if(!focused)render();
    else{
      const active=state.designStep,flying=/vtol|v-tol/i.test(d.propulsion)||findPart(d.propulsion)?.propulsionType==='Lift';
      const parts=active==='body'?availableParts('Body'):active==='propulsion'?availableParts('Propulsion'):['Weapon','Construct','Repair','Sensor','ECM','Brain'].flatMap(availableParts).filter(p=>!d.propulsion||(flying?p.group==='Weapon'&&/vtol/i.test(p.id):p.group!=='Weapon'||!/vtol/i.test(p.id)));
      const grid=element('wt-page-content')?.querySelector('.wt-parts-grid');if(grid)grid.innerHTML=(Number(active)>0?button('EMPTY SLOT',`data-part="" data-slot="${active}"`,'wt-part'):'')+parts.map(p=>componentButton(p,active)).join('');
    }
    validateDraft();
  }
  function readDraft(){
    const d=state.draft;d.name=element('wt-design-name')?.value??d.name;
    // Hidden legacy selectors contain only researched parts. Their empty
    // placeholder must not erase a saved part that is locked in this battle.
    const read=(select,current)=>!select?current:select.value||current||'';
    d.body=read(element('wt-design-body'),d.body);d.propulsion=read(element('wt-design-propulsion'),d.propulsion);
    const selects=element('wt-design-form')?.querySelectorAll('[data-turret]');if(selects)d.turrets=Array.from(selects).map((s,i)=>read(s,d.turrets[i]||''));
  }
  function invalidateCampaignDesign(revalidate=false,contextChanged=false){
    if(!campaign)return;
    clearTimeout(validationTimer);++state.validationSerial;state.validation=null;
    if(contextChanged){++state.designContextSerial;state.saving.clear();}
    if(state.page==='design'){if(revalidate)validateDraft();else designStatus();}
  }
  function designStatus(){
    const r=state.validation,busy=state.saving.has(state.draft.id),label=element('wt-design-valid');
    const campaignLocked=campaign&&state.snapshot?.hasHQ===false;
    if(label)label.textContent=campaignLocked?reason('hq-required'):r?.ok?`POWER ${r.result.cost} · BUILD POINTS ${r.result.points}`:r?reason(r.reason):'Choose components to validate your design.';
    for(const id of ['wt-save-design','wt-save-as-new']){const b=element(id);if(b)b.disabled=!r?.ok||busy||campaignLocked;}
  }
  function payload(d){return {...d,turrets:d.turrets[0]?d.turrets.filter(Boolean):[]};}
  function validateDraft(){
    clearTimeout(validationTimer);state.validation=null;const version=++state.validationSerial,draft=payload(JSON.parse(JSON.stringify(state.draft))),context=state.designContextSerial;designStatus();
    if(campaign&&state.snapshot?.hasHQ===false){state.validation={ok:false,reason:'hq-required'};designStatus();return;}
    if(!draft.name.trim()||!draft.body||!draft.propulsion||!draft.turrets.length)return;
    validationTimer=setTimeout(()=>send('validate-design',{design:draft}).then(r=>{if(version!==state.validationSerial||draft.id!==state.draft.id||campaign&&(context!==state.designContextSerial||state.snapshot?.hasHQ===false))return;state.validation=r;designStatus();}),220);
  }
  function saveDesign(asNew=false){
    readDraft();const sourceId=state.draft.id;if(state.saving.has(sourceId)||!state.validation?.ok||campaign&&state.snapshot?.hasHQ===false)return;
    const draft=payload(JSON.parse(JSON.stringify(state.draft))),version=state.validationSerial,context=state.designContextSerial;
    if(asNew)draft.id=`design-${Date.now()}-${++state.serial}`;
    if(!state.saved.some(d=>d.id===draft.id)&&state.saved.length>=blueprintLimit){notify('The blueprint library is full. Delete a design first.');return;}
    state.saving.add(sourceId);designStatus();
    send('save-design',{design:draft}).then(r=>{
      if(campaign&&context!==state.designContextSerial)return;
      if(!r.ok){notify(reason(r.reason));return;}
      const d={...r.result,id:draft.id};delete d.native;
      if(!persistDesign(d.id,d)){notify('Could not save to this device. Try again.');return;}
      if(version===state.validationSerial&&sourceId===state.draft.id&&state.page==='design'){resetDraft(d);open('saved');}else if(state.page==='saved')render();
    }).finally(()=>{if(campaign&&context!==state.designContextSerial)return;state.saving.delete(sourceId);designStatus();});
  }
  function applySize(value){state.size=Math.max(1,Math.min(1.4,Number(value)||1));doc.documentElement.style.setProperty('--wt-command-scale',state.size);
    try{localStorage.setItem('wt-command-size',String(state.size));}catch(_){} }
  function onInput(event){
    if(event.target.id==='wt-build-search'){const cursor=event.target.selectionStart;state.search=event.target.value;render();const input=element('wt-build-search');input.focus({preventScroll:true});input.setSelectionRange(cursor,cursor);}
    if(event.target.id==='wt-design-name'){readDraft();element('wt-blueprint-name').textContent=state.draft.name||'New design';validateDraft();}
  }
  function onChange(event){
    const target=event.target;
    if(target.tagName==='SELECT'&&target.closest('#wt-design-form')){readDraft();state.draft.turrets=state.draft.turrets.slice(0,Math.min(3,findPart(state.draft.body)?.slots||1));render();validateDraft();}
    if(target.id==='wt-produce-count')state.productionCount=Number(target.value);
    if(target.id==='wt-factory-select'){state.factory=Number(target.value);render();}
    if(target.id==='wt-command-size')applySize(target.value);
  }

  function onClick(event){
    const b=event.target.closest('button');if(!b||b.disabled)return;
    const d=b.dataset;
    if(d.playersTab||d.playersDetail){changePlayersView(d.playersTab,d.playersDetail);return;}
    if(d.playersNative){void navigatePlayers(d.playersNative);return;}
    if(polishedTowers&&state.factoryMenuOpen&&d.action!=='factory-menu')closeFactoryMenu();
    if(polishedTowers&&d.action==='rename-design')openDesignRename();
    else if(d.page)open(d.page);
    else if(d.buildChoice){state.buildChoice=d.buildChoice;render();}
    else if(d.step){readDraft();state.designStep=d.step;if(polishedTowers)state.designRevealPart=true;render();}
    else if(Object.prototype.hasOwnProperty.call(d,'part')){readDraft();if(d.slot==='body'){state.draft.body=d.part;state.draft.turrets=state.draft.turrets.slice(0,Math.min(3,findPart(d.part)?.slots||1));}else if(d.slot==='propulsion')state.draft.propulsion=d.part;else state.draft.turrets[Number(d.slot)]=d.part;state.validation=null;if(polishedTowers)state.designRevealPart=true;render();validateDraft();}
    else if(polishedTowers&&d.openFactory){openFactory(Number(d.openFactory));}
    else if(polishedTowers&&d.factoryFamily){selectFactoryFamily(d.factoryFamily);}
    else if(polishedTowers&&d.factoryRecipeSelect){state.factoryRecipeKey=d.factoryRecipeSelect;render();}
    else if(polishedTowers&&d.productionRepeat){toggleProductionRepeat(b);}
    else if(polishedTowers&&d.productionAll){toggleProductionAll(b);}
    else if(d.factory){state.factory=Number(d.factory);render();}
    else if(d.count){state.productionCount=Number(d.count);render();}
    else if(d.category){if(state.buildOpen)state.scroll['sidebar-'+state.category]=element('wt-sidebar-catalogue').scrollTop;state.category=d.category;render();renderSidebar();}
    else if(d.build)beginPlacement(d.build);
    else if(d.edit){const saved=state.saved.find(s=>s.id===d.edit);if(saved){resetDraft(saved);open('design');validateDraft();}}
    else if(d.delete){state.deletePending=d.delete;if(polishedTowers)state.libraryReveal={id:d.delete,focus:'[data-cancel-delete]'};render();if(!polishedTowers){const c=element('wt-page-content'),b=c?.querySelector('[data-cancel-delete]');if(b)c.scrollTop+=Math.max(0,b.getBoundingClientRect().bottom-c.getBoundingClientRect().bottom);}}
    else if(d.cancelDelete){state.deletePending='';if(polishedTowers)state.libraryReveal={id:d.cancelDelete,focus:'[data-delete]'};render();}
    else if(d.confirmDelete){const index=state.saved.findIndex(s=>s.id===d.confirmDelete);state.deletePending='';if(!persistDesign(d.confirmDelete,null))notify('Could not delete from this device. Your design was kept.');if(polishedTowers)state.libraryReveal={id:state.saved[Math.min(index,state.saved.length-1)]?.id,focus:'[data-delete]'};render();}
    else if(d.produceDesign){state.selected=d.produceDesign;const design=state.saved.find(s=>s.id===d.produceDesign),factories=state.snapshot.factories.filter(f=>f.ready&&designFitsFactory(design,f));if(!factories.some(f=>f.id===state.factory)&&factories.length)state.factory=factories[0].id;open('factory');}
    else if(d.saveTemplate){saveTemplate(d.saveTemplate);}
    else if(d.produce||d.produceTemplate){
      if(polishedTowers)queueProduction(b);
      else {
        const count=Number(element('wt-produce-count')?.value||1),design=state.saved.find(s=>s.id===d.produce);
        send('queue-production',{factoryId:state.factory,count,...(d.produceTemplate?{templateId:d.produceTemplate}:{design})}).then(r=>{if(!r.ok)notify(reason(r.reason));requestState();});
      }
    }
    else if(polishedTowers&&d.stopProduction)stopFactoryProduction(b);
    else if(d.productionCancelFactory)cancelProductionOrder(b);
    else if(polishedTowers&&(d.resumeJobs||d.resumeStructure||d.retryJob))resumeConstruction(b);
    else if(d.cancelJob||d.retryJob)send(d.cancelJob?'cancel-job':'retry-job',{jobId:d.cancelJob||d.retryJob}).then(r=>{if(!r.ok)notify(reason(r.reason));requestState();});
    else if(d.clearProduction||d.retryProduction)send(d.clearProduction?'clear-production':'retry-production',{factoryId:Number(d.clearProduction||d.retryProduction)}).then(r=>{if(!r.ok)notify(reason(r.reason));requestState();});
    else if(d.control){afterBuildExit(()=>window.__kalaWarzoneTouch?.[d.control]?.());}
    else if(polishedTowers&&d.action==='factory-menu'){state.factoryMenuOpen=!state.factoryMenuOpen;render();}
    else if(polishedTowers&&d.action==='factory-queue'){state.factoryQueueOpen=!state.factoryQueueOpen;const factory=state.snapshot.factories.find(f=>f.id===state.factory);if(factory)updateFactoryActivity(factory);}
    else if(d.action==='back')close();
    else if(d.action==='cancel-placement')selectMode();
    else if(d.action==='select-mode')selectMode();
    else if(d.action==='save-design')saveDesign();
    else if(d.action==='save-as-new')saveDesign(true);
    else if(d.action==='new-design'){readDraft();if(JSON.stringify(state.draft)!==state.draftOriginal){state.confirmNew=true;if(polishedTowers)state.designRevealPart=true;open('design');}else{resetDraft();open('design');}}
    else if(d.action==='discard-draft'){resetDraft();render();}
    else if(d.action==='keep-draft'){state.confirmNew=false;if(polishedTowers)state.designRevealPart=true;render();}
    else if(d.action==='native-factory')openNative('factory');
    else if(d.action==='commanders')openNative('commanders');
  }
  function endBattle(){
    cancelPlayersNavigation();clearPlayers();paintPlayersNative(null);
    finishDesignRename(false,false);
    cancelDemolish();
    ++state.selectionSerial;++state.navigationSerial;++state.cancelSerial;++state.menuRevision;
    state.selectionPromise=null;state.truckSelectionCache?.clear();state.modulePending?.clear();state.constructionResuming=null;state.snapshot=null;state.buildOpen=false;state.page='';
    if(campaign)invalidateCampaignDesign(false,true);
    state.nativeMenu='';state.nativeBuildGroup=[];state.buildSelectionView='';state.buildParticipants=[];state.nativePendingSites=[];
    state.buildingOpening=false;state.nativeMenuPending=false;state.nativeClosePromise=null;state.nativeToolReady=false;
    cancelPlacement();
    for(const id of ['wt-command-pages','wt-build-sidebar','wt-native-back','wt-build-busy']){const node=element(id);if(node)node.hidden=true;}
    delete doc.body.dataset.commandPage;
    for(const pending of state.pending.values())pending.resolve({ok:false,reason:'battle-ended'});
    state.pending.clear();state.lastBatch=null;
    state.headerRequest=null;state.productionRequests.clear();state.productionFeedback.clear();state.productionCancellations.clear();state.productionRepeatDrafts.clear();state.productionRepeatRequests.clear();state.productionAllDrafts.clear();state.manufacturingEpoch++;updateHeaderMenus();
  }
  function revealNativePause(){
    finishDesignRename(false,false);
    if(!campaign)return;
    ++state.navigationSerial;++state.cancelSerial;++state.selectionSerial;
    state.page='';state.buildOpen=false;state.nativeHudHidden=false;state.nativeMenu='';state.nativeMenuPending=false;
    invalidateCampaignDesign();
    state.nativeToolReady=false;state.nativePendingSites=[];cancelPlacement();
    for(const id of ['wt-command-pages','wt-build-sidebar','wt-native-back','wt-build-busy']){const node=element(id);if(node)node.hidden=true;}
    delete doc.body.dataset.commandPage;
    for(const pending of state.pending.values())pending.resolve({ok:false,reason:'native-panel'});
    state.pending.clear();if(state.lastBatch)window.__towersHtml?.consume('warzone-towers-command.json',null,state.lastBatch.revision);state.lastBatch=null;
    const frame=element('warzone-game-frame');if(frame)frame.inert=false;
    updateHeaderMenus();
  }
  window.addEventListener('warzone-battle-ended',endBattle);
  window.addEventListener('warzone-build-display-ready',()=>{updateSidebarQueue();const line=state.lineDrafts.get(state.linePreviewToken);if(line)paintLine(line);else if(state.placement&&state.previewPoint)window.WarzoneBuildDisplay.preview(state.placement,state.previewPoint);});
  try {
    blueprintBridge?.importLegacyDesigns?.(localStorage.getItem(blueprintStorageKey) ?? '');
    state.size=Number(localStorage.getItem('wt-command-size'))||1;
  } catch (_) {}
  loadSaved();resetDraft();
  window.__warzoneCommands={tower:true,setSize:applySize,open,toggle,toggleBuild,openFactory,handlePanelBack,productionStatus,recipeThumbnail,close,closeNative,beginPlacement,cancelPlacement,placeAt,previewAt,canLinePlace,beginLinePlacement,updateLinePlacement,endLinePlacement,cancelLinePlacement,send,accept,
    revealNativePause,resetSession:()=>{if(campaign||['ffa','challenge'].includes(window.__warzoneFfaConfig?.mode)){endBattle();state.session='';state.siteNumbers.clear();state.nativeClosePromise=null;state.exitPromise=null;}},
    navigationRevision:()=>state.navigationSerial,
    playersReport:()=>({open:state.page==='players',ready:Boolean(playersState.value),context:playersState.watch?.context||'',viewer:playersState.value?.viewer||null,nativeMenu:playersState.nativeMenu,pending:Boolean(playersState.pending),tab:playersState.tab,detailTab:playersState.detailTab,availableTabs:playersTabs(playersState.value),viewRevision:playersState.viewRevision}),
    hidePreview:()=>{cancelLinePlacement();window.WarzoneBuildDisplay?.clearPreview();window.WarzoneBuildDisplay?.highlightDemolition?.(0);if(state.demolition){state.demolition.hoverId=0;updateDemolitionUI();}state.previewPoint=null;const ghost=document.getElementById('wt-build-ghost');if(ghost)ghost.setAttribute('hidden','');},
    toggleDemolish,cancelDemolish,cancelDemolishForControl,isDemolishing:()=>demolitionActive(),previewDemolish,demolishAt,
    endBattle,isOpen:()=>Boolean(state.page),isPlacement:()=>Boolean(state.placement),nativeMenuOpen:()=>Boolean(state.nativeMenu&&state.nativeMenu!=='build'),nativeClosing:()=>Boolean(state.nativeClosePromise),nativeBuildOpen:()=>Boolean(state.placement)||state.nativeMenu==='build',nativeBuildMenuOpen:()=>state.nativeMenu==='build'&&!state.nativeToolReady,nativeHudHidden:()=>state.nativeHudHidden,nativeBuildTap,nativeBuildMenuTap,queueNativeSite,selectMode,afterBuildExit,selectNearbyTrucks,deselectUnits,openBuild,
    report:()=>({version:77,moduleTargets:moduleTargets(),modulePending:Array.from(state.modulePending.values()),truckSelection:state.truckSelection,selectingTrucks:Boolean(state.selectionPromise),page:state.page,buildOpen:state.buildOpen,nativeHudHidden:state.nativeHudHidden,pendingItem:state.pendingItem,siteChecks:state.siteChecks,pending:state.pending.size,writes:state.writes,acks:state.acks,timeouts:state.timeouts,
      placements:state.placements,rejects:state.rejects,opens:state.opens,closes:state.closes,placement:state.placement?.id,linePlacement:state.lineDrafts.has(state.linePreviewToken)?lineSummary(state.lineDrafts.get(state.linePreviewToken)):null,lineValidations:state.lineValidationCount,lastLine:state.lastLine,
      ...(polishedTowers?{factory:state.factory,factoryRecipeKey:state.factoryRecipeKey,factoryQueueOpen:state.factoryQueueOpen,factoryMenuOpen:state.factoryMenuOpen,productionPending:Array.from(state.productionRequests.values()),productionFeedback:productionFeedbackValue()}:{}),
      demolition:state.demolition?{workerIds:state.demolition.workers.slice(),targetId:state.demolition.hoverId,busy:state.demolition.busy,targetCount:state.demolition.targets.length}:null,demolitionOpening:state.demolitionOpening,
      session:state.session,nativeMenu:state.nativeMenu,nativeClosing:Boolean(state.nativeClosePromise),placement:state.placement?.id||'',nativeItem:state.nativeItem,nativeBuildGroup:state.nativeBuildGroup,buildParticipants:state.buildParticipants,nativeToolReady:state.nativeToolReady,nativePendingSites:state.nativePendingSites.length,exitingBuild:state.exitingBuild,nativeBuildPlaced:state.nativeBuildPlaced,nativeBuildSawWork:state.nativeBuildSawWork,buildingOpening:state.buildingOpening,saved:state.saved,history:state.history,snapshot:state.snapshot,terrain:window.WarzoneTerrain?.report()})};
  fetch('/warzone/command-catalog.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(c=>{state.catalog=c;render();}).catch(()=>{state.catalogError=true;if(state.page&&state.page!=='players')render();});
  window.addEventListener('pagehide',()=>{playersState.disposed=true;cancelPlayersNavigation();clearPlayers();playersState.pointers.clear();if(playersState.panel){for(const type of ['pointerdown','pointerup','pointercancel'])playersState.panel.removeEventListener(type,playersPointer,true);for(const type of ['keydown','keyup'])playersState.panel.removeEventListener(type,playersKeyboard,true);}playersState.panel=null;paintPlayersNative(null);});
  setInterval(()=>{
    pollPlayers();
    if(window.__towersHtml?.isEnded?.())return;
    if(campaign&&window.__warzoneCampaign?.nativeUiActive?.())return;
    if(state.demolition&&Date.now()-state.demolition.lastRefresh>1500)refreshDemolition();
    if(state.page!=='players'&&!state.snapshot&&window.__kalaWarzoneTouch?.report().hudVisible)install();
    if(state.page!=='players'&&!state.pendingItem&&!state.buildingOpening&&window.__kalaWarzoneTouch?.report().hudVisible&&Date.now()-state.lastPoll>(state.placement||state.nativeMenu==='build'||state.snapshot?.jobs?.length?250:state.page?1600:1200))requestState();
    if(state.pending.size){window.__blockNightResearch?.pollOutput?.();if(Date.now()-state.lastWrite>1500)flush(true);
      for(const p of state.pending.values())if(!p.warned&&Date.now()-p.at>12000){p.warned=true;state.timeouts++;if(p.command.action!=='state')notify(reason('timeout'));}}
  },150);
})();
