/* HTML interface transport and per-battle Android lifecycle. */
(() => {
  'use strict';
  if (window.__towersHtml) return;
  const session = new URLSearchParams(location.search).get('battle_session') || window.__towersHtmlSession || '';
  let result = '';
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
    if (result === 'victory' || result === 'defeated' && !won) return;
    result = won ? 'victory' : 'defeated';
    window.__kalaWarzoneTouch?.releaseAll?.(true);
    if (won) window.BlockNightAndroid?.battleWon?.(session);
    else window.BlockNightAndroid?.battleFinished?.(session);
  }
  async function back() {
    const commands = window.__warzoneCommands, tech = window.__blockNightResearch;
    if (tech?.report().open || tech?.report().opening) { tech.close(); return; }
    const help = window.parent.document.getElementById('warzone-towers-help-overlay');
    if (help && !help.hidden) { help.querySelector('.wt-help-back')?.click(); return; }
    const state = commands?.report();
    if (state?.buildOpen || state?.nativeMenu === 'build') { await commands.selectMode(); return; }
    if (commands?.isOpen()) { await commands.close(); return; }
    if (state?.nativeMenu) { await commands.closeNative(); return; }
    window.__kalaWarzoneTouch?.releaseAll?.(true);
    window.__kalaWarzoneTouch?.nativePressKey?.('Escape','Escape',27);
  }
  window.__towersHtml = {session, consume, finish, back, result:()=>result};
})();
