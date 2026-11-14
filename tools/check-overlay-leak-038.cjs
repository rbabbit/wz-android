'use strict';
// Reuse the established real-module fixtures; no device, browser or gameplay run.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');process.chdir(root);
const rendererPath='app/src/main/assets/warzone/ui/build-display.js',intelligencePath='app/src/main/assets/warzone-intelligence.js';
const baselineZIP=path.resolve(root,'../warzone-towers-0.37-source.zip');
const prior=execFileSync('python',['-c',"from zipfile import ZipFile;import sys;z=ZipFile(sys.argv[1]);sys.stdout.buffer.write(z.read(sys.argv[2]))",baselineZIP,rendererPath],{encoding:'utf8',maxBuffer:1024*1024});
const current=fs.readFileSync(rendererPath,'utf8'),catalog=JSON.parse(fs.readFileSync('app/src/main/assets/warzone/command-catalog.json'));
const hash=v=>createHash('sha256').update(v).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v)),checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
const rendererHarness=fs.readFileSync('tools/test-module-target-display.cjs','utf8');
async function renderer(source){
 const shim={...fs,readFileSync:(p,...args)=>String(p).replaceAll('\\','/')===rendererPath?source:fs.readFileSync(p,...args)};
 const make=vm.runInNewContext(rendererHarness.slice(0,rendererHarness.indexOf('(async()=>'))+'\nfixture;',{require:n=>n==='node:fs'?shim:require(n),console});
 return make();
}
const uiHarness=fs.readFileSync('tools/check-intelligence-ui-036.cjs','utf8');
function intelligence(){return vm.runInNewContext(uiHarness.slice(0,uiHarness.indexOf('(async()=>'))+'\nfixture;',{require,__dirname:path.join(root,'tools'),process,console,Buffer,TextDecoder})();}
const item=id=>catalog.buildings.find(b=>b.id===id),lab={id:990,itemId:'A0ResearchFacility',name:'Research Facility',kind:'RESEARCH',moduleId:'A0ResearchModule1',x:5,y:5,z:0,width:2,breadth:2,modules:0,maximum:1,reserved:0,nativeStatus:1,status:'eligible',eligible:true,statusReason:''};
function accepted(f){f.api.update([{id:'accepted-1',number:1,itemId:'A0ResearchFacility',x:5,y:5,status:'travelling'}],catalog);}
function overlayInputs(f){const r=f.api.report();return clone({acceptedSites:r.acceptedSites,preview:r.preview,previewPoint:r.previewPoint,linePreview:r.linePreview,moduleItem:r.moduleItem,moduleTargets:r.moduleTargets.map(({id,itemId,status,eligible,x,y})=>({id,itemId,status,eligible,x,y})),demolition:f.api.demolitionReport()});}
function bind(f,api){f.window.__warzoneIntelligence={isOpen:api.isOpen,report(){throw Error('The render loop must not clone full Intelligence history');}};}
function cleanFrame(f){f.draws.length=0;f.frame();return clone(f.draws);}
function noOverlay(f,phase){const paints=cleanFrame(f);assert.deepEqual(paints.filter(v=>v!=='clear'),[],phase+' must not paint into the transparent native model area');assert.equal(f.api.report().drawn.length,0);assert.equal(f.api.report().moduleDrawn.length,0);}
(async()=>{
 await check('preserved v0.37 source reproduces construction #1 leaking through an open Intelligence preview',async()=>{
  const ui=intelligence(),api=ui.window.__warzoneIntelligence;await ui.run(api.open('R-Cannon'));await ui.advance(80);assert.equal(api.isOpen(),true);
  const old=await renderer(prior);accepted(old);bind(old,api);const paints=cleanFrame(old);assert.ok(paints.includes('#1'),'the old real renderer still paints the accepted-site label while Intelligence is open');assert.equal(old.api.report().drawn[0].id,'accepted-1');
 });
 await check('new real renderer clears accepted labels, ghosts, module and demolition marks throughout opening/open/closing and failed close',async()=>{
  const ui=intelligence(),api=ui.window.__warzoneIntelligence,render=await renderer(current);bind(render,api);accepted(render);
  render.api.preview(item('GuardTower1'),{x:5,y:5,validation:'valid'});render.api.setModuleTargets([lab],catalog,item('A0ResearchModule1'));render.api.setDemolitionTargets([{...lab,moduleId:'',eligible:true}],catalog,[]);render.api.highlightDemolition(lab.id);
  const inputs=overlayInputs(render),camera=JSON.stringify(render.view);const painted=cleanFrame(render);assert.ok(painted.includes('#1'));assert.ok(render.api.report().drawn.some(r=>r.id==='preview'));assert.equal(render.api.report().moduleDrawn.length,1);assert.ok(painted.includes('outline'));
  ui.held.add('open');const opening=api.open('R-Cannon');await ui.advance(20);assert.equal(api.report().opening,true);assert.equal(api.isOpen(),true);noOverlay(render,'opening');assert.equal(render.api.pickDemolitionTarget(400,300),null);
  ui.respond(ui.requests.at(-1));assert.equal(await ui.run(opening),true);await ui.advance(80);assert.equal(api.report().open,true);noOverlay(render,'open');
  ui.held.add('close');const closing=api.close();await ui.advance(20);assert.equal(api.report().closing,true);assert.equal(api.isOpen(),true);noOverlay(render,'closing');
  const closeRequest=ui.requests.at(-1);assert.equal(closeRequest.action,'close');ui.respond(closeRequest,{nonce:closeRequest.nonce,ok:false,error:'Keep preview covered'});assert.equal(await ui.run(closing),false);assert.equal(api.report().open,true);assert.equal(api.isOpen(),true);noOverlay(render,'failed-close retention');assert.equal(ui.document.getElementById('wt-intelligence-scrim').hidden,false);
  assert.deepEqual(overlayInputs(render),inputs,'hiding the overlay must retain every accepted site, preview, module target and demolition target');
  ui.held.delete('close');assert.equal(await ui.run(api.close()),true);assert.equal(api.isOpen(),false);assert.equal(JSON.stringify(render.view),camera,'camera never moves during open/close');
  const restored=cleanFrame(render);assert.ok(restored.includes('#1'),'same-camera close forces repaint of the preserved accepted site');assert.ok(render.api.report().drawn.some(r=>r.id==='preview'));assert.equal(render.api.report().moduleDrawn.length,1);assert.deepEqual(overlayInputs(render),inputs);
 });
 await check('line-placement previews are hidden without being cancelled and redraw after close at the same camera',async()=>{
  const f=await renderer(current);let open=false;f.window.__warzoneIntelligence={isOpen:()=>open};const points=[{x:5,y:5,validation:'valid'},{x:6,y:5,validation:'valid'}];assert.equal(f.api.previewLine(item('GuardTower1'),points),true);cleanFrame(f);const before=overlayInputs(f);assert.equal(f.api.report().drawn.length,2);
  open=true;noOverlay(f,'line preview while Intelligence is shown');assert.deepEqual(overlayInputs(f),before);open=false;cleanFrame(f);assert.equal(f.api.report().drawn.length,2);assert.deepEqual(overlayInputs(f),before);
 });
 await check('demolition-only targeting outlines stay concealed during Intelligence and remain available afterward',async()=>{
  const f=await renderer(current);let open=false;f.window.__warzoneIntelligence={isOpen:()=>open};f.api.setDemolitionTargets([{...lab,moduleId:''}],catalog,[]);f.api.highlightDemolition(lab.id);assert.ok(cleanFrame(f).includes('outline'));const before=overlayInputs(f);
  open=true;noOverlay(f,'demolition-only targeting');assert.deepEqual(overlayInputs(f),before);open=false;assert.ok(cleanFrame(f).includes('outline'));assert.deepEqual(overlayInputs(f),before);
 });
 await check('actual Intelligence isOpen remains truthful through cancelled asynchronous open and close',async()=>{
  const ui=intelligence(),api=ui.window.__warzoneIntelligence;assert.equal(api.isOpen(),false);ui.held.add('open');const opening=api.open('R-MG');await ui.advance(20);assert.equal(api.report().opening,true);assert.equal(api.isOpen(),true);
  const closing=api.close();assert.equal(api.isOpen(),true);assert.equal(await ui.run(closing),true);assert.equal(await ui.run(opening),false);assert.equal(api.isOpen(),false);assert.equal(api.report().open,false);assert.equal(api.report().opening,false);assert.equal(api.report().closing,false);
 });
 await check('without Intelligence and in Duel the same accepted-site rendering stays equivalent to v0.37',async()=>{
  for(const duel of [false,true]){const before=await renderer(prior),after=await renderer(current);if(duel){before.window.__warzoneDuelConfig={mode:'duel'};after.window.__warzoneDuelConfig={mode:'duel'};}accepted(before);accepted(after);assert.deepEqual(cleanFrame(after),cleanFrame(before));assert.deepEqual(clone(after.api.report().drawn),clone(before.api.report().drawn));assert.ok(after.draws.includes('#1'));}
 });
 const proof={version:'0.38',passed:true,emulatorUsed:false,gameplayVerified:false,recordedUTC:new Date().toISOString(),scope:'Actual Canvas renderer and Intelligence modules in established DOM/native-transport fixtures; verifies overlay concealment and preserved render inputs only, without gameplay or emulator execution',checks,
  reproducedBaseline:{version:'0.37',sourceZIP:baselineZIP,entry:rendererPath,rendererSHA256:hash(prior),leakedLabel:'#1'},sources:[rendererPath,intelligencePath,'tools/check-overlay-leak-038.cjs'].map(p=>({path:p,sha256:hash(fs.readFileSync(p))})),reusedFixtures:['tools/test-module-target-display.cjs','tools/check-intelligence-ui-036.cjs']};
 fs.mkdirSync('qa/0.38-overlay-leak',{recursive:true});fs.writeFileSync('qa/0.38-overlay-leak/regression.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,emulatorUsed:false,gameplayVerified:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
