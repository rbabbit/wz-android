'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,delay,out}=require('./native-live.cjs');
(async()=>{const name=process.argv[2]||'native-prepared-picker-change',fixture=JSON.parse(fs.readFileSync(path.join(out,name+'.json'))),expected=fixture.waves.snapshot.gameTime;
 const c=await connect();try{
 await c.wait('Boolean(window.__warzoneCommands?.report().snapshot&&window.__kalaWarzoneTouch?.report().hudVisible)');
 let before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
 if(process.argv.includes('--resume')){await delay(1200);assert.equal(before,await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime'));await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+before);before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');}
 assert.ok(Math.abs(before-expected)>5000,'restore starts at a distinct observed game time');
 await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
 await c.wait(`__warzoneTowersWaves.report().snapshot.gameTime>=${expected-2000}&&__warzoneTowersWaves.report().snapshot.gameTime<${expected+20000}`,30000);
 const reply=await c.evaluate('__warzoneCommands.send("state")');assert.ok(reply.ok);assert.equal(reply.result.trucks.length,fixture.commands.snapshot.trucks.length);assert.ok(reply.result.gameTime>=expected-2000);
 const saved=await c.save('native-fixture-restored');assert.equal(saved['scriptstate.json'].globals_0.scriptName,'init');assert.equal(saved.waves.snapshot.wave,fixture.waves.snapshot.wave);assert.equal(Object.values(saved['droid.json']).filter(d=>d.player===0).length,Object.values(fixture['droid.json']).filter(d=>d.player===0).length);
 await c.evaluate('new Promise((resolve,reject)=>LaunchedModule.FS.syncfs(false,e=>e?reject(e):resolve(true)))');
 await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await delay(1200);const a=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await delay(1200);assert.equal(a,await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime'));
 fs.writeFileSync(path.join(out,'native-fixture-restore-results.json'),JSON.stringify({passed:true,seeded:false,fixture:name,from:before,restoredTime:reply.result.gameTime,pausedAt:a,canonicalContext:true,manualLabState:saved.research.labs,errors:c.errors},null,2));console.log('PASS: native QuickLoad restored prepared ordinary units, manual labs and canonical command replies; paused at '+a);
 }finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
