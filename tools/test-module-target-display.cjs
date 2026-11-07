'use strict';
// Geometry/feedback regressions only. Actual native module gameplay is tested separately.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone/ui/build-display.js','utf8');
const catalog=JSON.parse(fs.readFileSync('app/src/main/assets/warzone/command-catalog.json'));
const models=JSON.parse(fs.readFileSync('app/src/main/assets/warzone/build-ghost-models.json')).models;
const item=id=>catalog.buildings.find(b=>b.id===id);
const research=item('A0ResearchModule1'),power=item('A0PowMod1'),factory=item('A0FacMod1');
const row=(id,overrides={})=>({id,itemId:'A0ResearchFacility',name:'Research Facility',kind:'RESEARCH',moduleId:research.id,x:5,y:5,z:0,width:2,breadth:2,modules:0,maximum:1,reserved:0,nativeStatus:1,status:'eligible',eligible:true,statusReason:'',...overrides});
async function fixture(){
 const callbacks=[],events=new Map(),draws=[],clips=[];let now=100,sidebarWidth=170,heightReads=0,ended=false,active=false,revision=1,heightAt=()=>64;
 const context={setTransform(){},clearRect(){draws.push('clear')},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){draws.push('outline')},fill(){draws.push('mesh-fill')},fillRect(){draws.push('label-fill')},strokeRect(){},fillText(text){draws.push(text)},measureText:text=>({width:text.length*6}),save(){},restore(){},rect(...args){clips.push(args)},clip(){}};
 const canvas={style:{},setAttribute(){},getContext:()=>context};
 const frame={getBoundingClientRect:()=>({left:0,top:40,width:800,height:500})};
 const sidebar={hidden:false,getBoundingClientRect:()=>({left:0,top:40,width:sidebarWidth,height:500})};
 const parentDoc={body:{dataset:{}},getElementById:id=>id==='warzone-game-frame'?frame:id==='wt-build-sidebar'?sidebar:null};
 const document={hidden:false,body:{appendChild(){}},createElement:()=>canvas};
 const matrix=[1/1200,0,0,0,0,.002,0,0,0,.0006,0,-1/4096,-.4,-.2,0,1];
 const view={matrix,left:0,top:0,width:800,height:500};
 const terrain={heightAt(x,y){heightReads++;return heightAt(x,y)},view:()=>view,report:()=>({active,revision}),active:value=>{active=value},pick:()=>null};
 const w={document,parent:{document:parentDoc},WarzoneTerrain:terrain,__warzoneCommands:{report:()=>({snapshot:{mapWidth:63,mapHeight:79}}),isOpen:()=>false,nativeBuildOpen:()=>true},__towersHtml:{isEnded:()=>ended},__kalaWarzoneTouch:{isBattlefieldPoint:(x,y)=>x>=sidebarWidth&&y<480},addEventListener(type,fn){events.set(type,fn)},dispatchEvent(event){events.get(event.type)?.(event)}};
 w.window=w;
 vm.runInNewContext(source,{window:w,document,fetch:async()=>({ok:true,json:async()=>({models})}),requestAnimationFrame:fn=>callbacks.push(fn),innerWidth:800,innerHeight:500,devicePixelRatio:1,performance:{now:()=>now},Map,Set,Math,Number,Array,Object,JSON,Event:class{constructor(type){this.type=type}}});
 for(let i=0;i<5;i++)await Promise.resolve();
 return {api:w.WarzoneBuildDisplay,window:w,view,terrain,draws,clips,sidebar,frame:()=>{now+=100;callbacks.shift()()},setSidebar:value=>{sidebarWidth=value},setTerrain:fn=>{heightAt=fn;revision++},heightReads:()=>heightReads,ended:()=>{ended=true;events.get('warzone-battle-ended')()},reply:result=>events.get('warzone-command-reply')({detail:{action:'queue-build',ok:true,result}})};
}
(async()=>{
 const f=await fixture(),d=f.api,lab=row(1),full=row(2,{x:8,modules:1,status:'full',eligible:false,statusReason:'module-limit'}),generator=row(3,{itemId:'A0PowerGenerator',moduleId:power.id,kind:'POWER GENERATOR',x:10});
 d.setModuleTargets([lab,full,generator],catalog,research);
 let report=d.report();assert.deepEqual(Array.from(report.moduleTargets,t=>t.id),[1,2],'only the active module parent kind is annotated');
 assert.equal(report.moduleTargets[0].label,'UPGRADE 0/1');assert.equal(report.moduleTargets[1].label,'FULL 1/1');
 const point=report.moduleTargets[0].hitPoints[0];assert.ok(point,'original parent mesh supplies a real roof/body point');
 assert.equal(d.pickModuleTarget(point.x,point.y).id,1,'first touch resolves before any animation frame');
 assert.equal(d.report().moduleDrawn.length,0,'hit testing does not depend on paint setup');
 assert.ok(report.moduleTargets[0].hitPoints.length>=2,'QA can use distinct actual mesh regions');
 assert.equal(d.pickModuleTarget(20,point.y),null,'sidebar touches are excluded');
 const reads=f.heightReads();d.report();d.pickModuleTarget(point.x,point.y);assert.equal(f.heightReads(),reads,'static terrain heights are cached');
 assert.equal(d.preview(research,{x:500,y:500,parentId:1,target:lab}),true);assert.deepEqual(JSON.parse(JSON.stringify(d.report().previewPoint)),{x:5,y:5,parentId:1},'module preview snaps to the real parent instead of the raw map point');
 f.frame();assert.equal(d.report().moduleDrawn.find(t=>t.id===1).selected,true);assert.equal(f.draws.includes('mesh-fill'),false,'module preview never paints a whole-building clone');
 f.reply({itemId:research.id,parentId:2,x:5,y:5});assert.equal(d.report().previewParentId,1,'another parent cannot clear the chosen preview');
 f.reply({itemId:research.id,parentId:1,x:99,y:99});assert.equal(d.report().preview,'','accepted snapped parent clears preview even when raw/tile coordinates differ');
 const blockedPoint=d.report().moduleTargets.find(t=>t.id===2).hitPoints[0];assert.ok(blockedPoint);const blocked=d.pickModuleTarget(blockedPoint.x,blockedPoint.y);assert.equal(blocked.id,2);assert.equal(blocked.eligible,false);assert.equal(blocked.statusReason,'module-limit','full parent still returns a concrete feedback target');
 d.preview(research,{parentId:2,target:full});f.frame();assert.ok(!['#72e6c0','#c6ed78'].includes(d.report().moduleDrawn.find(t=>t.id===2).colour),'full target cannot advance a valid green preview');
 const busy=row(1,{modules:1,status:'upgrading',eligible:false,statusReason:'module-pending'});d.setModuleTargets([busy],catalog,research);d.preview(research,{parentId:1,target:busy});f.frame();assert.equal(d.report().moduleTargets[0].label,'UPGRADING 1/1');assert.ok(!['#72e6c0','#c6ed78'].includes(d.report().moduleDrawn[0].colour));
 const spare=row(4,{itemId:'A0LightFactory',moduleId:factory.id,kind:'FACTORY',width:3,breadth:3,modules:1,maximum:2,status:'upgrading',eligible:true});d.setModuleTargets([spare],catalog,factory);assert.equal(d.report().moduleTargets[0].label,'QUEUE 2/2','an upgrading factory with a spare slot remains eligible');
 const sparePoint=d.report().moduleTargets[0].hitPoints[0];assert.equal(d.pickModuleTarget(sparePoint.x,sparePoint.y).id,4);
 d.setModuleTargets([lab],catalog,research);const old=d.report().moduleTargets[0].hitPoints[0];f.view.matrix[12]+=.45;const moved=d.report().moduleTargets[0].hitPoints[0];assert.ok(moved);assert.ok(Math.abs(old.x-moved.x)>80);assert.equal(d.pickModuleTarget(moved.x,moved.y).id,1,'pan updates hit geometry before the next paint');assert.equal(d.pickModuleTarget(old.x,old.y),null,'old camera geometry cannot pick the previous roof position');
 f.setSidebar(799);f.frame();assert.equal(d.pickModuleTarget(moved.x,moved.y),null,'new overlay bounds invalidate hit testing');assert.equal(d.report().moduleTargets[0].visible,false,'covered parents do not leave detached upgrade labels');
 f.setSidebar(170);d.setModuleTargets([],catalog,null);assert.equal(d.report().moduleTargets.length,0);assert.equal(d.pickModuleTarget(moved.x,moved.y),null,'exit/ordinary item clears module hit regions');
 d.preview(item('GuardTower1'),{x:9,y:7});f.reply({itemId:'GuardTower1',x:8,y:7});assert.equal(d.report().preview,'GuardTower1');f.reply({itemId:'GuardTower1',x:9,y:7});assert.equal(d.report().preview,'','ordinary accepted-preview matching retains exact-site behaviour');
 d.setModuleTargets([lab],catalog,research);d.update([{id:'module-job',number:1,itemId:research.id,parentId:1,x:5,y:5,status:'queued'}],catalog);d.setModuleTargets([],catalog,null);f.frame();const site=d.report().drawn.find(s=>s.id==='module-job');assert.ok(site);assert.equal(site.model,false);assert.equal(site.triangles,0,'accepted module jobs remain outlines, not whole parent clones');
 f.ended();assert.equal(d.report().moduleTargets.length,0);assert.equal(d.report().acceptedSites.length,0);assert.equal(d.report().drawn.length,0);assert.equal(d.report().preview,'','battle end clears all old targeting/preview state immediately');
 const depth=await fixture();depth.view.matrix[9]=0;
 const near=row(10,{y:4}),far=row(11,{y:6});depth.api.setModuleTargets([far],catalog,research);const candidates=depth.api.report().moduleTargets[0].hitPoints;
 let overlap;for(const p of candidates){depth.api.setModuleTargets([near],catalog,research);if(depth.api.pickModuleTarget(p.x,p.y)){overlap=p;break;}}
 assert.ok(overlap,'perspective test includes genuinely overlapping projected parent meshes');depth.api.setModuleTargets([far],catalog,research);const farHit=depth.api.pickModuleTarget(overlap.x,overlap.y);depth.api.setModuleTargets([near,far],catalog,research);const nearer=depth.api.pickModuleTarget(overlap.x,overlap.y);assert.equal(nearer.id,10);assert.ok(nearer.hit.depth<farHit.hit.depth,'overlapping roofs choose the nearer actual mesh surface');
 const ordinary=await fixture(),ordinaryItems=catalog.buildings.filter(b=>b.category!=='MODULES');
 for(const b of ordinaryItems){
  ordinary.api.preview(b,{x:5,y:5});ordinary.frame();const r=ordinary.api.report(),paint=r.drawn.find(s=>s.id==='preview');
  assert.equal(r.error,'','ordinary preview paints without a caught exception: '+b.id);assert.ok(paint?.model&&paint.triangles>0,'actual ordinary mesh triangles painted: '+b.id);
  assert.equal(paint.validation,'pending');assert.equal(paint.colour,'#bac7cc','unvalidated site stays neutral: '+b.id);
 }
 assert.equal(ordinaryItems.length,161,'all ordinary catalogue entries are exercised by the actual renderer');
 for(const id of ['GuardTower1','PillBox1','A0ResearchFacility','A0PowerGenerator','A0LightFactory','A0CyborgFactory','A0ComDroidControl']){
  ordinary.api.clearPreview();ordinary.draws.length=0;ordinary.api.update([{id:'accepted-'+id,number:7,itemId:id,x:5,y:5,status:'travelling'}],catalog);ordinary.frame();
  const r=ordinary.api.report(),paint=r.drawn.find(s=>s.id==='accepted-'+id);assert.equal(r.error,'');assert.ok(paint?.model&&paint.triangles>0,'accepted mesh paints: '+id);assert.ok(ordinary.draws.includes('#7'),'accepted site label paints: '+id);
 }
 ordinary.api.update([{id:'ordinary-foundation',number:1,itemId:'A0ResearchFacility',structureId:90,x:5,y:5,status:'building'}],catalog);ordinary.api.setModuleTargets([row(51,{x:8})],catalog,research);ordinary.frame();
 assert.equal(ordinary.api.report().error,'');assert.equal(ordinary.api.report().moduleDrawn.length,1,'ordinary building cannot abort later module highlight painting');
 assert.equal(ordinary.api.report().drawn[0].model,false,'existing ordinary foundation does not acquire a model clone');
 ordinary.api.preview(item('A0ResearchFacility'),{x:5,y:5,validation:'valid'});ordinary.frame();assert.equal(ordinary.api.report().drawn.find(s=>s.id==='preview').colour,'#c6ed78');
 ordinary.api.reject('A0ResearchFacility',5,5);ordinary.frame();assert.equal(ordinary.api.report().drawn.find(s=>s.id==='preview').colour,'#f48d7d');assert.equal(ordinary.api.report().previewValidation,'invalid');
 const slope=await fixture();slope.setTerrain((x,y)=>x===6*128?120:x===5*128&&y===5*128?40:64);slope.api.preview(item('A0ResearchFacility'),{x:5,y:5});slope.frame();
 assert.equal(slope.api.report().drawn[0].height,120,'ordinary queued model matches native maximum over every footprint grid vertex');
 const sampled=slope.heightReads();slope.api.preview(item('A0ResearchFacility'),{x:5,y:5});slope.frame();assert.equal(slope.heightReads(),sampled,'static footprint heights are not sampled on repaint');
 slope.setTerrain(()=>96);slope.frame();assert.equal(slope.api.report().drawn[0].height,96,'native mesh change redraws and invalidates stale terrain heights at the same camera/site');
 slope.api.clearPreview();slope.api.update([{id:'flattened',number:2,itemId:'A0ResearchFacility',structureId:90,x:5,y:5,status:'building'}],catalog);slope.frame();assert.equal(slope.api.report().drawn[0].height,96,'existing base uses its freshly flattened terrain');
 slope.api.setModuleTargets([row(91)],catalog,research);slope.frame();const firstBounds=slope.api.report().moduleDrawn[0].bounds;
 slope.setTerrain(()=>144);slope.frame();assert.notEqual(slope.api.report().moduleDrawn[0].bounds.top,firstBounds.top,'module target geometry follows changed native terrain too');
 assert.equal(slope.api.report().error,'');
 const pulled=await fixture(),guard=item('GuardTower1'),guardCentre=(5+.5)*128;
 assert.deepEqual(models.GuardTower1.structureBounds,{min:[-23,0,-20],max:[23,115,20]},'height bounds retain the original first-level structure mesh without weapon overhang');
 pulled.setTerrain((x,y)=>y>guardCentre+25?200:y<guardCentre-25?160:80);
 pulled.api.update([{id:'guard-foundation',number:3,itemId:guard.id,structureId:92,x:5,y:5,status:'building'}],catalog);pulled.frame();
 assert.equal(pulled.api.report().drawn[0].height,80,'existing defense uses original structure-corner terrain heights, not assembled weapon/base bounds');
 assert.equal(pulled.api.report().drawn[0].model,false,'existing defense is rendered by the native engine');assert.equal(pulled.api.report().error,'');
 console.log('PASS: actual renderer paints all 161 ordinary previews, seven accepted models/site labels and mixed module highlights; neutral/valid/invalid feedback, footprint height and terrain-revision invalidation; parent mesh targeting regressions (code checks only)');
})().catch(error=>{console.error(error);process.exitCode=1});
