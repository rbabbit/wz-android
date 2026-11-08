'use strict';
// Root supplies the actual visually inspected native Pause screenshot.
// One calibrated real Resume touch; no Escape toggle or retry.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
(async()=>{const screenshot=path.resolve(process.argv[2]||'');assert.ok(fs.existsSync(screenshot),'explicit current visually inspected Pause screenshot required');const c=await j.connectReady();try{const proof=await require('./observe-native-load.cjs').observe(c,{label:'14-confirmed-pause',confirmedPauseScreenshot:screenshot});const r={passed:true,identity:j.installedIdentity(process.env.WZ_QA_APK),proof};fs.writeFileSync(path.join(l.out,'confirmed-resume.json'),JSON.stringify(r,null,2));console.log('ACTUAL RESUME READY',await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime'));}finally{c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
