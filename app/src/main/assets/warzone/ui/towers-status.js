/* Towers field activity: observe current native work without changing the game. */
(() => {
  'use strict';
  const game = () => document.getElementById('warzone-game-frame')?.contentWindow;
  const isTowers = () => window.__warzoneDuelConfig?.mode !== 'duel' && game()?.__warzoneDuelConfig?.mode !== 'duel';
  if (window.TowersStatus || !isTowers()) return;

  const state = {kind:'', family:'vehicle', updates:0, error:'', parts:new Map(), catalogReady:false, latest:null, rows:[]};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = (a,b) => Number(a.id) - Number(b.id);
  const familyOf = factory => /cyborg/i.test(factory.kind || factory.type || '') ? 'cyborg' : /vtol/i.test(factory.kind || factory.type || '') ? 'vtol' : 'vehicle';
  const producing = factory => Boolean(factory.active || factory.currentProduction || !factory.idle);
  const researching = lab => Boolean(lab.topicId) || lab.idle === false;

  function researchRows(research) {
    return (research?.labs || []).slice().sort(byId).map((lab,index) => {
      const active = researching(lab), value = Number(lab.estimatedProgress);
      return {id:lab.id, label:`LAB ${index+1}`, name:active ? lab.topicName || 'Research in progress' : 'No active research / READY',
        active, waitingPower:Boolean(active && lab.waitingPower),
        estimatedPercent:active && lab.topicId && Number.isFinite(value) ? Math.min(99,Math.max(0,Math.floor(value*100))) : null,
        image:active && lab.topicName ? `/warzone/research-icons/${encodeURIComponent(lab.topicName)}.${lab.topicName === 'Avenger SAM' ? 'png' : 'gif'}` : '/warzone/build-icons/A0ResearchFacility.png'};
    });
  }

  function productionRows(snapshot, family) {
    const factories = (snapshot?.factories || []).filter(factory => factory.ready).slice().sort(byId);
    return factories.filter(factory => familyOf(factory) === family).map((factory,index) => {
      const active = producing(factory), design = factory.active?.design || factory.currentProduction || null;
      return {id:factory.id, family, label:`${family === 'cyborg' ? 'CYBORG FACTORY' : family === 'vtol' ? 'VTOL FACTORY' : 'FACTORY'} ${index+1}`,
        name:active ? design?.name || design?.fullname || 'Unit in production' : 'No active production', active, design};
    });
  }

  function read() {
    const w = game();
    return {commands:w?.__warzoneCommands?.report?.(), research:w?.__blockNightResearch?.report?.(),
      touch:w?.__kalaWarzoneTouch?.report?.(), ended:w?.__towersHtml?.isEnded?.()};
  }
  function allowed(data) {
    const commands = data?.commands, help = document.getElementById('warzone-towers-help-overlay');
    return isTowers() && !data?.ended && Boolean(data?.touch?.hudVisible && commands?.snapshot) &&
      !commands.page && !commands.buildOpen && !commands.placement && !commands.nativeMenu && !commands.nativeClosing &&
      !data.research?.open && !data.research?.opening && !(help && !help.hidden);
  }

  const panel = document.createElement('aside');
  panel.id = 'wt-status-panel'; panel.hidden = true;
  panel.setAttribute('aria-labelledby','wt-status-title');
  panel.innerHTML = '<header class="wt-status-header"><img id="wt-status-mark" alt=""><h2 id="wt-status-title">RESEARCH</h2><small id="wt-status-count"></small><button id="wt-status-close" type="button" aria-label="Close activity panel"><img src="/warzone/ui/icons/x.svg" alt=""></button></header><nav id="wt-status-families" aria-label="Factory family" hidden></nav><div id="wt-status-rows" tabindex="0" aria-label="Current activity; scroll for more"></div><p id="wt-status-empty" hidden></p>';
  document.body.appendChild(panel);
  const title = panel.querySelector('#wt-status-title'), mark = panel.querySelector('#wt-status-mark');
  const count = panel.querySelector('#wt-status-count'), families = panel.querySelector('#wt-status-families');
  const rows = panel.querySelector('#wt-status-rows'), empty = panel.querySelector('#wt-status-empty');

  function syncFooter() {
    document.querySelectorAll('#lab-ops [data-lab-panel]').forEach(button => {
      const kind = button.dataset.labPanel === 'research' ? 'research' : 'production';
      button.setAttribute('aria-controls','wt-status-panel');
      button.setAttribute('aria-expanded',String(state.kind === kind));
      button.classList.toggle('wt-status-selected',state.kind === kind);
    });
  }
  function close() {
    const wasOpen = Boolean(state.kind);
    state.kind = ''; panel.hidden = true;
    delete document.body.dataset.towersStatus;
    syncFooter();
    return wasOpen;
  }
  function open(kind) {
    if (kind === 'factory') kind = 'production';
    if (!['research','production'].includes(kind)) return false;
    const data = read();
    if (!allowed(data)) return false;
    state.kind = kind;
    const available = (data.commands.snapshot.factories || []).filter(f => f.ready).map(familyOf);
    if (!available.includes(state.family)) state.family = available[0] || 'vehicle';
    panel.hidden = false; document.body.dataset.towersStatus = kind;
    update(data); syncFooter();
    return true;
  }
  const toggle = kind => state.kind === (kind === 'factory' ? 'production' : kind) ? close() : open(kind);

  function componentIds(design) {
    if (!design) return [];
    const equipment = design.turrets?.length ? design.turrets : design.weapons?.length ? design.weapons :
      [design.construct,design.repair,design.brain,design.ecm,design.sensor].filter(id => id && !/null/i.test(id)).slice(0,1);
    return [design.body,design.propulsion,...equipment].filter(Boolean).map(part => typeof part === 'string' ? part : part.id || part.name).filter(Boolean);
  }
  function componentArt(id,index) {
    const part = state.parts.get(id), group = part?.group || (index === 0 ? 'Body' : index === 1 ? 'Propulsion' : 'Weapon');
    const label = part?.name || id;
    const source = part?.image ? `/warzone/${part.image}` : group === 'Construct' || /Spade/i.test(id) ? '/warzone/research-icons/Engineering.gif' : '';
    if (source) return `<span class="wt-status-part" title="${esc(label)}"><img src="${esc(source)}" alt="${esc(label)}"></span>`;
    // Match the established command-page silhouettes where the game has no exported thumbnail.
    const drawing = group === 'Body' ? '<path d="M22 12h20l9 13v22l-9 7H22l-9-7V25z"/><path d="M24 22h16l5 8v13H19V30z"/><circle cx="32" cy="33" r="7"/>' : group === 'Propulsion' ? '<path d="M21 13h22v38H21z"/><rect x="9" y="11" width="10" height="14" rx="3"/><rect x="9" y="39" width="10" height="14" rx="3"/><rect x="45" y="11" width="10" height="14" rx="3"/><rect x="45" y="39" width="10" height="14" rx="3"/>' : '<path d="M14 44l18-25 18 25zM23 44v10h18V44M32 19V9"/><circle cx="32" cy="34" r="5"/>';
    return `<span class="wt-status-part wt-status-part-fallback" role="img" aria-label="${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2">${drawing}</svg></span>`;
  }
  function setText(element,text) { if (element.textContent !== text) element.textContent = text; }
  function makeRow(id) {
    const row = document.createElement('section'); row.dataset.statusRow = String(id); row.className = 'wt-status-row';
    row.innerHTML = '<img class="wt-status-research-image" alt=""><div class="wt-status-parts"></div><div class="wt-status-copy"><small class="wt-status-label"></small><strong class="wt-status-current"></strong><small class="wt-status-activity"></small><div class="wt-status-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>';
    row._parts = {image:row.querySelector('.wt-status-research-image'), strip:row.querySelector('.wt-status-parts'),
      label:row.querySelector('.wt-status-label'), name:row.querySelector('.wt-status-current'),
      activity:row.querySelector('.wt-status-activity'), progress:row.querySelector('.wt-status-progress'), bar:row.querySelector('.wt-status-progress i')};
    return row;
  }
  function renderRows(items) {
    const present = new Map(Array.from(rows.children, row => [row.dataset.statusRow,row]));
    items.forEach((item,index) => {
      const key = String(item.id), row = present.get(key) || makeRow(item.id), p = row._parts;
      present.delete(key);
      if (rows.children[index] !== row) rows.insertBefore(row,rows.children[index] || null);
      row.dataset.active = String(item.active); row.dataset.kind = state.kind;
      setText(p.label,item.label); setText(p.name,item.name);
      const isResearch = state.kind === 'research';
      p.image.hidden = !isResearch;
      p.strip.hidden = isResearch || !item.design;
      row.classList.toggle('wt-status-no-art',!isResearch && !item.design);
      if (isResearch && p.image.getAttribute('src') !== item.image) {
        p.image.setAttribute('src',item.image);
        p.image.onerror = () => { p.image.onerror = null; p.image.src = '/warzone/build-icons/A0ResearchFacility.png'; };
      }
      const parts = isResearch ? [] : componentIds(item.design), signature = JSON.stringify([state.catalogReady,parts]);
      if (p.strip.dataset.signature !== signature) {
        p.strip.dataset.signature = signature; p.strip.innerHTML = parts.map(componentArt).join('');
      }
      const activity = isResearch ? item.waitingPower ? 'WAITING FOR POWER' : item.active && item.estimatedPercent === null ? 'RESEARCHING' : '' : item.active ? 'PRODUCING' : 'READY';
      setText(p.activity,activity); p.activity.hidden = !activity;
      p.activity.classList.toggle('wt-status-producing',!isResearch && item.active);
      const progress = isResearch && item.estimatedPercent !== null;
      p.progress.hidden = !progress;
      if (progress) {
        p.progress.setAttribute('aria-label',`${item.label}: estimated research progress`);
        p.progress.setAttribute('aria-valuenow',String(item.estimatedPercent));
        p.progress.setAttribute('aria-valuetext',`${item.estimatedPercent} percent estimated${item.waitingPower ? ', waiting for power' : ''}`);
        p.bar.style.width = `${item.estimatedPercent}%`;
      }
    });
    present.forEach(row => row.remove());
    rows.hidden = !items.length; empty.hidden = Boolean(items.length);
    setText(empty,state.kind === 'research' ? 'Build a Research Facility to begin.' : `No completed ${state.family === 'cyborg' ? 'cyborg ' : state.family === 'vtol' ? 'VTOL ' : ''}factories.`);
    state.rows = items;
  }
  function renderFamilies(factories) {
    const keys = ['vehicle','cyborg','vtol'].filter(key => factories.some(f => familyOf(f) === key));
    if (!keys.includes(state.family)) state.family = keys[0] || 'vehicle';
    const signature = JSON.stringify(keys);
    if (families.dataset.signature !== signature) {
      families.dataset.signature = signature;
      families.innerHTML = keys.map(key => `<button type="button" data-status-family="${key}"><b>${key === 'cyborg' ? 'CYBORGS' : key === 'vtol' ? 'VTOL' : 'VEHICLES'}</b><small></small></button>`).join('');
    }
    families.querySelectorAll('[data-status-family]').forEach(button => {
      const group = factories.filter(factory => familyOf(factory) === button.dataset.statusFamily);
      setText(button.querySelector('small'),`${group.filter(producing).length}/${group.length}`);
      button.setAttribute('aria-pressed',String(button.dataset.statusFamily === state.family));
    });
  }
  function update(data) {
    try {
      data = data || read(); state.latest = data;
      if (!allowed(data)) { close(); return; }
      if (!state.kind) return;
      const labs = researchRows(data.research), factories = (data.commands.snapshot.factories || []).filter(factory => factory.ready).slice().sort(byId);
      const research = state.kind === 'research';
      setText(title,research ? 'RESEARCH' : 'PRODUCTION');
      const image = research ? '/warzone/research-icons/Research%20Module.gif' : '/warzone/build-icons/A0LightFactory.png';
      if (mark.getAttribute('src') !== image) mark.setAttribute('src',image);
      const total = research ? labs.length : factories.length, active = research ? labs.filter(lab => lab.active).length : factories.filter(producing).length;
      setText(count,`${active}/${total} ACTIVE`);
      families.hidden = research;
      if (!research) renderFamilies(factories);
      renderRows(research ? labs : productionRows(data.commands.snapshot,state.family));
      state.updates++; state.error = '';
    } catch (error) { state.error = String(error.message || error); close(); }
  }

  panel.querySelector('#wt-status-close').addEventListener('click',close);
  families.addEventListener('click',event => {
    const button = event.target.closest('[data-status-family]');
    if (!button || button.dataset.statusFamily === state.family) return;
    state.family = button.dataset.statusFamily; rows.scrollTop = 0; update();
  });
  window.addEventListener('warzone-battle-ended',close);
  window.addEventListener('pagehide',close,{once:true});
  window.TowersStatus = {open,toggle,close,update,handleBack:() => close(),
    report:() => ({open:Boolean(state.kind),kind:state.kind,family:state.family,updates:state.updates,error:state.error,
      catalogReady:state.catalogReady,rows:state.rows.map(({design,...row}) => ({...row,components:componentIds(design)}))})};
  fetch('/warzone/command-catalog.json').then(response => {if (!response.ok) throw Error('catalogue'); return response.json();}).then(catalog => {
    Object.values(catalog.components || {}).flat().forEach(part => state.parts.set(part.id,part));
    state.catalogReady = true; update();
  }).catch(error => {state.error = `Component artwork unavailable: ${String(error.message || error)}`;});
})();
