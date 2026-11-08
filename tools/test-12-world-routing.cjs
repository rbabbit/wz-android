'use strict';
// Execute the current routing functions. These are async race/identity and
// input-priority regressions, not a substitute for actual both-map world taps.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-touch-controls.js','utf8');
const commandsSource=fs.readFileSync('scenario/warzone-towers-commands.js','utf8');
const section=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)));
function harness(kind='research'){
 let now=0,navigation=1,ended=false,hit={id:501,kind,ready:true,nativeStatus:1};const pending=[],opens=[],native=[],actions=[];
 const report={page:'',buildOpen:false,placement:'',nativeMenu:''},state={battleActive:true,combatLock:false,queueMode:false,boxMode:false,stopNonce:'',facilityNavigationSerial:0,facilityOpens:0,lastFacility:null,facilityError:'',pointers:new Map(),primaryId:null,single:null,multi:null,ignoreUntilAllUp:false,taps:0,orders:0,manualSelectionRevision:0,radarTaps:0,radarDrags:0};
 const canvas={},commands={report:()=>report,navigationRevision:()=>navigation,send(action,data,options){assert.equal(action,'state');assert.equal(options.fresh,true);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},openFactory:id=>{opens.push(['factory',id]);return true},isPlacement:()=>Boolean(report.placement),placeAt:()=>{actions.push('place');return true},queueNativeSite:()=>{actions.push('queue');return true}};
 const window={__warzoneCommands:commands,WarzoneBuildDisplay:{pickFacilityTarget:()=>hit},__blockNightResearch:{openForLabId:id=>{opens.push(['research',id]);return true},afterNativeTap(){}},__towersHtml:{isEnded:()=>ended}};
 const context={window,state,performance:{now:()=>now},canvas:()=>canvas,own(){},releasePointer(){},clearLongPress(){},releaseMouse(){actions.push('release')},mouseMove(){},feedback(){},vibrate(){},recordTap(){},nativeUiClick(){native.push('native-ui')},contextualClick(){native.push('context')},click:(...v)=>native.push(v),queueCombatOrder(){actions.push('combat')},isBattlefieldPoint:()=>true,isQueuePlacementPoint:()=>true,LONG_PRESS_MS:500,DOUBLE_TAP_MS:300,clearMultiMove(){},flushMultiMove(){},endMultiIfNeeded(){},updateCombatHud(){}};
 vm.createContext(context);
 vm.runInContext(section(source,'  function cancelFacilityNavigation()',"  commandDocument().addEventListener('pointerdown',cancelFacilityNavigation"),context);
 vm.runInContext(section(source,'  function processPointer(', '  function releaseAll('),context);
 return {context,window,state,report,pending,opens,native,actions,canvas,hit:()=>hit,setHit:v=>{hit=v},setTime:v=>{now=v},navigate:()=>navigation++,end:()=>{ended=true},resolve:(targets=hit?[hit]:[])=>pending.shift().resolve({ok:true,result:{facilityTargets:targets}})};
}
async function flush(){for(let i=0;i<5;i++)await Promise.resolve();}
async function positive(kind){const h=harness(kind);assert.equal(h.context.openFacilityAt(200,150),true,'consume matched facility before fresh native reply');assert.deepEqual(h.opens,[],'fresh identity is required before UI opening');assert.equal(h.pending.length,1);h.resolve();await flush();assert.deepEqual(h.opens,[[kind==='research'?'research':'factory',501]]);assert.equal(h.state.facilityOpens,1);assert.equal(h.state.lastFacility.id,501);assert.deepEqual(h.native,[]);}
async function suppressed(mutate,targets){const h=harness();assert.equal(h.context.openFacilityAt(200,150),true);mutate(h);h.resolve(targets===undefined?[{id:501,kind:'research',ready:true,nativeStatus:1}]:targets);await flush();assert.deepEqual(h.opens,[]);assert.deepEqual(h.native,[],'stale/rejected route never queues a fallback native left click');return h;}
function tap(h,overrides={}){
 const id=5;h.state.pointers.set(id,{x:200,y:150});h.state.primaryId=id;h.state.single={startX:200,startY:150,x:200,y:150,previousX:200,previousY:150,downAt:0,downInputTime:0,moved:false,panning:false,longPressArmed:false,selecting:false,radar:false,radarMoved:false,radarDragging:false,boxOneShot:false,...overrides.gesture};
 h.context.processPointer({type:'pointerup',pointerId:id,target:h.canvas,clientX:200,clientY:150,timeStamp:100,...overrides.event});
}
async function routingChecks(){
 for(const kind of ['research','factory','cyborg','vtol'])await positive(kind);
 for(const [key,value]of [['buildOpen',true],['placement','A0ResearchModule1'],['page','design'],['nativeMenu','factory']]){const h=harness();h.report[key]=value;assert.equal(h.context.openFacilityAt(1,1),false);assert.equal(h.pending.length,0);}
 for(const [key,value]of [['battleActive',false],['combatLock',true],['queueMode',true],['boxMode',true],['stopNonce','stop-1']]){const h=harness();h.state[key]=value;assert.equal(h.context.openFacilityAt(1,1),false);assert.equal(h.pending.length,0);}
 const miss=harness();miss.setHit(null);assert.equal(miss.context.openFacilityAt(1,1),false);assert.equal(miss.pending.length,0);
 const duel=harness();duel.window.__warzoneDuelConfig={mode:'duel'};assert.equal(duel.context.openFacilityAt(1,1),false);assert.equal(duel.pending.length,0);
 await suppressed(()=>{},[]);await suppressed(()=>{},[{id:999,kind:'research',ready:true,nativeStatus:1}]);await suppressed(()=>{},[{id:501,kind:'research',ready:false,nativeStatus:0}]);
 await suppressed(h=>h.setHit(null));await suppressed(h=>h.setHit({id:999,kind:'research'}));
 await suppressed(h=>h.context.cancelFacilityNavigation());await suppressed(h=>h.navigate());await suppressed(h=>h.setTime(1501));await suppressed(h=>h.end());await suppressed(h=>h.state.battleActive=false);
 for(const key of ['page','buildOpen','placement','nativeMenu'])await suppressed(h=>h.report[key]=key==='page'?'design':true);
 for(const key of ['queueMode','combatLock','boxMode'])await suppressed(h=>h.state[key]=true);
 const rejected=harness();assert.equal(rejected.context.openFacilityAt(200,150),true);rejected.pending.shift().resolve({ok:false,reason:'gone'});await flush();assert.deepEqual(rejected.opens,[]);
 const failed=harness();failed.context.openFacilityAt(200,150);failed.pending.shift().reject(Error('transport failed'));await flush();assert.match(failed.state.facilityError,/transport failed/);assert.deepEqual(failed.opens,[]);assert.deepEqual(failed.native,[]);
 const normal=harness();tap(normal);assert.equal(normal.pending.length,1);assert.deepEqual(normal.native,[]);assert.equal(normal.state.primaryId,null);assert.equal(normal.state.single,null);assert.equal(normal.state.pointers.size,0,'consumed route preserves ordinary pointer cleanup');normal.resolve();await flush();assert.deepEqual(normal.opens,[['research',501]]);
 const ground=harness();ground.setHit(null);tap(ground);assert.deepEqual(ground.native,[[0,200,150]],'plain ground/unit miss retains one ordinary native left tap');assert.equal(ground.pending.length,0);
 const placing=harness();placing.report.placement='A0ResearchModule1';tap(placing);assert.deepEqual(placing.actions,['place']);assert.equal(placing.pending.length,0);assert.deepEqual(placing.native,[]);
 const combat=harness();combat.state.combatLock=true;tap(combat);assert.deepEqual(combat.actions,['combat']);assert.equal(combat.pending.length,0);
 const queue=harness();queue.state.queueMode=true;tap(queue);assert.deepEqual(queue.actions,['queue']);assert.equal(queue.pending.length,0);
 const pan=harness();tap(pan,{gesture:{moved:true,panning:true}});assert.deepEqual(pan.actions,['release']);assert.equal(pan.pending.length,0);assert.deepEqual(pan.native,[]);
 const long=harness();tap(long,{gesture:{longPressArmed:true},event:{timeStamp:600}});assert.deepEqual(long.native,[[2,200,150]],'long press keeps native order semantics');assert.equal(long.pending.length,0);
 const radar=harness();tap(radar,{gesture:{radar:true}});assert.deepEqual(radar.native,[[2,200,150]],'radar keeps native camera tap semantics');assert.equal(radar.pending.length,0);
 const cancel=harness();tap(cancel,{event:{type:'pointercancel'}});assert.equal(cancel.pending.length,0);assert.deepEqual(cancel.native,[]);assert.equal(cancel.state.single,null);
 assert.ok(section(source,'  function releaseAll(', '  function native').includes('cancelFacilityNavigation();'),'releaseAll cancels delayed facility navigation');
 assert.ok(source.includes("commandDocument().addEventListener('pointerdown',cancelFacilityNavigation,{capture:true,passive:true})"),'host controls cancel delayed navigation before click handlers');
 assert.ok(section(source,'  function handlePointer(', '  function processPointer(').includes("if(event.type==='pointerdown')cancelFacilityNavigation();"),'a later world gesture cancels delayed navigation');
}
function observerChecks(){
 const structs=[{id:1,player:0,stattype:7,status:1,x:3,y:4,z:0},{id:2,player:0,stattype:1,status:1,x:6,y:4,z:1,modules:1},{id:3,player:0,stattype:16,status:1,x:9,y:4,z:0},{id:4,player:0,stattype:2,status:1,x:12,y:4,z:0},{id:5,player:0,stattype:7,status:0,x:15,y:4,z:0},{id:6,player:0,stattype:9,status:1,x:18,y:4,z:0}];
 const enumCalls=[],rangeCalls=[],writes=[],visible=[{id:20,type:0,x:3,y:4,z:0,bodySize:0},{id:21,type:0,x:10,y:5,z:1,bodySize:2},{id:22,type:0,x:50,y:50,z:0,bodySize:1},{id:23,type:1,x:3,y:4,z:0}],b={};
 for(const id of ['A0ResearchFacility','A0LightFactory','A0CyborgFactory','A0VTolFactory1'])b[id]={width:2,breadth:2};
 let current={name:'MG Viper Wheels',body:'Body1REC',propulsion:'wheeled01',droidType:0,weapons:['MG1Mk1']};
 const c=vm.createContext({selectedPlayer:0,BUILT:1,RESEARCH_LAB:7,FACTORY:1,CYBORG_FACTORY:16,VTOL_FACTORY:2,DROID:0,ALL_PLAYERS:-1,mapWidth:64,mapHeight:64,wtcmd_buildings:b,enumStruct:player=>{enumCalls.push(player);return structs},enumRange:(...args)=>{rangeCalls.push(args);return visible},getDroidProduction:()=>current,setPower:()=>writes.push('power'),orderDroid:()=>writes.push('order')});
 vm.runInContext(section(commandsSource,'function wtcmd_facilityTargets()', 'function wtcmd_snapshot()'),c);
 vm.runInContext(section(commandsSource,'function wtcmd_templateParts(', 'function wtcmd_templateAvailable('),c);
 const targets=c.wtcmd_facilityTargets();assert.deepEqual(Array.from(targets,t=>[t.id,t.kind]),[[1,'research'],[2,'factory'],[3,'cyborg'],[4,'vtol']]);assert.deepEqual(enumCalls,[0]);assert.ok(targets.every(t=>t.ready&&t.nativeStatus===1));
 const blockers=c.wtcmd_facilityBlockers(targets);assert.deepEqual(Array.from(blockers,d=>d.id),[20,21]);assert.deepEqual(rangeCalls[0],[32,32,64,-1,true],'blockers use visible-only native range enumeration');
 const stringWeapon=c.wtcmd_currentProduction(structs[1]);assert.deepEqual(Array.from(stringWeapon.turrets),['MG1Mk1']);current={...current,weapons:[{id:'Cannon1Mk1'},{name:'Rocket-Pod'}]};assert.deepEqual(Array.from(c.wtcmd_currentProduction(structs[1]).turrets),['Cannon1Mk1','Rocket-Pod']);
 current={...current,weapons:[],construct:'Spade1Mk1'};assert.deepEqual(Array.from(c.wtcmd_currentProduction(structs[1]).turrets),['Spade1Mk1']);current=null;assert.equal(c.wtcmd_currentProduction(structs[1]),null);assert.equal(c.wtcmd_currentProduction({...structs[1],status:0}),null);assert.deepEqual(writes,[],'observer functions issue no selections, research, orders or power changes');
}
(async()=>{await routingChecks();observerChecks();console.log('PASS: actual world-tap routing consumes before SDL, requires fresh same native ID/re-hit, cancels stale/dead/occluded/later-gesture/page/Duel paths, retains pointer/placement/combat/radar semantics; facility/production observers are read-only with native string/object equipment');})().catch(e=>{console.error(e);process.exitCode=1});
