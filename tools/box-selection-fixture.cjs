'use strict';
// Test-only native renderer oracle: centres are off-centre within whole script
// tiles. The same physical camera projects full volumes, never guessed clicks.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
function fixture(options={}){
 const units=[
  {id:160001,x:8,y:70,z:3,sx:591,sy:302,constructor:true},
  {id:160003,x:7,y:70,z:3,sx:554,sy:301,constructor:true},
  {id:3,x:30,y:30,z:3,sx:1100,sy:300,constructor:true},
  {id:4,x:8,y:70,z:3,sx:100,sy:300,constructor:true},
  {id:5,x:8,y:70,z:3,sx:900,sy:450,constructor:true},
  {id:6,x:8,y:70,z:3,sx:300,sy:510,constructor:true},
  {id:7,x:8,y:70,z:3,sx:600,sy:590,constructor:true},
 ];
 if(options.mixed)units.push({id:201,x:8,y:70,z:3,sx:605,sy:301,constructor:false},{id:202,x:7,y:70,z:3,sx:552,sy:340,constructor:false});
 if(options.overlap)units.push({id:203,x:8,y:70,z:3,sx:591,sy:302,constructor:false});
 if(options.empty)for(const u of units.slice(0,2))u.sx=-50;
 function place(u,x=u.sx,y=u.sy){u.sx=x;u.sy=y;u.position=[(x-200)/37*128,(y-100+6.75)/25*128,384];u.x=Math.floor(u.position[0]/128);u.y=Math.floor(u.position[1]/128);u.z=3;}
 for(const u of units){u.order=0;u.action=0;u.queued=u.constructor?2:0;place(u);}
 let selected=[3],ended=false,player=0,context,held=null,holdNext=Boolean(options.hold),background=false;
 const boxes=[],requests=[],handled=new Set(),notices=[],unsafeMoves=[];
 const state={pending:new Map(),serial:0,selectionSerial:0,selectionEventSerial:0,autoSelectionRevision:0,nativeBuildGroup:[],selectionPromise:null,
  buildOpen:true,buildParticipants:[],nativePendingSites:[],modulePending:new Map(),moduleSerial:0,navigationSerial:0,menuRevision:0,cancelSerial:0,siteChecks:0,placements:0,page:'',notice:''};
 const snapshot=()=>({player,mapWidth:63,mapHeight:79,gameTime:1000,trucks:units.filter(u=>u.constructor).map(u=>({...u,selected:selected.includes(u.id)})),selectedUnits:units.filter(u=>selected.includes(u.id)).map(u=>({...u,selected:true}))});
 state.snapshot=snapshot();
 function node(rect={},extra={}){return{hidden:false,style:{},css:{display:'block',visibility:'visible'},closest:()=>null,getBoundingClientRect:()=>({x:rect.left||0,y:rect.top||0,width:(rect.right||0)-(rect.left||0),height:(rect.bottom||0)-(rect.top||0),...rect}),...extra};}
 const nodes=new Map([
  ['warzone-game-frame',node({left:0,top:60,right:1000,bottom:660})],
  ['wt-build-sidebar',node({left:6,top:60,right:250,bottom:660})],
  ['wt-field-centre',node({left:270,top:550,right:450,bottom:590})],
  ['wt-sidebar-notice',node({}, {hidden:true})],['wt-command-toast',node({}, {hidden:true})]
 ]);
 const bounds={left:0,top:0,right:1000,bottom:576,radar:{left:800,top:380,right:990,bottom:570}};
 const camera={manualSelectionRevision:0};
 const touch={releaseAll(){if(held){held(false);held=null;}},resumeInput(){},report:()=>({...camera,pendingClicks:0,queuedPointerEvents:0}),nativeSelectionBounds:()=>bounds,
  nativeWorldClick(){throw Error('Selection must not click guessed world points or give ground orders');},
  nativeBoxSelect:async(left,top,right,bottom,add)=>{
   boxes.push({left,top,right,bottom,add});
   if(holdNext){holdNext=false;const released=await new Promise(resolve=>held=resolve);held=null;if(released===false)return false;}
   // Reject genuinely sub-threshold rectangles in the oracle fixture; SDL's
   // separate rapid-press/double-click behavior is tested by the input model.
   if(right-left<8||bottom-top<8){for(const u of units)if(selected.includes(u.id)){u.order=2;unsafeMoves.push({id:u.id,x:right,y:bottom});}return true;}
   if(options.background&&!background){background=true;context.send('state');}
   const inside=units.filter(u=>u.sx>=left&&u.sx<=right&&u.sy>=top&&u.sy<=bottom).map(u=>u.id);
   selected=add?[...new Set([...selected,...inside])]:inside;return true;
  }};
 const send=(action,data={})=>{requests.push({action,data});if(action==='state')return Promise.resolve({ok:true,result:snapshot()});return Promise.resolve({ok:true,result:{...data,workers:data.workerIds}});};
 const flush=()=>{
  for(const [nonce,entry]of state.pending){if(handled.has(nonce))continue;handled.add(nonce);requests.push({action:entry.command.action,data:entry.command});const result=snapshot();setImmediate(()=>{state.pending.delete(nonce);state.snapshot=result;entry.resolve({ok:true,result});});}
 };
 context=vm.createContext({state,Date,Promise,Map,Set,Number,Math,flush,innerWidth:1000,innerHeight:600,
  setTimeout:(fn,ms)=>ms===4500?0:setTimeout(fn,ms),clearTimeout,setInterval,clearInterval,element:id=>nodes.get(id)||null,
  host:{innerWidth:1000,innerHeight:660,getComputedStyle:e=>e.css},doc:{body:{dataset:{}}},
  window:{__towersHtml:{isEnded:()=>ended},__kalaWarzoneTouch:touch,WarzoneTerrain:{active(){},async refresh(timeout,cameraOnly){assert.equal(cameraOnly,true,'truck selection observes the camera without reading terrain geometry');return true;},project(x,y,z){return{x:x/128*37+200,y:y/128*25+100-z/128*2};}},WarzoneBuildDisplay:{clearPreview(){},reject(){}}},
  document:{getElementById:()=>({setAttribute(){},querySelector(){return null;}})},
  availableBuildings:()=>[{id:'PillBox1'},{id:'GuardTower1'}],renderSidebar(){},updateHUD(){},updateSidebarQueue(){},reconcileModuleRequests(){},requestState(){},previewAt:(x,y)=>({x,y}),reason:x=>x,send});
 vm.runInContext(source.slice(source.indexOf('  function notify('),source.indexOf('  function image(')),context);
 const actualNotify=context.notify;context.notify=message=>{notices.push(message);actualNotify(message);};
 if(options.actualSend)vm.runInContext(source.slice(source.indexOf('  function send('),source.indexOf('  function flush(')),context);
 vm.runInContext(source.slice(source.indexOf('  function selectedBuildGroup('),source.indexOf('  async function openBuild(')),context);
 vm.runInContext(source.slice(source.indexOf('  function beginPlacement('),source.indexOf('  function nativeBuildTap(')),context);
 vm.runInContext(source.slice(source.indexOf('  function placeAt('),source.indexOf('  let validationTimer;')),context);
 return{context,state,units,boxes,requests,notices,nodes,bounds,camera,unsafeMoves,snapshot,moveScreen:(id,x,y)=>place(units.find(u=>u.id===id),x,y),setPlayer:value=>player=value,selected:()=>selected,
  release:()=>{assert.ok(held,'a native rectangle is held');held(true);},
  manual:ids=>{selected=ids;state.snapshot=snapshot();state.selectionEventSerial++;camera.manualSelectionRevision++;},
  cancel:()=>{state.selectionSerial++;touch.releaseAll(true);},end:()=>{ended=true;state.selectionSerial++;touch.releaseAll(true);}};
}
module.exports={fixture,source};
