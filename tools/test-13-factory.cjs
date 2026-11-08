'use strict';
// Execute the shipped factory models/renderers/actions; real layout/gameplay remains emulator QA.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const current=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const baseline=execFileSync('git',['show','4ebc3ec:app/src/main/assets/warzone-command-pages.js'],{encoding:'utf8',maxBuffer:2e6});
const css=fs.readFileSync('app/src/main/assets/warzone/ui/towers-commands.css','utf8');
const catalogue=JSON.parse(fs.readFileSync('app/src/main/assets/warzone/command-catalog.json','utf8'));
const section=(source,start,end)=>source.slice(source.indexOf('  function '+start+'('),source.indexOf('  function '+end+'('));
const parts=Object.values(catalogue.components).flat(),part=id=>parts.find(p=>p.id===id);
const scout={id:'saved-scout-a',name:'Scout A',body:'Body1REC',propulsion:'wheeled01',turrets:['MG1Mk1'],cost:999};
const alias={...scout,id:'saved-scout-b',name:'Scout B'};
const cannon={id:'saved-cannon',name:'Saved Cannon Cobra',body:'Body5REC',propulsion:'HalfTrack',turrets:['Cannon1Mk1'],cost:120};
const templates=[{id:'native-mg',fullname:'Machinegun Viper Wheels',body:'Body1REC',propulsion:'wheeled01',weapons:['MG1Mk1'],cost:55},
 {id:'native-mg-alias',fullname:'Machinegun Viper Wheels · F5',body:'Body1REC',propulsion:'wheeled01',weapons:['MG1Mk1'],cost:55},
 {id:'native-truck',fullname:'Truck Viper Wheels',body:'Body1REC',propulsion:'wheeled01',weapons:[],construct:'Spade1Mk1',cost:62},
 {id:'native-cyborg',fullname:'Heavy Gunner Cyborg',body:'CyborgLightBody',propulsion:'CyborgLegs',weapons:['CyborgCannon'],cost:87}];
