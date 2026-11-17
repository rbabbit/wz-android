'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
// Retained harness only; legacy pan suite is not part of this focused check.
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
module.exports={harness};
