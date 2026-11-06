'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('archive/legacy-html-ui/warzone-command-pages.js','utf8');
const state={saved:[],draft:{},serial:0,validationSerial:0,saving:new Set(),scroll:{},page:'design'};
const requests=[],elements=new Map(),notices=[];let persisted=true;
const c=vm.createContext({state,element:id=>elements.get(id),clearTimeout,setTimeout,JSON,Date,reason:x=>x,
 send:(action,data)=>new Promise(resolve=>requests.push({action,data,resolve})),persist:()=>persisted,
 notify:x=>notices.push(x),open:p=>state.page=p,render(){}});
vm.runInContext(source.slice(source.indexOf('  let validationTimer;'),source.indexOf('  function applySize')),c);
const tick=()=>new Promise(r=>setTimeout(r,260)),flush=()=>new Promise(r=>setImmediate(r));
function valid(){Object.assign(state.draft,{body:'Body1REC',propulsion:'wheeled01',turrets:['Cannon1Mk1']});}
(async()=>{
 c.resetDraft();const first=state.draft.id;valid();c.validateDraft();await tick();const stale=requests.shift();
 c.resetDraft();stale.resolve({ok:true,result:{cost:10,points:20}});await flush();assert.equal(state.validation,null,'old validation cannot enable a new draft');
 valid();c.validateDraft();await tick();requests.shift().resolve({ok:true,result:{cost:10,points:20}});await flush();
 c.saveDesign();c.saveDesign();assert.equal(requests.length,1,'duplicate save suppressed');const saving=requests.shift(),origin=state.draft.id;
 c.resetDraft();const newer=state.draft.id;saving.resolve({ok:true,result:{...saving.data.design,cost:10,points:20}});await flush();
 assert.equal(state.draft.id,newer);assert.equal(state.page,'design');assert.equal(state.saved.length,1);assert.equal(state.saving.size,0);
 c.resetDraft(state.saved[0]);state.validation={ok:true};c.saveDesign(true);const copy=requests.shift();assert.notEqual(copy.data.design.id,origin);copy.resolve({ok:true,result:copy.data.design});await flush();assert.equal(state.saved.length,2,'save as new preserves original');
 state.page='design';c.resetDraft(state.saved[0]);state.validation={ok:true};c.saveDesign();requests.shift().resolve({ok:false,reason:'engine-rejected'});await flush();assert.equal(state.saving.size,0);c.saveDesign();assert.equal(requests.length,1,'failure permits retry');requests.shift().resolve({ok:false});await flush();
 c.resetDraft();state.draft.turrets=['','Cannon1Mk1'];assert.equal(c.payload(state.draft).turrets.length,0,'optional slots cannot replace required first slot');
 state.page='design';c.resetDraft(state.saved[0]);state.validation={ok:true};persisted=false;const before=JSON.stringify(state.saved);c.saveDesign();const failure=requests.shift();failure.resolve({ok:true,result:{...failure.data.design,name:'storage failure'}});await flush();assert.equal(JSON.stringify(state.saved),before,'failed persistence restores library');assert.equal(state.saving.size,0);persisted=true;
 const menuState={menuRevision:0,nativeMenu:'',nativeMenuPending:false},back={hidden:true},menuRequests=[];
 const menu=vm.createContext({state:menuState,cancelPlacement(){},close(){},window:{},document:{getElementById:()=>({focus(){}})},element:()=>back,notify(){},reason:x=>x,
 setNativeHudHidden:()=>Promise.resolve(),renderSidebar(){},send:()=>new Promise(resolve=>menuRequests.push(resolve))});
 vm.runInContext(source.slice(source.indexOf('  function openNative('),source.indexOf('  function requestState(')),menu);
 menu.openNative('stats');menu.closeNative();menuRequests[0]({ok:true});await flush();assert.equal(back.hidden,true,'late open acknowledgement must not resurrect native back button');assert.equal(menuState.nativeMenu,'');
 menu.openNative('factory');menuRequests[1]({ok:false,reason:'timeout'});await flush();assert.equal(menuState.nativeMenu,'factory','old close failure cannot clear newer native menu');menuRequests[2]({ok:true});await flush();assert.equal(back.hidden,false);
 assert.notEqual(first,newer);console.log('PASS: stale validation, draft identity, duplicate save, save-as-new, failure retry, persistence rollback, native-menu races and required turret slot');
})().catch(e=>{console.error(e);process.exitCode=1});
