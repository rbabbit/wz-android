'use strict';
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const branch=process.argv[2]||'cannon';
(async()=>{let c;try{
 l.adb('shell','am','force-stop',l.packageId);
 l.adb('shell','am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity','--es','match_mode','duel','--es','duel_weapon',branch);
 await l.nativeTap('Start game, 1v1 vs Bot');
 c=await j.connectReady();await c.wait('__warzoneDuel.report().cameraReady',20000);
 console.log(JSON.stringify({identity:j.installedIdentity(),duel:await c.evaluate('__warzoneDuel.report()')}));
}finally{c?.close()}})().catch(e=>{console.error(e);process.exitCode=1});
