'use strict';
// ROOT-RUN ONLY against the already loaded exact APK and prepared native save.
// No save injection, facility construction, grants or manufacturing orders.
// --inspect-controls navigates the actual Manufacturing controls using touches.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('./device-086.cjs');
const routes={towers:'/warzone/mobile.html',ffa:'/warzone/mobile-ffa.html',campaign:'/warzone/mobile-campaign.html',multiplayer:'/multiplayer/index.html'};
const family=f=>/cyborg/i.test(f.kind)?'cyborg':/vtol/i.test(f.kind)?'vtol':'vehicle';
async function fresh(c){const reply=await c.child('__warzoneCommands.send("state",{},{fresh:true})');assert.equal(reply.ok,true,'Fresh native command acknowledgement');return reply.result;}
async function inspect(mode,options={}){
 assert(routes[mode],'Explicit mode required');const c=await q.connect(routes[mode]);
 const proof={mode,actualAndroid:true,ordersIssued:false,seeded:options.seeded===true,source:'Already loaded prepared native save; fresh native state plus actual shared Manufacturing controls',observations:[]};
 try{
  proof.initial=await fresh(c);proof.saved=await c.child('globalThis.WarzoneSavedGames?.report?.()||null');
  proof.factories=proof.initial.factories.map(f=>({id:f.id,kind:f.kind,ready:f.ready,templates:f.templates,active:f.active,currentProduction:f.currentProduction,queue:f.queue,repeat:f.repeat,progress:f.progress}));
  if(options.controls){
   if(await c.child('__warzoneCommands.report().page')!=='factory')await c.tap('#wt-open-factory');
   await c.wait('document.querySelector(".wt-factory-family-bar")','Manufacturing toolbar');
   for(const group of ['vehicle','cyborg']){
    const factories=proof.initial.factories.filter(f=>f.ready&&family(f)===group).sort((a,b)=>a.id-b.id);
    if(!factories.length){proof.observations.push({group,available:false});continue;}
    await c.tap('[data-factory-family="'+group+'"]');
    for(const factory of factories.slice(0,2)){
     await c.tap('[data-factory="'+factory.id+'"]');
     await c.wait('document.querySelector("#wt-factory-select")?.value==='+JSON.stringify(String(factory.id)),'Selected actual native factory');
     const observed=await c.evaluate(`(()=>{const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};},rows=[...document.querySelectorAll('.wt-factory-design-row')];return{viewport:[innerWidth,innerHeight],rows:rows.map(r=>({name:r.querySelector('strong')?.textContent,key:r.dataset.recipeKey,all:[...r.querySelectorAll('.wt-factory-all')].map(e=>({box:box(e),enabled:!e.disabled,pressed:e.getAttribute('aria-pressed')})),cycle:[...r.querySelectorAll('.wt-factory-repeat')].map(e=>({box:box(e),pressed:e.getAttribute('aria-pressed')})),manufacture:[...r.querySelectorAll('.wt-factory-produce')].map(e=>({box:box(e),enabled:!e.disabled}))}))}})()`);
     const expected=factory.id===factories[0].id;
     assert(observed.rows.every(r=>r.all.length===(expected?1:0)),'ALL restricted to first completed native '+group+' factory');
     assert(observed.rows.every(r=>r.cycle.length===1),'Per-factory cycle preserved');
     proof.observations.push({group,factoryId:factory.id,firstFactory:expected,...observed,native:await fresh(c)});
     q.screen('manufacturing086-'+mode+'-'+group+'-'+(expected?'first':'second'));
    }
   }
  }
  proof.passed=true;
 }catch(error){proof.passed=false;proof.error=error.stack||String(error);throw error;}
 finally{fs.writeFileSync(path.join(q.out,'manufacturing086-'+mode+'-probe.json'),JSON.stringify(proof,null,2)+'\n');c.close();}
 return proof;
}
module.exports={inspect,fresh,routes,family};
if(require.main===module){const args=process.argv.slice(2);inspect(args[0],{controls:args.includes('--inspect-controls'),seeded:args.includes('--seeded')}).then(p=>console.log(JSON.stringify({passed:p.passed,mode:p.mode,factories:p.factories.map(f=>({id:f.id,kind:f.kind,ready:f.ready})),observations:p.observations.length}))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
