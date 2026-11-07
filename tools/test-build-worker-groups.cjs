'use strict';
// Execute the real selection/placement functions against independent native
// screen centres. These checks do not replace real emulator order verification.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{fixture}=require('./box-selection-fixture.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{await tick();await tick();};
const jobs=f=>f.requests.filter(r=>r.action==='queue-build');
const ids=value=>Array.from(value).sort((a,b)=>a-b);
const beforeWorld=f=>f.units.map(u=>[u.id,u.order,u.queued,...u.position]);
function otherSide(f,property='radarTaps'){
 for(const u of f.units)u.sx=-50;
 const local=f.units.find(u=>u.id===3);local.sx=600;local.sy=300;
 f.camera[property]=(f.camera[property]||0)+1;
}
(async()=>{
 const manual=fixture();await manual.context.selectVisibleTrucks();manual.context.beginPlacement('GuardTower1');
 manual.context.placeAt(8,71);await settle();
 const original=ids(jobs(manual)[0].data.workerIds),nativeBefore=beforeWorld(manual);
 manual.manual([3]);manual.context.placeAt(30,30);await settle();
 assert.deepEqual(ids(jobs(manual)[1].data.workerIds),[3],'a manual native group change after choosing an item owns the next placement');
 assert.deepEqual(ids(jobs(manual)[0].data.workerIds),original,'new group cannot rewrite an accepted earlier job');
 assert.deepEqual(beforeWorld(manual),nativeBefore,'group changes issue no movement or stop orders');
 manual.manual([]);const count=jobs(manual).length;manual.context.placeAt(31,30);await settle();
 assert.equal(jobs(manual).length,count,'manually clearing selection must not resurrect the previous group or pick a global worker');
 assert.ok(manual.notices.includes('no-visible-truck'));

 const pan=fixture();await pan.context.selectVisibleTrucks();pan.context.beginPlacement('GuardTower1');pan.context.placeAt(8,71);await settle();
 const prior=jobs(pan)[0].data.workerIds.slice(),baseline=beforeWorld(pan),coldBoxes=pan.boxes.length;
 otherSide(pan);pan.context.placeAt(30,30);await settle();await pan.state.selectionPromise;await settle();
 assert.deepEqual(ids(jobs(pan)[1].data.workerIds),[3],'same-item placement after a map move selects the constructors in the new view');
 assert.deepEqual(Array.from(jobs(pan)[0].data.workerIds),Array.from(prior),'the old area keeps its original accepted worker IDs');
 assert.ok(pan.boxes.length>coldBoxes,'a changed view causes a native visible selection');
 const refreshed=pan.boxes.length;pan.context.placeAt(31,30);await settle();
 assert.equal(pan.boxes.length,refreshed,'unchanged-view placements do not repeatedly scan');
 pan.manual([3]);pan.context.beginPlacement('PillBox1');pan.context.placeAt(32,30);await settle();
 assert.deepEqual(ids(jobs(pan).at(-1).data.workerIds),[3]);assert.equal(pan.boxes.length,refreshed,'a deliberate current-view manual group is retained');
 assert.deepEqual(beforeWorld(pan),baseline,'visible rescans change no native orders or positions');
 assert.deepEqual(pan.unsafeMoves,[]);

 const choose=fixture();await choose.context.selectVisibleTrucks();choose.context.beginPlacement('GuardTower1');otherSide(choose,'panMoves');
 choose.context.beginPlacement('PillBox1');await choose.state.selectionPromise;await settle();choose.context.placeAt(30,31);await settle();
 assert.deepEqual(ids(jobs(choose)[0].data.workerIds),[3],'choosing a new item after camera movement also refreshes the group');

 const empty=fixture();await empty.context.selectVisibleTrucks();empty.context.beginPlacement('GuardTower1');for(const u of empty.units)u.sx=-50;empty.camera.baseJumps=1;
 empty.context.placeAt(20,20);await empty.state.selectionPromise;await settle();
 assert.equal(jobs(empty).length,0,'moving to an empty view cannot dispatch old offscreen trucks');assert.deepEqual(Array.from(empty.state.nativeBuildGroup),[]);

 const pending=fixture({hold:true});const selecting=pending.context.selectVisibleTrucks();await tick();pending.context.beginPlacement('GuardTower1');pending.context.placeAt(8,71);
 otherSide(pending);pending.release();await selecting;await settle();
 assert.equal(jobs(pending).length,0,'a camera change during native selection cannot send the old-view tap with a new-view group');
 assert.ok(pending.notices.includes('view-changed'));
 pending.context.placeAt(30,30);await pending.state.selectionPromise;await settle();assert.deepEqual(ids(jobs(pending)[0].data.workerIds),[3],'the next stable-view tap recovers without a global fallback');

 const late=fixture();await late.context.selectVisibleTrucks();late.context.beginPlacement('GuardTower1');
 late.manual([160001]);late.context.syncBuildGroup();const oldView=late.state.buildSelectionView;
 otherSide(late);late.state.selectionEventSerial++;late.state.snapshot=late.snapshot();late.context.syncBuildGroup();
 assert.equal(late.state.buildSelectionView,oldView,'a late automatic selection event cannot stamp an old group as belonging to the new view');
 late.context.placeAt(30,30);await late.state.selectionPromise;await settle();assert.deepEqual(ids(jobs(late)[0].data.workerIds),[3]);
 late.manual([]);late.context.placeAt(31,30);await settle();assert.equal(jobs(late).length,1,'a genuinely new manual clear after a rescan still prevents fallback');

 const touchSource=fs.readFileSync('app/src/main/assets/warzone-touch-controls.js','utf8'),inputState={manualSelectionRevision:0,boxSelections:0,battleActive:true,clickQueue:[]};
 const input=vm.createContext({state:inputState,Number,Promise,canvas:()=>({getBoundingClientRect:()=>({left:0,top:0,right:1000,bottom:600})}),releaseCameraKeys(){},releaseMouse(){},pressMouse:()=>true,pumpClicks(){}});
 vm.runInContext(touchSource.slice(touchSource.indexOf('  function beginBoxSelection('),touchSource.indexOf('  function beginPan(')),input);
 vm.runInContext(touchSource.slice(touchSource.indexOf('  function nativeBoxSelect('),touchSource.indexOf('  function nativeSelectionBounds(')),input);
 const automatic=input.nativeBoxSelect(20,20,40,40);assert.equal(inputState.manualSelectionRevision,0,'the actual automatic native BOX API never claims manual intent');inputState.clickQueue[0].resolve(true);await automatic;
 const gesture={startX:20,startY:20};input.beginBoxSelection(gesture);input.beginBoxSelection(gesture);assert.equal(inputState.manualSelectionRevision,1,'the actual manual BOX gesture records one user selection intent');

 const module=fixture();await module.context.selectVisibleTrucks();module.context.beginPlacement('GuardTower1');otherSide(module,'radarDrags');
 module.context.previewAt=()=>({x:30,y:30,parentId:900,target:{eligible:true,modules:0,reserved:0}});
 module.context.placeAt(30,30);await module.state.selectionPromise;await settle();
 assert.equal(jobs(module)[0].data.parentId,900);assert.deepEqual(ids(jobs(module)[0].data.workerIds),[3],'module-parent orders use the same new-view group logic');
 assert.ok([manual,pan,choose,empty,pending,late,module].every(f=>f.requests.every(r=>!['cancel-job','stop-workers'].includes(r.action))),'selection never cancels another group work');
 console.log('PASS: actual placement keeps area jobs immutable, honors manual/cleared groups, refreshes once after camera moves, rejects changing/empty views safely, and covers module parents');
})().catch(error=>{console.error(error);process.exitCode=1;});
