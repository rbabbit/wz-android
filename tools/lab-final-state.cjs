'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const j=require('./lab-journey.cjs'),live=require('./native-live.cjs');
(async()=>{const c=await j.connectReady();try{
 const identity=j.installedIdentity(process.env.WZ_QA_APK);await j.resume(c);const native=await j.commandState(c);
 const renderer=await c.evaluate('WarzoneBuildDisplay.report()');assert.equal(renderer.models,165);assert.equal(renderer.error,'');
 const library=await c.evaluate('JSON.parse(BlockNightAndroid.loadDesigns())');assert.equal(library.designs.length,2,'only the two genuine saved test models remain');
 const pausedAt=await j.pause(c);const png=live.adb('exec-out','screencap','-p');assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[1080,600]);
 assert.equal(Number(live.adb('shell','settings','get','system','font_scale').toString().trim()),1);
 const controlScale=await c.host('document.documentElement.style.getPropertyValue("--wt-command-scale")');assert.equal(Number(controlScale),1);
 assert.deepEqual(c.errors,[]);live.screen('final-lab-paused');
 const result={passed:true,identity,map:{width:native.mapWidth,height:native.mapHeight},pausedAt,profile:{width:1080,height:600,fontScale:1,controlScale:1},labSavedModels:library.designs.map(d=>({id:d.id,name:d.name})),renderer:{models:renderer.models,error:renderer.error,acceptedSites:renderer.acceptedSites.length},errors:c.errors};
 fs.writeFileSync(path.join(live.out,'final-native-state.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,sha256:identity.candidateAPK_SHA256,pausedAt}));
 }finally{c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
