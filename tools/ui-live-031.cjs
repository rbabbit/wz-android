'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA=path.resolve(__dirname,'../qa/0.31-ui');
process.env.WZ_QA_UI_INPUT='adb-scaled';
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const write=(n,v)=>fs.writeFileSync(path.join(l.out,n+'.json'),JSON.stringify(v,null,2)+'\n');
const read=n=>JSON.parse(fs.readFileSync(path.join(l.out,n+'.json')));
function wallet(){const xml=l.adb('exec-out','run-as',l.packageId,'cat','shared_prefs/towers_rewards.xml').toString(),s=xml.match(/<string name="ledger_v1">([\s\S]*?)<\/string>/)[1];return JSON.parse(s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'));}
function shot(name){l.screen(name);const t=l.tree();fs.writeFileSync(path.join(l.out,name+'.xml'),t.xml);return t.nodes.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc'],enabled:n.enabled,bounds:n.bounds}));}
async function ready(){let c;const end=Date.now()+45000;while(Date.now()<end){try{c=await l.connect();break;}catch(e){if(!/not ready/.test(String(e)))throw e;await l.delay(150);}}assert(c);try{await c.wait('window.WarzoneRewards?.ready&&window.__towersHtml?.isActive?.()',40000);return c;}catch(error){c.close();throw error;}}
const state=()=>`({commands:__warzoneCommands.report(),research:__blockNightResearch.report(),rewards:WarzoneRewards.report(),ads:WarzoneRewardedAds.report(),music:WarzoneMusic.report(),session:__towersHtml.session})`;
async function start(){const before=wallet();write('home-before',{identity:j.installedIdentity(),wallet:before,screen:shot('home-before')});await l.nativeTap('REWARDS '+before.balance,5000);assert(!l.tree().nodes.some(n=>n.text==='Gain 10 Crystals'),'Home Rewards closes on the first toggle tap');await l.nativeTap('PLAY',5000);const c=await ready();try{const native=await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})');write('game-ready',{identity:j.installedIdentity(),wallet:wallet(),native:native.result,state:await c.evaluate(state()),header:await c.host(`(()=>{const b=document.getElementById('blocknight-tech'),s=getComputedStyle(b);return {text:b.textContent,background:s.backgroundColor,color:s.color,header:document.getElementById('warzone-command-strip').getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio}})()`),screen:shot('game-ready')});}finally{c.close();}}
async function menus(){const c=await ready();try{const checks=[];for(const [name,selector,condition,closeSelector] of [
 ['build','#wt-open-build','__warzoneCommands.report().buildOpen','.wt-sidebar-collapse'],
 ['production','#wt-open-factory','__warzoneCommands.isOpen()&&__warzoneCommands.report().page==="factory"','#wt-command-pages [data-action="close"]'],
 ['queue','#wt-open-queue','__warzoneCommands.isOpen()&&__warzoneCommands.report().page==="queue"','#wt-command-pages [data-action="close"]'],
 ['research','#blocknight-tech','__blockNightResearch.report().open','.bn-tech-done'],
 ['help','#blocknight-help','!parent.document.getElementById("warzone-towers-help-overlay").hidden','#warzone-towers-help-overlay .wt-help-back,#warzone-towers-help-overlay .wt-help-close'],
 ['music','#blocknight-music','Boolean(parent.document.getElementById("wt-map-music-menu")&&!parent.document.getElementById("wt-map-music-menu").hidden)',null],
 ['rewards','#blocknight-rewards','WarzoneRewards.report().nativeDrawerOpen',null]]){
  for(let repeat=0;repeat<2;repeat++){
   await c.tap(selector);await c.wait(condition,10000);
   const removed=closeSelector?await c.evaluate(`!document.querySelector(${JSON.stringify(closeSelector)})&&!parent.document.querySelector(${JSON.stringify(closeSelector)})`):!l.tree().nodes.some(n=>n['content-desc']==='Close rewards');
   assert(removed,name+' duplicate close control removed');
   if(!repeat)shot('menu-'+name);
   await c.tap(selector);await c.wait('!('+condition+')',12000);checks.push({name,repeat,openedAndClosed:true});
  }
 }
 // Crossing from native Rewards to another header menu must dismiss the drawer.
 await c.tap('#blocknight-rewards');await c.wait('WarzoneRewards.report().nativeDrawerOpen');
 await c.tap('#blocknight-help');await c.wait('!WarzoneRewards.report().nativeDrawerOpen&&!parent.document.getElementById("warzone-towers-help-overlay").hidden');
 await c.tap('#blocknight-help');
 write('menus',{identity:j.installedIdentity(),checks,state:await c.evaluate(state()),screen:shot('menus-restored')});
}finally{c.close();}}
async function inspect(){const c=await ready();try{write(process.argv[3]||'observed',{identity:j.installedIdentity(),wallet:wallet(),state:await c.evaluate(state()),screen:shot(process.argv[3]||'observed')});}finally{c.close();}}
async function checkpoint(){const c=await ready();try{const native=await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})');write('game-ready',{identity:j.installedIdentity(),wallet:wallet(),native:native.result,state:await c.evaluate(state()),header:await c.host(`(()=>{const b=document.getElementById('blocknight-tech'),s=getComputedStyle(b);return {text:b.textContent,background:s.backgroundColor,color:s.color,header:document.getElementById('warzone-command-strip').getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio}})()`),screen:shot('game-ready')});}finally{c.close();}}
async function production(){const c=await ready();try{
 const native=(await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})')).result;
 const factory=native.factories.filter(f=>f.ready&&f.kind==='Factory').sort((a,b)=>a.id-b.id)[1];assert(factory);
 const history=await c.evaluate('__warzoneCommands.report().history.map(h=>h.nonce)');
 await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.isOpen()');
 await c.tap('#wt-command-pages [data-factory="'+factory.id+'"]');await c.tap('#wt-command-pages [data-count="1"]');
 const selector=await c.evaluate(`(()=>{const row=[...parent.document.querySelectorAll('.wt-factory-recipe')].find(e=>/Engineering/.test(e.textContent))||[...parent.document.querySelectorAll('[data-recipe-key]')].find(e=>/Engineering/.test(e.textContent));const b=row?.querySelector('.wt-factory-produce')||parent.document.querySelector('[data-produce-template="ConstructionDroid"]');if(!b)throw Error('Truck recipe not visible');return b.dataset.produceTemplate?'[data-produce-template='+JSON.stringify(b.dataset.produceTemplate)+']':'[data-produce='+JSON.stringify(b.dataset.produce)+']'})()`);
 await c.host(`window.__qa031Feedback=[];window.__qa031Observer=new MutationObserver(()=>{const e=document.getElementById('wt-production-feedback');window.__qa031Feedback.push({message:e?.textContent,tone:e?.dataset.tone,pending:[...document.querySelectorAll('.wt-factory-produce')].map(b=>({text:b.textContent,busy:b.getAttribute('aria-busy')}))})});__qa031Observer.observe(document.getElementById('wt-page-content'),{subtree:true,childList:true,attributes:true,characterData:true});true`);
 await c.tap(selector);await c.tap(selector);
 await c.wait(`__warzoneCommands.report().history.filter(h=>h.action==='queue-production'&&!${JSON.stringify(history)}.includes(h.nonce)&&h.ok).length>=2`,10000);
 const after=await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})');
 const acks=await c.evaluate(`__warzoneCommands.report().history.filter(h=>h.action==='queue-production'&&!${JSON.stringify(history)}.includes(h.nonce))`);
 assert.equal(acks.length,2);assert(acks.every(a=>a.ok&&a.result.factoryId===factory.id&&a.result.count===1));
 write('production',{identity:j.installedIdentity(),factoryId:factory.id,before:native,after:after.result,acks,feedback:await c.host('__qa031Feedback'),screen:shot('production-accepted')});
 await c.host('__qa031Observer.disconnect();delete __qa031Observer;true');
 await c.tap('#wt-open-factory');await c.wait('!__warzoneCommands.isOpen()');
}finally{c.close();}}
async function research(){const c=await ready();try{
 await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open');
 const cards=await c.evaluate(`[...document.querySelectorAll('.bn-tech-card')].filter(e=>e.querySelector('.bn-tech-ready b').textContent==='READY').map(e=>({id:e.dataset.topicId,name:e.querySelector('strong').textContent,points:Number((e.querySelector('.bn-tech-copy small').textContent.match(/([\d,]+) RESEARCH/)||[])[1]?.replaceAll(',','')||99999)})).sort((a,b)=>a.points-b.points)`);
 assert(cards.length>=2);const chosen=cards.slice(0,2);
 for(const topic of chosen)await c.tap('.bn-tech-card[data-topic-id='+JSON.stringify(topic.id)+']');
 assert.equal((await c.evaluate('__blockNightResearch.report().selectedTopicIds')).length,2);
 await c.tap('.bn-tech-assign');shot('research-two-selected');
 await c.tap('#blocknight-tech');await c.wait('!__blockNightResearch.report().open&&!__blockNightResearch.report().opening');
 const native=(await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})')).result;
 const r=await c.evaluate('__blockNightResearch.report()');
 for(const topic of chosen)assert(native.researchQueues.some(q=>q.topicIds?.includes(topic.id))||r.labs.some(l=>l.topicId===topic.id),'native lab retains '+topic.id);
 await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open');
 write('research',{identity:j.installedIdentity(),chosen,native,reopened:await c.evaluate('__blockNightResearch.report()'),screen:shot('research-reopened')});
 await c.tap('#blocknight-tech');await c.wait('!__blockNightResearch.report().open');
}finally{c.close();}}
async function completion(){const c=await ready();try{const p=read('production'),ids=p.before.finishedUnits.map(u=>u.id);await c.wait(`__warzoneCommands.report().snapshot.finishedUnits.filter(u=>u.factoryId===${p.factoryId}&&!${JSON.stringify(ids)}.includes(u.id)).length>=2`,55000);const native=(await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})')).result;const finished=native.finishedUnits.filter(u=>u.factoryId===p.factoryId&&!ids.includes(u.id));assert.equal(finished.length,2);assert(finished.every(u=>native.trucks.some(t=>t.id===u.id)));write('production-completed',{identity:j.installedIdentity(),finished,trucks:native.trucks,screen:shot('production-completed')});}finally{c.close();}}
async function build(){const c=await ready();try{
 const ctl=await require('./audit-smooth-building.cjs').controls(c);
 await ctl.camera(31,62);await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().selectingTrucks');
 await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');
 const attempts=[];let selected;
 for(const [x,y]of[[31,61],[30,61],[32,61]]){const v=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${x},y:${y},workerIds:__warzoneCommands.report().nativeBuildGroup})`);attempts.push({x,y,reply:v});if(v.ok){selected={x,y};break;}}
 assert(selected,'reachable unoccupied ordinary build site');const {x,y}=selected;
 const point=await ctl.tile(x,y);await c.wait(`__warzoneCommands.report().history.some(h=>h.action==='queue-build'&&h.ok&&h.result.itemId==='GuardTower1'&&h.result.x===${x}&&h.result.y===${y})`,10000);
 const accepted=await c.evaluate('__warzoneCommands.report()');shot('build-accepted');
 await c.tap('#wt-open-build');await c.wait('!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().exitingBuild');
 const afterClose=(await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})')).result;
 await c.wait(`__warzoneCommands.report().snapshot.finishedBuilds.some(b=>b.itemId==='GuardTower1'&&b.x===${x}&&b.y===${y})`,45000);
 const completed=(await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})')).result;
 write('build-kept',{identity:j.installedIdentity(),attempts,selected,point,group:accepted.nativeBuildGroup,ack:accepted.history.filter(h=>h.action==='queue-build'),afterClose,completed:completed.finishedBuilds,screen:shot('build-kept')});
}finally{c.close();}}
async function ad(){const c=await ready();try{await c.tap('#blocknight-rewards');await c.wait('WarzoneRewards.report().nativeDrawerOpen');write('ad-before',{identity:j.installedIdentity(),wallet:wallet(),state:await c.evaluate(state()),screen:shot('ad-before')});await l.nativeTap('Watch an optional ad to earn 10 crystals',5000);await c.wait('WarzoneRewardedAds.report().owned',35000);const first=await c.evaluate('WarzoneRewardedAds.report()');await l.delay(1600);const held=await c.evaluate('WarzoneRewardedAds.report()');assert.equal(held.clock,first.clock);write('ad-held',{first,held,music:await c.evaluate('WarzoneMusic.report()'),screen:shot('ad-held')});}finally{c.close();}}
async function earned(){const before=read('ad-before').wallet.balance,end=Date.now()+55000;while(Date.now()<end){const w=wallet();if(w.balance===before+10){write('ad-earned',{wallet:w,screen:shot('ad-earned')});console.log({before,after:w.balance});return;}await l.delay(250);}throw Error('No earned Google test grant');}
async function finish(){await l.nativeTap('Close',15000);const c=await ready();try{await c.wait('!WarzoneRewardedAds.report().held',12000);const clock=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+clock,8000);const resumed=await c.evaluate(state());assert.equal(resumed.session,read('ad-before').state.session);await c.tap('#blocknight-rewards');await c.wait('!WarzoneRewards.report().nativeDrawerOpen');await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');l.adb('shell','input','keyevent','4');await c.wait('parent.document.getElementById("warzone-towers-help-overlay").hidden');await c.tap('#blocknight-save');await c.wait('!WarzoneSavedGames.report().busy&&Boolean(WarzoneSavedGames.report().savedId)',20000);const saved=await c.evaluate('WarzoneSavedGames.report()');assert.equal(saved.error,'');write('post-ad-save',{identity:j.installedIdentity(),wallet:wallet(),resumed,saved,state:await c.evaluate(state()),screen:shot('post-ad-save')});}finally{c.close();}l.adb('shell','input','keyevent','4');await l.nativeTap('Return',5000);const before=wallet();await l.nativeTap('REWARDS '+before.balance,5000);write('home-final',{identity:j.installedIdentity(),wallet:wallet(),screen:shot('home-final')});await l.nativeTap('REWARDS '+before.balance,5000);assert(!l.tree().nodes.some(n=>n.text==='Gain 10 Crystals'));l.adb('shell','am','force-stop',l.packageId);l.adb('shell','am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');await l.nativeTap('REWARDS '+before.balance,10000);assert.equal(wallet().balance,before.balance);write('restart',{identity:j.installedIdentity(),wallet:wallet(),screen:shot('restart')});await l.nativeTap('REWARDS '+before.balance,5000);assert(!l.tree().nodes.some(n=>n.text==='Gain 10 Crystals'));}
(async()=>{if(process.argv[2]==='start')await start();else if(process.argv[2]==='checkpoint')await checkpoint();else if(process.argv[2]==='menus')await menus();else if(process.argv[2]==='production')await production();else if(process.argv[2]==='research')await research();else if(process.argv[2]==='completion')await completion();else if(process.argv[2]==='build')await build();else if(process.argv[2]==='ad')await ad();else if(process.argv[2]==='earned')await earned();else if(process.argv[2]==='finish')await finish();else if(process.argv[2]==='inspect')await inspect();else throw Error('Unknown stage');})().catch(e=>{console.error(e);process.exitCode=1});
