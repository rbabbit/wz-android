'use strict';
// Read-only model/DOM contract checks. Real geometry and gameplay are verified on the delivery APK.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone/ui/towers-status.js','utf8');
const dock=fs.readFileSync('app/src/main/assets/warzone/ui/lab-ui.js','utf8');
const css=fs.readFileSync('app/src/main/assets/warzone/ui/towers-status.css','utf8');
const catalog=JSON.parse(fs.readFileSync('app/src/main/assets/warzone/command-catalog.json','utf8'));
const section=(first,last)=>source.slice(source.indexOf(first),source.indexOf(last));
const state={kind:'research',family:'vehicle',parts:new Map(Object.values(catalog.components).flat().map(p=>[p.id,p])),catalogReady:true};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const model=vm.createContext({state,esc});
vm.runInContext(section('  const byId','  function read(')+section('  function componentIds','  function setText('),model);
const ordinary={labs:[{id:127,idle:false,topicId:'R-A',topicName:'Composite Alloys',estimatedProgress:.61},
 {id:125,idle:true,topicId:'',estimatedProgress:0}]};
let labs=model.researchRows(ordinary);
assert.deepEqual(Array.from(labs,row=>row.id),[125,127]);
assert.equal(labs[0].name,'No active research / READY');assert.equal(labs[0].estimatedPercent,null);
assert.equal(labs[1].estimatedPercent,61);assert.match(labs[1].image,/Composite%20Alloys\.gif$/);
const five={labs:Array.from({length:5},(_,i)=>({id:205-i,idle:i===0,topicId:i?'R-'+i:'',topicName:'Topic '+i,estimatedProgress:i*.25,waitingPower:i===1}))};
const beforeFive=JSON.stringify(five);labs=model.researchRows(five);
assert.deepEqual(Array.from(labs,row=>row.id),[201,202,203,204,205]);assert.equal(labs.filter(row=>row.active).length,4);
assert.equal(labs[0].estimatedPercent,99,'estimated bar cannot imply native completion');
assert.equal(labs.find(row=>row.id===204).waitingPower,true);assert.equal(JSON.stringify(five),beforeFive,'native report is never reordered or mutated');
const design={name:'Machinegun Viper Wheels',body:'Body1REC',propulsion:'wheeled01',turrets:['MG1Mk1']};
const ten={factories:Array.from({length:10},(_,i)=>({id:410-i,ready:true,idle:i!==0&&i!==5,kind:i<5?'Factory':'Cyborg Factory',
 active:i===0?{design}:null,currentProduction:i===5?{name:'Heavy Gunner Cyborg',body:'CyborgLightBody',propulsion:'CyborgLegs',weapons:['CyborgCannon']}:null,
 queue:[{design:{name:'Waiting units must not appear'}}]}))};
const beforeTen=JSON.stringify(ten);
let vehicle=model.productionRows(ten,'vehicle'),cyborg=model.productionRows(ten,'cyborg');
assert.equal(vehicle.length,5);assert.equal(cyborg.length,5);
assert.deepEqual(Array.from(vehicle,row=>row.id),[406,407,408,409,410]);assert.equal(vehicle[4].label,'FACTORY 5');
assert.equal(cyborg[4].label,'CYBORG FACTORY 5');assert.equal(cyborg[4].name,'Heavy Gunner Cyborg');
assert.equal(vehicle[4].name,design.name);assert.equal(vehicle[0].name,'No active production');
assert.equal(vehicle.filter(row=>row.active).length,1);assert.equal(cyborg.filter(row=>row.active).length,1);
assert.ok(!JSON.stringify([...vehicle,...cyborg]).includes('Waiting units must not appear'),'footer sidebar only reports current work');
assert.equal(JSON.stringify(ten),beforeTen);
assert.deepEqual(Array.from(model.componentIds(design)),['Body1REC','wheeled01','MG1Mk1']);
assert.deepEqual(Array.from(model.componentIds(cyborg[4].design)),['CyborgLightBody','CyborgLegs','CyborgCannon']);
assert.match(model.componentArt('MG1Mk1',2),/research-icons\/Machinegun.gif/);
assert.match(model.componentArt('Body1REC',0),/aria-label="Viper"/,'missing native thumbnails use labelled established silhouette');
assert.match(model.componentArt('Spade1Mk1',2),/Engineering.gif/);
const unknown=model.productionRows({factories:[{id:9,ready:true,idle:false,kind:'Factory',queue:[]}]},'vehicle')[0];
assert.equal(unknown.name,'Unit in production');assert.equal(unknown.design,null,'never invent unknown current design');
assert.ok(!('estimatedPercent' in unknown),'production has no pretend percentage');

