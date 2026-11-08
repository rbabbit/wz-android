/* Tower command pages: native-validated orders; app-private design library. */
(() => {
  'use strict';
  if (window.__warzoneCommands) return;
  const host = window.parent?.WarzoneHost ? window.parent : window;
  const doc = host.document;
  const polishedTowers = window.__warzoneDuelConfig?.mode !== 'duel';
  const PATH = '/data/mp/multiplay/script/rules/warzone-towers-command.json';
  const state = {page:'',catalog:null,snapshot:null,pending:new Map(),serial:0,writes:0,acks:0,
    timeouts:0,lastWrite:0,lastPoll:0,nativeMenu:'',history:[],placement:null,session:'',category:'DEFENCES',search:'',buildChoice:'',buildOpen:false,siteChecks:0,cancelSerial:0,nativeHudHidden:false,pendingItem:'',designStep:'body',designSearch:'',nativeItem:'',
    selected:'',deletePending:'',confirmNew:false,draftOriginal:'',saved:[],draft:{id:'',name:'',body:'',propulsion:'',turrets:['']},validation:null,
    validationSerial:0,saving:new Set(),factory:0,productionCount:1,menuRevision:0,nativeMenuPending:false,nativeClosePromise:null,
    navigationSerial:0,nativeBuildGeneration:0,nativeToolReady:false,nativeToolSelectionAt:0,nativePendingSites:[],exitPromise:null,exitingBuild:false,nativeBuildGroup:[],buildSelectionView:'',nativeBuildPlaced:false,nativeBuildSawWork:false,nativeBuildIdleAt:0,buildingOpening:false,selectionPromise:null,selectionSerial:0,selectionEventSerial:0,autoSelectionRevision:0,autoSelectionIntent:0,manualSelectionIntent:0,manualSelectionView:'',buildParticipants:[],siteNumbers:new Map(),truckSelectionCache:new Map(),modulePending:new Map(),moduleSerial:0,previewPoint:null,notice:'',size:1,opens:0,closes:0,placements:0,rejects:0,scroll:{}};
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element = id => doc.getElementById(id);
  const module = () => window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
  const reason = code => ({'invalid-site':'This tile is blocked. Choose an open, level site.',
    occupied:'A completed structure already occupies this site.','already-queued':'A build is already queued here.',
    unavailable:'This structure is not available yet.',unreachable:'No assigned truck can reach that site.',
    'no-visible-truck':'No construction truck is selected. Tap TRUCKS with your trucks in view.','view-changed':'The view changed while selecting trucks. Tap the site again.','no-truck':'You need a construction truck.','queue-full':'The queue is full.',
    'structure-limit':'The structure limit has been reached.','module-parent':'Place this module on a completed matching building.',
    'module-limit':'This building is fully upgraded.', 'module-pending':'An upgrade is already queued or in progress on this building.', 'builder-lost':'The assigned truck was destroyed. Choose Retry to assign another.',
    'build-blocked':'The truck could not finish this site. Clear the obstruction, then Retry.',
    'hq-required':'A completed Command Centre is required to design units.',
    'components-unavailable':'Some components are not researched yet.',
    'incomplete-design':'Choose a name, body, propulsion and weapon or system.',
    'incompatible-design':'These components are incompatible. Try another combination.',
    'factory-incompatible':'This factory cannot produce the design. Check factory type and modules.',
    'factory-missing':'Build and complete a factory first.',timeout:'No reply yet. Your command is kept; Retry uses the same order.',
    'engine-rejected':'Warzone rejected this command. Your other queued orders were kept.'}[code] || String(code||''));

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
    if(reply.action==='build-ready'){if(state.nativeMenu==='build'&&reply.generation===state.nativeBuildGeneration&&state.nativeToolSelectionAt){state.nativeToolReady=true;flushNativeSites();}return;}
    if(reply.action==='selection'&&state.snapshot){state.selectionEventSerial++;state.snapshot.selectedUnits=reply.result;const ids=new Set(reply.result.map(u=>u.id));state.snapshot.trucks.forEach(t=>t.selected=ids.has(t.id));syncBuildGroup();updateHUD();return;}
    const pending=state.pending.get(reply.nonce);if(!pending)return;
    state.pending.delete(reply.nonce);state.acks++;
    if(state.lastBatch&&state.lastBatch.nonces.every(n=>!state.pending.has(n))){window.__towersHtml?.consume('warzone-towers-command.json',null,state.lastBatch.revision);state.lastBatch=null;}
    if(!['state','preview-build','validate-design'].includes(reply.action)){state.history.push(reply);state.history=state.history.slice(-100);}
    if(reply.action==='state'&&reply.ok){const before=state.snapshot;
      if(before&&reply.result.gameTime<before.gameTime){state.siteNumbers.clear();state.truckSelectionCache?.clear();state.modulePending?.clear();state.buildSelectionView='';window.WarzoneBuildDisplay?.reset();cancelPlacement();state.nativeToolReady=false;state.nativeItem='';renderSidebar();}
      const changed=before&&(before.buildings.map(b=>b.id).join()!==reply.result.buildings.map(b=>b.id).join()||before.parts.join()!==reply.result.parts.join()||JSON.stringify(before.factories.map(f=>[f.id,f.ready,f.modules,f.templates]))!==JSON.stringify(reply.result.factories.map(f=>[f.id,f.ready,f.modules,f.templates]))||JSON.stringify(before.templates)!==JSON.stringify(reply.result.templates));
      state.snapshot=reply.result;reconcileModuleRequests();window.__blockNightResearch?.acceptQueues?.(reply.result.researchQueues,reply.result.gameTime,Boolean(before&&reply.result.gameTime<before.gameTime));if(before&&before.parts.join()!==reply.result.parts.join())syncDesignParts();updateHUD();refreshLive();if(changed&&['build','saved','factory'].includes(state.page))render();if(changed&&state.buildOpen)renderSidebar();}
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
    panel.setAttribute('aria-label','Tower command centre');
    panel.innerHTML=`<header class="wt-command-title"><div><span class="wt-eyebrow">WARZONE TOWERS / COMMAND CENTRE</span><h1 id="wt-page-title">BUILD</h1><span id="wt-command-resources"></span></div>
      <nav id="wt-command-tabs" aria-label="Command pages">${['build','design','saved','factory','queue'].map(p=>button(p==='saved'?'BLUEPRINTS':p.toUpperCase(),`data-page="${p}"`)).join('')}</nav>${button(polishedTowers?'BACK TO BATTLE':'BATTLE ↗','data-action="back"','wt-primary')}</header>
      <div id="wt-command-notice" role="status" aria-live="polite"></div><div id="wt-page-content"></div>`;
    doc.body.appendChild(panel);const busy=doc.createElement('canvas');busy.id='wt-build-busy';busy.hidden=true;busy.setAttribute('aria-hidden','true');doc.body.appendChild(busy);
    panel.addEventListener('click',onClick);panel.addEventListener('input',onInput);panel.addEventListener('change',onChange);
    panel.addEventListener('submit',event=>event.preventDefault());
    const hud=doc.createElement('div');hud.id='wt-build-status';hud.hidden=true;
    hud.innerHTML=`<span id="wt-power">POWER —</span>${button('SELECTION','data-action="select-mode" id="wt-field-status"')}<span id="wt-placement-label"></span><span id="wt-builder-summary"></span>${button('CHANGE','data-page="build"')}${button('DONE','data-action="cancel-placement"')}`;
    hud.addEventListener('click',onClick);doc.body.appendChild(hud);
    const sidebar=doc.createElement('section');sidebar.id='wt-build-sidebar';sidebar.hidden=true;sidebar.setAttribute('aria-label','Construction');
    sidebar.innerHTML=`<header><span id="wt-sidebar-power"></span><span id="wt-sidebar-builders"></span><span class="wt-sidebar-spinner" aria-hidden="true"></span>${polishedTowers?button('<img src="/warzone/ui/icons/x.svg" alt="">','data-action="select-mode" aria-label="Close Build panel and keep orders"','wt-sidebar-collapse'):''}</header><nav aria-label="Structure category">${[['DEFENCES','DEFENCE'],['STRUCTURES','BASE'],['MODULES','MODULES'],['ALL','ALL']].map(([id,label])=>button(label,`data-category="${id}"`)).join('')}</nav><div id="wt-module-guidance" role="status" aria-live="polite" hidden></div><div id="wt-sidebar-notice" role="status" hidden></div><div id="wt-catalogue-wrap"><div id="wt-sidebar-catalogue" tabindex="0" aria-label="Available structures; scroll for more"></div><span id="wt-catalogue-track" aria-hidden="true"><i></i></span></div><section id="wt-sidebar-queue" aria-label="Live construction queue"></section>${button('EXIT · KEEP ORDERS','data-action="select-mode"','wt-sidebar-exit')}`;
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
    doc.addEventListener('keydown',e=>{if(e.key==='Escape'){if(state.page)close();else if(state.placement)cancelPlacement();else if(state.nativeMenu)closeNative();}});
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
  function open(page='build'){
    if(page==='build'){openSidebar();return;}
    const previousContent=element('wt-page-content');rememberPanelScroll(previousContent);if(previousContent)delete previousContent.dataset.labScrollKey;
    state.buildOpen=false;if(element('wt-build-sidebar'))element('wt-build-sidebar').hidden=true;
    host.WarzoneHost?.resetScroll?.();install();const navigation=++state.navigationSerial;if(state.nativeMenu==='build'||window.__kalaWarzoneTouch?.report().pendingClicks){selectMode().then(()=>{if(navigation===state.navigationSerial)open(page);});return;}window.__blockNightResearch?.close?.();
    const help=element('warzone-towers-help-overlay');
    if(help&&!help.hidden)help.querySelector('.wt-help-back')?.click();
    if(state.nativeMenu||state.nativeMenuPending)closeNative();
    if(page==='stats'||page==='commanders'){openNative(page);return;}
    if(state.page)state.scroll[state.page]=element('wt-page-content')?.scrollTop||0;
    if(state.page!==page){state.notice='';state.deletePending='';}
    state.page=page;if(polishedTowers&&page==='factory')state.revealFactory=true;state.opens++;element('wt-command-pages').hidden=false;
    doc.body.dataset.commandPage=page;const toast=element('wt-command-toast');if(toast){clearTimeout(toast._timer);toast.hidden=true;}
    window.__warzoneCommands?.hidePreview?.();
    const frame=element('warzone-game-frame');if(frame)frame.inert=true;
    window.__kalaWarzoneTouch?.releaseAll?.(true);render();element('wt-page-content').scrollTop=state.confirmNew&&page==='design'?0:state.scroll[page]||0;requestState();
    if(page==='design'&&!state.validation)validateDraft();
    if(page==='factory'&&state.selected){const content=element('wt-page-content'),card=content.querySelector('[data-selected-design="true"]');if(card){const scroller=card.closest('.wt-work-list')||content,r=card.getBoundingClientRect(),v=scroller.getBoundingClientRect();if(r.top<v.top)scroller.scrollTop+=r.top-v.top;else if(r.bottom>v.bottom)scroller.scrollTop+=r.bottom-v.bottom;}}
  }
  function close(){
    if(!state.page)return Promise.resolve();
    const previousContent=element('wt-page-content');rememberPanelScroll(previousContent);if(previousContent)delete previousContent.dataset.labScrollKey;
    state.scroll[state.page]=element('wt-page-content')?.scrollTop||0;
    state.page='';state.closes++;element('wt-command-pages').hidden=true;
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
    if(window.__towersHtml?.isEnded?.())return;
    install();if(state.buildingOpening||state.sidebarOpening)return;
    state.sidebarOpening=true;const navigation=++state.navigationSerial;
    try{
      window.__blockNightResearch?.close?.();
      const help=element('warzone-towers-help-overlay');if(help&&!help.hidden)help.querySelector('.wt-help-back')?.click();
      if(state.page)await close();
      if(navigation!==state.navigationSerial)return;
      // The catalogue stays immediate, while selection waits for the original
      // STATS/COMMANDERS panel to acknowledge its ordered native close.
      if(state.nativeMenu||state.nativeMenuPending)closeNative(true);
      state.buildOpen=true;window.dispatchEvent(new Event('warzone-build-sidebar-open'));element('wt-build-sidebar').hidden=false;renderSidebar();
      // Opening the catalogue must not disable its first item tap while an
      // unseen truck picker runs. The chosen item owns that native setup.
      selectVisibleTrucks().catch(error=>notify(error.message));
      if(navigation===state.navigationSerial){renderSidebar();updateHUD();}
    }catch(error){await closeNative(true);notify(error.message);}finally{state.sidebarOpening=false;}
  }
  function siteStatus(site){return ({building:'BUILDING',queued:'QUEUED',travelling:'TRUCKS EN ROUTE','waiting-trucks':'WAITING FOR TRUCKS','waiting-power':'WAITING FOR POWER',done:'COMPLETE',interrupted:'ORDERS ENDED'})[site.status]||'PLANNED';}
  function remainingTime(seconds){return seconds==null?'':`~${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} LEFT`;}
  function constructionRows(){
    const s=state.snapshot;if(!s)return [];
    const sites=(s.constructionSites||[]).filter(j=>j.status!=='interrupted').map(j=>({...j,name:state.catalog?.buildings.find(b=>b.id===j.itemId)?.name||'Structure'}));
    for(const job of s.jobs||[]){
      if(sites.some(j=>j.id===job.id))continue;
      const live=(s.construction||[]).find(b=>b.itemId===job.itemId&&b.x===job.x&&b.y===job.y);
      sites.push({...job,...live,id:job.id,structureId:live?.id,name:state.catalog?.buildings.find(b=>b.id===job.itemId)?.name||'Structure',status:live?.status||(job.status==='working'?'travelling':job.status)});
    }
    for(const b of s.construction||[])if(!sites.some(j=>j.structureId===b.id))sites.push({...b});
    for(const done of s.finishedBuilds||[])if(!sites.some(j=>j.id===done.id))sites.push({...done,status:'done',name:state.catalog?.buildings.find(b=>b.id===done.itemId)?.name||'Structure'});
    const chronological=j=>String(j.id).match(/^cmd-(\d+)-/)?.[1]||'z'+j.id;
    for(const j of sites.slice().sort((a,b)=>chronological(a).localeCompare(chronological(b),undefined,{numeric:true})))if(!state.siteNumbers.has(j.id))state.siteNumbers.set(j.id,state.siteNumbers.size+1);
    for(const j of sites)j.number=state.siteNumbers.get(j.id);
    const rank={building:0,'waiting-power':1,'waiting-trucks':2,travelling:3,queued:4,done:5};
    return sites.sort((a,b)=>(rank[a.status]??4)-(rank[b.status]??4));
  }
  function constructionRow(j){return `<article class="wt-site-row" data-site-id="${esc(j.id)}" data-site-number="${j.number}" data-site-status="${esc(j.status)}"><span class="wt-site-number">#${j.number}</span><div><strong>${esc(j.name)}</strong><small>AT ${j.x},${j.y} · ${siteStatus(j)}${j.status!=='done'&&j.remaining!=null?' · '+remainingTime(j.remaining):''}</small>${j.progress!=null&&j.status!=='done'?`<progress max="1" value="${j.progress}" aria-label="Approximate construction progress"></progress>`:''}</div></article>`;}
  function renderSidebar(){
    const sidebar=element('wt-build-sidebar');if(!sidebar||!state.buildOpen)return;
    const items=availableBuildings().filter(b=>state.category==='ALL'||b.category===state.category),grid=element('wt-sidebar-catalogue');
    const active=state.placement?.id||(state.nativeToolReady&&state.nativeMenu==='build'?state.nativeItem:''),busy=Boolean(state.buildingOpening||state.pendingItem);
    sidebar.setAttribute('aria-busy',String(busy));
    // Keep cards/images/focus/scroll alive while the native picker changes.
    // Only a different catalogue needs new nodes, not busy/selection replies.
    const signature=JSON.stringify([state.category,items.map(b=>[b.id,b.name,b.image])]);
    if(grid.dataset.signature!==signature){const scroll=grid.dataset.category===state.category?grid.scrollTop:state.scroll['sidebar-'+state.category]||0;grid.innerHTML=items.map(b=>button(`${b.image?image(b):`<span class="wt-native-art-label">${b.width} × ${b.breadth}<small>FOOTPRINT</small></span>`}<strong>${esc(b.name)}</strong><small>⚡ ${Math.round(b.power)}</small>`,`data-build="${esc(b.id)}" aria-pressed="${active===b.id}" ${busy?'disabled':''}`,`${active===b.id?'active ':''}${state.pendingItem===b.id?'loading':''}`)).join('')||'<p class="wt-empty">No available structures. Unlock more in TECH.</p>';grid.dataset.signature=signature;grid.dataset.category=state.category;grid.scrollTop=scroll;}
    for(const b of grid.querySelectorAll('[data-build]')){const chosen=b.dataset.build===active;b.classList.toggle('active',chosen);b.classList.toggle('loading',b.dataset.build===state.pendingItem);b.setAttribute('aria-pressed',String(chosen));b.disabled=busy;const item=items.find(i=>i.id===b.dataset.build),cost=b.querySelector(':scope > small');if(cost&&item)cost.textContent=`⚡ ${Math.round(item.power)}`;}
    for(const b of sidebar.querySelectorAll('[data-category]')){b.classList.toggle('active',b.dataset.category===state.category);b.setAttribute('aria-pressed',String(b.dataset.category===state.category));}
    updateSidebarQueue();fitCatalogueRows();updateCatalogueScroll();
  }
  function fitCatalogueRows(){
    const wrap=element('wt-catalogue-wrap'),grid=element('wt-sidebar-catalogue');if(!wrap?.clientHeight||!grid?.children.length)return;
    const css=host.getComputedStyle(grid),gap=parseFloat(css.rowGap)||5,padding=parseFloat(css.paddingTop)+parseFloat(css.paddingBottom);
    const title=Math.max(23,...Array.from(grid.querySelectorAll('strong')).map(e=>e.scrollHeight));
    const available=wrap.getBoundingClientRect().height;
    if(polishedTowers){
      const height=wrap.clientHeight,minimum=Math.max(50*state.size,title+12,42*state.size+10),count=Math.max(1,Math.floor((height-padding+gap)/(minimum+gap)));
      const row=Math.min(minimum+8,Math.floor((height-padding-gap*(count-1))/count*100)/100);
      grid.style.setProperty('--wt-catalogue-row',Math.max(minimum,row)+'px');grid.style.setProperty('--wt-build-art',Math.min(44*state.size,Math.max(32,row-10))+'px');return;
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
    element('wt-sidebar-power').textContent=s?`⚡ ${Math.floor(s.power)}`:'';
    element('wt-sidebar-builders').textContent=`${selected.length} TRUCK${selected.length===1?'':'S'}`;
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
  function requestState(){if(!Array.from(state.pending.values()).some(p=>p.command.action==='state'))send('state');state.lastPoll=Date.now();}
  // The Lab columns scroll independently. Keep their positions across live
  // state renders, component tabs and facility/page returns.
  const panelScrollers='.wt-workspace > .wt-rail,.wt-workspace > .wt-work-list,.wt-workspace > .wt-detail';
  function rememberPanelScroll(content){
    const key=content?.dataset.labScrollKey;if(!key)return;
    state.scroll['panels:'+key]=Array.from(content.querySelectorAll(panelScrollers),e=>e.scrollTop);
    if(polishedTowers)for(const strip of content.querySelectorAll('[data-factory-strip]'))state.scroll['factory-strip:'+strip.dataset.factoryStrip]=strip.scrollLeft;
  }
  function render(){
    if(!state.page)return;
    element('wt-page-title').textContent=({build:'BUILD',design:'DESIGN',saved:'BLUEPRINTS',factory:'FACTORY',queue:'ORDERS'})[state.page]||'BUILD';
    for(const tab of element('wt-command-tabs').querySelectorAll('button')){tab.classList.toggle('active',tab.dataset.page===state.page);tab.setAttribute('aria-current',tab.dataset.page===state.page?'page':'false');}
    const content=element('wt-page-content');
    if(!state.snapshot||!state.catalog){content.innerHTML='<p class="wt-empty">Connecting to the battlefield…</p>';return;}
    const pages={build:renderBuild,design:renderDesign,saved:renderSaved,factory:renderFactory,queue:renderQueue,more:renderMore};
    const scroll=content.scrollTop;rememberPanelScroll(content);content.innerHTML=(pages[state.page]||renderBuild)();content.scrollTop=scroll;
    const scrollKey=state.page+(state.page==='factory'?':'+state.factory:state.page==='design'?':'+state.designStep:'');
    content.dataset.labScrollKey=scrollKey;
    const offsets=state.scroll['panels:'+scrollKey]||[];
    Array.from(content.querySelectorAll(panelScrollers)).forEach((e,i)=>{e.scrollTop=offsets[i]||0;});
    if(polishedTowers&&state.page==='factory'){
      for(const strip of content.querySelectorAll('[data-factory-strip]'))strip.scrollLeft=state.scroll['factory-strip:'+strip.dataset.factoryStrip]||0;
      if(state.revealFactory){const selected=content.querySelector('[data-factory="'+state.factory+'"]'),strip=selected?.closest('[data-factory-strip]');if(strip){const item=selected.getBoundingClientRect(),view=strip.getBoundingClientRect();if(item.left<view.left)strip.scrollLeft-=view.left-item.left;else if(item.right>view.right)strip.scrollLeft+=item.right-view.right;}state.revealFactory=false;}
    }
    element('wt-command-notice').textContent=state.notice;
  }
  function renderBuild(){
    const items=availableBuildings().filter(b=>(state.category==='ALL'||b.category===state.category)&&b.name.toLowerCase().includes(state.search.toLowerCase()));
    if(!items.some(b=>b.id===state.buildChoice))state.buildChoice=items[0]?.id||'';
    const chosen=items.find(b=>b.id===state.buildChoice);
    return `<div class="wt-workspace"><aside class="wt-rail"><h2>CONSTRUCTION</h2>${['DEFENCES','STRUCTURES','MODULES','ALL'].map(c=>button(c,`data-category="${c}"`,state.category===c?'active':'')).join('')}<div class="wt-rail-note"><b>${state.snapshot.trucks.length} CONSTRUCTORS</b><p>Nearby trucks work together.<br>Every placed site queues.</p></div>${button('VIEW QUEUE','data-page="queue"')}</aside><section class="wt-work-list"><div class="wt-list-heading"><h2>AVAILABLE STRUCTURES <small>${items.length}</small></h2><input id="wt-build-search" type="search" placeholder="Find structure" aria-label="Find a structure" value="${esc(state.search)}"></div><div class="wt-card-grid" id="wt-build-grid">${buildCards(items)}</div></section><aside class="wt-detail">${chosen?`${image(chosen)}<span class="wt-eyebrow">${esc(chosen.category)}</span><h2>${esc(chosen.name)}</h2><dl><div><dt>POWER</dt><dd>${Math.round(chosen.power)}</dd></div><div><dt>FOOTPRINT</dt><dd>${chosen.width} × ${chosen.breadth}</dd></div><div><dt>ORDERS</dt><dd>QUEUED</dd></div></dl><p>Place on clear terrain. Green Warzone blueprints show the queued sites.</p>${button('PLACE STRUCTURE →',`data-build="${esc(chosen.id)}"`,'wt-primary wt-detail-action')}`:'<p>No structures in this category. Research more in TECH.</p>'}</aside></div>`;
  }
  function buildCards(items){return items.map(b=>`<article class="wt-command-card wt-build-card ${b.id===state.buildChoice?'selected':''}"><button class="wt-card-select" data-build-choice="${esc(b.id)}" aria-pressed="${b.id===state.buildChoice}">${image(b)}<div><h2>${esc(b.name)}</h2><p>${b.width} × ${b.breadth} <span>⚡ ${Math.round(b.power)}</span></p></div><span class="wt-chevron">›</span></button></article>`).join('')||'<p class="wt-empty">No matching structures. Choose another category or search.</p>';}

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
    return `${state.confirmNew?`<div class="wt-draft-confirm"><span>Discard unsaved changes and start a new design?</span>${button('DISCARD CHANGES','data-action="discard-draft"')}${button('KEEP EDITING','data-action="keep-draft"','wt-primary')}</div>`:''}<div class="wt-workspace wt-design-workspace"><aside class="wt-rail"><h2>ASSEMBLE UNIT</h2>${steps.map(([key,n,label,id])=>button(`<span class="wt-step-number">${n}</span><span>${label}<small>${esc(findPart(id)?.name||'Choose component')}</small></span>`,`data-step="${key}"`,active===key?'wt-step active':'wt-step')).join('')}<div class="wt-rail-note">${state.snapshot.hasHQ?'Choose components, then save your blueprint.':'Complete a Command Centre to save designs.'}</div>${button('NEW DESIGN','data-action="new-design"')}</aside><section class="wt-work-list"><div class="wt-list-heading"><h2>${esc(steps.find(a=>a[0]===active)?.[2]||'COMPONENTS')} <small>${parts.length} AVAILABLE</small></h2></div><div class="wt-parts-grid">${Number(active)>0?button('EMPTY SLOT',`data-part="" data-slot="${active}"`,'wt-part'):''}${parts.map(p=>componentButton(p,active)).join('')||'<p class="wt-empty">Research components in TECH to unlock more choices.</p>'}</div></section><aside class="wt-detail wt-design-summary"><span class="wt-eyebrow">${editing?'EDIT BLUEPRINT':'NEW BLUEPRINT'}</span><form id="wt-design-form"><label for="wt-design-name">UNIT NAME</label><input id="wt-design-name" maxlength="48" value="${esc(d.name)}" placeholder="Name your unit"><select id="wt-design-body" hidden tabindex="-1">${selectOptions('Body',d.body,'Choose body')}</select><select id="wt-design-propulsion" hidden tabindex="-1">${selectOptions('Propulsion',d.propulsion,'Choose propulsion')}</select>${Array.from({length:slots},(_,i)=>`<select hidden tabindex="-1" data-turret="${i}">${turretOptions(d.turrets[i]||'')}</select>`).join('')}</form>${unitParts(d)}<h2 id="wt-blueprint-name">${esc(d.name||'New design')}</h2><div class="wt-configuration">${steps.map(([key,n,label,id])=>`<div><span>${label}</span><b>${esc(findPart(id)?.name||'—')}</b></div>`).join('')}</div><p id="wt-design-valid" role="status" aria-live="polite">${state.validation?.ok?`POWER ${state.validation.result.cost} · BUILD POINTS ${state.validation.result.points}`:esc(state.validation?reason(state.validation.reason):'Select every required component.')}</p>${button(busy?'SAVING…':editing?'SAVE CHANGES':'SAVE BLUEPRINT','data-action="save-design" id="wt-save-design"'+(!state.validation?.ok||busy?' disabled':''),'wt-primary wt-detail-action')}${editing?button('SAVE AS NEW','data-action="save-as-new" id="wt-save-as-new"'+(!state.validation?.ok||busy?' disabled':'')):''}${button('BLUEPRINT LIBRARY','data-page="saved"')}</aside></div>`;
  }

  function renderSaved(){return `<div class="wt-page-intro"><p>Your designs and factory templates stay saved on this phone between games and app restarts. Components must be researched in the current battle to produce them.</p>${button('NEW DESIGN','data-action="new-design"','wt-primary')}</div>
    <div class="wt-card-grid">${state.saved.map(d=>`<article class="wt-command-card">${unitParts(d)}<div><h2>${esc(d.name)}</h2><p>${esc(findPart(d.body)?.name||d.body)} · ${esc(findPart(d.propulsion)?.name||d.propulsion)}</p><p>${availableDesign(d)?`⚡ ${d.cost} · Available`:'Research required this game'}</p></div><div class="wt-card-actions">${!d.factoryTemplate||[d.body,d.propulsion,...d.turrets].every(id=>findPart(id))?button('EDIT',`data-edit="${esc(d.id)}"`):'<span>FACTORY TEMPLATE · SAVED ON PHONE</span>'}${button(d.factoryTemplate?'USE TEMPLATE':'CHOOSE FACTORY',`data-produce-design="${esc(d.id)}"`+(availableDesign(d)?'':' disabled'),'wt-primary')}${state.deletePending===d.id?'<p>Delete this saved design?</p>'+button('DELETE PERMANENTLY',`data-confirm-delete="${esc(d.id)}"`)+button('CANCEL',`data-cancel-delete="${esc(d.id)}"`):button('DELETE',`data-delete="${esc(d.id)}"`,'wt-subtle')}</div></article>`).join('')||'<p class="wt-empty">No saved designs yet. Open DESIGN to create your first blueprint.</p>'}</div>`;}
  function templateEquipment(d){return d.turrets?.length?d.turrets.slice():d.weapons?.length?d.weapons.slice():[d.construct,d.repair,d.brain,d.ecm,d.sensor].filter(id=>id&&!/null/i.test(id)).slice(0,1);}
  function templateParts(d){return JSON.stringify([d.body,d.propulsion,templateEquipment(d)]);}
  function saveTemplate(id){
    const template=state.snapshot?.templates.find(t=>t.id===id);if(!template)return;
    if(state.saved.some(d=>templateParts(d)===templateParts(template))){notify('This template is already saved on your phone.');return;}
    if(state.saved.length>=100){notify('The library holds 100 designs. Delete a design first.');return;}
    const turrets=templateEquipment(template);if(!template.body||!template.propulsion||!turrets.length||turrets.length>3){notify('This template cannot be saved.');return;}
    const name=String(template.fullname||template.name||'Unit template').replace(/(?: · F\d+)+$/,'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,48);
    const design={id:`design-${Date.now()}-${++state.serial}`,name,body:template.body,propulsion:template.propulsion,turrets,cost:Number(template.cost)||0,points:Number(template.points)||0,droidType:template.droidType,factoryTemplate:true};
    const before=state.saved.slice();state.saved.push(design);
    if(!persist()){state.saved=before;notify('Could not save this template on your phone.');return;}
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
  function factoryStatus(f){const activity=f.active?'PRODUCING':f.idle?'IDLE':'ACTIVE';return factoryFamily(f)==='cyborg'?activity:`${activity} · ${f.modules} MODULE${f.modules===1?'':'S'}`;}
  function renderFactoryStrip(factories){
    return ['vehicle','cyborg','vtol'].map(key=>{const group=factories.filter(f=>factoryFamily(f)===key);if(!group.length)return '';const label=key==='cyborg'?'CYBORG FACTORIES':key==='vtol'?'VTOL FACTORIES':'VEHICLE FACTORIES';
      return `<section class="wt-factory-family"><h2>${label}<small>${group.length} AVAILABLE</small></h2><div class="wt-factory-strip" data-factory-strip="${key}" tabindex="0" aria-label="${label}; swipe for more">${group.map(f=>button(`<span class="wt-factory-number">${factoryDisplayNumber(f)}</span><span class="wt-factory-label">${esc(f.kind)} ${factoryDisplayNumber(f)}<small>${factoryStatus(f)}</small></span>`,`data-factory="${f.id}" aria-pressed="${f.id===state.factory}"`,f.id===state.factory?'active':'')).join('')}</div></section>`;
    }).join('');
  }
  function renderTowersFactory(factories,factory,designs,chosen){
    const native=factory?state.snapshot.templates.filter(d=>(!factory.templates||factory.templates.includes(d.id))&&(!String(d.id).startsWith('native:')||!designs.some(s=>templateParts(s)===templateParts(d)))):[];
    return `<div class="wt-towers-factory-screen"><section class="wt-factory-selector wt-rail" aria-label="Production facilities">${renderFactoryStrip(factories)||'<p class="wt-empty">No completed factory. Build a factory to start production.</p>'}<input hidden id="wt-factory-select" value="${state.factory}"></section><div class="wt-workspace wt-factory-workspace"><section class="wt-work-list"><div class="wt-list-heading"><h2>UNIT DESIGNS</h2><div class="wt-quantity"><span>QUANTITY</span>${[1,5,10,20].map(n=>button(String(n),`data-count="${n}"`,n===state.productionCount?'active':'')).join('')}<input type="hidden" id="wt-produce-count" value="${state.productionCount}"></div></div>${factory?`${chosen?`<h2 class="wt-section-title">SELECTED DESIGN — ${esc(chosen.name)}</h2><div class="wt-card-grid">${productionCard(chosen,false)}</div>`:''}<h2 class="wt-section-title">EXISTING UNIT DESIGNS</h2><div class="wt-card-grid">${native.map(d=>productionCard(d,true)).join('')||'<p class="wt-empty">No compatible designs for this factory.</p>'}</div><h2 class="wt-section-title">SAVED DESIGNS</h2><div class="wt-card-grid">${state.saved.filter(d=>d!==chosen).map(d=>productionCard(d,false)).join('')||'<p class="wt-empty">Create a blueprint in DESIGN.</p>'}</div>`:'<p class="wt-empty">No completed factory. Open BUILD to construct one.</p>'}${button('BLUEPRINT LIBRARY','data-page="saved"','wt-subtle')}</section><aside class="wt-detail"><h2>${factory?`${esc(factory.kind)} ${factoryDisplayNumber(factory)} QUEUE`:'PRODUCTION'}</h2><div id="wt-factory-progress">${factory?factoryProgress(factory):'<p>No factory available.</p>'}</div><div class="wt-factory-actions">${button('ALL ACTIVITY','data-page="queue"')}${button('BUILD A FACTORY','data-page="build"','wt-subtle')}${factory?button('MORE CONTROLS','data-action="native-factory"','wt-subtle'):''}</div></aside></div></div>`;
  }
  function towersFactoryProgress(f){
    const active=f.active?`<div class="wt-active-production">${unitParts(f.active.design)}<div><strong>${esc(f.active.design.name)}</strong><small><span class="wt-live-dot"></span>PRODUCING</small></div></div>`:f.idle?'<p class="wt-factory-idle">FACTORY READY</p>':'<p>PRODUCING FROM FACTORY CONTROLS</p>';
    return `${active}<h3 class="wt-waiting-heading">WAITING · ${f.queue.length} UNIT${f.queue.length===1?'':'S'}</h3><ol class="wt-production-list">${f.queue.map(j=>`<li>${unitParts(j.design)}<div><b>${esc(j.design.name)}</b><span>${esc(j.status)}</span></div></li>`).join('')}</ol>${!f.queue.length?'<p class="wt-empty-queue">No waiting units.</p>':''}${f.waitingReason?`<p>WAITING: ${esc(f.waitingReason.kind.toUpperCase())} LIMIT ${f.waitingReason.current} / ${f.waitingReason.limit}</p><p>Recycle an existing unit of this type to make room, or clear the waiting queue.</p>`:''}${f.queue[0]?.status==='blocked'?`<p>${esc(reason(f.queue[0].reason))} ${button('RETRY',`data-retry-production="${f.id}"`)}</p>`:''}${f.queue.length?button('CLEAR WAITING QUEUE',`data-clear-production="${f.id}"`):''}`;
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
    return `<article class="wt-command-card" data-selected-design="${!native&&d.id===state.selected}">${unitParts(d)}<div><h2>${esc(native?String(d.fullname||d.name).replace(/\s*\u00b7\s*F\d+$/,''):d.fullname||d.name)}</h2>${!researched?'<p class="wt-design-unavailable">Research required this game</p>':`<p>⚡ ${d.cost}${compatible?'':' · Check factory type / modules'}</p>`}</div><div class="wt-card-actions">${button('PRODUCE',(native?`data-produce-template="${esc(d.id)}"`:`data-produce="${esc(d.id)}"`)+(compatible?'':' disabled'),'wt-primary')}${native?button('SAVE TO PHONE',`data-save-template="${esc(d.id)}"`,'wt-subtle'):''}${!native&&d.factoryTemplate?'<small>Saved on this phone</small>':''}</div></article>`;
  }
  function factoryProgress(f){if(polishedTowers)return towersFactoryProgress(f);return `${f.active?`<div class="wt-active-production"><span class="wt-live-dot"></span> ${esc(f.active.design.name)}</div>`:''}<ol class="wt-production-list">${f.queue.map(j=>`<li><b>${esc(j.design.name)}</b><span>${esc(j.status)}</span></li>`).join('')}</ol><p>${f.waitingReason?`WAITING: ${esc(f.waitingReason.kind.toUpperCase())} LIMIT ${f.waitingReason.current} / ${f.waitingReason.limit}`:f.active?`PRODUCING: ${esc(f.active.design.name)}`:f.idle?'IDLE':'PRODUCING FROM FACTORY CONTROLS'} · ${f.queue.length} queued</p>${f.waitingReason?'<p>Recycle an existing unit of this type to make room, or clear the waiting queue.</p>':''}${f.queue[0]?.status==='blocked'?`<p>${esc(reason(f.queue[0].reason))} ${button('RETRY',`data-retry-production="${f.id}"`)}</p>`:''}${f.queue.length?button('CLEAR WAITING QUEUE',`data-clear-production="${f.id}"`):''}`;}
  function renderQueue(){return `<div class="wt-page-intro"><p>Live factory queues and construction activity. Construction times follow live truck activity. Remaining times are approximate; green blueprints mark native queued sites.</p>${button('VIEW BUILD SITES','data-action="back"','wt-primary')}</div><div id="wt-live-queue">${liveQueueRows()}</div>`;}
  function liveQueueRows(){const s=state.snapshot,rows=[];for(const f of s.factories){if(f.active)rows.push(`<article class="wt-queue-row"><div><h2>${esc(f.kind)} ${polishedTowers?factoryDisplayNumber(f):f.number} — PRODUCING</h2><p>${esc(f.active.design.name)}</p></div></article>`);for(const [i,j]of f.queue.entries())rows.push(`<article class="wt-queue-row"><b>${i+1}</b><div><h2>${esc(j.design.name)}</h2><p>${esc(f.kind)} ${polishedTowers?factoryDisplayNumber(f):f.number} · ${esc(j.status.toUpperCase())}${j.reason?' · '+esc(reason(j.reason)):''}</p></div></article>`);}rows.push(...constructionRows().map(constructionRow));return rows.join('')||'<p class="wt-empty">No active construction or factory jobs. Further native site orders are shown on the battlefield.</p>';}
  function legacyRenderQueue(){return `<div class="wt-page-intro"><p>Orders run in order for each truck. A blocked site keeps its place until you retry or remove it.</p><span class="wt-tag">${state.snapshot.jobs.length} JOBS</span></div>
    <div id="wt-queue-list">${queueRows()}</div>`;}
  function queueRows(){return state.snapshot.jobs.map((j,i)=>`<article class="wt-queue-row"><b>${i+1}</b><div><h2>${esc(state.catalog.buildings.find(b=>b.id===j.itemId)?.name||j.itemId)}</h2><p>Tile ${j.x}, ${j.y} · ${j.automatic?'Auto truck':`${j.workers.length} selected truck${j.workers.length===1?'':'s'}`} · ${j.status.toUpperCase()}</p>${j.reason?`<p>${esc(reason(j.reason))}</p>`:''}</div>${j.status==='blocked'?button('RETRY',`data-retry-job="${esc(j.id)}"`):''}${button('REMOVE',`data-cancel-job="${esc(j.id)}"`)}</article>`).join('')||'<p class="wt-empty">The construction queue is clear.</p>';}
  function builderMode(){const count=state.snapshot?.trucks.filter(t=>t.selected).length||0;return `${count?`${count} TRUCK${count===1?'':'S'} SELECTED`:'AUTO TRUCK'} · ALWAYS QUEUE`;}
  function renderMore(){return `<div class="wt-page-intro"><p>Battle controls and interface size.</p></div><div class="wt-more-grid">${button('SELECT ALL COMBAT UNITS','data-control="toggleCombatLock"')}${button('AUTO PATROL','data-control="toggleAutoFight"')}${button('BOX SELECT → DRAG ON BATTLEFIELD','data-control="toggleBoxMode"')}${button('COMMANDERS','data-action="commanders"')}</div>
    <label class="wt-size-label">CONTROL SIZE <select id="wt-command-size">${[[1,'Standard'],[1.2,'Large'],[1.4,'Extra large']].map(([v,label])=>`<option value="${v}" ${state.size===v?'selected':''}>${label}</option>`).join('')}</select></label><p>BUILD queues automatically and selects the nearby truck group. Multiple manually selected trucks stay selected. TRUCKS selects the nearby group for normal movement.</p>`;}
  function refreshLive(){
    updateSidebarQueue();
    if(state.page==='queue'&&element('wt-live-queue'))element('wt-live-queue').innerHTML=liveQueueRows();
    if(element('wt-build-mode'))element('wt-build-mode').textContent=builderMode();
    if(state.page==='queue'&&element('wt-queue-list'))element('wt-queue-list').innerHTML=queueRows();
    else if(state.page==='factory'&&element('wt-factory-progress')){const f=state.snapshot.factories.find(f=>f.id===state.factory);if(f){element('wt-factory-progress').innerHTML=factoryProgress(f);for(const b of element('wt-page-content').querySelectorAll('[data-factory]')){const live=state.snapshot.factories.find(f=>f.id===Number(b.dataset.factory));if(live)b.querySelector('small').textContent=polishedTowers?factoryStatus(live):`${live.modules} MODULE${live.modules===1?'':'S'} · ${live.active?'PRODUCING':live.idle?'IDLE':'ACTIVE'}`;}}else render();}
    else if(state.page&&element('wt-page-content')?.querySelector('.wt-empty')?.textContent.includes('Connecting'))render();
  }
  function updateHUD(){
    install();const hud=element('wt-build-status');hud.hidden=true;
    doc.body.dataset.buildSidebar=String(state.buildOpen);
    doc.body.dataset.modulePlacement=String(Boolean(state.buildOpen&&state.placement?.category==='MODULES'));
    if(doc.body.dataset.modulePlacement==='true'){
      const edge=element('wt-build-sidebar')?.getBoundingClientRect?.().right;
      if(Number.isFinite(edge))doc.documentElement?.style?.setProperty('--wt-module-toast-left',`${Math.ceil(edge)+8}px`);
    }

    if(!state.snapshot)return;
    element('wt-power').textContent=`POWER ${Math.floor(state.snapshot.power)}`;
    element('wt-command-resources').textContent=`⚡ ${Math.floor(state.snapshot.power)}`;
    const queue=element('wt-field-status');const selected=state.snapshot.selectedUnits||state.snapshot.trucks.filter(t=>t.selected);queue.textContent=state.nativeMenu==='build'?'EXIT BUILD / KEEP ORDERS':`${selected.length} UNIT${selected.length===1?'':'S'} SELECTED`;
    const badge=element('wt-field-toggle-count');if(badge){badge.textContent=selected.length||'';element('wt-field-toggle').setAttribute('aria-label',selected.length?`Unit controls: ${selected.length} selected`:'Unit controls');}
    if(state.nativeMenu==='build'&&!state.buildingOpening)state.nativeBuildGroup=constructionParticipants(state.nativeBuildGroup,state.snapshot.trucks);
    if((state.placement||state.nativeMenu==='build')&&state.placement?.category!=='MODULES'&&state.nativeBuildPlaced&&!state.exitingBuild&&!state.pendingItem&&!state.buildingOpening){const participants=new Set([...state.nativeBuildGroup,...(state.buildParticipants||[])]),group=state.snapshot.trucks.filter(t=>participants.has(t.id));if(nativeConstructionFinished(state,group,state.snapshot.gameTime,Boolean(state.siteChecks||state.nativePendingSites.length||state.snapshot.jobs?.length||window.__kalaWarzoneTouch.report().pendingClicks))){state.nativeBuildSawWork=false;state.nativeBuildIdleAt=0;selectMode();}}
    const native=state.nativeMenu==='build',item=state.catalog?.buildings.find(b=>b.id===state.nativeItem);
    element('wt-native-build-mask').hidden=!native;
    hud.classList.toggle('placing',Boolean(state.placement)||native);
    hud.classList.toggle('native-building',native);
    const participants=state.snapshot.trucks.filter(t=>state.nativeBuildGroup.includes(t.id));
    element('wt-builder-summary').textContent=native?(state.nativeToolReady?'Tap clear terrain to queue. Green blueprints mark accepted sites.':'Choose a structure in the left panel.') :'';
    element('wt-placement-label').textContent=state.placement?`${state.placement.name} · TAP TO QUEUE`:native&&state.nativeToolReady&&item?item.name:native?'CONSTRUCTION READY':'';
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
    return JSON.stringify([innerWidth,innerHeight,state.size||1,...['pans','panMoves','radarTaps','radarDrags','radarMoves','baseJumps','cameraFacings','zoomCommandWrites','zoomAcks','pinchSteps','tiltMoves','zoomWheelEvents'].map(key=>Number(touch[key])||0)]);
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
  async function selectionState(){
    let timer,poll;
    const consume=()=>{try{window.__blockNightResearch?.pollOutput?.();}catch(_){}};
    try{
      const reply=send('state',{}, {fresh:true});
      // The existing incremental reader owns its offsets/decoder. During this
      // one pending native reply, consume new lines promptly instead of waiting
      // for the research UI's ordinary 650ms background cadence.
      poll=setInterval(consume,45);consume();
      return await Promise.race([reply,new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,reason:'selection-paused'}),2500);})]);
    }finally{clearInterval(poll);clearTimeout(timer);}
  }
  async function selectVisibleTrucks(){
    if(window.__towersHtml?.isEnded?.())return [];
    const view=buildSelectionView();
    if(state.selectionPromise){
      if(state.truckSelection?.view===view)return state.selectionPromise;
      const previous=state.selectionPromise;++state.selectionSerial;window.__kalaWarzoneTouch?.releaseAll?.(true);
      await previous.catch(()=>{});return selectVisibleTrucks();
    }
    state.notice='';const previous=element('wt-command-toast');if(previous)previous.hidden=true;const inline=element('wt-sidebar-notice');if(inline)inline.hidden=true;
    const serial=++state.selectionSerial,started=Date.now();
    state.autoSelectionIntent=window.__kalaWarzoneTouch?.report?.().manualSelectionRevision||0;
    const active=()=>serial===state.selectionSerial&&view===buildSelectionView()&&!window.__towersHtml?.isEnded?.();
    const trace={phase:'closing-menu',view,boxes:0,queries:0,regions:[],wanted:[],selected:[],recent:[],cacheHit:false,cacheRejected:false};state.truckSelection=trace;
    let regions=[],field=[],last=null,empty=null,cacheKey='',verifiedRects=null,signature='';const cache=state.truckSelectionCache||=new Map();
    const box=async(rect,add=false,cleanup=false)=>{
      if(!active())return false;
      if(trace.boxes>=(cleanup?72:64)||!cleanup&&Date.now()-started>12000)throw Error('Truck selection took too long. Tap TRUCKS to try again.');
      trace.boxes++;return window.__kalaWarzoneTouch.nativeBoxSelect(rect.left,rect.top,rect.right,rect.bottom,add);
    };
    const query=async(rect,cleanup=false)=>{
      if(!await box(rect,false,cleanup)||!active())return null;
      const reply=await selectionState();if(!active())return null;
      if(!reply.ok)throw Error('Resume the game, then tap TRUCKS to select your trucks.');
      last=reply.result;trace.queries++;
      const units=last.selectedUnits||[];trace.recent.push({rect,ids:units.map(u=>u.id)});if(trace.recent.length>12)trace.recent.shift();
      if(!units.length)empty=rect;return units;
    };
    const clear=async()=>{
      // A verified empty native rectangle clears selection without a ground
      // click, a guessed body hit, a camera move or a unit order.
      if(last?.selectedUnits?.length===0)return;
      const candidates=empty?[empty]:field.flatMap(r=>[{left:r.left,top:r.top,right:r.left+8,bottom:r.top+8},{left:r.right-8,top:r.top,right:r.right,bottom:r.top+8}]);
      for(const r of candidates){const units=await query(r,true);if(!active()||units&&units.length===0)return;}
      throw Error('Selection could not be cleared safely. Move the view, then tap TRUCKS.');
    };
    const task=(async()=>{
      const closed=await awaitNativeClose();if(!active())return [];if(!closed?.ok)throw Error('Resume the game, then tap TRUCKS to select your trucks.');
      window.__kalaWarzoneTouch?.releaseAll?.(true);
      const initial=await selectionState();if(!active())return [];if(!initial.ok)throw Error('Resume the game, then tap TRUCKS to select your trucks.');
      trace.beforeOrders=initial.result.trucks.map(t=>({id:t.id,order:t.order,queued:t.queued}));
      field=buildSelectionRegions();state.nativeBuildGroup=[];last=initial.result;
      if(!field.length)throw Error('The battlefield is covered. Close the open panel, then tap TRUCKS.');
      trace.phase='camera';
      if(!await window.WarzoneTerrain?.refresh(1500,true)||!active())throw Error('The battlefield is not ready. Tap TRUCKS to try again.');
      regions=truckSelectionRegions(initial.result,field);trace.regions=regions;
      if(!regions.length){await clear();if(active()){state.snapshot=last;state.buildSelectionView=view;trace.phase='empty';updateHUD();notify('No construction trucks are visible. Move the view to your trucks.');}return [];}
      cacheKey=JSON.stringify([initial.result.player,initial.result.mapWidth,initial.result.mapHeight,view,selectionCoverage(regions)]);
      signature=truckSelectionSignature(initial.result);const remembered=cache.get(cacheKey),current=initial.result.selectedUnits||[];
      // Retaining an already verified stationary group requires no native
      // gesture at all. Moving/working trucks always get fresh ID verification.
      if(remembered?.signature===signature&&(initial.result.trucks||[]).every(t=>!t.order&&!t.action)&&current.length===remembered.ids.length&&current.every(t=>t.constructor&&remembered.ids.includes(t.id))){
        state.nativeBuildGroup=current.map(t=>t.id);state.buildSelectionView=view;state.snapshot=last;trace.phase='selected';trace.cacheHit=true;trace.retained=true;trace.wanted=remembered.ids.slice();trace.selected=state.nativeBuildGroup.slice();trace.afterOrders=trace.beforeOrders;updateHUD();return selectedBuildGroup(last);
      }
      trace.phase='scan';
      // The native engine remains the visibility/selection oracle. Discovery
      // is confined to constructor tile volumes, never the whole battlefield.
      for(let i=0;i<regions.length;i++){if(!await box(regions[i],i>0)||!active())return [];}
      let reply=await selectionState();if(!active())return [];if(!reply.ok)throw Error('Resume the game, then tap TRUCKS to select your trucks.');
      last=reply.result;trace.queries++;let units=last.selectedUnits||[];
      const wanted=new Set(units.filter(u=>u.constructor).map(u=>u.id));trace.wanted=Array.from(wanted);
      if(!wanted.size){await clear();if(active()){state.snapshot=last;state.buildSelectionView=view;trace.phase='empty';updateHUD();notify('No construction trucks are visible. Move the view to your trucks.');}return [];}
      const mixed=units.some(u=>!u.constructor),sameIds=ids=>ids.length===wanted.size&&ids.every(id=>wanted.has(id));
      if(mixed){
        const saved=cache.get(cacheKey);
        if(saved&&sameIds(saved.ids)){
          trace.phase='verify-cached-regions';
          for(let i=0;i<saved.rects.length;i++){if(!await box(saved.rects[i],i>0)||!active())return [];}
          reply=await selectionState();if(!active())return [];if(!reply.ok)throw Error('Resume the game, then tap TRUCKS to select your trucks.');
          last=reply.result;trace.queries++;units=last.selectedUnits||[];
          if(units.every(u=>u.constructor)&&sameIds(units.map(u=>u.id))){verifiedRects=saved.rects;trace.cacheHit=true;}
          else{cache.delete(cacheKey);trace.cacheRejected=true;}
        }else if(saved){cache.delete(cacheKey);trace.cacheRejected=true;}
      }
      if(mixed&&!trace.cacheHit){
        trace.phase='separate-units';const clean=[],covered=new Set();
        const collect=async(rect,known=null)=>{
          const selected=known||await query(rect);if(!active()||!selected)return;
          const constructors=selected.filter(u=>u.constructor);if(!constructors.length)return;
          constructors.forEach(u=>wanted.add(u.id));
          if(constructors.length===selected.length){clean.push(rect);constructors.forEach(u=>covered.add(u.id));return;}
          const halves=splitSelectionRect(rect);
          if(!halves.length)throw Error('Trucks overlap other units. Move the view slightly, then tap TRUCKS.');
          const first=await query(halves[0]);if(!active()||!first)return;
          await collect(halves[0],first);if(!active())return;
          // Only visit the other half if some required constructor was not
          // already captured. Boundary overlaps are harmless additive selection.
          if(constructors.some(u=>!covered.has(u.id)))await collect(halves[1]);
        };
        for(const region of regions){if(Array.from(wanted).every(id=>covered.has(id)))break;await collect(region);if(!active())return [];}
        if(!clean.length){await clear();return [];}
        trace.phase='select-trucks';
        for(let i=0;i<clean.length;i++){if(!await box(clean[i],i>0)||!active())return [];}
        reply=await selectionState();if(!active())return [];if(!reply.ok)throw Error('Resume the game, then tap TRUCKS to select your trucks.');
        last=reply.result;trace.queries++;units=last.selectedUnits||[];verifiedRects=clean;
      }
      if(units.length!==wanted.size||units.some(u=>!u.constructor||!wanted.has(u.id))){await clear();throw Error('Truck positions changed during selection. Tap TRUCKS to select again.');}
      const selected=selectedBuildGroup(last);state.nativeBuildGroup=selected.map(t=>t.id);state.buildSelectionView=view;state.snapshot=last;
      cache.delete(cacheKey);cache.set(cacheKey,{signature:truckSelectionSignature(last),ids:Array.from(wanted),rects:(verifiedRects||regions).map(r=>({...r}))});while(cache.size>4)cache.delete(cache.keys().next().value);
      state.notice='';const toast=element('wt-command-toast');if(toast)toast.hidden=true;trace.phase='selected';trace.selected=state.nativeBuildGroup.slice();trace.wanted=Array.from(wanted);trace.afterOrders=last.trucks.map(t=>({id:t.id,order:t.order,queued:t.queued}));updateHUD();return selected;
    })().catch(async error=>{if(active()){state.nativeBuildGroup=[];trace.phase='stopped';trace.reason=error.message;try{if(regions.length&&last?.selectedUnits?.length)await clear();}catch(_){}if(active()){if(last)state.snapshot=last;notify(error.message||'Truck selection could not complete. Tap TRUCKS to retry.');}}return [];});
    state.selectionPromise=task;
    try{return await task;}finally{if(state.selectionPromise===task){state.selectionPromise=null;state.autoSelectionRevision=state.selectionEventSerial;window.__kalaWarzoneTouch?.resumeInput?.();}renderSidebar();}
  }
  async function openBuild(forceNearby=false){
    install();return selectVisibleTrucks();
  }
  function beginPlacement(itemId){
    const item=availableBuildings().find(b=>b.id===itemId);
    if(!item||state.exitingBuild||state.buildingOpening||window.__towersHtml?.isEnded?.())return;
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
    const started=Date.now();let warned=false,lastClock=window.__warzoneTowersWaves?.report?.().snapshot?.gameTime,lastAdvance=Date.now();
    while(state.siteChecks||state.nativePendingSites.length||window.__kalaWarzoneTouch?.report().pendingClicks){flushNativeSites();window.__blockNightResearch?.pollOutput?.();const clock=window.__warzoneTowersWaves?.report?.().snapshot?.gameTime;if(clock!==lastClock){lastClock=clock;lastAdvance=Date.now();}if(Date.now()-lastAdvance>2500&&!state.nativePendingSites.length){if(state.nativeClosePromise){window.__kalaWarzoneTouch?.releaseAll?.(true);return false;}if(!window.__kalaWarzoneTouch?.report().pendingClicks)return false;}if(!warned&&Date.now()-started>5000){warned=true;notify('Waiting for accepted game input. STOP cancels pending taps.');}await pause(40);}
  }
  function selectMode(discard=false,keepSidebar=false){
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
    })().finally(()=>{state.exitPromise=null;state.exitingBuild=false;});return state.exitPromise;
  }
  async function afterBuildExit(action,discard=false){const navigation=++state.navigationSerial;await selectMode(discard);if(navigation===state.navigationSerial)return action();}
  async function selectNearbyTrucks(){
    ++state.navigationSerial;
    if(await selectMode()===false){notify('Resume the game, then tap TRUCKS to select your trucks.');return [];}
    try{await selectVisibleTrucks();}catch(error){notify(error.message);}
  }
  function cancelPlacement(){window.WarzoneBuildDisplay?.clearPreview();state.previewPoint=null;if(state.placement){state.nativeToolReady=false;state.nativeItem='';}state.placement=null;window.WarzoneTerrain?.active(false);const ghost=document.getElementById('wt-build-ghost');if(ghost)ghost.setAttribute('hidden','');updateHUD();}
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
    const item=state.placement,session=state.session,assigned=state.nativeBuildGroup.slice(),cancellation=state.cancelSerial;state.placements++;state.siteChecks++;
    let moduleRequest;
    if(point.parentId){const key=++state.moduleSerial;moduleRequest={key,parentId:point.parentId,itemId:item.id,targetModules:Number(point.target.modules||0)+Number(point.target.reserved||0)+1};state.modulePending.set(key,moduleRequest);updateSidebarQueue();}
    Promise.resolve(selection).then(group=>{
      if(cancellation!==state.cancelSerial||window.__towersHtml?.isEnded?.())return {ok:false,reason:'cancelled'};
      if(view!==buildSelectionView())return {ok:false,reason:'view-changed'};
      const workers=selection?(group||[]).map(t=>t.id):assigned;
      if(!workers.length)return {ok:false,reason:'no-visible-truck'};
      return send('queue-build',{itemId:item.id,x:point.x,y:point.y,...(point.parentId?{parentId:point.parentId}:{}),session,workerIds:workers});
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
    }).catch(error=>{if(moduleRequest)state.modulePending.delete(moduleRequest.key);if(!window.__towersHtml?.isEnded?.())notify(error.message||'The site could not be queued. Choose the site again.');}).finally(()=>{state.siteChecks--;if(moduleRequest)updateSidebarQueue();});return true;
  }
  let validationTimer;
  function resetDraft(saved){
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
    const focused=element('wt-design-name')===doc.activeElement;
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
  function designStatus(){
    const r=state.validation,busy=state.saving.has(state.draft.id),label=element('wt-design-valid');
    if(label)label.textContent=r?.ok?`POWER ${r.result.cost} · BUILD POINTS ${r.result.points}`:r?reason(r.reason):'Choose components to validate your design.';
    for(const id of ['wt-save-design','wt-save-as-new']){const b=element(id);if(b)b.disabled=!r?.ok||busy;}
  }
  function payload(d){return {...d,turrets:d.turrets[0]?d.turrets.filter(Boolean):[]};}
  function validateDraft(){
    clearTimeout(validationTimer);state.validation=null;const version=++state.validationSerial,draft=payload(JSON.parse(JSON.stringify(state.draft)));designStatus();
    if(!draft.name.trim()||!draft.body||!draft.propulsion||!draft.turrets.length)return;
    validationTimer=setTimeout(()=>send('validate-design',{design:draft}).then(r=>{if(version!==state.validationSerial||draft.id!==state.draft.id)return;state.validation=r;designStatus();}),220);
  }
  function saveDesign(asNew=false){
    readDraft();const sourceId=state.draft.id;if(state.saving.has(sourceId)||!state.validation?.ok)return;
    const draft=payload(JSON.parse(JSON.stringify(state.draft))),version=state.validationSerial;
    if(asNew)draft.id=`design-${Date.now()}-${++state.serial}`;
    if(!state.saved.some(d=>d.id===draft.id)&&state.saved.length>=100){notify('The library holds 100 designs. Delete a design first.');return;}
    state.saving.add(sourceId);designStatus();
    send('save-design',{design:draft}).then(r=>{
      if(!r.ok){notify(reason(r.reason));return;}
      const d={...r.result,id:draft.id};delete d.native;
      const before=state.saved.slice(),index=state.saved.findIndex(v=>v.id===d.id);
      if(index>=0)state.saved[index]=d;else state.saved.push(d);
      if(!persist()){state.saved=before;notify('Could not save to this device. Try again.');return;}
      if(version===state.validationSerial&&sourceId===state.draft.id&&state.page==='design'){resetDraft(d);open('saved');}else if(state.page==='saved')render();
    }).finally(()=>{state.saving.delete(sourceId);designStatus();});
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
    if(d.page)open(d.page);
    else if(d.buildChoice){state.buildChoice=d.buildChoice;render();}
    else if(d.step){readDraft();state.designStep=d.step;render();}
    else if(Object.prototype.hasOwnProperty.call(d,'part')){readDraft();if(d.slot==='body'){state.draft.body=d.part;state.draft.turrets=state.draft.turrets.slice(0,Math.min(3,findPart(d.part)?.slots||1));}else if(d.slot==='propulsion')state.draft.propulsion=d.part;else state.draft.turrets[Number(d.slot)]=d.part;state.validation=null;render();validateDraft();}
    else if(d.factory){state.factory=Number(d.factory);render();}
    else if(d.count){state.productionCount=Number(d.count);render();}
    else if(d.category){if(state.buildOpen)state.scroll['sidebar-'+state.category]=element('wt-sidebar-catalogue').scrollTop;state.category=d.category;render();renderSidebar();}
    else if(d.build)beginPlacement(d.build);
    else if(d.edit){const saved=state.saved.find(s=>s.id===d.edit);if(saved){resetDraft(saved);open('design');validateDraft();}}
    else if(d.delete){state.deletePending=d.delete;render();const c=element('wt-page-content'),b=c?.querySelector('[data-cancel-delete]');if(b)c.scrollTop+=Math.max(0,b.getBoundingClientRect().bottom-c.getBoundingClientRect().bottom);}
    else if(d.cancelDelete){state.deletePending='';render();}
    else if(d.confirmDelete){const before=state.saved.slice();state.saved=state.saved.filter(s=>s.id!==d.confirmDelete);state.deletePending='';if(!persist()){state.saved=before;notify('Could not delete from this device. Your design was kept.');}render();}
    else if(d.produceDesign){state.selected=d.produceDesign;const design=state.saved.find(s=>s.id===d.produceDesign),factories=state.snapshot.factories.filter(f=>f.ready&&designFitsFactory(design,f));if(!factories.some(f=>f.id===state.factory)&&factories.length)state.factory=factories[0].id;open('factory');}
    else if(d.saveTemplate){saveTemplate(d.saveTemplate);}
    else if(d.produce||d.produceTemplate){
      const count=Number(element('wt-produce-count')?.value||1);
      const design=state.saved.find(s=>s.id===d.produce);
      send('queue-production',{factoryId:state.factory,count,...(d.produceTemplate?{templateId:d.produceTemplate}:{design})}).then(r=>{if(!r.ok)notify(reason(r.reason));requestState();});
    }
    else if(d.cancelJob||d.retryJob)send(d.cancelJob?'cancel-job':'retry-job',{jobId:d.cancelJob||d.retryJob}).then(r=>{if(!r.ok)notify(reason(r.reason));requestState();});
    else if(d.clearProduction||d.retryProduction)send(d.clearProduction?'clear-production':'retry-production',{factoryId:Number(d.clearProduction||d.retryProduction)}).then(r=>{if(!r.ok)notify(reason(r.reason));requestState();});
    else if(d.control){afterBuildExit(()=>window.__kalaWarzoneTouch?.[d.control]?.());}
    else if(d.action==='back')close();
    else if(d.action==='cancel-placement')selectMode();
    else if(d.action==='select-mode')selectMode();
    else if(d.action==='save-design')saveDesign();
    else if(d.action==='save-as-new')saveDesign(true);
    else if(d.action==='new-design'){readDraft();if(JSON.stringify(state.draft)!==state.draftOriginal){state.confirmNew=true;open('design');}else{resetDraft();open('design');}}
    else if(d.action==='discard-draft'){resetDraft();render();}
    else if(d.action==='keep-draft'){state.confirmNew=false;render();}
    else if(d.action==='native-factory')openNative('factory');
    else if(d.action==='commanders')openNative('commanders');
  }
  function endBattle(){
    ++state.selectionSerial;++state.navigationSerial;++state.cancelSerial;++state.menuRevision;
    state.selectionPromise=null;state.truckSelectionCache?.clear();state.modulePending?.clear();state.snapshot=null;state.buildOpen=false;state.page='';
    state.nativeMenu='';state.nativeBuildGroup=[];state.buildSelectionView='';state.buildParticipants=[];state.nativePendingSites=[];
    state.buildingOpening=false;state.nativeMenuPending=false;state.nativeClosePromise=null;state.nativeToolReady=false;
    cancelPlacement();
    for(const id of ['wt-command-pages','wt-build-sidebar','wt-native-back','wt-build-busy']){const node=element(id);if(node)node.hidden=true;}
    delete doc.body.dataset.commandPage;
    for(const pending of state.pending.values())pending.resolve({ok:false,reason:'battle-ended'});
    state.pending.clear();state.lastBatch=null;
  }
  window.addEventListener('warzone-battle-ended',endBattle);
  window.addEventListener('warzone-build-display-ready',()=>{updateSidebarQueue();if(state.placement&&state.previewPoint)window.WarzoneBuildDisplay.preview(state.placement,state.previewPoint);});
  loadSaved();resetDraft();
  window.__warzoneCommands={tower:true,setSize:applySize,open,close,closeNative,beginPlacement,cancelPlacement,placeAt,previewAt,send,accept,
    hidePreview:()=>{window.WarzoneBuildDisplay?.clearPreview();state.previewPoint=null;const ghost=document.getElementById('wt-build-ghost');if(ghost)ghost.setAttribute('hidden','');},
    endBattle,isOpen:()=>Boolean(state.page),isPlacement:()=>Boolean(state.placement),nativeMenuOpen:()=>Boolean(state.nativeMenu&&state.nativeMenu!=='build'),nativeClosing:()=>Boolean(state.nativeClosePromise),nativeBuildOpen:()=>Boolean(state.placement)||state.nativeMenu==='build',nativeBuildMenuOpen:()=>state.nativeMenu==='build'&&!state.nativeToolReady,nativeHudHidden:()=>state.nativeHudHidden,nativeBuildTap,nativeBuildMenuTap,queueNativeSite,selectMode,afterBuildExit,selectNearbyTrucks,openBuild,
    report:()=>({version:64,moduleTargets:moduleTargets(),modulePending:Array.from(state.modulePending.values()),truckSelection:state.truckSelection,selectingTrucks:Boolean(state.selectionPromise),page:state.page,buildOpen:state.buildOpen,nativeHudHidden:state.nativeHudHidden,pendingItem:state.pendingItem,siteChecks:state.siteChecks,pending:state.pending.size,writes:state.writes,acks:state.acks,timeouts:state.timeouts,
      placements:state.placements,rejects:state.rejects,opens:state.opens,closes:state.closes,placement:state.placement?.id,
      session:state.session,nativeMenu:state.nativeMenu,nativeClosing:Boolean(state.nativeClosePromise),placement:state.placement?.id||'',nativeItem:state.nativeItem,nativeBuildGroup:state.nativeBuildGroup,buildParticipants:state.buildParticipants,nativeToolReady:state.nativeToolReady,nativePendingSites:state.nativePendingSites.length,exitingBuild:state.exitingBuild,nativeBuildPlaced:state.nativeBuildPlaced,nativeBuildSawWork:state.nativeBuildSawWork,buildingOpening:state.buildingOpening,saved:state.saved,history:state.history,snapshot:state.snapshot,terrain:window.WarzoneTerrain?.report()})};
  fetch('/warzone/command-catalog.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(c=>{state.catalog=c;render();}).catch(()=>notify('The command catalogue could not load. Restart the app.'));
  setInterval(()=>{
    if(window.__towersHtml?.isEnded?.())return;
    if(!state.snapshot&&window.__kalaWarzoneTouch?.report().hudVisible)install();
    if(!state.pendingItem&&!state.buildingOpening&&window.__kalaWarzoneTouch?.report().hudVisible&&Date.now()-state.lastPoll>(state.placement||state.nativeMenu==='build'||state.snapshot?.jobs?.length?250:state.page?1600:1200))requestState();
    if(state.pending.size){window.__blockNightResearch?.pollOutput?.();if(Date.now()-state.lastWrite>1500)flush(true);
      for(const p of state.pending.values())if(!p.warned&&Date.now()-p.at>12000){p.warned=true;state.timeouts++;if(p.command.action!=='state')notify(reason('timeout'));}}
  },150);
})();
