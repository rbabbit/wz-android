'use strict';
// Complete genuine native saves. Terminal checks use an explicitly disclosed
// copy with one HQ removed; ordinary save/load never changes native fields.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const action=process.argv[2]||'ordinary',json=JSON.stringify;
const r={passed:false,seeded:action!=='ordinary',action,identity:j.installedIdentity(),started:new Date().toISOString(),checks:{}};
const file=path.join(l.out,'save-'+action+'.json'),write=()=>fs.writeFileSync(file,json(r,null,2)+'\n');
async function snapshot(c){return c.evaluate('({duel:__warzoneDuel.report(),commands:__warzoneCommands.report(),research:__blockNightResearch.report(),html:__towersHtml.report(),config:LaunchedModule.WZVAL_configDirPath})')}
async function files(c){return c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',r={};for(const n of f.readdir(p))if(!['.','..'].includes(n))r[n]=Array.from(f.readFile(p+'/'+n));return r})()`)}
(async()=>{let c;try{
 c=await j.connectReady();await j.resume(c);r.before=await snapshot(c);r.phoneDesigns=await c.evaluate('BlockNightAndroid.loadDesigns()');assert.equal(r.before.duel.snapshot.phase,'active');
 const existing=process.argv.includes('--existing');
 if(!existing)await c.save('10-'+action+'-before-load');
 const bytes=await files(c),gam=JSON.parse(Buffer.from(bytes['gam.json']).toString()),saved={};for(const n of ['struct.json','droid.json'])saved[n]=JSON.parse(Buffer.from(bytes[n]).toString());r.existingOrdinarySave=existing;r.savedClock=gam.gameTime;r.savedStructureCount=Object.keys(saved['struct.json']).length;
 if(action==='ordinary'){
  const target=r.before.commands.snapshot.factories.find(f=>f.ready&&f.kind==='Factory');r.factoryId=target.id;r.nativeDroids=Object.values(saved['droid.json']).map(d=>({id:d.id,player:d.player,position:d.position}));
 }else{
  assert.ok(['victory','defeat'].includes(action));r.fixtureDisclosure='A separate complete genuine QuickSave was copied in memory; only the '+(action==='victory'?'enemy':'human')+' Command Centre entry was removed from struct.json, then loaded with native F8. This exercises authoritative native HQ detection and result/menu handling; it is not a naturally won/lost match.';
  const structures=JSON.parse(Buffer.from(bytes['struct.json']).toString()),player=action==='victory'?1:0,entry=Object.entries(structures).find(([,s])=>s.player===player&&s.name==='A0CommandCentre');assert.ok(entry,'fixture HQ exists');r.removedHQ=entry[1];delete structures[entry[0]];bytes['struct.json']=Array.from(Buffer.from(json(structures)));r.fixtureChanges=['struct.json: removed only '+entry[0]];
 }
 await c.wait('__warzoneDuel.report().snapshot.gameTime>'+Number(gam.gameTime+3000),12000);
 await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave';for(const [n,b]of Object.entries(${json(bytes)}))f.writeFile(p+'/'+n,new Uint8Array(b));return true})()`);
 r.beforeLoadClock=await c.evaluate('__warzoneDuel.report().snapshot.gameTime');r.phase='native-load';write();
 await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true',{timeoutMs:90000});
 if(action==='ordinary'){
  await c.wait('__warzoneDuel.report().snapshot.gameTime<'+Number(r.beforeLoadClock-1000),90000,{timeoutMs:90000});r.phase='native-clock-restored';write();
  r.loadReadiness=await require('./observe-native-load.cjs').observe(c,{label:'10-duel-ordinary-load',timeout:20000});
  const sync=await c.evaluate('__blockNightResearch.report().bridgeSyncs');await c.wait('__blockNightResearch.report().bridgeSyncs>'+sync,15000);
  const native=await j.commandState(c);r.after=await snapshot(c);r.freshNative=native;assert.equal(r.after.duel.snapshot.humanBranch,r.before.duel.snapshot.humanBranch);assert.equal(r.after.duel.snapshot.botBranch,r.before.duel.snapshot.botBranch);assert.equal(r.after.config,r.before.config);assert.equal(r.after.duel.snapshot.phase,'active');assert.ok(native.factories.some(f=>f.id===r.factoryId));assert.ok(r.before.commands.snapshot.trucks.every(t=>native.trucks.some(n=>n.id===t.id)));
  await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().catalogCount>0');await c.paint();r.screen=l.screen('10-duel-research-after-native-load');await c.tap('.bn-tech-done');await c.wait('!__blockNightResearch.report().open');assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneDesigns);r.checks.nativeSaveLoadAndInput=true;
 }else{
  await c.wait(`__warzoneDuel.report().snapshot.phase===${json(action==='victory'?'victory':'defeated')}&&__towersHtml.isEnded()`,90000,{timeoutMs:90000});r.after=await snapshot(c);r.screen=l.screen('10-duel-native-'+action);r.nativeUI=l.tree().nodes.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds}));r.checks.nativeHQOutcome=true;
 }
 r.errors=c.errors;assert.deepEqual(r.errors,[]);r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('10-'+action+'-failure');if(c)r.failureState=await snapshot(c)}catch(_){}throw e}
 finally{r.finished=new Date().toISOString();write();c?.close()}
 console.log({passed:r.passed,checks:r.checks,action:r.action});
})().catch(e=>{console.error(e);process.exitCode=1});
