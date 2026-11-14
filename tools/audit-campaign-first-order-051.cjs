'use strict';
const fs=require('node:fs'),path=require('node:path'),q=require('./campaign-live-051.cjs');
(async()=>{
 const connect=async()=>{let error;const end=Date.now()+20000;while(Date.now()<end){try{return await q.connect();}catch(value){error=value;await q.delay(150);}}throw error;};
 let c;
 if(!process.env.WZ_AUDIT_RESUME){
  c=await connect();
  if(await c.evaluate('__warzoneCampaign.nativeUiActive()')){await c.tap('#wt-campaign-native-back');await c.wait('__warzoneCampaign.report().nativeState.worldSafe');}
  q.adb('shell','input','keyevent','4');await q.nativeTap('Return');c.close();
  await q.nativeTap('Open the original campaign');await q.nativeTap('NEW CAMPAIGN');
 }
 c=await connect();
 try{
  await c.wait('window.__warzoneCampaign?.report().nativeState?.video||window.__warzoneCampaign?.report().snapshot?.mission==="cam1a"',45000);
  if(await c.evaluate('window.__warzoneCampaign?.report().nativeState?.video')){
   await c.wait('performance.getEntriesByType("resource").some(e=>e.name.includes("/sequences/cam1/c001.ogg")&&e.responseEnd>0)',30000);
   const videoClock=await c.evaluate('__warzoneCampaign.report().nativeState.realTime');
   await c.wait('__warzoneCampaign.report().nativeState.video&&__warzoneCampaign.report().nativeState.realTime>'+Number(videoClock+400));
   q.adb('shell','input','tap','1200','560');
  }
  await c.wait('window.__warzoneCampaign?.report().snapshot?.mission==="cam1a"',45000);
  if(process.env.WZ_AUDIT_AFTER_GUIDE==='1')await c.wait('__warzoneCampaign.report().nativeState.paused&&__warzoneCampaign.report().nativeState.gameTime>=3002',15000);
  if(await c.evaluate('__warzoneCampaign.nativeUiActive()'))await c.tap('#wt-campaign-native-back');
  await c.wait('__warzoneCampaign.report().nativeState.worldSafe');
  if(process.env.WZ_AUDIT_FOCUS==='1')await c.evaluate(`(()=>{const target=document.querySelector('canvas'),originalFocus=target.focus;window.__orderFocusCalls=0;target.focus=function(options){window.__orderFocusCalls++;parent.document.getElementById('warzone-game-frame').focus({preventScroll:true});return originalFocus.call(this,options);};return true;})()`);
  await c.evaluate(`(()=>{
   window.__orderTrace=[];
   const target=document.querySelector('canvas'),original=target.dispatchEvent;
   const snap=(name,event)=>{
    if(__orderTrace.length>=400)return;
    const frame=__warzoneCampaign.report().nativeState;
    let control;try{control=LaunchedModule.FS.readFile('/data/base/script/campaign/mobile/campaign-control.json',{encoding:'utf8'});}catch(error){control=String(error);}
    __orderTrace.push({name,at:performance.now(),pointer:event&&{id:event.pointerId,type:event.pointerType,trusted:event.isTrusted,x:event.clientX,y:event.clientY,button:event.button,buttons:event.buttons,target:event.target?.id,ctrl:event.ctrlKey,defaultPrevented:event.defaultPrevented},touch:__kalaWarzoneTouch.report(),frame,selected:__warzoneCommands.report().snapshot?.selectedUnits,commands:{page:__warzoneCommands.report().page,nativeMenu:__warzoneCommands.report().nativeMenu,buildOpen:__warzoneCommands.report().buildOpen},control,active:document.activeElement?.id,parentActive:parent.document.activeElement?.id});
   };
   target.dispatchEvent=function(event){
    if(/^(pointer|mouse)/.test(event.type))snap('dispatch-before-'+event.type,event);
    const result=original.call(this,event);
    if(/^(pointer|mouse)/.test(event.type))snap('dispatch-after-'+event.type,event);
    return result;
   };
   for(const type of ['pointerdown','pointerup','pointermove','pointercancel','mousedown','mouseup','mousemove','focus','blur'])addEventListener(type,e=>{if(!/move$/.test(type)||e.buttons)snap('capture-'+type,e)},true);
   window.__orderSnap=snap;return true;
  })()`);
  await c.tap('#wt-campaign-all-combat');await c.wait('__warzoneCampaign.report().selectedCount===4&&__warzoneCommands.report().snapshot.selectedUnits.length===4');
  await c.evaluate('WarzoneTerrain.refresh()');
  const p=await c.evaluate(`(()=>{const p=WarzoneTerrain.project(16*128+64,50*128+64,0),f=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();__orderSnap('before-first');return window.__orderTracePoint={...p,pick:WarzoneTerrain.pick(p.x,p.y),frame:f.toJSON(),w:parent.innerWidth,h:parent.innerHeight,view:WarzoneTerrain.view(),buffer:{w:LaunchedModule.ctx.drawingBufferWidth,h:LaunchedModule.ctx.drawingBufferHeight}}})()`);
  await c.evaluate(`window.__orderTraceTimer=setInterval(()=>__orderSnap('sample'),50);true`);
  const initial=process.env.WZ_AUDIT_OBSERVED==='1'?await c.evaluate(`__warzoneCommands.send('state').then(reply=>({at:performance.now(),gameTime:reply.result?.gameTime,selected:reply.result?.selectedUnits,ok:reply.ok}))`):null;
  const tapAt=await c.evaluate('performance.now()');
  q.adb('shell','input','tap',String(Math.round(p.x*2400/p.w)),String(Math.round((p.y+p.frame.y)*1080/p.h)));
  const observed=[];let movement=null;
  if(process.env.WZ_AUDIT_OBSERVED==='1'){
   const deadline=Date.now()+15000;
   while(Date.now()<deadline){
    await q.delay(300);
    const sample=await c.evaluate(`(()=>{const sentAt=performance.now();return __warzoneCommands.send('state').then(reply=>({sentAt,at:performance.now(),gameTime:reply.result?.gameTime,selected:reply.result?.selectedUnits,ok:reply.ok,frame:__warzoneCampaign.report().nativeState}));})()`,{timeoutMs:5000});
    observed.push(sample);
    if(sample.ok&&sample.selected?.some(unit=>{const before=initial.selected?.find(value=>value.id===unit.id);return before&&(unit.x!==before.x||unit.y!==before.y||unit.order===2);})){movement={elapsedMs:sample.at-tapAt,sample};break;}
   }
  }else for(let i=0;i<12;i++){await q.delay(100);await c.evaluate(`__orderSnap('after-${i}');true`);}
  await c.evaluate('clearInterval(__orderTraceTimer);true');
  const trace=await c.evaluate('({point:__orderTracePoint,trace:__orderTrace,units:__warzoneCommands.report().snapshot.selectedUnits,focusCalls:window.__orderFocusCalls||0})');trace.point=p;
  Object.assign(trace,{initial,tapAt,observed,movement});
  fs.writeFileSync(path.join(q.out,process.env.WZ_AUDIT_OBSERVED==='1'?'first-order-observed.json':process.env.WZ_AUDIT_FOCUS==='1'?'first-order-focus.json':process.env.WZ_AUDIT_AFTER_GUIDE==='1'?'first-order-postguide.json':'first-order-audit.json'),JSON.stringify(trace,null,2));
  if(process.env.WZ_AUDIT_OBSERVED==='1'){console.log(JSON.stringify({point:p,initial,tapAt,observed,movement}));return;}
  console.log(JSON.stringify({point:p,events:trace.trace.filter(t=>t.name!=='sample').map(t=>({name:t.name,at:t.at,pointer:t.pointer,pending:t.touch.pendingClicks,physical:t.touch.gestureActive,frame:t.frame.gameTime,nativeMode:t.frame.nativeMode,paused:t.frame.paused,worldSafe:t.frame.worldSafe,selected:t.selected,active:t.active,parentActive:t.parentActive})),units:trace.units}));
 }finally{c.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
