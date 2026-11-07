/* Research and production activity dock. Observes the live battle. */
(() => {
  'use strict';
  if (window.TowersLab) return;
  const frame = () => document.getElementById('warzone-game-frame');
  const game = () => frame()?.contentWindow;
  const state = {collapsed:false, updates:0, error:'', labs:0, researching:0, factories:0, producing:0, waiting:0};
  try { state.collapsed = localStorage.getItem('lab-ops-collapsed') === 'true'; } catch (_) {}
  const dock = document.createElement('aside');
  dock.id = 'lab-ops';
  dock.hidden = true;
  dock.setAttribute('aria-label', 'Live research and production');
  dock.innerHTML = '<button type="button" id="lab-ops-toggle" aria-controls="lab-ops-research lab-ops-production" aria-label="Collapse activity dock">−</button><button type="button" id="lab-ops-research" data-lab-panel="research"><b>RESEARCH</b><small>Loading…</small></button><button type="button" id="lab-ops-production" data-lab-panel="factory"><b>PRODUCTION</b><small>Loading…</small></button>';
  document.body.appendChild(dock);
  const toggle = dock.querySelector('#lab-ops-toggle');
  function collapse(value) {
    state.collapsed = Boolean(value);
    dock.dataset.collapsed = String(state.collapsed);
    toggle.textContent = state.collapsed ? 'SHOW' : '−';
    toggle.setAttribute('aria-expanded', String(!state.collapsed));
    toggle.setAttribute('aria-label', state.collapsed ? 'Expand activity dock' : 'Collapse activity dock');
    try { localStorage.setItem('lab-ops-collapsed', String(state.collapsed)); } catch (_) {}
  }
  toggle.addEventListener('click', () => collapse(!state.collapsed));
  dock.addEventListener('click', event => {
    const target = event.target.closest('[data-lab-panel]');
    if (!target) return;
    const w = game();
    if (w?.__towersHtml?.isEnded?.()) return;
    if (target.dataset.labPanel === 'research') w?.__blockNightResearch?.open();
    else w?.__warzoneCommands?.open('factory');
  });
  function label(id, active, total, queued) {
    const button = dock.querySelector(id);
    const text = total ? `${active}/${total} active${queued ? ` · ${queued} queued` : ''}` : 'Build to get started';
    const small = button.querySelector('small');
    if (small.textContent !== text) small.textContent = text;
    button.classList.toggle('lab-running', active > 0);
  }
  function update() {
    try {
      const w = game(), commands = w?.__warzoneCommands?.report(), touch = w?.__kalaWarzoneTouch?.report();
      const research = w?.__blockNightResearch?.report();
      const help = document.getElementById('warzone-towers-help-overlay');
      dock.hidden = w?.__towersHtml?.isEnded?.() || !touch?.hudVisible || !commands?.snapshot || Boolean(commands.page || commands.buildOpen || commands.placement || commands.nativeMenu || research?.open || research?.opening || (help && !help.hidden));
      if (!commands?.snapshot) return;
      const labs = research?.labs || [], factories = commands.snapshot.factories.filter(f => f.ready);
      state.labs = labs.length;
      state.researching = labs.filter(lab => Boolean(lab.topicId)).length;
      state.factories = factories.length;
      state.producing = factories.filter(f => Boolean(f.active) || !f.idle).length;
      state.waiting = factories.reduce((n, f) => n + f.queue.length, 0);
      label('#lab-ops-research', state.researching, state.labs, (research?.queues || []).reduce((n, q) => n + q.length, 0));
      label('#lab-ops-production', state.producing, state.factories, state.waiting);
      state.updates++;
    } catch (error) { state.error = String(error.message || error); dock.hidden = true; }
  }
  collapse(state.collapsed);
  const timer = setInterval(update, 750);
  addEventListener('warzone-battle-ended', () => { dock.hidden = true; });
  addEventListener('pagehide', () => clearInterval(timer), {once:true});
  update();
  window.TowersLab = {report:() => ({...state, visible:!dock.hidden})};
})();
