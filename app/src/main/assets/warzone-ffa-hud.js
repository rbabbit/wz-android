/* FFA observes the native skirmish; stock AI and victory rules own the game. */
(() => {
  'use strict';
  if (window.__warzoneFfa?.report || window.__warzoneFfaConfig?.mode !== 'ffa') return;
  const host = window.parent?.WarzoneHost ? window.parent : window, doc = host.document;
  const config=window.__warzoneFfaConfig,playerCount=config.players||4;
  const state = {snapshot:null,frame:null,offsets:{},partials:{},ended:false,lastError:'',resumePending:false};
  const module = () => window.LaunchedModule || window.Module;
  function nativeUiActive() {
    const frame=state.frame;
    return !state.snapshot || !frame || Boolean(frame.paused || frame.video || frame.nativeMenuOpen
      || frame.transportOpen || frame.intelligenceOpen);
  }
  function render() {
    const hud=doc.getElementById('blocknight-combat-hud');
    if(!hud||!state.snapshot)return;
    let label=doc.getElementById('wt-ffa-status');
    if(!label){
      label=doc.createElement('aside');label.id='wt-ffa-status';
      label.style.cssText='position:absolute;right:max(16px,env(safe-area-inset-right));top:8px;max-width:150px;padding:4px 8px;color:#f4f4f4;background:#0c0c0c;font-size:13px;line-height:1.3;pointer-events:none';
      label.innerHTML='<strong></strong><br><small></small>';
      (doc.getElementById('warzone-command-strip')||hud).appendChild(label);
    }
    label.querySelector('strong').textContent=(state.snapshot.mapName||config.mapName||'EMAG FFA')+' · '+state.snapshot.difficulty.replace(/^./,x=>x.toUpperCase());
    label.querySelector('small').textContent=(playerCount-1)+' '+(state.snapshot.botType==='cobra'?'Cobra':'NullBot')+(playerCount===2?' bot':' bots')+' · VTOL off';
    label.hidden=false;
    const right=Array.from(hud.children).reduce((value,node)=>Math.max(value,node.getBoundingClientRect().right),0);
    label.hidden=right+8>label.getBoundingClientRect().left;
  }
  function accept(packet) {
    if(state.ended||packet?.mode!=='ffa'||packet.map!==config.map||typeof packet.session!=='string'
      ||packet.difficulty!==config.difficulty||!Number.isFinite(Number(packet.gameTime))
      ||packet.nativeLevel!==(config.level||'FFA-EMAG-T1')||packet.maxPlayers!==playerCount)return false;
    const script=packet.botType==='cobra'?'Cobra.js':'ffa-nullbot.js';
    if(!['cobra','nullbot'].includes(packet.botType)||packet.botType!==config.botType||!Array.isArray(packet.players)||packet.players.length!==playerCount
        ||Array.from({length:playerCount-1},(_,i)=>i+1).some(player=>{const bots=packet.players.filter(value=>value.player===player);return bots.length!==1
          ||bots[0].botType!==packet.botType||String(bots[0].scriptName||'').split(/[\\/]/).pop()!==script;})){
      state.lastError='The native FFA bot identity could not be verified.';return false;
    }
    if(state.snapshot?.session!==packet.session){
      window.__kalaWarzoneTouch?.releaseAll?.(true,false);
      window.__warzoneCommands?.resetSession?.();window.__blockNightResearch?.resetSession?.();
    }
    state.snapshot=packet;state.frame=packet.ui||state.frame;
    window.__towersHtml?.activate?.(packet);
    window.__kalaWarzoneTouch?.showCombatHud?.();
    if(!state.resumePending&&window.WarzoneSavedGames?.loading&&!window.WarzoneSavedGames.ready){
      state.resumePending=true;
      Promise.resolve(window.WarzoneSavedGames.resumeFfa(packet)).catch(error=>{
        state.lastError=String(error.message||error);
      }).finally(()=>{state.resumePending=false;});
    }
    render();
    if(packet.phase==='victory'||packet.phase==='defeated')window.__towersHtml?.finish?.(packet.phase==='victory');
    return true;
  }
  function consume(text) {
    const start=String(text).indexOf('BNFFA:');if(start<0)return;
    try{accept(JSON.parse(String(text).slice(start+6)));}catch(error){state.lastError=String(error.message||error);}
  }
  function poll() {
    if(state.ended)return;
    const current=module(),fs=current?.FS;if(!fs?.readFile)return;
    try{state.frame=JSON.parse(fs.readFile('/tmp/warzone-campaign-state-v51.json',{encoding:'utf8'}));}catch(_){}
    const directory=(current.WZVAL_configDirPath||window.wz_js_get_config_dir_path?.()||'/warzone2100-ffa')+'/logs';
    try{for(const name of fs.readdir(directory).filter(value=>/\.(?:log|txt)$/.test(value))){
      const path=directory+'/'+name,size=fs.stat(path).size;
      if(!(path in state.offsets)){state.offsets[path]=size;state.partials[path]='';continue;}
      const offset=state.offsets[path]>size?0:state.offsets[path];if(offset===size)continue;
      const stream=fs.open(path,'r'),bytes=new Uint8Array(Math.min(size-offset,262144));let read;
      try{read=fs.read(stream,bytes,0,bytes.length,offset);}finally{fs.close(stream);}
      const lines=(state.partials[path]+new TextDecoder().decode(bytes.subarray(0,read))).split(/\r?\n/);
      state.partials[path]=lines.pop();state.offsets[path]=offset+read;lines.forEach(consume);
    }}catch(_){/* The native log directory appears during startup. */}
  }
  window.__warzoneFfa={accept,consume,nativeOutput:consume,poll,nativeUiActive,
    report:()=>({snapshot:state.snapshot,frame:state.frame,nativeState:state.frame,lastError:state.lastError,ended:state.ended})};
  window.addEventListener('blocknight-engine-output',event=>consume(event.detail?.text||''));
  window.addEventListener('warzone-battle-ended',()=>{state.ended=true;});
  window.addEventListener('pagehide',()=>{state.ended=true;});
  setInterval(poll,150);
})();
