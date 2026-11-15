/* Real installed APK/private room observations. Never joins/sends chat to public rooms. */
'use strict';
const q=require('./mp-live-079.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const stage=process.argv[2],arg=process.argv[3]||'';
const child='document.querySelector("#warzone-game-frame").contentWindow';
const room=child+'.PcMultiplayerNative.room';
async function capture(c,name,extra={}){
 const state=await c.evaluate(`({url:location.href,viewport:[innerWidth,innerHeight],visualHeight:visualViewport?.height,dpr:devicePixelRatio,phase:PcMultiplayerSession.phase,active:PcMultiplayerSession.active,ui:PcMultiplayerRoomUI.report(),room:${room},native:${child}.PcMultiplayerNative.state,controls:${child}.PcMultiplayerControls?.report?.(),focused:document.activeElement?.id})`);
 state.observation={stage,...extra};fs.writeFileSync(path.join(q.out,name+'.json'),JSON.stringify(state,null,2));q.screen(name);console.log(JSON.stringify({name,phase:state.phase,ui:state.ui,local:state.room?.local,permissions:state.room?.permissions,...extra}));return state;
}
(async()=>{const c=await q.connect(stage==='offline'?'/warzone/mobile.html':undefined);try{
 if(stage==='offline'){
  await c.wait(child+'.__warzoneCommands?.report?.().snapshot?.trucks?.length>0','existing Towers world ready',30000);
  await c.tap('#blocknight-tech');await c.wait(child+'.__blockNightResearch.report().open','existing Towers Research');q.screen('delivery-existing-towers-research');await c.tap('#blocknight-tech');
  const proof=await c.child('({commands:__warzoneCommands.report(),research:__blockNightResearch.report()})');fs.writeFileSync(path.join(q.out,'delivery-existing-mode-proof.json'),JSON.stringify({passed:true,scope:'FFA/Campaign setup navigation and existing Towers Research/world; unchanged offline gameplay not comprehensively rerun.',...proof},null,2));
  q.screen('delivery-existing-towers-world');console.log('PASS existing Towers Research/world');
 } else if(stage==='room'){
  await c.wait(`PcMultiplayerRoomUI.report().visible&&${room}?.permissions?.canReady===true`,'real room/Ready available');
  const geometry=await c.evaluate(`(()=>{const ids=['mp-room','mp-room-players','mp-room-chat-log','mp-room-chat-input','mp-room-ready'];return ids.map(id=>{const e=document.getElementById(id),b=e.getBoundingClientRect();return{id,rect:b.toJSON(),hidden:e.hidden,disabled:e.disabled,display:getComputedStyle(e).display};});})()`);
  for(const row of geometry){assert(row.rect.width>0&&row.rect.height>0);assert(row.rect.top>=-1&&row.rect.bottom<=577);}
  await capture(c,'delivery-room-layout',{geometry});
 } else if(stage==='chat'){
  assert.equal(await c.evaluate('PcMultiplayerSession.phase'),'room');
  const input='#mp-room-chat-input';await c.tap(input);await c.wait('document.activeElement.id==="mp-room-chat-input"','actual chat focus');await c.call('Input.insertText',{text:arg});
  await c.wait(`document.getElementById('mp-room-chat-input').value===${JSON.stringify(arg)}`,'native keyboard text insertion');
  await c.wait('visualViewport.height<innerHeight-80','actual keyboard visible');
  await capture(c,'delivery-keyboard-open');
  await c.tap('#mp-room-chat-send');
  await c.wait(`${room}.messages.some(m=>m.text===${JSON.stringify(arg)})`,'real native chat echo');
  await capture(c,'delivery-chat-sent',{text:arg});
 } else if(stage==='host-chat'){
  await c.wait(`${room}.messages.some(m=>m.text===${JSON.stringify(arg)})`,'actual private host chat');
  await capture(c,'delivery-chat-round-trip',{text:arg});
 } else if(stage==='ready'){
  const before=await c.evaluate(`${room}.local.ready`);await c.tap('#mp-room-ready');
  await c.wait(`(${room}?.local.ready===${!before}&&!PcMultiplayerRoomUI.report().pending)||PcMultiplayerSession.phase==='game'`,'host-confirmed Ready state or host-started match',60000);
  await capture(c,arg||'delivery-ready',{readyBefore:before,readyAfter:!before});
 } else if(stage==='team'){
  await c.tap('#mp-room-team');q.screen('delivery-team-chooser');console.log('Team selector opened; select through Android UI.');
 } else if(stage==='team-confirm'){
  await c.wait(`${room}.players.find(p=>p.local).team===${Number(arg)}&&!PcMultiplayerRoomUI.report().pending`,'actual native team change');
  await capture(c,'delivery-team-confirmed',{team:Number(arg)});
 } else if(stage==='spectate'){
  const before=await c.evaluate(`${room}.local.spectator`);await c.tap('#mp-room-spectate');
  await c.wait(`${room}.local.spectator===${!before}&&!PcMultiplayerRoomUI.report().pending`,'host-confirmed spectator slot change');
  await capture(c,before?'delivery-play-restored':'delivery-spectating',{spectatorBefore:before,spectatorAfter:!before});
 } else if(stage==='options'){
  await c.tap('#mp-room-options-toggle');await c.wait('!document.getElementById("mp-room-options").hidden','options visible');await capture(c,'delivery-match-options');
 } else if(stage==='capture')await capture(c,arg);
 else if(stage==='world'){
  await c.wait('PcMultiplayerSession.phase==="game"&&'+child+'.PcMultiplayerNative.state?.worldReady&&'+child+'.PcMultiplayerNative.state?.worldSafe','safe native game world',60000);
  await capture(c,'delivery-world');
 } else if(stage==='gameplay'||stage==='movement'){
  const proof={},wait=(expr,label,time=8000)=>c.wait(child+'.eval('+JSON.stringify(expr)+')',label,time);
  for(const [id,expr] of (stage==='movement'?[]:[['#blocknight-tech','__blockNightResearch.report().open'],['#wt-open-factory','__warzoneCommands.report().page==="factory"'],['#wt-open-queue','__warzoneCommands.report().page==="queue"']])){
   await c.tap(id);await wait(expr,'custom page opens');await c.save('delivery-game-'+id.slice(1));await c.tap(id);await wait('!('+expr+')','custom page closes');
  }
  await c.tap('#wt-field-toggle');await c.tap('[data-command="trucks"]');
  await wait('PcMultiplayerNative.state.combatLock.selectedIds.length>0','actual native truck selection');await c.tap('#wt-field-toggle');
  await c.child('__warzoneCommands.send("state",{}, {fresh:true})');
  proof.selected=await c.child('__warzoneCommands.report().snapshot.trucks');assert(proof.selected.length>0);
  const f=await c.evaluate('document.querySelector("#warzone-game-frame").getBoundingClientRect().toJSON()');
  proof.moveTarget=await c.child('WarzoneTerrain.pick(550,300)');assert(proof.moveTarget);
  await c.touch(f.left+550,f.top+300);
  await wait(`__warzoneCommands.report().snapshot.trucks.some(t=>${JSON.stringify(proof.selected)}.some(b=>b.id===t.id&&(Math.abs(b.x-t.x)>.2||Math.abs(b.y-t.y)>.2)))`,'actual native truck position change');
  proof.moved=await c.child('__warzoneCommands.report().snapshot.trucks');
  await c.tap('#wt-field-toggle');await c.tap('[data-command="stop"]');await wait('__warzoneCommands.report().snapshot.trucks.filter(t=>t.selected).every(t=>t.order===0)','actual native stop');
  await c.tap('[data-command="deselect"]');await wait('__warzoneCommands.report().snapshot.trucks.every(t=>!t.selected)','native deselect');await c.tap('#wt-field-toggle');
  proof.beforeCamera=await c.child('PcMultiplayerNative.state.view.camera');
  const pair=dx=>[0,1].map(n=>({id:7+n,x:f.left+540+n*100+dx,y:f.top+250,force:.6}));
  await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pair(0)});
  for(let i=1;i<=8;i++){await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pair(i*9)});await q.delay(25);}
  await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(`Math.abs(PcMultiplayerNative.state.view.camera.x-${proof.beforeCamera.x})>20||Math.abs(PcMultiplayerNative.state.view.camera.y-${proof.beforeCamera.y})>20`,'native camera pan');
  proof.afterCamera=await c.child('PcMultiplayerNative.state.view.camera');proof.input=await c.child('__kalaWarzoneTouch.report()');assert(!proof.input.gestureActive);assert.equal(proof.input.pointers,0);
  await capture(c,'delivery-gameplay-input',{proof});
 } else throw Error('Unknown stage');
}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