// Execute the real row patcher with minimal DOM nodes; prove stable identities and accessible estimates.
function node(){return {hidden:false,textContent:'',dataset:{},attrs:{},style:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;}};}
const rowList={children:[],scrollTop:49,hidden:false,insertBefore(row,before){const old=this.children.indexOf(row);if(old>=0)this.children.splice(old,1);const at=before?this.children.indexOf(before):this.children.length;this.children.splice(at<0?this.children.length:at,0,row);}};
function makeRow(id){const row=node();row.dataset.statusRow=String(id);row._parts=Object.fromEntries(['image','strip','label','name','activity','progress','bar'].map(k=>[k,node()]));row.remove=()=>rowList.children.splice(rowList.children.indexOf(row),1);return row;}
Object.assign(model,{rows:rowList,empty:node(),makeRow});
vm.runInContext(section('  function setText','  function makeRow')+section('  function renderRows','  function renderFamilies'),model);
model.renderRows(labs);const held=rowList.children[0];
labs[0].estimatedPercent=73;model.renderRows(labs);
assert.equal(rowList.children[0],held,'progress refresh retains row under a finger');assert.equal(rowList.scrollTop,49,'refresh never steals scroll');
assert.equal(held._parts.progress.attrs['aria-valuenow'],'73');assert.match(held._parts.progress.attrs['aria-valuetext'],/estimated/);
assert.equal(held._parts.bar.style.width,'73%');
assert.ok(!rowList.children.some(row=>/%|\bETA\b/.test([row._parts.label.textContent,row._parts.name.textContent,row._parts.activity.textContent].join(' '))),'numeric progress is not visible text');
model.state.kind='production';model.renderRows(vehicle);assert.equal(rowList.children.length,5);assert.equal(rowList.children[4]._parts.activity.textContent,'PRODUCING');
assert.ok(rowList.children.every(row=>row._parts.progress.hidden),'production never renders a completion bar');
model.renderRows(vehicle.slice(1));assert.equal(rowList.children.length,4,'lost native facility disappears without stale row');

// Execute navigation/visibility contracts without any game input facility in the VM.
let data={commands:{snapshot:ten},research:ordinary,touch:{hudVisible:true}},help={hidden:true},updates=0;
const nav=vm.createContext({state:{kind:'',family:'vehicle'},panel:{hidden:true},familyOf:vm.runInContext('familyOf',model),
 read:()=>data,isTowers:()=>true,document:{body:{dataset:{}},getElementById:()=>help},syncFooter(){},update(){updates++;}});
vm.runInContext(section('  function allowed','  const panel =')+section('  function close()','  function componentIds'),nav);
assert.equal(nav.open('production'),true);assert.equal(nav.state.kind,'production');assert.equal(updates,1);
assert.equal(nav.close(),true);assert.equal(nav.close(),false);assert.equal(nav.panel.hidden,true);
for(const block of [{page:'factory'},{buildOpen:true},{placement:'tower'},{nativeMenu:'research'},{nativeClosing:true}]){
 data={commands:{snapshot:ten,...block},research:ordinary,touch:{hudVisible:true}};assert.equal(nav.open('research'),false);
}
data={commands:{snapshot:ten},research:{...ordinary,open:true},touch:{hudVisible:true}};assert.equal(nav.open('research'),false);
data={commands:{snapshot:ten},research:ordinary,touch:{hudVisible:true}};help.hidden=false;assert.equal(nav.open('research'),false);
help.hidden=true;assert.equal(nav.open('research'),true);assert.equal(nav.close(),true);
assert.ok(!/\.send\s*\(|\.focus\s*\(|releaseAll|selectMode|simulate|dispatchEvent|KeyboardEvent|requestFullscreen/.test(source),'status observation cannot issue game orders, steal focus or synthesize input');

// The actual initializer exits before creating any DOM in Duel, for either host or child mode.
for(const [hostMode,childMode] of [['duel',undefined],[undefined,'duel']]){
 const child={__warzoneDuelConfig:{mode:childMode}},context=vm.createContext({window:{__warzoneDuelConfig:{mode:hostMode}},
  document:{getElementById:()=>({contentWindow:child}),createElement(){throw Error('Duel must receive no status DOM');}}});
 vm.runInContext(source,context);assert.equal(context.window.TowersStatus,undefined);
}
assert.match(dock,/if \(isTowers\(\)\) \{\s+statusReady\.then/);
assert.match(dock,/else w\?\.__warzoneCommands\?\.open\('factory'\)/,'Duel retains original full-page production action');
assert.match(css,/bottom:60px;width:242px/);assert.match(css,/repeat\(5,minmax\(56px,1fr\)\)/);
assert.match(css,/body\[data-towers-status\] #wt-field-centre \{visibility:hidden/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
console.log('PASS: live 5-lab and 5+5-factory models, stable native IDs/DOM rows, true artwork/fallbacks, current-only production, accessible research estimate without visible percent, navigation visibility and Duel isolation. No emulator input.');
