'use strict';
// Execute the real render functions against changing native facility records.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const current=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const baseline=execFileSync('git',['show','6e719fbfb2fb52a968dc010f98fff7daf94227db:app/src/main/assets/warzone-command-pages.js'],{encoding:'utf8',maxBuffer:1024*1024});
const section=(source,start,end)=>source.slice(source.indexOf('  function '+start+'('),source.indexOf('  function '+end+'('));
const saved=[{id:'saved-mg',name:'Scout',body:'Body1REC',propulsion:'wheeled01',turrets:['MG1Mk1'],cost:55},{id:'saved-cannon',name:'Cannon Viper Wheels',body:'Body1REC',propulsion:'wheeled01',turrets:['Cannon1Mk1'],cost:120}];
const factories=Array.from({length:10},(_,i)=>({id:1001+i,number:i+1,kind:i<5?'Factory':'Cyborg factory',modules:i<5?1:0,ready:true,idle:i!==4,active:i===4?{design:saved[0]}:null,queue:i===4?[{id:'job1',design:saved[0],status:'queued'}]:[],templates:i<5?['native-mg']:['native-cyborg']}));
const templates=[{id:'native-mg',fullname:'Machinegun Viper Wheels',body:'Body1REC',propulsion:'wheeled01',weapons:['MG1Mk1'],cost:55},{id:'native-cyborg',fullname:'Heavy Gunner Cyborg',body:'CyborgLightBody',propulsion:'CyborgLegs',weapons:['CyborgCannon'],cost:87}];
function context(source,polished){
 const state={snapshot:{factories:structuredClone(factories),templates:structuredClone(templates),parts:['Body1REC','wheeled01','MG1Mk1','Spade1Mk1']},saved:structuredClone(saved),factory:1010,selected:'',productionCount:1,scroll:{}};
 const ctx=vm.createContext({state,polishedTowers:polished,esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),findPart:id=>({id,size:'LIGHT'}),image:()=>'<img src="real-component.gif" alt="">',unitParts:d=>'<div class="wt-unit-parts">'+String(d?.body||'')+'</div>',reason:v=>String(v)});
 vm.runInContext(section(source,'button','availableBuildings')+section(source,'availableDesign','install')+section(source,'templateEquipment','saveTemplate'),ctx);
 vm.runInContext(section(source,'renderFactory',source===current?'factoryFamily':'designFitsFactory'),ctx);
 if(source===current)vm.runInContext(section(source,'factoryFamily','designFitsFactory'),ctx);
 vm.runInContext(section(source,'designFitsFactory','productionCard')+section(source,'productionCard','renderQueue'),ctx);
 return ctx;
}
const towers=context(current,true),beforeLibrary=JSON.stringify(towers.state.saved);
let html=towers.renderFactory();
const ids=Array.from(html.matchAll(/data-factory="(\d+)"/g),m=>Number(m[1]));
assert.deepEqual(ids,factories.map(f=>f.id),'five vehicle and five cyborg native IDs are exposed once');
assert.ok(html.includes('data-factory-strip="vehicle"')&&html.includes('data-factory-strip="cyborg"'),'each facility family has an independently pannable strip');
assert.match(html,/<input hidden id="wt-factory-select" value="1010">/);
assert.match(html,/data-factory="1010" aria-pressed="true"/);
assert.ok(html.includes('data-produce="saved-cannon" disabled'),'unresearched phone design is retained visibly and unavailable');
assert.ok(html.includes('Research required this game'));
assert.equal(JSON.stringify(towers.state.saved),beforeLibrary,'rendering changes no stored blueprint data');
towers.state.snapshot.factories.reverse();html=towers.renderFactory();assert.equal(towers.state.factory,1010,'native ID selection survives facility reordering');assert.match(html,/data-factory="1010" aria-pressed="true"/);
towers.state.factory=1005;html=towers.renderFactory();assert.ok(html.includes('PRODUCING')&&html.includes('WAITING · 1 UNIT')&&html.includes('data-clear-production="1005"'));
assert.doesNotMatch(html,/\b(?:ETA|remainingSeconds)\b|\d+%/,'factory data has no invented progress or countdown');
towers.state.snapshot.factories=towers.state.snapshot.factories.filter(f=>f.id!==1005);towers.renderFactory();assert.notEqual(towers.state.factory,1005,'destroyed facility cannot leave a stale selected ID');
const old=context(baseline,false),duel=context(current,false);
assert.equal(duel.renderFactory(),old.renderFactory(),'Duel factory markup and controls remain the0.10 output');
assert.equal(duel.factoryProgress(factories[4]),old.factoryProgress(factories[4]),'Duel production status/queue output is unchanged');
for(const source of [current,baseline]){
 const properties={},grid={children:[1,2],style:{setProperty:(k,v)=>properties[k]=v},querySelectorAll:()=>[{scrollHeight:24},{scrollHeight:36}]},wrap={clientHeight:240,getBoundingClientRect:()=>({height:240})};
 const ctx=vm.createContext({polishedTowers:source===current,state:{size:1},element:id=>id==='wt-catalogue-wrap'?wrap:grid,host:{getComputedStyle:()=>({rowGap:'5',paddingTop:'0',paddingBottom:'0'})}});
 vm.runInContext(section(source,'fitCatalogueRows','updateCatalogueScroll'),ctx);ctx.fitCatalogueRows();
 assert.ok(parseFloat(properties['--wt-catalogue-row'])>=48,'complete structure names fit their row');
 assert.ok(parseFloat(properties['--wt-build-art'])>=24,'structure artwork is retained');
}
const scroll={};const scrollContext=vm.createContext({polishedTowers:true,state:{scroll},panelScrollers:'panels'});
vm.runInContext(section(current,'rememberPanelScroll','render'),scrollContext);
scrollContext.rememberPanelScroll({dataset:{labScrollKey:'factory:1010'},querySelectorAll:s=>s==='[data-factory-strip]'?[{dataset:{factoryStrip:'vehicle'},scrollLeft:111},{dataset:{factoryStrip:'cyborg'},scrollLeft:222}]:[{scrollTop:33},{scrollTop:44}]});
assert.equal(scroll['factory-strip:vehicle'],111);assert.equal(scroll['factory-strip:cyborg'],222);
assert.deepEqual(Array.from(scroll['panels:factory:1010']),[33,44]);
console.log('PASS: real Towers render supports5+5factories, stable selectedIDs, unavailable phone designs, ordinary queue statuses and independent strip scroll; Duel output remains0.10.');
