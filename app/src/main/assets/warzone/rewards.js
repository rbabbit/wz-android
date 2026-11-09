/* Portable phone purchases; all structure quotas and firing stay native. */
(() => {
  'use strict';
  if (window.__warzoneDuelConfig?.mode === 'duel' || window.WarzoneRewards) return;
  const session = window.__towersHtml?.session || window.__towersHtmlSession || '';
  const owner = window.parent?.WarzoneHost ? window.parent.document : document;
  const state = {ready:false, applying:false, ended:false, error:'', config:null, purchasing:false, laserTarget:false, laserArming:false, laserSerial:0, exitPromise:null};
  const bridge = () => window.BlockNightAndroid;
  const nativeState = () => window.__warzoneCommands?.report?.().snapshot?.rewards;
  const notice = message => bridge()?.showNotice?.(message);
  function config() {
    try {
      const value = JSON.parse(bridge()?.rewardConfig?.(session) || '{}');
      return typeof value.session === 'string' && value.session && session ? value : null;
    } catch (_) { return null; }
  }
  function updateBalance() {
    const value = config(), button = owner.getElementById('blocknight-rewards');
    if (button && value) {
      const balance = Math.max(0, Math.floor(Number(value.balance) || 0));
      const caption = button.querySelector('span');
      if (caption) caption.textContent = 'REWARDS ' + balance;
      button.setAttribute('aria-label', 'Rewards, ' + balance + ' crystals. Portable inventory and active purchases.');
    }
    const laser = owner.getElementById('blocknight-lassat'), posts = nativeState()?.lasSats || [];
    if (laser) {
      laser.style.display = posts.length && state.ready ? '' : 'none';
      const selected = posts.find(post => post.selected), caption = laser.querySelector('span');
      if (caption) caption.textContent = state.laserTarget || state.laserArming ? 'CANCEL SAT' : !selected ? 'SELECT SAT'
        : selected.ready ? 'FIRE SAT' : 'SAT ' + Math.ceil(Number(selected.remainingMs || 0) / 1000) + 's';
      laser.setAttribute('aria-pressed', String(state.laserTarget || state.laserArming));
    }
  }
  function fail(reason) {
    if (state.ended || state.error) return;
    state.error = String(reason || 'Match purchases could not be applied.');
    bridge()?.rewardFailed?.(session, state.error);
  }
  async function apply() {
    if (state.ready || state.applying || state.error || state.ended || !window.__towersHtml?.isActive?.()) return;
    const commands = window.__warzoneCommands, value = config();
    if (!commands || !value) { fail('The saved match purchases could not be read.'); return; }
    state.applying = true;
    const items = {};
    for (const [id, quantity] of Object.entries(value.items || {})) {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) { fail('An inventory quantity is invalid.'); state.applying=false; return; }
      items[id] = quantity;
    }
    const rewards = {session:value.session,items,research:value.research === true,supply:value.supply === true};
    try {
      const reply = await commands.send('apply-rewards', {rewards});
      if (state.ended) return;
      if (!reply.ok || reply.result?.ok !== true || reply.result.session !== value.session)
        throw Error(reply.result?.error || reply.reason || 'The native game rejected the match purchases.');
      if (bridge()?.rewardApplied?.(session) !== true) throw Error('The match purchases could not be saved.');
      state.config = rewards;
      if (window.WarzoneSavedGames?.loading) await window.WarzoneSavedGames.resumeRewards(commands, session);
      else await reconcilePending(commands, session);
      state.ready = true;
      commands.send('state'); updateBalance();
    } catch (error) { fail(error.message); }
    finally { state.applying = false; }
  }
  function open() {
    if (!state.ready || state.ended || window.WarzoneSavedGames?.busy) return;
    window.__warzoneCommands?.afterBuildExit?.(() => bridge()?.showRewards?.(session));
  }
  async function submitPurchase(commands, request) {
    const value = config();
    if (!request || !value || request.session !== value.session || !request.transactionId) throw Error('This purchase is no longer active.');
    const active = () => !state.ended && window.__towersHtml?.isActive?.() && config()?.session === request.session;
    const deliver = quote => active() && bridge()?.rewardPurchaseResult?.(session, request.transactionId, JSON.stringify(quote)) === true;
    // Ordinary native orders keep their FIFO acknowledgement indefinitely. A
    // shop timeout must release its own controls without cancelling that order
    // or claiming a refund for an outcome the native game has not confirmed.
    const reply = await new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => { settled = true; resolve(null); }, 10000);
      Promise.resolve().then(() => commands.send('add-rewards', {rewards:request})).then(result => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(result); return; }
        const quote = result?.result;
        if (quote?.session === request.session && (quote.transactionId === request.transactionId
            || Array.isArray(quote.transactions) && quote.transactions.includes(request.transactionId))) deliver(quote);
      }, () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } }).catch(() => {});
    });
    if (!active()) return false;
    // Unknown outcomes retain the same reservation. Only the native journal or
    // an explicit clean rejection can settle it on the phone.
    const quote = reply?.result?.session === value.session ? reply.result : {session:value.session,transactionId:request.transactionId};
    return deliver(quote);
  }
  async function reconcilePending(commands, documentSession) {
    if (documentSession !== session || state.ended) throw Error('This saved match is no longer active.');
    let value = config(), pending = value?.pendingTransactions || [];
    if (!pending.length) return true;
    const fresh = await commands.send('reward-inventory');
    if (state.ended || !fresh.ok || fresh.result?.session !== value.session) throw Error('The game could not verify pending purchases.');
    for (const request of pending)
      bridge()?.rewardPurchaseResult?.(session, request.transactionId, JSON.stringify(fresh.result));
    pending = config()?.pendingTransactions || [];
    for (const request of pending) await submitPurchase(commands, request);
    if ((config()?.pendingTransactions || []).length) throw Error('A purchase is still pending. Return Home and load this save to retry it safely.');
    return true;
  }
  async function purchase(request) {
    if (!state.ready || state.ended || state.purchasing || window.WarzoneSavedGames?.busy) {
      if (!state.ended && request?.transactionId && request.session === config()?.session)
        bridge()?.rewardPurchaseResult?.(session, request.transactionId, JSON.stringify({session:request.session,transactionId:request.transactionId}));
      return false;
    }
    state.purchasing = true;
    try {
      return await submitPurchase(window.__warzoneCommands, request);
    } catch (error) {
      const value = config();
      bridge()?.rewardPurchaseResult?.(session, request?.transactionId || '', JSON.stringify({session:value?.session || ''}));
      return false;
    } finally { state.purchasing = false; updateBalance(); window.__warzoneCommands?.send('state'); }
  }
  function cancelTarget() {
    const active = state.laserTarget || state.laserArming;
    state.laserTarget = false; state.laserArming = false; ++state.laserSerial;
    updateBalance(); return active;
  }
  async function armLaser() {
    if (state.ended || !state.ready) return;
    if (cancelTarget()) return;
    const commands = window.__warzoneCommands;
    // afterBuildExit cancels old targeting synchronously. Establish this request
    // immediately afterwards, so Back can also cancel the pending Build exit.
    const closing = commands?.afterBuildExit?.(() => true), token = ++state.laserSerial;
    state.laserArming = true; updateBalance();
    try {
      if (await closing !== true || state.ended || token !== state.laserSerial) return;
      const navigation = commands.navigationRevision?.();
      const fresh = await commands.send('state', {}, {fresh:true});
      if (state.ended || token !== state.laserSerial || navigation !== commands.navigationRevision?.() || !fresh.ok) return;
      const selected = (fresh.result?.rewards?.lasSats || []).find(post => post.selected);
      if (!selected) { notice('Tap your Laser Satellite Command Post on the battlefield, then tap FIRE SAT.'); return; }
      if (!selected.ready) { notice('The laser satellite is recharging.'); return; }
      state.laserTarget = true; updateBalance();
      notice('Tap an enemy unit or building to fire. Tap CANCEL SAT or Back to cancel.');
    } finally { if (token === state.laserSerial) { state.laserArming = false; updateBalance(); } }
  }
  function handleTap(x, y) {
    if (!state.laserTarget || state.ended) return false;
    const point = window.WarzoneTerrain?.pick?.(x, y);
    if (!point) { notice('Tap an enemy on visible battlefield terrain.'); return true; }
    cancelTarget();
    window.__warzoneCommands.send('reward-lassat', {x:Math.round(point.x),y:Math.round(point.y)}).then(reply => {
      if (state.ended) return;
      if (!reply.ok) {
        const messages = {'lassat-select-required':'Select your Laser Satellite Command Post first.',
          'lassat-cooling':'The laser satellite is recharging.', 'lassat-target-missing':'Choose a visible enemy unit or building.',
          'lassat-rejected':'The laser satellite is not ready to fire at that target.'};
        notice(messages[reply.reason] || 'The laser satellite could not fire. Select the post and choose a visible enemy.');
      }
      window.__warzoneCommands.send('state');
    });
    return true;
  }
  function waveCredited(amount) {
    if (state.ended || !Number.isInteger(amount) || amount < 1) return;
    let note = owner.getElementById('wt-wave-crystals');
    if (!note) {
      const header = owner.getElementById('blocknight-rewards');
      if (!header) return;
      note = owner.createElement('small'); note.id = 'wt-wave-crystals';
      note.setAttribute('role','status');
      header.style.position = 'relative';
      note.style.cssText = 'position:absolute;left:0;right:0;bottom:1px;pointer-events:none;color:#9eddd0;font:9px sans-serif;line-height:10px;text-align:center;white-space:nowrap';
      header.appendChild(note);
    }
    note.textContent = '+' + amount + ' crystals'; note.hidden = false;
    clearTimeout(note._hide); note._hide = setTimeout(() => { note.hidden = true; }, 1800);
    updateBalance();
  }
  async function prepareExit() {
    if (state.exitPromise) return state.exitPromise;
    cancelTarget();
    if (!state.ready || state.ended) return false;
    state.exitPromise = (async () => {
      let timer;
      try {
        const reply = await Promise.race([window.__warzoneCommands.send('reward-inventory'),
          new Promise(resolve => { timer = setTimeout(() => resolve(null), 2000); })]);
        if (!reply?.ok || state.ended || reply.result?.session !== config()?.session) return false;
        return bridge()?.rewardInventorySnapshot?.(session, JSON.stringify(reply.result)) === true;
      } finally { clearTimeout(timer); }
    })();
    return state.exitPromise;
  }
  const timer = setInterval(() => { updateBalance(); apply(); }, 400);
  window.addEventListener('warzone-battle-ended', () => {
    state.ended = true; state.laserTarget = false; clearInterval(timer);
    const note=owner.getElementById('wt-wave-crystals'); if(note)note.remove();
  });
  window.WarzoneRewards = {get ready() { return state.ready; },open,updateBalance,waveCredited,
    get busy() { return state.purchasing; }, purchase,reconcilePending,
    prepareExit,armLaser,handleTap,cancelTarget,report:() => ({...state,session,nativeSession:config()?.session})};
})();
