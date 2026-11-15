'use strict';
const u=require('./native-landings-live-084.cjs'),q=require('./mp-live-082.cjs'),fixture=require('./native-landings-private-fixture-084.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const stage=process.argv[2]||'join',w='document.getElementById("warzone-game-frame").contentWindow';
async function shot(c,name){const state=await c.evaluate(`({session:PcMultiplayerSession.report(),room:document.getElementById('warzone-game-frame')?.contentWindow?.PcMultiplayerNative?.room,native:document.getElementById('warzone-game-frame')?.contentWindow?.PcMultiplayerNative?.state,ui:PcMultiplayerRoomUI.report(),fixture:globalThis.__nativeLandingsPrivateFixture084?.inspect?.()})`);fs.writeFileSync(u.out+'/'+name+'.json',JSON.stringify(state,null,2));u.save(name+'-screen');return state;}
async function run(){
 const c=await q.connect();try{
  if(stage==='join'){
   const installed=await fixture.install(c);fs.writeFileSync(u.out+'/private-directory-install.json',JSON.stringify(installed,null,2));
   u.tap(u.observe(),'REFRESH');await c.wait('PcLobbyUi.snapshot().games.some(g=>g.id==="qa-private-084")&&!PcLobbyUi.snapshot().loading','private directory passed real parser');
   const list=await u.wait('final-private-native-list',s=>!!u.find(s,'Join PRIVATE QA · 1 human + 1 Cobra'));
   u.tap(list,'Join PRIVATE QA · 1 human + 1 Cobra');
   await c.wait('PcMultiplayerSession.phase==="room"&&PcMultiplayerRoomUI.report().visible','actual headless private room',45000);
   const state=await shot(c,'final-private-room');assert(state.room.local);assert(state.fixture.requests.some(r=>r.kind==='id-resolution'&&r.delivered));
   console.log('Native Join reached the real unlisted official host');
  }else if(stage==='ready'){
   await c.wait('PcMultiplayerRoomUI.report().visible&&'+w+'.PcMultiplayerNative.room?.permissions?.canReady===true','actual Ready available');
   await c.tap('#mp-room-ready');
   await c.wait('PcMultiplayerSession.phase==="game"&&'+w+'.PcMultiplayerNative.state?.worldReady&&'+w+'.PcMultiplayerNative.state?.worldSafe','actual bot world after real Ready',60000);
   const before=await shot(c,'final-private-game');
   const frames=before.native.view.frame;
   await c.wait(w+'.PcMultiplayerNative.state.view.frame>'+Number(frames)+'&&'+w+'.PcMultiplayerNative.state.gameTime>'+Number(before.native.gameTime),'native frame counter and game time advance',10000);
   await shot(c,'final-private-game-live');console.log('Real Ready started a live official bot match');
  }else if(stage==='return'){
   u.adb('shell','input','keyevent','4');const dialog=await u.wait('final-private-return-dialog',s=>!!u.find(s,'Return'));
   u.tap(dialog,'Return');await u.wait('final-private-native-return',s=>s.rows.some(n=>n.class==='android.widget.CheckBox')&&s.rows.some(n=>n.text==='JOIN'),30000);
   console.log('Return restored the native public list');
  }else if(stage==='profile-restore'){
   const old=JSON.parse(fs.readFileSync(u.out+'/profile-original.json')).base;
   let state=await u.wait('final-profile-before-restore',s=>!!u.find(s,'Player name, up to twelve characters, fixed mobile suffix'));
   u.tap(state,'Player name, up to twelve characters, fixed mobile suffix');u.adb('shell','input','keycombination','113','29');u.adb('shell','input','text',old);
   await u.wait('final-profile-restored-input',s=>s.rows.some(n=>n.class==='android.widget.EditText'&&n.text===old));
   u.adb('shell','input','keyevent','4');u.adb('shell','input','keyevent','4');await u.homeState('final-profile-restored-home');u.tap(u.observe(),'Multiplayer');
   await u.wait('final-profile-restored',s=>s.rows.some(n=>n.class==='android.widget.EditText'&&n.text===old));console.log('Original profile restored and persisted');
  }else throw Error('Unknown MP stage');
 }finally{c.close();}
}
run().catch(e=>{u.save('failure-mp-'+stage);console.error(e);process.exitCode=1;});
