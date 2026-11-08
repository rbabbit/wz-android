'use strict';
// Actual Android UI actions on ordinary Duel starts. Observe native state/saves;
// never grant units/power/research, inject save fields or issue hidden build orders.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const args=process.argv.slice(2),value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const branch=value('--branch',process.env.WZ_DUEL_BRANCH);assert.ok(['cannon','rockets'].includes(branch),'Use --branch cannon|rockets');
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-10/duel-'+branch);
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),{controls}=require('./audit-smooth-building.cjs');
const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'../scenario/duel/policy.json'),'utf8'));
const research=JSON.parse(fs.readFileSync(path.join(__dirname,'../scenario/duel/research.json'),'utf8'));
const json=JSON.stringify,attr=(name,id)=>`[${name}=${json(String(id))}]`,opponent=branch==='cannon'?'rockets':'cannon';
const report={passed:false,seeded:false,branch,opponent,phase:'readiness',checks:{},screenshots:[],started:new Date().toISOString(),method:'Fresh ordinary authored Duel; actual catalogue/lab/production/field touches; fresh native replies and genuine F7 save. No native world edits.'};
const output=path.join(l.out,'duel.json'),write=()=>fs.writeFileSync(output,json(report,null,2)+'\n');
const equipment=d=>d.turrets?.length?d.turrets:d.weapons?.length?d.weapons:[d.construct,d.repair,d.brain,d.ecm,d.sensor].filter(v=>v&&!/null/i.test(v)).slice(0,1);
const templateKey=d=>json([d.body,d.propulsion,equipment(d)]);
const fresh=async c=>{const reply=await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})');assert.equal(reply.ok,true);return reply.result;};
const observe=c=>c.evaluate('({duel:__warzoneDuel.report(),commands:__warzoneCommands.report(),research:__blockNightResearch.report(),touch:__kalaWarzoneTouch.report(),html:__towersHtml.report(),models:WarzoneBuildDisplay.report(),config:__warzoneDuelConfig,viewport:[parent.innerWidth,parent.innerHeight,innerWidth,innerHeight]})');
async function shot(c,name){const file=await j.capture(c,'10-'+branch+'-'+name);report.screenshots.push(path.relative(l.root,file).replaceAll('\\','/'));write();return file;}
async function openResearch(c){await j.closeOverlays(c);await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().labCount===5&&__blockNightResearch.report().catalogCount>1',15000);await c.paint();}
async function choose(c,id){await c.tap('.bn-tech-card'+attr('data-topic-id',id));await c.wait('document.querySelector(".bn-tech-card.selected")?.dataset.topicId==='+json(id));}
async function add(c,id){await choose(c,id);const adds=await c.evaluate('__blockNightResearch.report().queueAdds');await c.tap('.bn-tech-assign');await c.wait('__blockNightResearch.report().queueAdds>'+adds);await c.wait('!__blockNightResearch.report().runner&&!__blockNightResearch.report().dirtyLabIds.length',12000);}
async function produce(c,template){const selector='#wt-command-pages '+attr('data-produce-template',template.id);
 if(await c.evaluate(`Boolean(parent.document.querySelector(${json(selector)}))`)){await c.tap(selector);return 'native-template';}
 const saved=await c.evaluate(`__warzoneCommands.report().saved.find(d=>JSON.stringify([d.body,d.propulsion,d.turrets])===${json(templateKey(template))})`);
 assert.ok(saved,'existing native recipe or equivalent phone template is visible');await c.tap('#wt-command-pages '+attr('data-produce',saved.id));return 'saved-template';
}
const productionSignature=s=>json(s.factories.map(f=>[f.id,f.active?.id||'',f.queue.map(q=>q.id)]));
async function forbiddenResearch(c,labId,topicId){
 const nonce='qa-forbidden-'+Date.now();
 const offsets=await c.evaluate(`(()=>{const m=LaunchedModule,f=m.FS,p=m.WZVAL_configDirPath+'/logs';return Object.fromEntries(f.readdir(p).filter(n=>n.endsWith('.log')).map(n=>[n,f.stat(p+'/'+n).size]))})()`);
 await c.evaluate(`(()=>{const f=LaunchedModule.FS,p='/data/mp/multiplay/script/rules/blocknight-queue-command.json',request=${json({version:32,nonce,labs:[{labId,topicIds:[topicId]}]})};f.writeFile(p+'.tmp',JSON.stringify(request),{encoding:'utf8'});f.rename(p+'.tmp',p);return true})()`);
 return c.wait(`(()=>{const m=LaunchedModule,f=m.FS,p=m.WZVAL_configDirPath+'/logs',offsets=${json(offsets)};for(const n of f.readdir(p).filter(n=>n.endsWith('.log'))){const start=offsets[n]??0,size=f.stat(p+'/'+n).size;if(size<=start)continue;const b=new Uint8Array(Math.min(size-start,128*1024)),s=f.open(p+'/'+n,'r');let count;try{count=f.read(s,b,0,b.length,start);}finally{f.close(s);}for(const line of new TextDecoder().decode(b.subarray(0,count)).split(/\\r?\\n/)){const i=line.indexOf('BNQUEUE:');if(i<0)continue;try{const ack=JSON.parse(line.slice(i+8));if(ack.nonce===${json(nonce)})return ack;}catch(_){}}}return null})()`,15000);
}
async function readOnlySite(c,workers,itemId){
 assert.equal(await c.evaluate('WarzoneTerrain.refresh()'),true);
 const candidates=await c.evaluate(`(()=>{const s=__warzoneCommands.report().snapshot,ids=${json(workers)},list=[],sidebar=parent.document.getElementById('wt-build-sidebar').getBoundingClientRect(),frame=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();for(const t of s.trucks.filter(t=>ids.includes(t.id)))for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){if(Math.abs(dx)+Math.abs(dy)<2)continue;const x=t.x+dx,y=t.y+dy;if(x<1||y<1||x>=s.mapWidth-1||y>=s.mapHeight-1)continue;const z=WarzoneTerrain.heightAt((x+.5)*128,(y+.5)*128),p=z===null?null:WarzoneTerrain.project((x+.5)*128,(y+.5)*128,z);if(!p||p.x+frame.x<=sidebar.right+8||p.y<8||p.y>innerHeight-40||!__kalaWarzoneTouch.isBattlefieldPoint(p.x,p.y)||!parent.document.elementFromPoint(p.x+frame.x,p.y+frame.y)?.closest('#warzone-game-frame'))continue;list.push({x,y,point:p,d:Math.abs(dx)+Math.abs(dy)});}return list.sort((a,b)=>a.d-b.d).filter((r,i,a)=>a.findIndex(v=>v.x===r.x&&v.y===r.y)===i).slice(0,24)})()`);
 for(const site of candidates){const r=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:${json(itemId)},x:${site.x},y:${site.y},workerIds:${json(workers)},session:'qa-duel-readonly'})`);if(r.ok)return {...site,preview:r};}
 return null;
}
async function run(){let c;try{
 report.identity=j.installedIdentity(value('--apk',process.env.WZ_QA_APK));report.candidateAPK_SHA256=report.identity.candidateAPK_SHA256;write();
 c=await j.connectReady();await c.wait(`__warzoneDuel?.report().snapshot?.phase==='active'&&__warzoneDuel.report().snapshot.humanBranch===${json(branch)}&&__warzoneDuel.report().cameraReady`,15000);
 const firstClock=await c.evaluate('__warzoneDuel.report().snapshot.gameTime');await c.wait('__warzoneDuel.report().snapshot.gameTime>'+Number(firstClock+750),10000);
 report.initial=await observe(c);report.initialNative=await fresh(c);const packet=report.initial.duel.snapshot;
 assert.equal(packet.mode,'duel');assert.equal(packet.botBranch,opponent);assert.equal(report.initial.models.models,165);assert.equal(report.initialNative.mapWidth,37);assert.equal(report.initialNative.mapHeight,75);assert.equal(report.initialNative.trucks.length,4);
 assert.ok(report.initial.research.labs.length===5&&report.initial.research.labs.every(x=>x.idle),'fresh human research remains manually controlled');
 assert.equal(await c.host('Boolean(document.getElementById("warzone-towers-next-wave")||document.getElementById("warzone-towers-wave-hud"))'),false);
 report.phoneLibrary=await c.evaluate('BlockNightAndroid.loadDesigns()');const designs=JSON.parse(report.phoneLibrary).designs||[],machineguns=designs.filter(d=>equipment(d).some(id=>/^MG/i.test(id)));
 assert.ok(machineguns.length,'ordinary prior Towers MG phone blueprint is present before this fixture');
 assert.ok(!report.initialNative.parts.some(id=>policy.weaponClass[id]&&policy.weaponClass[id]!==branch));assert.ok(report.initialNative.templates.every(t=>equipment(t).every(id=>!policy.weaponClass[id]||policy.weaponClass[id]===branch)));
 await shot(c,'ordinary-start');report.checks.nativeModeReady=true;write();

 report.phase='research';await openResearch(c);
 report.researchHeading=await c.evaluate('document.querySelector(".bn-tech-brand small").textContent');assert.match(report.researchHeading,new RegExp(branch,'i'));assert.match(report.researchHeading,/SHARED/);
 const ids=await c.evaluate('Array.from(document.querySelectorAll(".bn-tech-card"),e=>e.dataset.topicId)');assert.ok(ids.length>1&&ids.every(id=>['core',branch].includes(policy.researchClass[id])),'native research catalogue contains only branch and shared technologies');
 const choices=ids.slice().sort((a,b)=>(policy.researchClass[b]===branch)-(policy.researchClass[a]===branch)||(research[b]?.researchPoints||0)-(research[a]?.researchPoints||0)).slice(0,2),lab=report.initial.research.labs[0].id;
 await c.tap('.bn-tech-lab[data-lab="0"]');await choose(c,choices[0]);assert.ok((await c.evaluate('__blockNightResearch.report().labs')).every(x=>x.idle),'choosing a card alone starts no research');
 await add(c,choices[0]);await c.wait(`__blockNightResearch.report().labs.find(l=>l.id===${lab})?.topicId===${json(choices[0])}`,10000);await add(c,choices[1]);
 report.researchQueue=await fresh(c);assert.ok(report.researchQueue.researchQueues.find(q=>q.labId===lab).topicIds.includes(choices[1]));assert.ok((await c.evaluate('__blockNightResearch.report().labs')).filter(x=>x.id!==lab).every(x=>x.idle),'only the chosen lab is assigned');
 report.researchTopics=choices;await shot(c,'research-branch-and-manual-queue');await c.tap('.bn-tech-done');await c.wait('!__blockNightResearch.report().open');report.checks.manualResearchBranchAndQueue=true;write();

 report.phase='phone-blueprints';await j.openPage(c,'saved');report.incompatiblePhoneDesigns=[];
 for(const d of machineguns){const status=await c.host(`(()=>{const b=document.querySelector(${json('#wt-command-pages '+attr('data-produce-design',d.id))});return b?{disabled:b.disabled,text:b.closest('article').innerText}:null})()`);assert.ok(status?.disabled,'old MG blueprint stays saved and unavailable in Duel');report.incompatiblePhoneDesigns.push({id:d.id,name:d.name,status});}
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),report.phoneLibrary);await shot(c,'preserved-unavailable-machinegun-blueprints');report.checks.incompatiblePhoneBlueprintsPreserved=true;

 report.phase='negative-native-policy';const policyFactory=report.initialNative.factories.find(f=>f.ready&&f.kind==='Factory');assert.ok(policyFactory);
 const denied=[{label:'existing-phone-machinegun',design:machineguns[0]},{label:'opposite-branch-weapon',design:{id:'qa-forbidden-opposite',name:'Forbidden doctrine probe',body:'Body1REC',propulsion:'wheeled01',turrets:[opponent==='cannon'?'Cannon1Mk1':'Rocket-Pod']}}];
 report.policyRejections=[];
 for(const entry of denied){
  const before=await fresh(c),signature=productionSignature(before);
  const validation=await c.evaluate(`__warzoneCommands.send('validate-design',{design:${json(entry.design)}})`);assert.equal(validation.ok,false,'native design validation rejects '+entry.label);
  const production=await c.evaluate(`__warzoneCommands.send('queue-production',{factoryId:${policyFactory.id},count:1,design:${json(entry.design)}})`);assert.equal(production.ok,false,'native production rejects '+entry.label);
  const after=await fresh(c);assert.equal(productionSignature(after),signature,'rejected request cannot start production or add waiting work');
  report.policyRejections.push({label:entry.label,validation,production,powerBefore:before.power,powerAfter:after.power,productionUnchanged:true});
 }
 const rejectedTopic=opponent==='cannon'?'R-Wpn-Cannon1Mk1':'R-Wpn-Rocket05-MiniPod',idleLab=report.initial.research.labs[1].id;
 const beforeResearch=await fresh(c),ack=await forbiddenResearch(c,idleLab,rejectedTopic);assert.equal(ack.ok,false);assert.equal(ack.reason,'topic-unavailable');
 const afterResearch=await fresh(c);assert.deepEqual(afterResearch.researchQueues.find(q=>q.labId===idleLab)?.topicIds,beforeResearch.researchQueues.find(q=>q.labId===idleLab)?.topicIds);
 assert.ok((await c.evaluate('__blockNightResearch.report().labs')).every(l=>l.topicId!==rejectedTopic),'forbidden research cannot become a native active assignment');
 report.forbiddenResearch={labId:idleLab,topicId:rejectedTopic,ack,queueUnchanged:true};report.checks.nativePolicyEnforced=true;
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),report.phoneLibrary);write();

 report.phase='production';await j.openPage(c,'factory');const native=await fresh(c),starter=branch==='cannon'?'Cannon1Mk1':'Rocket-Pod';
 const factory=native.factories.find(f=>f.ready&&f.kind==='Factory'&&native.templates.some(t=>f.templates.includes(t.id)&&equipment(t).includes(starter)));assert.ok(factory,'ordinary ground factory exposes chosen-branch starter');
 const template=native.templates.find(t=>factory.templates.includes(t.id)&&equipment(t).includes(starter));assert.ok(template);
 await c.tap('#wt-command-pages '+attr('data-factory',factory.id));await c.tap('#wt-command-pages [data-count="1"]');const baseline=native.finishedUnits.map(u=>u.id);
 report.production={factoryId:factory.id,template,paths:[]};report.production.paths.push(await produce(c,template));await c.wait(`(()=>{const f=__warzoneCommands.report().snapshot.factories.find(f=>f.id===${factory.id});return f.active||f.queue.length})()`,10000);report.production.paths.push(await produce(c,template));
 await c.wait(`__warzoneCommands.report().snapshot.factories.find(f=>f.id===${factory.id}).queue.length>0`,10000);report.production.accepted=await fresh(c);assert.equal(report.production.accepted.templates.filter(t=>templateKey(t)===templateKey(template)).length,1,'one native starter recipe after ordinary production');report.checks.noDuplicateStarterCards=true;await shot(c,'normal-active-and-queued-production');await j.closeOverlays(c);

 report.phase='visible-build-trucks';await c.tap('#wt-open-build');await c.wait('!__warzoneCommands.report().selectingTrucks&&!__warzoneCommands.report().exitingBuild',15000);const selected=await fresh(c);
 const group=await c.evaluate('__warzoneCommands.report().nativeBuildGroup');assert.ok(group.length&&selected.selectedUnits.every(u=>u.constructor));assert.deepEqual(group.slice().sort((a,b)=>a-b),selected.selectedUnits.map(u=>u.id).sort((a,b)=>a-b));assert.ok(selected.trucks.filter(t=>group.includes(t.id)).every(t=>t.selected));
 report.build={selected:group,nativeSelected:selected.selectedUnits};await shot(c,'visible-native-truck-highlights');
 const ctl=await controls(c),wall=await c.host('Boolean(document.querySelector(\'#wt-sidebar-catalogue [data-build="A0HardcreteMk1Wall"]\'))');
 if(wall){const site=await readOnlySite(c,group,'A0HardcreteMk1Wall');if(site){await c.tap('#wt-sidebar-catalogue [data-build="A0HardcreteMk1Wall"]');assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'A0HardcreteMk1Wall');await ctl.touch(site.point.x,site.point.y);await c.wait(`__warzoneCommands.report().snapshot.constructionSites.some(s=>s.itemId==='A0HardcreteMk1Wall'&&s.x===${site.x}&&s.y===${site.y})||__warzoneCommands.report().snapshot.finishedBuilds.some(s=>s.itemId==='A0HardcreteMk1Wall'&&s.x===${site.x}&&s.y===${site.y})`,20000);report.build.site=site;report.build.accepted=await fresh(c);}else report.build.siteLimitation='No reachable uncovered wall site passed bounded native preview in this current view.';}
 else report.build.siteLimitation='Hardcrete Wall is not in the current native available catalogue; this pass verifies BUILD selection only.';
 await j.closeOverlays(c);report.checks.visibleNativeTruckSelection=true;write();

 report.phase='native-production-completion';await c.wait(`__warzoneCommands.report().snapshot.finishedUnits.filter(u=>u.factoryId===${factory.id}&&!${json(baseline)}.includes(u.id)).length>=2`,120000);report.production.completed=await fresh(c);
 const save=await c.save('10-'+branch+'-ordinary-native-save'),produced=save.commands.snapshot.finishedUnits.filter(u=>u.factoryId===factory.id&&!baseline.includes(u.id)),droids=Object.values(save['droid.json']).filter(d=>d&&typeof d==='object');
 report.production.nativeUnits=droids.filter(d=>produced.some(u=>u.id===d.id));assert.ok(report.production.nativeUnits.length>=2&&report.production.nativeUnits.every(d=>d.player===0&&d.position.every(Number.isFinite)));
 assert.ok(report.production.nativeUnits.every(d=>json(d).includes(starter)),'genuine F7 native units carry the chosen branch weapon');report.production.finished=produced;report.checks.nativeQueuedProductionCompleted=true;
 if(report.build.site){const s=report.build.site;await c.wait(`__warzoneCommands.report().snapshot.finishedBuilds.some(b=>b.itemId==='A0HardcreteMk1Wall'&&b.x===${s.x}&&b.y===${s.y})`,60000);report.build.completed=await fresh(c);report.checks.nativeConstructionCompleted=true;}
 await shot(c,'ordinary-native-production-completed');

 report.phase='ordinary-bot-observation';const startingBot=packet.diagnostics.players.find(p=>p.player===1).units.map(u=>u.id);
 await c.wait(`__warzoneDuel.report().snapshot.diagnostics.players.find(p=>p.player===1).units.some(u=>!${json(startingBot)}.includes(u.id)&&u.weapons.length)`,Number(value('--bot-wait','120000')));
 report.botBefore=await c.evaluate('__warzoneDuel.report().snapshot');const botUnits=report.botBefore.diagnostics.players.find(p=>p.player===1).units.filter(u=>!startingBot.includes(u.id)&&u.weapons.length);assert.ok(botUnits.every(u=>u.weapons.every(w=>policy.weaponClass[w]===opponent)),'ordinary bot combat units use its opposite branch');
 const botClock=report.botBefore.gameTime;await c.wait('__warzoneDuel.report().snapshot.gameTime>'+Number(botClock+1500),10000);report.botAfter=await c.evaluate('__warzoneDuel.report().snapshot');report.botProducedUnits=botUnits;report.checks.ordinaryBotProduction=true;
 report.botMovementObserved=botUnits.some(u=>report.botAfter.diagnostics.players.find(p=>p.player===1).units.some(v=>v.id===u.id&&(v.x!==u.x||v.y!==u.y)));
 report.limitations=['This branch journey verifies ordinary bot production and records orders/positions; a later sustained combat/native outcome journey is separate.',...(report.build.site?[]:[report.build.siteLimitation])];
 await openResearch(c);await shot(c,'research-and-live-native-bot');await c.tap('.bn-tech-done');l.adb('shell','input','keyevent','4');
 await l.nativeTap('Cancel');await c.wait('!__towersHtml.report().menuRequested');report.checks.researchAndCancelReturns=true;
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),report.phoneLibrary,'old library bytes remain unchanged');report.final=await observe(c);report.errors=c.errors;assert.deepEqual(report.errors,[]);report.fixtureCleanupPause=await j.pause(c);report.passed=true;report.phase='passed';
 }catch(error){report.failure=String(error.stack||error);try{report.failureScreen=l.screen('10-'+branch+'-failure');if(c)report.failureState=await observe(c);}catch(_){}throw error;}
 finally{report.leftBattleRunning=!Number.isFinite(report.fixtureCleanupPause);report.finished=new Date().toISOString();write();c?.close();}
 return report;
}
module.exports={run};
if(require.main===module)run().then(r=>console.log(json({passed:r.passed,branch:r.branch,checks:r.checks,candidateAPK_SHA256:r.candidateAPK_SHA256}))).catch(error=>{console.error(error);process.exitCode=1;});
