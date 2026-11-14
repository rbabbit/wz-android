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
  const producing = factory => factory.progress?.state === 'idle' && !factory.currentProduction ? false : Boolean(factory.active || factory.currentProduction || !factory.idle);
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
      const active = producing(factory), observation = game()?.__warzoneCommands?.productionStatus?.(factory);
      const design = observation ? observation.design : factory.currentProduction || factory.active?.design || null;
      const thumbnail = active && design ? game()?.__warzoneCommands?.recipeThumbnail?.(design) || null : null;
      return {id:factory.id, family, label:`${family === 'cyborg' ? 'CYBORG FACTORY' : family === 'vtol' ? 'VTOL FACTORY' : 'FACTORY'} ${index+1}`,
        name:active ? design?.name || design?.fullname || 'Unit being manufactured' : 'No active manufacturing', active, design, thumbnail,
        units:observation?.counts || '', activity:observation?.activity || (active ? 'PRODUCING' : 'READY'),
        productionPercent:observation?.percent ?? null, productionState:observation?.mode || 'unavailable', currentId:observation?.currentId || ''};
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
  panel.innerHTML = '<header class="wt-status-header"><img id="wt-status-mark" alt=""><h2 id="wt-status-title">RESEARCH</h2><small id="wt-status-count"></small></header><nav id="wt-status-families" aria-label="Factory family" hidden></nav><div id="wt-status-rows" tabindex="0" aria-label="Current activity; scroll for more"></div><p id="wt-status-empty" hidden></p>';
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
  function setText(element,text) { if (element.textContent !== text) element.textContent = text; }
  function makeRow(id) {
    const row = document.createElement('section'); row.dataset.statusRow = String(id); row.className = 'wt-status-row';
    row.innerHTML = '<img class="wt-status-image" alt=""><div class="wt-status-copy"><small class="wt-status-label"></small><strong class="wt-status-current"></strong><small class="wt-status-activity"></small><small class="wt-status-units" hidden></small><div class="wt-status-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>';
    row._parts = {image:row.querySelector('.wt-status-image'),
      label:row.querySelector('.wt-status-label'), name:row.querySelector('.wt-status-current'),
      activity:row.querySelector('.wt-status-activity'), units:row.querySelector('.wt-status-units'), progress:row.querySelector('.wt-status-progress'), bar:row.querySelector('.wt-status-progress i')};
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
      const source = isResearch ? item.image : item.thumbnail?.src || '';
      const failed = !isResearch && source && p.image.dataset.failedSource === source;
      p.image.hidden = !source || Boolean(failed);
      p.image.classList.toggle('wt-status-unit-image',!isResearch);
      p.image.alt = isResearch ? '' : item.name;
      row.classList.toggle('wt-status-no-art',!isResearch && (!source || Boolean(failed)));
      if (source && p.image.getAttribute('src') !== source) {
        delete p.image.dataset.failedSource;
        p.image.setAttribute('src',source);
        p.image.onerror = () => {
          if (p.image.getAttribute('src') !== source) return;
          p.image.onerror = null;
          if (isResearch) p.image.src = '/warzone/build-icons/A0ResearchFacility.png';
          else { p.image.dataset.failedSource = source; p.image.hidden = true; row.classList.add('wt-status-no-art'); }
        };
      } else if (!source) {
        p.image.onerror = null; p.image.removeAttribute('src'); delete p.image.dataset.failedSource;
      }
      const activity = isResearch ? item.waitingPower ? 'WAITING FOR POWER' : item.active && item.estimatedPercent === null ? 'RESEARCHING' : '' : item.activity;
      setText(p.activity,activity); p.activity.hidden = !activity;
      p.activity.classList.toggle('wt-status-producing',!isResearch && item.productionState === 'building');
      p.units.hidden = isResearch || !item.units;
      if (!isResearch) setText(p.units,item.units);
      const percent = isResearch ? item.estimatedPercent : item.productionPercent;
      const progress = percent !== null;
      p.progress.hidden = !progress;
      if (progress) {
        p.progress.setAttribute('aria-label',`${item.label}: ${isResearch ? 'estimated research progress' : 'current unit manufacturing progress'}`);
        p.progress.setAttribute('aria-valuenow',String(percent));
        p.progress.setAttribute('aria-valuetext',isResearch ? `${percent} percent estimated${item.waitingPower ? ', waiting for power' : ''}` : item.activity);
        p.progress.dataset.currentId = isResearch ? '' : item.currentId;
        p.bar.style.width = `${percent}%`;
      } else {
        p.progress.removeAttribute('aria-valuenow'); p.progress.removeAttribute('aria-valuetext');
        p.progress.dataset.currentId = ''; p.bar.style.width = '0%';
      }
    });
    present.forEach(row => row.remove());
    rows.hidden = !items.length; empty.hidden = Boolean(items.length);
    rows.dataset.kind = state.kind;
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
      setText(title,research ? 'RESEARCH' : 'MANUFACTURING');
      const image = research ? '/warzone/research-icons/Research%20Module.gif' : '/warzone/build-icons/A0LightFactory.png';
      if (mark.getAttribute('src') !== image) mark.setAttribute('src',image);
      const total = research ? labs.length : factories.length, active = research ? labs.filter(lab => lab.active).length : factories.filter(producing).length;
      setText(count,`${active}/${total} ${research ? 'ACTIVE' : 'FACTORIES ACTIVE'}`);
      panel.dataset.kind = state.kind;
      families.hidden = research;
      if (!research) renderFamilies(factories);
      renderRows(research ? labs : productionRows(data.commands.snapshot,state.family));
      state.updates++; state.error = '';
    } catch (error) { state.error = String(error.message || error); close(); }
  }

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
