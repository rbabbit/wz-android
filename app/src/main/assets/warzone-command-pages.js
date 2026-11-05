/* Tower command pages: native-validated orders; app-private design library. */
(() => {
  'use strict';
  if (window.__warzoneCommands) return;
  const host = window.parent?.WarzoneHost ? window.parent : window;
  const doc = host.document;
  const PATH = '/data/mp/multiplay/script/rules/warzone-towers-command.json';
  const state = {page:'',catalog:null,snapshot:null,pending:new Map(),serial:0,writes:0,acks:0,
    timeouts:0,lastWrite:0,lastPoll:0,nativeMenu:'',history:[],placement:null,session:'',category:'DEFENCES',search:'',buildChoice:'',buildOpen:false,siteChecks:0,cancelSerial:0,nativeHudHidden:false,pendingItem:'',designStep:'body',designSearch:'',nativeItem:'',
    selected:'',deletePending:'',confirmNew:false,draftOriginal:'',saved:[],draft:{id:'',name:'',body:'',propulsion:'',turrets:['']},validation:null,
    validationSerial:0,saving:new Set(),factory:0,productionCount:1,menuRevision:0,nativeMenuPending:false,
    navigationSerial:0,nativeBuildGeneration:0,nativeToolReady:false,nativeToolSelectionAt:0,nativePendingSites:[],exitPromise:null,exitingBuild:false,nativeBuildGroup:[],nativeBuildPlaced:false,nativeBuildSawWork:false,nativeBuildIdleAt:0,buildingOpening:false,notice:'',size:1,opens:0,closes:0,placements:0,rejects:0,scroll:{}};
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element = id => doc.getElementById(id);
  const module = () => window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
  const reason = code => ({'invalid-site':'This tile is blocked. Choose an open, level site.',
    occupied:'A completed structure already occupies this site.','already-queued':'A build is already queued here.',
    unavailable:'This structure is not available yet.',unreachable:'No assigned truck can reach that site.',
    'no-truck':'You need a construction truck.','queue-full':'The queue is full.',
    'structure-limit':'The structure limit has been reached.','module-parent':'Place this module on a completed matching building.',
    'module-limit':'This building has all its modules.', 'builder-lost':'The assigned truck was destroyed. Choose Retry to assign another.',
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
  function send(action,data={}){
    const nonce=`cmd-${Date.now()}-${++state.serial}`;
    return new Promise(resolve=>{
      state.pending.set(nonce,{command:{...data,action,nonce},resolve,at:Date.now(),warned:false});flush();
    });
  }
  function flush(force=false){
    const fs=module()?.FS;
    if(!fs?.writeFile||!fs?.rename||!state.pending.size)return;
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
      const changed=before&&(before.buildings.map(b=>b.id).join()!==reply.result.buildings.map(b=>b.id).join()||before.parts.join()!==reply.result.parts.join()||JSON.stringify(before.factories.map(f=>[f.id,f.ready,f.modules,f.templates]))!==JSON.stringify(reply.result.factories.map(f=>[f.id,f.ready,f.modules,f.templates]))||JSON.stringify(before.templates)!==JSON.stringify(reply.result.templates));
      state.snapshot=reply.result;updateHUD();refreshLive();if(changed&&['build','saved','factory'].includes(state.page))render();if(changed&&state.buildOpen)renderSidebar();}
    if(!reply.ok)state.rejects++;
    pending.resolve(reply);flush(true);
  }
  window.addEventListener('warzone-command-reply',event=>accept(event.detail));
  window.addEventListener('warzone-native-input-finished',()=>requestState());
  function notify(message){
    state.notice=message;const target=element('wt-command-notice');if(target)target.textContent=message;
    const inline=element('wt-sidebar-notice');if(inline){inline.textContent=message;inline.hidden=!state.buildOpen;}
    const toast=element('wt-command-toast');if(toast){toast.textContent=message;toast.hidden=Boolean(state.page)||state.buildOpen;
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
  function availableDesign(d){const parts=new Set(state.snapshot?.parts||[]);return [d.body,d.propulsion,...d.turrets].every(id=>parts.has(id));}

  function install(){
    if(element('wt-command-pages'))return;
    const link=doc.createElement('link');link.rel='stylesheet';link.href='/warzone/ui/command-pages.css';doc.head.appendChild(link);
    const panel=doc.createElement('section');panel.id='wt-command-pages';panel.hidden=true;
    panel.setAttribute('aria-label','Tower command centre');
    panel.innerHTML=`<header class="wt-command-title"><div><span class="wt-eyebrow">WARZONE TOWERS / COMMAND CENTRE</span><h1 id="wt-page-title">BUILD</h1><span id="wt-command-resources"></span></div>
      <nav id="wt-command-tabs" aria-label="Command pages">${['build','design','saved','factory','queue'].map(p=>button(p==='saved'?'BLUEPRINTS':p.toUpperCase(),`data-page="${p}"`)).join('')}</nav>${button('BATTLE ↗','data-action="back"','wt-primary')}</header>
      <div id="wt-command-notice" role="status" aria-live="polite"></div><div id="wt-page-content"></div>`;
    doc.body.appendChild(panel);const busy=doc.createElement('canvas');busy.id='wt-build-busy';busy.hidden=true;busy.setAttribute('aria-hidden','true');doc.body.appendChild(busy);
    panel.addEventListener('click',onClick);panel.addEventListener('input',onInput);panel.addEventListener('change',onChange);
    panel.addEventListener('submit',event=>event.preventDefault());
    const hud=doc.createElement('div');hud.id='wt-build-status';hud.hidden=true;
    hud.innerHTML=`<span id="wt-power">POWER —</span>${button('SELECTION','data-action="select-mode" id="wt-field-status"')}<span id="wt-placement-label"></span><span id="wt-builder-summary"></span>${button('CHANGE','data-page="build"')}${button('DONE','data-action="cancel-placement"')}`;
    hud.addEventListener('click',onClick);doc.body.appendChild(hud);
    const sidebar=doc.createElement('section');sidebar.id='wt-build-sidebar';sidebar.hidden=true;sidebar.setAttribute('aria-label','Construction');
    sidebar.innerHTML=`<header><span id="wt-sidebar-power"></span><span id="wt-sidebar-builders"></span><span class="wt-sidebar-spinner" aria-hidden="true"></span></header><nav aria-label="Structure category">${[['DEFENCES','DEFENCE'],['STRUCTURES','BASE'],['MODULES','MODULES'],['ALL','ALL']].map(([id,label])=>button(label,`data-category="${id}"`)).join('')}</nav><div id="wt-sidebar-notice" role="status" hidden></div><div id="wt-catalogue-wrap"><div id="wt-sidebar-catalogue" tabindex="0" aria-label="Available structures; scroll for more"></div><span id="wt-catalogue-track" aria-hidden="true"><i></i></span></div><section id="wt-sidebar-queue" aria-label="Live construction queue"></section>${button('EXIT · KEEP ORDERS','data-action="select-mode"','wt-sidebar-exit')}`;
    sidebar.addEventListener('click',onClick);doc.body.appendChild(sidebar);
    element('wt-sidebar-catalogue').addEventListener('scroll',updateCatalogueScroll,{passive:true});
    if(host.ResizeObserver)new host.ResizeObserver(updateCatalogueScroll).observe(element('wt-sidebar-catalogue'));
    const map=doc.createElement('button');map.id='wt-placement-map';map.hidden=true;map.type='button';map.title='Show minimap; leave placement';map.setAttribute('aria-label','Show minimap; leave placement');map.innerHTML='<img src="/warzone/ui/icons/map-pin.svg" alt=""><span>MAP</span>';
    map.addEventListener('click',async()=>{await selectMode();state.buildOpen=true;element('wt-build-sidebar').hidden=false;renderSidebar();updateHUD();});doc.body.appendChild(map);
    const nativeMask=doc.createElement('div');nativeMask.id='wt-native-build-mask';nativeMask.hidden=true;nativeMask.setAttribute('aria-hidden','true');doc.body.appendChild(nativeMask);
    const toast=doc.createElement('div');toast.id='wt-command-toast';toast.hidden=true;toast.setAttribute('role','status');doc.body.appendChild(toast);
    const ghost=document.createElementNS('http://www.w3.org/2000/svg','svg');ghost.id='wt-build-ghost';ghost.style.pointerEvents='none';
    const ghostStyle=document.createElement('style');ghostStyle.textContent='#wt-build-ghost{position:fixed;inset:0;z-index:2147483600;pointer-events:none}#wt-build-ghost[hidden]{display:none!important}';document.head.appendChild(ghostStyle);
    ghost.innerHTML='<polygon fill="#a7cf5b44" stroke="#b5e56d" stroke-width="2"/><text fill="#fff" stroke="#000" stroke-width=".4" font-size="13"/>';
    ghost.hidden=true;document.body.appendChild(ghost);
    const back=doc.createElement('button');back.id='wt-native-back';back.hidden=true;back.textContent='BACK TO BATTLE';back.addEventListener('click',()=>closeNative());doc.body.appendChild(back);
    doc.addEventListener('keydown',e=>{if(e.key==='Escape'){if(state.page)close();else if(state.placement)cancelPlacement();else if(state.nativeMenu)closeNative();}});
    document.addEventListener('keydown',e=>{if(state.nativeHudHidden&&e.isTrusted&&(e.key==='Escape'||e.key==='Tab')){e.preventDefault();e.stopImmediatePropagation();selectMode();}},true);
    applySize(state.size);
    const strip=element('warzone-command-strip');
    if(strip&&host.ResizeObserver){let scheduled=false;const observed=new WeakSet();const resize=()=>{
      scheduled=false;
      const hud=element('blocknight-combat-hud'),wave=element('warzone-towers-wave-hud');
      const measured=Math.ceil(Math.max(hud?hud.offsetTop+hud.offsetHeight:0,wave?wave.offsetTop+wave.offsetHeight:0)+7);
      const height=Math.max(56,Math.ceil(measured/8)*8);
      if(height>20&&doc.documentElement.style.getPropertyValue('--wt-command-top')!==`${height}px`)doc.documentElement.style.setProperty('--wt-command-top',`${height}px`);
    };
      const schedule=()=>{if(!scheduled){scheduled=true;host.requestAnimationFrame(resize);}};
      const observer=new host.ResizeObserver(schedule),watch=()=>{for(const id of ['blocknight-combat-hud','warzone-towers-wave-hud']){const e=element(id);if(e&&!observed.has(e)){observed.add(e);observer.observe(e);}}schedule();};
      new host.MutationObserver(watch).observe(strip,{childList:true});watch();host.addEventListener('resize',schedule);doc.fonts?.ready.then(schedule);doc.fonts?.addEventListener('loadingdone',schedule);}
  }
  function open(page='build'){
    if(page==='build'){openSidebar();return;}
    state.buildOpen=false;if(element('wt-build-sidebar'))element('wt-build-sidebar').hidden=true;
    host.WarzoneHost?.resetScroll?.();install();const navigation=++state.navigationSerial;if(state.nativeMenu==='build'||window.__kalaWarzoneTouch?.report().pendingClicks){selectMode().then(()=>{if(navigation===state.navigationSerial)open(page);});return;}window.__blockNightResearch?.close?.();
    const help=element('warzone-towers-help-overlay');
    if(help&&!help.hidden)help.querySelector('.wt-help-back')?.click();
    if(state.nativeMenu||state.nativeMenuPending)closeNative();
    if(page==='stats'||page==='commanders'){openNative(page);return;}
    if(state.page)state.scroll[state.page]=element('wt-page-content')?.scrollTop||0;
    if(state.page!==page){state.notice='';state.deletePending='';}
    state.page=page;state.opens++;element('wt-command-pages').hidden=false;
    doc.body.dataset.commandPage=page;const toast=element('wt-command-toast');if(toast){clearTimeout(toast._timer);toast.hidden=true;}
    window.__warzoneCommands?.hidePreview?.();
    const frame=element('warzone-game-frame');if(frame)frame.inert=true;
    window.__kalaWarzoneTouch?.releaseAll?.(true);send('native-menu',{menu:'close'});render();element('wt-page-content').scrollTop=state.confirmNew&&page==='design'?0:state.scroll[page]||0;requestState();
    if(page==='design'&&!state.validation)validateDraft();
    if(page==='factory'&&state.selected){const content=element('wt-page-content'),card=content.querySelector('[data-selected-design="true"]');if(card){const r=card.getBoundingClientRect(),v=content.getBoundingClientRect();if(r.top<v.top)content.scrollTop+=r.top-v.top;else if(r.bottom>v.bottom)content.scrollTop+=r.bottom-v.bottom;}}
  }
  function close(){
    if(!state.page)return Promise.resolve();
    state.scroll[state.page]=element('wt-page-content')?.scrollTop||0;
    state.page='';state.closes++;element('wt-command-pages').hidden=true;
    delete doc.body.dataset.commandPage;state.deletePending='';
    const frame=element('warzone-game-frame');if(frame)frame.inert=true;
    if(element('wt-command-pages')?.contains(doc.activeElement))doc.activeElement.blur();
    window.__kalaWarzoneTouch?.releaseAll?.(true);
    return send('native-menu',{menu:'close'}).then(()=>{if(state.page)return;if(frame)frame.inert=false;host.WarzoneHost?.restoreBattlefield?.();document.getElementById('canvas')?.focus({preventScroll:true});});
  }
  async function openSidebar(){
    install();if(state.buildingOpening||state.sidebarOpening)return;
    state.sidebarOpening=true;const navigation=++state.navigationSerial;
    try{
      window.__blockNightResearch?.close?.();
      const help=element('warzone-towers-help-overlay');if(help&&!help.hidden)help.querySelector('.wt-help-back')?.click();
      if(state.page)await close();
      if(navigation!==state.navigationSerial)return;
      state.buildOpen=true;window.dispatchEvent(new Event('warzone-build-sidebar-open'));element('wt-build-sidebar').hidden=false;renderSidebar();
      if(state.nativeMenu!=='build')await openBuild(false,true);
      if(navigation===state.navigationSerial){renderSidebar();updateHUD();}
    }catch(error){await closeNative(true);notify(error.message);}finally{state.sidebarOpening=false;}
  }
  function siteStatus(site){return ({building:'BUILDING',queued:'QUEUED',travelling:'TRUCKS EN ROUTE','waiting-trucks':'WAITING FOR TRUCKS','waiting-power':'WAITING FOR POWER',done:'COMPLETE',interrupted:'ORDERS ENDED'})[site.status]||'PLANNED';}
  function remainingTime(seconds){return seconds==null?'':`~${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} LEFT`;}
  function constructionRows(){
    const s=state.snapshot;if(!s)return [];
    const sites=(s.constructionSites||[]).filter(j=>j.status!=='interrupted').map(j=>({...j,name:state.catalog?.buildings.find(b=>b.id===j.itemId)?.name||'Structure'}));
    for(const b of s.construction||[])if(!sites.some(j=>j.structureId===b.id))sites.push(b);
    const rank={building:0,'waiting-power':1,'waiting-trucks':2,travelling:3,queued:4,done:5};
    return sites.sort((a,b)=>(rank[a.status]??4)-(rank[b.status]??4));
  }
  function constructionRow(j,index){return `<article class="wt-site-row" data-site-id="${esc(j.id)}"><span class="wt-site-number">${j.status==='done'?'✓':index+1}</span><div><strong>${esc(j.name)}</strong><small>${siteStatus(j)}${j.status!=='done'&&j.remaining!=null?' · '+remainingTime(j.remaining):''}</small>${j.progress!=null&&j.status!=='done'?`<progress max="1" value="${j.progress}" aria-label="Approximate construction progress"></progress>`:''}</div></article>`;}
  function renderSidebar(){
    const sidebar=element('wt-build-sidebar');if(!sidebar||!state.buildOpen)return;
    const items=availableBuildings().filter(b=>state.category==='ALL'||b.category===state.category),grid=element('wt-sidebar-catalogue');
    const active=state.nativeToolReady&&state.nativeMenu==='build'?state.nativeItem:'',busy=Boolean(state.buildingOpening||state.pendingItem);
    sidebar.setAttribute('aria-busy',String(busy));
    const signature=JSON.stringify([state.category,active,state.pendingItem,busy,items.map(b=>[b.id,b.power,b.image])]);
    if(grid.dataset.signature!==signature){const scroll=grid.dataset.category===state.category?grid.scrollTop:state.scroll['sidebar-'+state.category]||0;grid.innerHTML=items.map(b=>button(`${b.image?image(b):`<span class="wt-native-art-label">${b.width} × ${b.breadth}<small>FOOTPRINT</small></span>`}<strong>${esc(b.name)}</strong><small>⚡ ${Math.round(b.power)}</small>`,`data-build="${esc(b.id)}" aria-pressed="${active===b.id}" ${busy?'disabled':''}`,`${active===b.id?'active ':''}${state.pendingItem===b.id?'loading':''}`)).join('')||'<p class="wt-empty">No available structures. Unlock more in TECH.</p>';grid.dataset.signature=signature;grid.dataset.category=state.category;grid.scrollTop=scroll;}
    for(const b of sidebar.querySelectorAll('[data-category]')){b.classList.toggle('active',b.dataset.category===state.category);b.setAttribute('aria-pressed',String(b.dataset.category===state.category));}
    updateSidebarQueue();updateCatalogueScroll();
  }
  function updateCatalogueScroll(){const grid=element('wt-sidebar-catalogue'),track=element('wt-catalogue-track');if(!grid||!track)return;const range=grid.scrollHeight-grid.clientHeight;track.hidden=range<2;if(range>0){const thumb=track.firstElementChild,height=Math.max(22,grid.clientHeight/grid.scrollHeight*grid.clientHeight);thumb.style.height=`${height}px`;thumb.style.transform=`translateY(${grid.scrollTop/range*(grid.clientHeight-height)}px)`;}}
  function updateSidebarQueue(){
    if(!state.buildOpen)return;
    const s=state.snapshot;const selected=(s?.trucks||[]).filter(t=>t.selected);
    element('wt-sidebar-power').textContent=s?`⚡ ${Math.floor(s.power)}`:'';
    element('wt-sidebar-builders').textContent=`${selected.length} TRUCK${selected.length===1?'':'S'}`;
    const rows=constructionRows(),live=rows.filter(j=>j.status!=='done');
    element('wt-sidebar-queue').innerHTML=`<h2>CONSTRUCTION <span>${live.length?live.length+' SITE'+(live.length===1?'':'S'):'READY'}</span></h2><div class="wt-site-list">${rows.slice(0,2).map(constructionRow).join('')||'<p>Choose a structure, then tap clear terrain.</p>'}</div>${rows.length>2?button(`VIEW ALL ${rows.length} SITES →`,'data-page="queue"','wt-all-sites'):''}`;
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
    if(!state.nativeMenu&&!state.nativeMenuPending)return setNativeHudHidden(false);
    window.__kalaWarzoneTouch?.releaseAll?.(true);
    const revision=++state.menuRevision;state.nativeMenuPending=false;
    state.nativeMenu='';element('wt-native-back').hidden=true;
    return send('native-menu',{menu:'close'}).then(async r=>{await setNativeHudHidden(false);if(!r.ok&&revision===state.menuRevision)notify(reason(r.reason));renderSidebar();});
  }
  function requestState(){if(!Array.from(state.pending.values()).some(p=>p.command.action==='state'))send('state');state.lastPoll=Date.now();}
  function render(){
    if(!state.page)return;
    element('wt-page-title').textContent=({build:'BUILD',design:'DESIGN',saved:'BLUEPRINTS',factory:'FACTORY',queue:'ORDERS'})[state.page]||'BUILD';
    for(const tab of element('wt-command-tabs').querySelectorAll('button')){tab.classList.toggle('active',tab.dataset.page===state.page);tab.setAttribute('aria-current',tab.dataset.page===state.page?'page':'false');}
    const content=element('wt-page-content');
    if(!state.snapshot||!state.catalog){content.innerHTML='<p class="wt-empty">Connecting to the battlefield…</p>';return;}
    const pages={build:renderBuild,design:renderDesign,saved:renderSaved,factory:renderFactory,queue:renderQueue,more:renderMore};
    const scroll=content.scrollTop;content.innerHTML=(pages[state.page]||renderBuild)();content.scrollTop=scroll;
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

  function renderSaved(){return `<div class="wt-page-intro"><p>Your blueprints stay saved between games. Components must be researched in the current battle to produce them.</p>${button('NEW DESIGN','data-action="new-design"','wt-primary')}</div>
    <div class="wt-card-grid">${state.saved.map(d=>`<article class="wt-command-card">${unitParts(d)}<div><h2>${esc(d.name)}</h2><p>${esc(findPart(d.body)?.name||d.body)} · ${esc(findPart(d.propulsion)?.name||d.propulsion)}</p><p>${availableDesign(d)?`⚡ ${d.cost} · Available`:'Research required this game'}</p></div><div class="wt-card-actions">${button('EDIT',`data-edit="${esc(d.id)}"`)}${button('CHOOSE FACTORY',`data-produce-design="${esc(d.id)}"`+(availableDesign(d)?'':' disabled'),'wt-primary')}${state.deletePending===d.id?'<p>Delete this saved design?</p>'+button('DELETE PERMANENTLY',`data-confirm-delete="${esc(d.id)}"`)+button('CANCEL',`data-cancel-delete="${esc(d.id)}"`):button('DELETE',`data-delete="${esc(d.id)}"`,'wt-subtle')}</div></article>`).join('')||'<p class="wt-empty">No saved designs yet. Open DESIGN to create your first blueprint.</p>'}</div>`;}
  function templateParts(d){return JSON.stringify([d.body,d.propulsion,d.turrets||[...(d.weapons||[]),d.construct,d.sensor,d.repair,d.brain,d.ecm].filter(id=>id&&!/^ZNULL/.test(id))]);}
  function renderFactory(){
    const factories=state.snapshot.factories.filter(f=>f.ready);if(!factories.some(f=>f.id===state.factory))state.factory=factories[0]?.id||0;
    const factory=factories.find(f=>f.id===state.factory),designs=state.saved.filter(availableDesign),chosen=designs.find(d=>d.id===state.selected);
    return `<div class="wt-workspace"><aside class="wt-rail"><h2>PRODUCTION FACILITIES</h2>${factories.map(f=>button(`${esc(f.kind)} ${f.number}<small>${f.modules} MODULE${f.modules===1?'':'S'} · ${f.active?'PRODUCING':f.idle?'IDLE':'ACTIVE'}</small>`,`data-factory="${f.id}"`,f.id===state.factory?'active':'')).join('')}<input hidden id="wt-factory-select" value="${state.factory}"><div class="wt-rail-note">Units use normal power and production time.</div>${button('BUILD A FACTORY','data-page="build"')}</aside><section class="wt-work-list"><div class="wt-list-heading"><h2>UNIT DESIGNS</h2><div class="wt-quantity"><span>QUANTITY</span>${[1,5,10,20].map(n=>button(String(n),`data-count="${n}"`,n===state.productionCount?'active':'')).join('')}<input type="hidden" id="wt-produce-count" value="${state.productionCount}"></div></div>${factory?`${chosen?`<h2 class="wt-section-title">SELECTED DESIGN — ${esc(chosen.name)}</h2><div class="wt-card-grid">${productionCard(chosen,false)}</div>`:''}<h2 class="wt-section-title">EXISTING UNIT DESIGNS</h2><div class="wt-card-grid">${state.snapshot.templates.filter(d=>(!factory.templates||factory.templates.includes(d.id))&&(!String(d.id).startsWith('native:')||!designs.some(s=>templateParts(s)===templateParts(d)))).map(d=>productionCard(d,true)).join('')||'<p class="wt-empty">No compatible designs for this factory.</p>'}</div><h2 class="wt-section-title">SAVED DESIGNS</h2><div class="wt-card-grid">${designs.filter(d=>d!==chosen).map(d=>productionCard(d,false)).join('')||'<p class="wt-empty">Create a blueprint in DESIGN.</p>'}</div>`:'<p class="wt-empty">No completed factory. Open BUILD to construct one.</p>'}</section><aside class="wt-detail"><span class="wt-eyebrow">${factory?`${esc(factory.kind)} ${factory.number}`:'PRODUCTION'}</span><h2>FACTORY QUEUE</h2><div id="wt-factory-progress">${factory?factoryProgress(factory):'<p>No factory available.</p>'}</div>${button('ALL ACTIVITY','data-page="queue"')}${factory?button('NATIVE CONTROLS','data-action="native-factory"','wt-subtle'):''}</aside></div>`;
  }

  function designFitsFactory(d,f){
    if(!f)return false;
    const cyborg=/cyborg/i.test(d.body+' '+d.propulsion),flying=/vtol|v-tol/i.test(d.propulsion)||findPart(d.propulsion)?.propulsionType==='Lift';
    if(cyborg)return /cyborg/i.test(f.kind);
    if(/cyborg/i.test(f.kind)||flying!==/vtol/i.test(f.kind))return false;
    const size=['LIGHT','MEDIUM','HEAVY','SUPER HEAVY'].indexOf(findPart(d.body)?.size);
    return /vtol/i.test(f.kind)||size<0||size<=Number(f.modules||0);
  }
  function productionCard(d,native){const compatible=native||designFitsFactory(d,state.snapshot.factories.find(f=>f.id===state.factory));return `<article class="wt-command-card" data-selected-design="${!native&&d.id===state.selected}">${unitParts(d)}<div><h2>${esc(native?String(d.fullname||d.name).replace(/\s*\u00b7\s*F\d+$/,''):d.fullname||d.name)}</h2><p>⚡ ${d.cost}${compatible?'':' · Check factory type / modules'}</p></div>${button('PRODUCE',(native?`data-produce-template="${esc(d.id)}"`:`data-produce="${esc(d.id)}"`)+(compatible?'':' disabled'),'wt-primary')}</article>`;}
  function factoryProgress(f){return `${f.active?`<div class="wt-active-production"><span class="wt-live-dot"></span> ${esc(f.active.design.name)}</div>`:''}<ol class="wt-production-list">${f.queue.map(j=>`<li><b>${esc(j.design.name)}</b><span>${esc(j.status)}</span></li>`).join('')}</ol><p>${f.waitingReason?`WAITING: ${esc(f.waitingReason.kind.toUpperCase())} LIMIT ${f.waitingReason.current} / ${f.waitingReason.limit}`:f.active?`PRODUCING: ${esc(f.active.design.name)}`:f.idle?'IDLE':'PRODUCING FROM FACTORY CONTROLS'} · ${f.queue.length} queued</p>${f.waitingReason?'<p>Recycle an existing unit of this type to make room, or clear the waiting queue.</p>':''}${f.queue[0]?.status==='blocked'?`<p>${esc(reason(f.queue[0].reason))} ${button('RETRY',`data-retry-production="${f.id}"`)}</p>`:''}${f.queue.length?button('CLEAR WAITING QUEUE',`data-clear-production="${f.id}"`):''}`;}
  function renderQueue(){return `<div class="wt-page-intro"><p>Live factory queues and construction activity. Construction times follow live truck activity. Remaining times are approximate; green blueprints mark native queued sites.</p>${button('VIEW BUILD SITES','data-action="back"','wt-primary')}</div><div id="wt-live-queue">${liveQueueRows()}</div>`;}
  function liveQueueRows(){const s=state.snapshot,rows=[];for(const f of s.factories){if(f.active)rows.push(`<article class="wt-queue-row"><div><h2>${esc(f.kind)} ${f.number} — PRODUCING</h2><p>${esc(f.active.design.name)}</p></div></article>`);for(const [i,j]of f.queue.entries())rows.push(`<article class="wt-queue-row"><b>${i+1}</b><div><h2>${esc(j.design.name)}</h2><p>${esc(f.kind)} ${f.number} · ${esc(j.status.toUpperCase())}${j.reason?' · '+esc(reason(j.reason)):''}</p></div></article>`);}rows.push(...constructionRows().map(constructionRow));return rows.join('')||'<p class="wt-empty">No active construction or factory jobs. Further native site orders are shown on the battlefield.</p>';}
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
    else if(state.page==='factory'&&element('wt-factory-progress')){const f=state.snapshot.factories.find(f=>f.id===state.factory);if(f){element('wt-factory-progress').innerHTML=factoryProgress(f);for(const b of element('wt-page-content').querySelectorAll('[data-factory]')){const live=state.snapshot.factories.find(f=>f.id===Number(b.dataset.factory));if(live)b.querySelector('small').textContent=`${live.modules} MODULE${live.modules===1?'':'S'} · ${live.active?'PRODUCING':live.idle?'IDLE':'ACTIVE'}`;}}else render();}
    else if(state.page&&element('wt-page-content')?.querySelector('.wt-empty')?.textContent.includes('Connecting'))render();
  }
  function updateHUD(){
    install();const hud=element('wt-build-status');hud.hidden=true;
    doc.body.dataset.buildSidebar=String(state.buildOpen);
    element('wt-placement-map').hidden=!state.nativeHudHidden;
    if(!state.snapshot)return;
    element('wt-power').textContent=`POWER ${Math.floor(state.snapshot.power)}`;
    element('wt-command-resources').textContent=`⚡ ${Math.floor(state.snapshot.power)}`;
    const queue=element('wt-field-status');const selected=state.snapshot.selectedUnits||state.snapshot.trucks.filter(t=>t.selected);queue.textContent=state.nativeMenu==='build'?'EXIT BUILD / KEEP ORDERS':`${selected.length} UNIT${selected.length===1?'':'S'} SELECTED`;
    const badge=element('wt-field-toggle-count');if(badge){badge.textContent=selected.length||'';element('wt-field-toggle').setAttribute('aria-label',selected.length?`Unit controls: ${selected.length} selected`:'Unit controls');}
    if(state.nativeMenu==='build'&&!state.buildingOpening)state.nativeBuildGroup=constructionParticipants(state.nativeBuildGroup,state.snapshot.trucks);
    if(state.nativeMenu==='build'&&state.nativeBuildPlaced&&!state.exitingBuild){const group=state.snapshot.trucks.filter(t=>state.nativeBuildGroup.includes(t.id));if(nativeConstructionFinished(state,group,state.snapshot.gameTime,Boolean(state.siteChecks||state.nativePendingSites.length||window.__kalaWarzoneTouch.report().pendingClicks))){state.nativeBuildSawWork=false;state.nativeBuildIdleAt=0;selectMode();}}
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
  async function nativeFrames(count=2){const frame=window.__kalaWarzoneTouch.report().nativeRenderFrames;for(let i=0;i<80;i++){await pause(20);if(window.__kalaWarzoneTouch.report().nativeRenderFrames>=frame+count)return;}}
  async function setNativeHudHidden(hidden){
    if(state.nativeHudHidden===hidden)return;
    // Keep Warzone's widget processing running: it commits native build orders.
    // Extend the real viewport below the clipped host to put its bottom truck
    // window/radar outside the playing surface. SDL and terrain picking still
    // share the same viewport; no finished-frame scaling or hidden hit regions.
    state.nativeHudHidden=hidden;
    element('warzone-game-frame').style.height=hidden?'calc(100% + 232px)':'';
    await nativeFrames(3);
    if(element('wt-placement-map'))element('wt-placement-map').hidden=!hidden;
  }
  async function freezeBattlefield(){
    const shot=element('wt-build-busy');if(!shot.hidden)return;
    const canvas=document.getElementById('canvas'),frame=window.__kalaWarzoneTouch.report().nativeRenderFrames;
    // Copy a fresh rendered frame before browser buffer discard. The unchanged
    // battlefield remains visible while native menu clicks run behind it.
    await new Promise((resolve,reject)=>{const deadline=Date.now()+1600;function capture(){
      if(window.__kalaWarzoneTouch.report().nativeRenderFrames<=frame){if(Date.now()>deadline){reject(Error('Battlefield is not ready.'));return;}requestAnimationFrame(capture);return;}
      const r=element('warzone-game-frame').getBoundingClientRect();shot.width=canvas.width;shot.height=canvas.height;
      shot.getContext('2d').drawImage(canvas,0,0);Object.assign(shot.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});shot.hidden=false;resolve();
    }requestAnimationFrame(capture);});
  }
  async function releaseBattlefield(){await nativeFrames();element('wt-build-busy').hidden=true;}
  async function nativeTap(x,y,add=false){
    window.__kalaWarzoneTouch.nativeSelectClick(x,y,add);
    for(let i=0;i<80;i++){await pause(50);if(!window.__kalaWarzoneTouch.report().pendingClicks)break;}
    await pause(120);
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
  async function openBuild(forceNearby=false,keepPage=false,forPlacement=false){
    install();if(state.buildingOpening)return;
    if(window.__kalaWarzoneTouch?.report().pendingClicks){const navigation=++state.navigationSerial;await selectMode();if(navigation!==state.navigationSerial)return;}
    state.buildingOpening=true;renderSidebar();
    try{
      await freezeBattlefield();await setNativeHudHidden(false);
      state.nativeBuildPlaced=false;state.nativeBuildSawWork=false;state.nativeBuildIdleAt=0;state.nativeToolReady=false;state.nativeToolSelectionAt=0;state.nativePendingSites=[];
      cancelPlacement();if(!keepPage)close();window.__blockNightResearch?.close?.();window.__kalaWarzoneTouch.releaseAll(true);
      const reply=await send('state');if(!reply.ok)return;
      const trucks=reply.result.trucks;if(!trucks.length){notify(reason('no-truck'));return;}
      window.WarzoneTerrain?.active(true);
      // The observer sleeps between placements. Let the current camera render
      // before choosing its local group, rather than using the previous view.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const centre=window.WarzoneTerrain?.pick(innerWidth/2,innerHeight/2)||{x:reply.result.mapWidth/2,y:reply.result.mapHeight/2};
      const selected=trucks.filter(t=>t.selected),anchor=(forceNearby?trucks:selected.length?selected:trucks).slice().sort((a,b)=>Math.hypot(a.x-centre.x,a.y-centre.y)-Math.hypot(b.x-centre.x,b.y-centre.y))[0];
      const group=nearbyBuildGroup(trucks,selected,anchor,forceNearby);
      state.nativeBuildGroup=group.map(t=>t.id);state.nativeBuildPlaced=false;state.nativeBuildSawWork=false;
      state.nativeMenu='build';state.nativeMenuPending=true;const revision=++state.menuRevision;
      const opened=await send('native-menu',{menu:'build'});if(revision!==state.menuRevision||!opened.ok)return;
      state.nativeMenuPending=false;state.nativeBuildGeneration=opened.result.generation;
      // Stock BuildController reverses enumDroid order. Select through its real
      // builder cards; this also works when the chosen trucks are off camera.
      const current=await send('state');if(revision!==state.menuRevision)return;
      const already=current.result.selectedUnits||current.result.trucks.filter(t=>t.selected);
      const matches=already.length===group.length&&group.every(t=>already.some(d=>d.id===t.id));
      const builders=trucks.slice().reverse(),base=144+(innerWidth-640)/2;
      for(let i=0;!matches&&i<group.length;i++){
        if(revision!==state.menuRevision)return;
        const index=builders.findIndex(t=>t.id===group[i].id),targetPage=Math.floor(index/5);
        await nativeTap(base+22+targetPage*28,innerHeight-125);
        await nativeTap(base+34+(index%5)*62,innerHeight-85,i>0);
      }
      const check=await send('state');if(revision!==state.menuRevision)return;
      const actual=check.result.trucks.filter(t=>t.selected).map(t=>t.id);
      if(group.some(t=>!actual.includes(t.id)))throw Error('Truck selection could not be completed. Try again.');
      window.__kalaWarzoneTouch.toggleQueueMode(true);element('wt-native-back').hidden=true;updateHUD();return true;
    }finally{state.buildingOpening=false;if(!forPlacement){await closeNative(true);await releaseBattlefield();}renderSidebar();}
  }
  async function beginPlacement(itemId){
    const item=availableBuildings().find(b=>b.id===itemId);if(!item||state.buildingOpening||state.pendingItem)return;
    state.pendingItem=itemId;state.notice='';element('wt-sidebar-notice').hidden=true;renderSidebar();
    try{
      await freezeBattlefield();
      if(state.nativeMenu==='build')await selectMode();
      state.buildOpen=true;element('wt-build-sidebar').hidden=false;
      if(!await openBuild(false,true,true))return;
      const revision=state.menuRevision;
      const reply=await send('state'),options=reply.result?.nativeBuildOptions||[],index=options.indexOf(itemId);
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
      state.scroll.build=element('wt-page-content').scrollTop;state.page='';state.closes++;
      element('wt-command-pages').hidden=true;delete doc.body.dataset.commandPage;
      element('warzone-game-frame').inert=false;host.WarzoneHost?.restoreBattlefield?.();
      document.getElementById('canvas')?.focus({preventScroll:true});
      await setNativeHudHidden(true);
      renderSidebar();updateHUD();
    }catch(error){if(state.nativeMenu==='build')await closeNative(true);notify(error.message);}
    finally{state.pendingItem='';await releaseBattlefield();renderSidebar();}
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
  function selectMode(discard=false){
    if(discard)++state.cancelSerial;
    if(state.exitPromise){if(discard){state.nativePendingSites=[];window.__kalaWarzoneTouch?.releaseAll?.(true);}return state.exitPromise;}
    state.exitingBuild=true;++state.menuRevision;
    state.exitPromise=(async()=>{
      if(discard){state.nativePendingSites=[];window.__kalaWarzoneTouch?.releaseAll?.(true);}
      else{const started=Date.now();let warned=false;
        while(state.siteChecks||state.nativePendingSites.length||window.__kalaWarzoneTouch?.report().pendingClicks){flushNativeSites();window.__blockNightResearch?.pollOutput?.();if(!warned&&Date.now()-started>5000){warned=true;notify('Waiting for accepted game input. STOP cancels pending taps.');}await pause(40);}
      }
      state.buildOpen=false;element('wt-build-sidebar').hidden=true;cancelPlacement();window.__kalaWarzoneTouch?.releaseAll?.(true);await close();await closeNative(true);
      host.WarzoneHost?.restoreBattlefield?.();document.getElementById('canvas')?.focus({preventScroll:true});updateHUD();
    })().finally(()=>{state.exitPromise=null;state.exitingBuild=false;});return state.exitPromise;
  }
  async function afterBuildExit(action,discard=false){const navigation=++state.navigationSerial;await selectMode(discard);if(navigation===state.navigationSerial)return action();}
  async function selectNearbyTrucks(){const navigation=++state.navigationSerial;await selectMode();if(navigation!==state.navigationSerial)return;const selected=await openBuild(true);if(selected&&navigation===state.navigationSerial)await selectMode();}
  function cancelPlacement(){state.placement=null;window.WarzoneTerrain?.active(false);const ghost=document.getElementById('wt-build-ghost');if(ghost)ghost.hidden=true;updateHUD();}
  function previewAt(x,y){
    if(!state.placement)return null;const point=window.WarzoneTerrain?.pick(x,y);if(!point)return null;
    const item=state.placement,left=point.x-Math.floor(item.width/2),top=point.y-Math.floor(item.breadth/2);
    const points=[[left,top],[left+item.width,top],[left+item.width,top+item.breadth],[left,top+item.breadth]]
      .map(([a,b])=>window.WarzoneTerrain.project(a*128,b*128,point.height));
    const ghost=document.getElementById('wt-build-ghost');
    if(points.every(Boolean)&&ghost){ghost.hidden=false;ghost.setAttribute('width',innerWidth);ghost.setAttribute('height',innerHeight);
      ghost.querySelector('polygon').setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));
      const text=ghost.querySelector('text');text.setAttribute('x',x+12);text.setAttribute('y',y-12);text.textContent=`${item.name} · ${item.power} power`;}
    if(ghost){ghost.querySelector('polygon').setAttribute('stroke','#b5e56d');ghost.querySelector('polygon').setAttribute('fill','#a7cf5b44');}
    return point;
  }
  function placeAt(x,y){
    if(!state.placement)return false;
    const point=previewAt(x,y);if(!point){notify('No buildable terrain at this point. Tap the map after the view settles.');return true;}
    const item=state.placement;state.placements++;
    notify(`Queuing ${item.name}…`);
    send('queue-build',{itemId:item.id,x:point.x,y:point.y,session:state.session}).then(r=>{
      const polygon=document.getElementById('wt-build-ghost')?.querySelector('polygon');
      if(polygon&&!r.ok){polygon.setAttribute('stroke','#f28777');polygon.setAttribute('fill','#e2605044');}
      notify(r.ok?`${item.name} queued · ${r.result.workers.length} truck${r.result.workers.length===1?'':'s'} assigned`:reason(r.reason));requestState();});return true;
  }
  let validationTimer;
  function resetDraft(saved){
    state.designStep='body';clearTimeout(validationTimer);++state.validationSerial;state.validation=null;
    let n=1;while(state.saved.some(d=>d.name===`Design ${n}`))n++;
    state.draft=saved?JSON.parse(JSON.stringify(saved)):{id:`design-${Date.now()}-${++state.serial}`,name:`Design ${n}`,body:'',propulsion:'',turrets:['']};state.scroll.design=0;state.confirmNew=false;state.draftOriginal=JSON.stringify(state.draft);
  }
  function readDraft(){
    const d=state.draft;d.name=element('wt-design-name')?.value??d.name;
    // Hidden legacy selectors contain only researched parts. Their empty
    // placeholder must not erase a saved part that is locked in this battle.
    const read=(select,current)=>!select?current:select.value||(!(state.snapshot?.parts||[]).includes(current)?current:'');
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
  loadSaved();resetDraft();
  window.__warzoneCommands={tower:true,setSize:applySize,open,close,closeNative,beginPlacement,cancelPlacement,placeAt,previewAt,send,accept,
    hidePreview:()=>{const ghost=document.getElementById('wt-build-ghost');if(ghost)ghost.hidden=true;},
    isOpen:()=>Boolean(state.page),isPlacement:()=>Boolean(state.placement),nativeMenuOpen:()=>Boolean(state.nativeMenu&&state.nativeMenu!=='build'),nativeBuildOpen:()=>state.nativeMenu==='build',nativeBuildMenuOpen:()=>state.nativeMenu==='build'&&!state.nativeToolReady,nativeHudHidden:()=>state.nativeHudHidden,nativeBuildTap,nativeBuildMenuTap,queueNativeSite,selectMode,afterBuildExit,selectNearbyTrucks,openBuild,
    report:()=>({version:56,page:state.page,buildOpen:state.buildOpen,nativeHudHidden:state.nativeHudHidden,pendingItem:state.pendingItem,siteChecks:state.siteChecks,pending:state.pending.size,writes:state.writes,acks:state.acks,timeouts:state.timeouts,
      placements:state.placements,rejects:state.rejects,opens:state.opens,closes:state.closes,placement:state.placement?.id,
      session:state.session,nativeMenu:state.nativeMenu,nativeItem:state.nativeItem,nativeBuildGroup:state.nativeBuildGroup,nativeToolReady:state.nativeToolReady,nativePendingSites:state.nativePendingSites.length,exitingBuild:state.exitingBuild,nativeBuildPlaced:state.nativeBuildPlaced,nativeBuildSawWork:state.nativeBuildSawWork,buildingOpening:state.buildingOpening,saved:state.saved,history:state.history,snapshot:state.snapshot,terrain:window.WarzoneTerrain?.report()})};
  fetch('/warzone/command-catalog.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(c=>{state.catalog=c;render();}).catch(()=>notify('The command catalogue could not load. Restart the app.'));
  setInterval(()=>{
    if(!state.snapshot&&window.__kalaWarzoneTouch?.report().hudVisible)install();
    if(window.__kalaWarzoneTouch?.report().hudVisible&&Date.now()-state.lastPoll>(state.nativeMenu==='build'?250:state.page?1600:1200))requestState();
    if(state.pending.size){window.__blockNightResearch?.pollOutput?.();if(Date.now()-state.lastWrite>1500)flush(true);
      for(const p of state.pending.values())if(!p.warned&&Date.now()-p.at>12000){p.warned=true;state.timeouts++;if(p.command.action!=='state')notify(reason('timeout'));}}
  },150);
})();
