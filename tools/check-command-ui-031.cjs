'use strict';
// Actual command-page functions under controlled native replies, not an emulator.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sourcePath='app/src/main/assets/warzone-command-pages.js';
const source=fs.readFileSync(path.join(root,sourcePath),'utf8');
const section=(from,to)=>{const a=source.indexOf('  function '+from+'('),b=source.indexOf('  function '+to+'(',a);assert(a>=0&&b>a);return source.slice(a,b);};
let checks=0;const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
const plain=v=>JSON.parse(JSON.stringify(v));
async function navigation(){
 const state={page:'',buildOpen:false,sidebarOpening:false,placement:null,nativeMenu:'',navigationSerial:0,headerRequest:null,factory:11,snapshot:{factories:[{id:11,ready:true}]}};
 const calls=[],attrs={},context=vm.createContext({state,polishedTowers:true,
  element:id=>({setAttribute:(name,value)=>attrs[id+':'+name]=value}),
  window:{__kalaWarzoneTouch:{setHeaderMenuState:(page,visible)=>calls.push(['aria',page,visible])}},
  open:page=>{calls.push(['open',page]);state.navigationSerial++;if(!context.deferOpen){if(page==='build')state.buildOpen=true;else state.page=page;}},
  close:()=>{calls.push(['close']);state.page='';return Promise.resolve();},
  selectMode:(...args)=>{calls.push(['selectMode',...args]);state.buildOpen=false;state.sidebarOpening=false;state.placement=null;return Promise.resolve();},deferOpen:false});
 vm.runInContext(section('headerPage','open'),context);
 check('Production header opens and closes through its own action',()=>{context.toggle('factory');assert.equal(state.page,'factory');context.toggle('factory');assert.equal(state.page,'');});
 check('Production closes the Design/Blueprint subpages as the same menu',()=>{state.page='design';context.toggle('factory');assert.equal(state.page,'');state.page='saved';context.toggle('factory');assert.equal(state.page,'');});
 check('Queue is an independent header toggle',()=>{context.toggle('queue');assert.equal(state.page,'queue');context.toggle('queue');assert.equal(state.page,'');});
 check('Build header close uses the keep-orders exit without STOP/discard',()=>{state.buildOpen=true;state.placement={id:'GuardTower1'};context.toggleBuild();assert.deepEqual(calls.at(-1),['selectMode']);assert.equal(state.buildOpen,false);});
 check('A second tap cancels a Build sidebar still opening',()=>{state.sidebarOpening=true;context.toggleBuild();assert.deepEqual(calls.at(-1),['selectMode']);assert.equal(state.sidebarOpening,false);});
 check('A second tap invalidates a deferred header open',()=>{context.deferOpen=true;context.toggle('factory');const revision=state.navigationSerial;context.toggle('factory');assert(state.navigationSerial>revision);assert.equal(state.headerRequest,null);context.deferOpen=false;});
 check('Menu expansion reflects actual panels for assistive controls',()=>{state.page='saved';state.buildOpen=false;context.updateHeaderMenus();assert.equal(attrs['wt-open-factory:aria-expanded'],'true');assert.equal(attrs['wt-open-build:aria-expanded'],'false');assert.equal(attrs['wt-open-queue:aria-expanded'],'false');});
 vm.runInContext(section('openFactory','headerPage'),context);
 check('Facility taps keep their force-open API and exact target ID',()=>{state.page='factory';assert.equal(context.openFactory(11),true);assert.deepEqual(calls.at(-1),['open','factory']);assert.equal(context.openFactory(999),false);});
}
async function production(){
 const state={page:'factory',factory:11,productionCount:1,productionSerial:0,snapshot:{factories:[{id:11,ready:true,kind:'FACTORY',queue:[{id:'existing'}]},{id:12,ready:true,kind:'FACTORY',queue:[]}]},saved:[{id:'saved',name:'Saved unit',body:'Body1',propulsion:'Wheels',turrets:['MG']}],productionRequests:new Map(),productionFeedback:new Map()};
 const makeButton=dataset=>({dataset,textContent:'PRODUCE 1',attrs:{},classList:{toggle(){}},setAttribute(name,value){this.attrs[name]=value;}});
 const native=makeButton({produceTemplate:'native:truck'}),saved=makeButton({produce:'saved'}),target={hidden:true,dataset:{},textContent:''},quantity={value:'1'},notice={textContent:''};
 const requests=[],fresh=[],notices=[],timers=[];let viewButtons=[native,saved],ended=false;
 const context=vm.createContext({state,polishedTowers:true,Date,Map,Number,Boolean,JSON,Array,
  window:{__towersHtml:{isEnded:()=>ended}},
  element:id=>id==='wt-produce-count'?quantity:id==='wt-production-feedback'?target:id==='wt-command-notice'?notice:id==='wt-page-content'?{querySelectorAll:()=>viewButtons}:null,
  factoryName:f=>'FACTORY '+f.id,notify:text=>{notices.push(text);state.notice=text;notice.textContent=text;},reason:code=>code,esc:value=>String(value),setTimeout:fn=>{timers.push(fn);return timers.length;},
  send:(action,data,options)=>{if(action==='state'){fresh.push(options);return Promise.resolve({ok:true});}let resolve;const promise=new Promise(r=>resolve=r);requests.push({action,data,resolve});return promise;}});
 vm.runInContext(section('productionRequestsFor','factoryWaitingGroups'),context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const initialQueues=JSON.stringify(state.snapshot.factories.map(f=>f.queue));
 check('One tap shows pending immediately while preserving the clicked count and factory',()=>{context.queueProduction(native);assert.equal(requests.length,1);assert.equal(native.textContent,'ADDING…');assert.equal(native.attrs['aria-busy'],'true');assert.equal(target.textContent,'Adding 1 to Factory 11…');assert.deepEqual(plain(requests[0].data),{factoryId:11,count:1,templateId:'native:truck'});assert.equal(JSON.stringify(state.snapshot.factories.map(f=>f.queue)),initialQueues);});
 check('A deliberate second tap makes exactly one additional request without disabling input',()=>{context.queueProduction(native);assert.equal(requests.length,2);assert.equal(state.productionRequests.size,2);assert.equal(target.textContent,'Adding 2 to Factory 11…');assert.equal(native.disabled,undefined);});
 requests[1].resolve({ok:true,result:{factoryId:11,count:1}});await settle();
 check('Out-of-order native acceptance retains other pending input without inventing queue rows',()=>{assert.equal(state.productionRequests.size,1);assert.equal(target.textContent,'Adding 1 to Factory 11…');assert.equal(JSON.stringify(state.snapshot.factories.map(f=>f.queue)),initialQueues);assert.equal(fresh.length,1);assert.equal(fresh[0].fresh,true);});
 requests[0].resolve({ok:false,reason:'queue-full'});await settle();
 check('Native rejection shows its error, never a false success, and restores the Produce label',()=>{assert.equal(target.textContent,'queue-full');assert.equal(target.dataset.tone,'error');assert.equal(native.textContent,'PRODUCE 1');assert.equal(native.attrs['aria-busy'],'false');assert.equal(notices.at(-1),'queue-full');});
 quantity.value='5';state.productionCount=5;context.queueProduction(native);
 check('Starting a fresh production burst clears its own old rejection notice',()=>{assert.equal(state.notice,'');assert.equal(notice.textContent,'');});
 check('Bulk quantity is captured once per tap instead of changing with later UI selection',()=>{quantity.value='1';state.productionCount=1;assert.equal(requests[2].data.count,5);assert.equal(target.textContent,'Adding 5 to Factory 11…');});
 state.factory=12;viewButtons=[native];context.updateProductionFeedback();context.queueProduction(native);
 requests[2].resolve({ok:true,result:{factoryId:11,count:5}});await settle();
 check('A late acknowledgement remains scoped to its original factory',()=>{assert.equal(requests[3].data.factoryId,12);assert.equal(target.textContent,'Adding 1 to Factory 12…');state.factory=11;context.updateProductionFeedback();assert.equal(target.textContent,'Added 5 to Factory 11');assert.equal(target.dataset.tone,'done');});
 requests[3].resolve({ok:true,result:{factoryId:12,count:1}});await settle();state.factory=12;context.updateProductionFeedback();
 check('Success appears only after the native acceptance and counts one requested unit once',()=>{assert.equal(target.textContent,'Added 1 to Factory 12');requests[3].resolve({ok:true,result:{factoryId:12,count:1}});assert.equal(state.productionFeedback.get(12).accepted,1);});
 state.factory=11;viewButtons=[native,saved];context.queueProduction(saved);state.saved[0].body='Changed while pending';
 check('Saved designs are copied at tap time and cannot change under a pending order',()=>{assert.equal(requests[4].data.design.body,'Body1');assert.equal(requests[4].data.factoryId,11);assert.equal(requests[4].data.count,1);});
 check('Older feedback expiry cannot erase the current pending request',()=>{for(const expire of timers)expire();assert(state.productionFeedback.has(11));assert.equal(state.productionRequests.size,1);});
 state.productionRequests.clear();state.productionFeedback.clear();ended=true;const before=fresh.length;requests[4].resolve({ok:true,result:{factoryId:11,count:1}});await settle();
 check('Battle-end cleanup ignores an old reply without reopening UI or requesting new state',()=>{assert.equal(fresh.length,before);assert.equal(state.productionFeedback.size,0);});
}
(async()=>{await navigation();await production();
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
 const report={version:'0.31',emulatorUsed:false,actualCommandFunctionsExecuted:true,actualNativeEngineExecuted:false,checksPassed:checks,sources:[sourcePath,'tools/check-command-ui-031.cjs'].map(p=>({path:p,sha256:hash(p)})),scope:'Header toggles and native-acknowledged production feedback under controlled host/native replies. This does not establish actual rendering, gameplay or emulator input.'};
 fs.writeFileSync(path.join(root,'archive/command-ui-0.31-checks.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checksPassed:checks,report:'archive/command-ui-0.31-checks.json'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
