/* Actual reader + Campaign HUD in bounded DOM/native-response fixtures. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),asset=name=>path.join(root,'app/src/main/assets',name),read=name=>fs.readFileSync(asset(name),'utf8');
const helperPath=path.join(root,'tools/check-intelligence-048.cjs');let helper=fs.readFileSync(helperPath,'utf8');
helper=helper.slice(0,helper.indexOf('(async()=>{'));
helper=helper.replace('return{window,document,requests,held,','return{context,listeners,time:()=>now,window,document,requests,held,');
const fixtureModule=new Module(helperPath,module);fixtureModule.filename=helperPath;fixtureModule.paths=module.paths;
fixtureModule._compile(helper+'\nmodule.exports={fixture};',helperPath);
const {fixture}=fixtureModule.exports,checks=[];
const source=read('warzone-intelligence.js'),hud=read('warzone-campaign-hud.js');
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS '+name);}
function campaignFixture(readerSource=source){
 const f=fixture({intelligenceSource:'window.__warzoneCampaignMode=true;var CustomEvent=class{constructor(type,options={}){this.type=type;Object.assign(this,options)}};\n'+readerSource});
 f.window.dispatchEvent=event=>{f.dispatch(event.type,event.detail);return true;};
 f.context.Date=class extends Date{static now(){return 10000+f.time();}};
 f.window.LaunchedModule.calledRun=true;f.window.__towersHtml.activate=()=>true;
 const commands={page:'',buildOpen:false,placement:false,selectingTrucks:false,nativeMenu:''};
 const calls=f.calls;f.window.__warzoneCommands.report=()=>commands;
 f.window.__warzoneCommands.resetSession=()=>{};f.window.__warzoneCommands.revealNativePause=()=>{};
 f.window.__warzoneCommands.close=()=>{commands.page='';return Promise.resolve(true);};
 f.window.__warzoneCommands.afterBuildExit=async fn=>{calls.push('build-exit');return fn();};
 f.window.__warzoneCommands.send=async()=>({ok:true,result:{count:4}});
 const research={open:false,opening:false};f.window.__blockNightResearch={report:()=>research,close(){research.open=false;},resetSession(){},revealNativePause(){}};
 f.window.WarzoneSavedGames={ready:true,busy:false};
 f.window.__kalaWarzoneTouch.report=()=>({gestureActive:false,pendingClicks:0,panPhase:'idle'});
 f.window.__kalaWarzoneTouch.nativePressKey=(key,code)=>{calls.push(['native-key',key]);f.key({key,code});return true;};
 const frame={playing:true,worldSafe:true,paused:false,video:false,nativeMenuOpen:false,transportOpen:false,intelligenceOpen:false,gameTime:50000,nativeLevel:'CAM_1A'};
 const update=patch=>{Object.assign(frame,patch);f.files.set('/tmp/warzone-campaign-state-v51.json',JSON.stringify(frame));};update({});
 vm.runInContext(hud,f.context,{filename:asset('warzone-campaign-hud.js')});
 const campaign=f.window.__warzoneCampaign;campaign.poll();campaign.accept({mode:'campaign',session:'cam1a-test',mission:'cam1a',gameTime:50000});
 return Object.assign(f,{campaign,commands,research,update,frame});
}
function toolbarFixture(f,destination){
 const touch=read('warzone-touch-controls.js'),start=touch.indexOf('  function bindTouchCommand('),end=touch.indexOf('\n  function ',start+1);
 assert(start>=0&&end>start);
 vm.runInContext('const state={battleActive:true};const TAP_SLOP=6;\n'+touch.slice(start,end)+'\nwindow.__testBindTouchCommand=bindTouchCommand;',f.context);
 const command=f.document.createElement('button');command.id=destination;command.disabled=false;
 const originalClosest=command.closest.bind(command);command.closest=selector=>selector.includes('#blocknight-combat-hud button')?command:originalClosest(selector);
 let activations=0;
 f.window.__testBindTouchCommand(command,()=>{activations++;if(destination==='research')f.research.open=!f.research.open;else if(destination==='manufacturing')f.commands.page=f.commands.page?'':'factory';else if(destination==='build')f.commands.buildOpen=!f.commands.buildOpen;});
 function dispatch(type,extra={}){
  const event={target:command,pointerType:'touch',pointerId:1,clientX:30,clientY:30,detail:0,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;this.stopped=true;},...extra};
  for(const listener of f.listeners.get('doc:'+type)||[]){listener(event);if(event.immediate)break;}
  if(!event.immediate)for(const listener of command.events.get(type)||[]){listener(event);if(event.immediate)break;}
  return event;
 }
 command.click=()=>dispatch('click',{detail:0,pointerType:undefined});
 return {command,dispatch,activations:()=>activations};
}
(async()=>{
 await check('Campaign startup injects reader before HUD; Towers/Duel opt-in behaviour preserved',async()=>{
  const java=fs.readFileSync(path.join(root,'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'),'utf8');
  const scripts=java.match(/\bString\[\]\s+scripts\s*=\s*([\s\S]*?);/);assert(scripts,'Native script assignment is missing');
  const campaignBranches=[...scripts[1].matchAll(/\bisCampaignBattle\(\)\s*\?\s*new\s+String\[\]\s*\{([^}]*)\}/g)];
  assert.equal(campaignBranches.length,1,'Expected one explicit Campaign script branch');const campaign=campaignBranches[0][1];
  assert(campaign.indexOf('"warzone-intelligence.js"')>0&&campaign.indexOf('"warzone-intelligence.js"')<campaign.indexOf('"warzone-campaign-hud.js"'));
  const towers=fixture();assert.equal(towers.document.getElementById('wt-intelligence-briefings'),null);
  await towers.run(towers.window.__warzoneIntelligence.open());assert.equal(towers.window.__warzoneIntelligence.report().open,true);
  await towers.run(towers.window.__warzoneIntelligence.close());assert.equal(towers.window.__warzoneIntelligence.isOpen(),false);
  const duel=fixture({duel:true});assert.equal(duel.window.__warzoneIntelligence,undefined);
 });
 await check('Default Campaign Intelligence uses native research reader over world and suspends ALL',async()=>{
  const f=campaignFixture();f.campaign.toggleAllCombat(true);await f.advance(500);
  await f.run(f.campaign.openIntel());assert.equal(f.window.__warzoneIntelligence.report().open,true);
  assert.equal(f.campaign.report().suspended,true);assert.equal(f.calls.some(call=>Array.isArray(call)&&call[0]==='native-key'&&call[1]==='F5'),false);
  assert(f.document.getElementById('wt-intelligence-briefings'));
  await f.advance(80);assert.equal(f.slot.classList.contains('preview-ready'),true);
  assert.equal(f.campaign.nativeUiActive(),false);assert.equal(f.window.__warzoneIntelligence.report().history.some(t=>t.initialGrant===true),false);
  assert.equal(f.campaign.handleBack(),true);await f.advance(100);assert.equal(f.window.__warzoneIntelligence.isOpen(),false);
  await f.advance(300);assert.equal(f.campaign.report().suspended,false);
  await f.run(f.campaign.openIntel());assert.equal(f.window.__warzoneIntelligence.report().open,true);
 });
 await check('Mission briefings waits for preview retirement, then hands F5 to original native UI',async()=>{
  const f=campaignFixture();await f.run(f.campaign.openIntel());await f.advance(60);
  const before=f.requests.length;assert.equal(await f.run(f.campaign.openBriefings()),true);
  assert.equal(f.window.__warzoneIntelligence.isOpen(),false);assert(f.requests.slice(before).some(r=>r.action==='close'));
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='native-key'&&call[1]==='F5').length,1);
  assert.equal(f.requests.filter(r=>r.action==='open').length,1,'synthetic F5 must bypass custom reader');
  f.update({worldSafe:false,intelligenceOpen:true,nativeMenuOpen:true,paused:true});f.campaign.poll();
  assert.equal(f.campaign.nativeUiActive(),true);assert.equal(f.campaign.handleBack(),true);
  assert(f.calls.some(call=>Array.isArray(call)&&call[0]==='native-key'&&call[1]==='Escape'));
 });
 await check('Research, Build and Save handoffs wait for close and preserve their destination focus',async()=>{
  for(const destination of ['research','build','save']){
   const f=campaignFixture();await f.run(f.campaign.openIntel());let clicks=0;
   const command={closest:()=>command,click(){clicks++;if(destination==='research')f.research.open=true;else if(destination==='build')f.commands.buildOpen=true;else f.window.WarzoneSavedGames.busy=true;}};
   const event={target:command,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
   for(const fn of f.listeners.get('doc:click')||[])fn(event);
   assert.equal(clicks,0);assert.equal(event.prevented,true);await f.advance(120);assert.equal(clicks,1);assert.equal(f.window.__warzoneIntelligence.isOpen(),false);
  }
 });
 await check('Actual pointerup control binder reproduces the previous duplicate toggle, and every Campaign handoff now activates once',async()=>{
  const before=fs.readFileSync(path.join(root,'archive/intelligence-before-handoff-0.54.js'),'utf8');
  const old=campaignFixture(before);await old.run(old.campaign.openIntel());const broken=toolbarFixture(old,'research');
  broken.dispatch('pointerdown');broken.dispatch('pointerup');broken.dispatch('touchend');broken.dispatch('click',{detail:1});await old.advance(150);
  assert.equal(broken.activations(),2,'pre-fix fixture must reproduce actual pointerup + replay double-toggle');assert.equal(old.research.open,false);
  for(const destination of ['research','manufacturing','build','save','unit-drawer']){
   const f=campaignFixture();await f.run(f.campaign.openIntel());const toolbar=toolbarFixture(f,destination);
   toolbar.dispatch('pointerdown');toolbar.dispatch('pointerup');toolbar.dispatch('touchend');toolbar.dispatch('click',{detail:1});
   assert.equal(toolbar.activations(),0,'destination must wait native close acknowledgement');await f.advance(150);
   assert.equal(toolbar.activations(),1,destination+' activates once');assert.equal(f.window.__warzoneIntelligence.isOpen(),false);
   toolbar.dispatch('touchend');toolbar.dispatch('click',{detail:1});await f.advance(80);assert.equal(toolbar.activations(),1,'late compatibility events cannot reactivate '+destination);
  }
 });
 await check('Cancelled reader-to-toolbar touch does not activate; mission reset cancels a pending handoff',async()=>{
  const f=campaignFixture();await f.run(f.campaign.openIntel());const toolbar=toolbarFixture(f,'research');
  toolbar.dispatch('pointerdown');toolbar.dispatch('pointercancel');toolbar.dispatch('touchend');toolbar.dispatch('click',{detail:1});await f.advance(100);
  assert.equal(toolbar.activations(),0);assert.equal(f.window.__warzoneIntelligence.report().open,true);
  f.held.add('close');toolbar.dispatch('pointerdown');toolbar.dispatch('pointerup');await f.advance(50);
  const oldClose=f.requests.filter(r=>r.action==='close').at(-1);assert(oldClose);
  f.campaign.accept({mode:'campaign',session:'cam1b-handoff-reset',mission:'cam1b',gameTime:0});f.respond(oldClose);await f.advance(120);
  assert.equal(toolbar.activations(),0);assert.equal(f.window.__warzoneIntelligence.isOpen(),false);
 });
 await check('Mission/load reset rejects pending old report replies without leaking old model or history',async()=>{
  const f=campaignFixture();f.held.add('open');const pending=f.campaign.openIntel();await f.advance(80);
  const old=f.requests.find(r=>r.action==='open');assert(old);
  f.campaign.accept({mode:'campaign',session:'cam1b-new',mission:'cam1b',gameTime:0});
  f.respond(old);assert.equal(await f.run(pending),false);assert.equal(f.window.__warzoneIntelligence.isOpen(),false);
  assert.equal(f.window.__warzoneIntelligence.report().history.length,0);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);
  f.held.delete('open');f.nativeClock(50000);await f.run(f.campaign.openIntel());assert.equal(f.window.__warzoneIntelligence.report().open,true);
 });
 await check('Automatic native videos and transport panels retire reader without injecting Escape/F5',async()=>{
  for(const panel of ['video','transport']){
   const f=campaignFixture();await f.run(f.campaign.openIntel());
   f.update(panel==='video'?{worldSafe:false,video:true}:{worldSafe:false,transportOpen:true,nativeMenuOpen:true});f.campaign.poll();
   assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);await f.advance(100);
   assert.equal(f.window.__warzoneIntelligence.isOpen(),false);assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='native-key').length,0);
  }
 });
 const paths=['app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java','app/src/main/assets/warzone-intelligence.js','app/src/main/assets/warzone-campaign-hud.js','tools/check-campaign-intelligence-054.cjs'];
 const result={version:'0.54',passed:true,checks,checksPassed:checks.length,emulatorUsed:false,nativeEngineExecuted:false,scope:'Actual Campaign HUD/reader JavaScript with bounded DOM and native-response stubs; model rendering, audio and native briefing playback remain emulator checks.',sources:paths.map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}))};
 fs.mkdirSync(path.join(root,'archive/campaign-0.54'),{recursive:true});fs.writeFileSync(path.join(root,'archive/campaign-0.54/intelligence-js-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
