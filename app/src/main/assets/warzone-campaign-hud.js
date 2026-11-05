/* Original campaign status. No Towers waves, objective replacement or free research. */
(() => {
  'use strict';
  if (window.__warzoneCampaign) return;
  const owner = window.parent?.WarzoneHost ? window.parent.document : document;
  const state = {snapshot:null, session:'', errors:0, offsets:{}, partial:{}, lastAdvance:0, paused:false};
  function paused(value) {
    if (state.paused===value) return;
    state.paused=value;owner.body.dataset.campaignPaused=String(value);
    if(!value&&window.__warzoneCommands?.nativeBuildOpen?.())window.__kalaWarzoneTouch?.toggleQueueMode?.(true);
    for(const id of ['blocknight-combat-hud','wt-field-centre','wt-battle-status']) {
      const e=owner.getElementById(id);if(e){e.inert=value;e.style.opacity=value?'0.45':'';}
    }
    if(value) {
      window.__warzoneCommands?.revealNativePause?.();
      window.__blockNightResearch?.revealNativePause?.();
      window.__kalaWarzoneTouch?.releaseAll?.(true);
    }
  }
  function render(snapshot) {
    if (snapshot.mode !== 'campaign') return;
    if (state.session !== snapshot.session) {
      state.session = snapshot.session;
      window.__kalaWarzoneTouch?.releaseAll?.(true);
      window.__warzoneCommands?.resetSession?.();
      window.__blockNightResearch?.resetSession?.();
      window.__kalaWarzoneTouch?.showCombatHud?.();
    }
    if(snapshot.gameTime!==state.snapshot?.gameTime) {state.lastAdvance=performance.now();paused(false);}
    state.snapshot = snapshot;
    let panel = owner.getElementById('warzone-towers-wave-hud');
    if (!panel) {
      panel = owner.createElement('aside'); panel.id = 'warzone-towers-wave-hud';
      panel.setAttribute('aria-live','polite');
      panel.innerHTML='<div><strong>CAMPAIGN</strong><span class="wt-wave-detail"></span></div><button id="warzone-towers-next-wave" type="button">MENU</button>';
      panel.querySelector('button').addEventListener('click', () => {
        if(state.paused) {window.__warzoneCommands.resumeNativePause();return;}
        if(!window.__warzoneCommands.nativeBuildOpen()) {
          window.__warzoneCommands.revealNativePause();
          window.__blockNightResearch?.revealNativePause?.();
          window.__kalaWarzoneTouch.nativePressKey('Escape','Escape',27);return;
        }
        window.__warzoneCommands.afterBuildExit(() => {
          window.__blockNightResearch?.close?.();
          window.__kalaWarzoneTouch.nativePressKey('Escape','Escape',27);
        });
      });
      owner.getElementById('warzone-command-strip').appendChild(panel);
    }
    panel.classList.add('visible');
    const seconds = Math.max(0, Number(snapshot.missionTime) || 0);
    const timer = seconds ? ` / ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}` : '';
    panel.querySelector('strong').textContent = `${snapshot.mission === 'cam1a' ? 'ALPHA / MISSION 1' : snapshot.mission.toUpperCase()}${timer}`;
    panel.querySelector('.wt-wave-detail').textContent = snapshot.ended ? 'Mission transition' : 'Original campaign';
  }
  function consume(line) {
    const marker='BNCAMPAIGN:', start=line.indexOf(marker);
    if (start<0) return;
    try {render(JSON.parse(line.slice(start+marker.length)));} catch (_) {state.errors++;}
  }
  window.addEventListener('blocknight-engine-output', event=>consume(String(event.detail?.text||'')));
  if (typeof BroadcastChannel==='function') {
    const channel=new BroadcastChannel('blocknight-engine-output');
    channel.onmessage=event=>consume(String(event.data?.text||''));
  }
  function poll() {
    const m=window.LaunchedModule, fs=m?.FS;
    if (!fs?.readdir) return;
    const dir=`${m.WZVAL_configDirPath}/logs`;
    try { for (const name of fs.readdir(dir).filter(n=>n.endsWith('.log'))) {
      const path=`${dir}/${name}`, size=fs.stat(path).size;
      if (!(path in state.offsets)) {state.offsets[path]=size;state.partial[path]='';continue;}
      const offset=state.offsets[path]>size?0:state.offsets[path];
      if (size===offset) continue;
      const stream=fs.open(path,'r'), bytes=new Uint8Array(Math.min(size-offset,131072));
      let read;try {read=fs.read(stream,bytes,0,bytes.length,offset);}finally {fs.close(stream);}
      const lines=(state.partial[path]+new TextDecoder().decode(bytes.subarray(0,read))).split(/\r?\n/);
      state.partial[path]=lines.pop();lines.forEach(consume);state.offsets[path]=offset+read;
    }} catch (_) {state.errors++;}
  }
  setInterval(()=>{poll();if(state.snapshot&&performance.now()-state.lastAdvance>3000)paused(true);},500);
  window.__warzoneCampaign={report:()=>({snapshot:state.snapshot,paused:state.paused,errors:state.errors}),poll};
})();
