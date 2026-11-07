'use strict';
const assert=require('node:assert/strict'),{fixture}=require('./box-selection-fixture.cjs');
(async()=>{
 const f=fixture({actualSend:true,background:true});
 const selected=await f.context.selectVisibleTrucks();
 assert.deepEqual(Array.from(selected,t=>t.id).sort((a,b)=>a-b),[160001,160003],'a delayed pre-box background snapshot cannot replace the post-selection native constructor IDs');
 assert.deepEqual(Array.from(f.state.nativeBuildGroup).sort((a,b)=>a-b),f.selected().sort((a,b)=>a-b));
 assert.ok(f.requests.every(r=>!Object.hasOwn(r.data,'fresh')),'freshness stays an internal transport option');
 const first=f.context.send('state'),same=f.context.send('state');assert.equal(same,first,'ordinary background state polling still coalesces');
 const unique=f.context.send('state',{}, {fresh:true});assert.notEqual(unique,first,'selection state has its own native nonce after the completed input');await Promise.all([first,unique]);
 console.log('PASS: delayed pre-box snapshots cannot replace native selected IDs; post-input state is unique while ordinary polling coalesces');
})().catch(error=>{console.error(error);process.exitCode=1;});
