'use strict';
// Execute the actual construction-summary functions in a bounded source fixture.
// No browser, Android, native gameplay, timers or production fixture is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const sourcePath='app/src/main/assets/warzone-command-pages.js',cssPath='app/src/main/assets/warzone/ui/towers-commands.css';
const source=fs.readFileSync(path.join(root,sourcePath),'utf8'),css=fs.readFileSync(path.join(root,cssPath),'utf8');
new vm.Script(source,{filename:sourcePath});
const baseline=cp.execFileSync('python',['-c',"from zipfile import ZipFile; from pathlib import Path; import json,sys; r=Path(r'C:\\timerApp\\wz-towers-lab'); p=next(Path(x['path']) for x in json.loads((r/'archive/fallback-0.47.json').read_text())['files'] if x['path'].endswith('-source.zip')); sys.stdout.buffer.write(ZipFile(p).read('app/src/main/assets/warzone-command-pages.js'))"],{encoding:'utf8',maxBuffer:1024*1024});
function functions(value){
 const starts=[...value.matchAll(/^  (?:async )?function ([A-Za-z0-9_]+)\(/gm)];
 return new Map(starts.map((m,i)=>[m[1],value.slice(m.index,i+1<starts.length?starts[i+1].index:value.length)]));
}
const current=functions(source),prior=functions(baseline),checks=[];
const fn=name=>current.get(name);
function check(name,body){body();checks.push(name);}
const catalog={buildings:[{id:'Cannon',name:'Light Cannon Hardpoint'},{id:'Rocket',name:'Mini-Rocket Tower'},{id:'LabModule',name:'Research Module'}]};
const nodes=new Map(['wt-sidebar-queue','wt-sidebar-power','wt-sidebar-builders'].map(id=>[id,{hidden:id==='wt-sidebar-queue',innerHTML:'',textContent:''}]));
let modelRows=[],refits=0,scrollUpdates=0;
const state={snapshot:null,catalog,buildOpen:true,placement:null,nativeBuildGroup:[],category:'DEFENCES',siteNumbers:new Map()};
const context=vm.createContext({state,polishedTowers:true,powerSymbol:'P',Math,Number,Object,String,Map,Promise,
 esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 element:id=>nodes.get(id),window:{WarzoneBuildDisplay:{update:rows=>{modelRows=JSON.parse(JSON.stringify(rows));},setModuleTargets(){}}},
 moduleTargets:()=>[],updateModuleGuidance(){},fitCatalogueRows(){refits++;},updateCatalogueScroll(){scrollUpdates++;}});
for(const name of ['siteStatus','remainingTime','constructionRows','currentConstruction','currentConstructionRow','updateSidebarQueue'])vm.runInContext(fn(name),context,{filename:sourcePath+'#'+name});
const site=(id,status,extra={})=>({id:'cmd-'+id+'-site',itemId:'Cannon',status,x:27,y:id,structureId:100+id,progress:status==='building'?.4:null,remaining:status==='building'?6:null,...extra});
function snapshot(sites,extra={}){state.snapshot={gameTime:5000,power:1744,trucks:[],constructionSites:sites,jobs:[],construction:[],finishedBuilds:[],...extra};}
function paint(){context.updateSidebarQueue();return nodes.get('wt-sidebar-queue');}
const htmlIds=html=>[...html.matchAll(/data-site-id="([^"]+)"/g)].map(m=>m[1]);

check('Only one actively building site appears, with stable number, name and observed progress; other work and finished history stay untouched',()=>{
 snapshot([site(5,'done'),site(6,'queued'),site(7,'building'),site(8,'building')]);
 const before=JSON.stringify(state.snapshot),row=paint();
 assert.equal(row.hidden,false);assert.equal(htmlIds(row.innerHTML).length,1);assert.match(row.innerHTML,/cmd-7-site/);
 assert.match(row.innerHTML,/#3<\/span> Light Cannon Hardpoint/);assert.match(row.innerHTML,/value="0.4"/);assert.match(row.innerHTML,/BUILDING/);
 assert.doesNotMatch(row.innerHTML,/PENDING|DONE|CONSTRUCTION|VIEW ALL|KEEP ORDERS|AT 27/);
 assert.equal(JSON.stringify(state.snapshot),before);assert.equal(modelRows.length,4,'world display still receives all original history rows');
 state.snapshot.constructionSites.reverse();assert.match(paint().innerHTML,/cmd-7-site/,'stable numbering resolves same-priority ties');
});
check('Completion advances to the next active site and the same site keeps its original number',()=>{
 state.snapshot.constructionSites.find(j=>j.id==='cmd-7-site').status='done';
 const row=paint();assert.match(row.innerHTML,/cmd-8-site/);assert.match(row.innerHTML,/data-site-number="4"/);
 assert.doesNotMatch(row.innerHTML,/cmd-7-site|cmd-5-site/);
});
check('Screenshot case with only completed sites clears the summary and releases its entire layout space',()=>{
 snapshot([site(8,'done'),site(9,'done')]);const fitBefore=refits;
 const row=paint();assert.equal(row.hidden,true);assert.equal(row.innerHTML,'');assert.equal(refits,fitBefore+1);assert.ok(scrollUpdates>0);
 assert.equal(modelRows.length,2,'completed world history is retained outside the live summary');
 assert.match(css,/#wt-sidebar-queue\[hidden\]\{display:none!important\}/);
});
check('Active priority is building/module upgrade, power wait, truck wait, travel, then queued; cancelled, failed, interrupted and blocked rows are excluded',()=>{
 for(const status of ['done','cancelled','failed','interrupted','rejected','blocked','demolishing']){
   snapshot([site(10,status)]);assert.equal(paint().hidden,true,status);
 }
 const ordered=['building','upgrading','waiting-power','waiting-trucks','travelling','working','queued'];
 for(let i=0;i<ordered.length;i++){
   snapshot(ordered.slice(i).reverse().map((status,j)=>site(20+j,status)));
   const selected=context.currentConstruction(context.constructionRows());
   const priority={building:0,upgrading:0,'waiting-power':1,'waiting-trucks':2,travelling:3,working:3,queued:4};
   assert.equal(priority[selected.status],priority[ordered[i]]);
 }
});
check('Native construction without an app job and module work use the original observed status and display identity',()=>{
 snapshot([],{construction:[{id:90,itemId:'Cannon',name:'Light Cannon Hardpoint',x:20,y:21,status:'building',progress:.25,remaining:12,workers:2}]});
 assert.match(paint().innerHTML,/data-site-id="90"/);assert.match(paint().innerHTML,/value="0.25"/);
 snapshot([site(99,'upgrading',{itemId:'LabModule',parentId:47,progress:.6,remaining:9})]);
 assert.match(paint().innerHTML,/Research Module/);assert.match(paint().innerHTML,/UPGRADING/);assert.match(paint().innerHTML,/value="0.6"/);
});
check('Rendering clamps only visual progress and escapes item names without modifying engine snapshots',()=>{
 snapshot([site(101,'building',{progress:1.8,itemId:'Injected'})]);state.catalog={buildings:[...catalog.buildings,{id:'Injected',name:'<script>"bad"</script>'}]};
 const before=JSON.stringify(state.snapshot),html=paint().innerHTML;
 assert.match(html,/value="1"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.equal(JSON.stringify(state.snapshot),before);state.catalog=catalog;
});
check('Towers installation removes only its redundant Exit button; Duel retains it and footer keep-orders toggles remain byte-identical',()=>{
 assert.match(fn('install'),/polishedTowers\?'':button\('EXIT · KEEP ORDERS'/);
 assert.match(fn('install'),/polishedTowers\?' hidden':''/);
 for(const name of ['toggle','toggleBuild','selectMode','afterBuildExit','constructionRows','closeNative','compactOrders','renderQueue','liveQueueRows','queueRows'])assert.equal(fn(name),prior.get(name),name+' must retain its existing workflow');
 assert.match(fn('toggle'),/target==='build'\?selectMode\(\):close\(\)/);
});
check('Compact CSS has one unclipped text row and progress line, no fixed legacy queue height, and scales with existing text settings',()=>{
 const rule=css.match(/\.wt-towers-polished #wt-sidebar-queue\{[^}]+\}/)?.[0]||'';
 assert.match(rule,/height:auto/);assert.match(rule,/flex:0 0 auto/);assert.match(rule,/min-height:0/);assert.match(rule,/padding:5px 8px 7px/);
 assert.doesNotMatch(rule,/height:(?:89|110|140)px/);
 assert.match(css,/\.wt-current-site>strong\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap[^}]*var\(--wt-command-scale,1\)/);
 assert.match(css,/\.wt-current-site>progress\{[^}]*height:3px/);
 // Source-derived geometry bound: title + status + progress + margins/padding.
 for(const scale of [1,1.2,1.4]){
   const currentHeight=12+11*scale*1.2+2+8*scale*1.2+3+3;
   const oldHeight=6+12*scale*1.15+2*33*scale+23*1.25+34+12;
   assert.ok(currentHeight<oldHeight/2,`compact summary at scale ${scale}`);
 }
});
check('Every unrelated named command/menu/order function remains identical to the v0.46 complete fallback',()=>{
 for(const [name,body]of prior){if(['install','updateSidebarQueue'].includes(name))continue;assert.equal(current.get(name),body,name);}
});

const hash=n=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex');
const report={version:'0.47',passed:true,emulatorUsed:false,browserUsed:false,androidRuntimeExecuted:false,actualNativeEngineExecuted:false,
 screensVerified:false,gameplayVerified:false,scope:'Actual JavaScript function execution with synthetic read-only construction snapshots, source preservation and source-derived compact geometry only.',
 checksPassed:checks.length,checks,unchangedNamedFunctions:prior.size-2,
 sources:[sourcePath,cssPath].map(n=>({path:n,sha256:hash(n)})),recordedUTC:new Date().toISOString()};
fs.writeFileSync(path.join(root,'archive/build-summary-0.47-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checksPassed:checks.length,unchangedNamedFunctions:report.unchangedNamedFunctions,emulatorUsed:false,report:'archive/build-summary-0.47-checks.json'}));
