'use strict';
// Real Android touches; CDP observes state and restores complete ordinary saves.
// No units, research, power, templates, components or native world fields are seeded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const live=require('./native-live.cjs');
const {connect,adb,delay,screen,nativeTap,root,out,packageId,device,assertLabForeground}=live;
const fixturePaths={
 early:path.join(root,'qa/v6.1-compact/final/checkpoints/td2-normal-early.json'),
 research:path.join(root,'qa/v6.1-compact/final/checkpoints/td2-manual-labs.json'),
 buildings:path.join(root,'qa/v6.4-build-display/ordinary-eight-site-fixture.json')
};
const json=value=>JSON.stringify(value),attribute=(name,value)=>`[${name}=${json(String(value))}]`;
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const commandState=c=>c.evaluate('__warzoneCommands.send("state")').then(r=>{assert.equal(r.ok,true,'fresh native state acknowledgement');return r.result;});
const dom=(c,selector,expression='e.textContent')=>c.evaluate(`(()=>{const e=parent.document.querySelector(${json(selector)})||document.querySelector(${json(selector)});return e?(${expression}):null})()`);
const visible=(c,selector)=>dom(c,selector,'!e.hidden&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0');
async function waitFor(test,message,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=await test();if(value)return value;await delay(120);}throw Error(message);}
async function capture(c,name){const before=await c.evaluate('__kalaWarzoneTouch.report().nativeRenderFrames');await c.wait(`__kalaWarzoneTouch.report().nativeRenderFrames>${before+2}`,10000);await c.paint();return screen('lab-'+name);}
async function ready(c){assert.equal(packageId,'com.rbabbit.warzonetowers.lab');assertLabForeground();await c.wait('Boolean(window.__warzoneCommands?.report().snapshot&&window.__blockNightResearch&&window.__kalaWarzoneTouch?.report().hudVisible&&!window.__kalaWarzoneTouch.report().cameraFacingPending&&window.WarzoneBuildDisplay?.report().models===165)',90000);return c;}
async function connectReady(){let c,last;const end=Date.now()+15000;while(Date.now()<end){try{c=await connect();break;}catch(error){last=error;if(!/not ready|ECONNREFUSED|fetch failed/i.test(String(error)))throw error;await delay(150);}}if(!c)throw last||Error('Game WebView did not register');try{return await ready(c);}catch(error){c.close();throw error;}}
async function start(map='td2'){assert.ok(['td1','td2'].includes(map));adb('shell','am','force-stop',packageId);adb('shell','am','start','-n',packageId+'/com.rbabbit.blocknight.warzone.MainActivity','--es','map',map);await nativeTap('Start game, '+(map==='td1'?'Dustfall':'Iron Valley'));return connectReady();}
function installedIdentity(apk){const installed=adb('shell','pm','path',packageId).toString().trim();assert.match(installed,/^package:\S+\/base\.apk$/,'exactly one Lab base APK');const apkPath=installed.slice(8),digest=adb('shell','sha256sum',apkPath).toString().split(/\s/)[0];assert.match(digest,/^[a-f0-9]{64}$/);const candidate=apk||process.env.WZ_QA_APK||path.join(root,'app/build/outputs/apk/debug/app-debug.apk');const expected=process.env.WZ_QA_EXPECTED_APK_SHA256||(fs.existsSync(candidate)&&crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex'));assert.ok(expected,'supply --apk or WZ_QA_EXPECTED_APK_SHA256 for an exact APK check');assert.equal(digest,expected,'installed Lab APK matches exact candidate');return{packageId,device,candidateAPK_SHA256:digest,installedPath:apkPath};}
async function settle(c){await c.wait('!__warzoneCommands.report().exitingBuild&&!__warzoneCommands.report().pendingItem&&!__warzoneCommands.report().buildingOpening&&!__kalaWarzoneTouch.report().pendingClicks',20000);}
async function closeOverlays(c){
 if(await visible(c,'#warzone-towers-help-overlay'))await c.tap('.wt-help-back');
 if(await c.evaluate('__blockNightResearch.report().open')){await c.tap('#blocknight-research-shell .bn-tech-done');await c.wait('!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose');}
 if(await c.evaluate('__warzoneCommands.report().page')){await c.tap('#wt-command-pages [data-action="back"]');await c.wait('!__warzoneCommands.report().page');}
 if(await c.evaluate('__warzoneCommands.report().buildOpen')){await c.tap('#wt-build-sidebar [data-action="select-mode"]');await c.wait('!__warzoneCommands.report().buildOpen');}
 if(await c.evaluate('Boolean(__warzoneCommands.report().nativeMenu)')){await c.tap('#wt-native-back');await c.wait('!__warzoneCommands.report().nativeMenu');}
 await settle(c);
}
async function waitPausedClock(c,timeout=8000){
 const end=Date.now()+timeout;let last=await clock(c),unchangedSince=Date.now(),samples=0;
 // A queued pre-Escape wave snapshot may arrive after the menu is already
 // visible. Restart the observation window when it arrives; never toggle again.
 while(Date.now()<end){await delay(250);const current=await clock(c);if(current!==last){last=current;unchangedSince=Date.now();samples=0;}else if(++samples>=2&&Date.now()-unchangedSince>=1400)return current;}
 return null;
}
async function waitAdvancingClock(c,before,timeout=10000){
 const end=Date.now()+timeout;let last=before,advances=0;
 while(Date.now()<end){await delay(200);const current=await clock(c);if(current>last){last=current;if(++advances>=2)return current;}}
 throw Error('Native clock did not continue advancing after one resume action');
}
async function isPaused(c){return await waitPausedClock(c,2600)!==null;}
async function pause(c){await closeOverlays(c);const already=await waitPausedClock(c,2600);if(already!==null)return already;await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');const stopped=await waitPausedClock(c,8000);assert.notEqual(stopped,null,'native clock settles and remains paused after one Escape');return stopped;}
async function resume(c){await closeOverlays(c);const stopped=await waitPausedClock(c,2600);if(stopped===null)return clock(c);await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');return waitAdvancingClock(c,stopped,10000);}
async function openPage(c,page){await closeOverlays(c);if(page==='saved'){await c.tap('#wt-open-design');await c.wait('__warzoneCommands.report().page==="design"');await c.tap('#wt-command-pages .wt-design-summary [data-page="saved"]');}else await c.tap('#wt-open-'+page);await c.wait('__warzoneCommands.report().page==='+json(page));await c.paint();}
async function openResearch(c){await closeOverlays(c);await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().labCount===4&&__blockNightResearch.report().catalogCount>0');await c.paint();}
async function selectLab(c,id){const labs=await c.evaluate('__blockNightResearch.report().labs'),index=labs.findIndex(l=>l.id===id),lab=labs[index];assert.ok(lab,'prepared ordinary lab '+id);await c.tap('#blocknight-research-shell '+attribute('data-lab',index));await c.wait('__blockNightResearch.report().labs[__blockNightResearch.report().activeLab]?.id==='+id);return lab;}
async function selectResearchTopic(c,id){
 const selector='#blocknight-research-shell '+attribute('data-topic-id',id);
 // A just-started topic leaves the available catalogue on the next native
 // update. Validate the intended card after its real touch, before Assign.
 for(let attempt=0;attempt<3;attempt++){
  await c.tap(selector);await c.paint();
  if(await dom(c,'.bn-tech-card.selected','e.dataset.topicId')===id)return;
  await delay(150);
 }
 throw Error('Fixture did not select the intended research card: '+id);
}
function readFixture(name){const file=fixturePaths[name]||path.resolve(name),data=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(data.seeded===true,false,'ordinary fixture only');const required=['gam.json','droid.json','struct.json','scriptstate.json','game.map','ttypes.ttp','visstate.bjo'];assert.ok(required.every(n=>Array.isArray(data.files?.[n])),'complete native fixture, including map/terrain/visibility bytes');if(data.sha256)assert.equal(crypto.createHash('sha256').update(JSON.stringify(data.files)).digest('hex'),data.sha256);const gam=JSON.parse(Buffer.from(data.files['gam.json']).toString());assert.match(gam.levelName,/TowerDefense2/,'these prepared fixtures are Iron Valley');return{file,data,gam};}
async function restoreFixture(c,name,report,options={}){
 const {file,data,gam}=readFixture(name);await resume(c);await c.wait('!__blockNightResearch.report().runner&&!__blockNightResearch.report().pendingCommand&&__blockNightResearch.report().dirtyLabIds.length===0',15000);
 assert.equal((await commandState(c)).mapHeight,64,'Iron Valley is running before its restore');
 // A genuine F7 creates the slot descriptor in a newly installed Lab app.
 await c.save('before-'+path.basename(file,'.json'));const now=await clock(c);if(now>=gam.gameTime-1000&&now<gam.gameTime+20000)await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+(gam.gameTime+20500),25000);
 await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave';f.mkdirTree(p);for(const [n,b]of Object.entries(${json(data.files)})){if(!/^[a-zA-Z0-9_.-]+$/.test(n))throw Error('Invalid native filename');f.writeFile(p+'/'+n,new Uint8Array(b));}return true})()`);
 await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true',{timeoutMs:90000});
 await c.wait(`__warzoneTowersWaves.report().snapshot.gameTime>=${gam.gameTime-500}&&__warzoneTowersWaves.report().snapshot.gameTime<${gam.gameTime+18000}`,90000,{timeoutMs:90000});
 // GameLoaded emits initial packets before timer/script processing resumes.
 // Establish advancing native time before waiting on a fresh script command.
 // A genuinely visible Pause menu needs explicit screenshot confirmation;
 // a stopped clock alone must never trigger another Escape.
 const loadReadiness=await require('./observe-native-load.cjs').observe(c,{label:'restore-'+path.basename(file,'.json'),...options});
 if(report)(report.nativeLoadReadiness??=[]).push(loadReadiness);
 const sync=await c.evaluate('__blockNightResearch.report().bridgeSyncs');await c.wait('__blockNightResearch.report().bridgeSyncs>'+sync,10000);
 const fresh=await commandState(c);assert.ok([160003,160005,160011].every(id=>fresh.trucks.some(t=>t.id===id)),'restored native western trucks');assert.ok([160157,160167].every(id=>fresh.factories.some(f=>f.id===id)),'restored ordinary factories');
 const globals=JSON.parse(Buffer.from(data.files['scriptstate.json']).toString()).globals_0,queues=globals.blockNightV28Queues||{};
 assert.ok(fresh.researchQueues.every(q=>json(q.topicIds)===json(queues[String(q.labId)]||[])),'fresh native lab queues match complete save');
 const unitRecords=units=>units.map(u=>[u.id,u.factoryId,u.gameTime,u.name,u.body,u.propulsion]).sort((a,b)=>a[0]-b[0]);assert.deepEqual(unitRecords(fresh.finishedUnits),unitRecords((globals.wtcmd_finishedUnits||[]).slice(-16)),'native completed-unit records prove this exact restored context');
 if(report)(report.restores??=[]).push({fixture:path.relative(root,file).replaceAll('\\','/'),source:data.source||'complete ordinary native QuickSave',seeded:false,fileCount:Object.keys(data.files).length,completeSaveSHA256:crypto.createHash('sha256').update(json(data.files)).digest('hex'),targetTime:gam.gameTime,observedTime:fresh.gameTime,trucks:fresh.trucks.map(t=>({id:t.id,x:t.x,y:t.y})),researchQueues:fresh.researchQueues,finishedUnitRecords:unitRecords(fresh.finishedUnits)});
 return fresh;
}
async function dockCounts(c,report,label){
 await closeOverlays(c);
 const sample=()=>c.host(`(()=>{const w=document.getElementById('warzone-game-frame').contentWindow,dock=TowersLab.report(),r=w.__blockNightResearch.report(),f=w.__warzoneCommands.report().snapshot.factories.filter(f=>f.ready);return{dock,native:{labs:r.labs.length,researching:r.labs.filter(l=>Boolean(l.topicId)).length,factories:f.length,producing:f.filter(f=>Boolean(f.active)||!f.idle).length,waiting:f.reduce((n,f)=>n+f.queue.length,0)},researchLabel:document.getElementById('lab-ops-research').textContent,productionLabel:document.getElementById('lab-ops-production').textContent}})()`);
 const value=await waitFor(async()=>{const v=await sample();return v.dock.visible&&!v.dock.error&&Object.entries(v.native).every(([key,value])=>v.dock[key]===value)&&v;},'activity dock follows actual native lab/factory counts',8000);
 (report.dockCounts??=[]).push({label,...value});return value;
}
async function collapseDock(c,collapsed){await closeOverlays(c);await waitFor(()=>visible(c,'#lab-ops-toggle'),'activity dock toggle visible');if(await c.host('TowersLab.report().collapsed')!==collapsed)await c.tap('#lab-ops-toggle');await waitFor(async()=>await c.host('TowersLab.report().collapsed')===collapsed,'activity dock collapsed state');assert.equal(await c.host('localStorage.getItem("lab-ops-collapsed")'),String(collapsed));return c.host('TowersLab.report()');}
async function dockNavigation(c,report){
 await collapseDock(c,false);await dockCounts(c,report,'expanded-after-restart');await c.tap('#lab-ops-research');await c.wait('__blockNightResearch.report().open');await waitFor(async()=>!await c.host('TowersLab.report().visible'),'research covers activity dock');await closeOverlays(c);
 await waitFor(()=>visible(c,'#lab-ops-production'),'production dock control visible after research return');await c.tap('#lab-ops-production');await c.wait('__warzoneCommands.report().page==="factory"');await waitFor(async()=>!await c.host('TowersLab.report().visible'),'factory covers activity dock');await closeOverlays(c);await capture(c,'activity-dock-restored-after-both-controls');report.dockNavigation={researchOpened:true,factoryOpened:true,expanded:true};return c;
}
async function scrollFactory(c,factoryId,report){
 const selector='#wt-command-pages .wt-work-list',position=()=>dom(c,selector,'({top:e.scrollTop,max:e.scrollHeight-e.clientHeight})');const before=await position();if(before.max<25){report.factoryScroll={applicable:false,reason:'ordinary available content does not overflow',before};return;}
 const p=await c.evaluate(`(()=>{const e=parent.document.querySelector(${json(selector)})||document.querySelector(${json(selector)}),r=e.getBoundingClientRect(),f=e.ownerDocument===document?parent.document.getElementById('warzone-game-frame').getBoundingClientRect():{x:0,y:0};return{x:r.x+f.x+r.width*.55,y1:r.y+f.y+r.height*.85,y2:r.y+f.y+r.height*.2,w:parent.innerWidth,h:parent.innerHeight}})()`),png=adb('exec-out','screencap','-p');adb('shell','input','swipe',String(Math.round(p.x*png.readUInt32BE(16)/p.w)),String(Math.round(p.y1*png.readUInt32BE(20)/p.h)),String(Math.round(p.x*png.readUInt32BE(16)/p.w)),String(Math.round(p.y2*png.readUInt32BE(20)/p.h)),'450');
 const settled=async()=>{let last=-1,count=0;return waitFor(async()=>{const v=await position();count=Math.abs(v.top-last)<.5?count+1:0;last=v.top;return count>=3&&v;},'actual factory swipe/scroll settles',6000);};const scrolled=await settled();assert.ok(scrolled.top>Math.min(10,before.max),'real factory swipe moves scrollable catalogue');await capture(c,'factory-scrolled-before-selection');
 await c.tap('#wt-command-pages .wt-rail '+attribute('data-factory',factoryId));await c.paint();const after=await settled();assert.ok(Math.abs(after.top-scrolled.top)<2,'same-factory render retains inner catalogue scroll');report.factoryScroll={applicable:true,before,scrolled,after};await capture(c,'factory-scroll-retained-after-selection');
}
async function selectedTemplateVisible(c,report){
 const geometry=await dom(c,'#wt-command-pages [data-selected-design="true"]',`(()=>{const b=e.querySelector('[data-produce]'),r=b?.getBoundingClientRect(),p=e.closest('.wt-work-list').getBoundingClientRect();return{name:e.querySelector('h2').textContent,button:r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right}:null,panel:{top:p.top,bottom:p.bottom,left:p.left,right:p.right},hit:!!r&&b.contains(e.ownerDocument.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()`);assert.ok(geometry?.button&&geometry.hit,'USE TEMPLATE reveals an actual reachable Produce button');assert.ok(geometry.button.top>=geometry.panel.top-1&&geometry.button.bottom<=geometry.panel.bottom+1,'chosen template action is inside its visible scrolling panel');report.selectedTemplateVisible=geometry;await capture(c,'blueprint-use-template-reveals-factory-design');
}
async function researchQueues(c,report){
 await restoreFixture(c,'early',report);await openResearch(c);await selectLab(c,160169);
 for(const topic of ['R-Vehicle-Body05','R-Vehicle-Engine03']){await selectResearchTopic(c,topic);await waitFor(()=>dom(c,'.bn-tech-assign','!e.disabled'),'available research action');assert.equal(await dom(c,'.bn-tech-card.selected','e.dataset.topicId'),topic,'intended research is selected before Assign');await c.tap('.bn-tech-assign');if(topic==='R-Vehicle-Body05')await c.wait('__blockNightResearch.report().labs.find(l=>l.id===160169)?.topicId==="R-Vehicle-Body05"');else await c.wait('__warzoneCommands.report().snapshot.researchQueues.some(q=>q.labId===160169&&q.topicIds.includes("R-Vehicle-Engine03"))');}
 const before=await commandState(c);assert.ok(before.researchQueues.find(q=>q.labId===160169).topicIds.includes('R-Vehicle-Engine03'));await capture(c,'research-manual-active-and-queue');
 await c.tap('.bn-tech-queue-remove'+attribute('data-queue-lab',160169));await c.wait('!__warzoneCommands.report().snapshot.researchQueues.some(q=>q.labId===160169&&q.topicIds.includes("R-Vehicle-Engine03"))');
 const labs=await c.evaluate('__blockNightResearch.report().labs');assert.equal(labs.find(l=>l.id===160169).topicId,'R-Vehicle-Body05');assert.ok(labs.filter(l=>l.id!==160169).every(l=>l.idle),'manual assignment affects only chosen lab');
 await closeOverlays(c);await dockCounts(c,report,'ordinary-manual-research-active');await capture(c,'activity-dock-actual-research');const native=await c.save('research-queue-native');report.researchQueue={before,after:native.commands.snapshot,nativeTargets:Object.values(native['struct.json']).filter(s=>s.name==='A0ResearchFacility').map(s=>({id:s.id,target:s['Research/target']||null})),nativeQueues:native['scriptstate.json'].globals_0.blockNightV28Queues};return c;
}
async function researchCompletion(c,report){
 await restoreFixture(c,'research',report);await openResearch(c);await selectLab(c,160169);const before=await c.evaluate('__blockNightResearch.report()');assert.equal(before.labs.find(l=>l.id===160169).topicId,'R-Vehicle-Body05');assert.ok(before.queues[before.labs.findIndex(l=>l.id===160169)].includes('Fuel Injection Engine Mk3'));
 await selectLab(c,160171);assert.match(await dom(c,'.bn-tech-active-name'),/Vehicle|Metal|Alloy/i);await selectLab(c,160169);await c.tap('#blocknight-research-shell [data-topic-id="R-Vehicle-Engine03"]');await capture(c,'research-before-native-completion');
 await c.wait('__blockNightResearch.report().labs.find(l=>l.id===160169)?.topicId==="R-Vehicle-Engine03"',90000);const after=await c.evaluate('__blockNightResearch.report()');assert.equal(after.labs.find(l=>l.id===160171).topicId,'R-Vehicle-Metals01');assert.ok(after.labs.filter(l=>[160173,160175].includes(l.id)).every(l=>l.idle));assert.ok((await commandState(c)).parts.includes('Body5REC'),'Cobra completion unlocks actual native body');
 await capture(c,'research-completed-native-and-advanced');await closeOverlays(c);const native=await c.save('research-completion-native');const actual=Object.values(native['struct.json']).find(s=>s.id===160169);assert.equal(actual['Research/target'],'R-Vehicle-Engine03');assert.ok(!native['scriptstate.json'].globals_0.blockNightV28Queues['160169'].includes('R-Vehicle-Engine03'));
 report.researchCompletion={before,after,nativeTarget:actual,nativeQueues:native['scriptstate.json'].globals_0.blockNightV28Queues};return c;
}
function chooseTemplate(state,factory){return state.templates.find(t=>factory.templates.includes(t.id)&&/(MG1Mk1|Cannon1Mk1)/.test(json(t)))||state.templates.find(t=>factory.templates.includes(t.id));}
async function produceRecipe(c,template){
 const native='#wt-command-pages '+attribute('data-produce-template',template.id);
 if(await dom(c,native,'!e.disabled')){await c.tap(native);return 'native-template';}
 const saved=await c.evaluate(`__warzoneCommands.report().saved.find(d=>JSON.stringify([d.body,d.propulsion,d.turrets])===${json(templateKey(template))})`);
 assert.ok(saved,'native template has an equivalent saved recipe visible in Factory');
 await c.tap('#wt-command-pages '+attribute('data-produce',saved.id));return 'saved-recipe';
}
async function production(c,report){
 const initial=await restoreFixture(c,'early',report);await openPage(c,'factory');const factories=initial.factories.filter(f=>f.ready&&f.templates.length);assert.ok(factories.length>=2,'two prepared ordinary factories');const baseline=new Set(initial.finishedUnits.map(u=>u.id)),orders=[];
 for(const f of factories.slice(0,2)){const design=chooseTemplate(initial,f);assert.ok(design);await c.tap('#wt-command-pages '+attribute('data-factory',f.id));await c.tap('#wt-command-pages [data-count="1"]');const path=await produceRecipe(c,design);await c.wait(`(()=>{const f=__warzoneCommands.report().snapshot.factories.find(f=>f.id===${f.id});return f.active||f.queue.length||__warzoneCommands.report().snapshot.finishedUnits.some(u=>u.factoryId===${f.id}&&!${json([...baseline])}.includes(u.id))})()`);orders.push({factoryId:f.id,template:design,path});}
 const first=factories[0];await c.tap('#wt-command-pages '+attribute('data-factory',first.id));await c.tap('#wt-command-pages [data-count="5"]');await produceRecipe(c,orders[0].template);await c.wait(`__warzoneCommands.report().snapshot.factories.find(f=>f.id===${first.id}).queue.length>=2`);
 await capture(c,'factory-real-active-and-waiting');await dockCounts(c,report,'ordinary-native-production-active');await capture(c,'activity-dock-actual-production');await openPage(c,'factory');await c.tap('#wt-command-pages '+attribute('data-factory',first.id));const beforeClear=(await commandState(c)).factories.find(f=>f.id===first.id);await c.tap('#wt-command-pages '+attribute('data-clear-production',first.id));await c.wait(`!__warzoneCommands.report().snapshot.factories.find(f=>f.id===${first.id}).queue.length`);
 const afterClear=await commandState(c);assert.ok(!beforeClear.active||afterClear.factories.find(f=>f.id===first.id).active?.id===beforeClear.active.id||afterClear.finishedUnits.some(u=>u.factoryId===first.id&&!baseline.has(u.id)),'clear waiting preserves or genuinely finishes active production');await closeOverlays(c);
 await c.wait(`(()=>{const u=__warzoneCommands.report().snapshot.finishedUnits.filter(u=>!${json([...baseline])}.includes(u.id));return ${json(orders.map(o=>o.factoryId))}.every(id=>u.some(v=>v.factoryId===id))})()`,90000);
 const native=await c.save('production-native-completed'),produced=native.commands.snapshot.finishedUnits.filter(u=>!baseline.has(u.id)),droids=Object.values(native['droid.json']);for(const id of orders.map(o=>o.factoryId)){const u=produced.find(u=>u.factoryId===id);assert.ok(droids.some(d=>d.id===u.id&&d.player===0&&d.position.every(Number.isFinite)),'actual completed normal unit from factory '+id);}
 report.production={orders,beforeClear,afterClear,produced,nativeUnits:droids.filter(d=>produced.some(u=>u.id===d.id))};await openPage(c,'factory');await capture(c,'factory-normal-native-completed');return c;
}
const equipment=d=>d.turrets?.length?d.turrets:d.weapons?.length?d.weapons:[d.construct,d.repair,d.brain,d.ecm,d.sensor].filter(v=>v&&!/null/i.test(v)).slice(0,1);
const templateKey=d=>json([d.body,d.propulsion,equipment(d)]);
function imeVisible(){return /\bmInputShown=true\b/.test(adb('shell','dumpsys','input_method').toString());}
async function editName(c,name,captureName='design-real-keyboard'){await c.tap('#wt-design-name');await waitFor(()=>imeVisible(),'real Android keyboard must visibly open before name input');adb('shell','input','keycombination','113','29');for(let i=0;i<name.length;i+=4){adb('shell','input','text',name.slice(i,i+4).replaceAll(' ','%s'));await waitFor(async()=>await dom(c,'#wt-design-name','e.value')===name.slice(0,i+4),'observed WebView input batch');}assert.ok(imeVisible());await capture(c,captureName);adb('shell','input','keyevent','4');await waitFor(()=>!imeVisible(),'Android keyboard dismissed before page return');assert.equal(await c.evaluate('__warzoneCommands.report().page'),'design');}
async function designs(c,report){
 const initial=await restoreFixture(c,'early',report);await openPage(c,'factory');const existing=await c.evaluate('__warzoneCommands.report().saved'),f=initial.factories.find(f=>f.ready&&f.templates.length),template=initial.templates.find(t=>f.templates.includes(t.id)&&!existing.some(d=>templateKey(d)===templateKey(t)))||chooseTemplate(initial,f);await c.tap('#wt-command-pages '+attribute('data-factory',f.id));
 let savedTemplate=existing.find(d=>d.factoryTemplate&&templateKey(d)===templateKey(template));
 const newlySaved=!savedTemplate;if(newlySaved){await c.tap('#wt-command-pages '+attribute('data-save-template',template.id));savedTemplate=await c.wait(`__warzoneCommands.report().saved.find(d=>d.factoryTemplate&&JSON.stringify([d.body,d.propulsion,d.turrets])===${json(templateKey(template))})`);}
 await scrollFactory(c,f.id,report);await openPage(c,'saved');await c.tap('#wt-command-pages '+attribute('data-produce-design',savedTemplate.id));await c.wait('__warzoneCommands.report().page==="factory"');const selectedFactory=await dom(c,'#wt-factory-select','Number(e.value)');assert.ok((await commandState(c)).factories.find(f=>f.id===selectedFactory));await selectedTemplateVisible(c,report);
 await openPage(c,'design');await c.tap('#wt-command-pages [data-action="new-design"]');if(await visible(c,'#wt-command-pages [data-action="discard-draft"]'))await c.tap('#wt-command-pages [data-action="discard-draft"]');
 for(const [step,part]of [['body','Body1REC'],['propulsion','wheeled01'],['0','MG1Mk1']]){await c.tap('#wt-command-pages '+attribute('data-step',step));await c.tap('#wt-command-pages '+attribute('data-part',part)+attribute('data-slot',step));}
 const name='Scout '+String(Date.now()).slice(-5);await editName(c,name);await waitFor(()=>dom(c,'#wt-save-design','!e.disabled'),'native validated design enables Save');await c.tap('#wt-save-design');const custom=await c.wait(`__warzoneCommands.report().saved.find(d=>d.name===${json(name)})`);assert.ok(custom.cost>0);await capture(c,'saved-phone-template-and-custom-design');const before=await c.evaluate('JSON.parse(BlockNightAndroid.loadDesigns())');assert.ok(before.designs.some(d=>d.id===custom.id)&&before.designs.some(d=>d.id===savedTemplate.id));
 await closeOverlays(c);await collapseDock(c,true);await capture(c,'activity-dock-collapsed-before-restart');await pause(c);c.close();c=await start('td2');await waitFor(()=>visible(c,'#lab-ops-toggle'),'collapsed activity dock restored after restart');assert.equal(await c.host('TowersLab.report().collapsed'),true,'dock preference survives process restart');await openPage(c,'saved');const after=await c.evaluate('JSON.parse(BlockNightAndroid.loadDesigns())');assert.deepEqual(after,before,'app-private library survives genuine Lab force-stop/relaunch');const models=await c.evaluate('__warzoneCommands.report().saved');assert.ok(models.some(d=>d.id===custom.id)&&models.some(d=>d.id===savedTemplate.id));await capture(c,'phone-library-after-process-restart');await dockNavigation(c,report);
 report.designs={custom,savedTemplate,newlySaved,libraryBefore:before,libraryAfter:after,restartedPackage:packageId,dockCollapsePersisted:true};return c;
}
async function keyboardReturns(c,report){
 await resume(c);await openPage(c,'saved');const before=await c.evaluate('JSON.parse(BlockNightAndroid.loadDesigns())'),design=before.designs.find(d=>!d.factoryTemplate&&d.name.startsWith('Scout '));assert.ok(design,'UI-saved custom design from the completed journey');await c.tap('#wt-command-pages '+attribute('data-edit',design.id));await c.wait('__warzoneCommands.report().page==="design"');
 const rounds=[];for(let i=0;i<2;i++){await editName(c,design.name,'repeat-keyboard-visible-'+(i+1));await waitFor(()=>dom(c,'#wt-save-design','!e.disabled'),'native validation recovers after keyboard return');await capture(c,'repeat-keyboard-return-'+(i+1));rounds.push({round:i+1,name:await dom(c,'#wt-design-name','e.value'),page:await c.evaluate('__warzoneCommands.report().page'),imeDismissed:!imeVisible()});}assert.deepEqual(await c.evaluate('JSON.parse(BlockNightAndroid.loadDesigns())'),before,'re-entering identical draft names leaves phone library unchanged');report.keyboardReturns={designId:design.id,rounds,phoneLibraryUnchanged:true};return c;
}
async function returns(c,report){
 await resume(c);const cycles=[];for(let i=0;i<2;i++){
  await openResearch(c);adb('shell','input','keyevent','4');await c.wait('!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose');
  for(const page of ['factory','design','queue']){await openPage(c,page);await capture(c,'return-'+i+'-'+page);adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page');await settle(c);}
  await c.tap('#blocknight-help');await waitFor(()=>visible(c,'#warzone-towers-help-overlay'),'help opens');await capture(c,'return-'+i+'-help');await c.tap('.wt-help-back');
  adb('shell','input','keyevent','4');const stopped=await waitPausedClock(c,8000);assert.notEqual(stopped,null,'Android Back visibly pauses simulation after queued snapshots settle');adb('shell','input','keyevent','4');await waitAdvancingClock(c,stopped,10000);
  await c.tap('#wt-open-build');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1');adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().buildOpen');cycles.push({round:i+1,freshNative:await commandState(c)});
 }report.returns={cycles};return c;
}
async function layouts(c,report){
 await resume(c);const png=adb('exec-out','screencap','-p'),profile={width:png.readUInt32BE(16),height:png.readUInt32BE(20),density:adb('shell','wm','density').toString(),fontScale:adb('shell','settings','get','system','font_scale').toString().trim(),host:await c.host('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})')};assert.ok(profile.width>profile.height,'actual landscape screenshot');assert.ok(Math.abs(profile.width/profile.height-profile.host.width/profile.host.height)<.03,'actual app viewport agrees with landscape screenshot');
 for(const page of ['factory','design','saved','queue']){await openPage(c,page);await capture(c,'layout-'+page+'-'+profile.width+'-'+profile.fontScale);}
 await openResearch(c);await capture(c,'layout-research-'+profile.width+'-'+profile.fontScale);await closeOverlays(c);await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="ALL"]');const rows=await require('./audit-build-display.cjs').catalogue(c);await capture(c,'layout-build-'+profile.width+'-'+profile.fontScale);report.layouts={profile,catalogue:rows};return c;
}
async function run(phase='all',options={}){
 const phases={research:researchQueues,'research-completion':researchCompletion,production,designs,returns,layouts,keyboard:keyboardReturns};assert.ok(phase==='all'||phases[phase],'unknown Lab phase');const report={passed:false,phase,seeded:false,started:new Date().toISOString(),identity:installedIdentity(options.apk),cases:[]};let c;
 try{c=options.start?await start('td2'):await connectReady();report.runtimeErrorsByPhase={};for(const name of phase==='all'?['research','research-completion','production','designs','returns','layouts']:[phase]){console.log('START Lab '+name);const previous=c;c=await phases[name](c,report)||c;const errors=[...previous.errors,...(previous!==c?c.errors:[])];report.runtimeErrorsByPhase[name]=errors;assert.deepEqual(errors,[],'uncaught WebView exceptions during '+name);report.cases.push(name);fs.writeFileSync(path.join(out,'lab-journey-'+phase+'.json'),JSON.stringify(report,null,2));console.log('PASS Lab '+name);}await pause(c);assert.deepEqual(c.errors,[],'uncaught WebView runtime exceptions');report.errors=c.errors;report.passed=true;console.log(json({passed:true,phase,cases:report.cases,sha256:report.identity.candidateAPK_SHA256}));return report;
 }catch(error){report.failure=String(error.stack||error);try{if(c){await capture(c,phase+'-failure');report.failureState={commands:await c.evaluate('__warzoneCommands.report()'),research:await c.evaluate('__blockNightResearch.report()'),waves:await c.evaluate('__warzoneTowersWaves.report()')};if(imeVisible()){adb('shell','input','keyevent','4');await waitFor(()=>!imeVisible(),'failure keyboard recovery');}await pause(c);}}catch(recovery){report.recoveryFailure=String(recovery);}throw error;
 }finally{report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'lab-journey-'+phase+'.json'),JSON.stringify(report,null,2));c?.close();}
}
module.exports={fixturePaths,connectReady,start,installedIdentity,ready,commandState,capture,closeOverlays,waitPausedClock,waitAdvancingClock,isPaused,pause,resume,openPage,openResearch,selectLab,readFixture,restoreFixture,dockCounts,collapseDock,dockNavigation,scrollFactory,selectedTemplateVisible,editName,keyboardReturns,researchQueues,researchCompletion,production,designs,returns,layouts,run};
if(require.main===module){const args=process.argv.slice(2),n=args.indexOf('--apk');run(args[0]||'all',{apk:n>=0?args[n+1]:undefined,start:args.includes('--start')}).catch(e=>{console.error(e);process.exitCode=1;});}
