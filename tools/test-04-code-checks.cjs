'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),out=path.join(root,'qa/test-04');fs.mkdirSync(out,{recursive:true});
const names=['test-visible-trucks.cjs','test-smooth-building.cjs','test-command-bridge.cjs','test-command-pages.cjs','test-terrain-picker.cjs','test-build-display.cjs','test-html-return.cjs','test-html-page-return.cjs','test-test-lifecycle.cjs','test-html-input-modes.cjs','test-towers-camera.cjs','test-touch-zoom.cjs','test-research-queue-bridge.cjs','test-html-design.cjs','test-production-removal.cjs','test-tower-defense.cjs','test-native-build-navigation.cjs','test-fresh-selection-state.cjs','test-native-box-input.cjs','test-selection-cache.cjs','test-module-targets.cjs','test-module-placement.cjs','test-module-target-display.cjs'];
const tests=names.map(name=>{
 const start=Date.now();let exitCode=0,output='';
 try{output=cp.execFileSync(process.execPath,[path.join(__dirname,name)],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});}
 catch(e){exitCode=e.status??1;output=String(e.stdout||'')+'\n'+String(e.stderr||e);}
 fs.writeFileSync(path.join(out,name+'.log'),output);console.log((exitCode?'FAIL ':'PASS ')+name);
 return{name,passed:exitCode===0,exitCode,elapsedMs:Date.now()-start};
});
const report={passed:tests.every(t=>t.passed),recordedUTC:new Date().toISOString(),verification:'Source regressions only; actual exact-APK gameplay is separately required',tests};
fs.writeFileSync(path.join(out,'code-checks.json'),JSON.stringify(report,null,2)+'\n');if(!report.passed)process.exitCode=1;
