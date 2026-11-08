'use strict';
// ROOT-RUN ONLY. This helper never pauses, resumes, starts or restores a battle.
// Requiring an explicit evidence folder prevents accidental default QA output.
if(!process.env.WZ_NATIVE_QA)throw Error('Set WZ_NATIVE_QA before using profile-14-live.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const profiles={compact:{wm:'480x854',pixels:[854,480],font:'1.3',scale:1.4},normal:{wm:'600x1080',pixels:[1080,600],font:'1',scale:1}};
async function geometry(c){return c.evaluate(`(()=>{const f=parent.document.getElementById('warzone-game-frame'),e=document.getElementById('canvas'),t=__kalaWarzoneTouch.report(),s=__warzoneCommands.report();return{viewport:[parent.innerWidth,parent.innerHeight],childViewport:[innerWidth,innerHeight],frame:f.getBoundingClientRect().toJSON(),canvas:{box:e.getBoundingClientRect().toJSON(),width:e.width,height:e.height},frames:t.nativeRenderFrames,clock:__warzoneTowersWaves.report().snapshot.gameTime,scale:Number(parent.document.documentElement.style.getPropertyValue('--wt-command-scale'))||Number(localStorage.getItem('wt-command-size'))||1,overlays:{page:s.page,buildOpen:s.buildOpen,research:__blockNightResearch.report().open,status:Boolean(parent.TowersStatus?.report().open)},heldKeys:t.heldKeys}})()`);}
function bounded(g,pixels){
 assert.ok(g.viewport.every(n=>Number.isFinite(n)&&n>0),'host viewport exists');
 assert.ok(Math.abs(g.viewport[0]/g.viewport[1]-pixels[0]/pixels[1])<.03,'host and actual PNG have the requested landscape aspect');
 assert.ok(Math.abs(g.frame.left)<2&&Math.abs(g.frame.right-g.viewport[0])<2,'iframe fills host width');
 assert.ok(g.frame.top>=-1&&g.frame.bottom<=g.viewport[1]+2&&g.frame.height>0,'iframe remains inside the host viewport');
 assert.ok(Math.abs(g.canvas.box.width-g.frame.width)<2&&Math.abs(g.canvas.box.height-g.frame.height)<2,'canvas CSS size matches iframe');
 assert.ok(g.canvas.width>0&&g.canvas.height>0,'native canvas has real pixels');
 assert.deepEqual(g.heldKeys,[],'no held input keys during the physical profile change');
}
async function stableGeometry(c,profile){
 const samples=[];let previous='',stable=0;
 for(const end=Date.now()+15000;Date.now()<end;){
  const png=l.adb('exec-out','screencap','-p'),pixels=[png.readUInt32BE(16),png.readUInt32BE(20)],g=await geometry(c);
  const signature=JSON.stringify({pixels,viewport:g.viewport,childViewport:g.childViewport,frame:g.frame,canvas:g.canvas});
  if(pixels[0]===profile.pixels[0]&&pixels[1]===profile.pixels[1]){
   try{bounded(g,pixels);stable=signature===previous?stable+1:1;previous=signature;samples.push({pixels,geometry:g});if(stable>=2)return{pixels,geometry:g,stableSamples:samples.slice(-2)};}
   catch(error){samples.push({pixels,geometry:g,note:error.message});stable=0;previous='';}
  }else{stable=0;previous='';}
  await l.delay(150);
 }
 throw Error('Requested PNG/host/iframe/canvas geometry did not become stable in 15 seconds: '+JSON.stringify(samples.slice(-2)));
}
async function main(args=process.argv.slice(2)){
 assert.equal(args.filter(a=>a==='--compact'||a==='--normal').length,1,'Choose exactly one of --compact or --normal');
 const name=args.includes('--compact')?'compact':'normal',profile=profiles[name],allowPaused=args.includes('--allow-paused');
 const report={passed:false,started:new Date().toISOString(),profile:name,requested:profile,allowPaused,method:allowPaused?'Physical wm/font plus local UI scale only; no overlay actions or pause/resume input; no simulation-advance claim.':'Live physical wm/font plus local UI scale; no pause/resume input.'};
 const file=path.join(l.out,'profile-14-'+name+(allowPaused?'-allow-paused':'')+'.json'),write=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');let c;
 try{
  report.identity=j.installedIdentity();c=await j.connectReady();
  if(!allowPaused){
   if(await c.host('Boolean(window.TowersStatus?.report().open)')){await c.tap('#wt-status-close');await c.wait('!parent.TowersStatus.report().open');}
   await j.closeOverlays(c);
   report.initialAdvancingClock=await j.waitAdvancingClock(c,await clock(c));
  }
  report.before=await geometry(c);report.original={wm:l.adb('shell','wm','size').toString().trim(),font:l.adb('shell','settings','get','system','font_scale').toString().trim()};write();
  l.assertLabForeground();l.adb('shell','wm','size',profile.wm);l.adb('shell','settings','put','system','font_scale',profile.font);
  // setSize changes only the HTML control scale; it sends no native command.
  await c.evaluate('__warzoneCommands.setSize('+profile.scale+');true');await c.paint();
  report.actual=await stableGeometry(c,profile);assert.equal(report.actual.geometry.scale,profile.scale,'local command scale matches requested profile');
  if(!allowPaused){
   report.advancedClock=await j.waitAdvancingClock(c,report.before.clock);
   await c.wait('__kalaWarzoneTouch.report().nativeRenderFrames>'+Number(report.before.frames),10000);
   report.after=await geometry(c);bounded(report.after,profile.pixels);
   assert.ok(report.after.clock>report.before.clock&&report.after.frames>report.before.frames,'native simulation and render frames advance across live resize');
   report.checks={initialSimulationRunning:true,actualStableProfile:true,canvasFrameMatches:true,simulationAndRenderingContinue:true,noPauseResumeInput:true};
  }else{report.after=await geometry(c);report.checks={actualStableProfile:true,canvasFrameMatches:true,simulationAdvanceRequired:false,noOverlayActions:true,noPauseResumeInput:true};}
  report.screenshot=path.relative(l.root,l.screen('14-profile-'+name+(allowPaused?'-allow-paused':''))).replaceAll('\\','/');
  report.errors=c.errors;assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=String(error.stack||error);throw error;}
 finally{if(c)c.close();report.finished=new Date().toISOString();write();}
 console.log(JSON.stringify({passed:report.passed,profile:name,allowPaused,report:path.relative(l.root,file).replaceAll('\\','/'),screenshot:report.screenshot,checks:report.checks}));return report;
}
module.exports={main,geometry,bounded,stableGeometry};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
