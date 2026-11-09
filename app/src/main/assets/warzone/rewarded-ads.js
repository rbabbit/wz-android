/* Scoped native pause behind Android's ad cover. No wallet authority here.
 * Never stop the Emscripten scheduler: the game must own its clock pause. */
(() => {
  'use strict';
  if (window.WarzoneRewardedAds || window.__warzoneDuelConfig?.mode === 'duel') return;
  const session = window.__towersHtml?.session;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clock = () => Number(window.__warzoneTowersWaves?.report().snapshot?.gameTime);
  let hold = null;
  const active = entry => hold === entry && !entry.cancelled && window.__towersHtml?.isActive?.();
  const ready = (token, ok) => window.BlockNightAndroid?.adScreenReady?.(session, token, ok);
  const restored = (token, ok) => window.BlockNightAndroid?.adScreenRestored?.(session, token, ok);
  async function stableClock(entry, duration = 1400, timeout = 4500) {
    let last = clock(), since = performance.now();
    if (!Number.isFinite(last)) throw Error('The battlefield is not ready.');
    const end = since + timeout;
    while (active(entry) && performance.now() < end) {
      await sleep(150);
      const current = clock();
      if (!Number.isFinite(current)) throw Error('The native clock disappeared.');
      if (current !== last) { last = current; since = performance.now(); }
      else if (performance.now() - since >= duration) return last;
    }
    return null;
  }
  async function acquire(token) {
    if (hold || !session || !window.__towersHtml?.isActive?.()
        || window.WarzoneSavedGames?.report().busy || window.WarzoneRewards?.busy) {
      ready(token, false); return false;
    }
    const entry = hold = {token, owned:false, pauseSent:false, resumeSent:false, cancelled:false};
    try {
      const commands = window.__warzoneCommands;
      window.__kalaWarzoneTouch?.cancelFacilityNavigation?.();
      window.WarzoneRewards?.cancelTarget?.();
      if (commands?.report().buildOpen || commands?.report().nativeMenu === 'build') await commands.selectMode();
      window.__blockNightResearch?.close?.();
      if (commands?.report().page) await commands.close();
      if (commands?.report().nativeMenu) await commands.closeNative();
      window.__kalaWarzoneTouch?.releaseAll?.(true, false);
      if (!active(entry) || window.WarzoneSavedGames?.report().busy) throw Error('The battlefield changed.');
      if (!Number.isFinite(clock())) throw Error('No native clock.');
      // Preserve a match which was already paused by a different owner.
      const stopped = await stableClock(entry, 1400, 1800);
      if (!active(entry)) return false;
      if (stopped === null) {
        window.__kalaWarzoneTouch.nativePressKey('Escape', 'Escape', 27);
        entry.pauseSent = true;
        if (await stableClock(entry) === null) throw Error('The game did not pause.');
        entry.owned = true;
      }
      if (active(entry)) ready(token, true);
      return active(entry);
    } catch (_) { if (hold === entry) ready(token, false); return false; }
  }
  async function release(token) {
    const entry = hold;
    if (!entry || entry.token !== token) { restored(token, true); return true; }
    if (entry.pauseSent && !entry.owned && window.__towersHtml?.isActive?.()) {
      // Acquisition may have timed out before its pause was confirmed. Observe
      // again instead of toggling a still-running game into a new pause.
      const last = clock();
      await sleep(1500);
      if (hold !== entry) return true;
      if (!Number.isFinite(last) || !Number.isFinite(clock())) { restored(token, false); return false; }
      entry.owned = clock() === last;
    }
    entry.cancelled = true;
    if (!window.__towersHtml?.isActive?.() || !entry.owned) { hold = null; restored(token, true); return true; }
    const before = clock();
    if (!entry.resumeSent) {
      entry.resumeSent = true;
      window.__kalaWarzoneTouch.nativePressKey('Escape', 'Escape', 27);
    }
    const end = performance.now() + 6500;
    while (hold === entry && window.__towersHtml?.isActive?.() && performance.now() < end) {
      await sleep(150);
      if (clock() > before) { hold = null; restored(token, true); return true; }
    }
    // Retain the cover on failure. A retry only observes the same resume;
    // it never blindly toggles the native game a second time.
    restored(token, false); return false;
  }
  window.WarzoneRewardedAds = {acquire, release,
    report: () => ({session, held:Boolean(hold), token:hold?.token || '',
      owned:Boolean(hold?.owned), resumeSent:Boolean(hold?.resumeSent), clock:clock()})};
})();
