'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA ||= path.resolve(__dirname,'../qa/0.27-saves');
const l=require('./native-live.cjs');
const write=(name,value)=>fs.writeFileSync(path.join(l.out,name+'.json'),JSON.stringify(value,null,2));
const point=async(x,y)=>{l.adb('shell','input','tap',String(x),String(y));await l.delay(450);};
(async()=>{
 const c=await l.connect();try{
 const action=process.argv[2];
 if(action==='buy'){
  await c.wait('WarzoneRewards.ready');
  const before=await c.evaluate('JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session))');
  await c.tap('#blocknight-rewards');await l.delay(450);await point(974,118);await point(917,260);
  l.screen('09-gauss-before');await point(943,514);
  const after=await c.wait(`JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)).balance===${before.balance-25}&&__warzoneCommands.report().snapshot.rewards.remaining.gauss_hardpoint===1`,10000);
  const native=await c.evaluate('__warzoneCommands.send("reward-inventory")');assert(native.ok);
  write('live-purchase',{before,after,proof:native});l.screen('10-gauss-bought');
  await point(1022,44);
 } else if(action==='ripple'){
  await c.wait('WarzoneRewards.ready');
  const before=await c.evaluate('JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session))');
  await c.tap('#blocknight-rewards');await l.delay(450);await point(974,118);await point(917,332);
  l.adb('shell','input','swipe','766','395','766','210','350');await l.delay(450);await point(744,270);
  l.screen('final-03-ripple-before');await point(943,514);
  await c.wait(`JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)).balance===${before.balance-10}&&__warzoneCommands.report().snapshot.rewards.remaining.ripple===1`,10000);
  const proof=await c.evaluate('__warzoneCommands.send("reward-inventory")'),native=await c.evaluate('__warzoneCommands.send("state")');
  assert(proof.ok);assert(native.result.nativeBuildOptions.includes('Emplacement-Rocket06-IDF'));
  write('final-live-purchase',{before,proof,native});l.screen('final-04-ripple-bought');await point(1022,44);
 } else if(action==='ripple-current'){
  const before=await c.evaluate('JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session))');
  l.adb('shell','input','swipe','766','395','766','210','350');await l.delay(500);l.screen('final-03b-artillery-scrolled');
  await point(742,270);l.screen('final-03c-ripple-selected');await point(944,514);
  await c.wait(`JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)).balance===${before.balance-10}&&__warzoneCommands.report().snapshot.rewards.remaining.ripple===1`,10000);
  const proof=await c.evaluate('__warzoneCommands.send("reward-inventory")'),native=await c.evaluate('__warzoneCommands.send("state")');
  assert(proof.ok);assert(native.result.nativeBuildOptions.includes('Emplacement-Rocket06-IDF'));
  write('final-live-purchase',{before,proof,native});l.screen('final-04-ripple-bought');await point(1022,44);
 } else if(action==='save'){
  const before=await c.evaluate('({session:__towersHtml.session,wave:__warzoneTowersWaves.report().snapshot,commands:__warzoneCommands.report().snapshot})');
  await c.tap('#blocknight-save');
  await c.wait('!WarzoneSavedGames.busy',20000);
  const save=await c.evaluate('WarzoneSavedGames.report()');write('save-result',{before,save});
  assert(save.savedId,save.error||'Save did not create slot');l.screen('11-game-saved');
 } else if(action==='state'){
  const data=await c.evaluate('({session:__towersHtml.session,rewards:WarzoneRewards.report(),save:WarzoneSavedGames.report(),wave:__warzoneTowersWaves.report().snapshot,commands:__warzoneCommands.report().snapshot})');
  write(process.argv[3]||'live-state',data);console.log(JSON.stringify({session:data.session,save:data.save,wave:data.wave}));
 } else if(action==='wave'){
  const before=await c.evaluate('({wave:__warzoneTowersWaves.report().snapshot,balance:JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)).balance})');
  await c.tap('#warzone-towers-next-wave');
  const result=await c.wait(`(()=>{const w=__warzoneTowersWaves.report().snapshot,n=parent.document.getElementById('wt-wave-crystals');return w.completedWaves.length>${before.wave.completedWaves.length}&&n&&!n.hidden?{wave:w,note:n.textContent,css:n.style.cssText,header:n.parentNode.id,balance:JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)).balance}:null})()`,180000);
  assert.equal(result.balance-before.balance,5);assert.equal(result.note,'+5 crystals');assert.equal(result.header,'blocknight-rewards');
  write('wave-credit',{seeded:false,before,result});l.screen('16-wave-crystals');console.log('Genuine native wave completion credited 5 crystals.');
 } else if(action==='home'){
  l.adb('shell','input','keyevent','4');await l.delay(500);l.screen('12-return-confirm');
  // Native dialog position is read from its real accessibility bounds.
  await l.nativeTap('Return',5000);await l.delay(500);l.screen('13-home-after-save');
 } else if(action==='capture-save'){
  const data=await c.evaluate('(()=>{const f=LaunchedModule.FS,p="/warzone2100/savegames/skirmish/QuickSave",data={};for(const n of ["gam.json","droid.json","struct.json","scriptstate.json"])data[n]=JSON.parse(f.readFile(p+"/"+n,{encoding:"utf8"}));return data})()');
  write('final-native-save',data);
 } else throw Error('Unknown phase');
 }finally{c.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
