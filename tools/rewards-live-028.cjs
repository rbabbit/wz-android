'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA ||= path.resolve(__dirname,'../qa/0.28-rewards');
const l=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const write=(name,value)=>fs.writeFileSync(path.join(l.out,name+'.json'),JSON.stringify(value,null,2));
const named=label=>{const n=l.tree().nodes.find(n=>(n.text===label||n['content-desc']===label)&&n.enabled==='true');assert(n,'Visible enabled native control: '+label);return n;};
const point=node=>{const p=[...node.bounds.matchAll(/\d+/g)].map(x=>+x[0]);return{x:Math.round((p[0]+p[2])/2),y:Math.round((p[1]+p[3])/2)}};
const tapNode=node=>{const p=point(node);l.adb('shell','input','tap',String(p.x),String(p.y));};
async function home(resume=false){
 const identity=journey.installedIdentity();assert.equal(identity.candidateAPK_SHA256,'851e70aca310f6f90f8d94eb22facb32ad0dd32069e753c74f6320f670808571');
 if (!resume) {
 named('Warzone Towers version 0.28');l.screen('final-01-home-version');
 await l.nativeTap('REWARDS 300');named('Rewards category Fortresses');l.screen('final-02-home-fortresses');
 await l.nativeTap('Rewards category Defences');await l.nativeTap('Select Gauss Cannon Hardpoint, stored 0, 25 crystals each');
 await l.nativeTap('Buy 1 Gauss Cannon Hardpoint for 25 crystals');named('275 crystals');
 await l.nativeTap('NEXT MATCH');
 }
 // Home purchases already join the default next-match loadout. Check both
 // direct quantity edits against the actual visible Take count.
 named('Stored 1 · Take 1');
 await l.nativeTap('Decrease reward quantity by one');await l.nativeTap('Take 0 Gauss Cannon Hardpoint into the next match');
 await l.nativeTap('Increase reward quantity by one');await l.nativeTap('Take 1 Gauss Cannon Hardpoint into the next match');
 named('Select Gauss Cannon Hardpoint, stored 1');l.screen('final-03-home-equipped');
 await l.nativeTap('SHOP');await l.nativeTap('Rewards category Support');named('Select Research accelerator, stored 0, 60 crystals each');l.screen('final-04-support');
 await l.nativeTap('Close rewards');await l.nativeTap('SAVED GAMES');await l.nativeTap('Load Greenhaven, EASY · Wave 0 / 15');
 write('final-home-checks',{identity,passed:true,homeStartBalance:300,homeEndBalance:275,bought:'gauss_hardpoint',equipped:1,ordinarySavedFixture:'Existing genuine 0.27 Greenhaven manual save; no native file edits or seeded objects'});
}
async function game(){
 const c=await l.connect();try{
 await c.wait('window.WarzoneRewards?.ready===true&&window.WarzoneSavedGames?.ready===true',30000);
 const before=await c.evaluate('({config:JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)),wave:__warzoneTowersWaves.report().snapshot,saved:WarzoneSavedGames.report(),native:__warzoneCommands.report().snapshot})');
 assert.equal(await c.evaluate('BlockNightAndroid.appVersion()'),'0.28');
 const labels=await c.evaluate('({save:!!parent.document.getElementById("blocknight-save"),rewards:parent.document.getElementById("blocknight-rewards").textContent})');assert(labels.save);
 const keys=await c.evaluate('JSON.parse(LaunchedModule.FS.readFile("/warzone2100/keymap.json",{encoding:"utf8"})).mappings.filter(x=>/^(SpeedUp|NormalSpeed)$/.test(x.function))');
 assert(keys.some(k=>k.function==='SpeedUp'&&k.sub===61));
 await c.evaluate(`(async()=>{const cv=document.getElementById('canvas'),key=(key,code,keyCode,down,ctrl,location=0)=>{cv.focus();cv.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key,code,keyCode,which:keyCode,bubbles:true,cancelable:true,ctrlKey:ctrl,location}));};for(let i=0;i<3;i++){key('Control','ControlLeft',17,true,true,1);await __warzoneCommands.send('state');key('=','Equal',187,true,true);await __warzoneCommands.send('state');key('=','Equal',187,false,true);key('Control','ControlLeft',17,false,false,1);await __warzoneCommands.send('state');}return true})()`);
 const speedStart={real:Date.now(),game:await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime')};await l.delay(1500);const speedEnd={real:Date.now(),game:await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime')};
 write('final-loaded-fixture',{before,labels,keys,speedStart,speedEnd,provenance:'Genuine prior native save loaded normally; ordinary Ctrl+Equals selects supported 2x game speed; no debug mode, world seeding or timer edits.'});
 await c.tap('#blocknight-rewards');
 const state=l.tree();write('ingame-native-controls',state.nodes);l.screen('final-05-ingame-fortresses');
 // The identical Home/in-game drawer is hit through real Android accessibility bounds.
 tapNode(state.nodes.find(n=>n['content-desc']==='Buy 1 Cannon Fortress for 120 crystals'));
 await c.wait('__warzoneCommands.report().snapshot.rewards.remaining.fortress===1&&JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)).balance===155',12000);
 const afterFort=await c.evaluate('__warzoneCommands.send("reward-inventory")');
 await l.nativeTap('Rewards category Artillery',5000);await l.nativeTap('Select Ripple Rocket Battery, remaining 1, 10 crystals each',5000);await l.nativeTap('Set reward quantity to 5',5000);
 await l.nativeTap('Buy 5 Ripple Rocket Battery for 50 crystals',5000);
 await c.wait('__warzoneCommands.report().snapshot.rewards.remaining.ripple===6&&JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)).balance===105',12000);
 const afterRipple=await c.evaluate('__warzoneCommands.send("reward-inventory")');l.screen('final-06-ingame-ripple-bought');
 await l.nativeTap('THIS MATCH',5000);l.screen('final-07-this-match');await l.nativeTap('Close rewards',5000);
 write('final-game-purchases',{before,afterFort,afterRipple,balance:105,fortress:1,ripple:6});
 }finally{c.close()}
}
async function autosave(){
 const c=await l.connect();try{
 const data=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p='/warzone2100/savegames/skirmish/auto',files=f.readdir(p).filter(n=>n!=='.'&&n!=='..').map(n=>{const q=p+'/'+n;try{return{folder:n,gam:JSON.parse(f.readFile(q+'/gam.json',{encoding:'utf8'})),files:f.readdir(q).filter(n=>n!=='.'&&n!=='..'),mtime:Number(f.stat(q+'/gam.json').mtime)}}catch(e){return{folder:n,error:String(e)}}});return{wave:__warzoneTowersWaves.report().snapshot,autosaves:files,errors:errorLog.filter(s=>/writeGameFile|AutoSave.*fail|Unable to save/.test(s)),saved:WarzoneSavedGames.report()}})()`);
 assert(data.autosaves.some(s=>s.gam?.gameTime>=600000&&s.gam?.levelName==='Greenhaven-T1'&&s.files.includes('scriptstate.json')&&s.files.includes('game.map')));
 assert.equal(data.errors.length,0);write('native-automatic-save-observation',{candidate:journey.installedIdentity().candidateAPK_SHA256,...data,provenance:'Automatic native ten-game-minute timer in genuine old saved match, ordinary supported 2x speed; no game clock, world or timer mutation. Native payload is unchanged from 0.27. This is a supporting pre-wallet-fix observation, not the final delivery APK.'});
 l.screen('08-native-autosave-no-error');console.log('Native automatic save succeeded at its ordinary timer.');
 }finally{c.close()}
}
async function loadExisting(){
 const nodes=l.tree().nodes;
 if(nodes.some(n=>n.text==='BATTLE ENDED'))await l.nativeTap('OK');
 await l.nativeTap('SAVED GAMES');await l.nativeTap('Load Greenhaven, EASY · Wave 0 / 15');
}
(async()=>{if(process.argv[2]==='home'||process.argv[2]==='home-resume')await home(process.argv[2]==='home-resume');else if(process.argv[2]==='game')await game();else if(process.argv[2]==='autosave')await autosave();else if(process.argv[2]==='load-existing')await loadExisting();else throw Error('Unknown phase')})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
