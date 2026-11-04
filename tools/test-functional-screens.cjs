'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const state={page:'saved',saved:[{id:'a',name:'Chosen tank',turrets:['gun'],body:'body',propulsion:'wheels',cost:20}],selected:'a',productionCount:1,factory:2,scroll:{},snapshot:{factories:[{id:2,number:1,kind:'Factory',ready:true,idle:false,templates:['truck'],active:{design:{name:'Tank'}},queue:[{design:{name:'Truck'},status:'waiting',reason:'limit'}]}],templates:[{id:'truck',name:'Constructor',cost:10}],trucks:[{id:4,building:true,x:5,y:6}],construction:[{name:'Tower',x:7,y:8}],jobs:[]}};
let persists=true,reset=0;const notices=[],requests=[];
const c=vm.createContext({state,esc:String,image:()=>'',findPart:()=>null,availableDesign:()=>true,button:(label,attrs)=>`<button ${attrs}>${label}</button>`,reason:x=>x,render(){},persist:()=>persists,notify:m=>notices.push(m),open:p=>state.page=p,requestState(){},readDraft(){},resetDraft(){reset++;state.draft={};state.confirmNew=false;},element:()=>null,send:(action,data)=>new Promise(resolve=>requests.push({action,data,resolve}))});
vm.runInContext(source.slice(source.indexOf('  function renderSaved('),source.indexOf('  function builderMode(')),c);
vm.runInContext(source.slice(source.indexOf('  function onClick('),source.indexOf('  loadSaved();')),c);
const click=dataset=>c.onClick({target:{closest:()=>({dataset})}}),flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 assert.ok(c.renderSaved().includes('CHOOSE FACTORY'));const html=c.renderFactory();assert.ok(html.includes('data-selected-design="true"'));assert.ok(html.indexOf('EXISTING UNIT DESIGNS')<html.indexOf('SAVED DESIGNS'));
 const queue=c.liveQueueRows();for(const text of ['Tank','Truck','CONSTRUCTOR 4','Tower'])assert.ok(queue.includes(text));
 click({delete:'a'});assert.equal(state.saved.length,1);assert.ok(c.renderSaved().includes('DELETE PERMANENTLY'));click({cancelDelete:'a'});assert.equal(state.saved.length,1);assert.equal(state.deletePending,'');
 persists=false;click({confirmDelete:'a'});assert.equal(state.saved.length,1);assert.ok(notices.at(-1).includes('kept'));persists=true;click({confirmDelete:'a'});assert.equal(state.saved.length,0);
 state.page='saved';state.draft={name:'Edited'};state.draftOriginal=JSON.stringify({name:'Original'});click({action:'new-design'});assert.equal(reset,0);assert.equal(state.page,'design');assert.equal(state.confirmNew,true);click({action:'keep-draft'});assert.equal(state.draft.name,'Edited');click({action:'discard-draft'});assert.equal(reset,1);
 click({clearProduction:'2'});requests.shift().resolve({ok:false,reason:'factory-missing'});await flush();assert.equal(notices.at(-1),'factory-missing');
 const toast={hidden:false},target={};const n=vm.createContext({state:{page:'design'},element:id=>id==='wt-command-toast'?toast:target,clearTimeout(){},setTimeout(){}});vm.runInContext(source.slice(source.indexOf('  function notify('),source.indexOf('  function image(')),n);n.notify('Queued');assert.equal(toast.hidden,true);assert.equal(target.textContent,'Queued');
 console.log('PASS: selected-design handoff, native-first ordering, live queue rows, deletion cancel/storage rollback, draft discard protection, queue rejection and scoped notifications');
})().catch(e=>{console.error(e);process.exitCode=1});
