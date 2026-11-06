'use strict';
const {connect,delay}=require('./native-live.cjs');
(async()=>{const c=await connect();try{
 const before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await delay(1200);if(before!==await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime'))throw Error('Expected the observed paused fixture.');
 await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+before);
 const data=await c.save(process.argv[2]||'native-prepared');
 await c.evaluate('new Promise((resolve,reject)=>LaunchedModule.FS.syncfs(false,e=>e?reject(e):resolve(true)))');
 console.log(JSON.stringify({persisted:true,time:data.waves.snapshot.gameTime,trucks:data.commands.snapshot.trucks.length,finishedUnits:data.commands.snapshot.finishedUnits}));
 }finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
