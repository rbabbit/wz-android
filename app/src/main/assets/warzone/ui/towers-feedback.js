/* Towers control feel only: observes input, never issues a game command. */
(() => {
  'use strict';
  if (window.TowersFeedback || window.__warzoneDuelConfig?.mode === 'duel') return;
  const surface = document;
  const root = () => window.parent?.WarzoneHost ? window.parent : window;
  const game = () => root().document.getElementById('warzone-game-frame')?.contentWindow || window;
  const scope = '#blocknight-combat-hud,#wt-field-centre,#wt-field-toggle,#lab-ops,#wt-build-sidebar,#wt-command-pages,#blocknight-research-shell,#warzone-towers-help,#wt-map-music-menu,#wt-wave-incoming,#warzone-towers-wave-hud,#wt-intelligence-panel,#wt-demolish-bar,#wt-game-notice';
  const slop = Math.round(5 + Math.max(1, Math.min(3, window.devicePixelRatio || 1)));
  const recent = new WeakMap();
  const counters = {presses:0,releases:0,cancellations:0,sounds:0};
  let press = null, cancelledPointer = null, audio = null, lastSound = -Infinity;
  function eligible(button) {
    return Boolean(button?.isConnected && !button.disabled
      && button.getAttribute('aria-disabled') !== 'true'
      && button.closest(scope) && !button.closest('[hidden],[inert]')
      && surface.body.classList.contains('wt-towers-polished'));
  }
  function control(target) {
    const button = target?.closest?.('button,[role="button"]');
    return eligible(button) ? button : null;
  }
  function clear(cancelled = false) {
    if (!press) return;
    press.button.classList.remove('wt-pressing');
    if (cancelled && !press.key) {
      // A drag can finish long after it first leaves the button. Keep the
      // cancelled identity until release so a late compatibility click is quiet.
      cancelledPointer = {button:press.button,id:press.id};
      recent.set(press.button,performance.now());
    }
    press = null;
    if (cancelled) counters.cancellations++;
  }
  function within(button, x, y) {
    const rect = button.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }
  function soundLevel() {
    // Native configuration maps voicevol to UI sound and fxvol to 3D effects.
    // openal_track.cpp initializes both to 1.0 when the optional keys are absent.
    // An explicit mute in either setting keeps this extra control feedback quiet.
    try {
      const w = game(), module = w.LaunchedModule || w.Module;
      const folder = module?.WZVAL_configDirPath;
      if (!folder || !module?.FS?.readFile) return 0;
      const config = module.FS.readFile(folder + '/config', {encoding:'utf8'});
      const ui = config.match(/^voicevol\s*=\s*(\d+)/m)?.[1];
      const effects = config.match(/^fxvol\s*=\s*(\d+)/m)?.[1];
      if (effects !== undefined && Number(effects) === 0) return 0;
      return ui === undefined ? 1 : Math.min(1, Math.max(0, Number(ui) / 100));
    } catch (_) { return 0; }
  }
  function actuated(button) {
    if (!eligible(button)
        || button.closest('#wt-intelligence-panel,#wt-game-notice[data-research-topic]')) return;
    const now = performance.now(), level = soundLevel();
    // Duplicate compatibility clicks and rapid focus changes must never stack
    // audio. This is feedback for actuation, not an assertion of engine success.
    if (!(level > 0) || now - lastSound < 70) return;
    try {
      if (!audio) { audio = new Audio('/warzone/ui/game-controls/click.ogg'); audio.preload = 'none'; }
      audio.volume = Math.min(.30, level * .30);
      audio.currentTime = 0;
      lastSound = now;
      const result = audio.play();
      result?.then?.(() => { counters.sounds++; }).catch?.(() => {});
    } catch (_) { /* A silent/unavailable feedback clip must never block input. */ }
  }
  surface.addEventListener('pointerdown', event => {
    if (event.isTrusted === false || event.isPrimary === false || event.button !== 0) return;
    clear(true);
    cancelledPointer = null;
    const button = control(event.target);
    if (!button) return;
    press = {button,id:event.pointerId,x:event.clientX,y:event.clientY,key:''};
    button.classList.add('wt-pressing'); counters.presses++;
  }, {capture:true,passive:true});
  surface.addEventListener('pointermove', event => {
    if (!press || press.key || event.pointerId !== press.id) return;
    if (!eligible(press.button) || Math.hypot(event.clientX - press.x, event.clientY - press.y) > slop
        || !within(press.button,event.clientX,event.clientY)) clear(true);
  }, {capture:true,passive:true});
  surface.addEventListener('pointerup', event => {
    if (cancelledPointer?.id === event.pointerId) {
      recent.set(cancelledPointer.button,performance.now());
      cancelledPointer = null;
      return;
    }
    if (!press || press.key || event.pointerId !== press.id) return;
    const value = press;
    const valid = eligible(value.button) && within(value.button,event.clientX,event.clientY)
      && Math.hypot(event.clientX - value.x,event.clientY - value.y) <= slop;
    clear(!valid);
    if (!valid) return;
    recent.set(value.button,performance.now()); counters.releases++;
    actuated(value.button);
  }, {capture:true,passive:true});
  surface.addEventListener('pointercancel', () => {
    clear(true);
    if (cancelledPointer) recent.set(cancelledPointer.button,performance.now());
    cancelledPointer = null;
  }, {capture:true,passive:true});
  surface.addEventListener('keydown', event => {
    if (event.isTrusted === false || !['Enter',' '].includes(event.key) || event.repeat) return;
    const button = control(event.target);
    if (!button) return;
    clear(true); press = {button,key:event.key};
    button.classList.add('wt-pressing'); counters.presses++;
  }, {capture:true,passive:true});
  surface.addEventListener('keyup', event => {
    if (press?.key === event.key) clear();
  }, {capture:true,passive:true});
  surface.addEventListener('click', event => {
    if (event.isTrusted === false) return;
    const button = control(event.target);
    const compatibility = event.detail > 0 || event.pointerType === 'touch';
    if (!button || compatibility && performance.now() - (recent.get(button) ?? -Infinity) < 700) return;
    actuated(button);
  }, {capture:true,passive:true});
  surface.addEventListener('focusout', event => { if (press?.key && event.target === press.button) clear(true); }, true);
  const observer = new MutationObserver(() => { if (press && !eligible(press.button)) clear(true); });
  observer.observe(surface.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','aria-disabled','hidden','inert']});
  surface.addEventListener('visibilitychange', () => {
    if (surface.hidden) { clear(true); try { audio?.pause(); } catch (_) {} }
  });
  window.addEventListener('blur', () => clear(true));
  window.addEventListener('pagehide', () => { clear(true); observer.disconnect(); try { audio?.pause(); } catch (_) {} }, {once:true});
  window.TowersFeedback = {reset:() => clear(true),report:() => ({...counters,pressing:Boolean(press)})};
})();
