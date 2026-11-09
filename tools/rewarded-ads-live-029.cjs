'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA ||= path.resolve(__dirname,'../qa/0.29-ads');
const l=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const put=(n,v)=>fs.writeFileSync(path.join(l.out,n+'.json'),JSON.stringify(v,null,2));
const read=n=>JSON.parse(fs.readFileSync(path.join(l.out,n+'.json')));
function wallet(){const xml=l.adb('exec-out','run-as',l.packageId,'cat','shared_prefs/towers_rewards.xml').toString();
 const text=xml.match(/<string name="ledger_v1">([\s\S]*?)<\/string>/)[1];
 return JSON.parse(text.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));}
function inspect(name){const t=l.tree();fs.writeFileSync(path.join(l.out,name+'.xml'),t.xml);l.screen(name);return t.nodes.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds,enabled:n.enabled}));}
async function ready(){const end=Date.now()+45000;let tried=false,last=[];while(Date.now()<end){last=l.tree().nodes;
 if(last.some(n=>(n.text||'').includes('Ready · watch an ad')))return;
 if(!tried&&last.some(n=>/Tap to retry/.test(n.text||''))){tried=true;await l.nativeTap('Watch an optional ad to earn 10 crystals',3000);}
 await l.delay(300);}throw Error('Ad not ready: '+JSON.stringify(last.filter(n=>/Test ads/.test(n.text))));}
async function home(){
 const identity=journey.installedIdentity();assert.equal(identity.candidateAPK_SHA256,'fbd35815d25b9a31a2dda9708c42b6af5e951d892a65f661f7d32737184728d3');
 assert(l.tree().nodes.some(n=>n['content-desc']==='Warzone Towers version 0.29'));
 const before=wallet();await l.nativeTap('REWARDS '+before.balance,5000);await ready();
 put('delivery-home-before',{identity,wallet:before,screen:inspect('delivery-home-ready')});
 await l.nativeTap('Watch an optional ad to earn 10 crystals',3000);
 put('delivery-home-ad-open',{wallet:wallet(),screen:inspect('delivery-home-google-ad')});
 console.log(JSON.stringify({before:before.balance,now:wallet().balance,screen:inspect('delivery-home-ad-state')}));
}
async function earned(where){const before=read('delivery-'+where+'-before').wallet.balance,end=Date.now()+60000;let current;
 while(Date.now()<end){current=wallet();if(current.balance===before+10){put('delivery-'+where+'-earned',{wallet:current,screen:inspect('delivery-'+where+'-earned-ad')});console.log(JSON.stringify({before,after:current.balance,pending:current.pendingAdReward}));return;}await l.delay(300);}
 throw Error('No earned reward observed: '+current?.balance);
}
async function game(){if(l.tree().nodes.some(n=>n['content-desc']==='Warzone Towers version 0.29')){
 if(l.tree().nodes.some(n=>n['content-desc']==='Close rewards'))await l.nativeTap('Close rewards',5000);
 await l.nativeTap('PLAY',5000);}
 const end=Date.now()+45000;let c;while(Date.now()<end){try{c=await l.connect();break;}catch(e){if(!/not ready/.test(String(e)))throw e;await l.delay(200);}}
 assert(c);try{await c.wait('window.WarzoneRewards?.ready&&Boolean(window.WarzoneRewardedAds)',35000);const before=wallet(),state=await c.evaluate('({session:__towersHtml.session,wave:__warzoneTowersWaves.report().snapshot,hold:WarzoneRewardedAds.report()})');
 await c.tap('#blocknight-rewards');await ready();put('delivery-game-before',{identity:journey.installedIdentity(),wallet:before,state,screen:inspect('delivery-game-ready')});
 await l.nativeTap('Watch an optional ad to earn 10 crystals',3000);await c.wait('WarzoneRewardedAds.report().owned===true',10000);
 const held=await c.evaluate('WarzoneRewardedAds.report()');await l.delay(1700);const stable=await c.evaluate('WarzoneRewardedAds.report()');assert.equal(stable.clock,held.clock);
 put('delivery-game-held',{held,stable,wallet:wallet(),screen:inspect('delivery-game-google-ad')});console.log(JSON.stringify({held,stable,wallet:wallet().balance}));
 }finally{c.close();}}
