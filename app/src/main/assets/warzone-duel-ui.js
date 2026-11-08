/* Offline 1v1 status. Native packets own time, research branches and results. */
(() => {
  'use strict';
  const config=window.__warzoneDuelConfig;
  if(config?.mode!=='duel'||!Object.isFrozen(config)||window.__warzoneDuel)return;
  const host=window.parent?.WarzoneHost?window.parent:window,owner=host.document;
  const state={snapshot:null,updates:0,polls:0,errors:0,readBytes:0,cameraRequested:false,lastPacket:'',ended:false};
  const files=new Map(),MAX_BYTES=128*1024;
  const branchName=branch=>branch==='rockets'?'Rockets':'Cannon';
  const human=branchName(config.humanBranch),opponent=branchName(config.botBranch);
  let status=null,researchShell=null;

  function ensureStatus(){
    if(status?.isConnected)return status;
    status=owner.getElementById('warzone-duel-status');
    if(status)return status;
    const style=owner.createElement('style');style.id='warzone-duel-status-style';
    style.textContent=`#warzone-duel-status{position:absolute;top:3px;right:5px;width:174px;height:38px;box-sizing:border-box;padding:2px 4px 2px 8px;border-left:1px solid #294047;color:#8ea8ad;overflow:hidden;pointer-events:none;font:8px/10px system-ui,sans-serif}#warzone-duel-status[hidden]{display:none!important}#warzone-duel-status strong{display:block;font:500 12px/14px Towers,system-ui,sans-serif;color:#8bd3cc;white-space:nowrap}#warzone-duel-status span{display:block;white-space:nowrap}#warzone-duel-status .duel-objective{color:#b6cace}body[data-research=true] #warzone-duel-status{visibility:hidden}@media(max-width:900px){#warzone-duel-status{width:164px}}@media(max-width:620px){#warzone-duel-status{width:144px;padding-left:5px;font-size:7px}}`;
    owner.head.appendChild(style);
    status=owner.createElement('aside');status.id='warzone-duel-status';status.hidden=true;
    status.setAttribute('aria-label',`${human} versus ${opponent}. Destroy the enemy Command Centre.`);
    const title=owner.createElement('strong'),detail=owner.createElement('span'),objective=owner.createElement('span');
    title.className='duel-title';detail.className='duel-detail';objective.className='duel-objective';
    objective.textContent='Destroy enemy Command Centre';status.append(title,detail,objective);
    (owner.getElementById('warzone-command-strip')||owner.body).appendChild(status);
    return status;
  }
  function annotateResearch(){
    const shell=document.getElementById('blocknight-research-shell');
    if(!shell||shell===researchShell)return;
    researchShell=shell;
    const subtitle=shell.querySelector('.bn-tech-brand small');
    if(subtitle)subtitle.textContent=`${human.toUpperCase()} + SHARED TECHNOLOGY`;
    shell.setAttribute('aria-label',`${human} and shared technology research`);
  }
  function render(){
    const hud=ensureStatus(),packet=state.snapshot;
    hud.hidden=!packet||packet.phase!=='active'||state.ended||Boolean(window.__towersHtml?.isEnded?.());
    if(!packet)return;
    const seconds=Math.max(0,Math.floor(packet.gameTime/1000)),elapsed=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    hud.querySelector('.duel-title').textContent=`${human.toUpperCase()} · ${elapsed}`;
    const health=Number(packet.humanHQ?.health),hq=packet.humanHQ?.alive===false?'HQ lost':Number.isFinite(health)?`HQ ${Math.round(Math.max(0,Math.min(100,health)))}%`:'HQ standing';
    hud.querySelector('.duel-detail').textContent=`${hq} · opponent: ${opponent}`;
    annotateResearch();
  }
  function valid(packet){
    return packet?.version===1&&packet.mode==='duel'&&packet.player===0&&packet.enemyPlayer===1
      &&Number.isFinite(packet.gameTime)&&packet.gameTime>=0&&['active','victory','defeated'].includes(packet.phase)
      &&packet.humanBranch===config.humanBranch&&packet.botBranch===config.botBranch;
  }
  function consumeLine(text){
    const marker=String(text).indexOf('BNDUEL:');if(marker<0)return false;
    try{
      const packet=JSON.parse(String(text).slice(marker+7));if(!valid(packet))return false;
      if(window.__towersHtml?.result?.()==='exited')return false;
      const serialized=JSON.stringify(packet);
      if(state.snapshot&&state.snapshot.phase!=='active'&&(state.ended||window.__towersHtml?.isEnded?.()))return serialized===state.lastPacket;
      if((state.ended||window.__towersHtml?.isEnded?.())&&packet.phase==='active')return false;
      if(serialized===state.lastPacket)return true;
      state.lastPacket=serialized;state.snapshot=packet;state.updates++;
      window.__towersHtml?.activate?.(packet);
      if(packet.phase!=='active')window.__towersHtml?.finish?.(packet.phase==='victory');
      render();return true;
    }catch(_){state.errors++;return false;}
  }
  function pollLogs(){
    const module=window.LaunchedModule?.FS?window.LaunchedModule:window.Module,fs=module?.FS;
    if(!fs?.readdir||!fs?.stat||!fs?.open||!fs?.read||!fs?.close)return;
    const directory=`${module.WZVAL_configDirPath||'/warzone2100'}/logs`;
    try{
      let budget=MAX_BYTES;
      for(const name of fs.readdir(directory).filter(n=>n.endsWith('.log')).sort().reverse()){
        const path=`${directory}/${name}`,size=fs.stat(path).size;let entry=files.get(path);
        // Old branch saves/logs can persist on this phone. Only this launch's
        // appended native packets may activate or finish the current session.
        if(!entry){files.set(path,{offset:size,partial:'',decoder:new TextDecoder()});continue;}
        if(entry.offset>size){entry.offset=0;entry.partial='';entry.decoder=new TextDecoder();}
        if(entry.offset===size||budget<=0)continue;
        const buffer=new Uint8Array(Math.min(size-entry.offset,budget)),stream=fs.open(path,'r');let count;
        try{count=fs.read(stream,buffer,0,buffer.length,entry.offset);}finally{fs.close(stream);}
        if(!count)continue;
        entry.offset+=count;budget-=count;state.readBytes+=count;
        const addition=entry.partial+entry.decoder.decode(buffer.subarray(0,count),{stream:true}),lines=addition.split(/\r?\n/);
        entry.partial=lines.pop().slice(-MAX_BYTES);lines.forEach(consumeLine);
      }
      state.polls++;
    }catch(_){state.errors++;}
  }
  function engineExited(){
    if(window.__towersHtml?.isEnded?.())return;
    pollLogs();
    if(window.__towersHtml?.isEnded?.())return;
    const phase=state.snapshot?.phase;
    if(['victory','defeated'].includes(phase))window.__towersHtml?.finish?.(phase==='victory');
    else window.__towersHtml?.exit?.('engine-exit');
  }
  function faceOpponent(){
    const packet=state.snapshot;if(!packet||state.ended||window.__towersHtml?.isEnded?.())return false;
    const y=packet.humanHQ?.y,enemyY=packet.enemyHQ?.y;if(!Number.isFinite(y)||!Number.isFinite(enemyY))return false;
    const sent=window.__kalaWarzoneTouch?.faceOpponent?.(enemyY<y?'td1':'td2')===true;
    if(sent)state.cameraRequested=true;return sent;
  }
  function report(){
    const touch=window.__kalaWarzoneTouch?.report?.();
    return {version:1,active:Boolean(state.snapshot?.phase==='active'&&!state.ended&&!window.__towersHtml?.isEnded?.()),snapshot:state.snapshot,updates:state.updates,polls:state.polls,errors:state.errors,readBytes:state.readBytes,
      humanBranch:config.humanBranch,botBranch:config.botBranch,cameraRequested:state.cameraRequested,cameraReady:Boolean(state.cameraRequested&&touch?.cameraFacingPending===false&&!touch?.cameraFacingError)};
  }
  window.__warzoneDuel={version:1,nativeOutput:consumeLine,pollOutput:pollLogs,engineExited,faceOpponent,report};
  // Compatibility for shared build-drain timing and the existing index exit
  // callback. This mode creates no wave controls or Towers scenario messages.
  window.__warzoneTowersWaves={version:1,engineExited,report};
  window.addEventListener('blocknight-engine-output',event=>consumeLine(String(event?.detail?.text||'')));
  window.addEventListener('warzone-battle-ended',()=>{state.ended=true;if(status)status.hidden=true;});
  const wrappers=[];
  for(const method of ['log','warn','error']){
    const original=console[method],wrapped=function(...args){const text=args.map(String).join(' ');if(text.includes('BNDUEL:'))consumeLine(text);return original.apply(this,args);};
    console[method]=wrapped;wrappers.push({method,original,wrapped});
  }
  const observer=typeof MutationObserver==='function'?new MutationObserver(annotateResearch):null;
  observer?.observe(document.body,{childList:true,subtree:false});
  const timer=setInterval(pollLogs,500);setTimeout(pollLogs,250);
  window.addEventListener('pagehide',()=>{clearInterval(timer);observer?.disconnect();for(const {method,original,wrapped}of wrappers)if(console[method]===wrapped)console[method]=original;},{once:true});
})();
