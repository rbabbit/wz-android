'use strict';
/* Bounded source VM fixtures; mocked Android/native replies are not runtime QA. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const reportPath=path.join(root,'archive/rewards-web-0.28-checks.json');
if(fs.existsSync(reportPath))fs.unlinkSync(reportPath);
const unhandled=[];process.on('unhandledRejection',error=>unhandled.push(error));
const names=['app/src/main/assets/warzone/rewards.js','app/src/main/assets/warzone/saved-games.js',
  'app/src/main/assets/warzone-html-session.js','app/src/main/assets/warzone-touch-controls.js',
  'app/src/main/assets/warzone-command-pages.js','app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
  'tools/check-rewards-web-028.cjs'];
const hash=name=>createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
const sources=names.map(name=>({path:name,sha256:hash(name)})),checks=[];
const rewardsSource=read(names[0]),savesSource=read(names[1]),sessionSource=read(names[2]);
const clone=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const DOC='new-web-document',RUN='original-saved-run',SLOT='wt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function events(window){const all=new Map();window.addEventListener=(name,fn)=>{if(!all.has(name))all.set(name,[]);all.get(name).push(fn);};
  window.dispatchEvent=event=>{for(const fn of all.get(event.type)||[])fn(event);return true;};}
function transaction(id='stable-transaction'){return{session:RUN,transactionId:id,items:{hellstorm:5},research:false,supply:false};}
function fixture(options={}){
  const calls=[],intervals=new Map(),timeouts=new Map(),elements=new Map(),persisted=new Set();let serial=0;
  const apply=deferred(),add=deferred(),inventory=deferred(),resume=deferred(),lifecycle={active:true};
  const config={session:RUN,balance:350,items:{fortress:2},research:false,supply:false,pendingTransactions:[],...clone(options.config||{})};
  function node(tag='div'){
    return{tagName:tag.toUpperCase(),style:{},children:[],attributes:{},hidden:false,textContent:'',
      setAttribute(name,value){this.attributes[name]=value;},
      appendChild(child){child.parentNode=this;this.children.push(child);if(child.id)elements.set(child.id,child);return child;},
      querySelector(selector){return selector==='span'?this.children.find(child=>child.tagName==='SPAN')||null:null;},
      remove(){elements.delete(this.id);if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);}};
  }
  const header=node('button');header.id='blocknight-rewards';const caption=node('span');header.appendChild(caption);elements.set(header.id,header);
  const laser=node('button');laser.id='blocknight-lassat';laser.appendChild(node('span'));elements.set(laser.id,laser);
  const body=node('body'),document={body,getElementById:id=>elements.get(id)||null,createElement:node};
  const native={ok:true,session:RUN,applied:true,remaining:{fortress:2},completedWaves:[],transactions:[],lasSats:[],baseConfig:{session:RUN,items:{fortress:2}}};
  const window={parent:{document,WarzoneHost:{}},__towersHtml:{session:DOC,isActive:()=>lifecycle.active,isEnded:()=>!lifecycle.active},
    constructWZModuleConfig:()=>({arguments:['--skirmish=WT-E01-T1'],preRun:[]}),
    wz_js_save_config_dir_to_persistent_storage:(user,callback)=>callback?.(),
    __warzoneCommands:{send:(action,data,sendOptions)=>{
      calls.push({kind:'send',action,data:clone(data||{}),options:clone(sendOptions||{})});
      if(action==='apply-rewards')return apply.promise;
      if(action==='add-rewards'){
        if(options.deferAdd)return add.promise;
        return Promise.resolve(options.addReply||{ok:true,result:{...clone(native),transactions:[data.rewards.transactionId],transactionId:data.rewards.transactionId,transactionApplied:true}});
      }
      if(action==='reward-inventory')return options.deferInventory?inventory.promise:Promise.resolve(options.inventoryReply||{ok:true,gameTime:12346,result:clone(native)});
      if(action==='resume-rewards')return options.deferResume?resume.promise:Promise.resolve({ok:true,result:{ok:true,session:RUN,resumed:true}});
      return Promise.resolve({ok:true,result:{rewards:clone(native)}});
    },report:()=>({snapshot:{rewards:native}}),afterBuildExit:fn=>Promise.resolve(fn()),navigationRevision:()=>0},
    BlockNightAndroid:{rewardConfig:doc=>{calls.push({kind:'config',doc});return JSON.stringify(config);},
      rewardApplied:doc=>{calls.push({kind:'applied',doc});return options.persist!==false;},
      rewardFailed:(doc,error)=>calls.push({kind:'failure',doc,error}),showRewards:doc=>calls.push({kind:'show',doc}),
      rewardInventorySnapshot:(doc,packet)=>{calls.push({kind:'exit-inventory',doc,quote:JSON.parse(packet)});return true;},
      rewardPurchaseResult:(doc,id,packet)=>{
        const quote=JSON.parse(packet);calls.push({kind:'purchase-result',doc,id,quote});
        const committed=quote.session===RUN&&(quote.transactions||[]).includes(id);
        const rejected=quote.session===RUN&&quote.rejected===true&&quote.transactionApplied!==true&&quote.transactionPending!==true;
        if(committed||rejected){config.pendingTransactions=config.pendingTransactions.filter(request=>request.transactionId!==id);if(committed)persisted.add(id);}
        return committed;
      },
      showNotice:message=>calls.push({kind:'notice',message}),
      savedGamePayload:doc=>{calls.push({kind:'saved-payload',doc});return JSON.stringify(options.savedPayload||{});},
      rewardResumeCaps:doc=>{calls.push({kind:'resume-caps',doc});return JSON.stringify({session:RUN,items:{fortress:2},remaining:{fortress:1}});},
      savedGameRestored:(doc,id,packet)=>{calls.push({kind:'restored',doc,id,proof:JSON.parse(packet)});return options.restorePersist!==false;}}};
  events(window);if(options.duel)window.__warzoneDuelConfig={mode:'duel'};
  const context={window,document,Promise,URLSearchParams,TextDecoder,Uint8Array,
    location:{search:'?battle_session='+DOC+'&map=beginner'},
    atob:value=>Buffer.from(value,'base64').toString('binary'),btoa:value=>Buffer.from(value,'binary').toString('base64'),
    setInterval:fn=>{intervals.set(++serial,fn);return serial;},clearInterval:id=>intervals.delete(id),
    setTimeout:fn=>{timeouts.set(++serial,fn);return serial;},clearTimeout:id=>timeouts.delete(id)};
  const vmContext=vm.createContext(context);
  if(options.actualSaves)vm.runInContext(savesSource,vmContext,{filename:names[1]});
  else window.WarzoneSavedGames={loading:false,busy:Boolean(options.saving)};
  vm.runInContext(rewardsSource,vmContext,{filename:names[0]});
  return{window,api:window.WarzoneRewards,calls,config,native,persisted,apply,add,inventory,resume,intervals,timeouts,lifecycle,header,caption,body,elements,
    async tick(){for(const fn of [...intervals.values()])fn();await settle();},
    async accept(reply={ok:true,result:{ok:true,session:RUN}}){apply.resolve(reply);await settle();},
    async end(){lifecycle.active=false;window.dispatchEvent({type:'warzone-battle-ended'});await settle();},
    hydrate(){const module={FS:{mkdirTree:path=>calls.push({kind:'mkdir',path}),writeFile:(path,bytes)=>calls.push({kind:'hydrate',path,bytes:Array.from(bytes)}),syncfs:(populate,callback)=>callback()},
      WZVAL_configDirPath:'/fixture-config',removeRunDependency:id=>calls.push({kind:'dependency',id})};
      window.Module=module;
      const config=window.constructWZModuleConfig();for(const fn of config.preRun)fn(module);module.removeRunDependency('persistent_warzone2100_config_dir');return config;}};
}
function savedPayload(){
  const encode=value=>Buffer.from(value).toString('base64');
  return{metadata:{id:SLOT,session:RUN,mapId:'beginner',gameTime:12345,nativeLevel:'WT-E01-T1'},
    files:{'gam.json':encode(JSON.stringify({gameTime:12345,levelName:'WT-E01-T1'})),
      'main.json':encode('{}'),'gameinfo.json':encode('{}'),'game.map':encode(Buffer.from([0,255,10])),
      'scriptstate.json':encode(JSON.stringify({player0:{wtreward_match:{session:RUN},warzoneTowersWaves_state:{wave:3}}}))}};
}
async function ready(options={}){const f=fixture(options);await f.tick();await f.accept();assert.equal(f.api.ready,true);return f;}
async function check(name,run){await run();checks.push({name,passed:true});}
(async()=>{
  await check('Fresh document identity remains distinct from the saved logical reward run in native and Android calls',async()=>{
    const f=fixture();await f.tick();assert.equal(f.api.ready,false);
    assert.equal(f.calls.find(c=>c.action==='apply-rewards').data.rewards.session,RUN);
    assert.equal(f.calls.filter(c=>c.kind==='config').every(c=>c.doc===DOC),true);
    await f.accept();assert.equal(f.api.ready,true);assert.equal(f.calls.find(c=>c.kind==='applied').doc,DOC);
    assert.equal(f.api.report().session,DOC);assert.equal(f.api.report().nativeSession,RUN);
    const invalid=fixture();await invalid.tick();await invalid.accept({ok:true,result:{ok:true,session:DOC}});
    assert.equal(invalid.api.ready,false);assert.equal(invalid.calls.some(c=>c.kind==='applied'),false);
  });
  await check('Live purchase sends one stable transaction, prevents concurrent sends and awaits durable journal confirmation',async()=>{
    const f=await ready({deferAdd:true}),request=transaction();f.config.pendingTransactions=[request];
    const pending=f.api.purchase(request);assert.equal(f.api.busy,true);assert.equal(await f.api.purchase(request),false);
    assert.equal(f.calls.filter(c=>c.action==='add-rewards').length,1);assert.deepEqual(f.calls.find(c=>c.action==='add-rewards').data.rewards,request);
    f.add.resolve({ok:true,result:{session:RUN,transactions:[request.transactionId],transactionId:request.transactionId,transactionApplied:true}});
    assert.equal(await pending,true);assert.equal(f.api.busy,false);assert.equal(f.persisted.has(request.transactionId),true);
    assert.equal(f.calls.find(c=>c.kind==='purchase-result').doc,DOC);assert.equal(f.config.pendingTransactions.length,0);
  });
  await check('Timeout keeps the same reserved transaction pending and never manufactures clean-rejection refund proof',async()=>{
    const f=await ready({addReply:{ok:false,reason:'timeout'}}),request=transaction();f.config.pendingTransactions=[request];
    assert.equal(await f.api.purchase(request),false);assert.equal(f.config.pendingTransactions.length,1);
    assert.deepEqual(f.calls.find(c=>c.kind==='purchase-result').quote,{session:RUN,transactionId:request.transactionId});
    assert.equal(f.calls.some(c=>c.kind==='purchase-result'&&c.quote.rejected===true),false);
    f.native.transactions=[request.transactionId];await f.api.reconcilePending(f.window.__warzoneCommands,DOC);
    assert.equal(f.config.pendingTransactions.length,0);assert.equal(f.calls.filter(c=>c.action==='add-rewards').length,1);
  });
  await check('Pending retry reconciles committed journal entries first and resends only the original uncommitted ID',async()=>{
    const committed=transaction('already-committed'),retry=transaction('same-id-retry');
    const f=await ready();f.config.pendingTransactions=[committed,retry];f.native.transactions=[committed.transactionId];
    await f.api.reconcilePending(f.window.__warzoneCommands,DOC);
    const sends=f.calls.filter(c=>c.action==='add-rewards');assert.equal(sends.length,1);assert.deepEqual(sends[0].data.rewards,retry);
    assert.equal(f.persisted.has(committed.transactionId),true);assert.equal(f.persisted.has(retry.transactionId),true);assert.equal(f.config.pendingTransactions.length,0);
  });
  await check('Native clean rejection is forwarded unchanged; stale logical requests and saving/busy state cannot buy',async()=>{
    const request=transaction(),f=await ready({addReply:{ok:false,result:{session:RUN,transactionId:request.transactionId,rejected:true,transactionApplied:false,transactionPending:false}}});
    f.config.pendingTransactions=[request];assert.equal(await f.api.purchase(request),false);
    assert.equal(f.calls.find(c=>c.kind==='purchase-result').quote.rejected,true);assert.equal(f.config.pendingTransactions.length,0);
    const saving=await ready({saving:true});assert.equal(await saving.api.purchase(request),false);assert.equal(saving.calls.some(c=>c.action==='add-rewards'),false);
    const stale=await ready();assert.equal(await stale.api.purchase({...request,session:'outgoing-run'}),false);assert.equal(stale.calls.some(c=>c.action==='add-rewards'),false);
  });
  await check('Pending startup transactions keep readiness closed until native and phone reconciliation complete',async()=>{
    const request=transaction(),f=fixture({config:{pendingTransactions:[request]},deferInventory:true});
    await f.tick();await f.accept();assert.equal(f.api.ready,false);assert.equal(f.calls.some(c=>c.action==='add-rewards'),false);
    f.inventory.resolve({ok:true,result:{session:RUN,transactions:[request.transactionId]}});await settle();
    assert.equal(f.api.ready,true);assert.equal(f.config.pendingTransactions.length,0);
    const unknown=fixture({config:{pendingTransactions:[request]},addReply:{ok:false,reason:'timeout'}});await unknown.tick();await unknown.accept();
    assert.equal(unknown.api.ready,false);assert.equal(unknown.calls.filter(c=>c.kind==='failure').length,1);
  });
  await check('Actual saved-game helper hydrates all native files before persistence dependency release and verifies resumed logical run before readiness',async()=>{
    const f=fixture({actualSaves:true,savedPayload:savedPayload(),deferResume:true}),launch=f.hydrate();
    assert.ok(launch.arguments.includes('--loadskirmish='+SLOT));assert.equal(launch.arguments.some(arg=>arg.startsWith('--skirmish=')),false);
    assert.equal(f.calls.filter(c=>c.kind==='hydrate').length,5);assert.ok(f.calls.findIndex(c=>c.kind==='hydrate')<f.calls.findIndex(c=>c.kind==='dependency'));
    await f.tick();await f.accept();assert.equal(f.api.ready,false);assert.equal(f.window.WarzoneSavedGames.ready,false);
    const request=f.calls.find(c=>c.action==='resume-rewards');assert.equal(request.data.rewards.session,RUN);
    f.resume.resolve({ok:true,result:{ok:true,session:RUN,resumed:true}});await settle();
    assert.equal(f.api.ready,true);assert.equal(f.window.WarzoneSavedGames.ready,true);
    const proof=f.calls.find(c=>c.kind==='restored');assert.equal(proof.doc,DOC);assert.equal(proof.id,SLOT);assert.equal(proof.proof.session,RUN);
    assert.equal(proof.proof.savedGameTime,12345);assert.equal(proof.proof.gameTime,12346);
  });
  await check('Unhydrated saves and failed resumed-state persistence keep both startup readiness gates closed',async()=>{
    const unhydrated=fixture({actualSaves:true,savedPayload:savedPayload()});await unhydrated.tick();await unhydrated.accept();
    assert.equal(unhydrated.api.ready,false);assert.equal(unhydrated.calls.some(c=>c.action==='resume-rewards'),false);
    const unsaved=fixture({actualSaves:true,savedPayload:savedPayload(),restorePersist:false});unsaved.hydrate();await unsaved.tick();await unsaved.accept();
    assert.equal(unsaved.api.ready,false);assert.equal(unsaved.window.WarzoneSavedGames.ready,false);assert.equal(unsaved.calls.filter(c=>c.kind==='failure').length,1);
  });
  await check('Actual saved-game busy getter blocks a live purchase while its save operation is draining input',async()=>{
    const f=fixture({actualSaves:true,savedPayload:savedPayload()});f.hydrate();await f.tick();await f.accept();
    assert.equal(f.window.WarzoneSavedGames.busy,false);const saving=f.window.WarzoneSavedGames.save();
    assert.equal(f.window.WarzoneSavedGames.busy,true);assert.equal(await f.api.purchase(transaction()),false);
    assert.equal(f.calls.some(c=>c.action==='add-rewards'),false);await f.end();assert.equal(await saving,false);
    assert.equal(f.window.WarzoneSavedGames.busy,false);
  });
  await check('A genuinely unresolved native purchase releases UI busy at the bounded acknowledgement deadline without refund proof',async()=>{
    const f=await ready({deferAdd:true}),request=transaction('never-resolving-native');f.config.pendingTransactions=[request];
    const task=f.api.purchase(request);await settle();assert.equal(f.api.busy,true);
    const timers=[...f.timeouts.values()];assert.ok(timers.length,'The reward layer must bound a native send that never resolves');
    for(const callback of timers)callback();await settle();
    assert.equal(await task,false);assert.equal(f.api.busy,false);
    assert.equal(f.config.pendingTransactions.length,1);assert.equal(f.config.pendingTransactions[0].transactionId,request.transactionId);
    const unknown=f.calls.find(c=>c.kind==='purchase-result');assert.ok(unknown,'Android must release its purchase view after an unknown result');
    assert.equal(unknown.quote.session,RUN);assert.equal(unknown.quote.transactionId,request.transactionId);
    assert.notEqual(unknown.quote.rejected,true);assert.equal(f.persisted.size,0);
  });
  await check('A late native committed journal settles the original reservation after the acknowledgement deadline',async()=>{
    const f=await ready({deferAdd:true}),request=transaction('late-committed-native');f.config.pendingTransactions=[request];
    const task=f.api.purchase(request);await settle();assert.ok(f.timeouts.size);
    for(const callback of [...f.timeouts.values()])callback();await settle();assert.equal(await task,false);
    f.add.resolve({ok:true,result:{session:RUN,transactions:[request.transactionId],transactionId:request.transactionId,transactionApplied:true}});await settle();
    assert.equal(f.persisted.has(request.transactionId),true);assert.equal(f.config.pendingTransactions.length,0);
    assert.equal(f.calls.filter(c=>c.action==='add-rewards').length,1,'Late acknowledgement never issues a second business purchase');
    const proofs=f.calls.filter(c=>c.kind==='purchase-result'&&(c.quote.transactions||[]).includes(request.transactionId));assert.equal(proofs.length,1);
  });
  await check('Retry after an unresolved acknowledgement reuses the original business transaction and releases busy after verified proof',async()=>{
    const f=await ready({deferAdd:true}),request=transaction('same-business-id-after-timeout');f.config.pendingTransactions=[request];
    const first=f.api.purchase(request);await settle();for(const callback of [...f.timeouts.values()])callback();await settle();assert.equal(await first,false);
    const retry=f.api.purchase(f.config.pendingTransactions[0]);await settle();assert.equal(f.api.busy,true);
    const sends=f.calls.filter(c=>c.action==='add-rewards');assert.equal(sends.length,2);assert.deepEqual(sends.map(c=>c.data.rewards),[request,request]);
    f.add.resolve({ok:true,result:{session:RUN,transactions:[request.transactionId],transactionId:request.transactionId,transactionApplied:true}});await settle();
    assert.equal(await retry,true);assert.equal(f.api.busy,false);assert.equal(f.persisted.size,1);assert.equal(f.config.pendingTransactions.length,0);
  });
  await check('An outgoing document ignores a native journal arriving after the purchase deadline',async()=>{
    const f=await ready({deferAdd:true}),request=transaction('late-after-retirement');f.config.pendingTransactions=[request];
    const task=f.api.purchase(request);await settle();for(const callback of [...f.timeouts.values()])callback();await settle();assert.equal(await task,false);
    const before=f.calls.filter(c=>c.kind==='purchase-result').length;await f.end();
    f.add.resolve({ok:true,result:{session:RUN,transactions:[request.transactionId],transactionId:request.transactionId,transactionApplied:true}});await settle();
    assert.equal(f.calls.filter(c=>c.kind==='purchase-result').length,before);assert.equal(f.persisted.size,0);
  });
  await check('Tiny +5 notice stays inside the Rewards header, reuses one small node and preserves its main span caption',async()=>{
    const f=await ready();f.api.waveCredited(5);const note=f.elements.get('wt-wave-crystals');
    assert.equal(note.tagName,'SMALL');assert.equal(note.parentNode,f.header);assert.equal(f.body.children.length,0);
    assert.equal(note.textContent,'+5 crystals');assert.equal(f.header.querySelector('span'),f.caption);assert.equal(f.caption.textContent,'REWARDS 350');
    assert.equal(note.style.cssText.includes('position:fixed'),false);assert.equal(note.style.cssText.includes('pointer-events:none'),true);
    f.api.waveCredited(5);assert.equal(f.elements.get('wt-wave-crystals'),note);assert.equal(f.header.children.length,2);
    for(const fn of [...f.timeouts.values()])fn();assert.equal(note.hidden,true);
  });
  await check('Exit inventories use the logical native session while phone callbacks remain document-bound; outgoing purchase results are ignored',async()=>{
    const f=await ready();assert.equal(await f.api.prepareExit(),true);assert.equal(f.calls.find(c=>c.kind==='exit-inventory').doc,DOC);
    assert.equal(f.calls.find(c=>c.kind==='exit-inventory').quote.session,RUN);
    const ended=await ready({deferAdd:true}),request=transaction();ended.config.pendingTransactions=[request];const task=ended.api.purchase(request);
    await ended.end();ended.add.resolve({ok:true,result:{session:RUN,transactions:[request.transactionId]}});assert.equal(await task,false);
    assert.equal(ended.calls.some(c=>c.kind==='purchase-result'),false);assert.equal(ended.intervals.size,0);
  });
  await check('Dormant Duel loads no rewards, saved-game wrapper or pollers',async()=>{
    const f=fixture({duel:true,actualSaves:true});assert.equal(f.api,undefined);assert.equal(f.window.WarzoneSavedGames,undefined);
    assert.equal(f.intervals.size,0);assert.equal(f.calls.length,0);
  });
  // Source inspections below do not execute Android or native touch controls.
  const touch=read(names[3]),java=read(names[5]);
  assert.match(touch,/makeButton\('blocknight-save', 'SAVE',[\s\S]{0,130}window\.WarzoneSavedGames\?\.save\?\.\(\)/);
  assert.match(java,/if \(session == null \|\| session\.isEmpty\(\) \|\| !session\.equals\(rewardSession\)/);
  assert.match(java,/return rewards\.config\(rewardRunId\);/);
  assert.match(java,/rewards\.completeLive\(rewardRunId, transactionId, packet\)/);
  assert.match(java,/if \(!rewards\.confirmResumeInventory\(rewardRunId, state\.getJSONObject\("rewards"\)\.toString\(\)\)\) return false;\s*loadingSave = null;/);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(unhandled.length,0,'Actual source produced an unhandled asynchronous rejection: '+unhandled.map(error=>error.stack||error).join('\n'));
  assert.ok(sources.every(source=>hash(source.path)===source.sha256),'Checked sources changed during fixtures');
  const report={version:'0.28',emulatorUsed:false,screensVerified:false,gameplayVerified:false,androidPersistenceExecuted:false,
    passed:checks.length,checks,sources,scope:'Bounded VM fixtures execute actual reward/saved-game source with mocked command/Android replies and an in-memory native FS. No browser layout, real QuickSave/load, native purchase effect, Android storage or gameplay verified.',
    sourceAuditOnly:['SAVE header routes to WarzoneSavedGames.save','Android rewards bridge guards document session and uses the separate logical rewardRunId','Phone completeLive receives the native quote','The validated native resume quote must commit to RewardStore before the saved-game payload/readiness is released']};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({emulatorUsed:false,gameplayVerified:false,passed:checks.length,checks},null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
