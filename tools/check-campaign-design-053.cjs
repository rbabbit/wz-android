'use strict';
// Actual UI function execution with a bounded DOM/native-command fixture.
// No browser/emulator/native gameplay is simulated or claimed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),input='app/src/main/assets/warzone-command-pages.js',source=fs.readFileSync(path.join(root,input),'utf8');
const starts=[...source.matchAll(/^  (?:async )?function ([A-Za-z0-9_]+)\(/gm)],functions=new Map(starts.map((m,i)=>[m[1],source.slice(m.index,i+1<starts.length?starts[i+1].index:source.length)]));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const copy=v=>JSON.parse(JSON.stringify(v));
function fixture(campaign=true,selectedFunctions=functions){
 const nodes=new Map(['wt-design-valid','wt-save-design','wt-save-as-new','wt-page-content','wt-command-pages','warzone-game-frame'].map(id=>[id,{textContent:'',disabled:true,dataset:{},scrollTop:0}]));
 const counters={validation:0,renders:0,persist:0},timers=new Map(),requests=[];let timerSerial=0;
 const snapshot={gameTime:1000,hasHQ:false,buildings:[],parts:['Body1REC','wheeled01','MG1Mk1','Spade1Mk1'],factories:[],templates:[]};
 const state={snapshot,validation:{ok:false,reason:'hq-required'},validationSerial:0,designContextSerial:0,page:'design',pending:new Map(),acks:0,lastBatch:null,modulePending:new Map(),buildOpen:false,
  draft:{id:'d1',name:'Viper MG',body:'Body1REC',propulsion:'wheeled01',turrets:['MG1Mk1']},saving:new Set(),saved:[],history:[],productionRequests:new Map(),productionFeedback:new Map(),productionSerial:0,scroll:{},navigationSerial:0,opens:0,
  catalog:JSON.parse(fs.readFileSync(path.join(root,'scenario/warzone-towers-catalog.json'),'utf8'))};
 const c={state,campaign,polishedTowers:true,validationTimer:0,window:{addEventListener(){},__blockNightResearch:{acceptQueues(){}},WarzoneBuildDisplay:{setFacilityTargets(){}},__towersHtml:{isEnded:()=>false}},
  element:id=>nodes.get(id),reason:s=>s==='hq-required'?'A completed Command Centre is required to design units.':s,
  doc:{body:{dataset:{}}},host:{TowersStatus:{close(){}},WarzoneHost:{resetScroll(){}}},document:{},
  clearTimeout:id=>timers.delete(id),setTimeout:fn=>{const id=++timerSerial;timers.set(id,fn);return id;},
  reconcileModuleRequests(){},syncDesignParts(){counters.validation++;c.validateDraft?.();},updateHUD(){},refreshLive(){},render(){counters.renders++;},renderSidebar(){},flush(){},
  readDraft(){},persist(){counters.persist++;return true;},resetDraft(){},open(){},notify(){},factoryName:()=> 'Factory',productionRequestsFor:()=>[],updateProductionFeedback(){},
  cancelDemolish(){},rememberPanelScroll(){},install(){},updateHeaderMenus(){},requestState(){},
  send:(action,data)=>{requests.push({action,data});return Promise.resolve({ok:true,result:{...data?.design,cost:60,points:80}});}};
 vm.createContext(c);
 function load(names){for(const n of names){assert(selectedFunctions.has(n),n);vm.runInContext(selectedFunctions.get(n),c,{filename:input+'#'+n});}}
 load(['payload','designStatus','validateDraft']);if(selectedFunctions.has('invalidateCampaignDesign'))load(['invalidateCampaignDesign']);
 function accept(result){const nonce='reply-'+state.acks;state.pending.set(nonce,{resolve(){}});c.accept({nonce,action:'state',ok:true,result});}
 async function runTimers(){const run=Array.from(timers.values());timers.clear();for(const fn of run)fn();await Promise.resolve();await Promise.resolve();}
 return {c,state,nodes,counters,timers,requests,load,accept,runTimers};
}
function baseline(){
 const f=fixture();f.load(['accept']);f.accept({...f.state.snapshot,gameTime:2000,hasHQ:true});
 assert.equal(f.state.snapshot.hasHQ,true);assert.equal(f.state.validation.reason,'hq-required');assert.equal(f.counters.validation,0);assert.equal(f.timers.size,0);
 const g=fixture();g.state.validation=null;g.c.designStatus();assert.equal(g.nodes.get('wt-design-valid').textContent,'Choose components to validate your design.');
 const file=path.join(root,'archive/campaign-design-0.53-baseline.json');assert(!fs.existsSync(file),'Baseline proof is immutable');
 fs.writeFileSync(file,JSON.stringify({version:'0.53',baseline:'0.52',reproduced:true,emulatorUsed:false,scope:'Actual accept/designStatus functions with synthetic native state only',HQCompleted:f.state.snapshot.hasHQ,cachedValidation:copy(f.state.validation),validationRequests:f.timers.size,
  reopenedDesignSkipsCachedFailure:source.includes("if(page==='design'&&!state.validation)validateDraft();"),preHQMessageOverwritten:g.nodes.get('wt-design-valid').textContent,sources:[{path:input,sha256:hash(input)}],recordedUTC:new Date().toISOString()},null,2)+'\n');
 console.log('PASS preserved Campaign Design baseline cache/feedback reproduction');
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
async function current(){
 const checks=[],check=async(name,body)=>{await body();checks.push(name);};
 await check('Campaign pre-HQ drafts keep the actual Command Centre requirement visible and cannot be saved',()=>{
  const f=fixture();f.state.validation=null;f.c.validateDraft();assert.equal(f.state.validation.reason,'hq-required');
  assert.match(f.nodes.get('wt-design-valid').textContent,/completed Command Centre/);assert.equal(f.nodes.get('wt-save-design').disabled,true);assert.equal(f.requests.length,0);assert.equal(f.timers.size,0);
  f.state.draft.body='';f.c.validateDraft();assert.match(f.nodes.get('wt-design-valid').textContent,/Command Centre/);
 });
 await check('Completing HQ while Design remains open invalidates the cached failure and obtains a fresh native validation',async()=>{
  const f=fixture();f.load(['accept']);f.accept({...f.state.snapshot,gameTime:2000,hasHQ:true});assert.equal(f.state.validation,null);assert.equal(f.timers.size,1);
  await f.runTimers();assert.equal(f.state.validation.ok,true);assert.equal(f.nodes.get('wt-save-design').disabled,false);assert.match(f.nodes.get('wt-design-valid').textContent,/POWER 60/);
 });
 await check('HQ completion while Design is closed clears old failure; reopening actually revalidates the complete draft',async()=>{
  const f=fixture();f.load(['accept','open']);f.state.page='';f.accept({...f.state.snapshot,gameTime:2000,hasHQ:true});assert.equal(f.state.validation,null);assert.equal(f.timers.size,0);
  f.c.open('design');assert.equal(f.timers.size,1);await f.runTimers();assert.equal(f.state.validation.ok,true);
 });
 await check('Reopening Campaign Design always refreshes a cached HQ failure even when the previous state transition was not observed',async()=>{
  const f=fixture();f.load(['open']);f.state.page='';f.state.snapshot.hasHQ=true;assert.equal(f.state.validation.reason,'hq-required');
  f.c.open('design');await f.runTimers();assert.equal(f.state.validation.ok,true);
 });
 await check('HQ loss invalidates cached success immediately, disables save, and remains clear after close/reopen',async()=>{
  const f=fixture();f.load(['accept','open']);f.state.snapshot.hasHQ=true;f.state.validation={ok:true,result:{cost:60,points:80}};
  f.c.designStatus();assert.equal(f.nodes.get('wt-save-design').disabled,false);f.accept({...f.state.snapshot,hasHQ:false,gameTime:2000});
  assert.equal(f.state.validation.reason,'hq-required');assert.equal(f.nodes.get('wt-save-design').disabled,true);
  f.state.page='';f.c.open('design');assert.equal(f.timers.size,0);assert.match(f.nodes.get('wt-design-valid').textContent,/Command Centre/);
 });
 await check('New authored component grants refresh available choices and validate the unchanged draft without inventing research',async()=>{
  const f=fixture();f.load(['accept','availableParts']);f.state.snapshot.hasHQ=true;
  assert(!f.c.availableParts('Weapon').some(p=>p.id==='Cannon1Mk1'));
  f.accept({...f.state.snapshot,gameTime:2000,parts:[...f.state.snapshot.parts,'Cannon1Mk1']});
  assert(f.c.availableParts('Weapon').some(p=>p.id==='Cannon1Mk1'));assert.equal(f.timers.size,1);await f.runTimers();assert.equal(f.state.validation.ok,true);
  assert.equal(f.requests[0].data.design.body,'Body1REC');assert.deepEqual(copy(f.state.snapshot.parts),['Body1REC','wheeled01','MG1Mk1','Spade1Mk1','Cannon1Mk1']);
 });
 await check('A native validation arriving after HQ loss cannot restore a stale successful save button',async()=>{
  const f=fixture();f.load(['accept']);f.state.snapshot.hasHQ=true;let answer;
  f.c.send=()=>new Promise(resolve=>{answer=resolve;});f.c.validateDraft();await f.runTimers();
  f.accept({...f.state.snapshot,hasHQ:false,gameTime:2000});answer({ok:true,result:{cost:60,points:80}});await settle();
  assert.equal(f.state.validation.reason,'hq-required');assert.equal(f.nodes.get('wt-save-design').disabled,true);
 });
 await check('An older validation reply cannot overwrite the fresh result after HQ completion or a part change',async()=>{
  const f=fixture();f.load(['accept']);f.state.snapshot.hasHQ=true;const answers=[];f.c.send=()=>new Promise(resolve=>answers.push(resolve));
  f.c.validateDraft();await f.runTimers();f.accept({...f.state.snapshot,gameTime:2000,parts:[...f.state.snapshot.parts,'Cannon1Mk1']});await f.runTimers();
  answers[1]({ok:true,result:{cost:61,points:81}});await settle();answers[0]({ok:false,reason:'hq-required'});await settle();
  assert.equal(f.state.validation.ok,true);assert.equal(f.state.validation.result.cost,61);
 });
 await check('Mission/load context invalidation cancels pending timers and ignores validation acknowledgments from the old world',async()=>{
  const f=fixture();f.state.snapshot.hasHQ=true;let answer;f.c.send=()=>new Promise(resolve=>{answer=resolve;});
  f.c.validateDraft();f.c.invalidateCampaignDesign(false,true);assert.equal(f.timers.size,0);
  f.c.validateDraft();await f.runTimers();const version=f.state.designContextSerial;f.c.invalidateCampaignDesign(false,true);assert.equal(f.state.designContextSerial,version+1);
  answer({ok:true,result:{cost:60,points:80}});await settle();assert.equal(f.state.validation,null);assert.equal(f.nodes.get('wt-save-design').disabled,true);
  assert.match(functions.get('endBattle'),/if\(campaign\)invalidateCampaignDesign\(false,true\)/);assert.match(source,/resetSession:\(\)=>\{if\(campaign\)\{endBattle\(\)/);
 });
 await check('Old-context save replies neither persist stale designs nor clear the new context save-busy state',async()=>{
  const f=fixture();f.load(['saveDesign']);f.state.snapshot.hasHQ=true;f.state.validation={ok:true,result:{cost:60,points:80}};const answers=[];
  f.c.send=()=>new Promise(resolve=>answers.push(resolve));f.c.saveDesign();assert(f.state.saving.has('d1'));
  f.c.invalidateCampaignDesign(false,true);assert.equal(f.state.saving.size,0);f.state.validation={ok:true,result:{cost:60,points:80}};f.c.saveDesign();
  answers[0]({ok:true,result:{...f.state.draft,cost:60,points:80}});await settle();assert.equal(f.state.saved.length,0);assert(f.state.saving.has('d1'));
  answers[1]({ok:true,result:{...f.state.draft,cost:61,points:81}});await settle();assert.equal(f.state.saved.length,1);assert.equal(f.state.saved[0].cost,61);assert.equal(f.state.saving.size,0);
 });
 await check('A successfully native-validated Campaign design persists and reaches the normal Manufacturing command with exact components and factory',async()=>{
  const f=fixture();f.load(['saveDesign','queueProduction']);f.state.snapshot.hasHQ=true;f.state.validation={ok:true,result:{cost:60,points:80}};
  f.c.send=(action,data)=>{f.requests.push({action,data});return Promise.resolve({ok:true,result:action==='save-design'?{...data.design,cost:60,points:80,native:{private:true}}:{count:1}});};
  f.c.saveDesign();await settle();assert.equal(f.counters.persist,1);assert.equal(f.state.saved[0].native,undefined);
  f.state.factory=99;f.state.snapshot.factories=[{id:99,ready:true}];f.c.queueProduction({dataset:{produce:'d1'}});await settle();
  const production=f.requests.find(r=>r.action==='queue-production');assert(production);assert.equal(production.data.factoryId,99);assert.equal(production.data.count,1);
  assert.deepEqual(copy(production.data.design.turrets),['MG1Mk1']);assert.equal(production.data.design.body,'Body1REC');assert.equal(production.data.design.propulsion,'wheeled01');assert.equal(f.state.productionRequests.size,0);
 });
 await check('Native rejection remains authoritative and failed phone persistence does not add a blueprint',async()=>{
  const f=fixture();f.load(['saveDesign']);f.state.snapshot.hasHQ=true;f.c.send=()=>Promise.resolve({ok:false,reason:'incompatible-design'});
  f.c.validateDraft();await f.runTimers();assert.equal(f.state.validation.ok,false);assert.equal(f.nodes.get('wt-save-design').disabled,true);f.c.saveDesign();assert.equal(f.state.saved.length,0);
  f.state.validation={ok:true,result:{cost:60,points:80}};f.c.persist=()=>false;f.c.send=(action,data)=>Promise.resolve({ok:true,result:{...data.design,cost:60,points:80}});f.c.saveDesign();await settle();assert.equal(f.state.saved.length,0);
 });
 const priorSource=cp.execFileSync('python',['-c',String.raw`import json,pathlib,sys,zipfile
r=pathlib.Path(sys.argv[1]);f=json.loads((r/'archive/fallback-0.53.json').read_text());p=next(x['path'] for x in f['files'] if x['path'].endswith('.zip'));sys.stdout.buffer.write(zipfile.ZipFile(p).read('app/src/main/assets/warzone-command-pages.js'))`,root],{encoding:'utf8',maxBuffer:1024*1024});
 const oldStarts=[...priorSource.matchAll(/^  (?:async )?function ([A-Za-z0-9_]+)\(/gm)],prior=new Map(oldStarts.map((m,i)=>[m[1],priorSource.slice(m.index,i+1<oldStarts.length?oldStarts[i+1].index:priorSource.length)]));
 await check('Towers and Duel retain their earlier cached validation, HQ-transition and draft/save command behavior',async()=>{
  for(const polished of [true,false]){
   const now=fixture(false),old=fixture(false,prior);now.c.polishedTowers=polished;old.c.polishedTowers=polished;
   now.load(['accept']);old.load(['accept']);now.accept({...now.state.snapshot,gameTime:2000,hasHQ:true});old.accept({...old.state.snapshot,gameTime:2000,hasHQ:true});
   assert.deepEqual(copy(now.state.validation),copy(old.state.validation));assert.equal(now.timers.size,old.timers.size);
   now.c.validateDraft();old.c.validateDraft();await now.runTimers();await old.runTimers();assert.deepEqual(copy(now.requests),copy(old.requests));assert.equal(now.nodes.get('wt-design-valid').textContent,old.nodes.get('wt-design-valid').textContent);
  }
 });
 const files=[input,'tools/check-campaign-design-053.cjs'];const report={version:'0.53',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,gameplayVerified:false,
  scope:'Actual UI function execution with synthetic HQ/part snapshots and asynchronous command replies; native makeTemplate, real storage and gameplay require exact-APK runtime checks',
  baselineProof:'archive/campaign-design-0.53-baseline.json',backendModified:false,authoredResearchModified:false,HQRequirementPreserved:true,sources:files.map(p=>({path:p,sha256:hash(p)})),recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(root,'archive/campaign-design-0.53-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,report:'archive/campaign-design-0.53-checks.json'}));
}
if(process.argv.includes('--baseline'))baseline();
else if(require.main===module)current().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,functions,copy,hash,root,input,source};
