'use strict';
const fs=require('fs'),path=require('path'),l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),seeded:false,started:new Date().toISOString(),screens:[]};
(async()=>{let c;try{c=await j.start('td2');await j.resume(c);r.before=await j.commandState(c);
 for(const page of ['build','research','factory','design','queue']){
  await j.closeOverlays(c);if(page==='research'){await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().labCount>0');r.labs=await c.evaluate('__blockNightResearch.report().labs');}
  else{await c.tap('#wt-open-'+page);await c.wait(page==='build'?'__warzoneCommands.report().buildOpen':'__warzoneCommands.report().page==='+JSON.stringify(page));}
  r.screens.push({page,path:await j.capture(c,'11-before-'+page)});
 }
 await j.closeOverlays(c);const save=await c.save('11-before-native-save');r.native=save.commands.snapshot;
 const fixture=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',files={};for(const n of f.readdir(p))if(!['.','..'].includes(n))files[n]=Array.from(f.readFile(p+'/'+n));return{seeded:false,configDir:LaunchedModule.WZVAL_configDirPath,files}})()`);
 fs.writeFileSync(path.join(l.out,'ordinary-fixture.json'),JSON.stringify(fixture));r.fixture='ordinary-fixture.json';r.pause=await j.pause(c);r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('11-preflight-failure')}catch(_){}throw e}
 finally{c?.close();r.finished=new Date().toISOString();fs.writeFileSync(path.join(l.out,'preflight.json'),JSON.stringify(r,null,2)+'\n')}
 console.log({passed:r.passed,labs:r.labs?.length,factories:r.before?.factories?.length});
})().catch(e=>{console.error(e);process.exitCode=1});
