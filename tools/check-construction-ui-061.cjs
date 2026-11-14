'use strict';
/* Actual construction UI functions with read-only native snapshots and deferred replies. No device/engine. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),file='app/src/main/assets/warzone-command-pages.js';
const source=fs.readFileSync(path.join(root,file),'utf8'),checks=[];
function functions(text){const starts=[...text.matchAll(/^  (?:async )?function ([A-Za-z0-9_]+)\(/gm)];return new Map(starts.map((m,i)=>[m[1],text.slice(m.index,i+1<starts.length?starts[i+1].index:text.length)]));}
const current=functions(source),clone=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(mode='towers',table=current){
  const nodes=new Map(['wt-sidebar-queue','wt-sidebar-power','wt-sidebar-builders'].map(id=>[id,{hidden:id==='wt-sidebar-queue',innerHTML:'',textContent:''}]));
  const state={snapshot:null,catalog:{buildings:[{id:'Tower',name:'Cannon Tower',category:'DEFENCES'}]},siteNumbers:new Map(),buildOpen:true,placement:null,nativeBuildGroup:[],category:'DEFENCES',size:1,constructionResuming:null,stopGeneration:0};
  const calls=[],requests=[],notices=[],touch={rotationMoves:0},display=[];
  const window={__towersHtml:{session:'document-A',isEnded:()=>Boolean(window.ended)},__kalaWarzoneTouch:{report:()=>touch},WarzoneBuildDisplay:{update:rows=>display.push(clone(rows)),setModuleTargets(){}}};
  if(mode==='campaign')window.__warzoneCampaignMode=true;else if(mode==='ffa')window.__warzoneFfaConfig={mode:'ffa'};
  const context=vm.createContext({state,window,campaign:mode==='campaign',polishedTowers:true,powerSymbol:'P',innerWidth:800,innerHeight:360,
    Math,Number,Object,String,Map,Promise,JSON,esc,image:()=>'',button:(label,attributes='',klass='')=>`<button class="${klass}" ${attributes}>${label}</button>`,element:id=>nodes.get(id),
    moduleTargets:()=>[],updateModuleGuidance(){},fitCatalogueRows:()=>calls.push('fit'),updateCatalogueScroll:()=>calls.push('scroll'),
    refreshLive:()=>calls.push('refresh'),requestState:()=>calls.push('request-state'),notify:text=>notices.push(text),reason:code=>'Native rejection: '+code,
    selectVisibleTrucks(){throw Error('Retry must never choose visible/remote fallback trucks');},refreshBuildSelection(){throw Error('Retry must never replace the explicit native selection');},
    send:(action,data={},options={})=>new Promise((resolve,reject)=>{calls.push(['send',action,clone(data),clone(options)]);requests.push({action,data:clone(data),options:clone(options),resolve,reject});})});
  for(const name of['siteStatus','remainingTime','constructionRows','currentConstruction','currentConstructionRow','constructionResumeControl','compactSiteRow','updateSidebarQueue','resumeConstruction','buildSelectionView','onClick']){
    assert(table.has(name),name);vm.runInContext("'use strict';\n"+table.get(name),context,{filename:file+'#'+name});
  }
  return{context,state,window,calls,requests,notices,touch,nodes,display,
    snapshot(value){state.snapshot=freeze({gameTime:5000,power:1200,trucks:[],jobs:[],constructionSites:[],construction:[],finishedBuilds:[],...clone(value)});},
    paint(){const before=JSON.stringify(state.snapshot);context.updateSidebarQueue();assert.equal(JSON.stringify(state.snapshot),before,'Rendering changed the native snapshot');return nodes.get('wt-sidebar-queue');},
    control(dataset){return{dataset,disabled:false,closest(){return this;}};}};
}
const site=(id,status='queued',extra={})=>({id,itemId:'Tower',x:15,y:17,status,workers:[99],remaining:12,progress:null,...extra});
const blocked=(id='blocked',reason='build-blocked',extra={})=>({id,itemId:'Tower',x:15,y:17,status:'blocked',reason,workers:[99],...extra});
const fresh=(selectedUnits=[{id:11,constructor:true},{id:7,constructor:false},{id:3,constructor:true}])=>freeze({ok:true,result:{gameTime:7200,recoveryContext:'native-world-3',selectedUnits}});
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function check(name,run){await run();checks.push(name);console.log('PASS: '+name);}
async function beginRetry(f,dataset={retryJob:'blocked'}){const operation=f.context.resumeConstruction(f.control(dataset));assert.equal(f.requests.length,1);assert.equal(f.requests[0].action,'state');assert.equal(f.requests[0].options.fresh,true);return{operation,request:f.requests[0]};}
async function main(){
  await check('Delivered0.60 reproduces a blocked native job hidden behind a stale QUEUED journal in all modes',()=>{
    const baseline=cp.execFileSync('python',['-c','import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',path.resolve(root,'../warzone-towers-0.60-source.zip'),file],{encoding:'utf8',maxBuffer:1024*1024});
    for(const mode of['towers','campaign','ffa']){const f=fixture(mode,functions(baseline));f.snapshot({constructionSites:[site('blocked')],jobs:[blocked()]});const html=f.paint().innerHTML;assert.match(html,/QUEUED/);assert.doesNotMatch(html,/CLEAR THE OBSTRUCTION/);if(mode==='campaign')assert.doesNotMatch(html,/RETRY/);}
  });
  await check('A blocked job overrides stale journal QUEUED with a visible obstruction and Retry in all three modes without mutating snapshots',()=>{
    for(const mode of['towers','campaign','ffa'])for(const[reason,label]of[['build-blocked','CLEAR THE OBSTRUCTION'],['site-too-close','BUILDINGS TOO CLOSE'],['invalid-site','SITE OBSTRUCTED']]){
      const f=fixture(mode);f.snapshot({constructionSites:[site('blocked')],jobs:[blocked('blocked',reason)]});const row=f.paint();assert.equal(row.hidden,false);assert.match(row.innerHTML,/data-site-status="blocked"/);assert(row.innerHTML.includes(label));assert.match(row.innerHTML,/data-retry-job="blocked"/);assert.match(row.innerHTML,/>RETRY<\/button>/);assert.doesNotMatch(row.innerHTML,/QUEUED|LEFT/);assert.equal((row.innerHTML.match(/wt-current-site/g)||[]).length,1);
    }
  });
  await check('Only one current item renders, completion advances it, and completed-only history releases the entire summary',()=>{
    for(const mode of['towers','campaign','ffa']){
      const f=fixture(mode);f.snapshot({constructionSites:[site('old','done'),site('second','queued'),site('active','building',{progress:.4}),site('later','building')]});
      let row=f.paint();assert.equal((row.innerHTML.match(/wt-current-site/g)||[]).length,1);assert.match(row.innerHTML,/data-site-id="active"/);assert.match(row.innerHTML,/value="0.4"/);assert.doesNotMatch(row.innerHTML,/data-site-id="old"/);
      f.snapshot({constructionSites:[site('old','done'),site('second','queued'),site('active','done'),site('later','building')]});row=f.paint();assert.match(row.innerHTML,/data-site-id="later"/);
      f.snapshot({constructionSites:[site('old','done'),site('active','done')],finishedBuilds:[site('other','done')]});row=f.paint();assert.equal(row.hidden,true);assert.equal(row.innerHTML,'');assert.equal(f.display.at(-1).length,3,'World history remains outside the compact summary');
    }
  });
  await check('Builder-loss groups retain Waiting for trucks and grouped Resume in Towers/FFA; Campaign exposes Retry only',()=>{
    for(const mode of['towers','ffa','campaign']){
      const f=fixture(mode);f.snapshot({constructionSites:[site('a'),site('b')],jobs:[blocked('a','builder-lost',{recoveryGroup:'lost-group'}),blocked('b','builder-lost',{recoveryGroup:'lost-group'})]});const row=f.paint();assert.match(row.innerHTML,/WAITING FOR TRUCKS/);
      if(mode==='campaign'){assert.match(row.innerHTML,/data-retry-job="a"/);assert.doesNotMatch(row.innerHTML,/data-resume-jobs|data-resume-structure/);}
      else{assert.match(row.innerHTML,/RESUME 2/);assert.match(row.innerHTML,/data-resume-jobs=/);const queue=f.context.constructionRows().map(item=>f.context.compactSiteRow(item)).join('');assert.equal((queue.match(/data-resume-jobs=/g)||[]).length,1);assert.equal(f.context.constructionRows()[0].status,'waiting-trucks');}
      f.snapshot({construction:[{id:91,itemId:'Tower',name:'Cannon Tower',x:15,y:17,status:'waiting-trucks',reason:'builder-lost',workers:0}]});const orphan=f.paint().innerHTML;if(mode==='campaign')assert.doesNotMatch(orphan,/data-resume-structure/);else assert.match(orphan,/data-resume-structure="91"/);
    }
  });
  await check('Retry fetches a fresh native selection, sends only selected constructors with current clock/context, and consumes backend jobIds in every mode',async()=>{
    for(const mode of['towers','campaign','ffa']){
      const f=fixture(mode);f.snapshot({constructionSites:[site('blocked')],jobs:[blocked()],selectedUnits:[{id:99,constructor:true}],trucks:[{id:99,selected:true,x:110,y:110}]});const before=JSON.stringify(f.state.snapshot);
      const{operation,request}=await beginRetry(f);request.resolve(fresh());await settle();assert.equal(f.requests.length,2);const retry=f.requests[1];assert.equal(retry.action,'retry-job');assert.deepEqual(retry.data,{jobId:'blocked',workerIds:[3,11],issuedGameTime:7200,recoveryContext:'native-world-3'});
      retry.resolve({ok:true,result:{jobIds:['blocked'],workerIds:[3,11]}});await operation;assert(f.notices.includes('1 site assigned to selected trucks.'));assert.equal(JSON.stringify(f.state.snapshot),before);assert.equal(f.state.constructionResuming,null);
    }
  });
  await check('Empty/combat-only native selection and a rejected fresh state never recruit cached or remote trucks',async()=>{
    for(const reply of[fresh([]),fresh([{id:21,constructor:false}]),{ok:false,reason:'construction-unreachable'}]){
      const f=fixture();f.snapshot({jobs:[blocked()],trucks:[{id:99,selected:true}]});const{operation,request}=await beginRetry(f);request.resolve(reply);await operation;assert.equal(f.requests.length,1);assert(f.notices.length===1);assert.equal(f.state.constructionResuming,null);
    }
  });
  await check('Actual Campaign retry click uses the shared fresh-selection path instead of an unvalidated direct job command',async()=>{
    const f=fixture('campaign');f.snapshot({jobs:[blocked()]});f.context.onClick({target:f.control({retryJob:'blocked'})});assert.equal(f.requests.length,1);assert.equal(f.requests[0].action,'state');f.requests[0].resolve(fresh([]));await settle();assert.equal(f.requests.length,1);
  });
  await check('Repeated Retry taps share one pending operation and cannot race two native assignments',async()=>{
    const f=fixture();f.snapshot({jobs:[blocked()]});const{operation,request}=await beginRetry(f);await f.context.resumeConstruction(f.control({retryJob:'blocked'}));assert.equal(f.requests.length,1);request.resolve(fresh());await settle();assert.equal(f.requests.length,2);await f.context.resumeConstruction(f.control({retryJob:'blocked'}));assert.equal(f.requests.length,2);f.requests[1].resolve({ok:true,result:{jobIds:['blocked']}});await operation;assert.equal(f.state.constructionResuming,null);assert.equal(f.notices.length,1);
  });
  await check('Stopped, replaced, retired or changed-document fresh replies cannot issue a retry',async()=>{
    for(const change of[f=>f.state.stopGeneration++,f=>f.window.__towersHtml.session='document-B',f=>f.window.ended=true,f=>f.state.constructionResuming=null]){
      const f=fixture();f.snapshot({jobs:[blocked()]});const{operation,request}=await beginRetry(f);change(f);request.resolve(fresh());await operation;assert.equal(f.requests.length,1);assert.equal(f.notices.length,0);assert.equal(f.state.constructionResuming,null,'An abandoned operation left Retry busy');
    }
  });
  await check('A late rejected fresh state after Stop or document change does not post an error into the current world',async()=>{
    for(const change of[f=>f.state.stopGeneration++,f=>f.window.__towersHtml.session='document-B',f=>f.window.ended=true]){
      const f=fixture();f.snapshot({jobs:[blocked()]});const{operation,request}=await beginRetry(f);change(f);request.resolve({ok:false,reason:'battle-ended'});await operation;assert.equal(f.requests.length,1);assert.equal(f.notices.length,0,'Stale state rejection leaked into the current world');
    }
  });
  await check('A late retry success after Stop or document change cannot announce work assigned to the current world',async()=>{
    for(const change of[f=>f.state.stopGeneration++,f=>f.window.__towersHtml.session='document-B',f=>f.window.ended=true]){
      const f=fixture();f.snapshot({jobs:[blocked()]});const{operation,request}=await beginRetry(f);request.resolve(fresh());await settle();assert.equal(f.requests.length,2);change(f);f.requests[1].resolve({ok:true,result:{jobIds:['blocked']}});await operation;assert.equal(f.notices.length,0,'Stale retry acknowledgement leaked into the current world');
    }
  });
  await check('Native retry rejection preserves the failed job and reports its cause without a success announcement',async()=>{
    const f=fixture('campaign');f.snapshot({jobs:[blocked()]});const before=JSON.stringify(f.state.snapshot),{operation,request}=await beginRetry(f);request.resolve(fresh());await settle();f.requests[1].resolve({ok:false,reason:'construction-selection-changed'});await operation;assert.deepEqual(f.notices,['Native rejection: construction-selection-changed']);assert.equal(JSON.stringify(f.state.snapshot),before);
  });
  await check('Recovery groups and native-only foundations send the same fresh explicit workers through their specific backend actions',async()=>{
    for(const[dataset,action,identity]of[[{resumeJobs:'["a","b"]',recoveryGroup:'lost-group'},'resume-builds',{jobIds:['a','b'],recoveryGroup:'lost-group'}],[{resumeStructure:'91'},'resume-structure',{structureId:91}]]){
      const f=fixture();f.snapshot({jobs:[blocked()]});const{operation,request}=await beginRetry(f,dataset);request.resolve(fresh());await settle();assert.equal(f.requests.length,2);assert.equal(f.requests[1].action,action);assert.deepEqual(f.requests[1].data,{...identity,workerIds:[3,11],issuedGameTime:7200,recoveryContext:'native-world-3'});f.requests[1].resolve({ok:true,result:{jobIds:['a','b']}});await operation;assert(f.notices.includes('2 sites assigned to selected trucks.'));
    }
  });
  await check('Rotation invalidates the visible-truck selection view while identical observations stay stable',()=>{
    const f=fixture();const before=f.context.buildSelectionView();assert.equal(f.context.buildSelectionView(),before);f.touch.rotationMoves=1;const rotated=f.context.buildSelectionView();assert.notEqual(rotated,before);assert.equal(f.context.buildSelectionView(),rotated);f.touch.rotationMoves=2;assert.notEqual(f.context.buildSelectionView(),rotated);
  });
  console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
