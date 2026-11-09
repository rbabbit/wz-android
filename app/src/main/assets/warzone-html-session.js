/* HTML interface transport and per-battle Android lifecycle. */
(() => {
  'use strict';
  if (window.__towersHtml) return;
  const session = new URLSearchParams(location.search).get('battle_session') || window.__towersHtmlSession || '';
  const config=window.__warzoneDuelConfig;
  const duel=config?.mode==='duel'&&Object.isFrozen(config),mode=duel?'duel':'tower-defense';
  let result = '', phase = 'loading', exitReason = '', menuRequested = false;
  function activate(wave) {
    // Only a packet emitted by the running scenario establishes a battle.
    // Pausing stops scenario ticks; absence of a packet is never an exit.
    if (phase === 'ended' || !wave || wave.mode !== mode) return false;
    if(duel&&(!['active','victory','defeated'].includes(wave.phase)||wave.humanBranch!==config.humanBranch||wave.botBranch!==config.botBranch))return false;
    if (!duel) {
      const credited = window.BlockNightAndroid?.rewardProgress?.(session, JSON.stringify({
        wave:wave.wave, phase:wave.phase, completedWaves:wave.completedWaves || [], rewards:wave.rewards || null}));
      if (Number(credited) > 0) window.WarzoneRewards?.waveCredited?.(Number(credited));
    }
    if (phase === 'playing') return true;
    phase = 'playing';
    window.__kalaWarzoneTouch?.setBattleActive?.(true);
    window.parent?.WarzoneHost?.setPlaying?.();
    return true;
  }
  function retire(reason) {
    if (phase === 'ended') return false;
    phase = 'ended'; exitReason = reason;
    // This runs synchronously inside the native log callback, before the
    // engine can paint or accept taps on its stock frontend.
    window.parent?.WarzoneHost?.endBattle?.();
    window.__kalaWarzoneTouch?.setBattleActive?.(false);
    window.__kalaWarzoneTouch?.releaseAll?.(true);
    window.WarzoneBuildDisplay?.reset?.();
    window.dispatchEvent(new CustomEvent('warzone-battle-ended', {detail:{reason}}));
    return true;
  }
  function exit(reason = 'engine-exit') {
    if (!retire(reason)) return;
    result = 'exited';
    const notify = () => window.BlockNightAndroid?.battleExited?.(session);
    const module = window.LaunchedModule || window.Module;
    // A return to the native frontend is not a process exit, so explicitly
    // persist ordinary saves/config before allowing the WebView to unload.
    if (reason !== 'engine-exit' && typeof module?.wzSaveConfigDirToPersistentStore === 'function') {
      try { module.wzSaveConfigDirToPersistentStore(notify); } catch (_) { notify(); }
    } else notify();
  }
  function consume(name, nonce, revision) {
    const fs = (window.LaunchedModule || window.Module)?.FS;
    if (!fs?.readFile || !fs?.writeFile || !fs?.rename || !nonce && !revision) return;
    const path = '/data/mp/multiplay/script/rules/' + name;
    try {
      const current = JSON.parse(fs.readFile(path, {encoding:'utf8'}));
      if (revision ? current.revision !== revision : current.nonce !== nonce) return;
      const inert = revision ? {revision:'consumed-' + revision, commands:[]} : {nonce:''};
      fs.writeFile(path + '.tmp', JSON.stringify(inert), {encoding:'utf8'});
      fs.rename(path + '.tmp', path);
    } catch (_) { /* Never clear a newer request or remove a polled file. */ }
  }
  function finish(won) {
    if(duel&&result)return;
    if (result === 'exited' || result === 'victory' || result === 'defeated' && !won) return;
    result = won ? 'victory' : 'defeated';
    retire(result);
    if (won) window.BlockNightAndroid?.battleWon?.(session);
    else window.BlockNightAndroid?.battleFinished?.(session);
  }
  async function back() {
    if (phase === 'ended') return;
    if (window.WarzoneRewards?.cancelTarget?.()) return;
    window.__kalaWarzoneTouch?.cancelFacilityNavigation?.();
    if(!duel&&window.parent?.TowersStatus?.handleBack?.())return;
    const commands = window.__warzoneCommands, tech = window.__blockNightResearch;
    if (tech?.report().open || tech?.report().opening) { tech.close(); return; }
    const help = window.parent.document.getElementById('warzone-towers-help-overlay');
    if (help && !help.hidden) { help.querySelector('.wt-help-back')?.click(); return; }
    const state = commands?.report();
    if (state?.buildOpen || state?.nativeMenu === 'build') { await commands.selectMode(); return; }
    if (!duel && commands?.handlePanelBack?.()) return;
    if (commands?.isOpen()) { await commands.close(); return; }
    if (state?.nativeMenu) { await commands.closeNative(); return; }
    const cancelledTool = window.__kalaWarzoneTouch?.releaseAll?.(true);
    if (cancelledTool || menuRequested || phase !== 'playing') return;
    const android = window.BlockNightAndroid;
    if (typeof android?.confirmReturnToMainMenu !== 'function') return;
    menuRequested = true;
    try {
      android.confirmReturnToMainMenu(session);
    } catch (error) {
      cancelMainMenuReturn(session);
      window.BlockNightAndroid?.showNotice?.('The main menu could not open. Please try Back again.');
    }
  }
  function cancelMainMenuReturn(expectedSession) {
    if (expectedSession !== session || !menuRequested || phase !== 'playing') return false;
    menuRequested = false;
    window.parent?.WarzoneHost?.restoreBattlefield?.();
    return true;
  }
  function returnToMainMenu(expectedSession) {
    if (expectedSession !== session || !menuRequested || phase !== 'playing') return false;
    menuRequested = false;
    // Retire input immediately, then flush saves before the confirmed WebView
    // unload. Never reveal or send keys into the engine's stock frontend.
    const leave = () => { if (phase !== 'ended') exit('main-menu'); };
    if (!duel && window.WarzoneRewards?.prepareExit)
      Promise.resolve(window.WarzoneRewards.prepareExit()).then(leave, leave);
    else leave();
    return true;
  }
  function observeNativeOutput(text) {
    const prefix=duel?'BNDUEL:':'BNWAVE:',marker = text.indexOf(prefix);
    if (marker >= 0) {
      try {
        const wave = JSON.parse(text.slice(marker + prefix.length));
        if(!activate(wave))return;
        if (['defeated','victory'].includes(wave.phase)) finish(wave.phase === 'victory');
      } catch (_) {}
      return;
    }
    // Official --debug=main transitions, not inferred timeouts or pixel tests.
    if (/\bGAMECODE_QUITGAME\b/.test(text)) exit('quit');
    else if (/Failed to load.*(?:Exiting to main menu|Restarting main menu)|Trying to load Game .* failed!/i.test(text)) exit('load-failed');
  }
  window.addEventListener('blocknight-engine-output', event => {
    observeNativeOutput(String(event?.detail?.text || ''));
  });
  // The official debug callback uses EM_LOG_CONSOLE, which deliberately
  // bypasses Module.print/printErr. Observe its known transition tokens at
  // that boundary without changing the compiled engine or forwarding input.
  for (const method of ['log','warn','error']) {
    const original = console[method];
    console[method] = function (...args) {
      const text = args.map(String).join(' ');
      if (/BNWAVE:|BNDUEL:|\bGAMECODE_QUITGAME\b|Trying to load Game .* failed!|(?:Exiting|Restarting) main menu/i.test(text)) observeNativeOutput(text);
      return original.apply(this, args);
    };
  }
  window.__towersHtml = {session, consume, activate, finish, exit, back, cancelMainMenuReturn, returnToMainMenu, nativeOutput:observeNativeOutput,
    isActive:()=>phase === 'playing', isEnded:()=>phase === 'ended',
    result:()=>result, report:()=>({phase,result,exitReason,session,menuRequested,mode})};
})();
