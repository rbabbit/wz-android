/* Real private-room spectator observations; no public chat or seeded game orders. */
'use strict';
const q=require('./mp-live-082.cjs'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../qa/multiplayer-spectator-082');fs.mkdirSync(out,{recursive:true});
const stage=process.argv[2]||'inspect',name=process.argv[3]||stage;
async function capture(c,label){
 const v=await c.evaluate(`(()=>{const w=document.getElementById('warzone-game-frame')?.contentWindow;return{url:location.href,viewport:[innerWidth,innerHeight],session:PcMultiplayerSession.report(),room:w?.PcMultiplayerNative?.room,native:w?.PcMultiplayerNative?.state,controls:w?.PcMultiplayerControls?.report?.(),adapter:w?.PcMultiplayerNativeUI?.report?.(),commands:w?.__warzoneCommands?.report?.(),cover:{hidden:document.getElementById('loading-cover').hidden,title:document.getElementById('loading-title').textContent,detail:document.getElementById('loading-detail').textContent}}})()`);
 fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(v,null,2));fs.writeFileSync(path.join(out,label+'.png'),q.adb('exec-out','screencap','-p'));
 console.log(JSON.stringify({label,phase:v.session.phase,loading:v.session.loading,native:v.native,room:v.room?.local,errors:v.session.errors?.slice(-4)}));return v;
}
(async()=>{const c=await q.connect();try{
 if(stage==='join'){
  await c.evaluate(`document.querySelector('details.lobby-direct').open=true;document.getElementById('address').value=${JSON.stringify(process.argv[4]||'10.0.2.2:22180')}`);await c.tap('#direct-join');
  await c.wait('PcMultiplayerSession.phase==="room"','real private room',45000);await capture(c,name);
 }else if(stage==='chat'){
  const message=process.argv[4];if(!message)throw Error('Private fixture message required');
  await c.evaluate(`(()=>{const i=document.getElementById('mp-room-chat-input');i.value=${JSON.stringify(message)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await c.tap('#mp-room-chat-send');await q.delay(1200);await capture(c,name);
 }else if(stage==='spectate'){
  await c.tap('#mp-room-spectate');
  await c.wait('document.getElementById("warzone-game-frame")?.contentWindow.PcMultiplayerNative.room?.local.spectator===true||PcMultiplayerSession.phase==="game"','host confirmed spectator slot',20000);await capture(c,name);
 }else if(stage==='observe'){
  const until=Date.now()+20000;while(Date.now()<until){await q.delay(1000);const done=await c.evaluate('PcMultiplayerSession.phase==="game"');if(done)break;}
  await capture(c,name);
 }else if(stage==='inspect')await capture(c,name);else throw Error('Unknown stage');
}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
