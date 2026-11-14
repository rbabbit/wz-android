'use strict';
// Source-only protocol checks. The existing native/Android save fixture is
// reused rather than maintaining a second imitation of the archive pipeline.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseName='tools/check-saved-games-027.cjs';
const appName='app/src/main/assets/warzone/saved-games.js',checks=[];
let head=fs.readFileSync(path.join(root,baseName),'utf8').split('\nasync function check(')[0];
assert(head.includes('function fixture(options={}){'),'Existing save fixture seam changed');
function replaceOne(from,to){assert.equal(head.split(from).length,2,'Fixture seam changed: '+from);head=head.replace(from,to);}
replaceOne("return JSON.stringify({ok:true,id:slot});", "return JSON.stringify(options.archiveRejected?{ok:false,error:'Phone archive rejected'}:{ok:true,id:slot});");
replaceOne('  vm.runInNewContext(source,context,{filename:file});', `
  context.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
  window.dispatchEvent=event=>{
    calls.push(['save-status',clone(event.detail)]);
    if(options.endAtPhase===event.detail.phase&&!done){done=true;listeners.get('warzone-battle-ended')?.();}
    if(options.brokenObserver)throw Error('Display observer failed');
    return true;
  };
  if(options.frames){window.requestAnimationFrame=fn=>setTimeout(()=>{calls.push(['paint-frame']);fn(now);},16);window.cancelAnimationFrame=clearTimeout;}
  let drawerOpen=Boolean(options.drawerOpen);
  window.WarzoneRewards.report=()=>({nativeDrawerOpen:drawerOpen});
  window.WarzoneRewards.closeDrawer=()=>{
    calls.push(['close-rewards']);
    if(!options.drawerNeverCloses)setTimeout(()=>{drawerOpen=false;calls.push(['closed-rewards']);},20);
  };
  if(options.notReady)window.WarzoneRewards.ready=false;
  if(options.purchaseBusy)window.WarzoneRewards.busy=true;
  vm.runInNewContext(source,context,{filename:file});`);
