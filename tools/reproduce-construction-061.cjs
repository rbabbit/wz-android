'use strict';
// Ordinary delivered-0.60 phone save; no world/unit/camera state is injected.
const fs=require('node:fs'),q=require('./campaign-live-051.cjs');
const put=(n,x)=>fs.writeFileSync(q.out+'/'+n+'.json',JSON.stringify(x,null,2));
async function main(){
  if(process.argv.includes('--reload')){
    q.adb('shell','am','force-stop',q.packageId);
    q.adb('shell','am','start','-n',q.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');
    await q.nativeTap('FFA');await q.nativeTap('FFA SAVES');await q.nativeTap('LOAD');
  }
  let c;const end=Date.now()+70000;while(!c&&Date.now()<end){try{c=await q.connect();}catch{await q.delay(200);}}if(!c)throw Error('Native save WebView unavailable');try{
  await c.wait('window.WarzoneSavedGames?.ready && window.__towersHtml?.isActive?.()',70000);
  await c.wait('typeof __warzoneCommands!=="undefined" && __warzoneCommands.report().snapshot?.trucks?.length');
  if(process.argv.includes('--reload')){
    const v=await c.host('(()=>{const f=document.getElementById("warzone-game-frame").getBoundingClientRect();return {x:innerWidth*.5,y:f.y+f.height*.4,r:Math.min(innerWidth*.12,f.height*.2)}})()');
    const pts=span=>[{id:11,x:v.x-span,y:v.y},{id:12,x:v.x+span,y:v.y}];
    await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pts(v.r)});
    for(let i=1;i<=24;i++){await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pts(v.r*(1-.55*i/24))});await q.delay(24);}
    await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await q.delay(200);
  }
  if(!await c.evaluate('__warzoneCommands.report().buildOpen'))await c.tap('#wt-open-build');
  await c.wait('(()=>{const e=parent.document.getElementById("wt-build-sidebar");return e&&!e.hidden&&e.getBoundingClientRect().width>0&&!__warzoneCommands.report().selectingTrucks})()');
  await c.tap('#wt-build-sidebar [data-category="STRUCTURES"]');
  await c.tap('#wt-build-sidebar [data-build="A0LightFactory"]');
  await c.wait('__warzoneCommands.report().placement==="A0LightFactory"&&!__warzoneCommands.report().selectingTrucks&&__warzoneCommands.report().nativeBuildGroup.length>0');
  await c.evaluate('WarzoneTerrain.refresh()');
  const before=await c.evaluate('({commands:__warzoneCommands.report(),display:WarzoneBuildDisplay.report(),native:__warzoneFfa.report()})');
  const workers=before.commands.nativeBuildGroup;
  const sites=[];
  for(const [itemId,x,y] of [['A0LightFactory',18,22],['A0LightFactory',18,25],['A0CyborgFactory',14,24]]){
    const preview=await c.evaluate(`__warzoneCommands.send('preview-build',${JSON.stringify({itemId,x,y,workerIds:workers})})`);
    const point=await c.evaluate(`(()=>{const x=${x},y=${y},z=WarzoneTerrain.heightAt((x+.5)*128,(y+.5)*128),p=WarzoneTerrain.project((x+.5)*128,(y+.5)*128,z),f=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return {...p,outerX:p.x+f.x,outerY:p.y+f.y,pick:WarzoneTerrain.pick(p.x,p.y),field:__kalaWarzoneTouch.isBattlefieldPoint(p.x,p.y)};})()`);
    sites.push({itemId,x,y,preview,point});
    if(!preview.ok||!point.field||point.pick?.x!==x||point.pick?.y!==y)throw Error('Invalid fixture '+JSON.stringify(sites.at(-1)));
  }
  put('queued-touch-fast-preflight',{method:'trusted CDP physical pointer input',before,workers,sites});
  q.assertLabForeground();
  const touch=async s=>{await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:s.point.outerX,y:s.point.outerY}]});await q.delay(55);await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await q.delay(100);};
  await touch(sites[0]);await touch(sites[1]);
  await c.tap('#wt-build-sidebar [data-build="A0CyborgFactory"]');
  await c.wait('__warzoneCommands.report().placement==="A0CyborgFactory"');await touch(sites[2]);
  await q.delay(600);
  const samples=[];
  for(let i=0;i<20;i++){
    const state=await c.evaluate('({commands:__warzoneCommands.report(),display:WarzoneBuildDisplay.report(),native:__warzoneFfa.report()})');samples.push(state);put('queued-touch-fast-observed',{sites,workers,samples});
    if(i===0||i===5||i===19)q.screen('queued-touch-fast-'+i);
    console.log(JSON.stringify({i,time:state.commands.snapshot.gameTime,jobs:state.commands.snapshot.jobs,sites:state.commands.snapshot.constructionSites,trucks:state.commands.snapshot.trucks,history:state.commands.history.slice(-3)}));
    await q.delay(1000);
  }
  console.log('Captured ordinary queued-touch baseline.');
}finally{c.close();}}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={main};
