'use strict';
// QA only: real Android catalogue/world touches and ordinary native fixtures.
// No direct queue-build orders, grants, unit changes or partial native saves.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-04/module-journey');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const {controls}=require('./audit-smooth-building.cjs'),selection=require('./test-02-selection-journey.cjs');
const {adb,screen,out}=live,json=JSON.stringify,sorted=a=>a.slice().sort((a,b)=>a-b);
const rows=data=>Object.values(data||{}).filter(x=>x&&typeof x==='object'&&Number.isFinite(x.id));
const parentRow=(save,id)=>rows(save['struct.json']).find(x=>x.id===id);
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const reportPath=phase=>path.join(out,phase==='all'?'module-journey.json':'module-journey-'+phase+'.json');
async function fresh(c){const r=await c.evaluate('__warzoneCommands.send("state",{}, {fresh:true})');assert.equal(r.ok,true,'fresh native acknowledgement');return r.result;}
async function ui(c){return c.evaluate(`(()=>{const r=__warzoneCommands.report(),d=WarzoneBuildDisplay.report(),e=parent.document.getElementById('wt-module-guidance');return{buildOpen:r.buildOpen,placement:r.placement,group:r.nativeBuildGroup,selecting:r.selectingTrucks,pending:r.modulePending,sourceTargets:r.snapshot?.moduleTargets,effectiveTargets:r.moduleTargets,display:d,hint:e?{text:e.innerText,hidden:e.hidden,rect:JSON.parse(JSON.stringify(e.getBoundingClientRect()))}:null,notice:r.notice,historyLength:r.history.length};})()`);}
async function shot(c,name){const n=await c.evaluate('__kalaWarzoneTouch.report().nativeRenderFrames');await c.wait('__kalaWarzoneTouch.report().nativeRenderFrames>'+String(n+2),10000);await c.paint();return screen(name);}
async function exitBuild(c){if(await c.evaluate('__warzoneCommands.report().buildOpen'))await c.tap('#wt-build-sidebar [data-action="select-mode"]');await c.wait('!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().exitingBuild&&!__warzoneCommands.report().selectingTrucks',12000);}
async function item(c,id,category='MODULES'){
 if(!await c.evaluate('__warzoneCommands.report().buildOpen'))await c.tap('#wt-open-build');
 const cat='#wt-build-sidebar [data-category="'+category+'"]';
 if(!await c.host(`document.querySelector(${json(cat)})?.classList.contains('active')`))await c.tap(cat);
 await c.tap('#wt-sidebar-catalogue [data-build="'+id+'"]');
 assert.equal(await c.evaluate('__warzoneCommands.report().placement'),id,'actual catalogue chooses '+id);
 await c.wait('!__warzoneCommands.report().selectingTrucks',20000);
}
async function group(c,ids,label){const s=await fresh(c),r=await ui(c);assert.deepEqual(sorted(s.selectedUnits.map(x=>x.id)),sorted(ids),label+': exact real native constructors');assert.ok(s.selectedUnits.every(x=>x.constructor));assert.deepEqual(sorted(r.group),sorted(ids));return {native:s.selectedUnits,ui:r};}
function targetOf(state,id,moduleId){const row=state.sourceTargets?.find(x=>x.id===id&&x.moduleId===moduleId);assert.ok(row,'fresh native module target '+id+'/'+moduleId);return row;}
async function target(c,id,moduleId){
 await fresh(c);
 await c.wait(`(()=>{const d=WarzoneBuildDisplay.report();return Array.isArray(d.moduleTargets)&&d.moduleTargets.some(t=>t.id===${id}&&t.moduleId===${json(moduleId)}&&t.hitPoints?.length>1)})()`,10000);
 const s=await ui(c),native=targetOf(s,id,moduleId),drawn=s.display.moduleTargets.find(x=>x.id===id&&x.moduleId===moduleId);
 assert.ok(s.hint&&!s.hint.hidden&&s.hint.rect.width>0&&s.hint.rect.height>0,'persistent module guidance is visible');
 assert.doesNotMatch(s.hint.text,/clear terrain/i,'module guidance must not ask for empty ground');
 assert.match(s.hint.text,/module|research|lab|factory|power|upgrad|building/i,'module-specific guidance');
 const effective=s.effectiveTargets.find(x=>x.id===id&&x.moduleId===moduleId),busy=['queued','upgrading'].includes(effective.status),used=Math.min(effective.maximum,effective.modules+effective.reserved),numerator=effective.eligible?(busy?Math.min(effective.maximum,used+1):effective.modules):busy||effective.status==='full'?used:effective.modules;
 assert.equal(effective.maximum,native.maximum);assert.ok(drawn.label&&drawn.label.includes(numerator+'/'+native.maximum),'target label shows actual current/reserved/next capacity');
 return {native,effective,drawn,hint:s.hint};
}
async function meshPoint(c,id,moduleId,part){
 assert.ok(await c.evaluate('WarzoneTerrain.refresh()'),'fresh camera matrix before building-body touch');
 const t=await target(c,id,moduleId);
 const candidates=t.drawn.hitPoints.filter(p=>p.source==='mesh'&&Number.isFinite(p.x)&&Number.isFinite(p.y));
 const hits=await c.evaluate(`${json(candidates)}.map(p=>{const h=WarzoneBuildDisplay.pickModuleTarget(p.x,p.y);return {...p,resolved:h?{id:h.id,moduleId:h.moduleId,hit:h.hit}:null}})`);
 const points=hits.filter(p=>p.resolved?.id===id&&p.resolved.moduleId===moduleId&&p.resolved.hit?.source==='mesh'&&p.resolved.hit.distance===0).sort((a,b)=>a.y-b.y);
 assert.ok(points.length>=2,'actual projected mesh face samples, not a guessed tile centre');
 const p=part==='upper'?points[0]:points.at(-1),opposite=part==='upper'?points.at(-1):points[0];
 assert.ok(Math.hypot(p.x-opposite.x,p.y-opposite.y)>=8,'separate upper/lower building mesh hits');
 const hit=await c.evaluate(`(()=>{const p=WarzoneBuildDisplay.pickModuleTarget(${p.x},${p.y});return p&&{id:p.id,moduleId:p.moduleId,hit:p.hit,ground:WarzoneTerrain.pick(${p.x},${p.y})};})()`);
 assert.equal(hit?.id,id,'read-only hit test identifies the intended native parent');assert.equal(hit.moduleId,moduleId);assert.equal(hit.hit?.source,'mesh','the actual touch is on a mesh face, not a label');
 return {point:p,otherMeshPoint:opposite,target:t,hit,part};
}
async function keepModule(c,id,label){const r=await ui(c);assert.equal(r.buildOpen,true,label+': module catalogue stays open');assert.equal(r.placement,id,label+': module choice remains active');return r;}
async function moduleToast(c){
 const read=await c.host(`(()=>{const e=document.getElementById('wt-command-toast'),s=document.getElementById('wt-build-sidebar');return{toast:e?{text:e.innerText,hidden:e.hidden,rect:e.getBoundingClientRect().toJSON()}:null,sidebar:s?.getBoundingClientRect().toJSON()}})()`);
 assert.ok(read.toast&&!read.toast.hidden,'actual module feedback remains visible');assert.ok(read.toast.rect.height<100,'feedback stays a small toast');assert.ok(read.toast.rect.left>=read.sidebar.right+4,'module feedback sits beside the sidebar, clear of its controls');return read;
}
async function tapParent(c,ctl,id,moduleId,part,label,expectOk=true){
 const before=await fresh(c),read=await ui(c),p=await meshPoint(c,id,moduleId,part),start=read.historyLength;
 await ctl.touch(p.point.x,p.point.y); // Real ADB tap; pickModuleTarget above only observes.
 await c.wait(`__warzoneCommands.report().history.slice(${start}).some(x=>x.action==='queue-build')`,12000);
 const replies=await c.evaluate(`__warzoneCommands.report().history.slice(${start}).filter(x=>x.action==='queue-build')`),reply=replies.at(-1);
 assert.equal(reply.ok,expectOk,label+': actual native queue reply '+json(reply));
 if(expectOk){assert.equal(reply.result.parentId,id);assert.equal(reply.result.itemId,moduleId);assert.deepEqual(sorted(reply.result.workers),sorted(read.group));}
 const after=await fresh(c),u=await keepModule(c,moduleId,label);
 assert.equal(u.display.preview,'',label+': accepted/rejected module touch leaves no free-standing preview');
 return {parentId:id,moduleId,before,mesh:p,reply,after,ui:u,screen:await shot(c,label)};
}
async function pendingFeedback(c,ctl,id,moduleId,part,label,count=1){
 const before=await fresh(c),jobs=before.jobs.filter(x=>x.parentId===id),p=await meshPoint(c,id,moduleId,part);
 assert.equal(jobs.length,count,label+': expected real pending parent jobs before repeat');
 await ctl.touch(p.point.x,p.point.y);await c.paint();
 await c.wait(`(()=>{const e=parent.document.getElementById('wt-command-toast');return Boolean(e&&!e.hidden&&/already.*(?:queued|upgrading)|(?:queued|upgrading).*already/i.test(e.innerText))})()`,10000);
 const after=await fresh(c),u=await keepModule(c,moduleId,label),feedback=await moduleToast(c),toast=feedback.toast;
 const accepted=jobs.map(x=>x.id),remaining=[...after.jobs,...after.finishedBuilds].filter(x=>accepted.includes(x.id));
 assert.equal(remaining.length,count,label+': accepted native jobs survive repeat');
 assert.ok(!after.jobs.some(x=>x.parentId===id&&!accepted.includes(x.id)),label+': no duplicate native parent job');
 assert.ok(toast&&!toast.hidden&&/already.*(?:queued|upgrading)|(?:queued|upgrading).*already/i.test(toast.text),label+': friendly already queued/upgrading feedback');
 assert.doesNotMatch(toast.text,/completed matching building/i,'correct pending parent must not get mismatched-parent error');
 assert.equal(u.display.preview,'');
 return {beforeJobs:jobs,afterJobs:after.jobs,mesh:p,toast,sidebar:feedback.sidebar,ui:u,screen:await shot(c,label)};
}
async function waitDone(c,jobs,label,timeout=120000){
 const started=await clock(c),ids=jobs.map(x=>x.id),nativeBudget=jobs.length===2&&jobs.every(x=>x.itemId==='A0FacMod1')?140000:100000;
 await c.wait(`(()=>{if(__towersHtml.isEnded())throw Error('Battle ended during ${label}');const s=__warzoneCommands.report().snapshot;if(s?.hasHQ===false)throw Error('HQ lost during ${label}');if(s?.gameTime>${started+nativeBudget})throw Error('Native construction budget exceeded during ${label}');if(s?.jobs.some(x=>${json(ids)}.includes(x.id)&&x.status==='blocked'))throw Error('Actual native job blocked during ${label}');return ${json(ids)}.every(id=>(s?.finishedBuilds||[]).some(x=>x.id===id));})()`,timeout);
 return fresh(c);
}
function completedModule(save,id,count){const p=parentRow(save,id);assert.ok(p,'genuine F7 contains parent '+id);assert.equal(p.modules,count,'actual native module count');assert.equal(p.currentBuildPts,500,'actual completed native module build points');return {id:p.id,name:p.name,position:p.position,modules:p.modules,currentBuildPts:p.currentBuildPts};}
function nativeModuleOrders(save,job){const workers=rows(save['droid.json']).filter(x=>job.workers.includes(x.id));assert.ok(workers.some(x=>x['order/type']===4&&x['order/stats']===job.itemId),'real F7 DORDER_BUILD for requested module');return workers.map(x=>({id:x.id,position:x.position,order:x['order/type'],item:x['order/stats'],orderPosition:x['order/pos']}));}
async function fullFeedback(c,ctl,id,moduleId,label){
 const current=await ui(c);if(!current.buildOpen||current.placement!==moduleId)await item(c,moduleId);const t=await target(c,id,moduleId);assert.equal(t.native.modules,t.native.maximum,'completed target is full');assert.equal(t.native.eligible,false);assert.match(t.drawn.label,/full|maximum|complete/i,'visible full-capacity target label');
 const before=await fresh(c),p=await meshPoint(c,id,moduleId,'lower');await ctl.touch(p.point.x,p.point.y);await c.paint();
 await c.wait(`(()=>{const e=parent.document.getElementById('wt-command-toast');return Boolean(e&&!e.hidden&&/full|maximum|already.*module/i.test(e.innerText))})()`,10000);
 const after=await fresh(c),u=await keepModule(c,moduleId,label),feedback=await moduleToast(c);assert.deepEqual(after.jobs,before.jobs,'full-parent tap creates no native job');assert.equal(u.display.preview,'');
 return {target:t,mesh:p,ui:u,toast:feedback.toast,sidebar:feedback.sidebar,screen:await shot(c,label)};
}
async function inputReturn(c,ctl,id,moduleId,record){
 await item(c,moduleId);const before=await group(c,record.ids,'before radar'),placement=before.ui.placement;await ctl.camera(...record.camera);
 assert.equal(await c.evaluate('__warzoneCommands.report().placement'),placement,'real radar keeps chosen module');await group(c,record.ids,'after radar');
 record.target=await target(c,id,moduleId);record.screen=await shot(c,record.label+'-radar-guidance');
 adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().buildOpen',10000);assert.equal((await ui(c)).display.preview,'','Back clears preview');
 await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');record.factoryScreen=await shot(c,record.label+'-factory-open');adb('shell','input','keyevent','4');
 await c.wait('!__warzoneCommands.report().page&&!parent.document.getElementById("warzone-game-frame").inert',10000);record.clock=await j.waitAdvancingClock(c,await clock(c),10000);record.returnScreen=await shot(c,record.label+'-factory-back');
}
async function roundtrip(c,r,parents,towers){
 await exitBuild(c);const library=await c.evaluate('BlockNightAndroid.loadDesigns()'),saved=await c.save('module04-roundtrip-before'),at=saved['gam.json'].gameTime;
 await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+String(at+4500),12000);const pre=await clock(c),started=Date.now();r.savedTime=at;r.preLoadClock=pre;r.cdpTimeoutMs=90000;r.readinessBudgetMs=90000;
 // Only the genuine native load gets the larger transport/readiness budget.
 // The shared client/helper and every ordinary operation retain their 20s limit.
 const loadingClient={...c,evaluate:(expression,options={})=>c.evaluate(expression,{...options,timeoutMs:90000})};
 try{await loadingClient.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');await c.wait(`__warzoneTowersWaves.report().snapshot.gameTime>=${at-500}&&__warzoneTowersWaves.report().snapshot.gameTime<${pre-2000}`,90000,{timeoutMs:90000});r.readiness=await require('./observe-native-load.cjs').observe(loadingClient,{label:'module04-genuine-quickload',timeout:90000});}finally{r.loadingWallMs=Date.now()-started;}
 r.rewoundClock=await clock(c);assert.ok(r.rewoundClock<pre-2000,'actual native clock rewinds, not cached state');await fresh(c);
 const loaded=await c.save('module04-roundtrip-loaded');r.parents=parents.map(p=>completedModule(loaded,p.id,p.count));
 for(const tower of towers){const p=parentRow(loaded,tower.id);assert.ok(p);assert.equal(p.name,tower.name);assert.equal(p.currentBuildPts,tower.currentBuildPts);assert.deepEqual(p.position,tower.position);}
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),library,'phone design library survives genuine native save/load');
 await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');r.factoryScreen=await shot(c,'module04-roundtrip-factory');adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page&&!parent.document.getElementById("warzone-game-frame").inert',10000);r.inputClock=await j.waitAdvancingClock(c,await clock(c),10000);r.inputScreen=await shot(c,'module04-roundtrip-restored-input');
}
async function dustfall(c,r){
 const ctl=await controls(c),ids=[160001,160003];await ctl.camera(8,72);const initial=await c.save('module04-dustfall-initial');assert.equal((await fresh(c)).mapHeight,79);
 const labs=[[4,71],[4,74]].map(([x,y])=>rows(initial['struct.json']).find(s=>s.name==='A0ResearchFacility'&&s.position[0]===x*128&&s.position[1]===y*128)),power=parentRow(initial,160119);
 assert.ok(labs.every(Boolean)&&power?.name==='A0PowerGenerator');assert.ok([...labs,power].every(s=>!s.modules),'fresh authored Dustfall parents have empty capacity');
 r.initialParents=[...labs,power].map(s=>({id:s.id,name:s.name,modules:s.modules||0,position:s.position}));await selection.monitor(c);
 r.phase='module-guidance';await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="MODULES"]');const generic=await ui(c);assert.ok(generic.hint&&!generic.hint.hidden);assert.doesNotMatch(generic.hint.text,/clear terrain/i);r.category={ui:generic,screen:await shot(c,'module04-modules-category-guidance')};
 r.phase='research-roof-body-and-repeat';await item(c,'A0ResearchModule1');r.selection=await group(c,ids,'research module');r.eligible=await target(c,labs[0].id,'A0ResearchModule1');assert.equal(r.eligible.native.eligible,true);
 r.firstResearch=await tapParent(c,ctl,labs[0].id,'A0ResearchModule1','upper','module04-research-roof-accepted');
 await c.wait(`__warzoneCommands.report().snapshot.moduleTargets.some(x=>x.id===${labs[0].id}&&x.status==='upgrading')`,15000);r.upgradingFeedback=await pendingFeedback(c,ctl,labs[0].id,'A0ResearchModule1','lower','module04-research-upgrading-feedback');
 r.secondResearch=await tapParent(c,ctl,labs[1].id,'A0ResearchModule1','lower','module04-research-body-accepted');r.queuedFeedback=await pendingFeedback(c,ctl,labs[1].id,'A0ResearchModule1','upper','module04-research-queued-feedback');
 const researchJobs=[r.firstResearch.reply.result,r.secondResearch.reply.result];r.researchOrders=nativeModuleOrders(await c.save('module04-research-native-orders'),researchJobs[0]);await item(c,'A0ResearchModule1');
 await waitDone(c,researchJobs,'research modules');r.researchNoAutoExit=await keepModule(c,'A0ResearchModule1','research modules completed');r.researchCompleteScreen=await shot(c,'module04-research-complete-still-open');
 r.fullResearch=await fullFeedback(c,ctl,labs[0].id,'A0ResearchModule1','module04-research-full-feedback');await exitBuild(c);const researchSave=await c.save('module04-research-native-complete');r.researchNative=labs.map(x=>completedModule(researchSave,x.id,1));
 r.phase='power-then-ordinary-fifo';await item(c,'A0PowMod1');await group(c,ids,'Power Module after movement');await ctl.camera(6,57);r.powerTarget=await target(c,power.id,'A0PowMod1');r.power=await tapParent(c,ctl,power.id,'A0PowMod1','upper','module04-power-roof-accepted');
 r.powerOrders=nativeModuleOrders(await c.save('module04-power-native-orders'),r.power.reply.result);await item(c,'GuardTower1','DEFENCES');
 let site;for(const [x,y]of [[8,56],[8,57],[7,55],[5,55]]){const p=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${x},y:${y},workerIds:${json(ids)}})`);if(p.ok){site={x,y};break;}}
 assert.ok(site,'one clear reachable ordinary FIFO site in prepared view');const start=await c.evaluate('__warzoneCommands.report().history.length');r.towerPoint=await ctl.tile(site.x,site.y);await c.wait(`__warzoneCommands.report().history.slice(${start}).some(x=>x.action==='queue-build'&&x.ok&&x.result?.itemId==='GuardTower1')`,12000);
 r.towerReply=await c.evaluate(`__warzoneCommands.report().history.slice(${start}).find(x=>x.action==='queue-build'&&x.ok&&x.result?.itemId==='GuardTower1')`);r.mixedQueuedScreen=await shot(c,'module04-power-then-tower-queued');
 const mixedJobs=[r.power.reply.result,r.towerReply.result],done=await waitDone(c,mixedJobs,'Power Module then ordinary tower');r.fifo=done.finishedBuilds.filter(x=>mixedJobs.some(j=>j.id===x.id));assert.deepEqual(r.fifo.map(x=>x.id),mixedJobs.map(x=>x.id),'native module/ordinary completion FIFO');
 await c.wait('!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().exitingBuild',12000);r.ordinaryAutoExit=await ui(c);r.mixedCompleteScreen=await shot(c,'module04-ordinary-tower-autoexit');const complete=await c.save('module04-mixed-native-complete');r.powerNative=completedModule(complete,power.id,1);
 const tower=rows(complete['struct.json']).find(x=>x.name==='GuardTower1'&&Math.floor(x.position[0]/128)===site.x&&Math.floor(x.position[1]/128)===site.y);assert.ok(tower);assert.equal(tower.currentBuildPts,300);r.towerNative=tower;
 r.fullPower=await fullFeedback(c,ctl,power.id,'A0PowMod1','module04-power-full-feedback');r.input={ids,camera:[6,57],label:'module04-dustfall'};await inputReturn(c,ctl,power.id,'A0PowMod1',r.input);
 r.phase='genuine-module-save-load';r.quickload={};await roundtrip(c,r.quickload,[...labs.map(x=>({id:x.id,count:1})),{id:power.id,count:1}],[tower]);r.monitor=await selection.stopMonitor(c);
 const samples=r.monitor.samples;assert.ok(samples.length>3&&samples.every(x=>!x.covered&&!x.ended));assert.ok(samples.every(x=>x.zoom.join()===samples[0].zoom.join()),'no automatic module zoom');r.passed=true;
}
async function upgradedFactoryProduction(c,factoryId){
 const initial=await fresh(c),f=initial.factories.find(x=>x.id===factoryId);assert.ok(f?.ready&&f.modules===2,'actual upgraded factory is complete and ready');
 const templates=initial.templates.filter(t=>f.templates.includes(t.id)).sort((a,b)=>Number(a.cost??a.power??Infinity)-Number(b.cost??b.power??Infinity)||String(a.id).localeCompare(String(b.id)));
 if(!templates.length)return {applicable:false,reason:'Fresh native state publishes no compatible existing template for this completed factory.',factory:f};
 const library=await c.evaluate('BlockNightAndroid.loadDesigns()'),before=await c.save('module04-factory-before-production'),nativeIds=rows(before['droid.json']).map(x=>x.id),finishedIds=initial.finishedUnits.map(x=>x.id),attr=(name,value)=>'['+name+'='+json(String(value))+']';
 await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');await c.tap('#wt-command-pages '+attr('data-factory',factoryId));await c.tap('#wt-command-pages [data-count="1"]');
 assert.equal(await c.host('Number(document.getElementById("wt-factory-select").value)'),factoryId,'normal Factory UI selects the actual upgraded parent');
 const template=templates[0],native='#wt-command-pages '+attr('data-produce-template',template.id),enabled=selector=>c.host(`Boolean(document.querySelector(${json(selector)})&&!document.querySelector(${json(selector)}).disabled)`);let selector=native,route='existing-native-template';
 if(!await enabled(native)){
  const equipment=template.weapons?.length?template.weapons:[template.construct,template.repair,template.brain,template.ecm,template.sensor].filter(x=>x&&!/null/i.test(x)).slice(0,1),key=json([template.body,template.propulsion,equipment]);
  const saved=await c.evaluate(`__warzoneCommands.report().saved.find(d=>JSON.stringify([d.body,d.propulsion,d.turrets])===${json(key)})`);assert.ok(saved,'hidden duplicate native card has its existing equivalent saved recipe');selector='#wt-command-pages '+attr('data-produce',saved.id);assert.ok(await enabled(selector),'equivalent existing recipe is producible without editing the library');route='existing-equivalent-saved-recipe';
 }
 const history=await c.evaluate('__warzoneCommands.report().history.length');await c.tap(selector);
 await c.wait(`__warzoneCommands.report().history.slice(${history}).some(x=>x.action==='queue-production'&&x.ok&&x.result?.factoryId===${factoryId}&&x.result.count===1)`,12000);
 const r={applicable:true,factoryId,template,route,beforeIds:nativeIds,queuedScreen:await shot(c,'module04-upgraded-factory-produce-one')};
 await c.wait(`(()=>{const s=__warzoneCommands.report().snapshot;if(__towersHtml.isEnded()||s?.hasHQ===false)throw Error('Battle/HQ ended during ordinary upgraded factory production');return s?.finishedUnits.some(x=>x.factoryId===${factoryId}&&!${json(finishedIds)}.includes(x.id));})()`,90000);
 const nativeSave=await c.save('module04-upgraded-factory-produced-native'),produced=nativeSave.commands.snapshot.finishedUnits.filter(x=>x.factoryId===factoryId&&!finishedIds.includes(x.id));assert.equal(produced.length,1,'normal PRODUCE1 completes exactly one new native unit');
 const unit=rows(nativeSave['droid.json']).find(x=>x.id===produced[0].id);assert.ok(unit&&!nativeIds.includes(unit.id),'genuine F7 contains the newly built droid');assert.equal(unit.player,initial.player);assert.ok(unit.position.every(Number.isFinite));assert.equal(unit.parts.body,template.body);assert.equal(unit.parts.propulsion,template.propulsion);assert.ok(unit.name.endsWith('F'+factoryId),'native droid name records the actual producing factory origin');
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),library,'normal production makes no phone design-library edits');r.produced=produced[0];r.nativeUnit=unit;r.nativeFactory=parentRow(nativeSave,factoryId);assert.equal(r.nativeFactory.modules,2);r.completedScreen=await shot(c,'module04-upgraded-factory-produced-complete');return r;
}
async function factory(c,r){
 await j.resume(c);const ctl=await controls(c);await ctl.camera(28,20);const initial=await c.save('module04-factory-initial'),parent=parentRow(initial,160121),ids=[160005];
 assert.ok(parent&&parent.name==='A0LightFactory');assert.equal(parent.modules||0,0,'fresh authored Dustfall factory starts with zero modules');assert.equal((await fresh(c)).mapHeight,79);assert.equal((await fresh(c)).trucks.length,4,'four authored constructors; local real truck is reused');r.initial={id:parent.id,name:parent.name,position:parent.position,modules:parent.modules||0};await selection.monitor(c);
 r.phase='factory-capacity';await item(c,'A0FacMod1');r.selection=await group(c,ids,'factory module');r.target=await target(c,parent.id,'A0FacMod1');assert.equal(r.target.native.maximum,2);assert.equal(r.target.native.eligible,true);
 r.first=await tapParent(c,ctl,parent.id,'A0FacMod1','upper','module04-factory-first-roof-accepted');assert.equal(r.first.reply.result.targetModules,1);
 await c.wait(`__warzoneCommands.report().snapshot.jobs.some(x=>x.id===${json(r.first.reply.result.id)}&&x.status==='working')&&__warzoneCommands.report().snapshot.moduleTargets.some(x=>x.id===${parent.id}&&x.status==='upgrading')`,20000);
 r.firstWorking=await fresh(c);r.second=await tapParent(c,ctl,parent.id,'A0FacMod1','lower','module04-factory-second-body-accepted');assert.equal(r.second.reply.result.targetModules,2);
 r.twoLevels=await fresh(c);const jobs=[r.first.reply.result,r.second.reply.result];assert.equal(r.twoLevels.jobs.filter(x=>x.parentId===parent.id).length,2,'exactly two real native factory module levels');assert.equal(r.twoLevels.jobs.find(x=>x.id===jobs[1].id)?.status,'queued','second level waits while the first is working');
 assert.equal(r.twoLevels.constructionSites.find(x=>x.id===jobs[1].id)?.status,'queued','visible native journal distinguishes queued second level');r.twoLevelsScreen=await shot(c,'module04-factory-one-working-one-queued');
 r.thirdRejected=await pendingFeedback(c,ctl,parent.id,'A0FacMod1','upper','module04-factory-third-pending-feedback',2);r.nativeOrders=nativeModuleOrders(await c.save('module04-factory-native-orders'),jobs[0]);await item(c,'A0FacMod1');
 const done=await waitDone(c,jobs,'two factory modules',240000);r.fifo=done.finishedBuilds.filter(x=>jobs.some(j=>j.id===x.id));assert.deepEqual(r.fifo.map(x=>x.id),jobs.map(x=>x.id),'factory levels complete in actual native1→2 order');r.noAutoExit=await keepModule(c,'A0FacMod1','both factory modules complete');r.completeScreen=await shot(c,'module04-factory-two-of-two-still-open');r.full=await fullFeedback(c,ctl,parent.id,'A0FacMod1','module04-factory-full-feedback');await exitBuild(c);r.native=completedModule(await c.save('module04-factory-native-complete'),parent.id,2);r.monitor=await selection.stopMonitor(c);assert.ok(r.monitor.samples.every(x=>!x.covered&&!x.ended));r.phase='upgraded-factory-production';r.production=await upgradedFactoryProduction(c,parent.id);r.passed=true;
}
async function run(options={}){
 const phase=options.phase||'all';assert.ok(['all','dustfall','factory'].includes(phase));const r={passed:false,seeded:false,phase,started:new Date().toISOString(),method:'Fresh authored Dustfall; actual ADB catalogue and mesh-face touches, native IDs/orders/completion and genuine F7/F8. No script-sent build orders, granted units or positions.',cases:[],identity:j.installedIdentity(options.apk)};let c;
 const write=()=>fs.writeFileSync(reportPath(phase),json(r,null,2)+'\n');
 try{
  if(phase!=='factory'){c=options.reuse?await j.connectReady():await j.start('td1');await j.resume(c);r.dustfall={passed:false};await dustfall(c,r.dustfall);r.dustfall.errors=c.errors.slice();assert.deepEqual(c.errors,[]);r.cases.push('research/power target UI, roof/body real hits, queued/upgrading/full feedback, previews, persistence, module+ordinary FIFO and native save/load');write();await j.pause(c);c.close();c=null;}
  if(phase!=='dustfall'){c=options.reuse&&phase==='factory'?await j.connectReady():await j.start('td1');r.factory={passed:false};await factory(c,r.factory);r.cases.push('fresh authored factory0→1→2, distinct working/queued levels, third repeat rejected, full2/2 and no autoexit');}
  r.afterIdentity=j.installedIdentity(options.apk);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);assert.deepEqual(c?.errors||[],[],'no uncaught current WebView errors');r.passed=true;
 }catch(error){r.failure=String(error.stack||error);if(c)try{r.failureScreen=screen('module04-'+phase+'-failure');r.failureState=await ui(c);}catch(capture){r.captureFailure=String(capture);}throw error;
 }finally{if(c){try{r.cleanupMonitor=await selection.stopMonitor(c);r.pausedAt=await j.pause(c);}catch(error){r.cleanupFailure=String(error.stack||error);r.passed=false;}c.close();}r.finished=new Date().toISOString();write();}
 if(!r.passed)throw Error(r.cleanupFailure||'Module journey failed');return r;
}
module.exports={run,fresh,ui,target,meshPoint,tapParent,pendingFeedback,fullFeedback,completedModule,item,exitBuild,group,shot};
if(require.main===module){const args=process.argv.slice(2),value=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:undefined;};run({apk:value('--apk')||process.env.WZ_QA_APK,phase:value('--phase'),reuse:args.includes('--reuse')}).then(r=>console.log(json({passed:r.passed,identity:r.identity,cases:r.cases}))).catch(error=>{console.error(error);process.exitCode=1;});}
