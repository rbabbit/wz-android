'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
function setup(){
 const state={nativeMenu:'build',nativeToolReady:false,nativeToolSelectionAt:Date.now(),nativePendingSites:[],siteChecks:0,cancelSerial:0,exitingBuild:false,exitPromise:null,menuRevision:0,navigationSerial:0};const events=[];let pending=0;
 const c=vm.createContext({state,Date,setTimeout,clearTimeout,innerWidth:1280,innerHeight:744,pause:ms=>new Promise(r=>setTimeout(r,ms)),notify:m=>events.push(m),cancelPlacement(){},updateHUD(){},host:{WarzoneHost:{restoreBattlefield(){}}},document:{getElementById:()=>({focus(){}})},
 element:()=>({hidden:false}),requestState(){},send:()=>Promise.resolve({ok:true}),
 window:{WarzoneTerrain:{pick:(x,y)=>({x,y})},__kalaWarzoneTouch:{report:()=>({pendingClicks:pending}),queuedClick:(x,y)=>{events.push('site:'+x);pending++;setTimeout(()=>pending--,15)},releaseAll:()=>{events.push('release');pending=0}},__blockNightResearch:{pollOutput(){}}},close:()=>{events.push('page-close');return Promise.resolve()},closeNative:()=>{events.push('native-close');state.nativeMenu='';return Promise.resolve()},openBuild:()=>Promise.resolve(true)});
 vm.runInContext(source.slice(source.indexOf('  function accept('),source.indexOf("  window.addEventListener('warzone-command-reply'")),c);
 vm.runInContext(source.slice(source.indexOf('  function nativeBuildTap()'),source.indexOf('  function cancelPlacement()')),c);
 return{state,events,c};
}
(async()=>{
 const completion=vm.createContext({});vm.runInContext(source.slice(source.indexOf('  function nativeConstructionFinished('),source.indexOf('  function nearbyBuildGroup(')),completion);
 const build={nativeBuildSawWork:false,nativeBuildIdleAt:0},working=[{building:true,order:4}],idle=[{building:false,order:0}];
 assert.equal(completion.nativeConstructionFinished(build,working,100,false),false);
 assert.equal(completion.nativeConstructionFinished(build,idle,200,false),false);
 assert.equal(completion.nativeConstructionFinished(build,idle,900,false),false,'a gap between native queued sites must not close placement');
 assert.equal(completion.nativeConstructionFinished(build,working,1000,false),false);
 assert.equal(completion.nativeConstructionFinished(build,idle,2000,false),false);
 assert.equal(completion.nativeConstructionFinished(build,idle,2000,false),false,'a paused native simulation does not count as completion');
 assert.equal(completion.nativeConstructionFinished(build,idle,3200,true),false,'accepted input resets the idle barrier');
 assert.equal(completion.nativeConstructionFinished(build,idle,3400,false),false);
 assert.equal(completion.nativeConstructionFinished(build,idle,4600,false),true,'placement closes after the complete native group stays idle');
 const groupContext=vm.createContext({});vm.runInContext(source.slice(source.indexOf('  function nearbyBuildGroup('),source.indexOf('  async function openBuild(')),groupContext);
 const local=Array.from({length:15},(_,i)=>({id:i,x:5+i%3,y:35+Math.floor(i/3)})),distant={id:99,x:50,y:5},trucks=[...local,distant];
 assert.equal(groupContext.nearbyBuildGroup(trucks,local.slice(0,2),local[0],false).length,15,'a manually selected pair expands to every nearby constructor');
 assert.equal(groupContext.nearbyBuildGroup(trucks,[distant],local[0],true).length,15,'TRUCKS uses the local area instead of a distant selection');
 const spread=[...Array.from({length:9},(_,i)=>({id:i,x:3+i%3,y:35+Math.floor(i/3)})),...Array.from({length:6},(_,i)=>({id:20+i,x:7+i%2,y:40+Math.floor(i/2)}))];
 assert.equal(groupContext.nearbyBuildGroup([...spread,distant],[spread.at(-1)],spread.at(-1),false).length,15,'selecting an edge constructor includes the connected local factory and rally groups without including the other base');
 assert.deepEqual(Array.from(groupContext.constructionParticipants([1,2],[{id:1,selected:false},{id:99,selected:true}])),[1,2,99],'switching native builder cards tracks the new constructor without abandoning earlier workers');
 const validated=()=>new Promise(r=>setImmediate(r));
 let t=setup();t.state.nativeBuildGeneration=2;t.c.queueNativeSite(5,6);await validated();t.c.accept({action:'build-ready',generation:1});assert.equal(t.events.length,0,'stale native build readiness is ignored');t.c.accept({action:'build-ready',generation:2});assert.equal(t.events[0],'site:5');await new Promise(r=>setTimeout(r,20));
 t=setup();t.state.exitingBuild=true;t.state.nativeToolReady=true;t.c.queueNativeSite(1,2);assert.equal(t.events.length,0);t.c.queueNativeSite(3,4,true);await validated();assert.equal(t.events[0],'site:3','SELECT still drains pointer events accepted before the exit');await new Promise(r=>setTimeout(r,20));
 t=setup();t.c.queueNativeSite(1,2);t.c.queueNativeSite(3,4);assert.equal(t.events.length,0,'early taps wait for native build readiness');const exit=t.c.selectMode();setTimeout(()=>{t.state.nativeToolReady=true;t.c.flushNativeSites()},5);await exit;
 assert.deepEqual(t.events.slice(0,2),['site:1','site:3']);assert.ok(t.events.indexOf('release')>1,'SELECT drains accepted sites before releasing input');assert.equal(t.state.nativePendingSites.length,0);
 t=setup();t.c.queueNativeSite(1,2);await t.c.selectMode(true);t.state.nativeToolReady=true;t.c.flushNativeSites();assert.ok(!t.events.some(e=>e.startsWith('site:')),'STOP discards unsent sites and late readiness cannot resurrect them');
 t=setup();t.state.nativeMenu='';t.c.window.__kalaWarzoneTouch.queuedClick(8,9);setTimeout(()=>t.events.push('native-consumed'),16);await t.c.selectMode();assert.ok(t.events.indexOf('native-consumed')<t.events.indexOf('release'),'normal move/select input also drains before navigation releases it');
 t=setup();t.c.queueNativeSite(1,2);await new Promise(r=>setTimeout(r,2700));assert.equal(t.state.nativePendingSites.length,0,'an unavailable/empty native build choice cannot deadlock later input');assert.ok(t.events.some(e=>e.includes('No sites were queued')));
 t=setup();t.state.nativeToolReady=true;t.c.queueNativeSite(1,2);const first=t.c.afterBuildExit(()=>t.events.push('old-page')),second=t.c.afterBuildExit(()=>t.events.push('new-page'));await Promise.all([first,second]);assert.ok(!t.events.includes('old-page'));assert.ok(t.events.includes('new-page'),'later navigation wins while native input drains');
 console.log('PASS: native readiness buffers early taps, SELECT drains accepted sites, STOP cancels pending input and later navigation wins');
})().catch(e=>{console.error(e);process.exitCode=1});
