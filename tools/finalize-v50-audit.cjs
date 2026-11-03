'use strict';
// Release gate: evidence must identify the installed artifact, not a prototype.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),{adb}=require('./android-sdk.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa/v5.0'),read=p=>JSON.parse(fs.readFileSync(path.join(out,p),'utf8'));
const apk=path.join(root,'app/build/outputs/apk/debug/app-debug.apk'),hash=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
const cases={
 'ship-normal':['production-return','controls','gestures','generated-template','build-interrupt'],
 'ship-hq':['grow-group','fast-queue-pan','queue-cancel'],
 'ship-pages':['invalid-tool','native-queue','roundtrip','native-switch','wave-play'],
 'ship-compact':['partial-resume','density-resize','compact-smoke']
};
const evidence=[];
for(const [dir,names]of Object.entries(cases))for(const name of names){const record=read(`${dir}/tested-${name}.json`);assert.equal(record.apkSHA256,hash,`${dir}/${name} tested another artifact`);assert.equal(record.installedMatches,true);const file=name==='grow-group'?'large-group-results':name==='native-queue'?'native-queue-results':name+'-results';const result=read(`${dir}/${file}.json`);assert.equal(result.apkSHA256,hash,'Result belongs to another APK');assert.ok(Date.parse(result.completedAt)>=Date.parse(record.startedAt),'An old pass cannot certify a later incomplete/failed run');evidence.push(`${dir}/${file}.json`);}
assert.equal(read('ship-hq/large-group-results.json').selected.length,15);
assert.equal(Object.values(read('ship-hq/fifteen-manual-pair.json')['droid.json']).filter(d=>d.player===0&&d.selected).length,2);
assert.deepEqual(read('ship-hq/fifteen-trucks-selected.json')['gam.json'].viewDataP,{x:896,y:800,z:4864});
assert.deepEqual(read('ship-hq/fifteen-manual-pair.json')['gam.json'].viewDataP,{x:896,y:800,z:4608});
assert.equal(read('ship-normal/production-return-results.json').movements.length,3);
assert.ok(read('ship-pages/native-queue-results.json').after.some(d=>d.order===2));
assert.equal(read('ship-normal/build-interrupt-results.json').openingInterrupted,true);
const gestures=read('ship-normal/gestures-results.json');assert.ok(Math.abs(gestures.zoomAfter-gestures.zoomBefore)>.1);assert.notDeepEqual(gestures.rotationAfter,gestures.rotationBefore);
assert.equal(read('ship-compact/partial-resume-results.json').explicitHelpBuild,true);
assert.equal(read('ship-compact/density-resize-results.json').retained,true);
assert.equal(read('ship-pages/roundtrip-results.json').cycles,3);
for(const file of ['ship-pages/roundtrip-results.json','ship-normal/production-return-results.json','ship-compact/compact-smoke-results.json'])for(const layout of read(file).layouts)assert.ok(Math.abs(layout.buffer[0]*layout.frame.height-layout.buffer[1]*layout.frame.width)<=Math.max(...layout.buffer),'Native framebuffer must keep the viewport aspect ratio');
const scripts=fs.readdirSync(__dirname).filter(n=>/^test-.*\.cjs$/.test(n)),log=fs.readFileSync(path.join(out,'regressions.txt'),'utf8');assert.equal(scripts.length,16);for(const script of scripts)assert.ok(log.includes('RUN '+script));
assert.ok(fs.readFileSync(path.join(out,'signature.txt'),'utf8').includes('Verifies'));assert.ok(fs.readFileSync(path.join(out,'build.txt'),'utf8').includes('BUILD SUCCESSFUL'));assert.equal(read('engine-preservation.json').candidateAPK_SHA256,hash);
const run=(...args)=>execFileSync(adb,['-s',process.env.WZ_QA_DEVICE||'emulator-5554',...args],{encoding:'utf8',timeout:20000}),installed=run('shell','pm','path','com.rbabbit.warzonetowers').trim().slice(8);assert.equal(run('shell','sha256sum',installed).split(/\s/)[0],hash);
const ws=fs.readFileSync(path.join(__dirname,'live-cdp-url.txt'),'utf8').trim(),live=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'cdp-evaluate.cjs'),ws,'JSON.stringify({version:__warzoneCommands.report().version,commands:__warzoneCommands.report(),wave:__warzoneTowersWaves.report().snapshot,touch:__kalaWarzoneTouch.report(),graphics:WarzoneGraphics.report(),viewport:[parent.innerWidth,parent.innerHeight]})'],{encoding:'utf8',timeout:20000}));assert.equal(live.version,50);assert.equal(live.touch.version,54);assert.ok(live.touch.nativeRenderFrames>0);assert.ok(live.touch.hudVisible);assert.notEqual(live.wave.phase,'defeated');
fs.writeFileSync(path.join(out,'final-live-state.json'),JSON.stringify(live,null,2));
const result={passed:true,scope:'Reported gameplay flows and related menus; finite emulator coverage',apkSHA256:hash,versionCode:50,installedHashMatches:true,appAliveAtFinalCheck:true,regressionScripts:scripts,evidence,environment:{avd:'Pixel_10_Pro',renderer:'SwiftShader',audio:false,android:run('shell','getprop','ro.build.version.release').trim()},limits:['Pre-existing emulator black terrain in Normal and HQ','No physical Samsung tablet test or audio-output assessment','No exhaustive late-game, every map/module/research combination, or QuickLoad certification']};
fs.writeFileSync(path.join(out,'final-tests.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));



