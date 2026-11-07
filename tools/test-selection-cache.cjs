'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),{fixture,source}=require('./box-selection-fixture.cjs');
const ids=result=>Array.from(result,t=>t.id).sort((a,b)=>a-b),expected=[160001,160003];
const orders=f=>f.units.map(u=>[u.id,u.order,u.queued,...u.position]);
(async()=>{
 const f=fixture({mixed:true}),baseline=orders(f);assert.deepEqual(ids(await f.context.selectVisibleTrucks()),expected);const cold=f.state.truckSelection.boxes;
 assert.equal(f.state.truckSelectionCache.size,1);assert.deepEqual(ids(await f.context.selectVisibleTrucks()),expected);assert.equal(f.state.truckSelection.cacheHit,true);assert.ok(f.state.truckSelection.boxes<cold,'verified cached rectangles reduce native BOX count after the mandatory fresh full-field scan');assert.deepEqual(orders(f),baseline);
 const combat=f.units.find(u=>u.id===201);combat.sx=590;combat.sy=310;combat.position[1]+=20;let before=orders(f);
 assert.deepEqual(ids(await f.context.selectVisibleTrucks()),expected);assert.equal(f.state.truckSelection.cacheRejected,true,'combat entering a cached clean rectangle invalidates the replay');assert.equal(f.state.truckSelection.cacheHit,false);assert.deepEqual(f.selected().sort((a,b)=>a-b),expected);assert.deepEqual(orders(f),before,'cache fallback cannot give movement orders or change queued work');
 const truck=f.units.find(u=>u.id===160001);truck.sx=700;truck.sy=270;truck.x++;truck.position[0]+=128;before=orders(f);
 assert.deepEqual(ids(await f.context.selectVisibleTrucks()),expected);assert.equal(f.state.truckSelection.cacheRejected,true,'moving a constructor outside its prior clean rectangle falls back to current native subdivision');assert.deepEqual(orders(f),before);
 const entering=f.units.find(u=>u.id===3);entering.sx=680;entering.sy=200;before=orders(f);
 assert.deepEqual(ids(await f.context.selectVisibleTrucks()),[3,...expected]);assert.equal(f.state.truckSelection.cacheRejected,true,'a changed fresh native constructor ID set cannot reuse an older cache result');assert.deepEqual(orders(f),before);
 f.bounds.right=980;await f.context.selectVisibleTrucks();assert.equal(f.state.truckSelection.cacheHit,false,'geometry changes use a different signature');
 for(let player=1;player<=5;player++){f.setPlayer(player);await f.context.selectVisibleTrucks();assert.ok(f.state.truckSelectionCache.size<=4,'selection cache is bounded to four signatures');}
 f.state.siteNumbers=new Map();f.context.before={gameTime:2000};f.context.reply={result:{gameTime:1000}};f.context.window.WarzoneBuildDisplay.reset=()=>{};f.context.cancelPlacement=()=>{};
 vm.runInContext(source.slice(source.indexOf('      if(before&&reply.result.gameTime<before.gameTime)'),source.indexOf('      const changed=before&&')),f.context);assert.equal(f.state.truckSelectionCache.size,0,'native world rewind clears all cached regions');
 await f.context.selectVisibleTrucks();assert.ok(f.state.truckSelectionCache.size);vm.runInContext(source.slice(source.indexOf('  function endBattle(){'),source.indexOf("  window.addEventListener('warzone-battle-ended'")),f.context);f.context.endBattle();assert.equal(f.state.truckSelectionCache.size,0,'battle end clears all cached regions');
 const polling=fixture(),active=new Set();let polls=0,resolve;
 polling.context.setInterval=(fn,ms)=>{assert.equal(ms,45);const id=setInterval(fn,ms);active.add(id);return id;};polling.context.clearInterval=id=>{clearInterval(id);active.delete(id);};
 polling.context.send=(action,data,options)=>{assert.equal(action,'state');assert.equal(options.fresh,true);return new Promise(r=>resolve=r);};
 polling.context.window.__blockNightResearch={pollOutput(){polls++;if(polls===1)throw Error('transient reader failure');if(polls===2)resolve({ok:true,result:polling.snapshot()});}};
 const started=Date.now();assert.equal((await polling.context.selectionState()).ok,true);assert.ok(Date.now()-started<300,'only the pending fresh request actively consumes the existing reader instead of its 650ms background interval');assert.equal(active.size,0,'successful request clears its fast reader timer');
 polling.context.send=()=>new Promise(()=>{});polling.context.window.__blockNightResearch.pollOutput=()=>{};polling.context.setTimeout=(fn,ms)=>setTimeout(fn,ms===2500?60:ms);
 assert.equal((await polling.context.selectionState()).reason,'selection-paused');assert.equal(active.size,0,'timeout clears the fast reader interval');
 polling.context.send=()=>Promise.reject(Error('bridge failure'));await assert.rejects(()=>polling.context.selectionState(),/bridge failure/);assert.equal(active.size,0,'rejection also clears reader timers');
 console.log('PASS: fresh native cache verification, combat/movement/ID mismatch fallback without orders, four-key bound, world/end reset, and pending-only reader timer cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
