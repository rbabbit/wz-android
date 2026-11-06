'use strict';
// Reject nominal wm settings that still yield a portrait/letterboxed Activity.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,adb,out}=require('./native-live.cjs');
(async()=>{const [width,height,density,font]=process.argv.slice(2).map(Number);assert.ok(width&&height&&density&&font);const c=await connect();try{
 const d=await c.wait('(()=>{const d=JSON.parse(BlockNightAndroid.nativeDiagnostics());return d.stageWidth==='+width+'&&d.headerBounds[0]===0&&d.headerBounds[1]===0&&!d.layoutPending&&d;})()',10000);
 const png=adb('exec-out','screencap','-p');assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height);
 const densityText=adb('shell','wm','density').toString(),fontText=adb('shell','settings','get','system','font_scale').toString().trim();
 assert.equal(Number(densityText.match(/Override density: (\d+)/)?.[1]||densityText.match(/Physical density: (\d+)/)?.[1]),density);assert.equal(Number(fontText),font);
 const apk=adb('shell','pm','path','com.rbabbit.warzonetowers').toString().trim().replace('package:',''),hash=adb('shell','sha256sum',apk).toString().split(/\s/)[0],file=path.join(out,'actual-profiles.json');let log={passed:true,candidateAPK_SHA256:hash,profiles:[]};if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.candidateAPK_SHA256===hash)log=old;}
 log.profiles.push({at:new Date().toISOString(),widthPx:width,heightPx:height,densityDpi:density,systemFontScale:font,appControlScale:d.controlScale,headerBounds:d.headerBounds,stageHeight:d.stageHeight});fs.writeFileSync(file,JSON.stringify(log,null,2));console.log('PASS: observed native '+width+'x'+height+'/d'+density+'/font'+font);
 }finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