const factories=Array.from({length:10},(_,i)=>({id:1001+i,number:i+1,kind:i<5?'Factory':'Cyborg factory',modules:i<5?1:0,ready:true,idle:true,active:null,currentProduction:null,queue:[],templates:i<5?['native-mg','native-mg-alias','native-truck']:['native-cyborg']}));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function harness(source,polished){
 const state={page:'factory',snapshot:{factories:structuredClone(factories),templates:structuredClone(templates),parts:['Body1REC','wheeled01','MG1Mk1','Spade1Mk1']},saved:structuredClone([scout,alias,cannon]),factory:1005,selected:alias.id,productionCount:1,scroll:{},factoryByFamily:{},factoryQueueOpen:false,factoryMenuOpen:false};
 const calls=[],nodes={'wt-factory-menu':{hidden:false},'wt-factory-menu-toggle':{attrs:{},setAttribute(k,v){this.attrs[k]=v;}}};
 const ctx=vm.createContext({state,polishedTowers:polished,esc,findPart:part,reason:code=>'Reason '+code,element:id=>nodes[id],render:()=>calls.push('render'),open:page=>calls.push('open:'+page)});
 vm.runInContext(section(source,'image','availableBuildings')+section(source,'availableDesign','install')+section(source,'unitParts','renderDesign')+section(source,'templateEquipment','saveTemplate')+section(source,'renderFactory','factoryFamily'),ctx);
 if(source===current)vm.runInContext(section(source,'factoryFamily','designFitsFactory'),ctx);
 else vm.runInContext(section(source,'factoryFamily','designFitsFactory'),ctx);
 vm.runInContext(section(source,'designFitsFactory','renderQueue'),ctx);
 return {ctx,state,calls,nodes};
}
const h=harness(current,true),beforePhone=JSON.stringify(h.state.saved);
let recipes=h.ctx.factoryRecipes(h.state.snapshot.factories[4]);assert.equal(recipes.length,3,'two engine aliases and two phone aliases render one hardware recipe');
let merged=recipes.find(r=>r.native?.id==='native-mg');assert.equal(merged.saved.length,2);assert.equal(merged.name,'Scout B');assert.equal(merged.produceId,alias.id);assert.equal(merged.produceNative,false);assert.equal(merged.cost,55,'display current native cost instead of stale cached phone cost');
assert.equal(recipes.find(r=>r.name==='Saved Cannon Cobra').compatible,false,'unresearched compatible-family phone blueprint remains visible and disabled');
let html=h.ctx.renderFactory();assert.equal((html.match(/class="wt-command-card wt-factory-design-row"/g)||[]).length,3);
assert.deepEqual(Array.from(html.matchAll(/data-factory="(\d+)"/g),m=>Number(m[1])),[1001,1002,1003,1004,1005]);
assert.match(html,/data-factory-family="vehicle" aria-pressed="true"/);assert.match(html,/data-factory-family="cyborg" aria-pressed="false"/);
assert.match(html,/<input hidden id="wt-factory-select" value="1005">/);assert.match(html,/data-produce="saved-cannon" disabled/);
assert.doesNotMatch(html,/EXISTING UNIT DESIGNS|SAVED DESIGNS|SELECTED DESIGN —|MORE CONTROLS|data-action="native-factory"/);
assert.equal(JSON.stringify(h.state.saved),beforePhone,'display dedup never deletes or rewrites phone aliases');
h.state.snapshot.parts=h.state.snapshot.parts.filter(id=>id!=='MG1Mk1');merged=h.ctx.factoryRecipes(h.state.snapshot.factories[4]).find(r=>r.native?.id==='native-mg');
assert.equal(merged.name,'Scout B');assert.equal(merged.compatible,true);assert.equal(merged.produceNative,true);assert.equal(merged.produceId,'native-mg','native availability survives an unavailable custom phone alias');
h.state.snapshot.parts.push('MG1Mk1');
for(const count of [1,5,10,20]){h.state.productionCount=count;html=h.ctx.renderFactory();assert.match(html,new RegExp('PRODUCE '+count+'</button>'));assert.match(html,new RegExp('id="wt-produce-count" value="'+count+'"'));}
h.ctx.selectFactoryFamily('cyborg');assert.equal(h.state.factory,1006);h.state.factory=1010;h.ctx.renderFactory();h.ctx.selectFactoryFamily('vehicle');assert.equal(h.state.factory,1005,'family switch restores native selected facility');h.ctx.selectFactoryFamily('cyborg');assert.equal(h.state.factory,1010);
html=h.ctx.renderFactory();assert.deepEqual(Array.from(html.matchAll(/data-factory="(\d+)"/g),m=>Number(m[1])),[1006,1007,1008,1009,1010]);assert.match(html,/data-factory-family="cyborg" aria-pressed="true"/);
h.state.snapshot.factories.reverse();assert.match(h.ctx.renderFactory(),/data-factory="1010" aria-pressed="true"/);assert.equal(h.ctx.factoryDisplayNumber(h.state.snapshot.factories.find(f=>f.id===1010)),5,'family numbering derives stable native IDs');
vm.runInContext(section(current,'openFactory','open'),h.ctx);assert.equal(h.ctx.openFactory(1005),true);assert.equal(h.state.factory,1005);assert.equal(h.calls.at(-1),'open:factory');assert.match(h.ctx.renderFactory(),/data-factory-family="vehicle" aria-pressed="true"/);assert.equal(h.ctx.openFactory(999999),false);

const truck={name:'Truck',body:'Body1REC',propulsion:'wheeled01',turrets:['Spade1Mk1']},jobs=[
 {id:'a1',design:scout,status:'queued',reason:''},{id:'a2',design:alias,status:'queued',reason:''},
 {id:'b1',design:truck,status:'queued',reason:''},{id:'a3',design:scout,status:'queued',reason:''},
 {id:'a4',design:scout,status:'blocked',reason:'unit-limit'}];
