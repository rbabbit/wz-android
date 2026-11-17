'use strict';
// ROOT-RUN ONLY. Uses the already loaded exact APK and prepared native world.
// Actual CDP touch input drives ALL/cycle/Manufacture/Queue STOP. No debug input,
// save injection, grants, hooks, product changes or native API replacements.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const q=require('./device-086.cjs'),probe=require('./probe-manufacturing-086.cjs');
const W='document.getElementById("warzone-game-frame").contentWindow';
const clone=v=>JSON.parse(JSON.stringify(v)),family=probe.family;
function equipment(d){return d?.turrets?.length?d.turrets.slice():d?.weapons?.length?d.weapons.slice():[d?.construct,d?.repair,d?.brain,d?.ecm,d?.sensor].filter(id=>id&&!/null/i.test(id)).slice(0,1);}
function key(d){return JSON.stringify([d?.body,d?.propulsion,equipment(d)]);}
function compatible(f,t){return f.ready&&(f.templates||[]).includes(t.id);}
function matches(d,t){return Boolean(d)&&key(d)===key(t);}
function work(f,t){return matches(f.currentProduction,t)||matches(f.active?.design,t)||(f.queue||[]).some(j=>matches(j.design,t));}
function repeat(f,t){return f.repeat?.enabled===true&&matches(f.repeat.design,t);}
function active(f){return Boolean(f.currentProduction||f.active||!f.idle||(f.queue||[]).length||f.repeat?.enabled);}
const ids=v=>(v||[]).map(x=>typeof x==='number'?x:x.id);
function currentIdentity(f,allowWaiting=false){const p=f?.progress;if(!p?.available||!f.currentProduction||!['building','waiting-power','waiting-capacity','paused'].includes(p.state)||(!allowWaiting&&(p.state!=='building'||!(p.completedBuildPoints>0))))return '';const a=String(p.currentId).split(':').map(Number);return a.length===3&&a[0]===f.id&&a.every(Number.isFinite)?p.currentId:'';}
async function run(mode,options={}){
 assert(probe.routes[mode],'Explicit towers/ffa/campaign/multiplayer mode required');
 const c=await q.connect(probe.routes[mode]),tag=String(options.tag||mode).replace(/[^a-zA-Z0-9_-]/g,'-');
 const proof={version:'0.86',mode,tag,passed:false,actualAndroid:true,actualNativeEngineExecuted:true,
  actualTouchControls:true,seeded:options.seeded===true,fixture:'Already loaded prepared native world; no construction, grants, input hooks or API replacements',
  families:[],screenshots:[],limitations:[],startedUTC:new Date().toISOString()};
 const apk=path.resolve(__dirname,'../app/build/outputs/apk/debug/app-debug.apk');
 if(fs.existsSync(apk))proof.candidateAPK_SHA256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
 const row=t=>'.wt-factory-design-row[data-recipe-key='+JSON.stringify(key(t))+']';
 const control=(t,cls)=>row(t)+' '+cls;
 const fresh=()=>probe.fresh(c);
 const extras=()=>c.child('({native:globalThis.PcMultiplayerNative?.state||globalThis.__warzoneCampaign?.report?.().nativeState||null,commands:__warzoneCommands.report()})');
 const save=()=>fs.writeFileSync(path.join(q.out,'manufacturing086-'+tag+'-gameplay.json'),JSON.stringify(proof,null,2)+'\n');
 async function capture(label){const name='manufacturing086-'+tag+'-'+label;await c.snapshot(name);proof.screenshots.push(name+'.png');}
 async function until(fn,label,timeout=15000){const deadline=Date.now()+timeout;let last;do{last=await fn();if(last)return last;await q.delay(250);}while(Date.now()<deadline);const error=Error('Bounded native wait failed: '+label);error.last=last;throw error;}
 async function history(){return c.child('__warzoneCommands.report().history');}
 async function touchAck(selector,action){const before=new Set((await history()).map(v=>v.nonce));await c.tap(selector);return until(async()=>{const r=(await history()).find(v=>v.action===action&&!before.has(v.nonce));if(r){assert.equal(r.ok,true,JSON.stringify(r));return r;}return null;},'actual touch '+action);}
 async function open(page){const selected=await c.child('__warzoneCommands.report().page');if(selected!==page)await c.tap(page==='factory'?'#wt-open-factory':'#wt-open-queue');await c.wait(`${W}.__warzoneCommands.report().page===${JSON.stringify(page)}`,'native '+page+' screen');}
 async function choose(group,id){await open('factory');await c.tap('[data-factory-family='+JSON.stringify(group)+']');await c.tap('[data-factory='+JSON.stringify(String(id))+']');await c.wait('document.querySelector("#wt-factory-select")?.value==='+JSON.stringify(String(id)),'selected native factory');}
 async function pressed(selector){return c.evaluate('document.querySelector('+JSON.stringify(selector)+')?.getAttribute("aria-pressed")==="true"');}
 async function stop(id){const s=await fresh(),f=s.factories.find(v=>v.id===id);if(!f||!active(f))return {skipped:true,factoryId:id};await open('queue');const ack=await touchAck('[data-stop-production='+JSON.stringify(String(id))+']','stop-production');await until(async()=>{const next=(await fresh()).factories.find(v=>v.id===id);return next&&!next.repeat?.enabled&&!next.queue.length&&!next.currentProduction&&next.idle?next:null;},'STOP acknowledgement '+id);return ack;}
 try{
  proof.initial=await fresh();proof.initialEngine=await extras();
  const installed=q.adb('shell','dumpsys','package','com.rbabbit.warzonetowers.lab').toString();proof.installedVersion=(installed.match(/versionCode=\d+[^\r\n]*/)||[])[0]||'';
  for(const group of options.families||['vehicle','cyborg']){
   assert(['vehicle','cyborg'].includes(group),'Only requested factory categories');
   const report={family:group,passed:false,samples:[]};proof.families.push(report);save();
   let initial=await fresh();const facilities=initial.factories.filter(f=>f.ready&&family(f)===group).sort((a,b)=>a.id-b.id);
   report.readyFactoryIds=facilities.map(f=>f.id);report.multiFactoryCoverage=facilities.length>1;
   if(!facilities.length){report.unavailable='No completed '+group+' factory in prepared world';proof.limitations.push(report.unavailable);continue;}
   const first=facilities[0],templates=initial.templates.filter(t=>compatible(first,t)).filter(t=>group==='vehicle'?/spade|construct|truck/i.test([t.name,t.fullname,...equipment(t)].join(' ')):/cyborg/i.test(t.body+' '+t.propulsion)&&t.weapons?.length>0&&!/spade|construct/i.test(equipment(t).join(' '))).sort((a,b)=>(Number(a.points)||Number(a.cost)||0)-(Number(b.points)||Number(b.cost)||0));
   assert(templates.length,'Prepared '+group+' factory has a compatible native '+(group==='vehicle'?'truck':'combat cyborg')+' recipe');const template=templates[0];
   const targets=facilities.filter(f=>compatible(f,template)&&(f.queue||[]).length<64);report.template=clone(template);report.eligibleFactoryIds=targets.map(f=>f.id);report.firstFactoryId=first.id;
   const unrelatedBefore=initial.factories.filter(f=>family(f)!==group).map(f=>({id:f.id,repeat:clone(f.repeat),queueIds:ids(f.queue)}));
   const dirty=targets.filter(active);if(dirty.length){assert(options.cleanStart,'Prepared target factories already have work: '+dirty.map(f=>f.id).join(',')+'; explicit --clean-start is required to STOP it');report.preflightStops=[];for(const f of dirty)report.preflightStops.push(await stop(f.id));initial=await fresh();}
   await choose(group,first.id);await c.wait('Boolean(document.querySelector('+JSON.stringify(control(template,'.wt-factory-produce'))+'))','actual compatible recipe');
   report.firstControls=await c.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(row(template))});return{all:r.querySelectorAll('.wt-factory-all').length,cycle:r.querySelectorAll('.wt-factory-repeat').length,viewport:[innerWidth,innerHeight],row:r.getBoundingClientRect().toJSON()}})()`);assert.equal(report.firstControls.all,1);assert.equal(report.firstControls.cycle,1);
   if(facilities[1]){await choose(group,facilities[1].id);report.secondAllCount=await c.evaluate('document.querySelectorAll(".wt-factory-all").length');assert.equal(report.secondAllCount,0);await capture(group+'-second');await choose(group,first.id);}else report.secondFactoryUnavailable=true;
   if(!await pressed(control(template,'.wt-factory-all')))await c.tap(control(template,'.wt-factory-all'));
   if(!await pressed(control(template,'.wt-factory-repeat')))await c.tap(control(template,'.wt-factory-repeat'));
   assert(await pressed(control(template,'.wt-factory-all')));assert(await pressed(control(template,'.wt-factory-repeat')));
   const before=await fresh(),nativeBefore=await extras();report.before=before;report.beforeEngine=nativeBefore;
   report.manufactureReply=await touchAck(control(template,'.wt-factory-produce'),'queue-production');
   assert.equal(report.manufactureReply.result.all,true);assert.deepEqual(report.manufactureReply.result.factoryIds.slice().sort((a,b)=>a-b),targets.map(f=>f.id));
   const firstSubjects={},observedContinuation={},idleSince={};const seenFinished=new Map();const newTrucks=new Map();const newCombat=new Set();const baselineFinished=new Set(ids(before.finishedUnits)),baselineTrucks=new Set(ids(before.trucks)),baselineCombat=new Set(nativeBefore.native?.combatLock?.combatIds||[]);
   const deadline=Date.now()+(options.timeoutMs||60000);let finalSample=null;
   while(Date.now()<deadline){
    const s=await fresh(),engine=await extras();
    for(const d of s.finishedUnits||[])if(!baselineFinished.has(d.id))seenFinished.set(d.id,d);
    for(const d of s.trucks||[])if(!baselineTrucks.has(d.id))newTrucks.set(d.id,d);
    for(const id of engine.native?.combatLock?.combatIds||[])if(!baselineCombat.has(id))newCombat.add(id);
    const observation={gameTime:s.gameTime,power:s.power,finishedUnits:clone(s.finishedUnits||[]),newTruckIds:[...newTrucks.keys()],newCombatIds:[...newCombat],factories:targets.map(t=>s.factories.find(f=>f.id===t.id))};
    report.samples.push(observation);
    for(const f of observation.factories){
     assert(f,'Prepared native factory was lost');assert(repeat(f,template),'Native repeat plan is not matching at '+f.id);
     if(work(f,template))delete idleSince[f.id];else{idleSince[f.id]??=s.gameTime;assert(s.gameTime-idleSince[f.id]<=2500,'Native repeat stayed idle beyond bounded simulation handoff at '+f.id);}
     const identity=currentIdentity(f);if(identity&&!firstSubjects[f.id])firstSubjects[f.id]=identity;
     const subsequent=currentIdentity(f,true),baseline=firstSubjects[f.id];
     if(subsequent&&baseline&&subsequent!==baseline&&matches(f.currentProduction,template)&&Number(subsequent.split(':')[2])>Number(baseline.split(':')[2]))observedContinuation[f.id]={kind:'subsequent-native-subject',currentId:subsequent,gameTime:s.gameTime,state:f.progress.state};
     const blocked=(f.queue||[]).find(j=>j.repeat===true&&matches(j.design,template)&&['waiting','blocked'].includes(j.status)&&j.reason==='unit-capacity');
     if(baseline&&blocked)observedContinuation[f.id]={kind:'automatic-continuation-at-native-capacity-limit',job:clone(blocked),waitingReason:clone(f.waitingReason||null),gameTime:s.gameTime};
    }
    const eachAdvanced=targets.every(t=>Boolean(observedContinuation[t.id]));
    const perFactoryFinished=targets.every(t=>[...seenFinished.values()].some(d=>d.factoryId===t.id));
    const actualNewUnits=perFactoryFinished||(group==='vehicle'?newTrucks.size>=targets.length:mode==='multiplayer'&&newCombat.size>=targets.length);
    if(eachAdvanced&&actualNewUnits){finalSample=s;report.completion={firstNativeSubjectIdentities:firstSubjects,observedContinuations:observedContinuation,subsequentNativeSubjectIdentities:Object.fromEntries(observation.factories.map(f=>[f.id,f.progress.currentId])),nativeFinishedUnits:[...seenFinished.values()],actualNewTrucks:[...newTrucks.values()],actualNewCombatIds:[...newCombat],evidence:perFactoryFinished?'Native finished-unit IDs per factory plus observed subsequent native subjects or ordinary capacity-blocked automatic continuations':group==='vehicle'?'New real constructor IDs plus per-factory native subject advancement or ordinary capacity-blocked automatic continuation':'New real owned combat IDs plus per-factory native subject advancement or ordinary capacity-blocked automatic continuation'};break;}
    await q.delay(350);
   }
   assert(finalSample,'Native production/repeat completion was not observed within '+(options.timeoutMs||60000)+'ms; inspect samples for power/capacity/fixture constraints');
   await capture(group+'-actual-repeat');report.afterCompletion=finalSample;
   report.stopFirst=await stop(first.id);const stopped=await fresh();assert.equal(stopped.factories.find(f=>f.id===first.id).repeat.enabled,false);
   const siblings=targets.filter(f=>f.id!==first.id);for(const sibling of siblings)assert(repeat(stopped.factories.find(f=>f.id===sibling.id),template),'STOP first must preserve sibling repeat');
   if(siblings.length){
    await choose(group,first.id);assert(await pressed(control(template,'.wt-factory-all')),'ALL scope survives Queue return');assert(await pressed(control(template,'.wt-factory-repeat')),'Stopped first still exposes matching sibling cycle');
    report.beforeCycleOff=await fresh();report.cycleOffReply=await touchAck(control(template,'.wt-factory-repeat'),'set-production-repeat');assert.equal(report.cycleOffReply.result.all,true);
    report.afterCycleOff=await fresh();for(const target of targets)assert.equal(report.afterCycleOff.factories.find(f=>f.id===target.id).repeat.enabled,false,'Cycle OFF clears category policy');
    for(const sibling of siblings){const f=report.afterCycleOff.factories.find(f=>f.id===sibling.id);assert(matches(f.currentProduction,template)||!f.currentProduction,'OFF may retain current or allow ordinary completion');assert(!(f.queue||[]).some(j=>j.repeat),'OFF removes only automatic future continuations');}
    report.otherCategoryAfterCycleOff=report.afterCycleOff.factories.filter(f=>family(f)!==group).map(f=>({id:f.id,repeat:clone(f.repeat),queueIds:ids(f.queue)}));
    assert.deepEqual(report.otherCategoryAfterCycleOff,unrelatedBefore,'Category production must not alter other-category policies/FIFO');await capture(group+'-cycle-off');
   }
   report.cleanup=[];for(const f of targets)report.cleanup.push(await stop(f.id));report.afterCleanup=await fresh();
   for(const f of targets){const n=report.afterCleanup.factories.find(x=>x.id===f.id);assert(!n.repeat.enabled&&!n.queue.length&&!n.currentProduction);}
   report.passed=true;save();
  }
  proof.passed=proof.families.some(f=>f.passed)&&proof.families.every(f=>f.passed||f.unavailable);proof.endedUTC=new Date().toISOString();await capture('complete');save();return proof;
 }catch(error){proof.error=error.stack||String(error);try{proof.failureState=await fresh();proof.failureEngine=await extras();await capture('failure');}catch(diagnostic){proof.diagnosticError=diagnostic.message;}save();throw error;}
 finally{c.close();}
}
module.exports={run};
if(require.main===module){const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};run(args[0],{tag:get('--tag',args[0]),families:get('--families','vehicle,cyborg').split(','),timeoutMs:Math.min(60000,Number(get('--timeout-ms',60000))),seeded:args.includes('--seeded'),cleanStart:args.includes('--clean-start')}).then(p=>console.log(JSON.stringify({passed:p.passed,mode:p.mode,families:p.families.map(f=>({family:f.family,passed:f.passed,eligibleFactoryIds:f.eligibleFactoryIds,multiFactoryCoverage:f.multiFactoryCoverage,unavailable:f.unavailable})),proof:'qa/delivery-086/manufacturing086-'+p.tag+'-gameplay.json'}))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
