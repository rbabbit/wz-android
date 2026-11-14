'use strict';
// v0.78 available-only catalogue and authoritative selected-laboratory assignment checks.
// Actual shared research functions/markup with bounded DOM/native-mailbox fixtures.
// This does not execute Android, Warzone, pathfinding, audio or multiplayer.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const acorn=require('../vendor/multiplayer/native-070/tooling/acorn.cjs');
const root=path.resolve(__dirname,'..'),file='app/src/main/assets/warzone-mobile-research.js';
const source=fs.readFileSync(path.join(root,file),'utf8');
assert.match(source,/const VERSION = 43;/);
const body=acorn.parse(source,{ecmaVersion:'latest'}).body[0].expression.callee.body.body;
const stateNode=body.flatMap(n=>n.declarations||[]).find(n=>n.id.name==='state');
const declarations=body.filter(n=>n.type==='FunctionDeclaration').map(n=>source.slice(n.start,n.end)).join('\n');
const clone=value=>JSON.parse(JSON.stringify(value)),checks=[];
function check(name,fn){fn();checks.push(name);}
function fixture(mode='towers'){
 const nodes=new Map(),events=[],writes=[],files=new Map();let timer=0,now=100;
 class Node {
  constructor(){this.dataset={};this.style={};this.attributes={};this.hidden=false;this.scrollTop=0;this.replacements=0;this.cards=[];this.children=new Map();this.elementChildren=[];this.classes=new Set();
   this.classList={contains:key=>this.classes.has(key),toggle:(key,value)=>{value?this.classes.add(key):this.classes.delete(key);}};
  }
  set innerHTML(value){this.html=value;this.replacements++;
   if(this.isList)this.cards=Array.from(value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),match=>{
    const card=new Node();card.raw=match[0];
    for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)){
     card.attributes[attr[1]]=attr[2];if(attr[1]==='class')attr[2].split(' ').forEach(c=>card.classes.add(c));
     if(attr[1].startsWith('data-'))card.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attr[2];
    }
    const bar=card.querySelector('.bn-tech-card-progress');bar.hidden=/<span class="bn-tech-card-progress"[^>]* hidden/.test(match[2]);
    return card;
   });
  }
  get innerHTML(){return this.html||'';}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key];}
  removeAttribute(key){delete this.attributes[key];}
  addEventListener(){}
  appendChild(child){this.elementChildren.push(child);return child;}
  replaceChildren(){this.elementChildren=[];}
  querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Node());return this.children.get(selector);}
  querySelectorAll(selector){
   if(selector==='[data-lab]')return this===shell?shell.querySelector('.bn-tech-labs').elementChildren:this.elementChildren.filter(child=>child.dataset.lab!==undefined);
   if(selector==='img')return this.cards.map(card=>card.querySelector('img'));
   if(selector==='.bn-tech-card[data-research-state="researching"]')return list.cards.filter(card=>card.dataset.researchState==='researching');
   return [];
  }
 }
 const shell=new Node(),list=shell.querySelector('.bn-tech-list');list.isList=true;
 if(mode!=='duel')shell.classes.add('wt-towers-research');
 const context={console,performance:{now:()=>now},Date:{now:()=>now},VERSION:43,
  CATEGORIES:['ALL','WEAPONS','DEFENCE','VEHICLES','CYBORG','SYSTEMS','STRUCTURES'],campaign:mode==='campaign',
  QUEUE_COMMAND_PATH:(mode==='campaign'?'/data/base/script/campaign/mobile/':'/data/mp/multiplay/script/rules/')+'blocknight-queue-command.json',
  setTimeout:()=>++timer,clearTimeout(){},setInterval:()=>++timer,clearInterval(){},vibrate(){},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  document:{getElementById:id=>id==='blocknight-research-shell'?shell:null,createElement:()=>new Node()},
  window:{__warzoneDuelConfig:mode==='duel'?{mode:'duel'}:undefined,
   PcMultiplayerNative:mode==='multiplayer'?{state:{player:2}}:undefined,
   WarzoneResearchArt:{url:topic=>'/real-art/'+(topic?.id||'unknown')+'.png',apply(image,topic){image.src="/real-art/"+(topic?.id||"unknown")+".png";},applyLab(image){image.src="/real-art/lab.png";}},
   __towersHtml:{isEnded:()=>false,consume(){}},dispatchEvent:event=>events.push(event),
   LaunchedModule:{FS:{writeFile(p,value){files.set(p,value);writes.push({path:p,value:JSON.parse(value)});},rename(from,to){files.set(to,files.get(from));files.delete(from);}}}}
 };
 vm.createContext(context);vm.runInContext('var state='+source.slice(stateNode.init.start,stateNode.init.end)+';\n'+declarations,context,{filename:file});
 context.showQueueStatus=()=>{};context.hideQueueStatus=()=>{};
 context.state.open=true;
 const send=(marker,value)=>context.handleEngineOutput({detail:{text:marker+JSON.stringify(value)}});
 const topic=(id,name=id,index=0,extra={})=>({id,name,nativeIndex:index,power:100,points:1000,...extra});
 const lab=(id=10,index=0,extra={})=>({id,nativeIndex:index,idle:true,topicId:'',topicName:'',estimatedProgress:null,remainingSeconds:null,...extra});
 const snapshot=(topics,labs=[lab()],extra={})=>send('BNTECH:',{topics,labs,power:2000,gameTime:now,player:mode==='multiplayer'?2:0,...extra});
 const queues=(rows,extra={})=>send('BNQUEUE:',{nonce:'',ok:true,queues:rows,gameTime:now,...extra});
 return{c:context,state:context.state,shell,list,writes,events,files,topic,lab,snapshot,queues,send,
  card:id=>list.cards.find(card=>card.dataset.topicId===id),advance(){now+=1000;}};
}
for(const mode of ['towers','ffa','campaign','multiplayer']){
 check(mode+': only available unassigned topics appear on the left across all laboratories',()=>{
  const f=fixture(mode),a=f.topic('R-Wpn-A','Current'),b=f.topic('R-Wpn-B','Queued',1),c=f.topic('R-Wpn-C','Other current',2),d=f.topic('R-Vehicle-D','Available',3),e=f.topic('R-Wpn-E','Other queue',4);
  f.snapshot([a,b,c,d,e],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name}),f.lab(20,1,{idle:false,topicId:c.id,topicName:c.name})]);
  f.queues([{labId:10,topicIds:[b.id]},{labId:20,topicIds:[e.id]}]);assert.deepEqual(f.list.cards.map(x=>x.dataset.topicId),[d.id]);
  f.c.setCategory('WEAPONS');assert.equal(f.state.activeCategory,'ALL');assert.equal(f.card(d.id).dataset.researchState,'ready');
  assert.equal(f.c.selectedLabResearchQueue(f.state.engineLabs[0])[0].topic.id,b.id);assert.equal(f.shell.querySelector('.bn-tech-active-name').textContent,a.name);
  f.c.selectLab(1);assert.equal(f.shell.querySelector('.bn-tech-active-name').textContent,c.name);assert.match(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/Other queue/);assert.doesNotMatch(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/>Queued</);
 });
 check(mode+': selecting one or multiple topics keeps them available until actual assignment intent is submitted',()=>{
  const f=fixture(mode),a=f.topic('R-A','First'),b=f.topic('R-B','Second',1);f.snapshot([a,b]);f.c.selectTopic(a.id);f.c.selectTopic(b.id);
  assert.deepEqual(clone(f.state.selectedTopicIds),[a.id,b.id]);assert.equal(f.list.cards.length,2);assert.ok(f.card(a.id).classes.has('selected'));assert.ok(f.card(b.id).classes.has('selected'));
  f.c.assignSelectedTopic();assert.equal(f.list.cards.length,0);assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].value.labs,[{labId:10,topicIds:[a.id,b.id]}]);
  const right=f.shell.querySelector('.bn-tech-queue-list').innerHTML;assert.match(right,/First/);assert.match(right,/Second/);assert.match(right,/>SYNCING</);assert.doesNotMatch(right,/>QUEUED</);
 });
 check(mode+': rejected/pending additions are explicitly not confirmed; accepted starts move to current with fresh unknown progress',()=>{
  const f=fixture(mode),a=f.topic('R-A','First'),b=f.topic('R-B','Second',1);f.snapshot([a,b]);f.c.selectTopic(a.id);f.c.selectTopic(b.id);f.c.assignSelectedTopic();const nonce=f.state.runner.nonce;
  f.send('BNQUEUE:',{nonce,ok:false,reason:'engine-rejected',queues:[{labId:10,topicIds:[]}],gameTime:100});
  assert.match(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/>NOT SYNCED</);assert.equal(f.shell.querySelector('.bn-tech-active-name').textContent,'No active research');
  f.state.syncBlocked=false;f.c.processQueues();const next=f.state.runner.nonce;
  f.send('BNQUEUE:',{nonce:next,ok:true,started:[{labId:10,topicId:a.id}],queues:[{labId:10,topicIds:[b.id]}],gameTime:100});
  assert.equal(f.shell.querySelector('.bn-tech-active-name').textContent,a.name);assert.equal(f.shell.querySelector('.bn-tech-current-image').src,'/real-art/'+a.id+'.png');
  assert.equal(f.shell.querySelector('.bn-tech-progress').hidden,true);assert.match(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/>QUEUED</);assert.doesNotMatch(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/>First</);
 });
 check(mode+': confirmed queue removal stays visible until native ACK, using real local indexes for surviving entries',()=>{
  const f=fixture(mode),a=f.topic('R-A','First'),b=f.topic('R-B','Second',1);f.snapshot([a,b]);f.queues([{labId:10,topicIds:[a.id,b.id]}]);
  f.c.removeQueuedTopic(10,0);let rows=f.c.selectedLabResearchQueue(f.state.engineLabs[0]);assert.deepEqual(clone(rows.map(r=>[r.topic.id,r.index,r.confirmed])),[[a.id,-1,true],[b.id,0,true]]);
  assert.match(rows[0].status,/QUEUED · REMOVING/);assert.equal(f.list.cards.length,0);
  const nonce=f.state.runner.nonce;f.send('BNQUEUE:',{nonce,ok:true,queues:[{labId:10,topicIds:[b.id]}],gameTime:100});
  rows=f.c.selectedLabResearchQueue(f.state.engineLabs[0]);assert.equal(rows.length,1);assert.equal(rows[0].topic.id,b.id);assert.equal(f.card(a.id).dataset.researchState,'ready');
 });
 check(mode+': explicit retry resends exact retained intent without adding duplicates or falsely confirming pending work',()=>{
  const f=fixture(mode),a=f.topic('R-A','First'),b=f.topic('R-B','Second',1);f.snapshot([a,b]);f.c.selectTopic(a.id);f.c.selectTopic(b.id);f.c.assignSelectedTopic();const adds=f.state.queueAdds;
  f.send('BNQUEUE:',{nonce:f.state.runner.nonce,ok:false,reason:'engine-rejected',queues:[{labId:10,topicIds:[]}],gameTime:100});
  assert.equal(f.shell.querySelector('.bn-tech-retry').hidden,false);f.snapshot([]);assert.equal(f.c.retrySelectedLabQueue(),true);assert.equal(f.c.retrySelectedLabQueue(),false);
  assert.equal(f.writes.length,2);assert.deepEqual(f.writes[1].value.labs,[{labId:10,topicIds:[a.id,b.id]}]);assert.equal(f.state.queueAdds,adds);
  assert.match(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/>SYNCING</);assert.doesNotMatch(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/>QUEUED</);
  f.send('BNQUEUE:',{nonce:f.state.runner.nonce,ok:true,started:[{labId:10,topicId:a.id}],queues:[{labId:10,topicIds:[b.id]}],gameTime:100});
  assert.equal(f.shell.querySelector('.bn-tech-retry').hidden,true);assert.equal(f.shell.querySelector('.bn-tech-active-name').textContent,a.name);assert.match(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/>QUEUED</);
 });
 check(mode+': rejected removal retry preserves the still-confirmed remainder omitted from native availability',()=>{
  const f=fixture(mode),a=f.topic('R-A','First'),b=f.topic('R-B','Second',1);f.snapshot([a,b]);f.queues([{labId:10,topicIds:[a.id,b.id]}]);f.c.removeQueuedTopic(10,0);
  f.send('BNQUEUE:',{nonce:f.state.runner.nonce,ok:false,reason:'engine-rejected',queues:[{labId:10,topicIds:[a.id,b.id]}],gameTime:100});
  assert.match(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/QUEUED · REMOVE NOT SYNCED/);f.snapshot([]);assert.equal(f.c.retrySelectedLabQueue(),true);
  assert.deepEqual(f.writes.at(-1).value.labs,[{labId:10,topicIds:[b.id]}]);
  f.send('BNQUEUE:',{nonce:f.state.runner.nonce,ok:true,queues:[{labId:10,topicIds:[b.id]}],gameTime:100});assert.deepEqual(clone(f.c.selectedLabResearchQueue(f.state.engineLabs[0]).map(r=>r.topic.id)),[b.id]);
 });
 check(mode+': current artwork/progress update in place while catalogue and right queue scroll remain stable',()=>{
  const f=fixture(mode),a=f.topic('R-A','Active'),b=f.topic('R-B','Waiting',1),c=f.topic('R-C','Available',2);f.snapshot([a,b,c],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name,estimatedProgress:.2,remainingSeconds:80})]);
  f.queues([{labId:10,topicIds:[b.id]}]);const card=f.card(c.id),queue=f.shell.querySelector('.bn-tech-queue-list'),replacements=queue.replacements;
  queue.scrollTop=31;f.list.scrollTop=17;f.advance();f.snapshot([c],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name,estimatedProgress:.7,remainingSeconds:30})]);
  assert.equal(f.card(c.id),card);assert.equal(queue.replacements,replacements);assert.equal(queue.scrollTop,31);assert.equal(f.list.scrollTop,17);
  assert.equal(f.shell.querySelector('.bn-tech-progress').attributes['aria-valuenow'],'70');assert.equal(f.shell.querySelector('.bn-tech-progress').querySelector('i').style.width,'70%');
  f.c.acceptQueues([{labId:10,topicIds:[b.id]}],1100);assert.equal(queue.replacements,replacements);assert.equal(queue.scrollTop,31);
 });
 check(mode+': idle/missing labs never show an unrelated current technology or fake zero progress',()=>{
  const f=fixture(mode),a=f.topic('R-A','Available');f.snapshot([a]);assert.equal(f.shell.querySelector('.bn-tech-active-name').textContent,'No active research');assert.equal(f.shell.querySelector('.bn-tech-current-image').src,'/real-art/lab.png');assert.equal(f.shell.querySelector('.bn-tech-progress').hidden,true);
  f.snapshot([],[f.lab(10,0,{idle:false,topicId:'R-Unknown',topicName:'Observed unknown',estimatedProgress:0,remainingSeconds:null})]);
  assert.equal(f.shell.querySelector('.bn-tech-progress').hidden,true);assert.equal(f.shell.querySelector('.bn-tech-active-name').textContent,'Observed unknown');
  f.snapshot([],[]);assert.equal(f.c.selectedLabResearchQueue(undefined).length,0);assert.match(f.shell.querySelector('.bn-tech-current-status').textContent,/SYNCING/);
 });
 check(mode+': completion/load/player changes clear stale assignments and cancellation readmits available topics',()=>{
  const f=fixture(mode),a=f.topic('R-A','Before'),b=f.topic('R-B','After',1);f.snapshot([a,b],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name})],{gameTime:5000});
  f.send('BNTECHDONE:',{id:a.id,name:a.name,player:mode==='multiplayer'?2:0});assert.equal(f.shell.querySelector('.bn-tech-active-name').textContent,'No active research');
  f.queues([{labId:10,topicIds:[b.id]}],{gameTime:5000});f.snapshot([b],[f.lab()],{gameTime:1000});assert.equal(f.card(b.id).dataset.researchState,'ready');assert.equal(f.c.selectedLabResearchQueue(f.state.engineLabs[0]).length,0);
  f.queues([{labId:10,topicIds:[b.id]}],{gameTime:1000});f.snapshot([b],[f.lab()],{gameTime:2000,player:3});assert.equal(f.card(b.id).dataset.researchState,'ready');
 });
}
check('Duel retains available-only native-index catalogue and original current/queue labels',()=>{
 const f=fixture('duel'),a=f.topic('R-A','Ready'),b=f.topic('R-B','Queued',1);f.snapshot([a,b]);f.queues([{labId:10,topicIds:[b.id]}]);assert.equal(f.list.cards.length,2);
 assert.equal(f.shell.querySelector('.bn-tech-queue-title').textContent,'UP NEXT · LAB 1');assert.equal(f.shell.querySelector('.bn-tech-queue-count').textContent,'1 WAITING');assert.doesNotMatch(f.shell.querySelector('.bn-tech-queue-list').innerHTML,/data-queue-state=|>SYNCING</);
 f.c.setCategory('VEHICLES');assert.equal(f.state.activeCategory,'VEHICLES');assert.equal(f.list.cards.length,0);
});
const inputs=[file,'app/src/main/assets/warzone/ui/towers-research.css','tools/test-research-assignment-078.cjs'];
const report={version:'0.78',passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,
 scope:'Actual shared Research functions/markup and bounded synthetic DOM/native-mailbox fixtures across four modes; Duel isolation. Native gameplay is not executed.',checksPassed:checks.length,checks,
 sources:inputs.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
fs.mkdirSync(path.join(root,'qa/research-assignment-078'),{recursive:true});fs.writeFileSync(path.join(root,'qa/research-assignment-078/research.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false,report:'qa/research-assignment-078/research.json'}));
