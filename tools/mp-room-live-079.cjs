/* Real emulator/private-host observations. No public-room chat or seeded game orders. */
'use strict';
const q=require('./mp-live-079.cjs'),fs=require('node:fs'),path=require('node:path');
const stage=process.argv[2]||'inspect',arg=process.argv[3]||'';
(async()=>{const c=await q.connect();try{
 if(stage==='join'){
  if(await c.evaluate('PcMultiplayerSession.active'))throw Error('Leave the existing session before joining a fixture');
  await c.evaluate(`document.querySelector('details.lobby-direct').open=true;document.querySelector('#address').value='10.0.2.2:22179';true`);
  await c.tap('#direct-join');await c.wait(`!document.querySelector('#loading-cover').hidden`,'native loading cover');
  fs.writeFileSync(path.join(q.out,'delivery-joining-cover.json'),JSON.stringify(await c.evaluate(`({phase:PcMultiplayerSession.phase,loading:!document.getElementById('loading-cover').hidden,room:PcMultiplayerRoomUI.report()})`),null,2));q.screen('delivery-joining-cover');
  await c.wait(`PcMultiplayerSession.phase==='room'`,'private native waiting room',30000);
 }
 if(stage==='leave'){await c.evaluate(`PcMultiplayerSession.requestReturn('Private room check complete.');true`);await c.wait(`!PcMultiplayerSession.active`,'return to multiplayer lobby');}
 if(stage==='tap')await c.tap(arg);
 if(stage==='chat'){
  const input='#mp-room-chat-input';await c.tap(input);
  await c.call('Input.insertText',{text:arg});await c.tap('#mp-room-chat-send');
 }
 if(stage==='ready')await c.tap('#mp-room-ready');
 const name=(stage==='join'?arg:stage==='inspect'?arg:'')||'live-'+stage;
 const value=await c.evaluate(`({url:location.href,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,session:PcMultiplayerSession.report(),room:window.PcMultiplayerRoomUI?.report?.(),nativeRoom:document.querySelector('#warzone-game-frame')?.contentWindow?.PcMultiplayerNative?.room,native:document.querySelector('#warzone-game-frame')?.contentWindow?.PcMultiplayerNative?.state,active:document.activeElement?.id})`);
 fs.writeFileSync(path.join(q.out,name+'.json'),JSON.stringify(value,null,2));q.screen(name);
 console.log(JSON.stringify({name,viewport:value.viewport,phase:value.session?.phase,room:value.room,nativeRoom:value.nativeRoom}));
}finally{c.close()}})().catch(error=>{console.error(error);process.exitCode=1});