const beforeJobs=JSON.stringify(jobs),groups=h.ctx.factoryWaitingGroups(jobs);
assert.deepEqual(Array.from(groups,g=>Array.from(g.jobs)),[['a1','a2'],['b1'],['a3'],['a4']],'only consecutive same recipe/status/reason jobs group; A,B,A FIFO remains');
assert.equal(h.ctx.factoryWaitingName(groups[0]),'Scout A / Scout B ×2','grouped aliases stay visible');assert.equal(JSON.stringify(jobs),beforeJobs);
const f=h.state.snapshot.factories.find(f=>f.id===1005);f.queue=jobs;f.idle=false;f.currentProduction={name:'Native current unit',body:'Body1REC',propulsion:'wheeled01',turrets:['MG1Mk1']};
html=h.ctx.factoryProgress(f);assert.match(html,/NOW/);assert.match(html,/Native current unit/);assert.match(html,/SHOW QUEUE/);assert.match(html,/id="wt-factory-queue" class="wt-factory-queue" hidden/);assert.doesNotMatch(html,/\bETA\b|\d+%|remainingSeconds/);
h.state.factoryQueueOpen=true;html=h.ctx.factoryProgress(f);assert.match(html,/HIDE QUEUE/);assert.match(html,/data-production-group="3"/);assert.match(html,/data-clear-production="1005"/);
f.queue[0].status='blocked';html=h.ctx.factoryProgress(f);assert.match(html,/data-retry-production="1005"/);f.queue[0].status='queued';
let writes=0;const list={scrollTop:37},target={_html:'',querySelector:()=>list,set innerHTML(value){writes++;this.html=value;},get innerHTML(){return this.html;}};h.nodes['wt-factory-progress']=target;
h.ctx.updateFactoryActivity(f);h.ctx.updateFactoryActivity(f);assert.equal(writes,1,'identical native polls do not replace queue DOM');assert.equal(list.scrollTop,37);f.currentProduction.name='Changed current';h.ctx.updateFactoryActivity(f);assert.equal(writes,2);assert.equal(list.scrollTop,37,'live current-unit changes retain waiting scroll');
h.state.factoryMenuOpen=true;h.state.factoryQueueOpen=true;assert.equal(h.ctx.handlePanelBack(),true);assert.equal(h.state.factoryMenuOpen,false);assert.equal(h.state.factoryQueueOpen,true);assert.equal(h.state.page,'factory');assert.equal(h.ctx.handlePanelBack(),true);assert.equal(h.state.factoryQueueOpen,false);assert.equal(h.ctx.handlePanelBack(),false);
assert.equal(JSON.stringify(h.state.saved),beforePhone);

const old=harness(baseline,false),duel=harness(current,false);assert.equal(duel.ctx.renderFactory(),old.ctx.renderFactory(),'Duel Factory markup remains byte-identical to 0.12');assert.equal(duel.ctx.factoryProgress(factories[4]),old.ctx.factoryProgress(factories[4]));duel.state.factoryMenuOpen=true;duel.state.factoryQueueOpen=true;assert.equal(duel.ctx.handlePanelBack(),false,'nested Towers Back never changes Duel');
assert.ok(css.includes('grid-template-columns:clamp(146px,18vw,182px) minmax(0,1fr)'),'option3 facility rail and broad design area');assert.ok(css.includes('.wt-factory-roster')&&css.includes('.wt-factory-design-list')&&css.includes('.wt-factory-queue-list'));assert.ok(css.includes('body[data-command-page=factory] #wt-command-tabs'),'duplicate page tabs hidden only in Towers Factory');
assert.match(current,/factoryQueueOpen:false/);assert.match(current,/handlePanelBack,close,closeNative/);assert.match(current,/if\(state\.factoryMenuOpen\)state\.factoryMenuOpen=false;state\.closes/,'programmatic close remains a full page close');
console.log('PASS: Option3 family rail 5+5 native IDs, merged current-native/phone recipes without alias deletion, native availability/cost, quantities, consecutive FIFO grouping, live queue DOM preservation, nested Back and exact 0.12 Duel Factory output. No emulator input.');
