'use strict';
// Run only after the real factory0→1→2 journey leaves its ordinary native world.
// It reuses that complete prepared state; no units/resources/module levels seeded.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-04/module-layout');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs'),m=require('./test-04-module-journey.cjs'),{controls}=require('./audit-smooth-building.cjs');
const {adb,out}=live,IDS=['A0FacMod1','A0PowMod1','A0ResearchModule1'];
const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
function inside(r,b,label){assert.ok(r.width>0&&r.height>0,label+': nonempty');assert.ok(r.left>=b.left-2&&r.top>=b.top-2&&r.right<=b.right+2&&r.bottom<=b.bottom+2,label+': fully visible within its actual clip');}
async function geometry(c){return c.host(`(()=>{const rect=e=>e?.getBoundingClientRect().toJSON(),side=document.getElementById('wt-build-sidebar'),grid=document.getElementById('wt-sidebar-catalogue'),hint=document.getElementById('wt-module-guidance'),exit=side?.querySelector('[data-action="select-mode"]'),cards=Array.from(grid?.querySelectorAll('[data-build]')||[]);return{viewport:{left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth-innerWidth,sidebar:rect(side),grid:rect(grid),hint:{rect:rect(hint),hidden:hint?.hidden,text:hint?.innerText},exit:{rect:rect(exit),label:exit?.innerText,hit:exit&&exit.contains(document.elementFromPoint(exit.getBoundingClientRect().x+exit.getBoundingClientRect().width/2,exit.getBoundingClientRect().y+exit.getBoundingClientRect().height/2))},cards:cards.map(e=>{const r=e.getBoundingClientRect();return{id:e.dataset.build,text:e.innerText,rect:r.toJSON(),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),disabled:e.disabled}})}})()`);}
async function labelGeometry(c,target){
 const r=target.drawn.labelRect;assert.ok(r,'visible full target label');
 const geometry=await c.evaluate(`(()=>{const r=${JSON.stringify(r)},pts=[[r.x+1,r.y+1],[r.x+r.width-1,r.y+1],[r.x+1,r.y+r.height-1],[r.x+r.width-1,r.y+r.height-1]];return{width:innerWidth,height:innerHeight,corners:pts.map(([x,y])=>({x,y,field:__kalaWarzoneTouch.isBattlefieldPoint(x,y)}))};})()`);
 assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=geometry.width&&r.y+r.height<=geometry.height,'target label remains in actual field viewport');assert.ok(geometry.corners.every(p=>p.field),'target label avoids sidebar, radar and footer controls');return geometry;
}
async function countHint(c,moduleId,label){
 const r=await m.ui(c),targets=r.effectiveTargets.filter(x=>x.moduleId===moduleId),counts={ready:targets.filter(x=>x.eligible).length,upgrading:targets.filter(x=>['queued','upgrading'].includes(x.status)).length,full:targets.filter(x=>x.status==='full').length},text=r.hint.text.replace(/\s+/g,' ');
 assert.equal(r.hint.hidden,false,label+': persistent active-module guidance');assert.doesNotMatch(text,/choose a module|upgrade existing buildings/i,label+': generic category text must be replaced after reselecting the same module');
 for(const [name,count]of Object.entries(counts))assert.ok(text.includes(count+' '+name),label+': actual '+name+' count restored');return {text,counts,ui:r};
}
async function visibleNativeTrucks(c,save){
 const ids=(await m.fresh(c)).trucks.map(x=>x.id),units=Object.values(save['droid.json']).filter(x=>ids.includes(x.id)).map(x=>({id:x.id,position:x.position}));
 const read=await c.evaluate(`${JSON.stringify(units)}.map(d=>{const [x,y,z]=d.position,p=WarzoneTerrain.project(x,y,(WarzoneTerrain.heightAt(x,y)??z)+32);return {...d,point:p,field:Boolean(p&&p.x>4&&p.y>4&&p.x<innerWidth-4&&p.y<innerHeight-24&&__kalaWarzoneTouch.isBattlefieldPoint(p.x,p.y))}})`),visible=read.filter(x=>x.field).map(x=>x.id).sort((a,b)=>a-b);
 assert.ok(visible.includes(160005),'authored local construction truck is visibly available');return {ids:visible,projection:read};
}
async function run(options={}){
 const r={passed:false,seeded:false,started:new Date().toISOString(),identity:j.installedIdentity(options.apk),fixture:'Reuse completed real Dustfall factory160121 from the module04 factory0→1→2 journey; no fresh launch or grants.',profiles:[]};let c;
 try{
  c=await j.connectReady();await j.resume(c);const initial=await m.fresh(c);assert.equal(initial.mapHeight,79,'prepared Dustfall world is still loaded');const full=initial.moduleTargets.find(x=>x.id===160121);assert.ok(full&&full.moduleId==='A0FacMod1'&&full.modules===2&&full.maximum===2&&full.status==='full','validate real completed2/2 factory before changing QA profile');assert.equal(initial.jobs.length,0,'prepared module fixture is idle');r.initial={nativeClock:initial.gameTime,target:full};
  await c.wait('__warzoneCommands.report().snapshot.trucks.every(x=>[0,1].includes(x.order))',20000);const baseline=await c.save('module04-layout-initial');assert.equal(Object.values(baseline['struct.json']).find(x=>x.id===160121)?.modules,2,'genuine native F7 confirms reused capacity');
  for(const [name,size,font,scale]of [['phone','600x1080','1',1],['compact-enlarged','480x854','1.3',1.4]]){
   await j.pause(c);adb('shell','wm','size',size);adb('shell','settings','put','system','font_scale',font);await c.evaluate(`__warzoneCommands.setSize(${scale});true`);await c.paint();await j.resume(c);const ctl=await controls(c);await ctl.camera(28,20);
   const p={name,size,font,controlScale:scale};r.profiles.push(p);const native=await c.save('module04-layout-'+name+'-native');await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="MODULES"]');await c.wait('!__warzoneCommands.report().selectingTrucks',20000);await c.paint();p.category=await geometry(c);p.visibleWorkers=await visibleNativeTrucks(c,native);
   assert.ok(p.category.overflow<=2,'no horizontal document overflow');inside(p.category.sidebar,p.category.viewport,'module sidebar');inside(p.category.hint.rect,p.category.sidebar,'persistent small module hint');assert.equal(p.category.hint.hidden,false);assert.doesNotMatch(p.category.hint.text,/clear terrain/i);inside(p.category.exit.rect,p.category.sidebar,'Exit control');assert.equal(p.category.exit.hit,true,'Exit remains directly tappable');
   assert.deepEqual(p.category.cards.map(x=>x.id).sort(),IDS.slice().sort(),'all three real module cards');
   for(const card of p.category.cards){inside(card.rect,p.category.grid,card.id+' card');assert.equal(card.hit,true,card.id+' directly tappable');assert.equal(card.disabled,false);assert.ok(!overlap(card.rect,p.category.hint.rect)&&!overlap(card.rect,p.category.exit.rect),'cards do not overlap hint/Exit');}
   p.categoryScreen=await m.shot(c,'module04-'+name+'-three-cards-guidance');await m.item(c,'A0FacMod1');p.selection=await m.group(c,p.visibleWorkers.ids,name+' real visible constructors, including any normally produced truck');p.full=await m.target(c,160121,'A0FacMod1');p.firstHint=await countHint(c,'A0FacMod1',name+' first Factory Module choice');assert.equal(p.full.native.modules,2);assert.equal(p.full.native.eligible,false);assert.match(p.full.drawn.label,/FULL.*2\/2/i);
   p.labelGeometry=await labelGeometry(c,p.full);p.upperMesh=await m.meshPoint(c,160121,'A0FacMod1','upper');p.lowerMesh=await m.meshPoint(c,160121,'A0FacMod1','lower');assert.ok(Math.hypot(p.upperMesh.point.x-p.lowerMesh.point.x,p.upperMesh.point.y-p.lowerMesh.point.y)>=8,'distinct actual mesh targets at each viewport');p.fullScreen=await m.shot(c,'module04-'+name+'-full-target');
   p.feedback=await m.fullFeedback(c,ctl,160121,'A0FacMod1','module04-'+name+'-full-feedback');await m.exitBuild(c);await c.paint();const cleared=await m.ui(c);assert.equal(cleared.display.preview,'');assert.equal(cleared.display.moduleTargets.length,0,'normal Exit clears module target layer');p.exited=cleared;p.exitScreen=await m.shot(c,'module04-'+name+'-exit-clears-targets');
   await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="MODULES"]');await c.wait('!__warzoneCommands.report().selectingTrucks',20000);p.reopenGeneric=await m.ui(c);assert.match(p.reopenGeneric.hint.text,/choose a module|upgrade existing buildings/i,'reopened category shows genuine generic guidance before the new choice');p.reopenGenericScreen=await m.shot(c,'module04-'+name+'-reopen-generic');
   await m.item(c,'A0FacMod1');p.reselectedHint=await countHint(c,'A0FacMod1',name+' same Factory Module after Exit/Build');p.reselectedTarget=await m.target(c,160121,'A0FacMod1');assert.match(p.reselectedTarget.drawn.label,/FULL.*2\/2/i);p.reselectedScreen=await m.shot(c,'module04-'+name+'-same-module-counts-restored');await m.exitBuild(c);
  }
  r.afterIdentity=j.installedIdentity(options.apk);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);assert.deepEqual(c.errors,[]);r.passed=true;
 }catch(error){r.failure=String(error.stack||error);if(c)try{r.failureScreen=live.screen('module04-layout-failure');r.failureState=await m.ui(c);}catch(capture){r.captureFailure=String(capture);}throw error;
 }finally{
  if(c){try{await j.closeOverlays(c);await j.pause(c);adb('shell','wm','size','600x1080');adb('shell','settings','put','system','font_scale','1');await c.evaluate('__warzoneCommands.setSize(1);true');await c.paint();r.pausedAt=await j.pause(c);r.restoredPhone={size:'600x1080',font:'1',controlScale:1,screenshot:live.screen('module04-layout-restored-phone')};}catch(error){r.cleanupFailure=String(error.stack||error);r.passed=false;}c.close();}
  r.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'module-layout.json'),JSON.stringify(r,null,2)+'\n');
 }
 if(!r.passed)throw Error(r.cleanupFailure||'Module layout verification failed');return r;
}
module.exports={run,geometry};
if(require.main===module){const args=process.argv.slice(2),i=args.indexOf('--apk');run({apk:i>=0?args[i+1]:process.env.WZ_QA_APK}).then(r=>console.log(JSON.stringify({passed:r.passed,identity:r.identity,profiles:r.profiles.map(p=>p.name)}))).catch(error=>{console.error(error);process.exitCode=1;});}
