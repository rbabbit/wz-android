'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture:touchFixture,readRelease}=require('./check-touch-pan-050.cjs');
const ROOT=path.resolve(__dirname,'..'),ASSETS=path.join(ROOT,'app/src/main/assets');
const source=name=>fs.readFileSync(path.join(ASSETS,name),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const names=['warzone-html-session.js','warzone-touch-controls.js','warzone-command-pages.js','warzone-mobile-research.js','warzone-intelligence.js','warzone-campaign-hud.js','warzone/saved-games.js'];
function harness(options={}){
 let now=10000;const values=new Map(),listeners=new Map(),intervals=[],calls=[];
 const native={mode:'campaign',nativeLevel:'CAM_1A',playing:true,worldSafe:true,paused:false,video:false,nativeMenuOpen:false,transportOpen:false,intelligenceOpen:false,gameTime:2000};
 values.set('/tmp/warzone-campaign-state-v51.json',JSON.stringify(native));
 const filesystem={readFile(p,opts){if(!values.has(p))throw Error('ENOENT '+p);const value=values.get(p);return opts?.encoding?value:typeof value==='string'?new TextEncoder().encode(value):value;},writeFile(p,v){values.set(p,v);},rename(a,b){values.set(b,values.get(a));values.delete(a);},mkdirTree(){},readdir(){return[];}};
 const document={getElementById:()=>null,addEventListener:(name,fn)=>{listeners.set('doc:'+name,fn);},head:{appendChild(){}},body:{dataset:{}},activeElement:null};
 const commandState={page:'',buildOpen:false,placement:false,selectingTrucks:false,nativeMenu:''};
 const touchState={gestureActive:false,pendingClicks:0,panPhase:'idle'};
 const window={__warzoneCampaignMode:true,document,parent:null,LaunchedModule:{calledRun:true,FS:filesystem,WZVAL_configDirPath:'/warzone2100-campaign'},
  __warzoneCommands:{report:()=>commandState,resetSession:()=>calls.push(['reset-commands']),revealNativePause:()=>calls.push(['reveal-native']),close:()=>Promise.resolve(),afterBuildExit:fn=>Promise.resolve(fn()),send:async action=>{calls.push(['command',action]);const control=JSON.parse(values.get('/data/base/script/campaign/mobile/campaign-control.json'));return control.enabled&&!control.suspended&&native.worldSafe?{ok:true,result:{count:4,selectedIds:[1,2,3,4]}}:{ok:false,reason:'selection-suspended'};}},
  __blockNightResearch:{report:()=>({open:false,opening:false}),resetSession:()=>calls.push(['reset-research']),revealNativePause:()=>calls.push(['reveal-research']),close(){}},
  __kalaWarzoneTouch:{report:()=>touchState,releaseAll:(...args)=>calls.push(['release',...args]),showCombatHud:()=>calls.push(['show-hud']),setBattleActive:value=>calls.push(['active',value]),nativePressKey:(...args)=>{calls.push(['key',...args]);return true;},closeHelp(){}},
  WarzoneSavedGames:{ready:true,busy:false},BlockNightAndroid:{},
  __towersHtml:{session:'document_1',activate:value=>{calls.push(['activate',value.mode]);return true;}},
  addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},dispatchEvent:event=>{for(const fn of listeners.get(event.type)||[])fn(event);return true;},
  constructWZModuleConfig:()=>({arguments:['--game=CAM_1A','--configdir=/warzone2100-campaign'],preRun:[]}),
  wz_js_get_config_dir_path:()=>'/warzone2100-campaign',wz_js_save_config_dir_to_persistent_storage:(user,cb)=>cb?.()};
 window.parent=window;
 class Event{constructor(type,options={}){this.type=type;Object.assign(this,options);}}
 const context=vm.createContext({window,document,location:{search:'?mode=campaign&battle_session=document_1'},URLSearchParams,
  CustomEvent:Event,KeyboardEvent:Event,TextEncoder,TextDecoder,Uint8Array,Map,Set,Promise,JSON,Number,Math,Error,
  Date:class extends Date{static now(){return now;}},performance:{now:()=>now},
  atob:value=>Buffer.from(value,'base64').toString('binary'),btoa:value=>Buffer.from(value,'binary').toString('base64'),
  setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout:fn=>{calls.push(['timeout',fn]);return 1;},clearTimeout(){},
  console:{log(){},warn(){},error(){}}});
 return{window,document,context,values,filesystem,native,commandState,touchState,calls,listeners,
  run:name=>vm.runInContext(source(name),context,{filename:name}),advance:ms=>now+=ms,
  frame:patch=>{Object.assign(native,patch);values.set('/tmp/warzone-campaign-state-v51.json',JSON.stringify(native));},
  settle:async()=>{for(let i=0;i<8;i++)await Promise.resolve();}};
}
const checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
async function main(){
 await check('All changed JavaScript parses; accepted v0.50 pan functions remain exactly unchanged',()=>{
  for(const name of names)new vm.Script(source(name),{filename:name});
  const before=readRelease('0.50').replace(/\r\n/g,'\n'),after=source('warzone-touch-controls.js').replace(/\r\n/g,'\n');
  const fn=(text,name)=>{const start=text.indexOf('  function '+name+'(');assert.ok(start>=0,name);const end=text.indexOf('\n  function ',start+1);return text.slice(start,end<0?text.length:end).trim();};
  for(const name of ['advancePan','panPoint','clearPanMove','flushPanMove','schedulePanMove','clearPanReleaseCallbacks','panPhase','releasePanEndpoint','schedulePanRelease','advancePanRelease','finishFramePan','cancelFramePan','deferPanPointer','pumpPanPointerQueue','beginPan','handleMultiMove','endMultiIfNeeded'])assert.equal(fn(after,name),fn(before,name),name);
 });
 await check('Towers actual adapter keeps ordinary and rapid native pan lifecycle under both RAF orders',async()=>{
  for(const nativeFirst of[false,true]){const f=touchFixture(undefined,{nativeFirst,normalizeMiddleDoubleClick:true});f.fire('pointerdown',300,220);f.fire('pointermove',380,250);await f.frames(2);f.fire('pointerup',400,260);f.fire('pointerdown',600,300);f.fire('pointermove',640,320);f.fire('pointerup',660,330);await f.frames(12);assert.equal(f.native.panStarts,2);assert.equal(f.api.report().panPhase,'idle');assert.ok(f.native.frames.some(s=>s.panActive&&s.anchor.x===600));}
 });
 await check('Campaign native panel touches stay UI clicks and cannot pan or zoom',async()=>{
  const script="window.__warzoneCampaignMode=true;window.__warzoneCampaign={nativeUiActive:()=>true};\n"+source('warzone-touch-controls.js');
  const f=touchFixture(script);f.fire('pointerdown',300,220);f.fire('pointermove',380,250);f.fire('pointerup',380,250);await f.frames(4);assert.equal(f.api.report().pans,0);
  const g=touchFixture(script);g.fire('pointerdown',300,220);g.fire('pointerup',300,220);await g.frames(15);assert.equal(g.events.filter(e=>e.type==='pointerdown'&&e.button===0).length,1);assert.equal(g.api.report().pans,0);
 });
 await check('Campaign world input uses the same accepted pan while native overlays are absent',async()=>{
  const script="window.__warzoneCampaignMode=true;window.__warzoneCampaign={nativeUiActive:()=>false};\n"+source('warzone-touch-controls.js');
  const f=touchFixture(script, {normalizeMiddleDoubleClick:true});f.fire('pointerdown',300,220);f.fire('pointermove',380,250);await f.frames(2);f.fire('pointerup',400,260);await f.frames(6);assert.equal(f.native.panStarts,1);assert.equal(f.api.report().panPhase,'idle');
 });
 await check('Campaign session accepts mission packets without rewards, preserves transitions and consumes campaign command paths',()=>{
  const h=harness();let rewards=0;h.window.BlockNightAndroid.rewardProgress=()=>rewards++;h.window.BlockNightAndroid.battleFinished=()=>{throw Error('A mission transition must not become Towers defeat');};
  h.window.__towersHtml=undefined;
  h.run('warzone-html-session.js');h.window.__towersHtml.nativeOutput('BNCAMPAIGN:'+JSON.stringify({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:0,ended:false}));
  assert.equal(h.window.__towersHtml.isActive(),true);assert.equal(h.window.__towersHtml.report().mode,'campaign');assert.equal(rewards,0);
  h.window.__towersHtml.nativeOutput('BNCAMPAIGN:'+JSON.stringify({mode:'campaign',session:'cam1b_2',mission:'cam1b',gameTime:10,ended:true}));assert.equal(h.window.__towersHtml.isEnded(),false);
  const p='/data/base/script/campaign/mobile/warzone-towers-command.json';h.values.set(p,JSON.stringify({revision:'r1',commands:[{}]}));h.window.__towersHtml.consume('warzone-towers-command.json',null,'r1');assert.equal(JSON.parse(h.values.get(p)).commands.length,0);
 });
 await check('Delayed native preload never creates or overwrites its campaign control file before calledRun and a native frame',()=>{
  const h=harness();h.window.Module=h.window.LaunchedModule;h.window.Module.calledRun=false;h.window.LaunchedModule=undefined;
  const path='/data/base/script/campaign/mobile/campaign-control.json';h.run('warzone-campaign-hud.js');const api=h.window.__warzoneCampaign;
  api.poll();api.toggleAllCombat(true);assert.equal(h.values.has(path),false);assert.equal(h.calls.filter(c=>c[0]==='command').length,0);
  h.values.set(path,'{}');h.window.Module.calledRun=true;api.poll();assert.equal(JSON.parse(h.values.get(path)).enabled,true);
 });
 await check('ALL COMBAT intent persists and refreshes new combat selection, with immediate native control suspension and off state',async()=>{
  const h=harness();h.run('warzone-campaign-hud.js');const api=h.window.__warzoneCampaign;api.poll();api.accept({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:2000});api.toggleAllCombat(true);await h.settle();assert.equal(api.report().selectedCount,4);
  h.advance(600);api.poll();await h.settle();assert.ok(api.report().selectionRequests>=2);
  h.frame({worldSafe:false,transportOpen:true,nativeMenuOpen:true});api.poll();assert.equal(api.report().suspended,true);assert.equal(JSON.parse(h.values.get('/data/base/script/campaign/mobile/campaign-control.json')).suspended,true);
  api.toggleAllCombat(false);assert.equal(JSON.parse(h.values.get('/data/base/script/campaign/mobile/campaign-control.json')).enabled,false);
 });
 await check('Owned native Build remains placeable while ALL selection stays suspended; native tutorial/Intel still owns input',()=>{
  const h=harness();h.run('warzone-campaign-hud.js');const api=h.window.__warzoneCampaign;api.poll();api.accept({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:2000});
  h.commandState.buildOpen=true;h.commandState.nativeMenu='build';h.frame({worldSafe:false,nativeMenuOpen:true,nativeMode:3});api.poll();assert.equal(api.nativeUiActive(),false);assert.equal(api.report().suspended,true);
  h.frame({paused:true,intelligenceOpen:true});api.poll();assert.equal(api.nativeUiActive(),true);assert.equal(api.handleBack(),true);assert.ok(h.calls.some(c=>c[0]==='key'&&c[1]==='Escape'));
 });
 await check('Native playing/video enables input before first timed mission snapshot; mission changes reset obsolete UI queues',()=>{
  const h=harness();h.frame({worldSafe:false,paused:true});h.run('warzone-campaign-hud.js');const api=h.window.__warzoneCampaign;api.poll();assert.ok(h.calls.some(c=>c[0]==='active'&&c[1]===true));assert.equal(api.handleBack(),true);
  api.accept({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:0});api.accept({mode:'campaign',session:'cam1b_2',mission:'cam1b',gameTime:0});assert.equal(h.calls.filter(c=>c[0]==='reset-commands').length,2);assert.equal(h.calls.filter(c=>c[0]==='reset-research').length,2);
 });
 await check('Campaign restore uses campaign storage/CLI and remains restoring until actual native level and clock verify',async()=>{
  const h=harness(),id='wt_'+'a'.repeat(32),gam={levelName:'CAM_1A',gameTime:1000};
  const values=Object.fromEntries(['gam.json','main.json','gameinfo.json','scriptstate.json','game.map'].map(name=>[name,Buffer.from(name==='gam.json'?JSON.stringify(gam):'{}').toString('base64')]));
  h.window.WarzoneSavedGames=undefined;h.window.BlockNightAndroid.campaignSavePayload=()=>JSON.stringify({metadata:{id,mode:'campaign',session:'cam1a_1',nativeLevel:'CAM_1A',mission:'cam1a',gameTime:1000},files:values});
  let restored=0;h.window.BlockNightAndroid.campaignSaveRestored=(session,slot,proof)=>{assert.equal(session,'document_1');assert.equal(slot,id);assert.equal(JSON.parse(proof).nativeLevel,'CAM_1A');restored++;return true;};
  h.run('warzone/saved-games.js');assert.equal(h.window.WarzoneSavedGames.restoring,true);assert.equal(h.window.WarzoneSavedGames.ready,false);
  const config=h.window.constructWZModuleConfig();assert.ok(config.arguments.includes('--loadcampaign='+id));assert.ok(!config.arguments.some(value=>value.startsWith('--game=')));
  const m={FS:h.filesystem,WZVAL_configDirPath:'/warzone2100-campaign',removeRunDependency(){}};for(const fn of config.preRun)fn(m);m.removeRunDependency('persistent_warzone2100_config_dir');
  assert.ok(h.values.has('/warzone2100-campaign/savegames/campaign/'+id+'/gam.json'));
  h.frame({nativeLevel:'CAM_1B'});assert.equal(await h.window.WarzoneSavedGames.resumeCampaign({mission:'cam1a'}),false);assert.equal(h.window.WarzoneSavedGames.restoring,true);
  h.frame({nativeLevel:'CAM_1A'});assert.equal(await h.window.WarzoneSavedGames.resumeCampaign({mission:'cam1a'}),true);assert.equal(restored,1);assert.equal(h.window.WarzoneSavedGames.ready,true);
 });
 await check('Campaign restore rejects a Towers archive and malformed save identity without accepting reward globals',()=>{
  const h=harness();h.window.WarzoneSavedGames=undefined;h.window.BlockNightAndroid.campaignSavePayload=()=>JSON.stringify({metadata:{mode:'tower-defense',id:'wt_'+'b'.repeat(32)},files:{}});h.run('warzone/saved-games.js');assert.equal(h.window.WarzoneSavedGames.ready,false);assert.match(h.window.WarzoneSavedGames.report().error,/identity/);
 });
 const result={version:'0.51',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
  scope:'Actual JS input and controller VM checks; actual campaign gameplay, native media and save creation are verified separately by the delivery emulator journey.',
  sources:[...names.map(name=>({path:'app/src/main/assets/'+name,sha256:sha(source(name))})),{path:'tools/check-campaign-js-051.cjs',sha256:sha(fs.readFileSync(__filename))}],recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(ROOT,'archive/campaign-js-0.51-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={harness};