async function resumed(){const c=await l.connect();try{await c.wait('!WarzoneRewardedAds.report().held',15000);const clock=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+clock,8000);put('delivery-game-resumed',{wallet:wallet(),state:await c.evaluate('({session:__towersHtml.session,wave:__warzoneTowersWaves.report().snapshot,hold:WarzoneRewardedAds.report(),commands:__warzoneCommands.report().nativeMenu})'),screen:inspect('delivery-game-resumed')});console.log('Same native document resumed with advancing clock');}finally{c.close();}}
async function early(){await ready();const before=wallet();put('delivery-cancel-before',{wallet:before});
 await l.nativeTap('Watch an optional ad to earn 10 crystals',3000);const until=Date.now()+10000;let opened=false;
 while(Date.now()<until){const top=l.adb('shell','dumpsys','activity','activities').toString().split('\n').filter(s=>/topResumedActivity|mResumedActivity/.test(s)).join(' ');
 if(top.includes('com.google.android.gms.ads.AdActivity')){opened=true;break;}await l.delay(100);}
 assert(opened);l.adb('shell','input','keyevent','4');put('delivery-cancel-dialog',{wallet:wallet(),screen:inspect('delivery-cancel-dialog')});console.log(JSON.stringify(inspect('delivery-cancel-controls')));
}
async function finish(){const c=await l.connect();try{
 const before=wallet(),initial=await c.evaluate('({session:__towersHtml.session,save:WarzoneSavedGames.report(),music:WarzoneMusic.report(),hold:WarzoneRewardedAds.report()})');
 assert.equal(initial.hold.held,false);assert.equal(initial.music.suspended,false);assert.equal(initial.music.playing,true);
 await c.tap('#blocknight-save');await c.wait('!WarzoneSavedGames.report().busy&&Boolean(WarzoneSavedGames.report().savedId)',20000);
 const saved=await c.evaluate('WarzoneSavedGames.report()');assert.equal(saved.error,'');
 await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen',10000);
 const build=await c.evaluate('__warzoneCommands.report()');l.screen('delivery-post-ad-build');
 await c.tap('#wt-build-sidebar [data-action="select-mode"]');await c.wait('!__warzoneCommands.report().buildOpen');
 await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open',10000);l.screen('delivery-post-ad-tech');
 await c.tap('#blocknight-research-shell .bn-tech-done');await c.wait('!__blockNightResearch.report().open');
 put('delivery-post-ad-input-save',{identity:journey.installedIdentity(),before:before.balance,wallet:wallet(),initial,saved,build:{open:build.buildOpen,selected:build.snapshot?.selectedUnits,trucks:build.snapshot?.trucks},screen:inspect('delivery-post-ad-input-save')});
 }finally{c.close();}
 l.adb('shell','input','keyevent','4');await l.nativeTap('Return',5000);
 assert(l.tree().nodes.some(n=>n['content-desc']==='Warzone Towers version 0.29'));const beforeRestart=wallet();l.screen('delivery-return-home');
 l.adb('shell','am','force-stop',l.packageId);l.adb('shell','am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');
 await l.nativeTap('REWARDS '+beforeRestart.balance,8000);const after=wallet();assert.equal(after.balance,beforeRestart.balance);assert.equal(after.pendingAdReward,'');
 put('delivery-restarted',{identity:journey.installedIdentity(),beforeRestart:beforeRestart.balance,wallet:after,screen:inspect('delivery-restarted-rewards')});
 console.log(JSON.stringify({saveAndInputRestored:true,restartBalance:after.balance,pending:after.pendingAdReward}));
}
(async()=>{const action=process.argv[2];if(action==='home')await home();else if(action==='earned')await earned(process.argv[3]);else if(action==='game')await game();else if(action==='resumed')await resumed();else if(action==='early')await early();else if(action==='finish')await finish();else if(action==='inspect')console.log(JSON.stringify(inspect(process.argv[3]||'delivery-observed')));else if(action==='wallet')console.log(JSON.stringify(wallet()));else throw Error('Unknown action');})().catch(e=>{console.error(e);process.exitCode=1});
