/* Actual display/ownership functions with bounded DOM/native-fullscreen fixtures. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),displayPath='app/src/main/assets/warzone/ui/build-display.js',uiPath='app/src/main/assets/warzone-command-pages.js',hudPath='app/src/main/assets/warzone-campaign-hud.js',nativePath='app/src/main/assets/warzone/warzone2100-campaign.js';
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),source=read(displayPath),ui=read(uiPath),hud=read(hudPath),native=read(nativePath),catalog=JSON.parse(read('app/src/main/assets/warzone/command-catalog.json')),models=JSON.parse(read('app/src/main/assets/warzone/build-ghost-models.json')).models;
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v)),checks=[];
const softFullscreen=native.slice(native.indexOf('var hideEverythingExceptGivenElement='),native.indexOf(';var restoreOldWindowedStyle='));
assert(softFullscreen.startsWith('var hideEverythingExceptGivenElement='));
const ownership=hud.slice(hud.indexOf('  const nativeUiActive ='),hud.indexOf('  const element ='));
const report=ui.match(/report:(\(\)=>\(\{version:64,[\s\S]*?terrain:window\.WarzoneTerrain\?\.report\(\)\}\))/)?.[1];assert(report,'Actual command report callback');
const moduleTargets=ui.slice(ui.indexOf('  function moduleTargets('),ui.indexOf('  function updateModuleGuidance('));
async function fixture(campaign=true){
 const callbacks=[],events=new Map(),paint=[],styles=[];let now=100,active=false,revision=1,ended=false,intelligence=false,open=false,hasView=true;
 const ctx=new Proxy({measureText:text=>({width:text.length*6}),fillText:text=>paint.push(text),clearRect:()=>paint.push('clear')},{get:(target,name)=>name in target?target[name]:()=>{}});
 const body={children:[],dataset:{},classList:{contains:()=>false},appendChild(node){node.parentNode=this;this.children.push(node);}};
 const nativeCanvas={style:{},parentNode:null},container={style:{},children:[nativeCanvas],parentNode:body};nativeCanvas.parentNode=container;body.children.push(container);
 const style=new Proxy({},{set(target,key,value){if(key==='display')styles.push(value);target[key]=value;return true;}}),canvas={style,setAttribute(){},getContext:()=>ctx};
 const sidebar={hidden:false,getBoundingClientRect:()=>({left:0,top:40,width:170,height:500})},iframe={getBoundingClientRect:()=>({left:0,top:40,width:800,height:500})};
 const parentDoc={body:{dataset:{}},getElementById:id=>id==='warzone-game-frame'?iframe:id==='wt-build-sidebar'?sidebar:null};
 const document={hidden:false,body,createElement:()=>canvas};
 const view={matrix:[1/1200,0,0,0,0,.002,0,0,0,.0006,0,-1/4096,-.4,-.2,0,1],left:0,top:0,width:800,height:500};
 const terrain={heightAt:()=>64,view:()=>hasView?view:null,report:()=>({active,revision}),active:value=>{active=value}};
 const commandState={modulePending:new Map(),pending:new Map(),lineDrafts:new Map(),siteNumbers:new Map(),nativePendingSites:[],buildOpen:true,placement:{id:'A0ResearchFacility'},nativeMenu:'',snapshot:{mapWidth:63,mapHeight:79,moduleTargets:[]}};
 const nativeFrame={worldSafe:true,playing:true,paused:false,video:false,transportOpen:false,intelligenceOpen:false};
 const w={document,parent:{document:parentDoc},__warzoneCampaignMode:campaign,WarzoneTerrain:terrain,__towersHtml:{isEnded:()=>ended},__warzoneIntelligence:{isOpen:()=>intelligence},__warzoneCommands:{isOpen:()=>open,nativeBuildOpen:()=>Boolean(commandState.placement)},addEventListener(type,fn){events.set(type,fn)},dispatchEvent(event){events.get(event.type)?.(event)}};w.window=w;
 const context=vm.createContext({window:w,document,fetch:async()=>({ok:true,json:async()=>({models})}),requestAnimationFrame:fn=>callbacks.push(fn),innerWidth:800,innerHeight:500,devicePixelRatio:1,performance:{now:()=>now},Event:class{constructor(type){this.type=type}},state:commandState,polishedTowers:false,nativeFrame});
 vm.runInContext(moduleTargets,context);w.__warzoneCommands.report=vm.runInContext(report,context);
 w.__warzoneCampaign={nativeUiActive:vm.runInContext('(()=>{const state={frame:nativeFrame};'+ownership+'return nativeUiActive;})()',context)};
 vm.runInContext(softFullscreen+';',context,{filename:nativePath+'#hideEverythingExceptGivenElement'});
 vm.runInContext(source,context,{filename:displayPath});for(let i=0;i<5;i++)await Promise.resolve();
 const api=w.WarzoneBuildDisplay;
 return {api,canvas,styles,paint,view,sidebar,document,parentDoc,commandState,nativeFrame,
  frame(){now+=100;assert(callbacks.length);callbacks.shift()();},hideNativeSiblings:()=>context.hideEverythingExceptGivenElement(nativeCanvas),
  setView:value=>{hasView=value},setEnded:value=>{ended=value},setIntelligence:value=>{intelligence=value},setPage:value=>{open=value},
  update:rows=>api.update(rows,catalog),preview:(id,x,y)=>api.preview(catalog.buildings.find(b=>b.id===id),{x,y}),
  reply:result=>events.get('warzone-command-reply')({detail:{action:'queue-build',ok:true,result}}),
  reset:()=>{events.get('warzone-battle-ended')?.()},setRevision:()=>{revision++},report:()=>clone(api.report())};
}
const row=(id,itemId='A0ResearchFacility',extra={})=>({id,itemId,x:7,y:6,number:id==='first'?1:2,status:'travelling',...extra});
async function baseline(){
 const f=await fixture();f.update([row('first'),row('second','A0PowerGenerator',{x:9,y:7,status:'queued'})]);f.frame();f.hideNativeSiblings();f.frame();
 assert.equal(f.report().drawn.length,2);assert(f.report().drawn.every(s=>s.model));assert.equal(f.canvas.style.display,'none');
 const target=path.join(root,'archive/campaign-blueprints-0.54-baseline.json');assert(!fs.existsSync(target),'Baseline proof is immutable');
 const screenshots=['baseline-first-build','baseline-switched-queued-build','baseline-closed-build-queue'];
 const evidence=screenshots.map(name=>{const p='qa/campaign-054/'+name+'.json',d=JSON.parse(read(p));return {path:p,sha256:hash(p),installedAPK_SHA256:d.installedAPK_SHA256,accepted:d.display.acceptedSites,drawn:d.display.drawn,rendererError:d.display.error,screenshot:{path:'qa/campaign-054/'+name+'.png',sha256:hash('qa/campaign-054/'+name+'.png')}}});
 fs.writeFileSync(target,JSON.stringify({version:'0.54',baseline:'0.53',reproduced:true,scope:'Actual renderer and exact Emscripten soft-fullscreen sibling-hiding function in DOM/VM fixture, plus parent-recorded installed-APK evidence. VM does not establish device rendering.',defect:'Campaign build canvas remains inline display:none after native soft-fullscreen while accepted blueprints continue painting offscreen.',fixture:{inlineDisplay:f.canvas.style.display,drawn:f.report().drawn},emulatorEvidence:evidence,sources:[displayPath,uiPath,hudPath,nativePath].map(p=>({path:p,sha256:hash(p)})),recordedUTC:new Date().toISOString()},null,2)+'\n');
 console.log('PASS baseline reproduced and immutable proof saved');
}
async function current(){
 const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name);};
 await check('Campaign restores the real canvas after Emscripten soft-fullscreen hides its body sibling',async()=>{
  const f=await fixture();f.update([row('first')]);f.frame();f.hideNativeSiblings();assert.equal(f.canvas.style.display,'none');f.frame();assert.equal(f.canvas.style.display,'block');assert.equal(f.report().drawn[0].model,true);const writes=f.styles.length;f.frame();assert.equal(f.styles.length,writes,'unchanged display is not written each animation frame');
 });
 await check('Different queued structures retain their meshes/identities after item switch, accepted-preview clear and Build close',async()=>{
  const f=await fixture();f.update([row('first')]);f.preview('A0ResearchFacility',7,6);f.reply({itemId:'A0ResearchFacility',x:7,y:6});f.preview('A0PowerGenerator',9,7);f.update([row('first'),row('second','A0PowerGenerator',{x:9,y:7,status:'queued'})]);f.reply({itemId:'A0PowerGenerator',x:9,y:7});f.frame();assert.deepEqual(f.report().drawn.map(s=>[s.id,s.itemId,s.model]),[['first','A0ResearchFacility',true],['second','A0PowerGenerator',true]]);f.commandState.buildOpen=false;f.commandState.placement=null;f.sidebar.hidden=true;f.api.clearPreview();f.frame();assert.equal(f.canvas.style.display,'block');assert.equal(f.report().drawn.length,2);
 });
 await check('Actual Campaign native ownership permits app-owned STAT build mode without recursive reports',async()=>{
  const f=await fixture();f.nativeFrame.worldSafe=false;f.update([row('first')]);f.hideNativeSiblings();f.frame();assert.equal(f.canvas.style.display,'block');assert.equal(f.report().drawn.length,1);f.commandState.buildOpen=false;f.commandState.placement=null;f.frame();assert.equal(f.canvas.style.display,'none');assert.equal(f.report().drawn.length,0);
 });
 await check('Native Intelligence, video, transport and pause suppress ghosts even while Build metadata exists; world return restores them',async()=>{
  for(const flag of ['intelligenceOpen','video','transportOpen','paused']){const f=await fixture();f.update([row('first')]);f.frame();Object.assign(f.nativeFrame,{worldSafe:false,[flag]:true});f.frame();assert.equal(f.canvas.style.display,'none',flag);assert.equal(f.report().drawn.length,0);Object.assign(f.nativeFrame,{worldSafe:true,[flag]:false});f.frame();assert.equal(f.canvas.style.display,'block',flag);assert.equal(f.report().drawn.length,1);}
 });
 await check('Custom Intelligence, Research, command pages, Help and document hide suppress only painting and restore accepted plans',async()=>{
  const f=await fixture();f.update([row('first')]);
  for(const toggle of [v=>f.setIntelligence(v),v=>f.setPage(v),v=>{f.parentDoc.body.dataset.research=String(v)},v=>{f.document.hidden=v}]){toggle(true);f.frame();assert.equal(f.canvas.style.display,'none');assert.equal(f.report().acceptedSites.length,1);toggle(false);f.frame();assert.equal(f.canvas.style.display,'block');assert.equal(f.report().drawn.length,1);}
  const get=f.parentDoc.getElementById;let helpOpen=true;f.parentDoc.getElementById=id=>id==='warzone-towers-help-overlay'?{hidden:!helpOpen}:get(id);f.frame();assert.equal(f.canvas.style.display,'none');helpOpen=false;f.frame();assert.equal(f.canvas.style.display,'block');
 });
 await check('Camera pan and fresh loaded sites use current projection and terrain revision without retaining completed or cancelled ghosts',async()=>{
  const f=await fixture();f.update([row('first'),row('second','A0PowerGenerator',{x:9,y:7})]);f.frame();const x=f.report().drawn[0].screenX;f.view.matrix[12]+=.2;f.frame();assert.notEqual(f.report().drawn[0].screenX,x);f.api.reset();f.setRevision();f.update([row('loaded','A0LightFactory',{x:10,y:8})]);f.frame();assert.deepEqual(f.report().acceptedSites.map(s=>s.id),['loaded']);f.update([row('loaded','A0LightFactory',{status:'done'}),row('cancelled','A0PowerGenerator',{status:'cancelled'})]);f.frame();assert.equal(f.canvas.style.display,'none');assert.equal(f.report().drawn.length,0);
 });
 await check('Physical foundations retain native model ownership; accepted queued plans still render, no duplicate building mesh',async()=>{
  const f=await fixture();f.update([row('first','A0ResearchFacility',{status:'building',structureId:50}),row('second','A0PowerGenerator',{x:9,y:7,status:'queued'})]);f.frame();assert.equal(f.report().drawn[0].model,false);assert.equal(f.report().drawn[1].model,true);
 });
 await check('No current projection and battle retirement keep the Campaign canvas hidden and clear previous pixels',async()=>{
  const f=await fixture();f.update([row('first')]);f.frame();f.setView(false);f.frame();assert.equal(f.canvas.style.display,'none');assert.equal(f.report().drawn.length,0);f.setView(true);f.frame();f.setEnded(true);f.reset();f.frame();assert.equal(f.canvas.style.display,'none');assert.equal(f.report().acceptedSites.length,0);
 });
 await check('Towers preserves its existing renderer visibility ownership and is unaffected by Campaign-native panel state',async()=>{
  const f=await fixture(false);f.update([row('first')]);f.nativeFrame.worldSafe=false;f.nativeFrame.intelligenceOpen=true;f.frame();assert.equal(f.report().drawn.length,1);assert.equal(f.canvas.style.display,undefined);f.hideNativeSiblings();f.frame();assert.equal(f.canvas.style.display,'none');assert.equal(f.report().drawn.length,1);assert.equal(f.styles.length,1,'only the native fixture wrote display');
 });
 const target=path.join(root,'archive/campaign-blueprints-0.54-checks.json');fs.writeFileSync(target,JSON.stringify({version:'0.54',passed:true,scope:'Actual JavaScript renderer/controller functions plus exact native soft-fullscreen DOM routine in VM fixtures. Device visual/gameplay verification is performed separately on the delivery APK.',checks,sources:[displayPath,uiPath,hudPath,nativePath,'tools/check-campaign-blueprints-054.cjs'].map(p=>({path:p,sha256:hash(p)})),recordedUTC:new Date().toISOString()},null,2)+'\n');
}
(process.argv.includes('--baseline')?baseline():current()).catch(error=>{console.error(error);process.exitCode=1});
