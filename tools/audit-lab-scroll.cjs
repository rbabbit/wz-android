'use strict';
// Genuine UI-saved copies create catalogue content; no DOM sizing or game grants.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('./lab-journey.cjs'),live=require('./native-live.cjs');
const attr=(name,value)=>`[${name}=${JSON.stringify(String(value))}]`;
async function waitFor(read,message,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const result=await read();if(result)return result;await live.delay(120);}throw Error(message);}
const columns=c=>c.host(`(()=>{const p=document.querySelector('#wt-command-pages');return Object.fromEntries(['.wt-rail','.wt-work-list','.wt-detail'].map(s=>{const e=p.querySelector(s);return[s,e?{top:e.scrollTop,max:e.scrollHeight-e.clientHeight}:null]}))})()`);
async function run(){
 const r={passed:false,seeded:false,createdIds:[],identity:q.installedIdentity(process.argv[2]||'app/build/outputs/apk/debug/app-debug.apk')};let c;
 try{
  c=await q.connectReady();await q.resume(c);r.libraryBefore=await c.evaluate('JSON.parse(BlockNightAndroid.loadDesigns())');assert.equal(r.libraryBefore.designs.length,2,'preserved two-model baseline');const original=r.libraryBefore.designs.find(d=>!d.factoryTemplate&&d.name.startsWith('Lab Scout ')),template=r.libraryBefore.designs.find(d=>d.factoryTemplate);assert.ok(original&&template);
  await q.restoreFixture(c,'early',r);await q.openPage(c,'saved');
  for(let i=0;i<4;i++){
   const before=await c.evaluate('__warzoneCommands.report().saved.map(d=>d.id)');assert.ok(before.length<8,'bounded test library');await c.tap('#wt-command-pages '+attr('data-edit',original.id));await c.wait('__warzoneCommands.report().page==="design"');await waitFor(()=>c.host('Boolean(document.getElementById("wt-save-as-new")&&!document.getElementById("wt-save-as-new").disabled)'),'native validation enables SAVE AS NEW');await c.tap('#wt-save-as-new');
   const added=await c.wait(`__warzoneCommands.report().saved.find(d=>!${JSON.stringify(before)}.includes(d.id))`);assert.ok(added.cost>0&&added.points>0);r.createdIds.push(added.id);(r.createdDesigns??=[]).push(added);await c.wait('__warzoneCommands.report().page==="saved"');console.log('Created genuine UI copy '+(i+1)+' / 4');
  }
  const current=await c.evaluate('__warzoneCommands.report().saved');assert.equal(current.length,6);assert.equal(new Set(current.map(d=>d.id)).size,6);await q.capture(c,'scroll-six-genuine-phone-models');
  await q.openPage(c,'factory');const state=await q.commandState(c),factory=state.factories.find(f=>f.ready);assert.ok(factory);await c.tap('#wt-command-pages '+attr('data-factory',factory.id));r.nativeFactories=state.factories.map(f=>({id:f.id,ready:f.ready,modules:f.modules}));r.columnsBefore=await columns(c);assert.ok(r.columnsBefore['.wt-work-list'].max>25,'genuine saved models produce a scrollable Factory catalogue');
  await q.scrollFactory(c,factory.id,r);assert.equal(r.factoryScroll.applicable,true);r.columnsAfterRerender=await columns(c);for(const selector of ['.wt-rail','.wt-detail'])assert.ok(Math.abs(r.columnsAfterRerender[selector].top-r.columnsBefore[selector].top)<2,'unrelated '+selector+' offset survives factory rerender');await q.capture(c,'scroll-retained-with-real-models');
  await q.openPage(c,'saved');await c.tap('#wt-command-pages '+attr('data-produce-design',template.id));await c.wait('__warzoneCommands.report().page==="factory"');await q.selectedTemplateVisible(c,r);r.columnsAfterUse=await columns(c);for(const selector of ['.wt-rail','.wt-detail'])assert.ok(Math.abs(r.columnsAfterUse[selector].top-r.columnsAfterRerender[selector].top)<2,'unrelated '+selector+' offset survives Blueprint→Use Template');
  r.selectedFactory=await c.host('Number(document.getElementById("wt-factory-select").value)');assert.ok(r.nativeFactories.some(f=>f.id===r.selectedFactory));await q.capture(c,'scroll-blueprint-reveals-selected-factory-card');
  await q.openPage(c,'saved');for(const id of r.createdIds){await c.tap('#wt-command-pages '+attr('data-delete',id));await c.tap('#wt-command-pages '+attr('data-confirm-delete',id));await c.wait(`!__warzoneCommands.report().saved.some(d=>d.id===${JSON.stringify(id)})`);}
  r.libraryAfter=await c.evaluate('JSON.parse(BlockNightAndroid.loadDesigns())');assert.deepEqual(r.libraryAfter,r.libraryBefore,'UI deletion removes only the four new test copies');r.cleanedIds=r.createdIds.slice();await q.capture(c,'scroll-cleanup-preserves-original-two-models');
  r.pausedAt=await q.pause(c);await q.capture(c,'scroll-handoff-paused');r.errors=c.errors;assert.deepEqual(r.errors,[]);r.passed=true;console.log(JSON.stringify({passed:true,createdIds:r.createdIds,cleanedIds:r.cleanedIds,scroll:r.factoryScroll,remainingModels:r.libraryAfter.designs.length,pausedAt:r.pausedAt}));
 }catch(error){r.failure=String(error.stack||error);try{if(c){await q.capture(c,'scroll-failure');r.failureState=await c.evaluate('({commands:__warzoneCommands.report(),research:__blockNightResearch.report(),waves:__warzoneTowersWaves.report()})');await q.pause(c);}}catch(recovery){r.recoveryFailure=String(recovery);}throw error;
 }finally{fs.writeFileSync(path.join(live.out,'audit-lab-scroll.json'),JSON.stringify(r,null,2));c?.close();}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});module.exports={run};
