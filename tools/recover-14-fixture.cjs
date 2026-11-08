'use strict';
const j=require('./lab-journey.cjs'),l=require('./native-live.cjs');
(async()=>{const c=await j.start('td2');try{
 console.log('READY',await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime'));
 await c.tap('#blocknight-tech');
 console.log(await c.evaluate('({fonts:document.fonts.status,imgs:Array.from(document.querySelectorAll("#blocknight-research-shell img"),e=>({src:e.src,complete:e.complete,natural:e.naturalWidth}))})'));
 await c.host('document.fonts.ready.then(()=>true)');await c.evaluate('document.fonts.ready.then(()=>true)');
 await c.wait('Array.from(document.querySelectorAll("#blocknight-research-shell img")).every(e=>e.complete&&e.naturalWidth>0)',15000);
 console.log(l.screen('14-research-loaded'));
 if(process.argv.includes('--early')){console.log('RESTORE EARLY');const proof={};const state=await j.restoreFixture(c,'early',proof);require('fs').writeFileSync(require('path').join(l.out,'prepared.json'),JSON.stringify({passed:true,identity:j.installedIdentity(process.env.WZ_QA_APK),proof,state},null,2));console.log('EARLY READY',state.gameTime,state.trucks.length);}
 await j.closeOverlays(c);if(!process.argv.includes('--keep-running'))await j.pause(c);
}finally{c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
