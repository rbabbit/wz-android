'use strict';
const q=require('./device-086.cjs'),fixture=require('./native-landings-private-fixture-084.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const w='document.getElementById("warzone-game-frame").contentWindow';
async function run(){const stage=process.argv[2],tag=process.argv[3]||'candidate';
 const c=await q.connect();try{
 await c.wait('typeof PcMultiplayerSession!=="undefined"','session scripts');
 if(stage==='join'){
  await fixture.install(c);q.nativeTap('REFRESH');
  await c.wait('PcLobbyUi.snapshot().games.some(g=>g.id==="qa-private-084")&&!PcLobbyUi.snapshot().loading','private directory parser');
  q.nativeTap('Join PRIVATE QA · 1 human + 1 Cobra');
  await c.wait('PcMultiplayerSession.phase==="room"&&PcMultiplayerRoomUI.report().visible','real room',45000);
  const v=await c.snapshot(tag+'-room');assert(v.room.local);console.log(JSON.stringify({room:true,phase:v.session.phase,local:v.room.local}));
 }else if(stage==='background'){
  const mode=process.argv[4]||'home';
  await c.child(`(()=>{if(globalThis.__qa086Raf)return;globalThis.__qa086Raf={count:0};function frame(){__qa086Raf.count++;requestAnimationFrame(frame)}requestAnimationFrame(frame)})()`);
  const sample=()=>c.evaluate(`({pid:${JSON.stringify(q.adb('shell','pidof',q.pkg||'com.rbabbit.warzonetowers.lab').toString().trim())},phase:PcMultiplayerSession.phase,active:PcMultiplayerSession.active,hidden:document.hidden,native:document.getElementById("warzone-game-frame")?.contentWindow?.PcMultiplayerNative?.state,room:document.getElementById("warzone-game-frame")?.contentWindow?.PcMultiplayerNative?.room,raf:document.getElementById("warzone-game-frame")?.contentWindow?.__qa086Raf?.count,driver:document.getElementById("warzone-game-frame")?.contentWindow?.PcBackgroundFrames?.report?.(),events:PcMultiplayerSession.report().events.slice(-10),errors:PcMultiplayerSession.report().errors})`);
  const before=await sample();fs.writeFileSync(path.join(q.out,tag+"-"+mode+"-before.json"),JSON.stringify(before,null,2));
  q.adb('shell','input','keyevent',mode==='recents'?'187':mode==='screen'?'223':'3');await q.delay(10000);
  const background=await sample();fs.writeFileSync(path.join(q.out,tag+'-'+mode+'-netpolicy.txt'),q.adb('shell','dumpsys','netpolicy'));fs.writeFileSync(path.join(q.out,tag+'-'+mode+'-services.txt'),q.adb('shell','dumpsys','activity','services','com.rbabbit.warzonetowers.lab'));q.screen(tag+'-'+mode+'-background');
  if(mode==='screen')q.adb('shell','input','keyevent','224');
  if(mode==='home')q.adb('shell','input','keyevent','187');
  if(mode!=='screen'){await q.delay(500);q.nativeTap('Warzone Towers');}
  if(tag!=="baseline085")await c.wait('PcMultiplayerSession.active&&document.getElementById("warzone-game-frame")?.contentWindow?.PcMultiplayerNative?.room?.local||PcMultiplayerSession.phase==="game"','retained return',15000);
  await c.wait('!PcMultiplayerSession.background','real Activity resume');await q.delay(700);const after=await sample();await c.snapshot(tag+'-'+mode+'-return');
  const record={stage,tag,mode,before,background,after,rafAdvance:background.raf-before.raf};
  fs.writeFileSync(path.join(q.out,tag+'-'+mode+'-lifecycle.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify({phase:after.phase,mode,rafAdvance:record.rafAdvance,nativeBefore:before.native?.gameTime,nativeBackground:background.native?.gameTime,driver:background.driver}));
 }else if(stage==='ready'){
  await c.wait('PcMultiplayerRoomUI.report().visible&&'+w+'.PcMultiplayerNative.room?.permissions?.canReady','ready available');await c.tap('#mp-room-ready');
  await c.wait('PcMultiplayerSession.phase==="game"&&'+w+'.PcMultiplayerNative.state?.worldReady','native match',60000);
  const v=await c.snapshot(tag+'-game');console.log(JSON.stringify({phase:v.session.phase,time:v.native.gameTime,player:v.native.player}));
 }else if(stage==='snapshot'){await c.snapshot(tag);console.log(tag);}
 else throw Error('Unknown stage');
 }finally{c.close();}}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
