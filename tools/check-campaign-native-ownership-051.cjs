'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./check-campaign-js-051.cjs');
const ROOT=path.resolve(__dirname,'..'),COMMANDS='app/src/main/assets/warzone-command-pages.js',HUD='app/src/main/assets/warzone-campaign-hud.js';
const source=fs.readFileSync(path.join(ROOT,COMMANDS),'utf8'),checks=[];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
function closeFixture(campaign,nativeActive){
 const calls=[],state={nativeMenu:'',nativeMenuPending:false,nativeClosePromise:null};
 const context=vm.createContext({campaign,state,Promise,
  window:{__warzoneCampaign:{nativeUiActive:()=>nativeActive,closeNativeUi:()=>calls.push('escape')},__kalaWarzoneTouch:{report:()=>({pendingClicks:0}),releaseAll:()=>calls.push('release')}},
  revealNativePause:()=>calls.push('reveal'),setNativeHudHidden:()=>{calls.push('restore-owned-hud');return Promise.resolve({ok:true});},
  send:()=>{calls.push('native-command');return Promise.resolve({ok:true});}});
 const start=source.indexOf('  function closeNative('),end=source.indexOf('  function requestState(',start);
 assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),context);
 return{calls,close:context.closeNative};
}
function hudFixture(){
 const h=harness(),nodes=new Map(),node=()=>({style:{},inert:false,hidden:false,classList:{toggle(){}},setAttribute(){}});
 for(const id of ['blocknight-combat-hud','wt-campaign-all-combat','wt-campaign-native-back','wt-field-centre','wt-field-toggle','lab-ops','wt-status-panel'])nodes.set(id,node());
 h.document.getElementById=id=>nodes.get(id)||null;h.run('warzone-campaign-hud.js');
 return{h,nodes,api:h.window.__warzoneCampaign};
}
async function main(){
 await check('Generic Campaign cleanup preserves foreign native UI without Escape or a native close command',async()=>{
  const f=closeFixture(true,true);assert.equal((await f.close(true)).ok,true);assert.deepEqual(f.calls,['reveal']);
 });
 await check('Ordinary Campaign and Towers cleanup retain their existing owned-HUD return path',async()=>{
  for(const [campaign,native]of[[true,false],[false,true],[false,false]]){const f=closeFixture(campaign,native);await f.close(true);assert.deepEqual(f.calls,['restore-owned-hud']);}
 });
 await check('Explicit Campaign Back still dismisses a native panel with Escape',()=>{
  const f=hudFixture();f.h.frame({worldSafe:false,paused:true,intelligenceOpen:true});f.api.poll();
  assert.equal(f.api.handleBack(),true);assert.equal(f.h.calls.filter(c=>c[0]==='key'&&c[1]==='Escape').length,1);
 });
 await check('Native video hides and disables the complete footer before the first mission snapshot',()=>{
  const f=hudFixture();f.h.frame({worldSafe:false,video:true,paused:true,playing:false});f.api.poll();
  for(const id of ['wt-field-centre','wt-field-toggle','lab-ops','wt-status-panel']){assert.equal(f.nodes.get(id).style.visibility,'hidden',id);assert.equal(f.nodes.get(id).inert,true,id);}
  assert.equal(f.nodes.get('wt-campaign-native-back').hidden,true);
 });
 await check('Intel and mission panels retain footer ownership across independent hidden updates and restore it on return',()=>{
  const f=hudFixture();f.api.poll();f.api.accept({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:2000});
  for(const patch of[{worldSafe:false,intelligenceOpen:true},{intelligenceOpen:false,transportOpen:true},{transportOpen:false,paused:true}]){
   f.h.frame(patch);f.api.poll();
   for(const id of ['lab-ops','wt-status-panel']){const node=f.nodes.get(id);node.hidden=false;assert.equal(node.style.visibility,'hidden');assert.equal(node.inert,true);}
   assert.equal(f.nodes.get('wt-campaign-native-back').hidden,false);
  }
  f.h.frame({worldSafe:true,intelligenceOpen:false,transportOpen:false,paused:false,video:false});f.api.poll();
  for(const id of ['wt-field-centre','wt-field-toggle','lab-ops','wt-status-panel']){assert.equal(f.nodes.get(id).style.visibility,'',id);assert.equal(f.nodes.get(id).inert,false,id);}
  assert.equal(f.nodes.get('wt-campaign-native-back').hidden,true);
 });
 const result={version:'0.51',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
  scope:'Actual Campaign native-ownership controller functions in controlled VM fixtures. Native Intel and screen behavior require the delivery emulator check.',
  sources:[COMMANDS,HUD,'tools/check-campaign-native-ownership-051.cjs'].map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(ROOT,file)))})),recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(ROOT,'archive/campaign-native-ownership-js-0.51-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
