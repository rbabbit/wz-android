'use strict';
// Run the actual two HUD clients together against a small DOM/clock fixture.
// This is source protocol coverage, not browser painting or emulator testing.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),sourceName='app/src/main/assets/warzone-touch-controls.js';
const source=fs.readFileSync(path.join(root,sourceName),'utf8'),checks=[];
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,'HUD extraction seam changed');return source.slice(a,b);}
const combatSource=between('  function updateCombatHud() {','\n  function toggleCombatLock(');
const saveSource=between('        let saveFeedbackTimer = 0;','        techGroup.append(save);');
function fixture(){
  let now=1000,nextTimer=0,snapshot={phase:'idle',status:'',statusAt:0,busy:false,ready:true,ended:false,error:'',savedId:''};
  const timers=new Map(),listeners=new Map(),nodes=new Map();
  function button(id){const classes=new Set();return{id,disabled:false,dataset:{},attrs:{},caption:{textContent:''},title:'',
    classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
    setAttribute(name,value){this.attrs[name]=value;},querySelector(selector){assert.equal(selector,'span');return this.caption;}};}
  const ids=['blocknight-save','blocknight-base','blocknight-help','blocknight-tech','blocknight-select-all',
    'blocknight-auto-fight','blocknight-box-select','blocknight-queue-orders','blocknight-stop',
    'wt-select-trucks','wt-deselect-units','blocknight-zoom-close','blocknight-zoom-battle','blocknight-zoom-map'];
  ids.forEach(id=>nodes.set(id,button(id)));
  const document={getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>Array.from(nodes.values())};
  const state={stopNonce:null,combatLock:false,autoFight:false,boxMode:false,queueMode:false,zoomPreset:'battle',zoomPendingNonce:null};
  const window={WarzoneSavedGames:{report:()=>snapshot},addEventListener(name,fn){listeners.set(name,fn);}};
  const context={window,state,save:nodes.get('blocknight-save'),commandDocument:()=>document,
    ZOOM_PRESETS:{close:{},battle:{},map:{}},Date:class extends Date{static now(){return now;}},
    setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(combatSource+'\n'+saveSource+'\nthis.refreshHud=updateCombatHud;',context,{filename:sourceName+' (actual HUD clients)'});
  return{state,nodes,save:context.save,window,
    set(value){snapshot={...snapshot,...value};},
    emit(value){this.set(value);listeners.get('warzone-save-state')();},
    refresh:()=>context.refreshHud(),
    advance(ms){const end=now+ms;for(let n=0;n<50;n++){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);now=next[1].at;next[1].fn();}now=end;},
    now:()=>now};
}
function check(name,run){run();checks.push({name,passed:true});}
check('Saving event followed by repeated combat HUD refreshes keeps SAVE disabled',()=>{
  const f=fixture();f.emit({phase:'start',busy:true,status:'Preparing save…',statusAt:f.now()});
  assert.equal(f.save.caption.textContent,'SAVING…');assert.equal(f.save.disabled,true);assert.equal(f.save.attrs['aria-busy'],'true');
  for(let n=0;n<20;n++){f.refresh();assert.equal(f.save.disabled,true);assert.equal(f.save.caption.textContent,'SAVING…');}
  assert.equal(f.save.dataset.saveState,'saving');
});
check('Combat HUD reads current saving state even before its feedback event is delivered',()=>{
  const f=fixture();f.set({phase:'save',busy:true,status:'Saving…',statusAt:f.now()});f.refresh();assert.equal(f.save.disabled,true);
  f.emit({});assert.equal(f.save.caption.textContent,'SAVING…');assert.equal(f.save.disabled,true);
});
check('Acknowledged completion reenables SAVE and retains success feedback through HUD refresh',()=>{
  const f=fixture();f.emit({phase:'save',busy:true});f.refresh();
  f.emit({phase:'saved',busy:false,status:'Game saved',statusAt:f.now(),savedId:'wt_fixture'});f.refresh();
  assert.equal(f.save.caption.textContent,'SAVED');assert.equal(f.save.disabled,false);assert.equal(f.save.attrs['aria-busy'],'false');
  f.advance(4000);f.refresh();assert.equal(f.save.caption.textContent,'SAVE');assert.equal(f.save.disabled,false);
});
check('A pending STOP locks SAVE during completion until STOP is actually acknowledged',()=>{
  const f=fixture();f.state.stopNonce='stop-pending';f.emit({phase:'save',busy:true});f.refresh();
  f.emit({phase:'saved',busy:false,status:'Game saved',statusAt:f.now()});assert.equal(f.save.disabled,true);
  f.refresh();assert([...f.nodes.values()].every(b=>b.disabled));
  f.state.stopNonce=null;f.refresh();assert.equal(f.save.disabled,false);assert.equal(f.save.caption.textContent,'SAVED');
});
check('Failure permits RETRY only when STOP is no longer pending',()=>{
  const f=fixture();f.state.stopNonce='stop-pending';f.emit({phase:'error',busy:false,status:'Storage unavailable',error:'Storage unavailable',statusAt:f.now()});
  assert.equal(f.save.caption.textContent,'RETRY');assert.equal(f.save.disabled,true);assert.equal(f.save.title,'Storage unavailable');f.refresh();assert.equal(f.save.disabled,true);
  f.state.stopNonce=null;f.refresh();assert.equal(f.save.disabled,false);assert.equal(f.save.caption.textContent,'RETRY');
});
check('Retired battles keep SAVE disabled across feedback and combat HUD updates',()=>{
  const f=fixture();f.emit({phase:'ended',ended:true,busy:false,status:'',statusAt:f.now()});
  for(let n=0;n<10;n++){f.refresh();assert.equal(f.save.disabled,true);}f.emit({});assert.equal(f.save.disabled,true);
});
check('An old success timer cannot clear a newer save lock',()=>{
  const f=fixture();f.emit({phase:'saved',busy:false,status:'Game saved',statusAt:f.now()});f.advance(3500);
  f.emit({phase:'start',busy:true,status:'Preparing save…',statusAt:f.now()});f.advance(2000);f.refresh();
  assert.equal(f.save.caption.textContent,'SAVING…');assert.equal(f.save.disabled,true);assert.equal(f.save.attrs['aria-busy'],'true');
});
check('Save-only locking preserves other command enablement and existing combat/zoom states',()=>{
  const f=fixture();f.state.combatLock=true;f.state.queueMode=true;f.state.zoomPendingNonce='zoom-pending';
  f.emit({phase:'write',busy:true,status:'Writing save…',statusAt:f.now()});f.refresh();
  for(const [id,b]of f.nodes)assert.equal(b.disabled,id==='blocknight-save',id);
  assert(f.nodes.get('blocknight-select-all').classList.contains('active'));
  assert.equal(f.nodes.get('blocknight-queue-orders').attrs['aria-pressed'],'true');
  assert(f.nodes.get('blocknight-zoom-battle').classList.contains('pending'));
  assert.equal(f.nodes.get('blocknight-zoom-close').attrs['aria-pressed'],'false');
  f.state.stopNonce='stop-pending';f.refresh();assert([...f.nodes.values()].every(b=>b.disabled));
});
const sources=[sourceName,'tools/check-save-hud-033.cjs'].map(name=>({path:name,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}));
const report={version:'0.33',passed:true,emulatorUsed:false,androidRuntimeExecuted:false,
  scope:'Actual extracted HUD functions executed together against small DOM/window/clock stubs; no browser paint, native game or emulator execution.',
  sourceCheckGroupsPassed:checks.length,checks,sources};
fs.writeFileSync(path.join(root,'archive/save-hud-0.33-source-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,sourceCheckGroupsPassed:checks.length,emulatorUsed:false}));
