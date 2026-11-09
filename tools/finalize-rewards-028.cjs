'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA=path.resolve(__dirname,'../qa/0.28-rewards');
const l=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const read=name=>JSON.parse(fs.readFileSync(path.join(l.out,name+'.json')));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 const identity=journey.installedIdentity();assert.equal(identity.candidateAPK_SHA256,'fa1d41a8287937c3edf2f1f36b1bcddfce95e31dd1f06ad26dc500c4a8d9e52f');
 const home=read('delivery-home'),purchase=read('delivery-purchase'),before=read('delivery-before-purchase'),after=read('delivery-after-purchase'),consumed=read('delivery-consumed');
 const post=read('delivery-loaded-post'),pre=read('delivery-loaded-pre'),restart=read('delivery-loaded-restart'),order=read('delivery-build-order');
 assert.equal(home.balanceBefore-home.balanceAfter,10);assert.equal(purchase.initial.config.balance-purchase.bought.config.balance,50);
 assert.equal(purchase.initial.caps.remaining.ripple,1);assert.equal(purchase.bought.caps.remaining.ripple,6);assert.equal(purchase.bought.native.rewards.remaining.ripple,6);
 assert(order.accepted.ok);assert(consumed.native.finishedBuilds.some(b=>b.id===order.accepted.result.id));
 assert.equal(consumed.caps.remaining.ripple,5);assert.equal(consumed.native.rewards.remaining.ripple,5);
 assert.equal(before.gam.levelName,'Greenhaven-T1');assert.equal(after.gam.levelName,'Greenhaven-T1');assert.notEqual(before.saved.savedId,after.saved.savedId);
 assert.equal(after.config.balance,50);
 for(const value of [post,pre,restart]){
  assert(value.result.saved.ready&&value.result.saved.hydrated);assert.equal(value.result.caps.remaining.ripple,5);assert.equal(value.stable.caps.remaining.ripple,5);assert.equal(value.result.native.rewards.remaining.ripple,5);assert.equal(value.result.config.balance,50);assert.equal(value.result.config.session,after.config.session);assert.notEqual(value.result.documentSession,after.documentSession);
 }
 assert.equal(post.result.saved.slotId,after.saved.savedId);assert.equal(pre.result.saved.slotId,before.saved.savedId);assert.equal(restart.result.saved.slotId,after.saved.savedId);
 assert.notEqual(restart.result.documentSession,post.result.documentSession);
 const c=await l.connect();let current;try{
 current=await c.evaluate('({version:BlockNightAndroid.appVersion(),session:__towersHtml.session,config:JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)),caps:JSON.parse(BlockNightAndroid.rewardResumeCaps(__towersHtml.session)),saved:WarzoneSavedGames.report(),native:__warzoneCommands.report().snapshot,errorLog:errorLog.filter(s=>/Unable to save|writeGameFile[^\\n]*failed|saveGame[^\\n]*failed/.test(s))})');
 assert.equal(current.version,'0.28');assert.equal(current.config.balance,50);assert.equal(current.caps.remaining.ripple,5);assert.equal(current.native.rewards.remaining.ripple,5);assert.equal(current.errorLog.length,0);
 }finally{c.close()}
 fs.writeFileSync(path.join(l.out,'delivery-durable-observation.json'),JSON.stringify({identity,current},null,2));
 const names=['delivery-01-home.png','delivery-02-home-fortresses.png','delivery-03-home-next-match.png','delivery-04-help-version.png','delivery-05-ingame-fortresses.png','delivery-06-bulk-purchased.png','delivery-07-this-match.png','delivery-before-purchase.png','delivery-after-purchase.png','delivery-loaded-post.png','delivery-loaded-pre.png','delivery-loaded-restart.png','delivery-home.json','delivery-purchase.json','delivery-before-purchase.json','delivery-after-purchase.json','delivery-build-order.json','delivery-consumed.json','delivery-loaded-post.json','delivery-loaded-pre.json','delivery-loaded-restart.json','delivery-durable-observation.json'];
 const evidenceFiles=names.map(name=>{const file=path.join(l.out,name);return{path:path.relative(l.root,file).replaceAll('\\','/'),sha256:hash(file)}});
 const checks=[
 'Installed delivery APK SHA256 matches; version 0.28 is visible on Home and in Help',
 'Approved option 1 native Rewards drawer works on Home and in-game with original item thumbnails, direct category tabs, inline quantities and bulk choices',
 'Actual Home purchase deducts 10 crystals and carries one Ripple into a fresh match',
 'Actual in-game bulk purchase deducts 50 crystals, raises native and phone Ripple allowances from one to six, and remains six across later native snapshots',
 'A normal paid native construction order completes one Ripple and both allowances become five',
 'Header SAVE writes complete native pre-purchase and post-purchase archives under the valid Greenhaven internal identifier',
 'Home Saved Games loads the post-purchase save with the original economic run, a fresh document, five remaining and no repeated charge',
 'Loading the older pre-purchase save still preserves five unused allowances after native resume reconciliation',
 'Force-stop/restart and reloading the saved match retain wallet 50 and five remaining',
 'Repeated normal Back/Return/Home/Saved Games navigation completes without the stock pause menu'
 ].map(name=>({name,passed:true}));
 const supporting=path.join(l.out,'native-automatic-save-observation.json');
 const report={candidateAPK_SHA256:identity.candidateAPK_SHA256,emulatorUsed:true,gameplayVerified:false,device:l.device,viewport:[1600,720],identity,checks,evidenceFiles,
  fixtureProvenance:'The final core journey uses a fresh ordinary Greenhaven match, genuine Home and in-game crystal purchases, real Android/ADB menu touches, native F7 Save and normal Home Load. One construction order uses the existing native command bridge after a live footprint/reachability preview with the four supplied trucks; it uses normal power/build time. No clock/world/save seeding, free units, debug research or fabricated wave packets.',
  supportingObservations:[{path:path.relative(l.root,supporting).replaceAll('\\','/'),sha256:hash(supporting),scope:'A prior 0.28 candidate (851e70...) with the identical frozen native payload reached the ordinary ten-game-minute automatic-save timer at supported 2x speed. Its complete native automatic save, game.map/scriptstate and valid Greenhaven-T1 identifier persisted and were inspected after reloading. This is supplemental writer evidence, not a claim that the final wallet build repeated the ten-minute timer.'}],
  versionMismatch:'Actual APK comparison shows 0.26 has no SAVE helper/live purchase implementation and the old invalid Greenhaven alias, whereas 0.27 contains them. The supplied screenshot matches the older capabilities. No physical phone was connected, so its installed version could not be read.',
  limits:['Focused Rewards/Save checks only, not full campaign, all-map gameplay or physical-device graphics certification.','Earlier fixture assumptions about auto-equipped Home stock and immediate WebView readiness were corrected from actual UI/state; those setup failures were not classified as game defects.','The pre-wallet-fix scene ended while source diagnosis continued; its successful automatic save was inspected after reload. The final core run was kept active only for its bounded checks.','Existing emulator black-terrain rendering is unchanged; the visible Rewards UI and native object/order/save state were inspected.','Native automatic saves are separate from the manual SAVE archives shown on Home.']};
 const file=path.join(l.out,'focused-emulator-proof.json');fs.writeFileSync(file,JSON.stringify(report,null,2));
 console.log(JSON.stringify({checks:checks.length,candidate:identity.candidateAPK_SHA256,proof:file,sha256:hash(file)},null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
