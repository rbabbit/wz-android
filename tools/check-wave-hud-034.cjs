'use strict';
// Data-to-DOM fixture only. The exact APK still needs real WebView touch/layout QA.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/warzone-towers-wave-hud.js'),'utf8');
const functions=source.slice(source.indexOf('  function incomingName('),source.indexOf('  function showPreparation('));
function element(){return {hidden:false,disabled:false,style:{},attributes:{},textContent:'',children:[],
  setAttribute(name,value){this.attributes[name]=value;},append(...rows){this.children.push(...rows);},
  replaceChildren(...rows){this.children=rows;this.writes=(this.writes||0)+1;}};}
function fixture(){
  const nodes=Object.fromEntries(['button','.wt-incoming-title','.wt-incoming-arrow','.wt-incoming-panel','.wt-incoming-note','ul'].map(key=>[key,element()]));
  nodes['.wt-incoming-panel'].scrollTop=0;
  const box=element();box.querySelector=selector=>nodes[selector];
  const state={incomingExpanded:false,incomingWave:0,incomingRowsSignature:''};
  const c=vm.createContext({state,window:{__towersHtml:{isEnded:()=>c.ended}},ended:false,
    ensureIncoming:()=>box,hudDocument:()=>({getElementById:()=>({getBoundingClientRect:()=>({bottom:44})}),createElement:()=>element()})});
  vm.runInContext(functions,c);
  return {c,state,box,nodes,render:wave=>c.renderIncoming(wave)};
}
const wave={phase:'countdown',incoming:{wave:1,total:7,spawned:2,complete:true,units:[
  {name:'*BaBa MG* *BaBa Body* BaBaLegs',count:5,spawned:2},
  {name:'Light Cannon Viper Wheels',count:2,spawned:0}]},upcoming:{wave:2,total:14}};
const checks=[];function check(name,run){run();checks.push(name);}
check('Initial countdown shows only predetermined total, no guessed unit types or expandable affordance',()=>{
  const f=fixture();f.render({phase:'countdown',incoming:null,upcoming:{wave:1,total:9}});
  assert.equal(f.box.hidden,false);assert.equal(f.box.style.top,'50px');
  assert.equal(f.nodes['.wt-incoming-title'].textContent,'WAVE 1 · 9 INCOMING');
  assert.equal(f.nodes.button.disabled,true);assert.equal(f.nodes['.wt-incoming-arrow'].hidden,true);
  assert.equal(f.nodes['.wt-incoming-panel'].hidden,true);assert.equal(f.nodes.ul.children.length,0);
});
check('Current actual composition remains available while the native schedule counts down to the next wave',()=>{
  const f=fixture();f.render(wave);assert.equal(f.nodes['.wt-incoming-title'].textContent,'WAVE 1 · 7 UNITS');
  assert.equal(f.nodes.button.disabled,false);assert.equal(f.nodes['.wt-incoming-panel'].hidden,true);
  f.state.incomingExpanded=true;f.render(wave);
  assert.equal(f.nodes.button.attributes['aria-expanded'],'true');assert.equal(f.nodes['.wt-incoming-panel'].hidden,false);
  assert.equal(f.nodes['.wt-incoming-note'].textContent,'Selected enemy units · Next: 14');
  assert.deepEqual(Array.from(f.nodes.ul.children,row=>row.children.map(cell=>cell.textContent)),[
    ['Machinegun scavenger','5'],['Light Cannon Viper Wheels','2']]);
});
check('Dense rosters preserve scroll position and stable DOM through unchanged game-clock updates',()=>{
  const f=fixture(),dense={...wave,incoming:{...wave.incoming,units:Array.from({length:17},(_,i)=>({name:'Tank '+i,count:i+1,spawned:0})),total:153}};
  f.render(dense);f.state.incomingExpanded=true;f.render(dense);f.nodes['.wt-incoming-panel'].scrollTop=120;
  const writes=f.nodes.ul.writes;f.render({...dense,gameTime:3000});
  assert.equal(f.nodes.ul.children.length,17);assert.equal(f.nodes.ul.writes,writes);assert.equal(f.nodes['.wt-incoming-panel'].scrollTop,120);
});
check('New wave collapses old details, partial native selection is labelled accurately, and labels use text nodes',()=>{
  const f=fixture();f.render(wave);f.state.incomingExpanded=true;f.render(wave);
  const next={phase:'active',incoming:{wave:2,total:1,spawned:0,complete:false,units:[{name:'<fake> Viper Wheels',count:1,spawned:0}]},upcoming:null};
  f.render(next);assert.equal(f.state.incomingExpanded,false);assert.equal(f.nodes['.wt-incoming-panel'].hidden,true);
  f.state.incomingExpanded=true;f.render(next);assert.equal(f.nodes['.wt-incoming-note'].textContent,'Enemy units selected so far');
  assert.equal(f.nodes.ul.children[0].children[0].textContent,'<fake> Viper Wheels');
});
check('Terminal or ended battles hide incoming UI and old saves never invent unknown composition',()=>{
  const f=fixture();f.render(wave);f.render({...wave,phase:'defeated'});assert.equal(f.box.hidden,true);
  f.render(wave);f.c.ended=true;f.render(wave);assert.equal(f.box.hidden,true);
  f.c.ended=false;f.render({phase:'active',incoming:null,upcoming:null});assert.equal(f.box.hidden,true);
});
console.log(JSON.stringify({passed:checks.length,emulatorUsed:false,gameplayVerified:false,scope:'Wave data-to-DOM behavior; not actual layout/touch verification',checks},null,2));
