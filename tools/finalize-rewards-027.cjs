'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA=path.resolve(__dirname,'../qa/0.27-saves');
const l=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const read=n=>JSON.parse(fs.readFileSync(path.join(l.out,n+'.json'),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async()=>{
 const identity=journey.installedIdentity(),c=await l.connect();
 let current;try{
 current=await c.evaluate('({documentSession:__towersHtml.session,config:JSON.parse(BlockNightAndroid.rewardConfig(__towersHtml.session)),saved:WarzoneSavedGames.report(),native:__warzoneCommands.report().snapshot,waves:__warzoneTowersWaves.report().snapshot,errorLog:errorLog.filter(s=>/Unable to save|writeGameFile.*failed|saveGame.*failed/.test(s))})');
 l.screen('final-11-verified-restored');
 }finally{c.close();}
 const saved=read('final-save-result'),world=read('final-native-save'),restored=read('final-restored'),restart=read('final-restart-restored'),purchase=read('final-live-purchase'),wave=read('final-wave-credit');
 assert.equal(identity.candidateAPK_SHA256,'5014b70184f120f0f237f33aef730981793b4dc982f255658290e4505370ad51');
 assert(saved.save.savedId&&saved.save.persistenceStarted===1&&saved.save.persistenceCompleted.includes(1));
 assert.equal(world['gam.json'].levelName,'Greenhaven-T1');assert.equal(current.errorLog.length,0);
 assert(restored.save.ready&&restored.save.hydrated&&restart.save.ready&&restart.save.hydrated);
 assert.notEqual(restored.session,saved.before.session);assert.notEqual(restart.session,restored.session);
 assert.equal(current.config.session,saved.before.session);assert.equal(current.saved.slotId,saved.save.savedId);
 for(const truck of restored.commands.trucks){const droid=Object.values(world['droid.json']).find(x=>x.id===truck.id);assert(droid);assert.deepEqual([truck.x,truck.y],[Math.floor(droid.position[0]/128),Math.floor(droid.position[1]/128)]);}
 assert.equal(restored.commands.trucks.length,4);assert.equal(purchase.before.balance,305);
 assert.equal(purchase.proof.result.remaining.ripple,1);assert(purchase.native.result.nativeBuildOptions.includes('Emplacement-Rocket06-IDF'));
 assert.equal(wave.seeded,false);assert.equal(wave.result.balance-wave.before.balance,5);assert.equal(wave.result.note,'+5 crystals');assert.equal(wave.result.header,'blocknight-rewards');
 assert.deepEqual(wave.before.wave.completedWaves,[]);assert.deepEqual(wave.result.wave.completedWaves,[1]);
 assert.equal(current.config.balance,wave.result.balance);assert.equal(current.config.balance,300);
 assert.equal(current.native.rewards.remaining.ripple,1);assert.equal(current.native.rewards.remaining.archangel,1);
 assert.equal(current.native.rewards.transactions.length,2);assert.equal(current.config.pendingTransactions.length,0);
 const slotList=l.adb('shell','run-as',l.packageId,'ls','files/towers-saved-games').toString();assert(slotList.includes(saved.save.savedId+'.zip'));
 const checks=[
 'Installed APK SHA256 matches the exact delivery candidate',
 'Compact SAVE icon/header and Home Saved Games list visually inspected',
 'Real in-game Archangel and Ripple purchases deduct crystals and native Ripple build availability is enabled',
 'Greenhaven native QuickSave succeeds with the corrected internal level ID, native persistence completes and the private phone slot is created',
 'Home Load restores the original economic run into a fresh document with four native stationary truck IDs/positions and both purchase journals/allowances retained',
 'A genuine first wave completion pays exactly five crystals and shows a tiny notice inside the Rewards header',
 'After Home, force-stop and restart, the older wave-zero save loads with the earned balance of 300 retained and no repeated charge or starter gift',
 'Repeated Return-to-main-menu navigation and Saved Games Load restore input without the stock pause menu'
 ].map(name=>({name,passed:true}));
 fs.writeFileSync(path.join(l.out,'final-durable-observation.json'),JSON.stringify({identity,current,privateSlots:slotList.trim().split(/\s+/)},null,2));
 const names=['final-01-home.png','final-03c-ripple-selected.png','final-04-ripple-bought.png','final-06-saved-games.png','final-08-wave-crystals.png','final-09-restarted-saves.png','final-10-restart-restored.png','final-11-verified-restored.png','final-save-result.json','final-native-save.json','final-live-purchase.json','final-restored.json','final-restart-restored.json','final-wave-credit.json','final-durable-observation.json'];
 const evidenceFiles=names.map(n=>{const p=path.join(l.out,n);return{path:path.relative(l.root,p).replaceAll('\\','/'),sha256:hash(p)}});
 const report={candidateAPK_SHA256:identity.candidateAPK_SHA256,emulatorUsed:true,gameplayVerified:false,device:l.device,viewport:[1080,600],identity,checks,evidenceFiles,
  fixtureProvenance:'Ordinary installed Greenhaven with its supplied starting units. Real Android/ADB touches and native F7 saves; no world/save seeding, free units, debug boosts or fabricated wave packets. An earlier coordinate fixture selected Archangel before Ripple; both became genuine purchases and were retained in the round trip.',
  limits:['Focused save/reward journey only; no complete campaign or all-map gameplay pass.','All 46 native map-name lengths were checked in source; only Greenhaven and Iron Valley save/load were observed in the emulator, with Greenhaven rechecked on this exact APK.','Existing emulator black terrain remains as documented in prior QA; physical-device graphics and speaker output were not certified.','No building, research, production or long combat regression suite was requested or run.'],
  priorInvestigation:'Initial Greenhaven QuickSave failure was traced to the native writeGameFile assertion for its 22-byte level name. Only that internal identifier was shortened. Defensive modifier cleanup is separate from the confirmed cause.'};
 fs.writeFileSync(path.join(l.out,'focused-emulator-proof.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({checks:checks.length,proof:path.join(l.out,'focused-emulator-proof.json'),sha256:hash(path.join(l.out,'focused-emulator-proof.json')),candidate:identity.candidateAPK_SHA256},null,2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