const fixtureModule={exports:{}};
vm.runInNewContext(head+'\nmodule.exports={fixture};',{
  require,__dirname:path.join(root,'tools'),module:fixtureModule,console,process,Buffer,
  setImmediate,URLSearchParams,TextEncoder,TextDecoder
},{filename:baseName+' (instrumented protocol fixture)'});
const {fixture}=fixtureModule.exports;
const statuses=f=>f.calls.filter(c=>c[0]==='save-status').map(c=>c[1]);
async function check(name,run){await run();checks.push({name,passed:true});}
(async()=>{
  await check('Accepted Save emits busy feedback synchronously, before native preparation or F7',async()=>{
    const f=fixture({frames:true});try{const pending=f.api.save();assert.equal(f.api.report().busy,true);assert.equal(statuses(f)[0].phase,'start');assert.equal(statuses(f)[0].busy,true);assert(!f.calls.some(c=>c[0]==='build-exit'||c[0]==='key'));assert.equal(await f.finish(pending),true);const paint=f.calls.findIndex(c=>c[0]==='paint-frame'),key=f.calls.findIndex(c=>c[0]==='key');assert(paint>=0&&paint<key);}finally{f.dispose();}
  });
  await check('Repeated busy taps keep the same operation and create exactly one archive',async()=>{
    const f=fixture();try{const pending=f.api.save();assert.equal(await f.api.save(),false);assert.equal(f.api.report().busy,true);assert.equal(f.notices.length,0);assert.equal(await f.finish(pending),true);assert.equal(f.calls.filter(c=>c[0]==='key').length,1);assert.equal(f.calls.filter(c=>c[0]==='archive').length,1);assert(statuses(f).every(s=>s.phase!=='saved'||!s.busy));}finally{f.dispose();}
  });
  await check('Saved feedback follows real phone archive acknowledgement and exposes its ID',async()=>{
    const f=fixture({frames:true});try{assert.equal(await f.finish(f.api.save()),true);const archive=f.calls.findIndex(c=>c[0]==='archive'),saved=f.calls.findIndex(c=>c[0]==='save-status'&&c[1].phase==='saved');assert(archive>=0&&saved>archive);const s=statuses(f).at(-1);assert.equal(s.busy,false);assert.match(s.savedId,/^wt_[a-f0-9]{32}$/);assert.equal(s.status,'Game saved');assert.equal(f.api.report().phase,'saved');assert.deepEqual(Array.from(statuses(f),s=>s.phase),['start','save','write','saved']);}finally{f.dispose();}
  });
  await check('Readiness and active-purchase rejections expose errors immediately without saving',async()=>{
    for(const option of [{notReady:true},{purchaseBusy:true}]){const f=fixture(option);try{const pending=f.api.save();assert.equal(f.api.report().phase,'error');assert.equal(f.api.report().busy,false);assert(statuses(f).at(-1).error);assert.equal(await f.finish(pending),false);assert(!f.calls.some(c=>c[0]==='key'||c[0]==='archive'));}finally{f.dispose();}}
  });
  await check('A rejected phone archive and failed storage sync never show Saved',async()=>{
    for(const option of [{archiveRejected:true},{syncError:true}]){const f=fixture(option);try{assert.equal(await f.finish(f.api.save()),false);assert(!statuses(f).some(s=>s.phase==='saved'));assert.equal(f.api.report().phase,'error');assert.equal(f.api.report().busy,false);assert.equal(f.api.report().savedId,'');}finally{f.dispose();}}
  });
  await check('Death at first feedback or native-write stage cannot publish a stale Saved state',async()=>{
    for(const phase of ['start','write']){const f=fixture({endAtPhase:phase});try{assert.equal(await f.finish(f.api.save()),false);await f.advance(1000);assert(!statuses(f).some(s=>s.phase==='saved'));assert(!f.calls.some(c=>c[0]==='archive'));assert.equal(f.api.report().ended,true);assert.equal(f.api.report().busy,false);assert.equal(f.api.report().phase,'ended');}finally{f.dispose();}}
  });
  await check('Save waits for the native Rewards drawer close acknowledgement before F7',async()=>{
    const f=fixture({drawerOpen:true,frames:true});try{assert.equal(await f.finish(f.api.save()),true);const closed=f.calls.findIndex(c=>c[0]==='closed-rewards'),key=f.calls.findIndex(c=>c[0]==='key');assert(closed>=0&&key>closed);}finally{f.dispose();}
  });
  await check('Missing animation frames stay bounded; an unclosed drawer fails within the original 15-second deadline',async()=>{
    const f=fixture({drawerOpen:true,drawerNeverCloses:true});try{assert.equal(await f.finish(f.api.save()),false);assert.equal(f.api.report().phase,'error');assert(f.api.report().statusAt<=16050);assert(!f.calls.some(c=>c[0]==='key'||c[0]==='archive'));await f.advance(1000);assert(!statuses(f).some(s=>s.phase==='saved'));}finally{f.dispose();}
  });
  await check('A broken display observer cannot invalidate an acknowledged save',async()=>{
    const f=fixture({brokenObserver:true});try{assert.equal(await f.finish(f.api.save()),true);assert.equal(f.api.report().phase,'saved');assert.equal(f.api.report().busy,false);assert.equal(f.calls.filter(c=>c[0]==='archive').length,1);}finally{f.dispose();}
  });
  const sources=[appName,baseName,'tools/check-save-feedback-033.cjs'].map(name=>({path:name,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}));
  const report={version:'0.33',emulatorUsed:false,androidRuntimeExecuted:false,actualNativeEngineExecuted:false,
    scope:'Source protocol fixtures with the existing native/Android stubs; not gameplay or visual acceptance.',passed:true,sourceCheckGroupsPassed:checks.length,checks,sources};
  fs.writeFileSync(path.join(root,'archive/save-feedback-0.33-source-checks.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,sourceCheckGroupsPassed:checks.length,emulatorUsed:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
