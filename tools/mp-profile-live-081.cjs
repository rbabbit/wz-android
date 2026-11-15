/* Focused real-APK observations. Private host only; no public chat or game orders. */
'use strict';
const q=require('./mp-live-080.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../qa/multiplayer-profile-081');fs.mkdirSync(out,{recursive:true});
const stage=process.argv[2],name=process.argv[3]||stage;
const w='document.getElementById("warzone-game-frame")?.contentWindow';
async function capture(c,suffix,extra={}){
 await c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const data=await c.evaluate(`(()=>{const box=id=>document.getElementById(id)?.getBoundingClientRect().toJSON();return{phase:PcMultiplayerSession.phase,viewport:[innerWidth,innerHeight,visualViewport.height],field:document.getElementById('player-name').value,suffix:document.getElementById('player-name-suffix')?.textContent,savedName:AndroidMultiplayer.getPlayerName(),baseName:AndroidMultiplayer.getPlayerBaseName?.(),sessionName:PcMultiplayerSession.playerName(),focused:document.activeElement.id,room:${w}?.PcMultiplayerNative?.room,native:${w}?.PcMultiplayerNative?.state,geometry:{music:box('blocknight-music'),lobby:box('leave'),status:box('mp-header-status'),timer:box('mp-native-timer')},errors:PcMultiplayerSession.report().errors}})()`);
 fs.writeFileSync(path.join(out,suffix+'.json'),JSON.stringify({...data,observations:extra},null,2));
 fs.writeFileSync(path.join(out,suffix+'.png'),q.adb('exec-out','screencap','-p'));
 console.log(JSON.stringify({name:suffix,phase:data.phase,field:data.field,suffix:data.suffix,savedName:data.savedName,...extra}));return data;
}
(async()=>{const c=await q.connect();try{
 if(stage==='name'){
  await c.tap('#player-name');await c.wait('document.activeElement.id==="player-name"','real name focus');
  await c.evaluate('document.getElementById("player-name").select()');
  await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
  await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
  await c.wait('document.getElementById("player-name").value===""','base deleted');
  assert.equal(await c.evaluate('document.getElementById("player-name-suffix").textContent'),'(m)');
  await capture(c,'name-empty-fixed-suffix');
  await c.call('Input.insertText',{text:'NoobCrusher1EXTRA'});
  await c.wait('document.getElementById("player-name").value==="NoobCrusher1"','pasted base clamps at12');
  await capture(c,'name-twelve-with-keyboard');
  await c.tap('#lobby');await c.wait('AndroidMultiplayer.getPlayerName()==="NoobCrusher1(m)"','actual preferences committed');
  const v=await capture(c,'name-saved');assert.equal(v.field,'NoobCrusher1');assert.equal(v.sessionName,'NoobCrusher1(m)');
 }else if(stage==='keyboard'){
  await c.wait('document.activeElement.id==="player-name"','actual Android keyboard field focus');
  q.adb('shell','input','keycombination','113','29');q.adb('shell','input','keyevent','67');
  await c.wait('document.getElementById("player-name").value===""','Android Ctrl-A and Delete clear only base');
  assert.equal(await c.evaluate('document.getElementById("player-name-suffix").textContent'),'(m)');
  await capture(c,'name-android-keyboard-empty');
  q.adb('shell','input','text','NoobCrusher1EXTRA');
  await c.wait('document.getElementById("player-name").value==="NoobCrusher1"','Android input capped at12');
  await capture(c,'name-android-keyboard-twelve');q.adb('shell','input','keyevent','66');
  await c.wait('AndroidMultiplayer.getPlayerName()==="NoobCrusher1(m)"','Android editor saved canonical name');
 }else if(stage==='cold'){
  await c.wait('document.getElementById("player-name").value==="NoobCrusher1"','saved base after cold start');
  assert.equal(await c.evaluate('AndroidMultiplayer.getPlayerName()'),'NoobCrusher1(m)');await capture(c,'name-cold-restored');
 }else if(stage==='join'){
  assert.equal(await c.evaluate('PcMultiplayerSession.active'),false);
  await c.evaluate("document.querySelector('details.lobby-direct').open=true;document.getElementById('address').value='10.0.2.2:22180'");
  await c.tap('#direct-join');await c.wait('PcMultiplayerSession.phase==="room"','actual private room',45000);
  const v=await capture(c,'delivery-private-room');assert.equal(v.room.players.find(p=>p.local).name,'NoobCrusher1(m)');assert.equal(v.sessionName,'NoobCrusher1(m)');
 }else if(stage==='game'||stage==='header'){
  if(stage==='game')await c.tap('#mp-room-ready');
  await c.wait('PcMultiplayerSession.phase==="game"&&'+w+'.PcMultiplayerNative?.state?.worldSafe&&'+w+'.PcMultiplayerNative.state.rendered&&'+w+'.PcMultiplayerNative.state.gameTime>2000','real rendered private bot match',60000);
  const v=await capture(c,'delivery-game-header');assert.equal(v.native.playerName,'NoobCrusher1(m)');
  assert(Math.abs(v.geometry.music.top-v.geometry.lobby.top)<2);assert(v.geometry.lobby.left>=v.geometry.music.right-1);assert(v.geometry.lobby.left-v.geometry.music.right<12);
  // Presentation-only fixture: this stock private match has no native timer.
  // Native engine state/orders stay unchanged; real countdown transport is frozen.
  await c.evaluate("(()=>{const s=document.createElement('style');s.id='profile-timer-presentation-fixture';s.textContent='#mp-header-status{display:flex!important}#mp-native-timer{display:block!important;font-size:0!important}#mp-native-timer::after{content:\"00:02:17\";font:12px/16px Oswald,sans-serif}';document.head.append(s)})()");
  try{
   await c.wait('document.getElementById("mp-header-status").getBoundingClientRect().width>0','presentation-only timer label');
   const shown=await capture(c,'delivery-game-timer-layout',{displayFixture:'00:02:17 label only; private native match supplies no countdown; native state/orders unchanged'});
   assert(shown.geometry.status.left>=shown.geometry.lobby.right+4);assert(shown.geometry.status.right<=shown.viewport[0]);
  }finally{await c.evaluate("document.getElementById('profile-timer-presentation-fixture')?.remove()");}
 }else if(stage==='inspect')await capture(c,name);
 else throw Error('Unknown stage');
}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
