'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
(async()=>{
 let frames=0,copies=0;
 const shot={hidden:true,style:{},getContext:()=>({drawImage(){copies++}}),animate:()=>({finished:Promise.resolve(),cancel(){}})};
 const c=vm.createContext({element:id=>id==='wt-build-busy'?shot:{getBoundingClientRect:()=>({x:0,y:56,width:1280,height:520})},document:{getElementById:()=>({width:1920,height:780})},window:{__kalaWarzoneTouch:{report:()=>({nativeRenderFrames:++frames})}},host:{matchMedia:()=>({matches:false})},nativeFrames:async()=>{},requestAnimationFrame:f=>setImmediate(f),Date,Promise});
 vm.runInContext(source.slice(source.indexOf('  let battlefieldHolds='),source.indexOf('  async function nativeTap(')),c);
 await c.freezeBattlefield();await c.freezeBattlefield();assert.equal(copies,1,'nested native setup reuses the same battlefield frame');
 await c.releaseBattlefield();assert.equal(shot.hidden,false,'inner setup cannot expose native menus while outer item selection still owns the cover');
 await c.releaseBattlefield();assert.equal(shot.hidden,true,'last owner returns to the rendered battlefield');
 await c.freezeBattlefield();assert.equal(copies,2,'next transition captures the current battlefield');await c.releaseBattlefield();assert.equal(shot.hidden,true);
 console.log('PASS: nested build transitions keep the battlefield covered until the last owner releases it');
})().catch(e=>{console.error(e);process.exitCode=1});
