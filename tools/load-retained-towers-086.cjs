'use strict';
// ROOT-RUN ONLY: reuse the complete retained, disclosed 5+5+5 native fixture.
// Requires an ordinary Iron Valley game already loaded. No preparation/grants.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),q=require('./device-086.cjs');
const file=path.resolve(__dirname,'../qa/test-11/five-facilities-fixture.json'),fixture=JSON.parse(fs.readFileSync(file)),gam=JSON.parse(Buffer.from(fixture.files['gam.json']));
const W='document.getElementById("warzone-game-frame").contentWindow';
async function run(){
 assert.equal(fixture.seeded,true);assert.equal(crypto.createHash('sha256').update(JSON.stringify(fixture.files)).digest('hex'),fixture.sha256);assert.match(gam.levelName,/TowerDefense2/);
 const c=await q.connect('/warzone/mobile.html'),proof={seeded:true,fixture:file,fixtureSHA256:fixture.sha256,disclosure:fixture.fixtureDisclosure,actualNativeLoad:true};
 try{
  await c.wait(`${W}.__warzoneCommands?.report?.().snapshot?.factories?.length&&${W}.__kalaWarzoneTouch?.report?.().hudVisible`,'ordinary native Iron Valley ready',60000);
  proof.before=await c.child('({html:__towersHtml.report(),commands:__warzoneCommands.report().snapshot})');
  assert.equal(proof.before.html.mode,'tower-defense');
  const stamp='(()=>{try{return LaunchedModule.FS.stat(LaunchedModule.WZVAL_configDirPath+"/savegames/skirmish/QuickSave/gam.json").mtime.getTime()}catch{return 0}})()';
  const before=await c.child(stamp);await c.child('__kalaWarzoneTouch.nativePressKey("F7","F7",118);true');
  await c.wait(`${W}.eval(${JSON.stringify(stamp)})>${before}`,'native ordinary QuickSave created',15000);
  await c.child(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave';for(const[n,b]of Object.entries(${JSON.stringify(fixture.files)}))f.writeFile(p+'/'+n,new Uint8Array(b));return true})()`);
  await c.child('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
  await c.wait(`${W}.__warzoneCommands?.report?.().snapshot?.factories?.filter(f=>f.ready).length===10&&${W}.__warzoneTowersWaves?.report?.().snapshot?.gameTime<100000`,'retained complete native fixture',60000);
  const times=[];for(let i=0;i<3;i++){times.push(await c.child('__warzoneTowersWaves.report().snapshot.gameTime'));await q.delay(250);}assert(times[2]>times[0],'Loaded native clock is stopped: inspect screenshot, do not repeat F8/Escape');
  proof.advancingTimes=times;proof.after=await c.child('__warzoneCommands.send("state",{},{fresh:true})');assert.equal(proof.after.ok,true);assert.equal(proof.after.result.factories.filter(f=>f.ready).length,10);proof.passed=true;await c.snapshot('delivery475-retained-towers-ready');
 }catch(e){proof.passed=false;proof.error=e.stack||String(e);q.screen('delivery475-retained-towers-load-failure');throw e;}
 finally{fs.writeFileSync(path.join(q.out,'delivery475-retained-towers-load.json'),JSON.stringify(proof,null,2)+'\n');c.close();}
 return proof;
}
module.exports={run};if(require.main===module)run().then(p=>console.log(JSON.stringify({passed:p.passed,seeded:true,times:p.advancingTimes,factories:p.after.result.factories.map(f=>({id:f.id,kind:f.kind,ready:f.ready}))}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
