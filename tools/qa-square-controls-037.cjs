'use strict';
// Exact installed APK; measured Android touches and live native state.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const mode=process.argv[2]||'normal',r={version:'0.37',mode,identity:j.installedIdentity(),passed:false};
if(process.env.WZ_QA_SETUP_DISCLOSURE)r.setupDisclosure=process.env.WZ_QA_SETUP_DISCLOSURE;
const ids=['wt-demolish','wt-intelligence','blocknight-select-all','wt-deselect-units','blocknight-stop','wt-select-trucks'];
async function field(c){if(!await c.host('(()=>{let e=document.getElementById("wt-demolish"),b=e?.getBoundingClientRect();return !!b&&b.height>0&&e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})()'))await c.tap('#wt-field-toggle');}
const sample=c=>c.host(`(()=>{let p=document.getElementById('wt-field-centre'),f=document.getElementById('lab-ops'),a=${JSON.stringify(ids)};return{viewport:{w:innerWidth,h:innerHeight},compact:document.body.dataset.fieldCompact,panel:p.getBoundingClientRect().toJSON(),footer:f.getBoundingClientRect().toJSON(),buttons:a.map(id=>{let e=document.getElementById(id),b=e.getBoundingClientRect(),i=e.querySelector('img');return{id,text:e.textContent.trim(),box:b.toJSON(),font:getComputedStyle(e).fontSize,overflow:e.scrollWidth>e.clientWidth||e.scrollHeight>e.clientHeight,icon:i?{loaded:i.complete&&i.naturalWidth>0,box:i.getBoundingClientRect().toJSON()}:null}})}})()`);
function layout(s){
 assert.equal(s.panel.width,s.viewport.w<=800?210:242);assert.equal(s.buttons.length,6);
 for(let i=0;i<6;i++){let b=s.buttons[i].box;assert(Math.abs(b.width-b.height)<.6,'square '+s.buttons[i].id);assert(b.left>=s.panel.left&&b.right<=s.panel.right+.1&&b.top>=s.panel.top&&b.bottom<=s.panel.bottom+.1);assert(!s.buttons[i].overflow,'no text clipping');assert(s.buttons[i].icon.loaded,'real icon loaded');if(i%3)assert(b.left>s.buttons[i-1].box.left);if(i>=3)assert(b.top>s.buttons[i-3].box.bottom);}
 assert(s.panel.bottom+3<=s.footer.top,'footer stays separate below, including native enlarged-text growth');assert(s.footer.bottom<=s.viewport.h&&s.footer.left>=0);assert(s.panel.top>=0);
}
async function world(c,p){const v=await c.host('(()=>{const f=document.getElementById("warzone-game-frame").getBoundingClientRect();return{x:f.x,y:f.y,w:innerWidth,h:innerHeight}})()'),png=l.adb('exec-out','screencap','-p');l.adb('shell','input','tap',String(Math.round((p.x+v.x)*png.readUInt32BE(16)/v.w)),String(Math.round((p.y+v.y)*png.readUInt32BE(20)/v.h)));await c.paint();}
(async()=>{let c,metricsOverride=false;try{
 for(let i=0;i<90&&!c;i++){try{c=await l.connect()}catch{await l.delay(200)}}assert(c);await c.wait('Boolean(window.__warzoneCommands?.report().snapshot&&(window.WarzoneBriefing?.report().phase==="released"||(window.WarzoneSavedGames?.report().loading&&window.WarzoneSavedGames?.report().ready)))',90000,{timeoutMs:60000});await c.host('document.fonts.ready.then(()=>true)',{timeoutMs:60000});
 await field(c);r.layout=await sample(c);layout(r.layout);
 if(mode==='wide'){
  r.physicalBaseline=r.layout;r.physicalBaselinePassed=true;
  r.viewportFixture={disclosure:'One temporary CDP viewport override exercises the noncompact CSS branch; physical emulator profile remains1280x800,density240,font1.0. No app/native/game-state changes.',parameters:{width:1280,height:800,deviceScaleFactor:1,mobile:false},verified:false};
  try{
   await c.call('Emulation.setDeviceMetricsOverride',r.viewportFixture.parameters);metricsOverride=true;
   await c.wait('parent.innerWidth===1280&&parent.innerHeight===800&&parent.document.body.dataset.fieldCompact==="false"',10000,{timeoutMs:15000});
   await field(c);r.layout=await sample(c);layout(r.layout);r.viewportFixture.observedViewport=r.layout.viewport;r.viewportFixture.observedCompact=r.layout.compact;r.viewportFixture.verified=true;
  }catch(error){r.viewportFixture.error=String(error.stack||error);r.noncompactBranchUnverified=true;}
 }
 r.layoutFrame=l.screen('delivery-'+mode+'-square-controls');
 if(mode==='normal'){
  r.initialCombatLock=await c.evaluate('__kalaWarzoneTouch.report().combatLock');if(r.initialCombatLock){await c.tap('#blocknight-select-all');await c.wait('!__kalaWarzoneTouch.report().combatLock');}
  r.productionDisclosure='One ordinary paid machinegun vehicle is produced through the existing command adapter to exercise ALL UNITS, which selects combat units rather than constructors. No units, power, research or positions are seeded.';
  const existing=await c.evaluate('__warzoneCommands.report().snapshot.finishedUnits.find(u=>u.name==="Field check")');if(!existing){r.production=await c.evaluate('(()=>{const f=__warzoneCommands.report().snapshot.factories.find(f=>f.ready&&f.kind==="Factory");if(!f)throw Error("No actual ready vehicle factory");return __warzoneCommands.send("queue-production",{factoryId:f.id,design:{name:"Field check",body:"Body1REC",propulsion:"wheeled01",turrets:["MG1Mk1"]},count:1});})()');assert(r.production.ok);}
  const unit=await c.wait('__warzoneCommands.report().snapshot.finishedUnits.find(u=>u.name==="Field check")',45000);r.combatUnit=unit;
  await field(c);await c.tap('#blocknight-select-all');await c.wait(`__warzoneCommands.report().snapshot.selectedUnits.some(t=>t.id===${unit.id})`);r.all=await c.evaluate('__warzoneCommands.report().snapshot.selectedUnits');
  await field(c);await c.tap('#wt-deselect-units');await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length===0');r.deselected=true;
  await field(c);await c.tap('#wt-select-trucks');await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length>0&&!__warzoneCommands.report().selectingTrucks');r.trucks=await c.evaluate('__warzoneCommands.report().snapshot.selectedUnits');assert(r.trucks.every(t=>t.constructor));
  r.stopDisclosure='STOP is checked on the actual selected construction trucks by native acknowledgement and exact stopped IDs. No movement/path fixture is added to this CSS-only check.';
  const before=await c.evaluate('__kalaWarzoneTouch.report().stopAcks');await field(c);await c.tap('#blocknight-stop');await c.wait(`__kalaWarzoneTouch.report().stopAcks>${before}`);r.stop=await c.evaluate('({ids:__kalaWarzoneTouch.report().stoppedUnitIds,acks:__kalaWarzoneTouch.report().stopAcks})');assert.deepEqual([...r.stop.ids].sort(),r.trucks.map(t=>t.id).sort());
  await field(c);await c.tap('#wt-demolish');await c.wait('!!__warzoneCommands.report().demolition');r.demolish=await c.evaluate('__warzoneCommands.report().demolition');await c.tap('#wt-demolish-bar button');await c.wait('!__warzoneCommands.report().demolition');
  await field(c);await c.tap('#wt-intelligence');await c.wait('__warzoneIntelligence.report().open');r.intelligence=await c.evaluate('({open:__warzoneIntelligence.report().open,topics:__warzoneIntelligence.report().history.length})');l.adb('shell','input','keyevent','4');await c.wait('!__warzoneIntelligence.report().open&&!__warzoneIntelligence.report().closing');
 }
 if(mode==='normal'||mode==='small'){
  r.footer=[];for(const [selector,kind]of [['#lab-ops-research','research'],['#lab-ops-production','production']]){await c.tap(selector);await c.wait(`parent.TowersStatus.report().open&&parent.TowersStatus.report().kind===${JSON.stringify(kind)}`);r.footer.push(await c.host('TowersStatus.report()'));r[kind+'Frame']=l.screen('delivery-'+mode+'-footer-'+kind);l.adb('shell','input','keyevent','4');await c.wait('!parent.TowersStatus.report().open');}
 }
 if(mode==='wide'&&r.viewportFixture.verified){
  assert.equal(r.layout.compact,'false');await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen');await field(c);r.withBuild=await c.host('(()=>{let p=document.getElementById("wt-field-centre").getBoundingClientRect(),b=document.getElementById("wt-build-sidebar").getBoundingClientRect();return{panel:p.toJSON(),build:b.toJSON()}})()');assert(r.withBuild.build.bottom+10<=r.withBuild.panel.top,'wide build/sidebar gap');r.buildFrame=l.screen('delivery-wide-build-spacing');await c.tap('#wt-open-build');
 }
 await field(c);r.after=await sample(c);layout(r.after);r.afterFrame=l.screen('delivery-'+mode+'-restored-controls');
 if(metricsOverride){await c.call('Emulation.clearDeviceMetricsOverride');metricsOverride=false;r.viewportFixture.cleared=true;}
 // Checks are finished; stop this test app before changing display profiles.
 // This avoids making unrelated pause/timing behavior part of a CSS check.
 l.adb('shell','am','force-stop',l.packageId);r.stoppedAfterChecks=true;r.passed=true;
 }catch(error){r.error=String(error.stack||error);try{r.failureFrame=l.screen('failure-'+mode)}catch{}throw error}
 finally{if(c){if(metricsOverride)try{await c.call('Emulation.clearDeviceMetricsOverride');r.viewportFixture.cleared=true;}catch(error){r.viewportFixture.clearError=String(error);}c.close();}fs.writeFileSync(path.join(l.out,'delivery-'+mode+'.json'),JSON.stringify(r,null,2)+'\n')}})().catch(e=>{console.error(e);process.exitCode=1});
