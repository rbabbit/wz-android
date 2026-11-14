'use strict';const q=require('./mp-live-071.cjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const proof={};
 q.adb('shell','input','keyevent','4');await q.delay(250);
 proof.backHome=q.adb('shell','dumpsys','activity','activities').toString().split('\n').filter(l=>/topResumedActivity|mResumedActivity/.test(l));assert.ok(proof.backHome.some(l=>l.includes('MainActivity')));q.screen('back071-home');
 q.adb('shell','wm','size','720x1280');q.adb('shell','wm','density','320');
 q.adb('shell','am','force-stop','com.rbabbit.warzonetowers.lab');q.adb('shell','am','start','-n','com.rbabbit.warzonetowers.lab/com.rbabbit.blocknight.warzone.MainActivity');await q.nativeTap('Multiplayer');
 const c=await q.connect();try{
  await c.wait('document.querySelectorAll(".room").length>0&&innerWidth<1100','small live lobby ready');
  proof.geometry=await c.evaluate(`(()=>{const r=e=>e.getBoundingClientRect().toJSON();return{viewport:[innerWidth,innerHeight],body:{scrollWidth:document.body.scrollWidth,scrollHeight:document.body.scrollHeight},toolbar:r(document.querySelector('.lobby-heading')),name:r(document.querySelector('#player-name')),filter:r(document.querySelector('#hide-empty')),rooms:r(document.querySelector('#rooms')),first:[...document.querySelectorAll('.room')].slice(0,3).map(e=>({rect:r(e),join:r(e.querySelector('button')),players:r(e.querySelector('.room-players'))})),home:!!document.querySelector('#home'),help:!!document.querySelector('#blocknight-help')};})()`);
  const g=proof.geometry;assert.ok(g.body.scrollWidth<=g.viewport[0]+1);assert.ok(g.body.scrollHeight<=g.viewport[1]+1);assert.ok(g.name.width>=100);assert.ok(g.first.every(r=>r.join.right<=g.viewport[0]&&r.join.height>=40));assert.equal(g.home,false);assert.equal(g.help,false);
 await c.save('lobby071-small');const was=await c.evaluate('document.querySelector("#hide-empty").checked');await c.tap('#hide-empty');await c.wait(`document.querySelector('#hide-empty').checked===${!was}`,'filter touch committed');await c.tap('#hide-empty');await c.wait(`document.querySelector('#hide-empty').checked===${was}`,'filter restored');
 }finally{c.close();}
 q.adb('shell','input','keyevent','4');await q.delay(200);proof.smallBackHome=q.adb('shell','dumpsys','activity','activities').toString().split('\n').filter(l=>/topResumedActivity|mResumedActivity/.test(l));assert.ok(proof.smallBackHome.some(l=>l.includes('MainActivity')));q.screen('back071-small-home');
 proof.passed=true;fs.writeFileSync(path.join(q.out,'small-layout-back-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
})().catch(e=>{console.error(e);process.exitCode=1});
