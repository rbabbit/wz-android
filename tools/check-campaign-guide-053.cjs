/* Execute the real additive Campaign hook; never patch mission/native code. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(root,'campaign/mobile-events.js'),source=fs.readFileSync(file,'utf8');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function fixture(){
  const calls=[],queued=[],originals={start(){},loaded(){},video(){},intel(){},transport(){}};
  const guide=function(...args){const result={accepted:true,index:calls.length};calls.push({receiver:this,args,result});return result;};
  const context={namespace(){},addGuideTopic:guide,eventStartLevel:originals.start,eventGameLoaded:originals.loaded,cam_eventVideoDone:originals.video,
    eventVideoDone:originals.video,eventTransporterLanded:originals.transport,showGuideScreen:originals.intel,
    gameTime:100,selectedPlayer:0,getMissionTime:()=>600,getMissionType:()=>1,
    includeJSON:()=>({revision:'prior',nonce:'prior'}),queue:(...args)=>queued.push(args),dump(){},removeTimer(){throw Error('Unexpected timer removal');},
    campaignMobileState:()=>({nativeLevel:'CAM_1A',paused:false,video:false,worldSafe:true})};
  vm.createContext(context);vm.runInContext(source,context,{filename:file});
  return {context,calls,queued,guide,originals};
}
const originalDescriptor=Object.getOwnPropertyDescriptor(fixture().context,'addGuideTopic');assert(originalDescriptor.writable);
let flagsChecked=0;
for(const flags of [undefined,0,1,2,3]){
  const {context,calls,originals}=fixture(),excluded=['wz2100::units::repairing'];
  const expectedArgs=flags===undefined?['wz2100::structures::hq']:['wz2100::**',flags,excluded];
  const receiver={tag:'native-receiver'},result=Reflect.apply(context.addGuideTopic,receiver,expectedArgs);
  assert.equal(calls.length,1);assert.equal(result,calls[0].result);assert.equal(calls[0].receiver,receiver);
  assert.equal(calls[0].args[0],expectedArgs[0]);assert.equal(calls[0].args.length,expectedArgs.length);
  if(flags!==undefined){assert.equal(calls[0].args[1],0);assert.equal(calls[0].args[2],excluded);}
  assert.equal(context.eventStartLevel,originals.start);assert.equal(context.eventGameLoaded,originals.loaded);
  assert.equal(context.cam_eventVideoDone,originals.video);assert.equal(context.eventVideoDone,originals.video);
  assert.equal(context.eventTransporterLanded,originals.transport);assert.equal(context.showGuideScreen,originals.intel);
  flagsChecked++;
}
const {context,calls,guide,originals,queued}=fixture();
const wrapper=context.addGuideTopic;assert.notEqual(wrapper,guide);assert.equal(wrapper.__warzoneCampaignManualGuide,true);
assert.deepEqual(Object.keys(wrapper),[],'guard must not become enumerable state');
vm.runInContext(source,context,{filename:file});assert.equal(context.addGuideTopic,wrapper,'including twice must not stack wrappers');
context.addGuideTopic('wz2100::units::designing',1);assert.equal(calls.length,1);
context.campmobile_level='cam1a';context.campmobile_eventStartLevel();
assert(queued.some(args=>args[0]==='campmobile_initialize'));assert.equal(context.addGuideTopic,wrapper);
context.campmobile_eventGameLoaded();context.addGuideTopic('wz2100::general::power',3);
assert.equal(calls.length,2);assert.equal(calls[1].args[1],0);
// Native script serialization skips function-valued globals. Rebuild a fresh
// script context, then restore only serializable values as the engine does.
const saved={};for(const key of Object.keys(context))if(typeof context[key]!=='function')saved[key]=JSON.parse(JSON.stringify(context[key]));
assert(!Object.prototype.hasOwnProperty.call(saved,'nativeAddGuideTopic'));
assert(!Object.prototype.hasOwnProperty.call(saved,'manualGuideTopic'));
assert(!Object.prototype.hasOwnProperty.call(saved,'addGuideTopic'));
const restored=fixture();for(const [key,value]of Object.entries(saved))restored.context[key]=value;
restored.context.campmobile_eventGameLoaded();restored.context.addGuideTopic('wz2100::structures::researchfacility',2);
assert.equal(restored.calls.length,1);assert.equal(restored.calls[0].args[1],0);
for(const mission of ['cam1a','cam2a','cam3a']){
  const fresh=fixture();fresh.context.campmobile_level=mission;fresh.context.campmobile_eventStartLevel();
  fresh.context.addGuideTopic('wz2100::structures::hq',1);assert.equal(fresh.calls[0].args[1],0);
}
const noAPI={namespace(){}};vm.createContext(noAPI);vm.runInContext(source,noAPI);assert.equal(noAPI.addGuideTopic,undefined);
assert.equal(context.eventStartLevel,originals.start);assert.equal(context.cam_eventVideoDone,originals.video);
assert(!/closeGuideScreen|Escape|showGuideTopicImmediately|gameTimeStart|setGamePauseStatus/.test(source),'hook must not close or unpause other native content');
const result={version:'0.53',passed:true,actualCampaignMobileHookExecuted:true,sourceSHA256:digest(source),guideFlagCases:flagsChecked,
  nativeReturnReceiverAndExclusionsPreserved:true,wrapOnce:true,noNativeReferenceInSaveGlobals:true,freshStartAndSaveLoad:true,alphaBetaGammaContextReloads:true,
  originalCallbacksAndManualGuidePreserved:true,noForcedModalClosing:true,emulatorUsed:false};
fs.mkdirSync(path.join(root,'archive/campaign-0.53'),{recursive:true});fs.writeFileSync(path.join(root,'archive/campaign-0.53/guide-hook-checks.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
