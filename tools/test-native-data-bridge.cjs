'use strict';
// Exercise the headless transport with the real queue implementations, without DOM widgets.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base='app/src/main/assets/',listeners=new Map(),writes=[],timers=[],models=[],results=[];
const catalog=JSON.parse(fs.readFileSync(base+'warzone/command-catalog.json','utf8'));
let storage=true,store=JSON.stringify({version:1,designs:[{id:'old',name:'Existing',body:'Body1REC',propulsion:'wheeled01',turrets:['MG1Mk1']}]});
const transportFiles=new Map();
const fsMock={writeFile:(path,text)=>{writes.push({path,data:JSON.parse(text)});transportFiles.set(path,text);},rename:(from,to)=>{transportFiles.set(to,transportFiles.get(from));transportFiles.delete(from);},readFile:path=>{if(!transportFiles.has(path))throw Error('missing file');return transportFiles.get(path);},unlink:path=>transportFiles.delete(path)};
const window={parent:{document:{getElementById:()=>({style:{},getBoundingClientRect:()=>({y:0}),inert:false})}},LaunchedModule:{FS:fsMock},
 addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:e=>listeners.get(e.type)?.(e),
 BlockNightAndroid:{loadDesigns:()=>store,saveDesigns:text=>{if(storage)store=text;return storage;},nativeModel:data=>models.push(JSON.parse(data)),nativeResult:(id,text)=>results.push({id,...JSON.parse(text)}),nativeNotice(){}}};
window.window=window;
const context=vm.createContext({...window,window,document:{getElementById:()=>null},localStorage:{getItem:()=>null},fetch:async()=>({ok:true,json:async()=>catalog}),
 setInterval:fn=>timers.push(fn),setTimeout,clearTimeout,performance,console,Date,TextDecoder,CustomEvent:class{constructor(type,data){this.type=type;Object.assign(this,data);}},navigator:{}});
