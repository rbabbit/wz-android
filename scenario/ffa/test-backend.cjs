/* Native-script policy checks only. Actual engine gameplay needs device QA. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='scenario/ffa/',policy=JSON.parse(fs.readFileSync(root+'policy.json','utf8'));
const config={mode:'ffa',map:'emag',difficulty:'hard',player:0};
const maps=JSON.parse(fs.readFileSync('app/src/main/assets/ffa-maps.json','utf8'));
const ctx={console,JSON,Date,Boolean,Array,Object,Number,Math,includeJSON:n=>n==='ffa-policy.json'?policy:n==='ffa-maps.json'?maps:config};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'policy.js','utf8'),ctx);
assert.equal(ctx.ffaResearchAllowed('R-Struc-VTOLFactory'),false);
assert.equal(ctx.ffaResearchAllowed('R-Vehicle-Prop-VTOL'),false);
assert.equal(ctx.ffaResearchAllowed('R-Wpn-Cannon1Mk1'),true);
assert.equal(ctx.ffaResearchAllowed('R-Vehicle-Engine07'),true);
const ground={body:'Body1REC',propulsion:'wheeled01',turrets:['Cannon1Mk1']};
assert.equal(ctx.ffaDesignAllowed(ground),true);
assert.equal(ctx.ffaDesignAllowed({...ground,propulsion:'V-Tol'}),false);
assert.equal(ctx.ffaDesignAllowed({...ground,body:'TransporterBody'}),false);
assert.equal(ctx.ffaDesignAllowed({...ground,turrets:['MG1-VTOL']}),false);
let nativeProduction=0,nativeValidation=0;
Object.assign(ctx,{wtcmd_partAvailable:()=>true,wtcmd_validateDesign:()=>{nativeValidation++;return{ok:true}},
  wtcmd_templateAvailable:()=>true,wtcmd_templateParts:t=>t,wtcmd_tickProduction:()=>nativeProduction++,
  wtcmd_factoryAllows:()=>true,wtcmd_production:{1:[{design:ground},{design:{...ground,propulsion:'V-Tol'}}]},
  VTOL_FACTORY:3,ffaOutcome:''});
vm.runInContext(fs.readFileSync(root+'command-policy.js','utf8'),ctx);
assert.equal(ctx.wtcmd_partAvailable('V-Tol'),false);
assert.equal(ctx.wtcmd_partAvailable('Cannon1Mk1'),true);
assert.equal(ctx.wtcmd_validateDesign({...ground,propulsion:'V-Tol'}).error,'components-unavailable');
assert.equal(nativeValidation,0);
assert.equal(ctx.wtcmd_validateDesign(ground).ok,true);assert.equal(nativeValidation,1);
assert.equal(ctx.wtcmd_templateAvailable({...ground,body:'SuperTransportBody'}),false);
assert.equal(ctx.wtcmd_factoryAllows(ground,{stattype:3}),false);
ctx.wtcmd_tickProduction();assert.equal(nativeProduction,1);
assert.equal(ctx.wtcmd_production[1][1].status,'blocked');
ctx.ffaOutcome='defeat';ctx.wtcmd_tickProduction();assert.equal(nativeProduction,1);
const caps=[],packets=[],timers=[],nativeLimits={};
Object.assign(ctx,{include(){},receiveAllEvents(){},namespace(){},addGuideTopic(){},setupStructureLimit:p=>caps.push(['stock',p]),
  setStructureLimits:(id,limit,p)=>{caps.push([id,limit,p]);nativeLimits[p+':'+id]=limit;},
  applyLimitSet(){for(let p=0;p<4;p++){nativeLimits[p+':A0VtolPad']=50;nativeLimits[p+':A0LightFactory']=4;}return true;},
  setTimer(name){timers.push(name);return true;},queue(){},playerData:[],selectedPlayer:0,
  campaignMobileState:()=>({nativeLevel:'FFA-EMAG-T1',paused:false}),startPositions:[],enumStruct:()=>[],enumDroid:()=>[],
  enumSelected:()=>[],getStructureLimit:(id,p)=>nativeLimits[p+':'+id]??0,playerPower:()=>2500,alliancesType:0,allianceExistsBetween:(a,b)=>a===b,
  mapWidth:128,mapHeight:128,maxPlayers:4,gameTime:1000,dump:s=>packets.push(JSON.parse(s.slice(6))),
  DROID_ANY:0,FACTORY:1,CYBORG_FACTORY:2,blockNightEmitResearchSnapshotV23(){}});
for(let p=0;p<4;p++)ctx.playerData.push({isHuman:p===0,isAI:p!==0,team:p,position:p,difficulty:2,scriptName:p?'Cobra.js':''});
vm.runInContext(fs.readFileSync(root+'rules.js','utf8'),ctx);
assert.equal(timers.length,0,'Evaluating FFA rules must not allocate native timer IDs before restore');
const bridgeTimers=[];
const bridgeCtx={eventChat(){},eventResearched(){},setTimer:name=>bridgeTimers.push(name),ffaSetTimer:name=>bridgeTimers.push(name)};
vm.createContext(bridgeCtx);vm.runInContext(fs.readFileSync(root+'research-bridge.js','utf8'),bridgeCtx);
assert.equal(bridgeTimers.length,0,'Including the research bridge must not allocate native timer ID1 before restore');
// Actual native Hard phone checkpoint: all saved IDs are unique. Recreating
// top-level bridge ID1 before this list is restored caused addTimerNode assert.
const fixture=JSON.parse(fs.readFileSync(root+'test-fixtures/native-hard-timers.json','utf8'));
const restored=new Map();
for(const timer of fixture.timers){
  assert.equal(restored.has(timer.id),false,'Saved native timer IDs remain unique');
  restored.set(timer.id,timer);
}
assert.equal(restored.get(1).name,'blockNightV32PollBridgeCommands');
let freshTimers=0;
const restoreCtx={setTimer(){freshTimers++;return true;},ffaTimers:{}};
vm.createContext(restoreCtx);
const rulesSource=fs.readFileSync(root+'rules.js','utf8');
const helper=rulesSource.slice(rulesSource.indexOf('function ffaSetTimer('),rulesSource.indexOf('include("tests/ffa-policy.js")'));
vm.runInContext(helper,restoreCtx);
restoreCtx.ffaTimers=structuredClone(fixture.ffaTimers);
for(const name of Object.keys(fixture.ffaTimers))restoreCtx.ffaSetTimer(name,120);
assert.equal(freshTimers,0,'Hydrated flags preserve restored native timers without creating replacements');
ctx.ffa_eventGameInit();assert.match(ctx.ffaSession,/^FFA-EMAG-T1-\d+$/);
const session=ctx.ffaSession;ctx.ffa_eventGameInit();assert.equal(ctx.ffaSession,session);
assert.equal(ctx.applyLimitSet(),true);
for(let p=0;p<4;p++){
  assert.equal(nativeLimits[p+':A0VtolPad'],0,'No-air pad limit survives native lobby-limit application');
  assert.equal(nativeLimits[p+':A0VTolFactory1'],0);
  assert.equal(nativeLimits[p+':A0LightFactory'],4,'Ordinary ground lobby limits remain native');
}
nativeLimits['0:A0VtolPad']=50;
ctx.ffaStart();ctx.ffaStart();assert.equal(timers.filter(n=>n==='ffaTick').length,1);
assert.equal(nativeLimits['0:A0VtolPad'],0,'Start/load applies no-air caps before the first packet');
assert.equal(packets.at(-1).botType,'cobra');
assert.equal(ctx.ffaNativeBotType({isAI:true,scriptName:'multiplay/skirmish/Cobra.js'}),'cobra');
// Restored legacy globals lack botType. Native identity must still follow
// the actual loaded AI script, never this launch's desired Cobra config.
for(let p=1;p<4;p++)ctx.playerData[p].scriptName='ffa-nullbot.js';
ctx.ffaEmit(true);assert.equal(packets.at(-1).botType,'nullbot');
ctx.playerData[2].scriptName='Cobra.js';ctx.ffaEmit(true);assert.equal(packets.at(-1).botType,'mixed');
ctx.playerData[2].scriptName='unknown.js';ctx.ffaEmit(true);assert.equal(packets.at(-1).botType,'unknown');
for(let p=1;p<4;p++)ctx.playerData[p].scriptName='Cobra.js';
ctx.setupStructureLimit(2);assert.deepEqual(caps[caps.length-policy.airStructures.length-1],['stock',2]);
assert.ok(caps.some(c=>c[0]==='A0VTolFactory1'&&c[1]===0&&c[2]===2));
ctx.ffaReady=true;ctx.ffaNativePlayerResult(1,'loser');assert.equal(ctx.ffaOutcome,'');
ctx.ffaNativePlayerResult(0,'contender');assert.equal(ctx.ffaOutcome,'');
ctx.ffaNativePlayerResult(0,'winner');assert.equal(ctx.ffaOutcome,'victory');
assert.equal(packets.at(-1).outcome,'victory');assert.equal(packets.at(-1).playing,false);
ctx.ffaNativePlayerResult(0,'loser');assert.equal(ctx.ffaOutcome,'victory');
assert.equal(packets.at(-1).players.length,4);assert.equal(packets.at(-1).alliances[0][1],false);
console.log('PASS: FFA native script no-air routes, retained ordinary ground validation, queued air rejection, per-player caps, persistent native session and stock-result-only observation');
