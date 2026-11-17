/* Campaign-only mission controls. Original mission rules, native panels and videos remain authoritative. */
(() => {
  'use strict';
  if (window.__warzoneCampaign || !(window.__warzoneCampaignMode === true
      || new URLSearchParams(location.search).get('mode') === 'campaign')) return;
  const host = window.parent?.WarzoneHost ? window.parent : window, doc = host.document;
  const FRAME = '/tmp/warzone-campaign-state-v51.json';
  const CONTROL = '/data/base/script/campaign/mobile/campaign-control.json';
  const state = {snapshot:null,frame:null,allCombat:false,selectionPending:false,selectionRequests:0,
    selectedCount:0,lastSelection:0,lastError:'',intent:'',intentKey:'',serial:0,interactionUntil:0,
    nativeVisible:false,offsets:{},partials:{},ended:false,physicalPointers:new Set(),briefingKey:false};
  const module = () => window.LaunchedModule || window.Module;
  const nativeUiActive = () => {
    const frame=state.frame;if(!frame)return true;
    if(frame.worldSafe===true)return false;
    const commands=window.__warzoneCommands?.report?.();
    const ownedBuild=commands?.buildOpen||commands?.placement||commands?.nativeMenu==='build';
    // The app's native-validated construction tool legitimately owns STAT /
    // OBJECT modes. This exemption permits placement, never ALL selection.
    if(ownedBuild&&frame.playing&&!frame.paused&&!frame.video&&!frame.transportOpen&&!frame.intelligenceOpen)return false;
    return true;
  };
  const element = id => doc.getElementById(id);
  function htmlOpen() {
    const commands=window.__warzoneCommands?.report?.(),research=window.__blockNightResearch?.report?.();
    return Boolean(commands?.page||commands?.buildOpen||commands?.placement||commands?.selectingTrucks
      ||commands?.demolition||commands?.nativeMenu||research?.open||research?.opening
      ||window.__warzoneIntelligence?.isOpen?.()
      ||(element('warzone-towers-help-overlay')&&!element('warzone-towers-help-overlay').hidden)
      ||window.WarzoneSavedGames?.busy);
  }
  function suspended() {
    const touch=window.__kalaWarzoneTouch?.report?.();
    return state.ended||!state.snapshot||state.frame?.worldSafe!==true||htmlOpen()||state.physicalPointers.size>0||Date.now()<state.interactionUntil
      ||touch?.gestureActive||touch?.pendingClicks>0||touch?.panPhase&&touch.panPhase!=='idle'
      ||window.WarzoneSavedGames?.ready===false;
  }
  function writeIntent(force=false) {
    const value={enabled:state.allCombat,suspended:Boolean(suspended())},key=JSON.stringify(value);
    if(!force&&key===state.intentKey)return true;
    // The campaign control file is part of the native preload package. Do not
    // create it from the host while Emscripten is still creating that package.
    const current=module(),fs=current?.FS;if(current?.calledRun!==true||!state.frame||!fs?.writeFile||!fs?.rename)return false;
    try{
      const nonce='campaign-ui-'+Date.now()+'-'+(++state.serial);
      fs.writeFile(CONTROL+'.tmp',JSON.stringify({nonce,...value}),{encoding:'utf8'});
      fs.rename(CONTROL+'.tmp',CONTROL);state.intent=nonce;state.intentKey=key;return true;
    }catch(error){state.lastError=String(error.message||error);return false;}
  }
  function toggleAllCombat(force) {
    state.allCombat=typeof force==='boolean'?force:!state.allCombat;
    state.interactionUntil=0;state.lastSelection=0;writeIntent(true);render();
    if(state.allCombat)void selectCombat();return state.allCombat;
  }
  async function selectCombat() {
    if(!state.allCombat||state.selectionPending||suspended()||!writeIntent())return false;
    const commands=window.__warzoneCommands;if(!commands?.send)return false;
    const intent=state.intent,session=state.snapshot.session;state.selectionPending=true;state.lastSelection=Date.now();state.selectionRequests++;
    try{
      const reply=await commands.send('campaign-select-combat',{intent});
      if(intent!==state.intent||session!==state.snapshot?.session||!state.allCombat)return false;
      if(reply.ok){state.selectedCount=Number(reply.result?.count||reply.result?.selectedCount||reply.result?.selectedIds?.length||0);state.lastError='';return true;}
      if(!['suspended','selection-suspended','native-panel','not-world-safe'].includes(reply.reason))state.lastError=String(reply.reason||'Combat selection is unavailable.');
    }catch(error){state.lastError=String(error.message||error);}
    finally{state.selectionPending=false;render();}
    return false;
  }
  function revealNativeUi() {
    void window.__warzoneIntelligence?.close?.(true);
    window.__blockNightResearch?.revealNativePause?.();
    window.__warzoneCommands?.revealNativePause?.();
    window.__kalaWarzoneTouch?.closeHelp?.();
    window.__kalaWarzoneTouch?.releaseAll?.(true,false);
    const frame=element('warzone-game-frame');if(frame)frame.inert=false;
    host.WarzoneHost?.restoreBattlefield?.();
    writeIntent(true);
  }
  function closeNativeUi() {
    if(!state.frame||!nativeUiActive())return false;
    revealNativeUi();state.interactionUntil=Date.now()+400;
    window.__kalaWarzoneTouch?.nativePressKey?.('Escape','Escape',27);
    return true;
  }
  async function openIntel() {
    if(nativeUiActive()){revealNativeUi();return false;}
    const intel=window.__warzoneIntelligence;if(!intel)return false;
    state.interactionUntil=Date.now()+400;writeIntent(true);
    return intel.isOpen()?intel.close():intel.open();
  }
  async function openBriefings() {
    if(nativeUiActive()){if(state.frame?.intelligenceOpen)return closeNativeUi();revealNativeUi();return false;}
    const session=state.snapshot?.session;
    if(!session)return false;
    if(window.__warzoneIntelligence?.isOpen?.()&&!await window.__warzoneIntelligence.close())return false;
    if(session!==state.snapshot?.session||nativeUiActive())return false;
    const commands=window.__warzoneCommands;
    const open=()=>{state.interactionUntil=Date.now()+400;writeIntent(true);
      window.__blockNightResearch?.close?.();commands?.close?.();
      window.__kalaWarzoneTouch?.releaseAll?.(true,false);
      if(session!==state.snapshot?.session||nativeUiActive())return false;
      state.briefingKey=true;
      try{return window.__kalaWarzoneTouch?.nativePressKey?.('F5','F5',116)!==false;}
      finally{state.briefingKey=false;}};
    return commands?.afterBuildExit?commands.afterBuildExit(open):open();
  }
  function install() {
    const hud=element('blocknight-combat-hud');if(!hud||element('wt-campaign-all-combat'))return;
    doc.body.classList.add('wt-campaign');
    const style=doc.createElement('style');style.textContent=`
      body.wt-campaign #warzone-command-strip #blocknight-combat-hud{right:8px;max-width:none}
      body.wt-campaign #warzone-campaign-status{position:absolute;top:8px;right:12px;display:flex;align-items:center;width:max-content;max-width:140px;height:40px;box-sizing:border-box;margin:0;padding:0 4px;font:500 13px/1.2 Towers,sans-serif;color:var(--towers-text,#f4f4f4);pointer-events:none}
      body.wt-campaign #warzone-campaign-status>div{min-width:0;overflow:hidden}
      body.wt-campaign #warzone-campaign-status strong{display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      body.wt-campaign #warzone-campaign-status small{display:block;margin-top:3px;font:11px/1.1 Towers,sans-serif;color:var(--towers-muted,#bcbcbc)}
      body.wt-campaign #warzone-campaign-status small[hidden]{display:none}
      body.wt-campaign.wt-towers-polished #lab-ops[data-collapsed=false]{width:max-content;max-width:calc(100vw - 70px)}
      body.wt-campaign #wt-campaign-native-back{position:fixed;top:12px;right:24px;z-index:2147483640;min-height:38px;padding:8px 16px;border:1px solid #666;border-radius:5px;background:#222;color:#fff;font:500 15px/1.2 Towers,sans-serif}
      body.wt-campaign #wt-campaign-native-back[hidden]{display:none!important}`;doc.head.appendChild(style);
    const all=doc.createElement('button');all.id='wt-campaign-all-combat';all.type='button';all.innerHTML='<img src="/warzone/ui/icons/stack.svg" alt=""><span>ALL COMBAT</span>';
    all.setAttribute('aria-pressed','false');all.title='Keep combat units selected; constructors, sensors, repair units and transports are excluded';
    all.addEventListener('click',()=>toggleAllCombat());
    // Reuse the Base command group and its accepted spacing/selected styles.
    // Research remains first; Intelligence reports are in the unit drawer.
    const group=element('blocknight-base')?.parentElement;
    if(group)group.appendChild(all);else{const controls=doc.createElement('div');controls.className='bn-command-group';controls.appendChild(all);hud.appendChild(controls);}
    const status=doc.createElement('aside');status.id='warzone-campaign-status';status.innerHTML='<div><strong></strong><small hidden></small></div>';
    (element('warzone-command-strip')||hud).appendChild(status);
    const back=doc.createElement('button');back.id='wt-campaign-native-back';back.type='button';back.textContent='BACK TO GAME';back.hidden=true;back.addEventListener('click',closeNativeUi);doc.body.appendChild(back);
  }
  function render() {
    if(state.snapshot)install();
    const native=nativeUiActive(),video=state.frame?.video===true;
    const hud=element('blocknight-combat-hud');if(hud)hud.style.visibility=native?'hidden':'';
    // These footer surfaces have their own periodic visibility updates. Keep
    // native ownership independent of their hidden flags, including videos
    // before the first mission snapshot arrives.
    for(const id of ['wt-field-centre','wt-field-toggle','lab-ops','wt-status-panel']){const node=element(id);if(node){node.style.visibility=native?'hidden':'';node.inert=native;}}
    const back=element('wt-campaign-native-back');if(back)back.hidden=!native||video;
    if(!state.snapshot)return;
    const all=element('wt-campaign-all-combat');if(all){const selected=window.__kalaWarzoneTouch?.report?.().allCombatSelected===true;all.dataset.combatSelected=String(selected);all.classList.toggle('active',selected);all.setAttribute('aria-pressed',String(state.allCombat));all.disabled=state.ended;}
    const footer=element('blocknight-select-all');if(footer){footer.classList.toggle('active',state.allCombat);footer.setAttribute('aria-pressed',String(state.allCombat));}
    const status=element('warzone-campaign-status');if(status){
      const seconds=Math.max(0,Math.floor(Number(state.snapshot.missionTime)||0));
      const chapter=String(state.frame?.nativeLevel||state.snapshot.nativeLevel||state.snapshot.mission||'').match(/^cam[_-]?([123])/i);
      status.querySelector('strong').textContent=chapter?['Alpha campaign','Beta campaign','Gamma campaign'][Number(chapter[1])-1]:'Campaign';
      const timer=status.querySelector('small');timer.hidden=!seconds;timer.textContent=seconds?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'';
    }
    if(status){
      const statusRect=status.getBoundingClientRect();
      // The HUD spans the available row so its scroll area has no empty wave
      // gutter. Measure actual command groups, not that full-width container.
      const contentRight=Array.from(hud?.children||[]).reduce((right,node)=>{const rect=node.getBoundingClientRect();return rect.width?Math.max(right,rect.right):right;},0);
      const crowded=contentRight+12>statusRect.left;
      status.style.visibility=native||crowded?'hidden':'';
    }
  }
  function accept(value) {
    if(value?.mode!=='campaign'||typeof value.session!=='string'||!Number.isFinite(Number(value.gameTime)))return false;
    if(state.snapshot?.session!==value.session){
      state.physicalPointers.clear();state.interactionUntil=Math.max(state.interactionUntil,Date.now()+250);
      window.__kalaWarzoneTouch?.releaseAll?.(true,false);
      window.__warzoneCommands?.resetSession?.();window.__blockNightResearch?.resetSession?.();
      state.selectionPending=false;state.lastSelection=0;state.intentKey='';
      window.dispatchEvent(new CustomEvent('warzone-campaign-session',{detail:value}));
    }
    state.snapshot={...value,paused:Boolean(state.frame?.paused)};
    window.__towersHtml?.activate?.(state.snapshot);
    window.__kalaWarzoneTouch?.showCombatHud?.();
    if(window.WarzoneSavedGames?.loading&&!window.WarzoneSavedGames.ready)
      void window.WarzoneSavedGames.resumeCampaign?.(state.snapshot).catch(error=>{state.lastError=String(error.message||error);});
    writeIntent(true);render();return true;
  }
  function consume(text) {
    const marker='BNCAMPAIGN:',start=String(text).indexOf(marker);if(start<0)return;
    try{accept(JSON.parse(String(text).slice(start+marker.length)));}catch(error){state.lastError=String(error.message||error);}
  }
  function pollLogs(fs,current) {
    if(!fs?.readdir)return;
    const dir=(current?.WZVAL_configDirPath||window.wz_js_get_config_dir_path?.()||'/warzone2100-campaign')+'/logs';
    try{for(const name of fs.readdir(dir).filter(value=>value.endsWith('.log'))){
      const path=dir+'/'+name,size=fs.stat(path).size;
      if(!(path in state.offsets)){state.offsets[path]=size;state.partials[path]='';continue;}
      const offset=state.offsets[path]>size?0:state.offsets[path];if(offset===size)continue;
      const stream=fs.open(path,'r'),bytes=new Uint8Array(Math.min(size-offset,131072));let read;
      try{read=fs.read(stream,bytes,0,bytes.length,offset);}finally{fs.close(stream);}
      const lines=(state.partials[path]+new TextDecoder().decode(bytes.subarray(0,read))).split(/\r?\n/);state.partials[path]=lines.pop();lines.forEach(consume);state.offsets[path]=offset+read;
    }}catch(_){/* Native logging becomes available during startup. */}
  }
  function poll() {
    if(state.ended)return;
    const current=module(),fs=current?.FS;
    try{const frame=JSON.parse(fs.readFile(FRAME,{encoding:'utf8'}));state.frame=frame;
      if(state.snapshot&&Number.isFinite(Number(frame.gameTime)))state.snapshot={...state.snapshot,gameTime:Number(frame.gameTime),paused:Boolean(frame.paused),nativeLevel:frame.nativeLevel||state.snapshot.nativeLevel};
    }catch(_){state.frame=null;}
    if(state.frame?.playing||state.frame?.video)window.__kalaWarzoneTouch?.setBattleActive?.(true);
    const native=nativeUiActive();if(native&&!state.nativeVisible)revealNativeUi();state.nativeVisible=native;
    pollLogs(fs,current);writeIntent();render();
    if(state.allCombat&&!suspended()&&Date.now()-state.lastSelection>=500)void selectCombat();
  }
  doc.addEventListener('pointerdown',event=>{if(event.target.closest?.('button,input,select')&&!event.target.closest?.('#wt-campaign-all-combat,#blocknight-select-all')){state.interactionUntil=Date.now()+250;writeIntent(true);}},true);
  function physicalPointer(event){return event.pointerType==='touch'||event.pointerType==='pen'||event.pointerType==='mouse'&&event.isTrusted===true;}
  function beginPhysicalInput(event){
    if(!physicalPointer(event))return;
    state.physicalPointers.add(event.pointerId);writeIntent(true);
  }
  function endPhysicalInput(event){
    if(!physicalPointer(event)||!state.physicalPointers.delete(event.pointerId))return;
    state.interactionUntil=Math.max(state.interactionUntil,Date.now()+250);writeIntent(true);
  }
  function clearPhysicalInput(){state.physicalPointers.clear();state.interactionUntil=Math.max(state.interactionUntil,Date.now()+250);writeIntent(true);}
  // Canvas input is stopped at document capture by the touch adapter. Window
  // capture runs first and fences native selection even for a complete tap
  // occurring between the HUD's polls. Forwarded mouse events are ignored.
  window.addEventListener('pointerdown',beginPhysicalInput,true);
  window.addEventListener('pointerup',endPhysicalInput,true);
  window.addEventListener('pointercancel',endPhysicalInput,true);
  window.addEventListener('blur',clearPhysicalInput,true);
  window.addEventListener('blocknight-engine-output',event=>consume(event.detail?.text||''));
  window.addEventListener('warzone-intelligence-state',()=>{state.interactionUntil=Math.max(state.interactionUntil,Date.now()+250);writeIntent(true);});
  window.addEventListener('warzone-battle-ended',()=>{state.physicalPointers.clear();state.ended=true;state.allCombat=false;writeIntent(true);render();});
  window.addEventListener('pagehide',()=>{state.physicalPointers.clear();state.ended=true;state.allCombat=false;writeIntent(true);});
  window.__warzoneCampaign={accept,consume,poll,toggleAllCombat,openIntel,openBriefings,closeNativeUi,revealNativeUi,nativeUiActive,
    briefingKeyActive:()=>state.briefingKey,
    handleBack:()=>window.__warzoneIntelligence?.handleBack?.()||(nativeUiActive()&&Boolean(state.frame)?closeNativeUi():false),
    refreshIntent:()=>writeIntent(true),
    report:()=>({snapshot:state.snapshot,frame:state.frame,nativeState:state.frame,allCombat:state.allCombat,suspended:Boolean(suspended()),selectedCount:state.selectedCount,
      selectionPending:state.selectionPending,selectionRequests:state.selectionRequests,lastError:state.lastError,intent:state.intent,
      physicalPointerCount:state.physicalPointers.size,inputSettling:Date.now()<state.interactionUntil})};
  setInterval(poll,150);
})();