for(const file of ['warzone-native-bridge.js','warzone-command-core.js','warzone-research-core.js'])vm.runInContext(fs.readFileSync(base+file,'utf8'),context,{filename:file});
const c=window.__warzoneCommands,r=window.__blockNightResearch,flush=()=>new Promise(resolve=>setTimeout(resolve,40));
function output(marker,payload){listeners.get('blocknight-engine-output')({detail:{text:marker+JSON.stringify(payload)}});}
function ack(action,result,ok=true){const command=[...writes].reverse().flatMap(w=>w.data.commands||[]).find(v=>v.action===action);assert.ok(command,'command was written: '+action);c.accept({nonce:command.nonce,action,ok,result,reason:ok?'':'engine-rejected'});}
(async()=>{
 await flush();assert.equal(c.report().saved[0].name,'Existing');
 const first=c.send('state'),second=c.send('state');assert.equal(first,second,'concurrent state reads coalesce');
 ack('state',{gameTime:1000,buildings:[],parts:[],factories:[],templates:[],trucks:[]});await first;
 assert.equal(JSON.parse(transportFiles.get('/data/mp/multiplay/script/rules/warzone-towers-command.json')).commands.length,0,'acknowledged native requests cannot replay after loading a save');
 r.open();assert.equal(writes.filter(w=>w.path.includes('queue-command')).length,0,'opening Tech never chooses research');
 output('BNTECH:',{gameTime:1000,power:200,labs:[{id:11,idle:true},{id:12,idle:true}],topics:[{id:'alpha',name:'Alpha'},{id:'beta',name:'Beta'},{id:'gamma',name:'Gamma'}]});
 assert.equal(r.enqueue(11,'alpha'),true);assert.equal(r.enqueue(12,'beta'),true,'edits are accepted while the first atomic command is in flight');
 let command=writes.filter(w=>w.path.includes('queue-command')).at(-1).data;
 r.acceptQueues([{labId:11,topicIds:[]},{labId:12,topicIds:[]}]);
 assert.equal(r.model().queueItems.find(q=>q.labId===11).topics[0].id,'alpha','native snapshots cannot erase an in-flight manual edit');
 assert.deepEqual(command.labs.map(l=>[l.labId,...l.topicIds]),[[11,'alpha']]);
 output('BNQUEUE:',{nonce:command.nonce,ok:true,queues:[{labId:11,topicIds:[]}],started:[{labId:11,topicId:'alpha'}]});
 command=writes.filter(w=>w.path.includes('queue-command')).at(-1).data;
 assert.deepEqual(command.labs.map(l=>[l.labId,...l.topicIds]),[[12,'beta']],'another lab’s in-flight edit is preserved exactly');
 const queuePath='/data/mp/multiplay/script/rules/blocknight-queue-command.json';
 assert.equal(JSON.parse(transportFiles.get(queuePath)).nonce,command.nonce,'consuming the old request preserves the newer in-flight queue');
 output('BNQUEUE:',{nonce:command.nonce,ok:true,queues:[{labId:12,topicIds:[]}],started:[{labId:12,topicId:'beta'}]});
 assert.equal(r.enqueue(12,'alpha'),false,'active topics cannot be duplicated across labs');
 assert.equal(r.enqueue(11,'gamma'),true);command=writes.filter(w=>w.path.includes('queue-command')).at(-1).data;
 output('BNQUEUE:',{nonce:command.nonce,ok:true,queues:[{labId:11,topicIds:['gamma']}],started:[]});
 assert.equal(r.remove(11,'gamma'),true);command=writes.filter(w=>w.path.includes('queue-command')).at(-1).data;
 assert.deepEqual(command.labs.map(l=>[l.labId,...l.topicIds]),[[11]],'remove sends the exact empty waiting queue');
 output('BNQUEUE:',{nonce:command.nonce,ok:true,queues:[{labId:11,topicIds:[]}],started:[]});
 assert.equal(JSON.parse(transportFiles.get(queuePath)).nonce,'','acknowledged research requests become inert after loading an older native queue state');
 const queueWrites=writes.filter(w=>w.path.includes('queue-command')).length;
 r.acceptQueues([{labId:11,topicIds:['gamma']},{labId:12,topicIds:[]}]);
 assert.equal(r.model().queueItems.find(q=>q.labId===11).topics[0].id,'gamma','native loaded queues restore the visible waiting list');
 r.acceptQueues([{labId:11,topicIds:[]},{labId:12,topicIds:[]}]);
 assert.equal(r.model().queueItems.find(q=>q.labId===11).topics.length,0,'a loaded empty queue clears stale presentation state');
 assert.equal(writes.filter(w=>w.path.includes('queue-command')).length,queueWrites,'restoring native queue presentation never assigns research');
 const design={id:'new',name:'New',body:'Body1REC',propulsion:'wheeled01',turrets:['MG1Mk1']};
 storage=false;const failed=c.saveBlueprint(design);await flush();ack('save-design',{...design,cost:55});await assert.rejects(failed,/Could not save/);assert.equal(c.report().saved.length,1,'failed device write rolls the library back');
 storage=true;const success=c.saveBlueprint(design);await flush();ack('save-design',{...design,cost:55});await success;assert.equal(JSON.parse(store).designs.length,2);
 storage=false;assert.throws(()=>c.deleteBlueprint('old'));assert.equal(c.report().saved.length,2);storage=true;c.deleteBlueprint('new');assert.equal(c.report().saved.length,1);
 await window.__towersNative.dispatch({session:'',id:5,action:'control',data:{name:'arbitraryFunction'}});assert.equal(results.at(-1).ok,false,'only named native controls are dispatchable');
 const countBefore=results.length;await window.__towersNative.dispatch({session:'previous-battle',id:6,action:'delete-design',data:{id:'old'}});assert.equal(results.length,countBefore);assert.equal(c.report().saved.length,1,'requests from another battle cannot mutate this one');
 window.__kalaWarzoneTouch={releaseAll(){},report:()=>({pendingClicks:0})};
 const oldPage=c.open('design'),latestResearch=c.openResearch();await Promise.all([oldPage,latestResearch]);assert.equal(c.model().page,'');assert.equal(r.report().open,true,'newer Tech navigation cancels an older Design open');
 const oldEngineMenu=c.openNative('stats'),latestExit=c.exit();await Promise.all([oldEngineMenu,latestExit]);assert.equal(c.report().nativeMenu,'','a late engine menu cannot reopen after returning to battle');assert.equal(r.report().open,false);
 let staleControl=false;const oldControl=c.afterBuildExit(()=>{staleControl=true;}),latestBuild=c.open('build');await Promise.all([oldControl,latestBuild]);assert.equal(staleControl,false,'older control callbacks cannot run after a new page request');assert.equal(c.model().buildOpen,true);await c.exit();
 for(const file of ['warzone-command-core.js','warzone-research-core.js','warzone-wave-core.js','warzone-engine-input.js','warzone-native-bridge.js'])assert.doesNotMatch(fs.readFileSync(base+file,'utf8'),/createElement|innerHTML/,'no app widgets created in '+file);
 for(const name of ['warzone-towers-wave-command.json','blocknight-zoom-command.json','warzone-towers-control-command.json']){
   const path='/data/mp/multiplay/script/rules/'+name;fsMock.writeFile(path,JSON.stringify({nonce:'newer'}));
   assert.equal(window.__towersNative.consume(name,'older'),false,'a delayed acknowledgement preserves a newer '+name);
   assert.equal(transportFiles.has(path),true);assert.equal(window.__towersNative.consume(name,'newer'),true);assert.equal(JSON.parse(transportFiles.get(path)).nonce,'','consumed '+name+' stays present and inert after load');
 }
 console.log('PASS: headless data, exact manual queues, all acknowledged transport consumption, in-flight edits, duplicate prevention, removal, persistence rollback, navigation cancellation and action whitelist');
})().catch(e=>{console.error(e);process.exitCode=1});
