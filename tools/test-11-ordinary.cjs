'use strict';
// Root-run only: ordinary saved Towers state, real UI production/design/IME,
// Android Back and native menu/process returns. No native fields are seeded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const args=process.argv.slice(2),value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-11/ordinary');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),json=JSON.stringify;
const r={passed:false,seeded:false,phase:'readiness',started:new Date().toISOString(),checks:{},screenshots:[],overlayReturns:[],errorsBySession:[],
 method:'An existing complete unmodified ordinary Iron Valley save is loaded by the established native F8 helper. Production, component/name edits, saves/deletion and navigation use actual Android touches or Android Back. No cloned facilities, power, research, templates or native world fields are injected.'};
const reportPath=path.join(l.out,'ordinary.json'),write=()=>fs.writeFileSync(reportPath,json(r,null,2)+'\n');
const attr=(key,v)=>`[${key}=${json(String(v))}]`;
const dom=(c,selector,body)=>c.host(`(()=>{const e=document.querySelector(${json(selector)});return e?(${body}):null})()`);
const library=c=>c.evaluate('BlockNightAndroid.loadDesigns()');
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const session=c=>c.evaluate('__towersHtml.report().session');
const status=c=>c.evaluate('({html:__towersHtml.report(),commands:__warzoneCommands.report(),research:__blockNightResearch.report(),touch:__kalaWarzoneTouch.report()})');
async function until(fn,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await l.delay(150)}throw Error(label);}
async function shot(c,name){const p=await j.capture(c,name);r.screenshots.push(path.relative(l.root,p).replaceAll('\\','/'));write();return p;}
function collect(c,label){r.errorsBySession.push({label,errors:[...c.errors]});assert.deepEqual(c.errors,[],label+' uncaught WebView errors');}
async function backPage(c,page){
 if(page==='research'){await j.closeOverlays(c);await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().catalogCount>0');}
 else if(page==='help'){await j.closeOverlays(c);await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');}
 else if(page==='build'){await j.closeOverlays(c);await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen');}
 else await j.openPage(c,page);
 l.adb('shell','input','keyevent','4');
 if(page==='research')await c.wait('!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose');
 else if(page==='help')await c.wait('parent.document.getElementById("warzone-towers-help-overlay").hidden');
 else if(page==='build')await c.wait('!__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().exitingBuild');
 else await c.wait('!__warzoneCommands.report().page');
 const state=await c.evaluate('__towersHtml.report()');assert.equal(state.phase,'playing');assert.equal(state.menuRequested,false,'page Back closes its overlay before native menu confirmation');
 r.overlayReturns.push({page,source:'actual Android KEYCODE_BACK',session:state.session});write();
}
async function menuReturn(c){
 await j.closeOverlays(c);const before=await clock(c);
 l.adb('shell','input','keyevent','4');await c.wait('__towersHtml.report().menuRequested');await l.nativeTap('Cancel');await c.wait('!__towersHtml.report().menuRequested');
 r.cancelClock={before,after:await j.waitAdvancingClock(c,before)};
 const previous=await session(c);l.adb('shell','input','keyevent','4');await c.wait('__towersHtml.report().menuRequested');await l.nativeTap('Return');collect(c,'ordinary-before-main-menu');c.close();
 const menu=await until(()=>{const tree=l.tree();return tree.nodes.some(n=>n['content-desc']==='Start game, Iron Valley')&&tree;},'actual custom Towers main menu after confirmed Return',20000);
 assert.ok(!menu.nodes.some(n=>/BATTLE ENDED|YOU HAVE FAILED/.test(n.text||'')));r.mainMenuScreen=l.screen('11-ordinary-native-main-menu');
 await l.nativeTap('Start game, Iron Valley');const fresh=await j.connectReady();r.returnSessions={before:previous,after:await session(fresh)};assert.notEqual(r.returnSessions.after,previous,'confirmed Return starts a fresh battle');
 await j.waitAdvancingClock(fresh,await clock(fresh));return fresh;
}
(async()=>{let c;try{
 r.identity=j.installedIdentity(value('--apk',process.env.WZ_QA_APK));r.candidateAPK_SHA256=r.identity.candidateAPK_SHA256;
 const fixture=j.readFixture('early');assert.equal(fixture.data.seeded===true,false);r.ordinaryFixture={path:path.relative(l.root,fixture.file).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(fixture.file)).digest('hex'),seeded:false};write();
 c=args.includes('--start')?await j.start('td2'):await j.connectReady();
 assert.equal(await c.evaluate('__towersHtml.report().mode'),'tower-defense','this journey targets Towers');
 r.phoneBefore=await library(c);r.phoneBeforeParsed=JSON.parse(r.phoneBefore||'{"version":1,"designs":[]}');r.originalDesignIds=(r.phoneBeforeParsed.designs||[]).map(d=>d.id);

 r.phase='ordinary-native-production';write();await j.production(c,r);
 assert.ok(r.production.orders.length>=2&&r.production.nativeUnits.length>=2,'two ordinary factories completed real queued production');
 assert.equal(await library(c),r.phoneBefore,'production did not alter phone blueprints');r.checks.ordinaryProduction=true;write();

 r.phase='ordinary-design-and-keyboard';write();await j.openPage(c,'design');await c.tap('#wt-command-pages [data-action="new-design"]');
 if(await dom(c,'#wt-command-pages [data-action="discard-draft"]','e.getBoundingClientRect().width>0'))await c.tap('#wt-command-pages [data-action="discard-draft"]');
 for(const [step,part]of [['body','Body1REC'],['propulsion','wheeled01'],['0','MG1Mk1']]){
  await c.tap('#wt-command-pages '+attr('data-step',step));await c.tap('#wt-command-pages '+attr('data-part',part)+attr('data-slot',step));
 }
 const name='UI11 '+String(Date.now()).slice(-6);r.qaBlueprintName=name;r.keyboardReturns=[];
 for(const [index,text]of [name+'A',name].entries()){
  await j.editName(c,text,'11-ordinary-real-keyboard-'+(index+1));await until(()=>dom(c,'#wt-save-design','!e.disabled'),'real native validation after keyboard return');
  assert.equal(await c.evaluate('__warzoneCommands.report().page'),'design');r.keyboardReturns.push({round:index+1,name:await dom(c,'#wt-design-name','e.value'),source:'real Android IME plus actual KEYCODE_BACK'});write();
 }
 r.validDesign={name:await dom(c,'#wt-design-name','e.value'),status:await dom(c,'#wt-design-valid','e.textContent'),components:await dom(c,'.wt-design-summary .wt-configuration','e.textContent')};
 assert.match(r.validDesign.status,/POWER\s+\d+\s+·\s+BUILD POINTS\s+\d+/,'cost and build points come from native design validation');await shot(c,'11-ordinary-design-native-valid');
 await c.tap('#wt-save-design');r.createdBlueprint=await c.wait(`__warzoneCommands.report().saved.find(d=>d.name===${json(name)})`);r.createdQAId=r.createdBlueprint.id;assert.ok(!r.originalDesignIds.includes(r.createdQAId),'cleanup will target only the new QA blueprint');
 assert.ok(r.createdBlueprint.cost>0&&r.createdBlueprint.points>0);assert.equal(r.createdBlueprint.body,'Body1REC');assert.equal(r.createdBlueprint.propulsion,'wheeled01');assert.deepEqual(r.createdBlueprint.turrets,['MG1Mk1']);
 await c.wait('__warzoneCommands.report().page==="saved"');r.phoneWithBlueprint=await library(c);assert.ok(JSON.parse(r.phoneWithBlueprint).designs.some(d=>d.id===r.createdQAId));await shot(c,'11-ordinary-blueprint-saved-on-phone');
 await c.tap('#wt-command-pages '+attr('data-edit',r.createdQAId));await c.wait('__warzoneCommands.report().page==="design"');await until(()=>dom(c,'#wt-save-design','!e.disabled'),'reopened phone design validates');assert.equal(await dom(c,'#wt-design-name','e.value'),name);await shot(c,'11-ordinary-saved-design-reopened');

 r.phase='ordinary-overlay-returns';write();
 for(const page of ['research','factory','design','saved','queue','help','build'])await backPage(c,page);
 await j.openPage(c,'queue');await shot(c,'11-ordinary-all-activity');await j.closeOverlays(c);

 r.phase='ordinary-native-menu-return';write();c=await menuReturn(c);
 assert.equal(await library(c),r.phoneWithBlueprint,'phone blueprint survives actual Return/main-menu/new-battle');
 await j.openPage(c,'saved');await until(()=>dom(c,'#wt-command-pages '+attr('data-edit',r.createdQAId),'e.getBoundingClientRect().width>0'),'saved blueprint is visible after native main-menu return');await shot(c,'11-ordinary-library-after-menu-return');
 if(!args.includes('--skip-process-restart')){
  r.phase='ordinary-process-restart';write();await j.closeOverlays(c);collect(c,'ordinary-before-process-restart');c.close();c=await j.start('td2');
  assert.equal(await library(c),r.phoneWithBlueprint,'phone blueprint survives genuine Android force-stop/relaunch');r.processRestart={package:l.packageId,session:await session(c),libraryUnchanged:true};
  await j.openPage(c,'saved');await until(()=>dom(c,'#wt-command-pages '+attr('data-edit',r.createdQAId),'e.getBoundingClientRect().width>0'),'saved blueprint is visible after process restart');await shot(c,'11-ordinary-library-after-process-restart');
 }else r.limitations=['Separate process restart was explicitly skipped; actual native Return/main-menu/new-battle persistence was checked.'];

 r.phase='ordinary-qa-blueprint-cleanup';write();assert.ok(!r.originalDesignIds.includes(r.createdQAId));
 await c.tap('#wt-command-pages '+attr('data-delete',r.createdQAId));await c.tap('#wt-command-pages '+attr('data-confirm-delete',r.createdQAId));
 await c.wait(`!__warzoneCommands.report().saved.some(d=>d.id===${json(r.createdQAId)})`);r.phoneAfterCleanup=await library(c);r.phoneAfterCleanupParsed=JSON.parse(r.phoneAfterCleanup||'{"version":1,"designs":[]}');
 assert.deepEqual(r.phoneAfterCleanupParsed,r.phoneBeforeParsed,'only the new QA blueprint was deleted; original phone library is restored');r.phoneBytesUnchanged=r.phoneAfterCleanup===r.phoneBefore;r.cleanupLibraryComplete=true;
 r.checks.designPhonePersistence=true;r.checks.keyboardAndMenuReturns=true;collect(c,'ordinary-final');r.afterIdentity=j.installedIdentity(value('--apk',process.env.WZ_QA_APK));assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);r.passed=true;r.phase='passed';
 }catch(error){r.failure=String(error.stack||error);try{r.failureScreen=l.screen('11-ordinary-failure');if(c)r.failureState=await status(c);}catch(observation){r.failureObservation=String(observation)}throw error;}
 finally{if(c){try{await j.closeOverlays(c);r.cleanupPause=await j.pause(c)}catch(error){r.cleanupFailure=String(error.stack||error);r.passed=false}c.close()}r.finished=new Date().toISOString();write()}
 console.log(json({passed:r.passed,seeded:r.seeded,checks:r.checks,candidateAPK_SHA256:r.identity.candidateAPK_SHA256}));
})().catch(error=>{console.error(error);process.exitCode=1});
