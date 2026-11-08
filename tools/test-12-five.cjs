'use strict';
// ROOT-RUN ONLY. Reuse the disclosed complete 0.11 native facility fixture;
// ordinary UI research/production follows. Never regenerate or grant facilities.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-12/five');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),five=require('./test-11-five-facilities.cjs');
const args=process.argv.slice(2),value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback,json=JSON.stringify;
const fixturePath=path.resolve(value('--fixture',path.join(l.root,'qa/test-11/five-facilities-fixture.json')));
const r={passed:false,seeded:true,started:new Date().toISOString(),checks:{},screenshots:[],phase:'readiness'};
const reportPath=path.join(l.out,'five.json'),write=()=>fs.writeFileSync(reportPath,json(r,null,2)+'\n');
const fresh=async c=>{const reply=await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})');assert.equal(reply.ok,true);return reply.result;};
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const attr=(key,v)=>`[${key}=${json(String(v))}]`;
const rows=x=>Object.values(x||{}).filter(v=>v&&typeof v==='object'&&Number.isFinite(v.id));
const ids=x=>x.map(v=>v.id).sort((a,b)=>a-b);
async function shot(c,name){const file=await j.capture(c,name);r.screenshots.push(path.relative(l.root,file).replaceAll('\\','/'));write();return file;}
async function close(c){if(await c.host('Boolean(window.TowersStatus?.report().open)')){await c.tap('#wt-status-close');await c.wait('!parent.TowersStatus.report().open');}await j.closeOverlays(c);}
async function status(c,kind,family){
 await close(c);await c.wait('parent.TowersLab.report().visible');if(await c.host('TowersLab.report().collapsed'))await c.tap('#lab-ops-toggle');
 await c.tap(kind==='research'?'#lab-ops-research':'#lab-ops-production');await c.wait(`parent.TowersStatus.report().open&&parent.TowersStatus.report().kind===${json(kind)}`);
 if(family){await c.tap('[data-status-family='+json(family)+']');await c.wait(`parent.TowersStatus.report().family===${json(family)}`);}
 await c.paint();return inspect(c);
}
async function inspect(c){return c.host(`(()=>{const panel=document.getElementById('wt-status-panel'),list=document.getElementById('wt-status-rows'),dock=document.getElementById('lab-ops'),frame=document.getElementById('warzone-game-frame'),w=frame.contentWindow,box=e=>e?.getBoundingClientRect().toJSON(),hit=e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};return{status:TowersStatus.report(),viewport:[innerWidth,innerHeight],panel:box(panel),list:box(list),scroll:[list.scrollTop,list.scrollHeight,list.clientHeight],dock:box(dock),dockVisible:!dock.hidden&&getComputedStyle(dock).display!=='none',footerHits:Array.from(dock.querySelectorAll('[data-lab-panel]'),e=>({id:e.id,hit:hit(e)})),frame:box(frame),commands:{page:w.__warzoneCommands.report().page,buildOpen:w.__warzoneCommands.report().buildOpen,nativeMenu:w.__warzoneCommands.report().nativeMenu},fullResearch:w.__blockNightResearch.report().open,text:panel.innerText,rows:Array.from(list.children,e=>({id:Number(e.dataset.statusRow),box:box(e),name:e.querySelector('.wt-status-current').textContent,label:e.querySelector('.wt-status-label').textContent,activity:e.querySelector('.wt-status-activity').textContent,scroll:[e.scrollHeight,e.clientHeight],nameBox:box(e.querySelector('.wt-status-current')),barVisible:!e.querySelector('.wt-status-progress').hidden,estimated:e.querySelector('.wt-status-progress').getAttribute('aria-valuenow')})),images:Array.from(panel.querySelectorAll('img')).filter(e=>e.getBoundingClientRect().width>0).map(e=>({src:e.getAttribute('src'),complete:e.complete,width:e.naturalWidth}))}})()`);}
function assertStatus(proof,kind,nativeIds){
 assert.equal(proof.status.open,true);assert.equal(proof.status.kind,kind);assert.equal(proof.fullResearch,false,'footer does not open full TECH');assert.equal(proof.commands.page,'','footer does not open full Factory');assert.equal(proof.commands.nativeMenu,'','footer never opens stock menus');assert.equal(proof.dockVisible,true);assert.ok(proof.footerHits.every(x=>x.hit),'both footer controls stay reachable');
 assert.deepEqual(proof.rows.map(x=>x.id),nativeIds);assert.equal(proof.rows.length,5);
 assert.doesNotMatch(proof.text,/\bqueue(?:d|s)?\b|\bETA\b|\d+\s*%/i,'current-work status has no queue, visible numeric percent or ETA');
 if(kind==='production')assert.ok(proof.rows.every(row=>!row.barVisible),'no production percentage/progress claim');
 assert.ok(proof.panel.left>=0&&proof.panel.right<=proof.viewport[0]+1&&proof.panel.top>=0&&proof.panel.bottom<=proof.dock.top-2,'sidebar fits above its visible footer');
 assert.ok(proof.images.every(image=>image.complete&&image.width>0),'all visible status artwork loads');
}
async function viewport(c,width,height){let stable=0;for(const end=Date.now()+15000;Date.now()<end;){const png=l.adb('exec-out','screencap','-p'),host=await c.host('({width:innerWidth,height:innerHeight})');if(png.readUInt32BE(16)===width&&png.readUInt32BE(20)===height&&Math.abs(host.width/host.height-width/height)<.03){if(++stable>=2)return{device:[width,height],host};}else stable=0;await l.delay(100);}throw Error('Actual viewport did not match '+width+'x'+height);}
async function realScrollIfNeeded(c,proof){
 if(proof.scroll[1]<=proof.scroll[2]+2)return{needed:false,allFiveVisible:proof.rows.every(row=>row.box.top>=proof.list.top-1&&row.box.bottom<=proof.list.bottom+1)};
 const p=proof.list,png=l.adb('exec-out','screencap','-p'),sx=png.readUInt32BE(16)/proof.viewport[0],sy=png.readUInt32BE(20)/proof.viewport[1];
 l.adb('shell','input','swipe',String(Math.round((p.x+p.width*.7)*sx)),String(Math.round((p.y+p.height*.85)*sy)),String(Math.round((p.x+p.width*.7)*sx)),String(Math.round((p.y+p.height*.15)*sy)),'350');
 await c.wait('parent.document.getElementById("wt-status-rows").scrollTop>1');await c.paint();const after=await inspect(c);assert.ok(after.rows[4].box.top<after.list.bottom&&after.rows[4].box.bottom<=after.list.bottom+2,'real swipe reaches fifth row');return{needed:true,before:proof.scroll,after:after.scroll,last:after.rows[4]};
}
async function research(c,labIds){
 r.phase='five-lab-current-only';write();await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().labCount===5&&__blockNightResearch.report().catalogCount>1');
 const labId=labIds[4];await j.selectLab(c,labId);const topics=await c.evaluate('Array.from(document.querySelectorAll(".bn-tech-card"),e=>({id:e.dataset.topicId,name:e.querySelector("strong").textContent}))');
 const first=topics.find(t=>t.id==='R-Vehicle-Engine03')||topics[0],second=topics.find(t=>t.id!==first.id);assert.ok(first&&second);
 for(const topic of [first,second]){await c.tap('.bn-tech-card'+attr('data-topic-id',topic.id));await c.wait(`document.querySelector('.bn-tech-card.selected')?.dataset.topicId===${json(topic.id)}`);await c.tap('.bn-tech-assign');await c.wait('!__blockNightResearch.report().runner&&!__blockNightResearch.report().dirtyLabIds.length',15000);}
 await c.wait(`__blockNightResearch.report().labs.find(l=>l.id===${labId}).topicId===${json(first.id)}`);const native=await fresh(c);assert.ok(native.researchQueues.find(q=>q.labId===labId)?.topicIds.includes(second.id));
 await c.tap('.bn-tech-done');await c.wait('!__blockNightResearch.report().open');const proof=await status(c,'research');assertStatus(proof,'research',labIds);
 assert.equal(proof.status.rows.find(row=>row.id===labId).name,first.name);assert.ok(!proof.text.includes(second.name),'waiting topic never leaks into the live current-topic panel');
 r.research={labId,active:first,waiting:second,nativeQueues:native.researchQueues,status:proof};await shot(c,'12-five-research-active-only');
 r.checks.fiveLabs=true;await close(c);
}
async function order(c,factory,kind){
 await j.openPage(c,'factory');await c.tap('#wt-command-pages '+attr('data-factory',factory.id));await c.wait(`Number(parent.document.getElementById('wt-factory-select').value)===${factory.id}`);await c.tap('#wt-command-pages [data-count="1"]');
 const native=await fresh(c),template=native.templates.find(t=>factory.templates.includes(t.id)&&(kind==='cyborg'?five.equipment(t).includes('CyborgChaingun'):five.equipment(t).includes('Spade1Mk1')))||native.templates.find(t=>factory.templates.includes(t.id));assert.ok(template,'proven native '+kind+' recipe');
 const action=await five.produceRecipe(c,template);await c.wait(`(()=>{const f=__warzoneCommands.report().snapshot.factories.find(f=>f.id===${factory.id});return f?.active||f?.currentProduction||!f?.idle})()`,15000);
 await close(c);const proof=await status(c,'production',kind),nativeIds=ids((await fresh(c)).factories.filter(f=>f.ready&&(/cyborg/i.test(f.kind)?'cyborg':/vtol/i.test(f.kind)?'vtol':'vehicle')===kind));assertStatus(proof,'production',nativeIds);
 const current=proof.status.rows.find(row=>row.id===factory.id);assert.equal(current.active,true,'fifth '+kind+' visibly producing');assert.ok(current.components.length>=3,'real current unit component strip');assert.notEqual(current.name,'No active production');
 assert.equal(await c.host('Number(document.getElementById("wt-factory-select").value)'),factory.id,'footer does not steal selected full-page factory');
 await shot(c,'12-fifth-'+kind+'-current-production');await close(c);return{factoryId:factory.id,kind,templateId:template.id,cost:template.cost,action,status:proof};
}
async function compact(c,nativeIds){
 r.phase='compact-five-row-status';write();const original={wm:l.adb('shell','wm','size').toString(),font:l.adb('shell','settings','get','system','font_scale').toString().trim(),scale:await c.evaluate('Number(localStorage.getItem("wt-command-size"))||1')};
 const override=original.wm.match(/Override size:\s*(\d+)x(\d+)/),physical=original.wm.match(/Physical size:\s*(\d+)x(\d+)/),restoreSize=override?override[1]+'x'+override[2]:'reset',restoreDimensions=(override||physical)?.slice(1).map(Number).sort((a,b)=>b-a);
 r.compact={profile:{device:[854,480],fontScale:1.3,commandScale:1.4},original,cases:[]};
 try{
  await close(c);await j.pause(c);l.adb('shell','wm','size','480x854');l.adb('shell','settings','put','system','font_scale','1.3');r.compact.actual=await viewport(c,854,480);await c.evaluate('__warzoneCommands.setSize(1.4);true');await j.resume(c);
  for(const [kind,family,expected] of [['research',null,nativeIds.labs],['production','vehicle',nativeIds.vehicle],['production','cyborg',nativeIds.cyborg]]){
   await close(c);const before=await c.host('document.getElementById("warzone-game-frame").getBoundingClientRect().toJSON()');const proof=await status(c,kind,family);assertStatus(proof,kind,expected);
   assert.deepEqual([proof.frame.x,proof.frame.y,proof.frame.width,proof.frame.height],[before.x,before.y,before.width,before.height],'informational sidebar does not resize battlefield/camera');
   assert.ok(proof.rows.every(row=>row.nameBox.width>=65&&row.nameBox.height>=10),'all five names have readable layout space');assert.ok(proof.rows.every(row=>row.scroll[0]<=row.scroll[1]+2),'row content does not overlap/clamp outside its own row');
   const scroll=await realScrollIfNeeded(c,proof);if(!scroll.needed)assert.equal(scroll.allFiveVisible,true,'all five rows fit without clipped final row');
   const screenshot=await shot(c,'12-compact-'+kind+(family?'-'+family:''));
   if(kind==='research'){await c.tap('#lab-ops-research');await c.wait('!parent.TowersStatus.report().open');await c.tap('#lab-ops-research');await c.wait('parent.TowersStatus.report().kind==="research"');}
   else{const other=family==='vehicle'?'cyborg':'vehicle';await c.tap('[data-status-family='+json(other)+']');await c.wait(`parent.TowersStatus.report().family===${json(other)}`);await c.tap('[data-status-family='+json(family)+']');await c.wait(`parent.TowersStatus.report().family===${json(family)}`);}
   const beforeBack=await clock(c);l.adb('shell','input','keyevent','4');await c.wait('!parent.TowersStatus.report().open&&!__warzoneCommands.report().page&&!__warzoneCommands.report().nativeMenu&&!__blockNightResearch.report().open');await j.waitAdvancingClock(c,beforeBack,7000);
   r.compact.cases.push({kind,family,proof,scroll,screenshot:path.relative(l.root,screenshot).replaceAll('\\','/'),androidBackClosedOnlySidebar:true});write();
  }
  r.checks.compactStatusLayout=true;
 }finally{
  await close(c);await j.pause(c);l.adb('shell','wm','size',restoreSize);l.adb('shell','settings','put','system','font_scale',original.font==='null'?'1':original.font);if(restoreDimensions)r.compact.restored=await viewport(c,...restoreDimensions);await c.evaluate('__warzoneCommands.setSize('+Number(original.scale)+');true');await j.resume(c);write();
 }
}
async function main(){let c;try{
 r.identity=j.installedIdentity(value('--apk',process.env.WZ_QA_APK));write();const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));assert.equal(fixture.seeded,true);r.fixtureDisclosure=fixture.fixtureDisclosure+' This 0.12 run reuses that exact already-prepared complete fixture; it does not regenerate facilities.';r.fixture={path:path.relative(l.root,fixturePath).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex')};
 c=await j.connectReady();assert.equal(await c.evaluate('__towersHtml.report().mode'),'tower-defense');await c.wait('Boolean(parent.TowersStatus)');await close(c);await j.resume(c);r.phoneLibrary=await c.evaluate('BlockNightAndroid.loadDesigns()');const state=await five.load(c,fixture),loadProof=JSON.parse(fs.readFileSync(path.join(l.out,'five-facilities.json'),'utf8'));
 r.loadReadiness=loadProof.loadReadiness;r.nativeFacilityCounts=loadProof.nativeFacilityCounts;assert.deepEqual(r.nativeFacilityCounts,{labs:5,vehicleFactories:5,cyborgFactories:5});
 const nativeIds={labs:ids(await c.evaluate('__blockNightResearch.report().labs')),vehicle:ids(state.factories.filter(f=>f.ready&&f.kind==='Factory')),cyborg:ids(state.factories.filter(f=>f.ready&&f.kind==='Cyborg factory'))};r.nativeIds=nativeIds;
 await j.collapseDock(c,false);await research(c,nativeIds.labs);
 const before=(await fresh(c)).finishedUnits.map(unit=>unit.id);r.productionOrders=[];
 for(const kind of ['vehicle','cyborg']){const factory=state.factories.find(f=>f.id===nativeIds[kind][4]);r.productionOrders.push(await order(c,factory,kind));write();}
 const first=await status(c,'production','vehicle'),second=await status(c,'production','cyborg');assertStatus(first,'production',nativeIds.vehicle);assertStatus(second,'production',nativeIds.cyborg);r.tenFactories={vehicle:first,cyborg:second};r.checks.tenFactories=true;await close(c);
 await compact(c,nativeIds);r.phase='native-production-completion';write();const factoryIds=r.productionOrders.map(o=>o.factoryId);await c.wait(`(()=>{const finished=__warzoneCommands.report().snapshot.finishedUnits;return ${json(factoryIds)}.every(id=>finished.some(u=>u.factoryId===id&&!${json(before)}.includes(u.id)))})()`,120000);
 const native=await c.save('12-fifth-factories-native-completed');r.nativeUnits=native.commands.snapshot.finishedUnits.filter(u=>factoryIds.includes(u.factoryId)&&!before.includes(u.id));r.nativeUnitRecords=rows(native['droid.json']).filter(d=>r.nativeUnits.some(u=>u.id===d.id));assert.ok(factoryIds.every(id=>r.nativeUnits.some(u=>u.factoryId===id&&r.nativeUnitRecords.some(d=>d.id===u.id))),'both actual fifth factories finish native units');r.checks.productionCompleted=true;
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneLibrary,'phone blueprint library is untouched');await shot(c,'12-five-native-production-completed');r.errors=c.errors;assert.deepEqual(r.errors,[]);r.passed=true;r.phase='passed';
 }catch(error){r.failure=String(error.stack||error);try{r.failureScreen=l.screen('12-five-failure');if(c)r.failureState=await c.evaluate('({commands:__warzoneCommands.report(),research:__blockNightResearch.report(),status:parent.TowersStatus?.report(),touch:__kalaWarzoneTouch.report()})');}catch(_){}throw error;
 }finally{if(c){try{await close(c);r.pausedAt=await j.pause(c);}catch(error){r.cleanupFailure=String(error.stack||error);r.passed=false;}c.close();}r.finished=new Date().toISOString();write();}
 console.log(json({passed:r.passed,identity:r.identity,nativeFacilityCounts:r.nativeFacilityCounts,checks:r.checks}));return r;
}
module.exports={main,status,inspect,assertStatus,compact};if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
