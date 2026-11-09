'use strict';
/* Bounded VM fixtures of actual source. No browser, emulator or native gameplay. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const names=['app/src/main/assets/warzone/rewards.js','app/src/main/assets/warzone-html-session.js',
  'app/src/main/assets/warzone-command-pages.js','app/src/main/assets/warzone-touch-controls.js',
  'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java','tools/check-rewards-web-026.cjs'];
const hash=name=>createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
const sources=names.map(name=>({path:name,sha256:hash(name)}));
const rewardSource=read(names[0]),sessionSource=read(names[1]),commandSource=read(names[2]),touchSource=read(names[3]);
const clone=x=>JSON.parse(JSON.stringify(x)),checks=[];
const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function events(window){
  const listeners=new Map();
  window.addEventListener=(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);};
  window.dispatchEvent=event=>{for(const fn of listeners.get(event.type)||[])fn(event);return true;};
}
function rewardFixture(options={}){
  const timers=new Map(),timeouts=new Map(),calls=[],exitCallbacks=[],pending=deferred(),inventory=deferred(),fresh=deferred(),closing=deferred();let serial=0;
  const config={session:'web-fixture',balance:350,items:{fortress:3,hellstorm:20},research:true,supply:true,...options.config};
  const caption={textContent:''},laserCaption={textContent:''},elements=new Map();
  elements.set('blocknight-rewards',{querySelector:()=>caption,setAttribute:(name,value)=>calls.push({kind:'attribute',name,value})});
  elements.set('blocknight-lassat',{style:{},querySelector:()=>laserCaption,setAttribute(){}});
  const document={getElementById:id=>elements.get(id)||null,body:{appendChild:node=>elements.set(node.id,node)},
    createElement:()=>({style:{},setAttribute(){},remove(){elements.delete(this.id);}})};
  const native={lasSats:[]},navigation={revision:0};
  const window={parent:{document},__towersHtml:{session:'web-fixture',isActive:()=>options.active!==false},
    WarzoneTerrain:{pick:()=>({x:15.4,y:17.6})},
    __warzoneCommands:{send:(action,data,sendOptions)=>{calls.push({kind:'send',action,data:clone(data||{}),options:clone(sendOptions||{})});
      if(action==='apply-rewards')return pending.promise;
      if(action==='reward-inventory')return inventory.promise;
      if(action==='reward-lassat')return Promise.resolve(options.laserReply||{ok:true});
      if(action==='state'&&sendOptions?.fresh)return options.deferFresh?fresh.promise:Promise.resolve(options.freshReply||{ok:true,result:{rewards:clone(native)}});
      return Promise.resolve({ok:true});},report:()=>({snapshot:{rewards:native}}),
      navigationRevision:()=>navigation.revision,
      afterBuildExit:fn=>{calls.push({kind:'build-exit'});window.WarzoneRewards?.cancelTarget?.();++navigation.revision;
        if(options.deferExit)return closing.promise;
        if(options.immediateExit)return Promise.resolve(options.exitAllowed===false?false:fn());exitCallbacks.push(fn);}},
    BlockNightAndroid:{rewardConfig:()=>JSON.stringify(config),rewardApplied:session=>{calls.push({kind:'persist',session});return options.persist!==false;},
      rewardFailed:(session,error)=>calls.push({kind:'failure',session,error}),showRewards:session=>calls.push({kind:'show',session}),
      rewardInventorySnapshot:(session,packet)=>{calls.push({kind:'inventory-persist',session,packet:JSON.parse(packet)});return options.inventoryPersist!==false;},
      showNotice:message=>calls.push({kind:'notice',message})}};
  if(options.duel)window.__warzoneDuelConfig={mode:'duel'};
  events(window);
  const context={window,document,Promise,setInterval:fn=>{timers.set(++serial,fn);return serial;},clearInterval:id=>timers.delete(id),
    setTimeout:fn=>{timeouts.set(++serial,fn);return serial;},clearTimeout:id=>timeouts.delete(id)};
  vm.runInNewContext(rewardSource,context,{filename:names[0]});
  return{window,api:window.WarzoneRewards,timers,timeouts,calls,config,pending,inventory,fresh,closing,navigation,caption,laserCaption,elements,native,exitCallbacks,
    async tick(){for(const fn of [...timers.values()])fn();await settle();},
    async end(){window.dispatchEvent({type:'warzone-battle-ended'});await settle();},
    async accept(reply={ok:true,result:{ok:true,session:'web-fixture'}}){pending.resolve(reply);await settle();}};
}
function sessionFixture(options={}){
  const calls=[],document={getElementById:()=>null},quote=deferred();
  const window={parent:{document,WarzoneHost:{setPlaying:()=>calls.push({kind:'playing'}),endBattle:()=>calls.push({kind:'end-host'})}},
    __kalaWarzoneTouch:{setBattleActive:on=>calls.push({kind:'touch',on}),releaseAll:()=>{calls.push({kind:'release'});return false;},cancelFacilityNavigation(){}},
    WarzoneBuildDisplay:{reset:()=>calls.push({kind:'reset'})},WarzoneRewards:{waveCredited:amount=>calls.push({kind:'wave-credit',amount}),
      cancelTarget:()=>Boolean(options.cancelTarget),prepareExit:()=>{calls.push({kind:'quote'});return quote.promise;}},
    BlockNightAndroid:{rewardProgress:(session,packet)=>{calls.push({kind:'progress',session,packet:JSON.parse(packet)});return options.credited||0;},
      battleWon:session=>calls.push({kind:'won',session}),battleFinished:session=>calls.push({kind:'lost',session}),
      battleExited:session=>calls.push({kind:'exited',session}),confirmReturnToMainMenu:session=>calls.push({kind:'confirm',session})}};
  if(options.duel)window.__warzoneDuelConfig=Object.freeze({mode:'duel',humanBranch:'cannon',botBranch:'rockets'});
  events(window);const console={log(){},warn(){},error(){}};
  class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
  vm.runInNewContext(sessionSource,{window,document,console,CustomEvent,URLSearchParams,Promise,
    location:{search:'?battle_session=session-fixture'}},{filename:names[1]});
  return{window,api:window.__towersHtml,calls,console,quote};
}
function extractFunction(name){
  const start=commandSource.indexOf('function '+name+'(');assert.ok(start>=0,'Actual function missing: '+name);
  const brace=commandSource.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=brace;i<commandSource.length;i++){
    const ch=commandSource[i],next=commandSource[i+1];
    if(line){if(ch==='\n')line=false;continue;}
    if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}
    if(ch==='/'&&next==='/'){line=true;i++;continue;}if(ch==='/'&&next==='*'){block=true;i++;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;if(ch==='}'&&--depth===0)return commandSource.slice(start,i+1);
  }
  throw Error('Actual function does not terminate: '+name);
}
function placementFixture({natural=false,itemId='X-Super-Cannon',kind='FORTRESS',paid=true}={}){
  const state={nativeMenu:'build',nativeToolReady:true,exitingBuild:false,nativeItem:itemId,cancelSerial:0,
    nativeBuildGroup:[11,12],siteChecks:0,nativePendingSites:[],session:'placement',
    placement:{id:itemId,category:'DEFENCES',kind},catalog:{buildings:[{id:itemId,kind}]},
    snapshot:{rewards:{nativeItems:paid?{[itemId]:'test_item'}:{},natural:{test_item:natural}}}};
  const calls=[],window={WarzoneTerrain:{pick:()=>({x:15,y:17})}};
  const context={state,window,polishedTowers:true,Date,Promise,notify:text=>calls.push({kind:'notice',text}),reason:r=>r,
    send:(action,data)=>{calls.push({kind:'send',action,data:clone(data)});return Promise.resolve({ok:true});},
    requestState:()=>calls.push({kind:'state'}),flushNativeSites:()=>{
      for(const p of state.nativePendingSites.splice(0))calls.push({kind:'native-click',point:p});},
    setTimeout:()=>{throw Error('Unexpected delayed native-tool fixture path');}};
  vm.createContext(context);vm.runInContext(['rewardBuilding','rewardFortress','canLinePlace','queueNativeSite'].map(extractFunction).join('\n'),context);
  return{context,state,calls};
}
async function ready(options={}){const f=rewardFixture(options);await f.tick();await f.accept();assert.equal(f.api.ready,true);return f;}
async function check(name,run){await run();checks.push({name,passed:true});}
(async()=>{
  await check('Bulk native item quantities pass unchanged; native and durable phone acknowledgements gate readiness',async()=>{
    const f=rewardFixture();assert.equal(f.api.ready,false);await f.tick();await f.tick();
    const apply=f.calls.filter(c=>c.action==='apply-rewards');assert.equal(apply.length,1);
    assert.deepEqual(apply[0].data.rewards,{session:'web-fixture',items:{fortress:3,hellstorm:20},research:true,supply:true});
    assert.equal(f.calls.some(c=>c.kind==='persist'),false);await f.accept();assert.equal(f.api.ready,true);
    await f.tick();assert.equal(f.calls.filter(c=>c.action==='apply-rewards').length,1);
    assert.equal(f.calls.filter(c=>c.kind==='persist').length,1);assert.equal(f.caption.textContent,'REWARDS 350');
  });
  await check('Malformed quantities, stale sessions, native rejection and failed durable acknowledgement fail closed',async()=>{
    for(const quantity of [0,-1,1.5,1000,'5']){
      const f=rewardFixture({config:{items:{hellstorm:quantity}}});await f.tick();assert.equal(f.api.ready,false);
      assert.equal(f.calls.some(c=>c.action==='apply-rewards'),false);assert.equal(f.calls.filter(c=>c.kind==='failure').length,1);
    }
    const stale=rewardFixture({config:{session:'stale'}});await stale.tick();assert.equal(stale.calls.some(c=>c.action==='apply-rewards'),false);
    for(const options of [{},{persist:false}]){
      const f=rewardFixture(options);await f.tick();await f.accept(options.persist===false?undefined:{ok:false,reason:'reward-session-conflict'});
      assert.equal(f.api.ready,false);assert.equal(f.calls.filter(c=>c.kind==='failure').length,1);
      await f.tick();assert.equal(f.calls.filter(c=>c.action==='apply-rewards').length,1);
    }
    const wrong=rewardFixture();await wrong.tick();await wrong.accept({ok:true,result:{ok:true,session:'stale'}});
    assert.equal(wrong.api.ready,false);assert.equal(wrong.calls.some(c=>c.kind==='persist'),false);
  });
  await check('Rewards stays read-only in-game and opens only after Build exit',async()=>{
    const f=rewardFixture();f.api.open();assert.equal(f.exitCallbacks.length,0);await f.tick();await f.accept();
    f.api.open();assert.equal(f.calls.some(c=>c.kind==='show'),false);assert.equal(f.exitCallbacks.length,1);
    f.exitCallbacks[0]();assert.deepEqual(f.calls.filter(c=>c.kind==='show'),[{kind:'show',session:'web-fixture'}]);
    assert.equal(f.calls.some(c=>c.action==='buy-rewards'||c.action==='equip-rewards'),false);
  });
  await check('Exit quote is fetched once and synchronously forwarded to durable phone inventory before resolving',async()=>{
    const f=await ready();const quote={session:'web-fixture',applied:true,remaining:{fortress:2,hellstorm:18},completedWaves:[1,2]};
    const first=f.api.prepareExit(),second=f.api.prepareExit();await settle();
    assert.equal(f.calls.filter(c=>c.action==='reward-inventory').length,1);assert.equal(f.calls.some(c=>c.kind==='inventory-persist'),false);
    f.inventory.resolve({ok:true,result:quote});assert.equal(await first,true);assert.equal(await second,true);
    assert.deepEqual(f.calls.find(c=>c.kind==='inventory-persist'),{kind:'inventory-persist',session:'web-fixture',packet:quote});
    assert.equal(f.timeouts.size,0);
  });
  await check('Inventory stale/error/timeout/phone-save failure returns false and never forwards an invalid snapshot',async()=>{
    for(const reply of [{ok:false},{ok:true,result:{session:'stale'}}]){
      const f=await ready();const task=f.api.prepareExit();f.inventory.resolve(reply);assert.equal(await task,false);
      assert.equal(f.calls.some(c=>c.kind==='inventory-persist'),false);
    }
    const failed=await ready({inventoryPersist:false}),task=failed.api.prepareExit();
    failed.inventory.resolve({ok:true,result:{session:'web-fixture',remaining:{}}});assert.equal(await task,false);
    const timeout=await ready(),timed=timeout.api.prepareExit();for(const fn of [...timeout.timeouts.values()])fn();
    assert.equal(await timed,false);assert.equal(timeout.calls.some(c=>c.kind==='inventory-persist'),false);assert.equal(timeout.timeouts.size,0);
  });
  await check('Dispose ignores late apply/inventory results and clears polling/notification state',async()=>{
    const pending=rewardFixture();await pending.tick();await pending.end();await pending.accept();
    assert.equal(pending.api.ready,false);assert.equal(pending.timers.size,0);assert.equal(pending.calls.some(c=>c.kind==='persist'),false);
    const f=await ready();f.api.waveCredited(5);assert.equal(f.elements.get('wt-wave-crystals').textContent,'+5 crystals');
    const task=f.api.prepareExit();await f.end();f.inventory.resolve({ok:true,result:{session:'web-fixture',remaining:{}}});
    assert.equal(await task,false);assert.equal(f.calls.some(c=>c.kind==='inventory-persist'),false);
    assert.equal(f.elements.has('wt-wave-crystals'),false);f.api.open();assert.equal(f.exitCallbacks.length,0);
  });
  await check('Actual cleared-wave IDs and remaining quote are forwarded before terminal settlement, without inferring clears from wave number',async()=>{
    for(const phase of ['defeated','victory']){
      const h=sessionFixture({credited:5}),packet={mode:'tower-defense',phase,wave:25,completedWaves:[1,4],rewards:{session:'session-fixture',remaining:{hellstorm:12}}};
      h.api.nativeOutput('BNWAVE:'+JSON.stringify(packet));h.console.log('BNWAVE:'+JSON.stringify(packet));
      const progress=h.calls.findIndex(c=>c.kind==='progress'),end=h.calls.findIndex(c=>c.kind===(phase==='victory'?'won':'lost'));
      assert.ok(progress>=0&&end>progress);assert.deepEqual(h.calls[progress].packet,{wave:25,phase,completedWaves:[1,4],rewards:packet.rewards});
      assert.equal(h.calls.filter(c=>c.kind==='progress').length,1);assert.equal(h.calls.filter(c=>c.kind==='won'||c.kind==='lost').length,1);
      assert.deepEqual(h.calls.filter(c=>c.kind==='wave-credit'),[{kind:'wave-credit',amount:5}]);
    }
    const h=sessionFixture();h.api.nativeOutput('BNWAVE:'+JSON.stringify({mode:'tower-defense',phase:'active',wave:25}));
    assert.deepEqual(h.calls.find(c=>c.kind==='progress').packet.completedWaves,[]);
    assert.equal(h.calls.some(c=>c.kind==='wave-credit'),false);
  });
  await check('Confirmed Home return waits for the inventory quote and accepts one return request',async()=>{
    const h=sessionFixture();h.api.nativeOutput('BNWAVE:'+JSON.stringify({mode:'tower-defense',phase:'active',wave:1}));
    await h.api.back();assert.equal(h.calls.filter(c=>c.kind==='confirm').length,1);
    assert.equal(h.api.returnToMainMenu('session-fixture'),true);assert.equal(h.api.returnToMainMenu('session-fixture'),false);
    assert.equal(h.calls.filter(c=>c.kind==='quote').length,1);assert.equal(h.calls.some(c=>c.kind==='exited'),false);
    h.quote.resolve(true);await settle();assert.equal(h.calls.filter(c=>c.kind==='exited').length,1);assert.equal(h.api.isEnded(),true);
    const rejected=sessionFixture();rejected.api.nativeOutput('BNWAVE:'+JSON.stringify({mode:'tower-defense',phase:'active',wave:1}));
    await rejected.api.back();rejected.api.returnToMainMenu('session-fixture');rejected.quote.reject(Error('native quote failed'));
    await settle();assert.equal(rejected.calls.filter(c=>c.kind==='exited').length,1);
  });
  await check('Back cancels satellite targeting before opening another menu',async()=>{
    const h=sessionFixture({cancelTarget:true});h.api.nativeOutput('BNWAVE:'+JSON.stringify({mode:'tower-defense',phase:'active',wave:1}));
    await h.api.back();assert.equal(h.calls.some(c=>c.kind==='confirm'||c.kind==='quote'||c.kind==='exited'),false);
    const f=await ready({immediateExit:true});f.native.lasSats=[{selected:true,ready:true}];await f.api.armLaser();
    assert.equal(f.api.report().laserTarget,true);assert.equal(f.api.cancelTarget(),true);assert.equal(f.api.cancelTarget(),false);
    assert.equal(f.api.handleTap(5,5),false);
  });
  await check('Satellite arms only from the selected ready native-post quote and fires only after a terrain target',async()=>{
    const f=await ready({immediateExit:true});assert.equal(f.api.handleTap(50,60),false);
    await f.api.armLaser();assert.equal(f.api.report().laserTarget,false);
    f.native.lasSats=[{selected:false,ready:true}];await f.api.armLaser();assert.equal(f.api.report().laserTarget,false);
    f.native.lasSats=[{selected:true,ready:false,remainingMs:1200}];await f.api.armLaser();assert.equal(f.api.report().laserTarget,false);
    f.native.lasSats=[{selected:true,ready:true}];await f.api.armLaser();assert.equal(f.api.report().laserTarget,true);
    f.window.WarzoneTerrain.pick=()=>null;assert.equal(f.api.handleTap(50,60),true);assert.equal(f.calls.some(c=>c.action==='reward-lassat'),false);
    f.window.WarzoneTerrain.pick=()=>({x:15.4,y:17.6});assert.equal(f.api.handleTap(50,60),true);await settle();
    assert.deepEqual(f.calls.find(c=>c.action==='reward-lassat').data,{x:15,y:18});assert.equal(f.api.report().laserTarget,false);
    assert.equal(f.api.handleTap(50,60),false);
  });
  await check('Satellite arming requires successful Build exit and a fresh successful state reply',async()=>{
    const failedExit=await ready({immediateExit:true,exitAllowed:false});failedExit.native.lasSats=[{selected:true,ready:true}];
    await failedExit.api.armLaser();assert.equal(failedExit.api.report().laserTarget,false);
    assert.equal(failedExit.calls.some(c=>c.action==='state'&&c.options.fresh),false);
    const failedState=await ready({immediateExit:true,freshReply:{ok:false}});failedState.native.lasSats=[{selected:true,ready:true}];
    await failedState.api.armLaser();assert.equal(failedState.api.report().laserTarget,false);assert.equal(failedState.api.report().laserArming,false);
    assert.equal(failedState.calls.filter(c=>c.action==='state'&&c.options.fresh).length,1);
  });
  await check('Newer navigation supersedes a pending fresh satellite query and its late acknowledgement cannot arm',async()=>{
    const f=await ready({immediateExit:true,deferFresh:true});const task=f.api.armLaser();await settle();
    assert.equal(f.api.report().laserArming,true);assert.equal(f.api.report().laserTarget,false);
    assert.equal(f.calls.filter(c=>c.action==='state'&&c.options.fresh).length,1);++f.navigation.revision;
    f.fresh.resolve({ok:true,result:{rewards:{lasSats:[{selected:true,ready:true}]}}});await task;
    assert.equal(f.api.report().laserTarget,false);assert.equal(f.api.report().laserArming,false);assert.equal(f.api.handleTap(50,60),false);
  });
  await check('Back cancels pending satellite arming and ignores the late fresh state acknowledgement',async()=>{
    const f=await ready({immediateExit:true,deferFresh:true});const task=f.api.armLaser();await settle();
    assert.equal(f.api.report().laserArming,true);assert.equal(f.api.cancelTarget(),true);
    f.fresh.resolve({ok:true,result:{rewards:{lasSats:[{selected:true,ready:true}]}}});await task;
    assert.equal(f.api.report().laserArming,false);assert.equal(f.api.report().laserTarget,false);assert.equal(f.api.handleTap(50,60),false);
    assert.equal(f.calls.some(c=>c.action==='reward-lassat'),false);
  });
  await check('Back also cancels satellite arming while Build exit is pending; late close never requests or arms targeting',async()=>{
    const f=await ready({deferExit:true});const task=f.api.armLaser();
    assert.equal(f.api.report().laserArming,true);assert.equal(f.api.cancelTarget(),true);
    f.closing.resolve(true);await task;assert.equal(f.api.report().laserArming,false);assert.equal(f.api.report().laserTarget,false);
    assert.equal(f.calls.some(c=>c.action==='state'&&c.options.fresh),false);assert.equal(f.api.handleTap(50,60),false);
    assert.equal(f.calls.some(c=>c.action==='reward-lassat'),false);
  });
  await check('Native satellite rejection is reported and targeting ends; no stock click is required',async()=>{
    for(const reason of ['lassat-select-required','lassat-cooling','lassat-target-missing','lassat-rejected']){
      const f=await ready({immediateExit:true,laserReply:{ok:false,reason}});f.native.lasSats=[{selected:true,ready:true}];
      await f.api.armLaser();f.api.handleTap(50,60);await settle();assert.equal(f.api.report().laserTarget,false);
      assert.equal(f.calls.filter(c=>c.action==='reward-lassat').length,1);assert.equal(f.calls.at(-2).kind,'notice');
      assert.notEqual(f.calls.at(-2).message,'The laser satellite could not fire. Select the post and choose a visible enemy.');
      assert.equal(f.calls.at(-1).action,'state');
    }
  });
  await check('Purchased fortress lines are disabled, while ordinary, naturally unlocked and purchased non-fortress defence lines remain',async()=>{
    const paid=placementFixture();assert.equal(paid.context.rewardBuilding('X-Super-Cannon'),true);assert.equal(paid.context.rewardFortress('X-Super-Cannon'),true);
    assert.equal(paid.context.canLinePlace(),false);
    assert.equal(placementFixture({natural:true}).context.canLinePlace(),true);
    assert.equal(placementFixture({paid:false,itemId:'GuardTower1',kind:'DEFENSE'}).context.canLinePlace(),true);
    assert.equal(placementFixture({itemId:'Emplacement-RotHow',kind:'DEFENSE'}).context.canLinePlace(),true);
  });
  await check('Purchased building taps reserve native quotas through queue-build; natural/unpaid paths preserve native Ctrl-click ownership',async()=>{
    for(const f of [placementFixture(),placementFixture({itemId:'Emplacement-RotHow',kind:'DEFENSE'})]){
      f.context.queueNativeSite(100,200);await settle();assert.equal(f.calls.find(c=>c.kind==='send').action,'queue-build');
      assert.deepEqual(f.calls.find(c=>c.kind==='send').data.workerIds,[11,12]);assert.equal(f.calls.some(c=>c.kind==='native-click'),false);assert.equal(f.state.siteChecks,0);
    }
    for(const f of [placementFixture({natural:true}),placementFixture({paid:false,itemId:'GuardTower1',kind:'DEFENSE'})]){
      f.context.queueNativeSite(100,200);await settle();assert.equal(f.calls.find(c=>c.kind==='send').action,'track-site');
      assert.equal(f.calls.filter(c=>c.kind==='native-click').length,1);assert.equal(f.state.siteChecks,0);
    }
  });
  await check('Dormant Duel has no portable reward module or reward-progress forwarding',async()=>{
    const f=rewardFixture({duel:true});assert.equal(f.api,undefined);assert.equal(f.timers.size,0);assert.equal(f.calls.length,0);
    const h=sessionFixture({duel:true});h.api.nativeOutput('BNDUEL:'+JSON.stringify({mode:'duel',phase:'active',humanBranch:'cannon',botBranch:'rockets',wave:10}));
    assert.equal(h.api.isActive(),true);assert.equal(h.calls.some(c=>c.kind==='progress'),false);
    const unrelated=sessionFixture();unrelated.api.nativeOutput('BNWAVE:'+JSON.stringify({mode:'duel',phase:'active',wave:10}));
    assert.equal(unrelated.api.isActive(),false);assert.equal(unrelated.calls.length,0);
  });
  // Java and touch-routing are inspected, not executed as Android/input fixtures.
  const java=read(names[4]);
  assert.match(java,/if \(inGame && \(isDuelBattle\(\)[\s\S]{0,180}loadingOverlay != null \|\| graphicsSetup != null\)\) return;/);
  assert.equal((java.match(/if \(inGame \|\| graphicsSetup == null \|\| rewardsView == null\) return;/g)||[]).length,2);
  assert.match(java,/if \(!completeRewardQuote\(session, quote\)\) return false;/);
  assert.match(touchSource,/!canceled && !gesture\.moved && isBattlefieldPoint\(gesture\.x,gesture\.y\)\s*&& window\.WarzoneRewards\?\.handleTap\?\.\(gesture\.x,gesture\.y\)/);
  assert.ok(sources.every(entry=>hash(entry.path)===entry.sha256),'Checked sources changed during fixtures');
  const report={scope:'Bounded Node VM fixtures execute actual reward/session source and extracted actual placement helpers using mocked native/Android replies. No native firing, construction, wallet storage, real wave clearing, browser, emulator or gameplay verified. Java guards and touch routing are source-inspected only.',
    emulatorUsed:false,screensVerified:false,gameplayVerified:false,androidPersistenceExecuted:false,passed:checks.length,checks,sources,
    sourceAuditOnly:['Java in-game buy/equip are read-only','Inventory quote completeness gates return','Touch target precedes ordinary world/facility taps and is limited to stationary battlefield touch']};
  fs.writeFileSync(path.join(root,'archive/rewards-web-0.26-checks.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({emulatorUsed:false,gameplayVerified:false,passed:checks.length,checks},null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
