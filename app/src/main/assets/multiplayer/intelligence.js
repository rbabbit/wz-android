/* Multiplayer Intelligence reads only completed topics with real native report messages. */
(() => {
 'use strict';
 if(window.__warzoneIntelligence)return;
 const state={open:false,opening:false,serial:0,selectedId:'',query:'',rows:[],ready:false,player:null,gameTime:null,lastError:'',updates:0,opens:0,closes:0};
 const element=id=>document.getElementById(id);
 const active=()=>window.PcMultiplayerState?.phase==='game'&&window.PcMultiplayerState?.worldReady===true;
 const cloneRows=rows=>rows.map(row=>({...row,description:row.description.slice(),results:row.results.map(effect=>({...effect})),unlocks:row.unlocks.map(unlock=>({...unlock}))}));
 function rowsFromNative(rows){
  const seen=new Set();
  return (Array.isArray(rows)?rows:[]).filter(row=>row&&typeof row.id==='string'&&row.id&&typeof row.name==='string'&&row.completed===true&&row.hasMessage===true&&row.initialGrant!==true&&!seen.has(row.id)&&seen.add(row.id)).slice(0,1200).map(row=>({
   id:row.id,name:row.name,completed:true,hasMessage:true,initialGrant:row.initialGrant===false?false:null,read:Boolean(row.read),
   description:(Array.isArray(row.description)?row.description:typeof row.description==='string'?row.description.split('\n'):[]).filter(line=>typeof line==='string'&&line.trim()).slice(0,24),
   results:(Array.isArray(row.results)?row.results:[]).filter(effect=>effect&&typeof effect.parameter==='string'&&Number.isFinite(Number(effect.value))).slice(0,30).map(effect=>({parameter:effect.parameter,value:Number(effect.value)})),
   unlocks:(Array.isArray(row.unlocks)?row.unlocks:[]).filter(unlock=>unlock&&typeof unlock.name==='string'&&unlock.name).slice(0,30).map(unlock=>({id:String(unlock.id||''),name:unlock.name})),
   completedAt:Number.isFinite(Number(row.completedAt))?Number(row.completedAt):null
  }));
 }
 function acceptReports(value){
  let payload=value;try{if(typeof value==='string')payload=JSON.parse(value);}catch{return false;}
  if(Array.isArray(payload))payload={ready:true,reports:payload};
  if(!payload||payload.ready!==true||!Array.isArray(payload.reports))return false;
  if(Number.isFinite(payload.player)&&state.player!==null&&payload.player!==state.player){state.selectedId='';state.query='';}
  if(Number.isFinite(payload.gameTime)&&state.gameTime!==null&&payload.gameTime<state.gameTime){state.selectedId='';state.query='';}
  if(Number.isFinite(payload.player))state.player=payload.player;
  if(Number.isFinite(payload.gameTime))state.gameTime=payload.gameTime;
  const rows=rowsFromNative(payload.reports),changed=JSON.stringify(rows)!==JSON.stringify(state.rows)||!state.ready;
  state.rows=rows;state.ready=true;state.lastError='';state.updates++;
  if(!state.rows.some(row=>row.id===state.selectedId))state.selectedId=state.rows[0]?.id||'';
  if(state.open&&changed)render();return true;
 }
 function readNative(){
  const bridge=window.PcMultiplayerNative||window.PcMultiplayerNativeUI;
  try{
   if(typeof bridge?.researchReports==='function'){const value=bridge.researchReports();if(value!==undefined&&value!==null)acceptReports(value);}
   const value=typeof bridge?.state==='function'?bridge.state():bridge?.state;
   if(value?.intelligence)acceptReports(value.intelligence);
   else if(Array.isArray(value?.researchReports))acceptReports({ready:true,player:value.player,gameTime:value.gameTime,reports:value.researchReports});
  }catch(error){state.lastError=String(error.message||error);if(state.open)renderStatus();}
 }
 function icon(image,row){if(window.WarzoneResearchArt?.apply)window.WarzoneResearchArt.apply(image,row);else{image.hidden=true;image.removeAttribute('src');}}
 function install(){
  if(element('mp-intelligence'))return;
  const style=document.createElement('style');style.id='mp-intelligence-style';style.textContent=`
#mp-intelligence-scrim{position:fixed;inset:0;z-index:2147483638;background:transparent;touch-action:none}
#mp-intelligence{position:fixed;z-index:2147483639;top:8px;left:50%;transform:translateX(-50%);width:min(800px,calc(100vw - 20px));height:min(410px,calc(100vh - 20px));min-height:170px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;border:0;border-radius:5px;background:#111;color:#f4f4f4;font:12px/1.35 Towers,Oswald,system-ui,sans-serif}
#mp-intelligence[hidden],#mp-intelligence-scrim[hidden]{display:none!important}#mp-intelligence *{box-sizing:border-box}#mp-intelligence button{font:inherit;border:1px solid transparent;border-radius:5px;background:#252525;color:#f4f4f4;min-height:32px;cursor:pointer;touch-action:manipulation}#mp-intelligence button:active{transform:translateY(1px)}#mp-intelligence button:focus-visible,#mp-intelligence input:focus-visible,#mp-intel-copy:focus-visible{outline:2px solid #eee;outline-offset:-2px}
#mp-intelligence>header{display:flex;align-items:center;gap:10px;min-height:39px;padding:5px 10px;flex:none}#mp-intel-title{font-size:19px!important;letter-spacing:.25px;padding:2px 4px;background:transparent!important}#mp-intel-title span{font-size:13px;margin-left:5px}#mp-intel-count{color:#bbb;font:11px system-ui,sans-serif}
.mp-intel-content{display:grid;grid-template-columns:minmax(150px,31%) minmax(0,1fr);gap:15px;padding:4px 12px 10px;flex:1;min-height:0}.mp-intel-history{display:flex;flex-direction:column;min-width:0;min-height:0}#mp-intel-search{font:12px system-ui,sans-serif;min-height:32px;height:32px;flex:none;width:100%;border:0;border-radius:4px;padding:6px 9px;margin-bottom:6px;background:#252525;color:#eee}#mp-intel-list{min-height:0;overflow:auto;flex:1;touch-action:pan-y;overscroll-behavior:contain;scrollbar-width:thin}#mp-intel-list button{width:100%;display:flex;align-items:center;gap:9px;text-align:left;min-height:59px;padding:5px;margin:0 0 4px;background:transparent}#mp-intel-list button[aria-pressed=true]{background:#f4f4f4;color:#111}#mp-intel-list img{width:49px;height:49px;object-fit:contain;flex:none}#mp-intel-list b{font-size:13px;font-weight:500;overflow-wrap:anywhere}#mp-intel-list small{display:block;font:10px system-ui,sans-serif;opacity:.7;margin-top:3px}.mp-intel-empty{font:12px/1.5 system-ui,sans-serif;color:#bbb;padding:8px}
.mp-intel-detail{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}#mp-intel-name{margin:0 0 9px;font-size:20px;line-height:1.15;font-weight:500}.mp-intel-report-head{display:flex;align-items:center;gap:14px;margin:1px 0 12px;flex:none}#mp-intel-image{height:91px;width:110px;object-fit:contain;background:transparent}#mp-intel-label{font:11px/1.4 system-ui,sans-serif;color:#bbb}#mp-intel-copy{overflow:auto;min-height:0;flex:1;font:13px/1.45 system-ui,sans-serif;overscroll-behavior:contain;touch-action:pan-y}#mp-intel-copy p{margin:0 0 9px}#mp-intel-copy h3{font:500 14px Towers,system-ui,sans-serif;margin:12px 0 7px}#mp-intel-status{flex:none;margin:0;padding:0 12px 8px;color:#bbb;font:11px/1.3 system-ui,sans-serif;min-height:0}#mp-intel-status:empty{display:none}
@media(max-width:700px){.mp-intel-content{grid-template-columns:minmax(135px,36%) minmax(0,1fr);gap:10px;padding-left:8px;padding-right:8px}#mp-intel-list img{width:41px;height:41px}#mp-intel-list button{min-height:51px;gap:6px}#mp-intel-list b{font-size:12px}#mp-intel-image{width:81px;height:72px}#mp-intel-name{font-size:18px}#mp-intel-copy{font-size:12px}}
`;
  document.head.appendChild(style);
  const scrim=document.createElement('div');scrim.id='mp-intelligence-scrim';scrim.hidden=true;scrim.setAttribute('aria-hidden','true');
  const panel=document.createElement('section');panel.id='mp-intelligence';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Intelligence research reports');
  panel.innerHTML='<header><button id="mp-intel-title" type="button" aria-label="Close Intelligence">INTELLIGENCE <span aria-hidden="true">⌄</span></button><small id="mp-intel-count"></small></header><div class="mp-intel-content"><aside class="mp-intel-history"><input id="mp-intel-search" type="search" placeholder="Find research" aria-label="Find research reports"><div id="mp-intel-list" aria-label="Completed research reports"></div></aside><article class="mp-intel-detail"><h2 id="mp-intel-name">Research reports</h2><div class="mp-intel-report-head"><img id="mp-intel-image" alt=""><span id="mp-intel-label"></span></div><div id="mp-intel-copy" tabindex="0"></div></article></div><p id="mp-intel-status" role="status" aria-live="polite"></p>';
  document.body.append(scrim,panel);element('mp-intel-title').addEventListener('click',close);scrim.addEventListener('pointerdown',event=>{event.preventDefault();close();});
  element('mp-intel-search').addEventListener('input',event=>{state.query=event.target.value.trim().toLowerCase();renderList();});
  element('mp-intel-list').addEventListener('click',event=>{const row=event.target.closest('[data-report-id]');if(row)select(row.dataset.reportId);});
 }
 function renderList(){
  const list=element('mp-intel-list'),rows=state.rows.filter(row=>!state.query||row.name.toLowerCase().includes(state.query));if(!list)return;
  const scroll=list.scrollTop;list.replaceChildren();element('mp-intel-count').textContent=state.ready?String(rows.length):'CONNECTING';
  for(const row of rows){const button=document.createElement('button');button.type='button';button.dataset.reportId=row.id;button.setAttribute('aria-pressed',String(row.id===state.selectedId));const image=document.createElement('img');image.alt='';icon(image,row);const text=document.createElement('span'),name=document.createElement('b'),label=document.createElement('small');name.textContent=row.name;label.textContent='Research report';text.append(name,label);button.append(image,text);list.append(button);}
  if(!rows.length){const empty=document.createElement('p');empty.className='mp-intel-empty';empty.textContent=!state.ready?'Connecting to research reports…':state.query?'No matching research reports.':'Your completed research reports will appear here.';list.append(empty);}list.scrollTop=scroll;
 }
 function renderDetails(){
  const row=state.rows.find(row=>row.id===state.selectedId),copy=element('mp-intel-copy'),image=element('mp-intel-image');if(!copy)return;
  element('mp-intel-name').textContent=row?.name||'Research reports';element('mp-intel-label').textContent=row?'RESEARCH COMPLETE':'';image.hidden=!row;if(row)icon(image,row);copy.replaceChildren();
  const paragraph=text=>{const p=document.createElement('p');p.textContent=text;copy.append(p);};
  if(!row){paragraph(state.ready?'Choose a completed research report.':'Connecting to the game…');return;}
  for(const line of row.description)paragraph(line);
  if(!row.description.length){const labels={Armour:'Kinetic armour',Thermal:'Thermal armour',HitPointPct:'Body points',Damage:'Damage',RadiusDamage:'Blast damage',ProductionPoints:'Production speed',ResearchPoints:'Research speed',ConstructorPoints:'Construction speed',RepairPoints:'Repair speed'};for(const effect of row.results){if(labels[effect.parameter])paragraph(labels[effect.parameter]+' '+(effect.value>0?'+':'')+effect.value+'%');}}
  if(row.unlocks.length){const title=document.createElement('h3');title.textContent='Unlocked';copy.append(title);for(const unlock of row.unlocks)paragraph(unlock.name);}
  if(!copy.childNodes.length)paragraph('Research completed.');copy.scrollTop=0;
 }
 function renderStatus(){const node=element('mp-intel-status');if(node)node.textContent=state.lastError?'Could not update research reports. Your current report is kept.':'';}
 function render(){renderList();renderDetails();renderStatus();}
 function nativeReport(action,id){try{const result=window.PcMultiplayerNative?.command?.(action,id?{id}:{});if(result?.catch)result.catch(error=>{state.lastError=String(error.message||error);if(state.open)renderStatus();});}catch(error){state.lastError=String(error.message||error);if(state.open)renderStatus();}}
 function release(){window.PcMultiplayerControls?.releaseAll?.();window.__kalaWarzoneTouch?.releaseAll?.(true);}
 function signal(){window.dispatchEvent(new CustomEvent('warzone-intelligence-state',{detail:{open:state.open,opening:state.opening,closing:false}}));}
 async function open(){
  if(state.open||state.opening)return true;if(!active())return false;
  state.opening=true;const serial=++state.serial;release();signal();
  try{
   window.parent?.TowersStatus?.close?.();window.__kalaWarzoneTouch?.closeHelp?.();
   await Promise.resolve(window.__blockNightResearch?.close?.());
   if(window.__warzoneCommands?.afterBuildExit){const exited=await window.__warzoneCommands.afterBuildExit(()=>true);if(exited!==true){state.opening=false;signal();return false;}}
   window.__warzoneCommands?.close?.();
   if(serial!==state.serial||!active()){state.opening=false;signal();return false;}
   install();readNative();state.opening=false;state.open=true;state.opens++;element('mp-intelligence-scrim').hidden=false;element('mp-intelligence').hidden=false;
   const host=window.parent?.document;const drawer=host?.getElementById('wt-field-centre');if(drawer)drawer.hidden=true;host?.getElementById('wt-field-toggle')?.setAttribute('aria-expanded','false');
   render();if(state.selectedId)nativeReport('report-read',state.selectedId);release();signal();element('mp-intel-title').focus({preventScroll:true});return true;
  }catch(error){state.opening=false;state.lastError=String(error.message||error);signal();return false;}
 }
 function close(){
  if(!state.open&&!state.opening)return false;++state.serial;state.open=false;state.opening=false;state.closes++;nativeReport('report-stop');if(element('mp-intelligence'))element('mp-intelligence').hidden=true;if(element('mp-intelligence-scrim'))element('mp-intelligence-scrim').hidden=true;release();signal();try{element('canvas')?.focus({preventScroll:true});}catch{}return true;
 }
 function toggle(){return state.open||state.opening?close():open();}
 function select(id){if(!state.rows.some(row=>row.id===id))return false;state.selectedId=id;if(state.open){render();nativeReport('report-read',id);}return true;}
 const timer=setInterval(()=>{if((state.open||state.opening)&&!active()){close();return;}if(active())readNative();},500);
 addEventListener('pagehide',()=>{clearInterval(timer);close();},{once:true});
 addEventListener('warzone-battle-ended',close);
 addEventListener('keydown',event=>{if((state.open||state.opening)&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);
 window.__warzoneIntelligence={open,close,toggle,select,acceptReports,isOpen:()=>state.open||state.opening,handleBack:()=>close(),report:()=>({...state,history:cloneRows(state.rows),selected:state.rows.find(row=>row.id===state.selectedId)||null}),filterNativeReports:rowsFromNative};
})();
