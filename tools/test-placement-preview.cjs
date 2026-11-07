'use strict';
// Exercise the actual input/submission functions; no engine or UI is simulated as passed gameplay.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const item={id:'A0ResearchFacility',category:'STRUCTURES',width:2,breadth:2};
const state={placement:item,previewPoint:null,session:'one',nativeBuildGroup:[7],cancelSerial:0,placements:0,siteChecks:0,modulePending:new Map(),buildParticipants:[]};
const calls=[],requests=[],notices=[];let pick={x:23,y:18},polygon=null;
const display={preview:(i,p)=>calls.push(['preview',i.id,{...p}]),clearPreview:()=>calls.push(['clear']),reject:(...args)=>calls.push(['reject',...args])};
const elements=new Map([['wt-sidebar-notice',{hidden:false}],['wt-command-toast',{hidden:false}]]);
const context=vm.createContext({state,window:{WarzoneTerrain:{pick:()=>pick},WarzoneBuildDisplay:display,__towersHtml:{isEnded:()=>false}},document:{getElementById:()=>({querySelector:()=>polygon})},Promise,Number,Array,Object,Set,
  element:id=>elements.get(id),notify:x=>notices.push(x),reason:x=>x,requestState(){},updateSidebarQueue(){},reconcileModuleRequests(){},moduleTargets:()=>[],send:(action,data)=>new Promise(resolve=>requests.push({action,data,resolve}))});
vm.runInContext(source.slice(source.indexOf('  function previewAt('),source.indexOf('  let validationTimer;')),context);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const point=context.previewAt(100,200);assert.equal(point.x,23);assert.equal(calls.at(-1)[2].validation,'pending','ground intersection cannot advertise native site validity');
  pick=null;assert.equal(context.previewAt(999,200),null);assert.equal(state.previewPoint,null);assert.deepEqual(calls.at(-1),['clear'],'failed terrain pick clears the prior visible position');
  const before=state.placements;context.placeAt(999,200);await flush();assert.equal(state.placements,before);assert.equal(requests.length,0,'invalid terrain never submits the previous point');
  pick={x:23,y:18};context.placeAt(100,200);await flush();assert.equal(requests.length,1);const request=requests.shift();assert.equal(request.action,'queue-build');assert.equal(request.data.workerIds[0],7);request.resolve({ok:false,reason:'invalid-site'});await flush();await flush();assert.ok(calls.some(c=>c[0]==='reject'&&c[1]===item.id&&c[2]===23&&c[3]===18),'canvas rejects even if legacy SVG polygon is absent');assert.equal(state.siteChecks,0);
  let svgUpdates=0;polygon={setAttribute(){svgUpdates++}};context.placeAt(100,200);await flush();requests.shift().resolve({ok:false,reason:'no-path'});await flush();await flush();assert.equal(svgUpdates,2,'legacy feedback remains compatible');
  calls.length=0;context.placeAt(100,200);await flush();requests.shift().resolve({ok:true,result:{id:'accepted',workers:[7]}});await flush();await flush();assert.equal(state.nativeBuildPlaced,true);assert.deepEqual(state.buildParticipants,[7]);assert.ok(!calls.some(c=>c[0]==='reject'),'accepted site never gets invalid styling');
  state.cancelSerial++;const placed=state.placements;pick=null;context.placeAt(999,200);await flush();assert.equal(state.placements,placed);assert.equal(state.siteChecks,0);
  console.log('PASS: actual ordinary preview clears invalid ground, remains pending until native validation, rejects without legacy SVG and preserves accepted worker IDs');
})().catch(error=>{console.error(error);process.exitCode=1});
