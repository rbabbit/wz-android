/* Completed research reports, with the game's own models and report audio. */
(() => {
  'use strict';
  if (window.__warzoneIntelligence || window.__warzoneDuelConfig?.mode === 'duel') return;
  const campaign = window.__warzoneCampaignMode === true || (typeof location !== 'undefined' && typeof URLSearchParams === 'function' && new URLSearchParams(location.search).get('mode') === 'campaign');
  const host = window.parent?.WarzoneHost ? window.parent : window;
  const doc = host.document, session = window.__towersHtml?.session || '';
  const COMMAND = '/tmp/warzone-towers-intelligence-command.json';
  const RESPONSE = '/tmp/warzone-towers-intelligence-state.json';
  const state = {open:false,opening:false,closing:false,serial:0,selection:0,pending:0,
    history:[],selected:null,selectedId:'',query:'',viewport:null,preview:null,
    lastError:'',requests:0,opens:0,closes:0,lastClock:null,lastRefresh:0,rectKey:'',closingPromise:null,campaignSession:''};
  let transport = Promise.resolve(), nonce = 0, layoutFrame = 0, refreshTimer = 0, refreshTask = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const active = () => Boolean(window.__towersHtml?.isActive?.());
  const fs = () => window.LaunchedModule?.FS;
  const nativeGameTime = value => typeof value?.gameTime === 'number' &&
    Number.isFinite(value.gameTime) && value.gameTime >= 0 ? value.gameTime : null;
  const button = (text,attributes={}) => {
    const b=doc.createElement('button');b.type='button';b.textContent=text;
    for(const [key,value] of Object.entries(attributes))b.setAttribute(key,value);
    return b;
  };
  const style=doc.createElement('link');style.rel='stylesheet';style.href='/warzone/ui/towers-intelligence.css';doc.head.appendChild(style);
  const scrim=doc.createElement('div');scrim.id='wt-intelligence-scrim';scrim.hidden=true;
  const panel=doc.createElement('section');panel.id='wt-intelligence-panel';panel.hidden=true;
  panel.setAttribute('aria-label','Intelligence: completed research');panel.setAttribute('role','dialog');
  panel.innerHTML='<header><button type="button" id="wt-intelligence-title" aria-label="Close Intelligence">INTELLIGENCE <span aria-hidden="true">⌄</span></button><small id="wt-intelligence-count"></small></header><div class="wt-intel-content"><aside class="wt-intel-history"><input id="wt-intelligence-search" type="search" placeholder="Find research" aria-label="Find research reports"><div id="wt-intelligence-list" aria-label="Research reports"></div></aside><article class="wt-intel-detail"><h2 id="wt-intelligence-name">Research reports</h2><div id="wt-intelligence-preview"><div class="wt-intel-preview-cover"><img alt=""></div></div><div id="wt-intelligence-copy" tabindex="0"></div></article></div><p id="wt-intelligence-status" role="status" aria-live="polite"></p>';
  if(campaign){
    const nav=doc.createElement('nav'),briefings=button('MISSION BRIEFINGS',{id:'wt-intelligence-briefings'});
    briefings.addEventListener('click',()=>void window.__warzoneCampaign?.openBriefings?.());
    nav.append(briefings);panel.querySelector('header').append(nav);
  }
  doc.body.append(scrim,panel);
  const list=panel.querySelector('#wt-intelligence-list'),title=panel.querySelector('#wt-intelligence-name');
  const slot=panel.querySelector('#wt-intelligence-preview'),cover=slot.querySelector('.wt-intel-preview-cover');
  const copy=panel.querySelector('#wt-intelligence-copy'),status=panel.querySelector('#wt-intelligence-status');
  function setImage(image,topic) {
    if(window.WarzoneResearchArt?.apply)window.WarzoneResearchArt.apply(image,topic);
    else {image.onerror=null;image.removeAttribute('src');image.hidden=true;}
  }
  // The native list already contains completed topics. Authored descriptions or
  // map grants are not proof that the engine issued an Intelligence message.
  const eligible=topic=>Boolean(topic&&typeof topic.id==='string'&&topic.id&&
    typeof topic.name==='string'&&topic.hasMessage===true&&topic.initialGrant!==true);
  function reportHistory(rows) {
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).filter(topic=>eligible(topic)&&!seen.has(topic.id)&&seen.add(topic.id));
  }
  function report() {return {...state,history:state.history.map(t=>({...t})),selected:state.selected?{...state.selected}:null};}
  function syncButtons() {
    const b=doc.getElementById('wt-intelligence');
    if(b){b.classList.toggle('active',state.open||state.opening);b.setAttribute('aria-expanded',String(state.open||state.opening));b.setAttribute('aria-controls',panel.id);}
    if(campaign)window.dispatchEvent(new CustomEvent('warzone-intelligence-state',{detail:{open:state.open,opening:state.opening,closing:state.closing}}));
  }
  function updateResponse(value) {
    if(value.viewport){
      const changed=JSON.stringify(value.viewport)!==JSON.stringify(state.viewport);state.viewport=value.viewport;
      if(changed)state.rectKey='';
    }
    if(value.preview)state.preview=value.preview;
  }
  function request(action,extra={},generation=state.serial) {
    const result=transport.then(async()=>{
      if((action!=='close'||campaign)&&(generation!==state.serial||!active()))throw Error('cancelled');
      const file=fs();if(!file?.readFile)throw Error('Reports are not ready yet.');
      const id='intel-'+session.slice(0,8)+'-'+(++nonce);
      state.pending++;state.requests++;
      try{
        file.writeFile(COMMAND+'.tmp',JSON.stringify({nonce:id,action,...extra}));file.rename(COMMAND+'.tmp',COMMAND);
        const deadline=performance.now()+5000;
        while(performance.now()<deadline){
          if((action!=='close'||campaign)&&generation!==state.serial)throw Error('cancelled');
          try{
            const response=JSON.parse(file.readFile(RESPONSE,{encoding:'utf8'}));
            if(response.nonce===id){
              if(!response.ok)throw Object.assign(Error(response.error||'The report could not open.'),{nativeError:true});
              updateResponse(response);return response;
            }
          }catch(error){if(error.nativeError)throw error;}
          await sleep(25);
        }
        throw Error('The game did not respond. Please try again.');
      }finally{state.pending--;}
    });
    transport=result.catch(()=>{});return result;
  }
  function renderList() {
    const visible=state.history.filter(t=>!state.query||t.name.toLowerCase().includes(state.query));
    panel.querySelector('#wt-intelligence-count').textContent=String(visible.length);
    const oldScroll=list.scrollTop;
    list.replaceChildren(...visible.map(topic=>{
      const row=button('',{'data-intel-topic':topic.id,'aria-pressed':String(topic.id===state.selectedId)});
      if(topic.id===state.selectedId)row.classList.add('active');
      const image=doc.createElement('img');image.alt='';image.loading='lazy';setImage(image,topic);
      const text=doc.createElement('span'),name=doc.createElement('b'),label=doc.createElement('small');
      name.textContent=topic.name;label.textContent=topic.read?'Read':'Research report';
      text.append(name,label);row.append(image,text);return row;
    }));
    if(!visible.length){const p=doc.createElement('p');p.className='wt-intel-empty';p.textContent=state.query?'No matching research reports.':'Your research reports will appear here.';list.append(p);}
    list.scrollTop=oldScroll;
  }
  function renderDetails(topic) {
    title.textContent=topic?.name||'Research reports';cover.hidden=false;slot.classList.remove('preview-ready');panel.classList.remove('has-native-preview');
    const image=cover.querySelector('img');image.hidden=!topic;
    if(topic)setImage(image,topic);
    copy.replaceChildren();
    if(!topic){const p=doc.createElement('p');p.textContent='Choose a completed research item to read its report.';copy.append(p);return;}
    const paragraphs=Array.isArray(topic.description)?topic.description.filter(t=>typeof t==='string'&&t.trim()):[];
    for(const line of paragraphs){const p=doc.createElement('p');p.textContent=line;copy.append(p);}
    if(!paragraphs.length){
      const labels={Armour:'Kinetic armour',Thermal:'Thermal armour',HitPointPct:'Body points',Damage:'Damage',RadiusDamage:'Blast damage',ProductionPoints:'Production speed',ResearchPoints:'Research speed',ConstructorPoints:'Construction speed',RepairPoints:'Repair speed'};
      for(const effect of topic.results||[]){if(!labels[effect.parameter]||!Number.isFinite(Number(effect.value)))continue;const p=doc.createElement('p');p.textContent=labels[effect.parameter]+' '+(Number(effect.value)>0?'+':'')+effect.value+'%';copy.append(p);}
    }
    const unlocks=(topic.unlocks||[]).filter(t=>t.name);
    if(unlocks.length){const h=doc.createElement('h3');h.textContent='Unlocked';copy.append(h);for(const entry of unlocks){const p=doc.createElement('p');p.textContent=entry.name;copy.append(p);}}
    if(!copy.childNodes.length){const p=doc.createElement('p');p.textContent='Research completed.';copy.append(p);}
    copy.scrollTop=0;
  }
  function nativeRect() {
    const canvas=document.getElementById('canvas'),view=state.viewport;
    if(!canvas||!view?.width||!view.height)return null;
    const box=slot.getBoundingClientRect(),screen=canvas.getBoundingClientRect();
    const frame=host===window?{x:0,y:0}:host.document.getElementById('warzone-game-frame').getBoundingClientRect();
    const rect={x:Math.round((box.x-frame.x-screen.x)*view.width/screen.width),
      y:Math.round((box.y-frame.y-screen.y)*view.height/screen.height),
      width:Math.round(box.width*view.width/screen.width),height:Math.round(box.height*view.height/screen.height)};
    if(rect.x<0||rect.y<0||rect.width<16||rect.height<16||rect.x+rect.width>view.width||rect.y+rect.height>view.height)return null;
    return rect;
  }
  async function layoutPreview() {
    if(!state.open||state.closing||!state.selected?.hasModel)return;
    const serial=state.serial,selection=state.selection,rect=nativeRect();
    if(!rect)return;
    const key=JSON.stringify(rect);if(key===state.rectKey)return;
    cover.hidden=false;slot.classList.remove('preview-ready');panel.classList.remove('has-native-preview');
    try{
      const value=await request('layout',{topicId:state.selectedId,rect},serial);
      if(serial!==state.serial||selection!==state.selection||!state.open)return;
      if(!eligible(value.selected)||value.selected.id!==state.selectedId){await retirePreview(serial);return;}
      state.rectKey=key;await paint();
      if(value.preview?.active&&serial===state.serial&&selection===state.selection){
        const area=panel.getBoundingClientRect(),hole=slot.getBoundingClientRect();
        const x=hole.x-area.x,y=hole.y-area.y,right=x+hole.width,bottom=y+hole.height;
        panel.style.setProperty('--intel-cut',`polygon(evenodd,0px 0px,100% 0px,100% 100%,0px 100%,0px 0px,${x}px ${y}px,${right}px ${y}px,${right}px ${bottom}px,${x}px ${bottom}px,${x}px ${y}px,0px 0px)`);
        cover.hidden=true;slot.classList.add('preview-ready');panel.classList.add('has-native-preview');
      }
    }catch(error){if(serial===state.serial&&error.message!=='cancelled'){state.lastError=error.message;status.textContent='The report is available; try its image again to reopen the model.';}}
  }
  function scheduleLayout() {
    if(layoutFrame)cancelAnimationFrame(layoutFrame);
    layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;void layoutPreview();});
  }
  function clearSelection() {
    ++state.selection;state.selected=null;state.selectedId='';state.rectKey='';
    renderDetails(null);
  }
  async function retirePreview(generation) {
    // Cover the old model before resetting the read-only native preview. The
    // transport orders this reset before a later user selection, never after it.
    clearSelection();const selection=state.selection;
    const value=await request('open',{},generation);
    if(generation!==state.serial||!state.open||selection!==state.selection)return;
    state.history=reportHistory(value.history);renderList();
  }
  async function choose(id,playAudio=true) {
    const topic=state.history.find(t=>t.id===id);if(!eligible(topic)||!state.open||state.closing)return false;
    const generation=state.serial,selection=++state.selection;
    state.selectedId=id;state.rectKey='';renderList();renderDetails(topic);status.textContent='';
    try{
      const value=await request('select',{topicId:id,playAudio},generation);
      if(generation!==state.serial||selection!==state.selection||!state.open)return false;
      if(!eligible(value.selected)||value.selected.id!==id){
        await retirePreview(generation);status.textContent='This research has no Intelligence report.';return false;
      }
      state.selected=value.selected;
      const index=state.history.findIndex(t=>t.id===id);
      if(index>=0)state.history[index]={...state.history[index],read:value.selected.read};
      renderList();renderDetails(value.selected);scheduleLayout();return true;
    }catch(error){if(generation===state.serial&&error.message!=='cancelled'){state.lastError=error.message;status.textContent=error.message;}return false;}
  }
  async function refresh() {
    if(!state.open||state.closing)return false;
    if(refreshTask)return refreshTask;
    const generation=state.serial;
    state.lastRefresh=performance.now();
    const task=(async()=>{
      try{
        const value=await request('list',{},generation);
        if(generation!==state.serial||!state.open||state.closing)return false;
        const history=reportHistory(value.history),changed=JSON.stringify(history)!==JSON.stringify(state.history);
        state.history=history;state.lastRefresh=performance.now();
        if(state.selectedId&&!history.some(t=>t.id===state.selectedId))await retirePreview(generation);
        else if(changed)renderList();
        return true;
      }catch(error){if(generation===state.serial&&error.message!=='cancelled'){state.lastError=error.message;status.textContent=error.message;}return false;}
    })();
    refreshTask=task;
    try{return await task;}finally{if(refreshTask===task)refreshTask=null;}
  }
  async function open(topicId='') {
    if(!active())return false;
    if(campaign&&window.__warzoneCampaign?.nativeUiActive?.())return false;
    topicId=typeof topicId==='string'?topicId:'';
    if(state.closing)await state.closingPromise;
    if(state.open){if(topicId){if(!await refresh())return false;return choose(topicId);}return true;}
    if(state.opening)return false;
    if(window.__kalaWarzoneTouch?.prepareHeaderMenu?.('wt-intelligence')===false)return false;
    window.__warzoneCommands?.cancelDemolish?.();
    const generation=++state.serial;state.opening=true;state.lastError='';syncButtons();
    try{
      await window.__warzoneCommands?.selectMode?.();
      if(generation!==state.serial||!active())return false;
      host.TowersStatus?.close?.();window.__kalaWarzoneTouch?.cancelFacilityNavigation?.();
      window.__kalaWarzoneTouch?.releaseAll?.(true,false);
      const value=await request('open',{},generation);
      if(generation!==state.serial||!active())return false;
      state.history=reportHistory(value.history);
      if(topicId&&!state.history.some(t=>t.id===topicId)){await request('close',{},generation);return false;}
      state.open=true;state.opening=false;state.opens++;state.lastRefresh=performance.now();
      state.lastClock=nativeGameTime(value);
      state.query='';panel.querySelector('input').value='';state.selected=null;state.selectedId='';state.rectKey='';
      panel.hidden=false;scrim.hidden=false;status.textContent='';renderList();renderDetails(null);syncButtons();
      panel.querySelector('#wt-intelligence-title').focus({preventScroll:true});
      const first=topicId||state.history[state.history.length-1]?.id;
      if(first)await choose(first,Boolean(topicId));
      return true;
    }catch(error){if(generation===state.serial){state.lastError=error.message;window.WarzoneNotices?.show?.('Intelligence',error.message);void close();}return false;}
    finally{if(generation===state.serial)state.opening=false;syncButtons();}
  }
  function close(immediate=false) {
    if(state.closing)return state.closingPromise;
    if(!state.open&&!state.opening)return Promise.resolve(false);
    state.open=false;state.opening=false;state.closing=true;++state.serial;++state.selection;
    clearTimeout(refreshTimer);refreshTimer=0;
    cover.hidden=false;slot.classList.remove('preview-ready');panel.classList.remove('has-native-preview');
    if(layoutFrame)cancelAnimationFrame(layoutFrame);layoutFrame=0;syncButtons();
    if(immediate){panel.hidden=true;scrim.hidden=true;}
    const generation=state.serial;
    state.closingPromise=(async()=>{
      try{await request('close');await paint();}catch(error){
        if(campaign&&generation!==state.serial)return false;
        if(!immediate&&active()){
          state.closing=false;state.open=true;state.lastError=error.message;syncButtons();
          status.textContent='Closing the report. Tap Intelligence to try again.';
          return false;
        }
      }
      if(campaign&&generation!==state.serial)return false;
      panel.hidden=true;scrim.hidden=true;cover.hidden=false;slot.classList.remove('preview-ready');
      state.selected=null;state.selectedId='';state.closing=false;state.closes++;syncButtons();
      const commands=window.__warzoneCommands?.report?.(),research=window.__blockNightResearch?.report?.();
      if(!campaign||!window.__warzoneCampaign?.nativeUiActive?.()&&!commands?.page&&!commands?.buildOpen&&!research?.open&&!research?.opening&&!window.WarzoneSavedGames?.busy)
        document.getElementById('canvas')?.focus({preventScroll:true});
      return true;
    })();return state.closingPromise;
  }
  function toggle(){return state.open||state.opening||state.closing?close():open();}
  panel.querySelector('#wt-intelligence-title').addEventListener('click',()=>void close());
  scrim.addEventListener('click',()=>void close());
  slot.addEventListener('click',()=>{if(state.open&&state.selectedId)void choose(state.selectedId);});
  panel.querySelector('input').addEventListener('input',event=>{state.query=event.target.value.trim().toLowerCase();renderList();});
  panel.addEventListener('click',event=>{
    const topic=event.target.closest('[data-intel-topic]');if(topic)void choose(topic.dataset.intelTopic);
  });
  let highlightTimer=0;
  list.addEventListener('pointerover',event=>{
    if(event.pointerType!=='mouse')return;const row=event.target.closest('[data-intel-topic]');if(!row)return;
    clearTimeout(highlightTimer);highlightTimer=setTimeout(()=>{if(state.open&&!state.pending&&state.history.some(t=>t.id===row.dataset.intelTopic&&eligible(t)))void request('highlight',{topicId:row.dataset.intelTopic,playAudio:true}).catch(()=>{});},90);
  });
  doc.addEventListener('click',event=>{
    if(!state.open&&!state.opening)return;
    const command=event.target.closest('#blocknight-combat-hud button,#lab-ops button,#wt-field-toggle');
    if(command){
      if(campaign){
        event.preventDefault();event.stopImmediatePropagation();
        const session=state.campaignSession;
        void close().then(closed=>{if(closed&&session===state.campaignSession&&active()&&!window.__warzoneCampaign?.nativeUiActive?.())command.click();});
      }else void close();
    }
  },true);
  const onKey=event=>{
    if(campaign&&event.code==='F5'&&(window.__warzoneCampaign?.briefingKeyActive?.()||window.__warzoneCampaign?.nativeUiActive?.()))return;
    if(event.code==='F5'&&active()){event.preventDefault();event.stopImmediatePropagation();void toggle();}
    else if(event.key==='Escape'&&(state.open||state.opening)){event.preventDefault();event.stopImmediatePropagation();void close();}
  };
  window.addEventListener('keydown',onKey,true);if(host!==window)host.addEventListener('keydown',onKey,true);
  window.addEventListener('blocknight-research-completed',()=>{if(state.open){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,200);}});
  window.addEventListener('warzone-battle-ended',()=>void close(true));
  if(campaign)window.addEventListener('warzone-campaign-session',event=>{
    const session=event.detail?.session;if(typeof session!=='string'||session===state.campaignSession)return;
    state.campaignSession=session;++state.serial;++state.selection;
    clearTimeout(refreshTimer);refreshTimer=0;if(layoutFrame)cancelAnimationFrame(layoutFrame);layoutFrame=0;
    state.open=false;state.opening=false;state.closing=false;state.closingPromise=null;state.history=[];state.selected=null;state.selectedId='';state.preview=null;state.lastClock=null;state.rectKey='';
    panel.hidden=true;scrim.hidden=true;cover.hidden=false;slot.classList.remove('preview-ready');panel.classList.remove('has-native-preview');transport=Promise.resolve();syncButtons();
  });
  new ResizeObserver(scheduleLayout).observe(slot);
  setInterval(async()=>{
    if(!state.open||state.closing||state.pending)return;
    if(!active()){void close(true);return;}
    const generation=state.serial;
    try{
      const value=await request('heartbeat',{},generation);
      if(generation!==state.serial||!state.open||state.closing)return;
      // Compare native responses with native responses. The log-fed wave HUD
      // may lag or replay a packet; it is not evidence of a game being loaded.
      const clock=nativeGameTime(value);
      if(clock!==null){
        if(state.lastClock!==null&&clock<state.lastClock){state.history=[];void close();return;}
        state.lastClock=clock;
      }
      if(state.open&&state.selected?.hasModel&&!value.preview?.active){cover.hidden=false;slot.classList.remove('preview-ready');panel.classList.remove('has-native-preview');state.rectKey='';scheduleLayout();}
      // Missed completion notifications must not leave a permanently stale list.
      // A single coalesced request every 1.8s also stays within the native lease.
      if(state.open&&performance.now()-state.lastRefresh>=1800)void refresh();
    }
    catch(error){if(generation===state.serial&&state.open&&!state.closing){state.lastError=error.message;void close();}}
  },600);
  // The preview is a transparent window onto the native canvas. Keep world
  // overlays concealed until its open/close acknowledgement and paint barrier.
  window.__warzoneIntelligence={open,close,toggle,refresh,select:choose,report,
    isOpen:()=>state.open||state.opening||state.closing,
    handleBack:()=>{if(!state.open&&!state.opening&&!state.closing)return false;void close();return true;}};
})();
