'use strict';
const q=require('./mp-live-070.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const c=await q.connect(),proof={};try{
 if(await c.child('__warzoneCommands.report().buildOpen'))await c.tap('#wt-open-build');
 const frame=await c.evaluate("(()=>{const r=document.querySelector('#warzone-game-frame').getBoundingClientRect();return {left:r.left,top:r.top};})()");
 const camera=()=>c.child('PcMultiplayerNative.state.view.camera');
 const pair=(angle,radius,dy=0)=>[0,1].map((n)=>({x:frame.left+590+Math.cos(angle+n*Math.PI)*radius,y:frame.top+220+dy+Math.sin(angle+n*Math.PI)*radius,id:51+n,radiusX:2,radiusY:2,force:.6}));
 const touch=(type,p)=>c.call('Input.dispatchTouchEvent',{type,touchPoints:p});
 proof.before=await camera();proof.rotation=[];await touch('touchStart',pair(0,65));
 for(let i=1;i<=72;i++){await touch('touchMove',pair(i*Math.PI/36,65));await q.delay(65);if(i%6===0)proof.rotation.push(await camera());}
 await touch('touchEnd',[]);await q.delay(300);proof.afterRotation=await camera();
 let travel=0,previous=proof.before.yaw;for(const v of proof.rotation){let d=v.yaw-previous;while(d>32768)d-=65536;while(d< -32768)d+=65536;travel+=d;previous=v.yaw;}proof.rotationTravel=travel;
 assert.ok(Math.abs(travel-65536)<1500,'One full finger turn must produce one full camera turn: '+travel);
 assert.equal(proof.afterRotation.distance,proof.before.distance,'Rotate must preserve zoom');
 const pinch=async(start,end)=>{await touch('touchStart',pair(0,start));for(let i=1;i<=10;i++){await touch('touchMove',pair(0,start+(end-start)*i/10));await q.delay(65);}await touch('touchEnd',[]);await q.delay(300);return camera();};
 proof.pinch=await pinch(45,85);assert.ok(Math.abs(proof.pinch.distance-proof.before.distance*45/85)<60,'Pinch must track finger ratio');
 proof.unpinch=await pinch(85,45);assert.ok(Math.abs(proof.unpinch.distance-proof.before.distance)<80,'Reverse pinch must restore zoom');
 await touch('touchStart',pair(0,60));for(let i=1;i<=8;i++){await touch('touchMove',pair(0,60,i*12));await q.delay(70);}await touch('touchEnd',[]);await q.delay(300);proof.tilt=await camera();
 assert.ok(Math.abs(proof.tilt.pitch-proof.unpinch.pitch-96/32*2*65536/360)<70,'Tilt must track finger displacement');
 assert.equal(proof.tilt.distance,proof.unpinch.distance,'Tilt must preserve zoom');
 proof.controls=await c.child('__kalaWarzoneTouch.report()');assert.equal(proof.controls.pointers,0);assert.equal(proof.controls.gestureActive,false);
 await c.save('final-camera');proof.passed=true;console.log(JSON.stringify({passed:true,rotationTravel:travel,pinch:proof.pinch.distance,tilt:proof.tilt.pitch,held:proof.controls.heldKeys}));
}catch(e){proof.error=String(e);await c.save('final-camera-failure');throw e;}finally{fs.writeFileSync(path.join(q.out,'final-camera-proof.json'),JSON.stringify(proof,null,2));c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
