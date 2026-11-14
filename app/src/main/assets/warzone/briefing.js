/* A short opening cover owns a real native pause, never the engine scheduler. */
(() => {
  'use strict';
  if (window.WarzoneBriefing || window.__warzoneDuelConfig?.mode === 'duel') return;
  const session = window.__towersHtml?.session;
  const clock = () => Number(window.__warzoneTowersWaves?.report?.().snapshot?.gameTime);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let hold = null;
  const active = entry => hold === entry && !entry.cancelled && window.__towersHtml?.isActive?.();
  async function prepare(expected) {
    if (!session || expected !== session || hold || !window.__towersHtml?.isActive?.()
        || !Number.isFinite(clock()) || window.WarzoneSavedGames?.busy
        || window.WarzoneRewards?.busy || window.WarzoneRewardedAds?.report?.().held) return false;
    const entry = hold = {phase:'pausing',cancelled:false,sent:false,resumeSent:false,owned:false};
    try {
      window.__kalaWarzoneTouch.releaseAll?.(true, false);
      window.__kalaWarzoneTouch.nativePressKey('Escape','Escape',27);
      entry.sent = true;
      let last = clock(), since = performance.now();
      const deadline = since + 4500;
      while (active(entry) && performance.now() < deadline) {
        await sleep(100);
        const current = clock();
        if (!Number.isFinite(current)) break;
        if (last !== current) { last = current; since = performance.now(); }
        else if (performance.now() - since >= 1200) {
          entry.owned = true; entry.phase = 'paused'; return true;
        }
      }
    } catch (_) { /* Keep the Android loading cover on failure. */ }
    if (hold === entry) entry.phase = 'error';
    return false;
  }
  async function release(expected) {
    const entry = hold;
    if (expected !== session || !entry || !entry.owned || !active(entry)) return false;
    const before = clock();
    if (!entry.resumeSent) {
      entry.resumeSent = true; entry.phase = 'resuming';
      window.__kalaWarzoneTouch.nativePressKey('Escape','Escape',27);
    }
    const deadline = performance.now() + 6500;
    while (active(entry) && performance.now() < deadline) {
      await sleep(100);
      if (clock() > before) { entry.phase = 'released'; entry.owned = false; return true; }
    }
    if (hold === entry) entry.phase = 'error';
    return false;
  }
  window.addEventListener('warzone-battle-ended', () => {
    if (hold) { hold.cancelled = true; hold.phase = 'ended'; }
  });
  window.WarzoneBriefing = {prepare, release,
    report:() => ({session,phase:hold?.phase || 'idle',owned:Boolean(hold?.owned),
      pauseSent:Boolean(hold?.sent),resumeSent:Boolean(hold?.resumeSent),clock:clock()})};
})();
