'use strict';
// Root-run helper. It never grants objects/research, edits saves, moves the
// camera or starts games. Without --tap it only inspects projected targets.
// The parent supplies a normal game or the disclosed complete5+5+5fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const json=JSON.stringify;
const catalogue=JSON.parse(fs.readFileSync(path.join(l.root,'app/src/main/assets/warzone/command-catalog.json'),'utf8'));
const models=JSON.parse(fs.readFileSync(path.join(l.root,'app/src/main/assets/warzone/build-ghost-models.json'),'utf8')).models;
const specs=Object.fromEntries(catalogue.buildings.map(b=>[b.id,b]));
async function geometrySourceChecks(){
 const vm=require('node:vm'),source=fs.readFileSync(path.join(l.root,'app/src/main/assets/warzone/ui/build-display.js'),'utf8');
 async function fixture(duel=false){
  const callbacks=[],events=new Map(),draws=[];let active=false,heights=0,occluded=false,covered=false,ended=false;
  const ctx={setTransform(){},clearRect(){draws.push('clear')},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){draws.push('outline')},fill(){draws.push('mesh')},fillRect(){draws.push('label')},strokeRect(){},fillText(){},measureText:t=>({width:t.length*6}),save(){},restore(){},rect(){},clip(){}};
  const canvas={style:{},setAttribute(){},getContext:()=>ctx},frame={getBoundingClientRect:()=>({left:0,top:40,width:800,height:500}),closest:s=>s==='#warzone-game-frame'?frame:null};
  const parentDoc={body:{dataset:{}},getElementById:id=>id==='warzone-game-frame'?frame:null,elementFromPoint:()=>covered?{closest:()=>null}:frame};
  const document={hidden:false,body:{classList:{contains:k=>k==='wt-towers-polished'},appendChild(){}},createElement:()=>canvas};
  const view={matrix:[1/1200,0,0,0,0,.002,0,0,0,.0006,0,-1/4096,-.4,-.2,0,1],left:0,top:0,width:800,height:500};
  const terrain={heightAt(){heights++;return 64;},view:()=>view,report:()=>({active,revision:1}),active:value=>{active=value},pick:()=>occluded?{worldX:0,worldY:0,height:0}:null};
  const w={document,parent:{document:parentDoc},__warzoneDuelConfig:duel?{mode:'duel'}:undefined,WarzoneTerrain:terrain,__warzoneCommands:{report:()=>({snapshot:{mapWidth:63,mapHeight:79}}),isOpen:()=>false,nativeBuildOpen:()=>false},__towersHtml:{isEnded:()=>ended},__kalaWarzoneTouch:{isBattlefieldPoint:(x,y)=>x>=0&&y>=0&&x<800&&y<480},addEventListener:(type,fn)=>events.set(type,fn),dispatchEvent:event=>events.get(event.type)?.(event)};w.window=w;
  vm.runInNewContext(source,{window:w,document,fetch:async()=>({ok:true,json:async()=>({models})}),requestAnimationFrame:fn=>callbacks.push(fn),innerWidth:800,innerHeight:500,devicePixelRatio:1,performance:{now:()=>100},Map,Set,Math,Number,Array,Object,JSON,Event:class{constructor(type){this.type=type}}});
  for(let n=0;n<5;n++)await Promise.resolve();
  return {api:w.WarzoneBuildDisplay,view,terrain,draws,heights:()=>heights,active:()=>active,frame:()=>callbacks.shift()(),cover:value=>{covered=value},occlude:value=>{occluded=value},end:()=>{ended=true;events.get('warzone-battle-ended')()}};
 }
 const record=(id,kind='research')=>{const itemId=kind==='research'?'A0ResearchFacility':kind==='cyborg'?'A0CyborgFactory':kind==='vtol'?'A0VTolFactory1':'A0LightFactory',spec=specs[itemId];return{id,itemId,kind,x:5,y:5,z:0,width:spec.width,breadth:spec.breadth,modules:0,moduleId:kind==='research'?'A0ResearchModule1':kind==='factory'||kind==='vtol'?'A0FacMod1':'',ready:true,nativeStatus:1};};
 const f=await fixture(),d=f.api;
 for(const kind of ['research','factory','cyborg','vtol']){
  const target=record(10,kind);if(kind==='factory')target.modules=1;
  d.setFacilityTargets([target],[],catalogue);const before=f.heights();assert.equal(d.report().facilityTargets.length,1);assert.equal(f.heights(),before,'ordinary model-count/status report never projects facility geometry');
  const shown=d.report({facilityGeometry:true}).facilityTargets[0],p=shown.hitPoints[0];assert.ok(p,'official '+kind+' mesh has a usable roof/body region');
  const hit=d.pickFacilityTarget(p.x,p.y);assert.equal(hit.id,target.id);assert.equal(hit.kind,kind);assert.equal(d.report().moduleTargets.length,0,'facility picking does not activate module UI');
  f.cover(true);assert.equal(d.pickFacilityTarget(p.x,p.y),null,'host HTML overlay blocks facility tap');f.cover(false);
  d.setFacilityTargets([target],[{id:51,player:0,x:5,y:5,z:0,bodySize:1}],catalogue);assert.equal(d.pickFacilityTarget(p.x,p.y),null,'own unit volume wins over building');
  d.setFacilityTargets([target],[{id:52,player:1,x:5,y:5,z:0,bodySize:1}],catalogue);assert.equal(d.pickFacilityTarget(p.x,p.y),null,'visible enemy unit volume also wins');
  d.setFacilityTargets([{...target,ready:false,nativeStatus:0}],[],catalogue);assert.equal(d.pickFacilityTarget(p.x,p.y),null,'unfinished/lost facility cannot open a full page');
 }
 d.setFacilityTargets([record(20)],[],catalogue);const old=d.report({facilityGeometry:true}).facilityTargets[0].hitPoints[0];
 f.view.matrix[0]=-1/1200;f.view.matrix[9]=-.0006;f.view.matrix[11]=1/4096;f.view.matrix[12]=.9;f.view.matrix[13]=-.6;
 const rotated=d.report({facilityGeometry:true}).facilityTargets[0].hitPoints[0];assert.ok(rotated&&Math.hypot(rotated.x-old.x,rotated.y-old.y)>30,'rotated camera recomputes real projected geometry');assert.equal(d.pickFacilityTarget(rotated.x,rotated.y).id,20,'north-facing camera uses no hard-coded map rotation');
 const normal=await fixture();normal.api.setFacilityTargets([record(21)],[],catalogue);const p=normal.api.report({facilityGeometry:true}).facilityTargets[0].hitPoints[0];normal.occlude(true);assert.equal(normal.api.pickFacilityTarget(p.x,p.y),null,'foreground terrain hides a facility surface');normal.occlude(false);
 const reads=normal.heights();normal.frame();assert.equal(normal.active(),true,'facility records retain current-camera observation');assert.equal(normal.heights(),reads,'frame loop does not calculate facility geometry');assert.ok(!normal.draws.some(v=>['outline','mesh','label'].includes(v)),'facility hit regions never add visible model/highlight art');
 normal.api.setFacilityTargets([],[],catalogue);normal.frame();assert.equal(normal.active(),false,'empty facility state releases its observer');
 normal.api.setFacilityTargets([record(22)],[{id:53,x:1,y:1,z:0,bodySize:0}],catalogue);normal.end();assert.equal(normal.api.report().facilityTargets.length,0);assert.equal(normal.api.report().facilityBlockerCount,0);
 const duel=await fixture(true);duel.api.setFacilityTargets([record(30)],[],catalogue);assert.equal(duel.api.report().facilityTargets.length,0);assert.equal(duel.api.pickFacilityTarget(p.x,p.y),null);duel.frame();assert.equal(duel.active(),false,'Duel never enables facility observation/picking');
 console.log('PASS: actual facility mesh/footprint picking for labs/vehicle/cyborg/VTOL, current camera rotation, visible-unit priority, HTML/terrain occlusion, completed-only records, no rendering/per-frame geometry, reset and Duel isolation');
}
async function fresh(c){const reply=await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})');assert.equal(reply.ok,true,'fresh native state');return reply.result;}
function targets(state,labs,kind){
 if(Array.isArray(state.facilityTargets))return state.facilityTargets.filter(t=>t.ready===true&&t.nativeStatus===1&&t.kind===kind&&(kind!=='research'||labs.some(lab=>lab.id===t.id))).map(t=>({...t,route:kind==='research'?'research':'factory'}));
 const result=[];
 if(kind==='research')for(const t of state.moduleTargets||[]){if(t.moduleId==='A0ResearchModule1'&&t.nativeStatus===1&&labs.some(lab=>lab.id===t.id))result.push({...t,route:'research'});}
 else for(const f of state.factories||[]){
  if(!f.ready||kind==='factory'&&f.kind!=='Factory'||kind==='cyborg'&&f.kind!=='Cyborg factory'||kind==='vtol'&&f.kind!=='VTOL factory')continue;
  const existing=(state.moduleTargets||[]).find(t=>t.id===f.id),itemId=existing?.itemId||(f.kind==='Cyborg factory'?'A0CyborgFactory':f.kind==='VTOL factory'?'A0VTolFactory1':'A0LightFactory'),spec=specs[itemId];
  assert.ok(spec,'official factory footprint '+itemId);result.push({...f,...existing,itemId,width:spec.width,breadth:spec.breadth,moduleId:existing?.moduleId||'',route:'factory'});
 }
 return result;
}
async function candidates(c,kind,id){
 assert.ok(['research','factory','cyborg','vtol'].includes(kind));
 const state=await fresh(c),research=await c.evaluate('__blockNightResearch.report()'),all=targets(state,research.labs,kind),target=all.find(t=>t.id===Number(id))||(!id&&all[0]);assert.ok(target,'owned completed native '+kind+' target exists');
 assert.equal(await c.evaluate('WarzoneTerrain.refresh(1500,false)'),true,'observe actual current camera/terrain');
 const model=models[target.modules>0&&models[target.moduleId]?target.moduleId:target.itemId];assert.ok(model,'official PIE model '+target.itemId);
 let points=await c.evaluate(`(()=>{
 const target=${json(target)},model=${json(model)},terrain=WarzoneTerrain,view=terrain.view();if(!view)throw Error('No observed world camera');
 const x=(target.x+(target.width%2?.5:0))*128,y=(target.y+(target.breadth%2?.5:0))*128,ground=terrain.heightAt(x,y),h=Number.isFinite(ground)?ground:Number.isFinite(target.z)?target.z*128:null;if(h===null)throw Error('No real building height');
 const frame=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();
 const project=(wx,wy,wz)=>{const p=terrain.project(wx,wy,wz),m=view.matrix,w=m[3]*wx+m[7]*wz-m[11]*wy+m[15];return p&&w>0?{...p,w}:null;};
 const vertices=Array.from({length:model.p.length/3},(_,i)=>project(x+model.p[i*3],y-model.p[i*3+2],h+model.p[i*3+1])),result=[];
 for(let i=0;i<model.f.length;i+=3){const p=model.f.slice(i,i+3).map(n=>vertices[n]);if(!p.every(Boolean))continue;const a=p[0],b=p[1],d=p[2],area=Math.abs((b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x))/2;if(area<8)continue;const px=(a.x+b.x+d.x)/3,py=(a.y+b.y+d.y)/3;
 if(!__kalaWarzoneTouch.isBattlefieldPoint(px,py)||!parent.document.elementFromPoint(px+frame.left,py+frame.top)?.closest('#warzone-game-frame'))continue;
 const depth=3/(1/a.w+1/b.w+1/d.w),hit=terrain.pick(px,py),surface=hit&&project(hit.worldX,hit.worldY,hit.height);if(surface&&surface.w+1e-4<depth)continue;
 if(result.some(q=>Math.hypot(q.x-px,q.y-py)<6))continue;
 result.push({x:px,y:py,area,depth,face:i/3,height:h,ground:hit,worldCentre:[x,y]});}
 return result.sort((a,b)=>b.area-a.area||a.depth-b.depth).slice(0,16);
 })()`);
 // On0.12only, select a point the actual production picker resolves to this
 // same authoritative facility. Never send a trial tap through a known unit
 // exclusion/foreground overlap just to discover a fixture problem.
 if(await c.evaluate('typeof WarzoneBuildDisplay.pickFacilityTarget==="function"'))points=await c.evaluate(`${json(points)}.filter(p=>WarzoneBuildDisplay.pickFacilityTarget(p.x,p.y)?.id===${target.id})`);
 assert.ok(points.length,'visible unoccluded official mesh point is available; reposition the real camera separately if not');
 return {kind,target,state,labs:research.labs,points};
}
async function runCase(c,options){
 const identity=j.installedIdentity(options.apk),r={passed:false,identity,kind:options.kind,nativeId:Number(options.id)||null,seeded:Boolean(options.seeded),fixtureDisclosure:options.fixtureDisclosure||null,started:new Date().toISOString(),checks:{}};
 const name=options.name||('world-'+options.kind+'-'+(options.id||'visible')),write=()=>fs.writeFileSync(path.join(l.out,name+'.json'),json(r,null,2)+'\n');
 try{
  if(r.seeded)assert.ok(r.fixtureDisclosure,'explicitly disclose seeded complete-save fixture');
  await j.closeOverlays(c);const touch=await c.evaluate('__kalaWarzoneTouch.report()');assert.ok(!touch.combatLock&&!touch.queueMode&&!touch.boxMode,'neutral ordinary touch mode');
  assert.equal(await c.evaluate('Boolean(window.__warzoneDuelConfig?.mode==="duel")'),false,'Towers only');
  r.before=await candidates(c,options.kind,options.id);r.nativeId=r.before.target.id;const point=r.before.points[Number(options.pointIndex)||0];assert.ok(point);r.point=point;
  if(options.inspectOnly){r.inspectionOnly=true;write();return r;}
  // Passive observation catches a queued native left press that could expose
  // a stock building menu. No synthetic engine input is generated by this log.
  await c.evaluate(`(()=>{const e=document.getElementById('canvas');window.__qaWorldNativeDown=[];window.__qaWorldNativeListener=event=>{if(!event.isTrusted&&event.button===0)__qaWorldNativeDown.push({type:event.type,x:event.clientX,y:event.clientY})};e.addEventListener('pointerdown',__qaWorldNativeListener,true);return true})()`);
  const position=await c.evaluate(`(()=>{const f=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:${point.x}+f.left,y:${point.y}+f.top,w:parent.innerWidth,h:parent.innerHeight}})()`),png=l.adb('exec-out','screencap','-p');
  l.adb('shell','input','tap',String(Math.round(position.x*png.readUInt32BE(16)/position.w)),String(Math.round(position.y*png.readUInt32BE(20)/position.h)));
  if(options.kind==='research'){
   await c.wait(`__blockNightResearch.report().open&&__blockNightResearch.report().labs[__blockNightResearch.report().activeLab]?.id===${r.nativeId}`,15000);
   r.after=await c.evaluate('({research:__blockNightResearch.report(),commands:__warzoneCommands.report()})');r.checks.fullResearchOpenedForNativeLabId=true;
  }else{
   await c.wait(`__warzoneCommands.report().page==='factory'&&Number(parent.document.getElementById('wt-factory-select').value)===${r.nativeId}`,15000);
   r.after=await c.evaluate('({research:__blockNightResearch.report(),commands:__warzoneCommands.report(),factoryId:Number(parent.document.getElementById("wt-factory-select").value)})');r.checks.fullFactoryOpenedForNativeFactoryId=true;
  }
  r.nativeLeftDown=await c.evaluate('__qaWorldNativeDown.slice()');assert.deepEqual(r.nativeLeftDown,[],'world structure tap is intercepted before any native left press');r.checks.noStockNativeLeftClick=true;
  r.screen=await j.capture(c,name);r.errors=c.errors;assert.deepEqual(r.errors,[]);r.passed=true;write();return r;
 }catch(error){r.failure=String(error.stack||error);try{r.failureScreen=l.screen(name+'-failure');r.failureState=await c.evaluate('({commands:__warzoneCommands.report(),research:__blockNightResearch.report(),touch:__kalaWarzoneTouch.report()})')}catch(_){}write();throw error;}
 finally{try{await c.evaluate(`(()=>{const e=document.getElementById('canvas');if(window.__qaWorldNativeListener)e.removeEventListener('pointerdown',__qaWorldNativeListener,true);delete window.__qaWorldNativeListener;delete window.__qaWorldNativeDown;return true})()`)}catch(_){}r.finished=new Date().toISOString();write();}
}
module.exports={targets,candidates,runCase,geometrySourceChecks};
if(require.main===module){const args=process.argv.slice(2),value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;(async()=>{if(args.includes('--source'))return geometrySourceChecks();const c=await j.connectReady();try{const r=await runCase(c,{kind:value('--kind','research'),id:value('--id',null),pointIndex:value('--point','0'),inspectOnly:!args.includes('--tap'),apk:process.env.WZ_QA_APK,seeded:args.includes('--seeded'),fixtureDisclosure:value('--fixture-disclosure',null)});console.log(json({passed:r.passed,inspectionOnly:r.inspectionOnly,nativeId:r.nativeId,points:r.before.points,checks:r.checks}));}finally{c.close()}})().catch(error=>{console.error(error);process.exitCode=1});}
