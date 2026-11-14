'use strict';
// Actual adapter classification and native-event paths with native-observer
// fixtures. Does not execute native radar rendering or Android input.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const {fixture}=require('./check-touch-pan-050.cjs');
const ROOT=path.resolve(__dirname,'..'),FILE='app/src/main/assets/warzone-touch-controls.js';
const text=fs.readFileSync(path.join(ROOT,FILE),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const radar=(patch={})=>({visible:true,centerX:880,centerY:480,width:159,height:192,inverseCos:1,inverseSin:0,rotation:0,viewportWidth:1000,viewportHeight:600,...patch});
function campaign(value,options={}){
 const prefix='window.__warzoneCampaignMode=true;window.__warzoneCampaign={nativeUiActive:()=>false,report:()=>({nativeState:{radar:'+JSON.stringify(value)+'}})};\n';
 return fixture(prefix+text,options);
}
const checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
async function main(){
 new vm.Script(text,{filename:FILE});
 const nativeFiles=['archive/native-campaign-0.51/radar-radar.cpp','archive/native-campaign-0.51/radar-hci.cpp','archive/native-campaign-0.51/radar-source-overlay.json','archive/native-campaign-0.51/radar-native-build.json'];
 await check('Native observation schema and source hashes match the successful guarded native radar build',()=>{
  const radarSource=fs.readFileSync(path.join(ROOT,nativeFiles[0]),'utf8'),hciSource=fs.readFileSync(path.join(ROOT,nativeFiles[1]),'utf8');
  const overlay=JSON.parse(fs.readFileSync(path.join(ROOT,nativeFiles[2]),'utf8')),build=JSON.parse(fs.readFileSync(path.join(ROOT,nativeFiles[3]),'utf8'));
  assert.equal(overlay.guardPassed,true);assert.equal(build.passed,true);
  assert.equal(overlay.sources['radar.cpp'].after,sha(radarSource));assert.equal(overlay.sources['hci.cpp'].after,sha(hciSource));
  for(const field of['visible','centerX','centerY','width','height','inverseCos','inverseSin','viewportWidth','viewportHeight'])assert.ok(radarSource.includes('"'+field+'"'));
  assert.match(radarSource,/!loop_GetVideoStatus\(\) && !gameUpdatePaused\(\)/);assert.match(radarSource,/pRadarWidget->visible\(\) && radarVisible\(\)/);
  assert.match(hciSource,/"radar",nlohmann::json::parse\(campaignMobileRadarStateJSON\(\)\)/);
 });
 await check('Invisible campaign radar leaves all bottom-right battlefield input available and excludes no selection area',async()=>{
  const f=campaign(radar({visible:false}));assert.equal(f.api.isBattlefieldPoint(900,500),true);assert.equal(f.api.nativeSelectionBounds().radar,null);
  f.fire('pointerdown',900,500);f.fire('pointermove',920,500);await f.frames(2);f.fire('pointerup',930,500);await f.frames(5);assert.equal(f.native.panStarts,1);assert.equal(f.events.filter(e=>e.type==='pointerdown'&&e.button===2).length,0);
 });
 await check('Alpha scroll-aspect radar uses the observed 159×192 rectangle, independently of full 128×128 terrain dimensions',async()=>{
  const f=campaign(radar());f.commands.report=()=>({snapshot:{mapWidth:128,mapHeight:128,facilityTargets:[],trucks:[],selectedUnits:[]}});
  assert.equal(f.api.isBattlefieldPoint(880,480),false);assert.equal(f.api.isBattlefieldPoint(790,480),true);
  const box=f.api.nativeSelectionBounds().radar;assert.equal(box.left,797.5);assert.equal(box.right,962.5);assert.equal(box.top,381);assert.equal(box.bottom,579);
  f.fire('pointerdown',880,480);f.fire('pointerup',880,480);await f.frames(15);assert.equal(f.events.filter(e=>e.type==='pointerdown'&&e.button===2).length,1);
  const g=campaign(radar());g.fire('pointerdown',790,480);g.fire('pointerup',790,480);await g.frames(15);assert.equal(g.events.filter(e=>e.type==='pointerdown'&&e.button===0).length,1);
 });
 await check('Native inverse rotation coefficients reject corners of the radar bounding box while retaining real rotated hits',()=>{
  const coefficient=46340/65536,f=campaign(radar({width:160,height:100,inverseCos:coefficient,inverseSin:-coefficient,rotation:12345}));
  assert.equal(f.api.isBattlefieldPoint(880,480),false);assert.equal(f.api.isBattlefieldPoint(950,480),false);
  assert.equal(f.api.isBattlefieldPoint(800,400),true);assert.equal(f.api.isBattlefieldPoint(970,480),true);
  const box=f.api.nativeSelectionBounds().radar;assert.ok(box.left<789&&box.top<389&&box.right>971&&box.bottom>571);
  // Selection deliberately excludes a conservative box, but world touches
  // use the actual inverse-rotated rectangle rather than that larger box.
  assert.ok(800>box.left&&400>box.top);assert.equal(f.api.isBattlefieldPoint(800,400),true);
 });
 await check('Unrotated radar dimensions and centre are observed rather than forced to the normalized 192-pixel side',()=>{
  const f=campaign(radar({width:79,height:96,centerX:936.5,centerY:528,inverseCos:1,inverseSin:0}));
  assert.equal(f.api.isBattlefieldPoint(936,528),false);assert.equal(f.api.isBattlefieldPoint(850,450),true);
  const box=f.api.nativeSelectionBounds().radar;assert.equal(box.left,894);assert.equal(box.right,979);assert.equal(box.top,477);assert.equal(box.bottom,579);
 });
 await check('Native rectangle uses the same inclusive-left/top and exclusive-right/bottom boundaries as CoordInRadar',()=>{
  const f=campaign(radar({width:160,height:100}));
  assert.equal(f.api.isBattlefieldPoint(800,430),false);assert.equal(f.api.isBattlefieldPoint(960,480),true);assert.equal(f.api.isBattlefieldPoint(880,530),true);
 });
 await check('Subpixel CSS positions truncate to the same integer logical mouse coordinates as native SDL before the hit test',()=>{
  const f=campaign(radar());assert.equal(f.api.isBattlefieldPoint(800.9,480),true);assert.equal(f.api.isBattlefieldPoint(959.9,480),false);
 });
 await check('Off-world/asymmetric radar resize and visibility changes are read live without a cached full-map aspect',()=>{
  const f=campaign(radar());assert.equal(f.api.isBattlefieldPoint(820,480),false);
  f.window.__warzoneCampaign.report=()=>({nativeState:{radar:radar({width:96,height:192})}});
  assert.equal(f.api.isBattlefieldPoint(820,480),true);assert.equal(f.api.isBattlefieldPoint(880,480),false);
  assert.equal(f.api.nativeSelectionBounds().radar.left,829);
  f.window.__warzoneCampaign.report=()=>({nativeState:{radar:radar({visible:false})}});assert.equal(f.api.nativeSelectionBounds().radar,null);
 });
 await check('Offset/resized CSS canvas scales native logical viewport coordinates consistently for hit tests and selection bounds',()=>{
  const bounds={x:100,y:50,left:100,top:50,right:900,bottom:450,width:800,height:400};
  const f=campaign(radar({viewportWidth:1600,viewportHeight:800,centerX:1360,centerY:560,width:320,height:200}),{bounds});
  assert.equal(f.api.isBattlefieldPoint(780,330),false);assert.equal(f.api.isBattlefieldPoint(690,330),true);
  const box=f.api.nativeSelectionBounds().radar;assert.deepEqual({left:box.left,top:box.top,right:box.right,bottom:box.bottom},{left:697,top:277,right:863,bottom:383});
 });
 await check('Unavailable or malformed radar observations never invent a map-shaped control region',()=>{
  for(const value of[null,radar({viewportWidth:0}),radar({inverseCos:0,inverseSin:0}),radar({centerX:'880'})]){
   const f=campaign(value);assert.equal(f.api.nativeSelectionBounds().radar,null);assert.equal(f.api.isBattlefieldPoint(880,480),true);
  }
 });
 await check('Towers retains its existing radar rectangle, right-click path and selection exclusion',async()=>{
  const f=fixture(text);assert.equal(f.api.isBattlefieldPoint(850,460),false);
  const box=f.api.nativeSelectionBounds().radar;assert.equal(box.left,781);assert.equal(box.right,979);assert.equal(box.top,381);assert.equal(box.bottom,579);
  f.fire('pointerdown',850,460);f.fire('pointermove',890,490);f.fire('pointerup',890,490);await f.frames(5);assert.equal(f.api.report().radarDrags,1);assert.equal(f.events.filter(e=>e.type==='pointerdown'&&e.button===2).length,1);assert.equal(f.native.panStarts,0);
 });
 const result={version:'0.51',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
  scope:'Actual shared touch adapter with native-observer geometry fixtures. Real native drawing and Android minimap behavior are checked separately in the delivery journey.',
  sources:[{path:FILE,sha256:sha(text)},{path:'tools/check-campaign-radar-051.cjs',sha256:sha(fs.readFileSync(__filename))},...nativeFiles.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(ROOT,file)))}))],recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(ROOT,'archive/campaign-radar-js-0.51-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
