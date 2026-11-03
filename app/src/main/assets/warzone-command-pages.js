/* Tower command pages: native-validated orders; app-private design library. */
(() => {
  'use strict';
  if (window.__warzoneCommands) return;
  const host = window.parent?.WarzoneHost ? window.parent : window;
  const doc = host.document;
  const PATH = '/data/mp/tests/warzone-towers-command.json';
  const state = {page:'',catalog:null,snapshot:null,pending:new Map(),serial:0,writes:0,acks:0,
    timeouts:0,lastWrite:0,lastPoll:0,nativeMenu:'',history:[],placement:null,session:'',category:'DEFENCES',search:'',
    selected:'',saved:[],draft:{id:'',name:'',body:'',propulsion:'',turrets:['']},validation:null,
    validationSerial:0,factory:0,notice:'',size:1,opens:0,closes:0,placements:0,rejects:0};
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
      state.saved=Array.isArray(value.designs)?value.designs.slice(0,100):[];
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
    const pending=state.pending.get(reply.nonce);if(!pending)return;
    state.pending.delete(reply.nonce);state.acks++;
    if(!['state','preview-build','validate-design'].includes(reply.action)){state.history.push(reply);state.history=state.history.slice(-100);}
    if(reply.action==='state'&&reply.ok){const before=state.snapshot;
      const changed=before&&(before.buildings.map(b=>b.id).join()!==reply.result.buildings.map(b=>b.id).join()||before.parts.join()!==reply.result.parts.join());
      state.snapshot=reply.result;updateHUD();refreshLive();if(changed&&['build','saved','factory'].includes(state.page))render();}
    if(!reply.ok)state.rejects++;
    pending.resolve(reply);flush(true);
  }
  window.addEventListener('warzone-command-reply',event=>accept(event.detail));
  function notify(message){
    state.notice=message;const target=element('wt-command-notice');if(target)target.textContent=message;
    const toast=element('wt-command-toast');if(toast){toast.textContent=message;toast.hidden=false;
      clearTimeout(toast._timer);toast._timer=setTimeout(()=>{toast.hidden=true;},4500);}
  }
  function image(item){return item?.image?`<img loading="lazy" src="/warzone/${esc(item.image)}" alt="">`:
    `<span class="wt-stock-fallback" aria-hidden="true">${item?.category==='MODULES'?'＋':item?.category==='DEFENCES'?'▣':'⬡'}</span>`;}
  function button(label,attrs='',kind=''){return `<button type="button" ${attrs} class="${kind}">${label}</button>`;}
  function availableBuildings(){const live=new Map((state.snapshot?.buildings||[]).map(b=>[b.id,b]));
    return (state.catalog?.buildings||[]).filter(b=>live.has(b.id)).map(b=>({...b,power:live.get(b.id).power}));}
  function availableParts(group){const available=new Set(state.snapshot?.parts||[]);
    return (state.catalog?.components[group]||[]).filter(p=>available.has(p.id));}
  function findPart(id){return Object.values(state.catalog?.components||{}).flat().find(p=>p.id===id);}
  function availableDesign(d){const parts=new Set(state.snapshot?.parts||[]);return [d.body,d.propulsion,...d.turrets].every(id=>parts.has(id));}

  function install(){
    if(element('wt-command-pages'))return;
    const link=doc.createElement('link');link.rel='stylesheet';link.href='/warzone/ui/command-pages.css';doc.head.appendChild(link);
    const panel=doc.createElement('section');panel.id='wt-command-pages';panel.hidden=true;
    panel.setAttribute('aria-label','Tower command centre');
    panel.innerHTML=`<header class="wt-command-title"><div><span class="wt-eyebrow">WARZONE TOWERS / COMMAND CENTRE</span><h1 id="wt-page-title">BUILD</h1></div>
      ${button('BACK TO BATTLE','data-action="back"','wt-primary')}</header>
      <nav id="wt-command-tabs" aria-label="Command pages">${['build','design','saved','factory','queue','more'].map(p=>button(p==='saved'?'SAVED DESIGNS':p.toUpperCase(),`data-page="${p}"`)).join('')}</nav>
      <div id="wt-command-notice" role="status" aria-live="polite"></div><div id="wt-page-content"></div>`;
    doc.body.appendChild(panel);
    panel.addEventListener('click',onClick);panel.addEventListener('input',onInput);panel.addEventListener('change',onChange);
    panel.addEventListener('submit',event=>event.preventDefault());
    const hud=doc.createElement('div');hud.id='wt-build-status';hud.hidden=true;
    hud.innerHTML=`<span id="wt-power">POWER —</span>${button('QUEUE 0','data-page="queue"')}<span id="wt-placement-label"></span>${button('CHANGE','data-page="build"')}${button('DONE','data-action="cancel-placement"')}`;
    hud.addEventListener('click',onClick);doc.body.appendChild(hud);
    const toast=doc.createElement('div');toast.id='wt-command-toast';toast.hidden=true;toast.setAttribute('role','status');doc.body.appendChild(toast);
    const ghost=document.createElementNS('http://www.w3.org/2000/svg','svg');ghost.id='wt-build-ghost';ghost.style.pointerEvents='none';
    const ghostStyle=document.createElement('style');ghostStyle.textContent='#wt-build-ghost{position:fixed;inset:0;z-index:2147483600;pointer-events:none}#wt-build-ghost[hidden]{display:none!important}';document.head.appendChild(ghostStyle);
    ghost.innerHTML='<polygon fill="#a7cf5b44" stroke="#b5e56d" stroke-width="2"/><text fill="#fff" stroke="#000" stroke-width=".4" font-size="13"/>';
    ghost.hidden=true;document.body.appendChild(ghost);
    const back=doc.createElement('button');back.id='wt-native-back';back.hidden=true;back.textContent='BACK TO BATTLE';back.addEventListener('click',()=>closeNative());doc.body.appendChild(back);
    doc.addEventListener('keydown',e=>{if(e.key==='Escape'){if(state.page)close();else if(state.placement)cancelPlacement();else if(state.nativeMenu)closeNative();}});
    applySize(state.size);
    const strip=element('warzone-command-strip');
    if(strip&&host.ResizeObserver){const resize=()=>{
      const hud=element('blocknight-combat-hud'),wave=element('warzone-towers-wave-hud');
      const height=Math.ceil(Math.max(hud?hud.offsetTop+hud.offsetHeight:0,wave?wave.offsetTop+wave.offsetHeight:0)+7);
      if(height>20){doc.documentElement.style.setProperty('--wt-command-top',`${height}px`);
        element('warzone-host')?.style.setProperty('grid-template-rows',`${height}px minmax(0,1fr)`);}
    };
      const observer=new host.ResizeObserver(resize);observer.observe(strip);if(element('blocknight-combat-hud'))observer.observe(element('blocknight-combat-hud'));
      host.addEventListener('resize',resize);resize();}
  }
  function open(page='build'){
    install();window.__blockNightResearch?.close?.();
    const help=element('warzone-towers-help-overlay');
    if(help&&!help.hidden)help.querySelector('.wt-help-back')?.click();
    if(state.nativeMenu)closeNative();
    if(page==='stats'||page==='commanders'){openNative(page);return;}
    if(state.page!==page)state.notice='';
    state.page=page;state.opens++;element('wt-command-pages').hidden=false;
    const frame=element('warzone-game-frame');if(frame)frame.inert=true;
    window.__kalaWarzoneTouch?.releaseAll?.();render();requestState();
  }
  function close(){
    if(!state.page)return;
    state.page='';state.closes++;element('wt-command-pages').hidden=true;
    const frame=element('warzone-game-frame');if(frame)frame.inert=false;
    host.WarzoneHost?.restoreBattlefield?.();document.getElementById('canvas')?.focus({preventScroll:true});
  }
  function openNative(menu){
    cancelPlacement();close();window.__blockNightResearch?.close?.();
    send('native-menu',{menu}).then(r=>{if(!r.ok){notify(reason(r.reason));return;}
      state.nativeMenu=menu;element('wt-native-back').hidden=false;document.getElementById('canvas')?.focus({preventScroll:true});});
  }
  function closeNative(){
    if(!state.nativeMenu)return Promise.resolve();
    state.nativeMenu='';element('wt-native-back').hidden=true;
    return send('native-menu',{menu:'close'}).then(r=>{if(!r.ok)notify(reason(r.reason));});
  }
  function requestState(){if(!Array.from(state.pending.values()).some(p=>p.command.action==='state'))send('state');state.lastPoll=Date.now();}
  function render(){
    if(!state.page)return;
    element('wt-page-title').textContent=({build:'BUILD',design:'DESIGN WORKSHOP',saved:'SAVED DESIGNS',factory:'FACTORY',queue:'BUILD QUEUE',more:'FIELD CONTROLS'})[state.page]||'BUILD';
    for(const tab of element('wt-command-tabs').querySelectorAll('button')){tab.classList.toggle('active',tab.dataset.page===state.page);tab.setAttribute('aria-current',tab.dataset.page===state.page?'page':'false');}
    const content=element('wt-page-content');
    if(!state.snapshot||!state.catalog){content.innerHTML='<p class="wt-empty">Connecting to the battlefield…</p>';return;}
    const pages={build:renderBuild,design:renderDesign,saved:renderSaved,factory:renderFactory,queue:renderQueue,more:renderMore};
    content.innerHTML=(pages[state.page]||renderBuild)();
    element('wt-command-notice').textContent=state.notice;
  }
  function renderBuild(){
    const items=availableBuildings().filter(b=>(state.category==='ALL'||b.category===state.category)&&b.name.toLowerCase().includes(state.search.toLowerCase()));
    return `<div class="wt-page-intro"><p>Choose a structure, then tap the battlefield to place it. Every placement queues.</p><span class="wt-tag" id="wt-build-mode">${builderMode()}</span></div>
      <div class="wt-filter-row"><div>${['DEFENCES','STRUCTURES','MODULES','ALL'].map(c=>button(c,`data-category="${c}"`,state.category===c?'active':'')).join('')}</div>
      <input id="wt-build-search" type="search" placeholder="Find a structure" aria-label="Find a structure" value="${esc(state.search)}"></div>
      <div class="wt-card-grid">${items.map(b=>`<article class="wt-command-card">${image(b)}<div><h2>${esc(b.name)}</h2><p>${b.width} × ${b.breadth} tiles <span>⚡ ${Math.round(b.power)}</span></p></div>
      ${button('BUILD THIS',`data-build="${esc(b.id)}"`,'wt-primary')}</article>`).join('')||'<p class="wt-empty">No structures in this category yet. Research more in TECH.</p>'}</div>`;
  }
  function selectOptions(group,selected,placeholder){return `<option value="">${placeholder}</option>`+availableParts(group).map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');}
  function turretOptions(selected){return '<option value="">Choose weapon or system</option>'+['Weapon','Construct','Repair','Sensor','ECM','Brain'].map(g=>{
    const parts=availableParts(g);return parts.length?`<optgroup label="${g}">${parts.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('')}</optgroup>`:'';}).join('');}
  function renderDesign(){
    const d=state.draft,b=findPart(d.body),slots=Math.min(3,b?.slots||1);
    return `<div class="wt-page-intro"><p>Design with the components you have researched. Warzone checks compatibility before saving.</p>${state.snapshot.hasHQ?'':'<span class="wt-tag">COMMAND CENTRE REQUIRED</span>'}</div>
      <div class="wt-design-layout"><form id="wt-design-form"><label>DESIGN NAME<input id="wt-design-name" maxlength="48" value="${esc(d.name)}" placeholder="Name your unit"></label>
      <div class="wt-design-step"><span>01</span><label>BODY<select id="wt-design-body">${selectOptions('Body',d.body,'Choose body')}</select></label>${image(b)}</div>
      <div class="wt-design-step"><span>02</span><label>PROPULSION<select id="wt-design-propulsion">${selectOptions('Propulsion',d.propulsion,'Choose propulsion')}</select></label>${image(findPart(d.propulsion))}</div>
      <div class="wt-design-step"><span>03</span><div>${Array.from({length:slots},(_,i)=>`<label>${i===0?'WEAPON / SYSTEM':'ADDITIONAL WEAPON (OPTIONAL)'}<select data-turret="${i}">${turretOptions(d.turrets[i]||'')}</select></label>`).join('')}</div>${image(findPart(d.turrets[0]))}</div>
      </form><aside class="wt-design-summary"><span class="wt-eyebrow">BLUEPRINT</span><h2 id="wt-blueprint-name">${esc(d.name||'New design')}</h2><p id="wt-design-valid">${state.validation?.ok?`POWER ${state.validation.result.cost} · BUILD POINTS ${state.validation.result.points}`:esc(state.validation?reason(state.validation.reason):'Choose components to validate your design.')}</p>
      ${button('SAVE DESIGN','data-action="save-design" id="wt-save-design"'+(!state.validation?.ok?' disabled':''),'wt-primary')}
      <p>Saved designs stay on this device. Produce them from FACTORY using normal power and build time.</p>${button('SAVED DESIGNS','data-page="saved"')}</aside></div>`;
  }
  function renderSaved(){return `<div class="wt-page-intro"><p>Your blueprints stay saved between games. Components must be researched in the current battle to produce them.</p>${button('NEW DESIGN','data-action="new-design"','wt-primary')}</div>
    <div class="wt-card-grid">${state.saved.map(d=>`<article class="wt-command-card">${image(findPart(d.turrets[0]))}<div><h2>${esc(d.name)}</h2><p>${esc(findPart(d.body)?.name||d.body)} · ${esc(findPart(d.propulsion)?.name||d.propulsion)}</p><p>${availableDesign(d)?`⚡ ${d.cost} · Available`:'Research required this game'}</p></div><div class="wt-card-actions">${button('EDIT',`data-edit="${esc(d.id)}"`)}${button('PRODUCE',`data-produce-design="${esc(d.id)}"`+(availableDesign(d)?'':' disabled'),'wt-primary')}${button('DELETE',`data-delete="${esc(d.id)}"`,'wt-subtle')}</div></article>`).join('')||'<p class="wt-empty">No saved designs yet. Open DESIGN to create your first blueprint.</p>'}</div>`;}
  function renderFactory(){
    const factories=state.snapshot.factories.filter(f=>f.ready);if(!factories.some(f=>f.id===state.factory))state.factory=factories[0]?.id||0;
    const factory=factories.find(f=>f.id===state.factory);
    const designs=state.saved.filter(availableDesign);
    return `<div class="wt-page-intro"><p>Production uses normal factory time and power. Additional units queue behind the current job.</p>${button('FACTORY CONTROLS','data-action="native-factory"')}</div>
      ${factory?`<div class="wt-filter-row"><label>FACTORY <select id="wt-factory-select">${factories.map(f=>`<option value="${f.id}" ${f.id===state.factory?'selected':''}>${esc(f.kind||'Factory')} ${f.number} · ${f.modules} module${f.modules===1?'':'s'}</option>`).join('')}</select></label><label>QUANTITY <select id="wt-produce-count"><option>1</option><option>5</option><option>10</option><option>20</option></select></label></div>
      <div id="wt-factory-progress">${factoryProgress(factory)}</div><h2 class="wt-section-title">SAVED DESIGNS</h2><div class="wt-card-grid">${designs.map(d=>productionCard(d,false)).join('')||'<p>No researched saved designs yet.</p>'}</div>
      <h2 class="wt-section-title">EXISTING UNIT DESIGNS</h2><div class="wt-card-grid">${state.snapshot.templates.filter(d=>!factory.templates||factory.templates.includes(d.id)).map(d=>productionCard(d,true)).join('')||'<p>No existing designs.</p>'}</div>`:
      '<p class="wt-empty">No completed factory. Open BUILD → STRUCTURES to place one.</p>'}`;
  }
  function productionCard(d,native){return `<article class="wt-command-card">${image(findPart(d.turrets?.[0]||d.weapons?.[0]))}<div><h2>${esc(d.fullname||d.name)}</h2><p>⚡ ${d.cost}</p></div>${button('PRODUCE',native?`data-produce-template="${esc(d.id)}"`:`data-produce="${esc(d.id)}"`,'wt-primary')}</article>`;}
  function factoryProgress(f){return `<p>${f.active?`PRODUCING: ${esc(f.active.design.name)}`:f.idle?'IDLE':'PRODUCING FROM FACTORY CONTROLS'} · ${f.queue.length} queued</p>${f.queue[0]?.status==='blocked'?`<p>${esc(reason(f.queue[0].reason))} ${button('RETRY',`data-retry-production="${f.id}"`)}</p>`:''}${f.queue.length?button('CLEAR WAITING QUEUE',`data-clear-production="${f.id}"`):''}`;}
  function renderQueue(){return `<div class="wt-page-intro"><p>Orders run in order for each truck. A blocked site keeps its place until you retry or remove it.</p><span class="wt-tag">${state.snapshot.jobs.length} JOBS</span></div>
    <div id="wt-queue-list">${queueRows()}</div>`;}
  function queueRows(){return state.snapshot.jobs.map((j,i)=>`<article class="wt-queue-row"><b>${i+1}</b><div><h2>${esc(state.catalog.buildings.find(b=>b.id===j.itemId)?.name||j.itemId)}</h2><p>Tile ${j.x}, ${j.y} · ${j.automatic?'Auto truck':`${j.workers.length} selected truck${j.workers.length===1?'':'s'}`} · ${j.status.toUpperCase()}</p>${j.reason?`<p>${esc(reason(j.reason))}</p>`:''}</div>${j.status==='blocked'?button('RETRY',`data-retry-job="${esc(j.id)}"`):''}${button('REMOVE',`data-cancel-job="${esc(j.id)}"`)}</article>`).join('')||'<p class="wt-empty">The construction queue is clear.</p>';}
  function builderMode(){const count=state.snapshot?.trucks.filter(t=>t.selected).length||0;return `${count?`${count} TRUCK${count===1?'':'S'} SELECTED`:'AUTO TRUCK'} · ALWAYS QUEUE`;}
  function renderMore(){return `<div class="wt-page-intro"><p>Battle controls and interface size.</p></div><div class="wt-more-grid">${button('SELECT ALL COMBAT UNITS','data-control="toggleCombatLock"')}${button('AUTO PATROL','data-control="toggleAutoFight"')}${button('BOX SELECT → DRAG ON BATTLEFIELD','data-control="toggleBoxMode"')}${button('COMMANDERS','data-action="commanders"')}</div>
    <label class="wt-size-label">CONTROL SIZE <select id="wt-command-size">${[[1,'Standard'],[1.2,'Large'],[1.4,'Extra large']].map(([v,label])=>`<option value="${v}" ${state.size===v?'selected':''}>${label}</option>`).join('')}</select></label><p>BUILD queues automatically. Select your own trucks to use that group, or let the nearest reachable truck handle the placement session.</p>`;}
  function refreshLive(){
    if(element('wt-build-mode'))element('wt-build-mode').textContent=builderMode();
    if(state.page==='queue'&&element('wt-queue-list'))element('wt-queue-list').innerHTML=queueRows();
    else if(state.page==='factory'&&element('wt-factory-progress')){const f=state.snapshot.factories.find(f=>f.id===state.factory);if(f)element('wt-factory-progress').innerHTML=factoryProgress(f);else render();}
    else if(state.page&&element('wt-page-content')?.querySelector('.wt-empty')?.textContent.includes('Connecting'))render();
  }
  function updateHUD(){
    install();const hud=element('wt-build-status');hud.hidden=!state.snapshot;
    if(!state.snapshot)return;
    element('wt-power').textContent=`POWER ${Math.floor(state.snapshot.power)}`;
    const queue=hud.querySelector('[data-page="queue"]');queue.textContent=`QUEUE ${state.snapshot.jobs.length}`;
    hud.classList.toggle('placing',Boolean(state.placement));
    element('wt-placement-label').textContent=state.placement?`${state.placement.name} · TAP TO QUEUE`:'';
    for(const b of hud.querySelectorAll('[data-action="cancel-placement"], [data-page="build"]'))b.hidden=!state.placement;
  }
  function beginPlacement(id){
    const item=availableBuildings().find(b=>b.id===id);if(!item)return;
    if(!state.snapshot.trucks.length){notify(reason('no-truck'));return;}
    state.placement=item;state.session=`site-${Date.now()}-${++state.serial}`;
    window.WarzoneTerrain?.active(true);close();updateHUD();
    notify(`${item.name}: tap open ground to queue. Drag to pan; DONE ends placement.`);
  }
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
  function readDraft(){
    const d=state.draft;d.name=element('wt-design-name')?.value??d.name;
    d.body=element('wt-design-body')?.value??d.body;d.propulsion=element('wt-design-propulsion')?.value??d.propulsion;
    const selects=element('wt-design-form')?.querySelectorAll('[data-turret]');if(selects)d.turrets=Array.from(selects).map(s=>s.value).filter(Boolean);
  }
  let validationTimer;
  function validateDraft(){
    clearTimeout(validationTimer);state.validation=null;const version=++state.validationSerial;
    if(element('wt-save-design'))element('wt-save-design').disabled=true;
    validationTimer=setTimeout(()=>{readDraft();const draft=JSON.parse(JSON.stringify(state.draft));
      send('validate-design',{design:draft}).then(r=>{if(version!==state.validationSerial)return;state.validation=r;
        const label=element('wt-design-valid');if(label)label.textContent=r.ok?`POWER ${r.result.cost} · BUILD POINTS ${r.result.points}`:reason(r.reason);
        const save=element('wt-save-design');if(save)save.disabled=!r.ok;});},220);
  }
  function saveDesign(){
    readDraft();const draft=JSON.parse(JSON.stringify(state.draft));const version=state.validationSerial;
    element('wt-save-design').disabled=true;
    send('save-design',{design:draft}).then(r=>{
      if(!r.ok){notify(reason(r.reason));return;}
      const d={...r.result,id:draft.id||`design-${Date.now()}-${++state.serial}`};delete d.native;
      const before=state.saved.slice(),index=state.saved.findIndex(v=>v.id===d.id);
      if(index<0&&state.saved.length>=100){notify('The library holds 100 designs. Delete a design first.');return;}
      if(index>=0)state.saved[index]=d;else state.saved.push(d);
      if(!persist()){state.saved=before;notify('Could not save to this device. Try again.');return;}
      if(version===state.validationSerial)state.draft=d;
      notify(`${d.name} saved on this device.`);open('saved');});
  }
  function applySize(value){state.size=Math.max(1,Math.min(1.4,Number(value)||1));doc.documentElement.style.setProperty('--wt-command-scale',state.size);
    try{localStorage.setItem('wt-command-size',String(state.size));}catch(_){} }
  function onInput(event){
    if(event.target.id==='wt-build-search'){state.search=event.target.value;const start=event.target.selectionStart;render();const search=element('wt-build-search');search.focus();try{search.setSelectionRange(start,start);}catch(_){} }
    if(event.target.closest('#wt-design-form')){readDraft();if(element('wt-blueprint-name'))element('wt-blueprint-name').textContent=state.draft.name||'New design';
      const parts=[state.draft.body,state.draft.propulsion,state.draft.turrets[0]];
      element('wt-design-form').querySelectorAll('.wt-design-step').forEach((step,i)=>{const wrap=doc.createElement('div');wrap.innerHTML=image(findPart(parts[i]));step.lastElementChild.replaceWith(wrap.firstElementChild);});
      validateDraft();}
  }
  function onChange(event){
    const target=event.target;
    if(target.id==='wt-design-body'){readDraft();state.draft.turrets=state.draft.turrets.slice(0,Math.min(3,findPart(state.draft.body)?.slots||1));state.validation=null;render();validateDraft();}
    if(target.id==='wt-factory-select'){state.factory=Number(target.value);render();}
    if(target.id==='wt-command-size')applySize(target.value);
  }
  function onClick(event){
    const b=event.target.closest('button');if(!b||b.disabled)return;
    const d=b.dataset;
    if(d.page)open(d.page);
    else if(d.category){state.category=d.category;render();}
    else if(d.build)beginPlacement(d.build);
    else if(d.edit){const saved=state.saved.find(s=>s.id===d.edit);if(saved){state.draft=JSON.parse(JSON.stringify(saved));state.validation=null;open('design');validateDraft();}}
    else if(d.delete){const before=state.saved.slice();state.saved=state.saved.filter(s=>s.id!==d.delete);if(!persist())state.saved=before;render();}
    else if(d.produceDesign){state.selected=d.produceDesign;open('factory');}
    else if(d.produce||d.produceTemplate){
      const count=Number(element('wt-produce-count')?.value||1);
      const design=state.saved.find(s=>s.id===d.produce);
      send('queue-production',{factoryId:state.factory,count,...(d.produceTemplate?{templateId:d.produceTemplate}:{design})}).then(r=>{notify(r.ok?`${count} unit${count===1?'':'s'} queued for production.`:reason(r.reason));requestState();});
    }
    else if(d.cancelJob||d.retryJob)send(d.cancelJob?'cancel-job':'retry-job',{jobId:d.cancelJob||d.retryJob}).then(r=>{if(!r.ok)notify(reason(r.reason));requestState();});
    else if(d.clearProduction||d.retryProduction)send(d.clearProduction?'clear-production':'retry-production',{factoryId:Number(d.clearProduction||d.retryProduction)}).then(()=>requestState());
    else if(d.control){window.__kalaWarzoneTouch?.[d.control]?.();close();}
    else if(d.action==='back')close();
    else if(d.action==='cancel-placement')cancelPlacement();
    else if(d.action==='save-design')saveDesign();
    else if(d.action==='new-design'){state.draft={id:'',name:'',body:'',propulsion:'',turrets:['']};state.validation=null;open('design');}
    else if(d.action==='native-factory')openNative('factory');
    else if(d.action==='commanders')openNative('commanders');
  }
  loadSaved();
  window.__warzoneCommands={tower:true,open,close,closeNative,beginPlacement,cancelPlacement,placeAt,previewAt,send,accept,
    hidePreview:()=>{const ghost=document.getElementById('wt-build-ghost');if(ghost)ghost.hidden=true;},
    isOpen:()=>Boolean(state.page),isPlacement:()=>Boolean(state.placement),nativeMenuOpen:()=>Boolean(state.nativeMenu),
    report:()=>({version:48,page:state.page,pending:state.pending.size,writes:state.writes,acks:state.acks,timeouts:state.timeouts,
      placements:state.placements,rejects:state.rejects,opens:state.opens,closes:state.closes,placement:state.placement?.id,
      session:state.session,saved:state.saved,history:state.history,snapshot:state.snapshot,terrain:window.WarzoneTerrain?.report()})};
  fetch('/warzone/command-catalog.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(c=>{state.catalog=c;render();}).catch(()=>notify('The command catalogue could not load. Restart the app.'));
  setInterval(()=>{
    if(!state.snapshot&&window.__kalaWarzoneTouch?.report().hudVisible)install();
    if(window.__kalaWarzoneTouch?.report().hudVisible&&Date.now()-state.lastPoll>(state.page?1600:2800))requestState();
    if(state.pending.size){window.__blockNightResearch?.pollOutput?.();if(Date.now()-state.lastWrite>1500)flush(true);
      for(const p of state.pending.values())if(!p.warned&&Date.now()-p.at>12000){p.warned=true;state.timeouts++;if(p.command.action!=='state')notify(reason('timeout'));}}
  },150);
})();
