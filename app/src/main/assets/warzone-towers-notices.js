/* Non-blocking Towers notices. Native events remain the source of truth. */
(() => {
  'use strict';
  if (window.WarzoneNotices || window.__warzoneDuelConfig?.mode === 'duel') return;
  const doc = window.parent?.WarzoneHost ? window.parent.document : document;
  const seen = new Set();
  const logOffsets = new Map(), logPartials = new Map(), logDecoders = new Map();
  let timer = 0, lastTime = null, ended = false;
  let shown = 0, nativeEvents = 0, lastNotice = null, lastNative = null;
  const style = doc.createElement('style');
  style.textContent = `
    #wt-game-notice{position:fixed;left:10px;top:calc(var(--wt-command-top,56px) + 8px);z-index:2147483647;max-width:min(330px,calc(100vw - 190px));box-sizing:border-box;padding:9px 13px;border:1px solid #ffffff30;border-radius:6px;background:#080808;color:#fff;box-shadow:0 3px 12px #0005;pointer-events:none;font:14px/1.3 Towers,'Roboto Condensed',system-ui,sans-serif;overflow-wrap:anywhere}
    #wt-game-notice[hidden]{display:none}#wt-game-notice strong{display:block;color:#fff;font-weight:500}#wt-game-notice span{display:block;margin-top:3px;color:#fff;font:12px/1.3 system-ui,sans-serif}
    #wt-game-notice[data-research-topic]{pointer-events:auto;cursor:pointer}#wt-game-notice:focus-visible{outline:2px solid #8bd3cc;outline-offset:2px}
    @media(max-height:400px){#wt-game-notice{padding:6px 10px;font-size:12px}#wt-game-notice span{font-size:11px}}
  `;
  doc.head.appendChild(style);
  const box = doc.createElement('aside');
  box.id = 'wt-game-notice'; box.hidden = true;
  box.setAttribute('role','status'); box.setAttribute('aria-live','polite');
  const title = doc.createElement('strong'), detail = doc.createElement('span');
  box.append(title, detail); doc.body.appendChild(box);
  function clear() { clearTimeout(timer); box.hidden = true; }
  function show(text, description = '', topicId = '') {
    if (ended || window.__towersHtml?.isEnded?.() || window.__towersHtml?.report?.().phase === 'ended') return false;
    clearTimeout(timer);
    title.textContent = text; detail.textContent = description; detail.hidden = !description;
    if(topicId){box.setAttribute('data-research-topic',topicId);box.setAttribute('role','button');box.setAttribute('tabindex','0');box.setAttribute('aria-label',`${description}. Open Intelligence report`);}
    else {box.removeAttribute('data-research-topic');box.setAttribute('role','status');box.removeAttribute('tabindex');box.removeAttribute('aria-label');}
    box.hidden = false; timer = setTimeout(clear, 4800);
    shown++; lastNotice = {text, description};
    return true;
  }
  const openReport=()=>{const id=box.getAttribute('data-research-topic');if(!box.hidden&&id&&window.__warzoneIntelligence){void window.__warzoneIntelligence.open(id);clear();}};
  box.addEventListener('click',openReport);
  box.addEventListener('keydown',event=>{if(box.getAttribute('data-research-topic')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();openReport();}});
  function remember(key) {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 128) seen.delete(seen.values().next().value);
    return true;
  }
  function currentTimeAllows(time) {
    const nativeTime = window.__warzoneTowersWaves?.report?.().snapshot?.gameTime;
    const current = Number.isFinite(nativeTime) ? nativeTime : null;
    if (current === null) return true;
    if (lastTime !== null && current < lastTime) { seen.clear(); clear(); }
    lastTime = current;
    // Native wave packets tick every 500ms. Keep stale or pre-load log packets
    // from reappearing while tolerating delivery between those snapshots.
    return time <= current + 2000 && current <= time + 10000;
  }
  window.addEventListener('blocknight-research-completed', event => {
    const value = event.detail;
    if (!value || Number(value.player) !== 0 || typeof value.name !== 'string' || !value.name.trim()) return;
    const time = Number(value.gameTime);
    if (!Number.isFinite(time) || time <= 1000) return;
    if (!currentTimeAllows(time)) return;
    const key = ['research', value.id || value.name, value.labId, time].join(':');
    if (!remember(key)) return;
    // Minor upgrades still announce completion, without advertising a report
    // the engine never creates. Opening a link also checks the live message.
    const hasDefinition=window.WarzoneResearchArt?.isReportDefinition(value)===true;
    show('Research complete', value.name, hasDefinition?(value.id||''):'');
  });
  function nativeNotice(value) {
    if (ended || !value) return;
    const time = Number(value.gameTime);
    if (!Number.isFinite(time) || time < 0 || !currentTimeAllows(time)) return;
    let text, key, description = '';
    if (value.kind === 'round') {
      const round = Number(value.round), total = Number(value.totalRounds);
      if (Number(value.player) !== 0 || !Number.isInteger(round) || !Number.isInteger(total)
          || round < 1 || total < round) return;
      text = `Round ${round} / ${total}`; key = `round:${round}:${total}:${time}`;
    } else if (value.kind === 'unit-lost') {
      if (value.player !== 0 || !Number.isInteger(value.id) || value.id <= 0
          || typeof value.name !== 'string' || !value.name.trim()
          || typeof value.constructor !== 'boolean' || typeof value.gameTime !== 'number') return;
      text = value.constructor ? 'Truck destroyed' : 'Unit destroyed';
      description = value.name.trim(); key = `unit-lost:${value.id}:${time}`;
    } else if (value.kind === 'camera' && ['north','south','east','west'].includes(value.direction)) {
      text = `View aligned to ${value.direction[0].toUpperCase()}${value.direction.slice(1)}`;
      key = `camera:${value.direction}:${time}`;
    } else return;
    if (remember(key) && show(text, description)) { nativeEvents++; lastNative = {...value}; }
  }
  function engineText(text) {
    const marker = String(text).indexOf('BNNOTICE:');
    if (marker < 0) return;
    try { nativeNotice(JSON.parse(String(text).slice(marker + 'BNNOTICE:'.length))); }
    catch (_) { /* Unrelated native errors and malformed text keep their own route. */ }
  }
  window.addEventListener('blocknight-engine-output', event => engineText(event?.detail?.text || ''));
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('blocknight-engine-output') : null;
  channel?.addEventListener('message', event => engineText(event.data));
  function pollLogs() {
    if (ended) return;
    const module = window.LaunchedModule || window.Module, fs = module?.FS;
    if (!fs?.readdir || !fs?.stat || !fs?.open || !fs?.read || !fs?.close) return;
    const dir = `${module.WZVAL_configDirPath || '/warzone2100'}/logs`;
    try {
      for (const name of fs.readdir(dir).filter(name => name.endsWith('.log'))) {
        const path = `${dir}/${name}`, size = fs.stat(path).size;
        if (!logOffsets.has(path)) { logOffsets.set(path,size); continue; }
        let offset = logOffsets.get(path);
        if (offset > size) { offset = 0; logPartials.delete(path); logDecoders.delete(path); }
        if (offset === size) continue;
        const buffer = new Uint8Array(Math.min(size-offset,64*1024)), stream = fs.open(path,'r');
        let count;
        try { count = fs.read(stream,buffer,0,buffer.length,offset); } finally { fs.close(stream); }
        logOffsets.set(path,offset+count);
        if (!logDecoders.has(path)) logDecoders.set(path,new TextDecoder());
        const lines = ((logPartials.get(path) || '') + logDecoders.get(path).decode(buffer.subarray(0,count),{stream:true})).split(/\r?\n/);
        logPartials.set(path,lines.pop()); lines.forEach(engineText);
      }
    } catch (_) { /* Runtime output remains active if a log is not ready. */ }
  }
  const logTimer = typeof setInterval === 'function' ? setInterval(pollLogs,650) : 0;
  window.addEventListener('warzone-battle-ended', () => {
    ended = true; seen.clear(); clear(); channel?.close();
    if (typeof clearInterval === 'function') clearInterval(logTimer);
  });
  window.WarzoneNotices = {show, clear, report:()=>({shown,nativeEvents,lastNotice,lastNative,ended})};
})();
