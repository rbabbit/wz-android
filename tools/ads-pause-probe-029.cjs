'use strict';
process.env.WZ_NATIVE_QA ||= require('node:path').resolve(__dirname,'../qa/0.29-ads');
const l=require('./native-live.cjs'), fs=require('node:fs'),path=require('node:path');
(async()=>{const c=await l.connect();try{
 const clock=()=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
 const before=await clock();
 await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');
 await l.delay(1800);const held=await clock();await l.delay(1600);const still=await clock();
 l.screen('native-pause-control');
 await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');
 await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+still,8000);
 const resumed=await clock();const result={before,held,still,resumed,heldStable:held===still,resumedAdvances:resumed>still};
 fs.writeFileSync(path.join(l.out,'native-pause-control.json'),JSON.stringify(result,null,2));console.log(result);
 }finally{c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
