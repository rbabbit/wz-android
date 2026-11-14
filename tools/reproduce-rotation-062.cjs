'use strict';
const assert=require('node:assert/strict'),{create}=require('./rotation-live-062.cjs');
async function main(){const h=await create();try{assert.equal(h.installed(),'956e33408424fb53b7c2be1b2a60d0b2d19fa3d2dd8742eebbc5e3f6606f00b9');const initial=await h.load('ffa'),v=await h.viewport(),r=Math.min(110,v.height*.2),pivot={x:v.centerX-r/2,y:v.centerY};const pair=(a,b)=>[{id:11,...a},{id:12,...b}],results=[];
 for(const direction of [1,-1])results.push(await h.gesture('061-fixed-pivot-'+(direction>0?'cw':'ccw'),t=>pair(pivot,{x:pivot.x+r*Math.cos(direction*2*Math.PI*t),y:pivot.y+r*Math.sin(direction*2*Math.PI*t)})));
 results.push(await h.gesture('061-opposing-vertical',t=>pair({x:v.centerX-60,y:v.centerY-60*t},{x:v.centerX+60,y:v.centerY+60*t}),{steps:48,interval:30,stages:2}));
 results.push(await h.gesture('061-asymmetric-opposing-vertical',t=>pair({x:v.centerX-60,y:v.centerY-15*t},{x:v.centerX+60,y:v.centerY+105*t}),{steps:48,interval:30,stages:2}));
 results.push(await h.gesture('061-diametric-full-cw',t=>{const a=2*Math.PI*t;return pair({x:v.centerX-r*Math.cos(a),y:v.centerY-r*Math.sin(a)},{x:v.centerX+r*Math.cos(a),y:v.centerY+r*Math.sin(a)})}));
 h.save('baseline-061-gesture-summary',{version:'0.62',baseline:'0.61',emulatorUsed:true,actualNativeEngineExecuted:true,initial,viewport:v,results:results.map(({name,delta,unwrappedYawDegrees,pitchPreserved,screenshot})=>({name,delta,unwrappedYawDegrees,pitchPreserved,screenshot}))});console.log(JSON.stringify(results.map(({name,delta,unwrappedYawDegrees,pitchPreserved})=>({name,delta,unwrappedYawDegrees,pitchPreserved})),null,2));await h.pause();
}finally{await h.close();}}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
