'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
(async()=>{const c=await l.connect(),r={identity:j.installedIdentity(),passed:false,checks:[]};try{
 for(const kind of ['research','factory']){
  const q='#lab-ops [data-lab-panel="'+kind+'"]';await c.tap(q);
  let state=await c.host('({hidden:document.querySelector("#wt-status-panel").hidden,x:!!document.querySelector("#wt-status-close"),text:document.querySelector("#wt-status-panel").textContent,rect:document.querySelector("#wt-status-panel").getBoundingClientRect().toJSON()})');
  assert.equal(state.hidden,false);assert.equal(state.x,false);r.checks.push({kind,state});l.tree();l.screen('delivery-'+kind+'-sidebar');await c.tap(q);assert.equal(await c.host('document.querySelector("#wt-status-panel").hidden'),true);
 }
 for(const q of ['#blocknight-tech','#wt-open-factory']){
  for(let i=0;i<2;i++){await c.tap(q);await l.delay(250);await c.tap(q);await l.delay(200)}
 }
 r.after=await c.evaluate('({research:__blockNightResearch.report().open,page:__warzoneCommands.report().page,pending:__kalaWarzoneTouch.report().pendingClicks})');
 assert.equal(r.after.research,false);assert.equal(r.after.page,'');assert.equal(r.after.pending,0);r.passed=true;
 }finally{fs.writeFileSync(path.join(l.out,'delivery-menu-checks.json'),JSON.stringify(r,null,2));c.close()}})().catch(e=>{console.error(e);process.exitCode=1});


