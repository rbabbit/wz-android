'use strict';
// Actual shared UI functions with bounded synthetic DOM/command replies.
// These checks do not execute Android, native Warzone or an emulator.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const acorn=require('../vendor/multiplayer/native-070/tooling/acorn.cjs');
const root=path.resolve(__dirname,'..'),file='app/src/main/assets/warzone-command-pages.js',source=fs.readFileSync(path.join(root,file),'utf8');
const body=acorn.parse(source,{ecmaVersion:'latest'}).body[0].expression.callee.body.body;
const declarations=body.filter(n=>n.type==='FunctionDeclaration').map(n=>source.slice(n.start,n.end)).join('\n');
const stateNode=body.flatMap(n=>n.declarations||[]).find(n=>n.id.name==='state');
const variables=['esc','reason'].map(name=>{const n=body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===name));return source.slice(n.start,n.end);}).join('\n');
const assignments=body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&source.slice(n.expression.callee.start,n.expression.callee.end)==='Object.assign').map(n=>source.slice(n.start,n.end)).join('\n');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'app/src/main/assets/warzone/command-catalog.json'),'utf8'));
const clone=v=>JSON.parse(JSON.stringify(v)),checks=[];const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function check(name,fn){await fn();checks.push(name);}
function fixture(mode='towers'){
 const elements=new Map(),sent=[],notices=[];let refreshes=0,stateRequests=0;
 class Node{constructor(){this.dataset={};this.style={};this.hidden=false;this.attributes={};this.innerHTML='';this.textContent='';this.scrollTop=0;this.queries=0;this.classList={toggle(){},contains(){return false;}};}
  setAttribute(k,v){this.attributes[k]=String(v);}querySelectorAll(){this.queries++;return [];}querySelector(){return null;}}
 for(const id of ['wt-command-pages','wt-page-title','wt-command-tabs','wt-page-content'])elements.set(id,new Node());
 const window={__warzoneDuelConfig:mode==='duel'?{mode:'duel'}:undefined,__towersHtml:{isEnded:()=>false}};
 const c={console,window,doc:{getElementById:id=>elements.get(id)||null},campaign:mode==='campaign',polishedTowers:mode!=='duel',powerSymbol:'⚡',
  Date,setTimeout(){return 1;},clearTimeout(){},element:id=>elements.get(id)||null,panelScrollers:'.fixture-scroller'};
 vm.createContext(c);vm.runInContext('var state='+source.slice(stateNode.init.start,stateNode.init.end)+';\n'+assignments+'\n'+variables+'\n'+declarations,c,{filename:file});
 c.send=(action,data={})=>new Promise((resolve,reject)=>sent.push({action,data:clone(data),resolve,reject}));
 c.notify=message=>notices.push(message);c.requestState=()=>{stateRequests++;};c.refreshLive=()=>{refreshes++;};
 const truck={id:'native:truck',name:'Truck Viper Wheels',body:'Body1REC',propulsion:'wheeled01',construct:'Spade1Mk1',turrets:['Spade1Mk1'],weapons:[],cost:62,points:100};
 const mg={id:'native:mg',name:'Machinegun Viper Wheels',body:'Body1REC',propulsion:'wheeled01',turrets:['MG1Mk1'],weapons:['MG1Mk1'],cost:55,points:100};
 const factory=(id=11,extra={})=>({id,number:id===11?1:2,ready:true,kind:'Factory',modules:2,idle:true,templates:[truck.id,mg.id],queue:[],active:null,currentProduction:null,queueKnown:true,progress:{state:'idle'},repeat:{enabled:false,key:'',design:null},...extra});
 const first=factory(),other=factory(22);
 Object.assign(c.state,{page:'factory',catalog:clone(catalog),factory:11,snapshot:{player:mode==='multiplayer'?2:0,gameTime:1000,hasHQ:true,parts:Object.values(catalog.components).flat().map(p=>p.id),factories:[first,other],templates:[truck,mg],jobs:[],buildings:[],trucks:[]}});
 const work=(f=first,design=truck,state='building')=>{Object.assign(f,{idle:false,active:{id:'job-'+f.id,design:clone(design)},currentProduction:clone(design),progress:{available:true,currentId:f.id+':501:900',currentName:design.name,state,ratio:.4,completedBuildPoints:40,totalBuildPoints:100,remainingSeconds:6}});return f;};
 const recipe=(design=truck,f=first)=>c.factoryRecipes(f).find(r=>r.key===c.templateParts(design));
 const repeatButton=(design=truck)=>({dataset:{productionRepeat:c.templateParts(design)}}),manufactureButton=(design=truck)=>({dataset:{produceTemplate:design.id}});
 const ack=async(action,reply={ok:true,result:{}},index=0)=>{const item=sent.filter(s=>s.action===action)[index];assert.ok(item,'Pending '+action+' request');item.resolve(reply);await tick();};
 return{c,state:c.state,elements,sent,notices,first,other,truck,mg,factory,work,recipe,repeatButton,manufactureButton,ack,
  counts:()=>({refreshes,stateRequests}),key:(f=first,d=truck)=>c.repeatDraftKey(f.id,c.templateParts(d))};
}
(async()=>{
 for(const mode of ['towers','ffa','campaign','multiplayer']){
  await check(mode+': compact Manufacturing rail has no FACTORIES/Units strip and keeps Design/Blueprints controls',()=>{
   const f=fixture(mode),html=f.c.renderFactoryRail(f.state.snapshot.factories,f.first);
   assert.doesNotMatch(html,/>FACTORIES</);assert.doesNotMatch(html,/>Units</);assert.match(html,/class="wt-factory-view-tabs"/);
   assert.match(html,/data-page="design"[^>]*>Design</);assert.match(html,/data-page="saved"[^>]*>Blueprints</);
   assert.match(html,/data-factory="11"/);assert.match(html,/data-factory="22"/);assert.doesNotMatch(html,/wt-produce-count/);
   f.state.snapshot=null;f.c.render();assert.equal(f.elements.get('wt-command-pages').dataset.page,'factory');assert.equal(f.elements.get('wt-command-tabs').hidden,true);
   f.state.page='queue';f.c.render();assert.equal(f.elements.get('wt-command-pages').dataset.page,'queue');assert.equal(f.elements.get('wt-command-tabs').hidden,true);
   f.state.page='design';f.c.render();assert.equal(f.elements.get('wt-command-tabs').hidden,false);
  });
  await check(mode+': unit rows use MANUFACTURE/repeat without quantities or bottom activity; matching hardware alone gets live progress',()=>{
   const f=fixture(mode);f.work();const truck=f.c.factoryRecipeRow(f.recipe()),mg=f.c.factoryRecipeRow(f.recipe(f.mg));
   assert.match(truck,/>MANUFACTURE</);assert.match(truck,/data-production-repeat=/);assert.doesNotMatch(truck,/data-count=|wt-quantity|PRODUCE 1/);
   assert.match(truck,/>PRODUCING</);assert.match(truck,/aria-valuenow="40"/);assert.match(truck,/wt-live-dot/);
   assert.doesNotMatch(mg,/>PRODUCING</);assert.doesNotMatch(mg,/role="progressbar"/);
   f.first.currentProduction={...f.truck,name:'Renamed same hardware'};f.first.progress.currentName='Renamed same hardware';
   assert.match(f.c.factoryInlineStatus(f.recipe(),f.first),/>PRODUCING</,'Name changes do not break real hardware matching');
   f.first.progress.state='paused';const paused=f.c.factoryInlineStatus(f.recipe(),f.first);assert.match(paused,/>PAUSED</);assert.doesNotMatch(paused,/wt-live-dot/);
   const html=f.c.renderTowersFactory(f.state.snapshot.factories,f.first,[],null);assert.doesNotMatch(html,/id="wt-factory-progress"|SHOW QUEUE|No waiting units|REMAINING|Factory ready/);
  });
  await check(mode+': idle repeat only arms the selected factory/recipe until one MANUFACTURE command is sent',async()=>{
   const f=fixture(mode);f.c.toggleProductionRepeat(f.repeatButton());assert.equal(f.sent.length,0);assert.equal(f.state.productionRepeatDrafts.get(f.key()),true);
   f.state.factory=22;assert.equal(f.c.repeatForRecipe(f.other,f.recipe(f.truck,f.other)),false);f.state.factory=11;
   f.state.productionCount=20;f.c.queueProduction(f.manufactureButton());assert.equal(f.sent.length,1);
   assert.equal(f.sent[0].action,'queue-production');assert.deepEqual(f.sent[0].data,{factoryId:11,count:1,repeat:true,templateId:f.truck.id});
   f.c.queueProduction(f.manufactureButton());assert.equal(f.sent.length,1,'Pending repeated tap cannot duplicate a command');
   await f.ack('queue-production',{ok:true,result:{count:1,repeat:{enabled:true,design:f.truck}}});assert.equal(f.state.productionRequests.size,0);
  });
  await check(mode+': finite and saved-design manufacture each send one real request with an explicit repeat Boolean',()=>{
   const f=fixture(mode);f.c.queueProduction(f.manufactureButton());assert.equal(f.sent[0].data.count,1);assert.equal(f.sent[0].data.repeat,false);
   const g=fixture(mode),saved={id:'saved-truck',name:'Phone Truck',body:g.truck.body,propulsion:g.truck.propulsion,turrets:['Spade1Mk1'],cost:62,points:100};g.state.saved.push(saved);
   g.c.queueProduction({dataset:{produce:saved.id}});assert.equal(g.sent.length,1);assert.equal(g.sent[0].data.count,1);assert.equal(g.sent[0].data.repeat,false);assert.deepEqual(g.sent[0].data.design,saved);
  });
  await check(mode+': matching live repeat ON/OFF sends one set-repeat; rejection rolls back and busy taps cannot race',async()=>{
   const f=fixture(mode);f.work();f.c.toggleProductionRepeat(f.repeatButton());assert.equal(f.sent.length,1);assert.deepEqual(f.sent[0].data,{factoryId:11,enabled:true,templateId:f.truck.id});
   f.c.toggleProductionRepeat(f.repeatButton());f.c.queueProduction(f.manufactureButton());assert.equal(f.sent.length,1);
   await f.ack('set-production-repeat',{ok:false,reason:'production-changed'});assert.equal(f.state.productionRepeatDrafts.get(f.key()),false);assert.equal(f.state.productionRepeatRequests.size,0);assert.ok(f.notices.length);
   f.c.toggleProductionRepeat(f.repeatButton());await f.ack('set-production-repeat',{ok:true,result:{enabled:true,key:f.c.templateParts(f.truck),design:f.truck}},1);
   assert.equal(f.first.repeat.enabled,true);f.c.toggleProductionRepeat(f.repeatButton());assert.equal(f.sent.filter(s=>s.action==='set-production-repeat')[2].data.enabled,false);
   await f.ack('set-production-repeat',{ok:true,result:{enabled:false,key:'',design:null}},2);assert.equal(f.first.repeat.enabled,false);
  });
  await check(mode+': one STOP command replaces OPEN/CANCEL controls and clears only its factory draft after acknowledgement',async()=>{
   const f=fixture(mode);f.work();f.state.productionRepeatDrafts.set(f.key(),true);f.state.productionRepeatDrafts.set(f.key(f.other),true);
   const row=f.c.queueFactoryRow(f.first);assert.equal((row.match(/<button\b/g)||[]).length,1);assert.match(row,/>STOP</);assert.doesNotMatch(row,/>OPEN<|>CANCEL|data-production-cancel-/);
   f.c.stopFactoryProduction({dataset:{stopProduction:'11'}});f.c.stopFactoryProduction({dataset:{stopProduction:'11'}});assert.equal(f.sent.length,1);assert.equal(f.sent[0].action,'stop-production');assert.deepEqual(f.sent[0].data,{factoryId:11});
   assert.equal(f.state.productionRepeatDrafts.get(f.key()),true,'No optimistic deletion before native ACK');assert.match(f.c.queueFactoryRow(f.first),/STOPPING…/);
   await f.ack('stop-production',{ok:true,result:{waitingCancelled:2,currentCancelled:1,repeat:{enabled:false,key:'',design:null}}});
   assert.equal(f.state.productionRepeatDrafts.has(f.key()),false);assert.equal(f.state.productionRepeatDrafts.get(f.key(f.other)),true);assert.equal(f.state.productionCancellations.size,0);
   assert.equal(f.first.repeat.enabled,false);assert.equal(f.counts().stateRequests,1);
  });
  await check(mode+': rejected STOP preserves drafts and pending manufacture/repeat prevents a racing STOP',async()=>{
   const f=fixture(mode);f.work();f.state.productionRepeatDrafts.set(f.key(),true);f.c.stopFactoryProduction({dataset:{stopProduction:'11'}});
   await f.ack('stop-production',{ok:false,reason:'production-unavailable'});assert.equal(f.state.productionRepeatDrafts.get(f.key()),true);assert.ok(f.notices.length);
   const g=fixture(mode);g.c.queueProduction(g.manufactureButton());g.c.stopFactoryProduction({dataset:{stopProduction:'11'}});assert.equal(g.sent.length,1);
  });
  await check(mode+': a late repeat acknowledgement cannot redraw another selected factory or another page',async()=>{
   const f=fixture(mode);f.work();f.c.toggleProductionRepeat(f.repeatButton());f.state.factory=22;
   const queries=f.elements.get('wt-page-content').queries;await f.ack('set-production-repeat',{ok:true,result:{enabled:true,key:f.c.templateParts(f.truck),design:f.truck}});
   assert.equal(f.elements.get('wt-page-content').queries,queries,'The old factory callback cannot query or redraw new factory controls');assert.equal(f.other.repeat.enabled,false);
   f.state.factory=11;f.state.page='queue';const before=f.elements.get('wt-page-content').queries;f.c.updateFactoryRows(f.first);assert.equal(f.elements.get('wt-page-content').queries,before,'Factory-specific updates cannot rewrite Queue');
  });
  await check(mode+': save rewind/player change clears draft/in-flight identities and ignores old manufacture/repeat/STOP replies',async()=>{
   const f=fixture(mode);f.work();f.state.productionRepeatDrafts.set(f.key(f.other),true);f.c.toggleProductionRepeat(f.repeatButton());const epoch=f.state.manufacturingEpoch;
   f.c.reconcileManufacturingDisplay(f.state.snapshot,{...f.state.snapshot,gameTime:10});assert.equal(f.state.manufacturingEpoch,epoch+1);assert.equal(f.state.productionRepeatDrafts.size,0);assert.equal(f.state.productionRepeatRequests.size,0);
   await f.ack('set-production-repeat',{ok:true,result:{enabled:true,design:f.truck}});assert.equal(f.first.repeat.enabled,false);assert.equal(f.state.productionRepeatDrafts.size,0);
   const g=fixture(mode);g.state.productionRepeatDrafts.set(g.key(),true);g.c.queueProduction(g.manufactureButton());
   g.c.reconcileManufacturingDisplay(g.state.snapshot,{...g.state.snapshot,player:9});await g.ack('queue-production',{ok:true,result:{count:1}});assert.equal(g.state.productionRequests.size,0);assert.equal(g.state.productionFeedback.size,0);
   const h=fixture(mode);h.work();h.state.productionRepeatDrafts.set(h.key(),true);h.c.stopFactoryProduction({dataset:{stopProduction:'11'}});
   h.c.reconcileManufacturingDisplay(h.state.snapshot,{...h.state.snapshot,player:9});h.state.productionRepeatDrafts.set(h.key(),true);await h.ack('stop-production',{ok:true,result:{repeat:{enabled:false}}});assert.equal(h.state.productionRepeatDrafts.get(h.key()),true);
  });
  await check(mode+': destroyed factory drafts are pruned while another live factory remains unchanged',()=>{
   const f=fixture(mode);f.state.productionRepeatDrafts.set(f.key(),true);f.state.productionRepeatDrafts.set(f.key(f.other),false);
   f.c.reconcileManufacturingDisplay(f.state.snapshot,{...f.state.snapshot,factories:[f.other]});assert.equal(f.state.productionRepeatDrafts.has(f.key()),false);assert.equal(f.state.productionRepeatDrafts.get(f.key(f.other)),false);
  });
 }
 await check('Duel retains its legacy quantity controls/manufacturing and queue rendering branch',()=>{
  const f=fixture('duel');f.work();const html=f.c.renderFactory();assert.match(html,/data-count="1"/);assert.match(html,/data-count="20"/);assert.match(html,/>PRODUCE</);assert.doesNotMatch(html,/data-production-repeat=|>MANUFACTURE</);
  const queue=f.c.liveQueueRows();assert.match(queue,/PRODUCING/);assert.doesNotMatch(queue,/data-stop-production=/);
  f.elements.set('wt-produce-count',{value:'5'});const b=f.manufactureButton();f.c.onClick({target:{closest:()=>b}});
  assert.equal(f.sent[0].action,'queue-production');assert.equal(f.sent[0].data.count,5);assert.equal(f.sent[0].data.repeat,undefined,'Legacy click branch retains finite quantities without new repeat policy');
 });
 await check('Design/Blueprints shared return arrow and per-page header gates remain connected to existing navigation',()=>{
  assert.match(source,/factory:'←',design:'Design',saved:'Blueprints'/);assert.match(source,/aria-label="Back to manufacturing"/);
  assert.match(source,/element\('wt-command-pages'\)\.dataset\.page=state\.page/);assert.match(source,/hidden=!\['design','saved'\]\.includes\(state\.page\)/);
 });
 const inputs=[file,'tools/test-manufacturing-ui-077.cjs'];
 const report={version:'0.77',passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,browserUsed:false,
  scope:'Actual shared Manufacturing/Queue functions under bounded synthetic DOM/command-reply fixtures across four modes; no Android/native gameplay. Layout pixels are covered separately by the host-browser fixture.',checksPassed:checks.length,checks,
  sources:inputs.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
 fs.mkdirSync(path.join(root,'qa/manufacturing-clean-077'),{recursive:true});fs.writeFileSync(path.join(root,'qa/manufacturing-clean-077/ui.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false,report:'qa/manufacturing-clean-077/ui.json'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
