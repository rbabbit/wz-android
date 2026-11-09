'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA ||= path.resolve(__dirname,'../qa/0.28-rewards');
const l=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const write=(name,value)=>fs.writeFileSync(path.join(l.out,name+'.json'),JSON.stringify(value,null,2));
const read=name=>JSON.parse(fs.readFileSync(path.join(l.out,name+'.json')));
const balance=nodes=>Number(nodes.find(n=>/^Rewards, \d+ crystals$/.test(n['content-desc']||''))['content-desc'].match(/\d+/)[0]);
const hit=node=>{assert(node&&node.enabled==='true');const p=[...node.bounds.matchAll(/\d+/g)].map(x=>+x[0]);l.adb('shell','input','tap',String(Math.round((p[0]+p[2])/2)),String(Math.round((p[1]+p[3])/2)));};
const state=()=>`({documentSession:__towersHtml.session,config:JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)),caps:JSON.parse(BlockNightAndroid.rewardResumeCaps(__towersHtml.session)),native:__warzoneCommands.report().snapshot,wave:__warzoneTowersWaves.report().snapshot,saved:WarzoneSavedGames.report()})`;
async function connectGame(){
 const until=Date.now()+20000;let last;
 do{try{return await l.connect()}catch(error){last=error;if(!/not ready/.test(String(error)))throw error;await l.delay(150)}}while(Date.now()<until);
 throw last;
}
async function start(){
 const identity=journey.installedIdentity();assert.equal(identity.candidateAPK_SHA256,'fa1d41a8287937c3edf2f1f36b1bcddfce95e31dd1f06ad26dc500c4a8d9e52f');
 const nodes=l.tree().nodes;assert(nodes.some(n=>n['content-desc']==='Warzone Towers version 0.28'));const before=balance(nodes);l.screen('delivery-01-home');
 await l.nativeTap('REWARDS '+before);l.tree();l.screen('delivery-02-home-fortresses');
 await l.nativeTap('Rewards category Artillery');await l.nativeTap('Select Ripple Rocket Battery, stored 0, 10 crystals each');await l.nativeTap('Buy 1 Ripple Rocket Battery for 10 crystals');
 assert(l.tree().nodes.some(n=>n['content-desc']===(before-10)+' crystals'));
 await l.nativeTap('NEXT MATCH');assert(l.tree().nodes.some(n=>n.text==='Stored 1 · Take 1'));l.screen('delivery-03-home-next-match');
 await l.nativeTap('Close rewards');await l.nativeTap('PLAY');write('delivery-home',{identity,balanceBefore:before,balanceAfter:before-10,item:'ripple',quantity:1});
}
async function save(c,name){
 const old=await c.evaluate('WarzoneSavedGames.report().savedId');await c.tap('#blocknight-save');
 await c.wait(`(()=>{const s=WarzoneSavedGames.report();return !s.busy&&s.savedId&&s.savedId!==${JSON.stringify(old)}})()`,20000);
 const value=await c.evaluate(state()),gam=await c.evaluate('JSON.parse(LaunchedModule.FS.readFile("/warzone2100/savegames/skirmish/QuickSave/gam.json",{encoding:"utf8"}))');
 assert.equal(value.saved.error,'');assert.equal(gam.levelName,'Greenhaven-T1');write(name,{...value,gam});l.screen(name);return value;
}
async function purchaseBuildSave(){
 const c=await connectGame();try{
 await c.wait('window.WarzoneRewards?.ready===true&&window.WarzoneSavedGames?.ready===true',30000);
 assert.equal(await c.evaluate('BlockNightAndroid.appVersion()'),'0.28');
 const initial=await c.evaluate(state());assert.equal(initial.native.rewards.remaining.ripple,1);assert.equal(initial.caps.remaining.ripple,1);assert.equal(initial.native.rewards.remaining.gauss_hardpoint,1);
 await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');
 assert.equal(await c.evaluate('parent.document.querySelector(".wt-help-eyebrow").textContent'),'WARZONE TOWERS · v0.28');l.screen('delivery-04-help-version');await c.tap('.wt-help-back');
 await save(c,'delivery-before-purchase');
 await c.tap('#blocknight-rewards');l.tree();l.screen('delivery-05-ingame-fortresses');
 await l.nativeTap('Rewards category Artillery',5000);await l.nativeTap('Select Ripple Rocket Battery, remaining 1, 10 crystals each',5000);await l.nativeTap('Set reward quantity to 5',5000);await l.nativeTap('Buy 5 Ripple Rocket Battery for 50 crystals',5000);
 await c.wait('__warzoneCommands.report().snapshot.rewards.remaining.ripple===6&&JSON.parse(BlockNightAndroid.rewardResumeCaps(__towersHtml.session)).remaining.ripple===6',12000);
 const paidClock=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+String(paidClock+2500));
 const bought=await c.evaluate(state());assert.equal(bought.caps.remaining.ripple,6);assert.equal(bought.config.balance,initial.config.balance-50);
 assert(l.tree().nodes.some(n=>n['content-desc']==='Select Ripple Rocket Battery, remaining 6, 10 crystals each'));l.screen('delivery-06-bulk-purchased');
 await l.nativeTap('THIS MATCH',5000);l.tree();l.screen('delivery-07-this-match');await l.nativeTap('Close rewards',5000);write('delivery-purchase',{initial,bought});
 // One normal, paid native construction order checks that using an allowance
 // survives a later load. No research, free objects or world-file edits.
 const build=await c.evaluate(`(async()=>{const s=(await __warzoneCommands.send('state')).result,workers=s.trucks.map(t=>t.id),previews=[];for(const [x,y]of[[36,68],[38,68],[30,69]]){const command={itemId:'Emplacement-Rocket06-IDF',x,y,workerIds:workers,session:__towersHtml.session},p=await __warzoneCommands.send('preview-build',command);previews.push(p);if(p.ok)return{previews,accepted:await __warzoneCommands.send('queue-build',command)};}return{previews};})()`);
 assert(build.accepted?.ok,JSON.stringify(build));write('delivery-build-order',build);
 await c.wait(`__warzoneCommands.report().snapshot.finishedBuilds.some(b=>b.id===${JSON.stringify(build.accepted.result.id)})`,60000);
 const consumed=await c.evaluate(state());assert.equal(consumed.native.rewards.remaining.ripple,5);assert.equal(consumed.caps.remaining.ripple,5);write('delivery-consumed',consumed);
 await save(c,'delivery-after-purchase');
 }finally{c.close()}
}
async function home(){
 l.adb('shell','input','keyevent','4');await l.nativeTap('Return',5000);assert(l.tree().nodes.some(n=>n['content-desc']==='Warzone Towers version 0.28'));
}
async function load(which,suffix=which){
 await l.nativeTap('SAVED GAMES');const buttons=l.tree().nodes.filter(n=>n.text==='LOAD'&&/^Load Greenhaven,/.test(n['content-desc']));
 hit(buttons[which==='post'?0:1]);
 const c=await connectGame();try{
 await c.wait('window.WarzoneRewards?.ready===true&&window.WarzoneSavedGames?.ready===true&&window.WarzoneSavedGames?.loading===true',30000);
 const expected=read(which==='post'?'delivery-after-purchase':'delivery-before-purchase'),result=await c.evaluate(state());
 assert.equal(result.saved.slotId,expected.saved.savedId);assert.notEqual(result.documentSession,expected.documentSession);assert.equal(result.config.session,expected.config.session);
 assert.equal(result.native.rewards.remaining.ripple,5);assert.equal(result.caps.remaining.ripple,5);assert.equal(result.config.balance,read('delivery-after-purchase').config.balance);assert.equal(result.config.pendingTransactions.length,0);
 const clock=result.wave.gameTime;await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+String(clock+2000));const stable=await c.evaluate(state());assert.equal(stable.caps.remaining.ripple,5);assert.equal(stable.native.rewards.remaining.ripple,5);
 write('delivery-loaded-'+suffix,{result,stable});l.screen('delivery-loaded-'+suffix);
 }finally{c.close()}
}
(async()=>{const action=process.argv[2];if(action==='start')await start();else if(action==='purchase-save')await purchaseBuildSave();else if(action==='home')await home();else if(action==='load')await load(process.argv[3],process.argv[4]||process.argv[3]);else throw Error('Unknown phase')})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
