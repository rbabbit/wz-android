'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const sidebarSource=source.slice(source.indexOf('  async function openSidebar(){'),source.indexOf('  function siteStatus('));
async function sidebar(menu){
 const state={nativeMenu:menu,nativeMenuPending:true,navigationSerial:0},nodes=new Map(),events=[];
 const element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true});return nodes.get(id);};
 const context=vm.createContext({state,Event,element,install(){},renderSidebar(){},updateHUD(){},notify(){},window:{__towersHtml:{isEnded:()=>false},__blockNightResearch:{close(){}},dispatchEvent(){}},
  closeNative:()=>{events.push('native-close-'+state.nativeMenu);state.nativeMenu='';state.nativeMenuPending=false;state.nativeClosePromise=new Promise(()=>{});return state.nativeClosePromise;},
  selectVisibleTrucks:()=>{events.push('select-after-close-request');assert.equal(state.nativeMenu,'');assert.ok(state.nativeClosePromise);return Promise.resolve();}});
 vm.runInContext(sidebarSource,context);await context.openSidebar();
 assert.equal(state.buildOpen,true);assert.equal(element('wt-build-sidebar').hidden,false,'catalogue is immediately visible without waiting for a native acknowledgement');
 assert.deepEqual(events,['native-close-'+menu,'select-after-close-request']);
}
(async()=>{
 await sidebar('stats');await sidebar('commanders');
 const nativeState={nativeMenu:'stats',nativeMenuPending:false,menuRevision:0},nativeCalls=[];let reply;
 const native=vm.createContext({state:nativeState,element:()=>({hidden:false}),window:{__kalaWarzoneTouch:{releaseAll(){},resumeInput:()=>nativeCalls.push('resume-pointers')},__towersHtml:{isEnded:()=>false}},setNativeHudHidden:async()=>{},renderSidebar(){},notify(){},reason:x=>x,send:()=>{nativeCalls.push('close-command');return new Promise(resolve=>reply=resolve);}});
 vm.runInContext(source.slice(source.indexOf('  function closeNative('),source.indexOf('  function requestState(')),native);
 const pending=native.closeNative(true);assert.equal(nativeState.nativeClosePromise,pending);assert.equal(native.closeNative(true),pending,'repeated native close reuses the pending ordered command');assert.deepEqual(nativeCalls,['close-command']);
 reply({ok:true});await pending;assert.equal(nativeState.nativeClosePromise,null);assert.deepEqual(nativeCalls,['close-command','resume-pointers'],'queued physical taps resume only after the acknowledged native panel closes');
 const state={navigationSerial:0},messages=[];
 const context=vm.createContext({state,selectMode:async()=>false,notify:m=>messages.push(m),selectVisibleTrucks:()=>{throw Error('Paused native close must not start a second selection wait');}});
 vm.runInContext(source.slice(source.indexOf('  async function selectNearbyTrucks(){'),source.indexOf('  function cancelPlacement()')),context);
 assert.deepEqual(Array.from(await context.selectNearbyTrucks()),[]);assert.ok(messages[0].includes('Resume the game'));
 console.log('PASS: STATS/COMMANDERS to BUILD requests native close before selection while catalogue remains immediate; paused native-to-TRUCKS exit stays bounded');
})().catch(error=>{console.error(error);process.exitCode=1;});
