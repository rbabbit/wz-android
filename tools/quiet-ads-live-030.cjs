'use strict';
// Focused, real-emulator observations. SDK reward callbacks are never seeded.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA=path.resolve(__dirname,'../qa/0.30-ads');
// Scale inspected WebView coordinates to the actual ADB screenshot viewport.
process.env.WZ_QA_UI_INPUT='adb-scaled';
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const expected='d76b6e37d9839c45dd9659994ee1cb998c8f0c5cbac29e93c77301f20214f28d';
const write=(n,v)=>fs.writeFileSync(path.join(l.out,n+'.json'),JSON.stringify(v,null,2)+'\n');
const read=n=>JSON.parse(fs.readFileSync(path.join(l.out,n+'.json')));
function wallet(){const xml=l.adb('exec-out','run-as',l.packageId,'cat','shared_prefs/towers_rewards.xml').toString(),s=xml.match(/<string name="ledger_v1">([\s\S]*?)<\/string>/)[1];return JSON.parse(s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'));}
function screen(n){l.screen(n);const t=l.tree();fs.writeFileSync(path.join(l.out,n+'.xml'),t.xml);return t.nodes.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc'],enabled:n.enabled,bounds:n.bounds}));}
function identity(){const v=j.installedIdentity();assert.equal(v.candidateAPK_SHA256,expected);return v;}
async function earned(which){const before=read(which+'-before').wallet.balance,end=Date.now()+55000;while(Date.now()<end){const w=wallet();if(w.balance===before+10){write(which+'-earned',{wallet:w,screen:screen(which+'-earned')});console.log({before,after:w.balance,pending:w.pendingAdReward});return;}await l.delay(250);}throw Error('No Google earned grant received');}
async function game(){if(l.tree().nodes.some(n=>n['content-desc']==='Warzone Towers version 0.30')){if(l.tree().nodes.some(n=>n['content-desc']==='Close rewards'))await l.nativeTap('Close rewards',5000);await l.nativeTap('PLAY',5000);}const end=Date.now()+40000;let c;while(Date.now()<end){try{c=await l.connect();break;}catch(e){if(!/not ready/.test(String(e)))throw e;await l.delay(150);}}assert(c);try{await c.wait('window.WarzoneRewards?.ready&&Boolean(window.WarzoneRewardedAds)',35000);const before=wallet();await c.tap('#blocknight-rewards');assert(l.tree().nodes.some(n=>n['content-desc']==='Close rewards'));write('game-before',{identity:identity(),wallet:before,session:await c.evaluate('__towersHtml.session'),screen:screen('game-rewards')});await l.nativeTap('Watch an optional ad to earn 10 crystals',3000);await c.wait('WarzoneRewardedAds.report().owned',30000);const first=await c.evaluate('WarzoneRewardedAds.report()');await l.delay(1600);const held=await c.evaluate('WarzoneRewardedAds.report()');assert.equal(held.clock,first.clock);write('game-held',{first,held,music:await c.evaluate('WarzoneMusic.report()'),screen:screen('game-sample-ad')});console.log({clockHeld:held.clock});}finally{c.close();}}
async function restored(){const c=await l.connect();try{await c.wait('!WarzoneRewardedAds.report().held',12000);const before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+before,8000);const state=await c.evaluate('({session:__towersHtml.session,hold:WarzoneRewardedAds.report(),music:WarzoneMusic.report()})');assert.equal(state.session,read('game-before').session);assert.equal(wallet().balance,read('game-before').wallet.balance+10);write('game-restored',{wallet:wallet(),state,screen:screen('game-restored')});}finally{c.close();}}
async function restart(){const before=wallet();l.adb('shell','am','force-stop',l.packageId);l.adb('shell','am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');await l.nativeTap('REWARDS '+before.balance,10000);assert.equal(wallet().balance,before.balance);write('restarted',{identity:identity(),before:before.balance,wallet:wallet(),screen:screen('restarted')});console.log({restartedBalance:before.balance});}
async function post(){
 await l.nativeTap('Close rewards',5000);
 const c=await l.connect();
 try{
  const initial=await c.evaluate('({session:__towersHtml.session,hold:WarzoneRewardedAds.report(),music:WarzoneMusic.report()})');
  await c.tap('#blocknight-save');
  await c.wait('!WarzoneSavedGames.report().busy&&Boolean(WarzoneSavedGames.report().savedId)',20000);
  const saved=await c.evaluate('WarzoneSavedGames.report()');assert.equal(saved.error,'');
  await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen',10000);
  const build=await c.evaluate('__warzoneCommands.report()');screen('post-ad-build');
  await c.tap('#wt-build-sidebar [data-action="select-mode"]');await c.wait('!__warzoneCommands.report().buildOpen');
  await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open',10000);screen('post-ad-tech');
  await c.tap('#blocknight-research-shell .bn-tech-done');await c.wait('!__blockNightResearch.report().open');
  write('post-ad-input-save',{identity:identity(),wallet:wallet(),initial,saved,build:{open:build.buildOpen,trucks:build.snapshot?.trucks},screen:screen('post-ad-input-save')});
 }finally{c.close();}
 l.adb('shell','input','keyevent','4');await l.nativeTap('Return',5000);screen('return-home');
 await restart();
}
(async()=>{const phase=process.argv[2];if(phase==='record'){write(process.argv[3],{identity:identity(),wallet:wallet(),screen:screen(process.argv[3])});}else if(phase==='earned')await earned(process.argv[3]);else if(phase==='game')await game();else if(phase==='restored')await restored();else if(phase==='restart')await restart();else if(phase==='post')await post();else if(phase==='screen')console.log(screen(process.argv[3]||'observed'));else if(phase==='close')await l.nativeTap('Close',15000);else throw Error('Unknown phase');})().catch(e=>{console.error(e);process.exitCode=1;});
