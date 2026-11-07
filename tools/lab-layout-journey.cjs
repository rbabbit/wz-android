'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const {adb,out}=live;
async function viewport(c,wm){
 const [a,b]=wm.split('x').map(Number),width=Math.max(a,b),height=Math.min(a,b);let stable=0,last='';
 const deadline=Date.now()+15000;
 while(Date.now()<deadline){
  const png=adb('exec-out','screencap','-p'),physical={width:png.readUInt32BE(16),height:png.readUInt32BE(20)},host=await c.host('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  const key=JSON.stringify([physical,host]);
  if(physical.width===width&&physical.height===height&&Math.abs(host.width/host.height-width/height)<.03){stable=key===last?stable+1:1;if(stable>=2)return{physical,host};}else stable=0;
  last=key;await live.delay(100);
 }
 throw Error('Actual screenshot and WebView viewport did not settle for '+wm);
}
async function size(c,value){
 await j.closeOverlays(c);await c.tap('#blocknight-help');
 await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');
 await c.tap('[data-ui-size="'+value+'"]');
 await c.wait('parent.document.documentElement.style.getPropertyValue("--wt-command-scale")==='+JSON.stringify(String(value)));
 await c.tap('.wt-help-back');
}
async function geometry(c){return c.host(`(()=>{
 const content=document.getElementById('wt-page-content'),panel=document.getElementById('wt-command-pages');
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,horizontalOverflow:e.scrollWidth-e.clientWidth}};
 return{viewport:{width:innerWidth,height:innerHeight},commandScale:document.documentElement.style.getPropertyValue('--wt-command-scale'),panel:rect(panel),content:rect(content),columns:[...content.querySelectorAll('.wt-workspace > *')].map(rect)};
})()`)}
(async()=>{
 const report={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),profiles:[],started:new Date().toISOString()};let c;
 try{
  c=await j.connectReady();await j.restoreFixture(c,'early',report);
  for(const [name,wm,font,scale]of [['wide','2400x1080','1',1],['phone-enlarged','600x1080','1.3',1.4],['compact-extra-large','480x854','1',1.4]]){
   console.log('START layout '+name);await j.closeOverlays(c);adb('shell','wm','size',wm);adb('shell','settings','put','system','font_scale',font);
   const measured=await viewport(c,wm);await size(c,scale);
   const profile={name,wm,fontScale:font,commandScale:scale,measured,screens:[]};
   for(const page of ['factory','design','saved','queue']){
    await j.openPage(c,page);await j.capture(c,'layout-'+name+'-'+page);const g=await geometry(c);
    assert.ok(g.panel.x>=-1&&g.panel.x+g.panel.width<=g.viewport.width+1,'panel fits actual viewport');
    assert.ok(g.content.horizontalOverflow<=2,'command content has no horizontal clipping');
    assert.ok(g.columns.every(r=>r.x>=-1&&r.x+r.width<=g.viewport.width+1&&r.horizontalOverflow<=2),'all independent columns fit');
    profile.screens.push({page,geometry:g});
   }
   await j.openResearch(c);await j.capture(c,'layout-'+name+'-research');
   profile.research=await c.evaluate('(()=>{const s=document.getElementById("blocknight-research-shell"),r=s.getBoundingClientRect();return{width:innerWidth,height:innerHeight,box:{x:r.x,y:r.y,width:r.width,height:r.height},horizontalOverflow:s.scrollWidth-s.clientWidth}})()');
   assert.ok(profile.research.horizontalOverflow<=2);await j.closeOverlays(c);
   await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="ALL"]');profile.catalogue=await require('./audit-build-display.cjs').catalogue(c);await j.capture(c,'layout-'+name+'-build');await j.closeOverlays(c);
   if(name!=='wide'){
    await j.openPage(c,'factory');const factory=await c.host('Number(document.getElementById("wt-factory-select").value)');await j.scrollFactory(c,factory,profile);
    const template=await c.evaluate('__warzoneCommands.report().saved.find(d=>d.factoryTemplate)');assert.ok(template,'saved template from normal UI journey');
    await j.openPage(c,'saved');await c.tap('#wt-command-pages [data-produce-design='+JSON.stringify(template.id)+']');await c.wait('__warzoneCommands.report().page==="factory"');await j.selectedTemplateVisible(c,profile);await j.capture(c,'layout-compact-selected-template-visible');
   }
   report.profiles.push(profile);console.log('PASS layout '+name);
  }
  await j.closeOverlays(c);adb('shell','wm','size','600x1080');adb('shell','settings','put','system','font_scale','1');await viewport(c,'600x1080');await size(c,1);await j.pause(c);
  assert.deepEqual(c.errors,[]);report.errors=c.errors;report.finalIdentity=j.installedIdentity(process.env.WZ_QA_APK);assert.equal(report.identity.candidateAPK_SHA256,report.finalIdentity.candidateAPK_SHA256);report.passed=true;
 }catch(error){report.failure=String(error.stack||error);try{if(c){live.screen('layout-failure');await j.pause(c)}}catch(recovery){report.recoveryFailure=String(recovery)}throw error;
 }finally{c?.close();report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'layout-journey.json'),JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1});
