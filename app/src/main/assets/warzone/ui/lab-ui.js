/* Research and production activity dock. Observes the live battle. */
(() => {
  'use strict';
  if (window.TowersLab) return;
  const frame = () => document.getElementById('warzone-game-frame');
  const game = () => frame()?.contentWindow;
  const isCampaign = () => window.__warzoneCampaignMode === true || game()?.__warzoneCampaignMode === true;
  const isTowers = () => window.__warzoneDuelConfig?.mode !== 'duel' && game()?.__warzoneDuelConfig?.mode !== 'duel';
  const collapsible = !isTowers();
  let statusReady = Promise.resolve();
  if (isTowers()) {
    const theme = document.createElement('link');
    theme.rel = 'stylesheet'; theme.href = '/warzone/ui/towers-status.css'; document.head.appendChild(theme);
    statusReady = new Promise(resolve => {
      const script = document.createElement('script'); script.src = '/warzone/ui/towers-status.js';
      script.onload = resolve; script.onerror = resolve; document.head.appendChild(script);
    });
  }
  const state = {collapsed:false, updates:0, error:'', labs:0, researching:0, factories:0, producing:0, waiting:0};
  if (collapsible) try { state.collapsed = localStorage.getItem('lab-ops-collapsed') === 'true'; } catch (_) {}
  const dock = document.createElement('aside');
  dock.id = 'lab-ops';
  dock.hidden = true;
  dock.setAttribute('aria-label', isTowers() ? 'Analysis, manufacturing and Build' : 'Live research and production');
  dock.innerHTML = (collapsible ? '<button type="button" id="lab-ops-toggle" aria-controls="lab-ops-research lab-ops-production" aria-label="Collapse activity dock">−</button>' : '') + '<button type="button" id="lab-ops-research" data-lab-panel="research"><b>RESEARCH</b><small>Loading…</small></button><button type="button" id="lab-ops-production" data-lab-panel="factory"><b>PRODUCTION</b><small>Loading…</small></button>';
  if (isTowers()) {
    dock.querySelector('#lab-ops-research b').textContent = 'ANALYSIS';
    dock.querySelector('#lab-ops-production b').textContent = 'MANUFACTURING';
    const build = document.createElement('button');
    build.id = 'wt-open-build'; build.type = 'button'; build.dataset.footerBuild = 'true';
    build.innerHTML = '<b>BUILD</b><small>Structures</small>';
    build.title = 'Open or close construction';
    build.setAttribute('aria-label','Open or close Build');
    build.setAttribute('aria-controls','wt-build-sidebar');
    build.setAttribute('aria-expanded','false');
    dock.appendChild(build);
  }
  document.body.appendChild(dock);
  const toggle = dock.querySelector('#lab-ops-toggle');
  function collapse(value) {
    state.collapsed = collapsible && Boolean(value);
    if (state.collapsed) window.TowersStatus?.close();
    dock.dataset.collapsed = String(state.collapsed);
    if (toggle) {
      toggle.textContent = state.collapsed ? 'SHOW' : '−';
      toggle.setAttribute('aria-expanded', String(!state.collapsed));
      toggle.setAttribute('aria-label', state.collapsed ? 'Expand activity dock' : 'Collapse activity dock');
    }
    if (collapsible) try { localStorage.setItem('lab-ops-collapsed', String(state.collapsed)); } catch (_) {}
  }
  toggle?.addEventListener('click', () => collapse(!state.collapsed));
  dock.addEventListener('click', event => {
    const build = event.target.closest('[data-footer-build]');
    if (build && !build.disabled) {
      const w = game();
      if (isTowers() && !w?.__towersHtml?.isEnded?.()) w?.__kalaWarzoneTouch?.activateFooterBuild?.();
      return;
    }
    const target = event.target.closest('[data-lab-panel]');
    if (!target) return;
    const w = game();
    if (w?.__towersHtml?.isEnded?.()) return;
    if (isTowers()) {
      const showStatus = () => statusReady.then(() => window.TowersStatus?.toggle(target.dataset.labPanel));
      const commands = w?.__warzoneCommands, report = commands?.report?.();
      if (report?.buildOpen || report?.placement || report?.nativeMenu === 'build') {
        // The now-visible neighbouring tabs close Build through its existing
        // keep-orders path before opening an activity panel.
        commands.afterBuildExit?.(showStatus);
      } else showStatus();
      return;
    }
    if (target.dataset.labPanel === 'research') w?.__blockNightResearch?.open();
    else w?.__warzoneCommands?.open('factory');
  });
  function label(id, active, total, queued) {
    const button = dock.querySelector(id);
    const text = total ? `${active}/${total} active${queued ? ` · ${queued} queued` : ''}`
      : isCampaign() ? (id === '#lab-ops-research' ? 'No labs' : 'No factories') : 'Build to get started';
    const small = button.querySelector('small');
    if (small.textContent !== text) small.textContent = text;
    button.classList.toggle('lab-running', active > 0);
  }
  function update() {
    try {
      const w = game(), commands = w?.__warzoneCommands?.report(), touch = w?.__kalaWarzoneTouch?.report();
      const research = w?.__blockNightResearch?.report();
      window.TowersStatus?.update({commands,research,touch,ended:w?.__towersHtml?.isEnded?.()});
      const help = document.getElementById('warzone-towers-help-overlay');
      const buildMode = Boolean(commands?.buildOpen || commands?.placement || commands?.nativeMenu === 'build');
      // Build is now a footer toggle: it must remain reachable while its own
      // catalogue/placement is open. Full Research/manufacturing/help pages still
      // hide the activity dock exactly as before.
      dock.hidden = w?.__towersHtml?.isEnded?.() || !touch?.hudVisible || !commands?.snapshot || Boolean(commands.page || (commands.nativeMenu && commands.nativeMenu !== 'build') || research?.open || research?.opening || (help && !help.hidden));
      dock.dataset.buildOpen = String(buildMode);
      const build = dock.querySelector('[data-footer-build]');
      if (build) {
        build.setAttribute('aria-expanded', String(buildMode));
        build.setAttribute('aria-pressed', String(buildMode));
        build.classList.toggle('active', buildMode);
        build.querySelector('small').textContent = buildMode ? 'Tap to close' : 'Structures';
      }
      if (!commands?.snapshot) return;
      const labs = research?.labs || [], factories = commands.snapshot.factories.filter(f => f.ready);
      state.labs = labs.length;
      state.researching = labs.filter(lab => Boolean(lab.topicId) || (isTowers() && lab.idle === false)).length;
      state.factories = factories.length;
      state.producing = factories.filter(f => Boolean(f.active) || (isTowers() && Boolean(f.currentProduction)) || !f.idle).length;
      state.waiting = factories.reduce((n, f) => n + f.queue.length, 0);
      label('#lab-ops-research', state.researching, state.labs, isTowers() ? 0 : (research?.queues || []).reduce((n, q) => n + q.length, 0));
      label('#lab-ops-production', state.producing, state.factories, isTowers() ? 0 : state.waiting);
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
