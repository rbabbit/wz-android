/* Executes the actual packaged bridge without replacing campaign callbacks. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');const root=path.resolve(__dirname,'..');
const timers=[],activeTimers=new Map(),removedTimers=[],queued=[],outputs=[],namespaces=[];
const originalStart=()=>{},originalResearch=()=>{},originalVideo=()=>{};
const context={namespace:name=>namespaces.push(name),eventStartLevel:originalStart,eventResearched:originalResearch,
  cam_eventVideoDone:originalVideo,selectedPlayer:0,gameTime:100,getMissionTime:()=>600,getMissionType:()=>1,
  Date,JSON,Math,Set,Object,Number,String,Boolean,Array,RegExp,
  includeJSON:name=>name.endsWith('warzone-towers-catalog.json')?{buildings:[],components:[]}:{revision:'old',nonce:'old'},
  setTimer:(name,ms)=>{assert(!activeTimers.has(name),'duplicate owned timer');timers.push([name,ms]);activeTimers.set(name,ms);return true;},
  removeTimer:name=>{assert(activeTimers.has(name),'absent timer removal: '+name);activeTimers.delete(name);removedTimers.push(name);return true;},queue:(...args)=>queued.push(args),dump:s=>outputs.push(s),
  campaignMobileState:()=>({nativeLevel:'CAM_1A',paused:false,video:false,worldSafe:true}),campaignSelectCombat:()=>({ok:true,count:4}),
};
vm.createContext(context);
for(const file of ['campaign/mobile-events.js','campaign/research-bridge.js','campaign/commands.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
assert.equal(context.eventStartLevel,originalStart);assert.equal(context.eventResearched,originalResearch);assert.equal(context.cam_eventVideoDone,originalVideo);
assert.deepEqual(namespaces,['campmobile_','wtcmd_']);
context.campmobile_level='cam1a';context.campmobile_eventStartLevel();
assert(context.campmobile_session.startsWith('cam1a-'));assert.equal(context.wtcmd_revision,'old');
assert(queued.some(q=>q[0]==='campmobile_initialize'));
assert.equal(removedTimers.length,0,'fresh start must not remove absent timers');
context.wtcmd_indexStats=()=>{};context.hideInterface=()=>{};
context.blockNightEmitResearchSnapshotV23=()=>{};context.blockNightV28EmitQueueState=()=>{};
context.wtcmd_initialize();context.campmobile_initialize();assert.equal(activeTimers.size,5);
context.wtcmd_initialize();context.campmobile_initialize();assert.equal(activeTimers.size,5,'repeat initializer must be idempotent');
activeTimers.set('originalMissionTimer',900);
context.campmobile_timers=JSON.parse(JSON.stringify(context.campmobile_timers));
context.campmobile_eventGameLoaded();assert.equal(removedTimers.length,5);assert(activeTimers.has('originalMissionTimer'));
context.wtcmd_initialize();context.campmobile_initialize();assert.equal(activeTimers.size,6);
context.campmobile_status();const state=JSON.parse(outputs.find(s=>s.startsWith('BNCAMPAIGN:')).slice(11));
assert.equal(state.nativeLevel,'CAM_1A');assert.equal(state.mission,'cam1a');assert.equal(state.paused,false);assert.equal(state.ui.worldSafe,true);
context.campmobile_eventDroidBuilt();context.campmobile_eventTransporterLanded();context.campmobile_eventObjectTransfer();
assert.equal(queued.filter(q=>q[0]==='campmobile_reconcileCombat').length,3);
context.warzoneTowersLabResearch['8']={};context.blockNightLabTopics['8']={};
context.campmobile_eventResearched({id:'R-Test',fullname:'Test'},{id:8},0);
assert.equal(context.warzoneTowersLabResearch['8'],undefined);assert(outputs.some(s=>s.startsWith('BNTECHDONE:')));
const result={version:'0.51',passed:true,actualBridgeExecuted:true,originalCallbacksPreserved:true,nativeSelectionAndStatusContracts:true,reinforcementCallbacks:true,freshStartAbsentTimerRemovals:0,serializedTimerRegistryRestored:true,repeatInitializationIdempotent:true,originalMissionTimersUntouched:true,emulatorUsed:false};
fs.writeFileSync(path.join(root,'archive/native-campaign-0.51/campaign-hook-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
