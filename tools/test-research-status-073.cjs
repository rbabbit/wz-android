'use strict';
// Actual shared research functions/markup with bounded DOM/native-mailbox fixtures.
// This does not execute Android, Warzone, pathfinding, audio or multiplayer.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const acorn=require('../vendor/multiplayer/native-070/tooling/acorn.cjs');
const root=path.resolve(__dirname,'..'),file='app/src/main/assets/warzone-mobile-research.js';
const source=fs.readFileSync(path.join(root,file),'utf8');
const body=acorn.parse(source,{ecmaVersion:'latest'}).body[0].expression.callee.body.body;
const stateNode=body.flatMap(n=>n.declarations||[]).find(n=>n.id.name==='state');
const declarations=body.filter(n=>n.type==='FunctionDeclaration').map(n=>source.slice(n.start,n.end)).join('\n');
const clone=value=>JSON.parse(JSON.stringify(value)),checks=[];
function check(name,fn){fn();checks.push(name);}
function fixture(mode='towers'){
 const nodes=new Map(),events=[],writes=[],files=new Map();let timer=0,now=100;
 class Node {
  constructor(){this.dataset={};this.style={};this.attributes={};this.hidden=false;this.scrollTop=0;this.replacements=0;this.cards=[];this.children=new Map();this.classes=new Set();
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
  querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Node());return this.children.get(selector);}
  querySelectorAll(selector){
   if(selector==='img')return this.cards.map(card=>card.querySelector('img'));
   if(selector==='.bn-tech-card[data-research-state="researching"]')return list.cards.filter(card=>card.dataset.researchState==='researching');
   return [];
  }
 }
 const shell=new Node(),list=shell.querySelector('.bn-tech-list');list.isList=true;
 if(mode!=='duel')shell.classes.add('wt-towers-research');
 const context={console,performance:{now:()=>now},Date:{now:()=>now},VERSION:41,
  CATEGORIES:['ALL','WEAPONS','DEFENCE','VEHICLES','CYBORG','SYSTEMS','STRUCTURES'],campaign:mode==='campaign',
  QUEUE_COMMAND_PATH:(mode==='campaign'?'/data/base/script/campaign/mobile/':'/data/mp/multiplay/script/rules/')+'blocknight-queue-command.json',
  setTimeout:()=>++timer,clearTimeout(){},setInterval:()=>++timer,clearInterval(){},vibrate(){},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  document:{getElementById:id=>id==='blocknight-research-shell'?shell:null},
  window:{__warzoneDuelConfig:mode==='duel'?{mode:'duel'}:undefined,
   PcMultiplayerNative:mode==='multiplayer'?{state:{player:2}}:undefined,
   WarzoneResearchArt:{url:topic=>'/real-art/'+(topic?.id||'unknown')+'.png',apply(){},applyLab(){}},
   __towersHtml:{isEnded:()=>false,consume(){}},dispatchEvent:event=>events.push(event),
   LaunchedModule:{FS:{writeFile(p,value){files.set(p,value);writes.push({path:p,value:JSON.parse(value)});},rename(from,to){files.set(to,files.get(from));files.delete(from);}}}}
 };
 vm.createContext(context);vm.runInContext('var state='+source.slice(stateNode.init.start,stateNode.init.end)+';\n'+declarations,context,{filename:file});
 context.renderLabs=()=>{};context.showQueueStatus=()=>{};context.hideQueueStatus=()=>{};
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
 check(mode+': active/queued topics remain visible after native availability removes them, without history ghosts',()=>{
  const f=fixture(mode),a=f.topic('R-Wpn-A','Cannon',0),b=f.topic('R-Wpn-B','Rockets',1),c=f.topic('R-Wpn-C','Flamer',2);
  f.snapshot([a,b,c]);f.queues([{labId:11,topicIds:[b.id]}]);
  f.snapshot([c],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name}),f.lab(11,1)]);
  f.queues([{labId:11,topicIds:[b.id]}]);
  assert.equal(f.card(a.id).dataset.researchState,'researching');assert.match(f.card(a.id).raw,/RESEARCHING · LAB 1/);
  assert.equal(f.card(b.id).dataset.researchState,'queued');assert.match(f.card(b.id).raw,/QUEUED · LAB 2/);
  assert.equal(f.card(c.id).dataset.researchState,'ready');
  f.state.topicHistory['R-Old']={id:'R-Old',name:'Previously completed'};f.c.renderAll();assert.equal(f.card('R-Old'),undefined);
  assert.equal(new Set(f.list.cards.map(card=>card.dataset.topicId)).size,3);
 });
 check(mode+': inspecting active/confirmed queued rows cannot add duplicate batch selections',()=>{
  const f=fixture(mode),a=f.topic('R-A','Active',0),b=f.topic('R-B','Queued',1),c=f.topic('R-C','Ready',2);
  f.snapshot([a,b,c],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name})]);f.queues([{labId:10,topicIds:[b.id]}]);
  assert.equal(f.c.selectTopic(a.id),true);assert.equal(f.state.selectedTopicId,a.id);assert.deepEqual(clone(f.state.selectedTopicIds),[]);
  assert.equal(f.c.selectTopic(b.id),true);assert.equal(f.state.selectedTopicId,b.id);assert.deepEqual(clone(f.state.selectedTopicIds),[]);
  assert.ok(!f.card(a.id).classes.has('selected'));assert.ok(!f.card(b.id).classes.has('selected'));
  f.c.selectTopic(c.id);assert.deepEqual(clone(f.state.selectedTopicIds),[c.id]);assert.ok(f.card(c.id).classes.has('selected'));
  assert.equal(f.c.assignSelectedTopic(),true);assert.equal(f.writes.length,1);
  assert.deepEqual(f.writes[0].value.labs,[{labId:10,topicIds:[b.id,c.id]}]);
 });
 check(mode+': pending additions show SYNCING until confirmed, rejection shows NOT SYNCED, no false queued state',()=>{
  const f=fixture(mode),a=f.topic('R-A','First',0),b=f.topic('R-B','Second',1);f.snapshot([a,b]);
  f.c.selectTopic(a.id);f.c.selectTopic(b.id);f.c.assignSelectedTopic();
  assert.equal(f.card(a.id).dataset.researchState,'syncing');assert.match(f.card(a.id).raw,/SYNCING · LAB 1/);
  const nonce=f.state.runner.nonce;f.send('BNQUEUE:',{nonce,ok:false,reason:'engine-rejected',queues:[{labId:10,topicIds:[]}],gameTime:100});
  assert.equal(f.card(a.id).dataset.researchState,'syncing');assert.match(f.card(a.id).raw,/NOT SYNCED · LAB 1/);
  assert.ok(!f.card(a.id).raw.includes('>QUEUED'));
  f.state.syncBlocked=false;f.c.processQueues();const next=f.state.runner.nonce;
  f.send('BNQUEUE:',{nonce:next,ok:true,started:[{labId:10,topicId:a.id}],queues:[{labId:10,topicIds:[b.id]}],gameTime:100});
  assert.equal(f.card(a.id).dataset.researchState,'researching');assert.equal(f.card(b.id).dataset.researchState,'queued');
 });
 check(mode+': native IDs preserve selection through list reorder/reindex and category filtering',()=>{
  const f=fixture(mode),a=f.topic('R-Wpn-A','Cannon',0),b=f.topic('R-Vehicle-B','Body',1);f.snapshot([a,b]);f.c.selectTopic(b.id);
  f.snapshot([{...b,nativeIndex:0},{...a,nativeIndex:1}]);assert.equal(f.state.selectedTopicId,b.id);
  assert.deepEqual(clone(f.state.selectedTopicIds),[b.id]);assert.equal(f.card(b.id).attributes['data-selection-order'],'1');
  f.c.setCategory('WEAPONS');assert.equal(f.list.cards.length,1);assert.equal(f.list.cards[0].dataset.topicId,a.id);
  f.c.setCategory('ALL');assert.equal(f.card(b.id).attributes['data-selection-order'],'1');
 });
 check(mode+': progress/countdown updates retain the actual card node and hide unknown placeholder progress',()=>{
  const f=fixture(mode),a=f.topic('R-A','Active');f.snapshot([], [f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name,estimatedProgress:.2,remainingSeconds:80})]);
  const card=f.card(a.id),replacements=f.list.replacements;f.advance();
  f.snapshot([], [f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name,estimatedProgress:.4,remainingSeconds:60})]);
  assert.equal(f.card(a.id),card);assert.equal(f.list.replacements,replacements);
  assert.equal(card.querySelector('.bn-tech-card-progress').querySelector('i').style.width,'40%');
  f.c.acceptQueues([{labId:10,topicIds:[]}],1100);assert.equal(f.card(a.id),card,'Unchanged WTCMD queue polling retains card nodes');
  f.advance();f.snapshot([],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name,estimatedProgress:0,remainingSeconds:null})]);
  assert.equal(card.querySelector('.bn-tech-card-progress').hidden,true);
  assert.match(card.raw,/POWER —/);assert.match(card.raw,/RESEARCH PTS —/);
 });
 check(mode+': completion/removal clears assigned rows; cancellation makes an available topic ready again',()=>{
  const f=fixture(mode),a=f.topic('R-A','Active'),b=f.topic('R-B','Waiting',1);f.snapshot([a,b]);
  f.snapshot([b],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name})]);f.queues([{labId:10,topicIds:[b.id]}]);
  f.send('BNTECHDONE:',{id:a.id,name:a.name,player:mode==='multiplayer'?2:0});assert.equal(f.card(a.id),undefined);
  f.snapshot([b],[f.lab()]);assert.equal(f.card(a.id),undefined);f.queues([{labId:10,topicIds:[]}]);assert.equal(f.card(b.id).dataset.researchState,'ready');
  f.snapshot([a,b]);assert.equal(f.card(a.id).dataset.researchState,'ready','Fresh native availability readmits a canceled/re-enabled topic');
  f.queues([{labId:10,topicIds:[b.id]}]);f.snapshot([],[]);assert.equal(f.list.cards.length,0,'Destroyed labs cannot leave queued ghosts');
  f.snapshot([a]);assert.ok(f.card(a.id),'The same old signature must render again after an empty list');
 });
 check(mode+': save rewind and player replacement discard stale display identities and pending selections',()=>{
  const f=fixture(mode),a=f.topic('R-A','Before'),b=f.topic('R-B','After');f.snapshot([a],undefined,{gameTime:5000});f.c.selectTopic(a.id);
  f.queues([{labId:10,topicIds:[a.id]}],{gameTime:5000});
  f.snapshot([b],undefined,{gameTime:1000});assert.equal(f.card(a.id),undefined);assert.deepEqual(clone(f.state.selectedTopicIds),[]);
  assert.ok(!f.state.topicHistory[a.id]);assert.equal(f.card(b.id).dataset.researchState,'ready');
  f.c.selectTopic(b.id);f.snapshot([a],undefined,{gameTime:2000,player:3});assert.deepEqual(clone(f.state.selectedTopicIds),[]);
  assert.equal(f.card(b.id),undefined);assert.equal(f.state.catalogPlayer,3);
 });
}
check('active precedence overrides confirmed/pending queue duplicates and real zero costs remain zero',()=>{
 const f=fixture(),a=f.topic('R-A','Zero',0,{power:0,points:0});f.snapshot([a],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name})]);
 f.queues([{labId:10,topicIds:[a.id]}]);assert.equal(f.list.cards.length,1);assert.equal(f.card(a.id).dataset.researchState,'researching');
 assert.match(f.card(a.id).raw,/POWER 0/);assert.match(f.card(a.id).raw,/0 RESEARCH PTS/);
});
check('confirmed queued status persists during an unacknowledged removal and prevents re-adding it',()=>{
 const f=fixture(),a=f.topic('R-A');f.snapshot([a]);f.queues([{labId:10,topicIds:[a.id]}]);
 f.c.removeQueuedTopic(10,0);assert.equal(f.card(a.id).dataset.researchState,'queued');
 f.c.selectTopic(a.id);assert.deepEqual(clone(f.state.selectedTopicIds),[]);
 const nonce=f.state.runner.nonce;f.send('BNQUEUE:',{nonce,ok:true,queues:[{labId:10,topicIds:[]}],gameTime:100});
 assert.equal(f.card(a.id).dataset.researchState,'ready');
});
check('a Multiplayer completion event for another native player cannot remove the local active topic',()=>{
 const f=fixture('multiplayer'),a=f.topic('R-A','Own research');
 f.snapshot([],[f.lab(10,0,{idle:false,topicId:a.id,topicName:a.name})]);
 f.send('BNTECHDONE:',{id:a.id,name:a.name,player:0});
 assert.equal(f.card(a.id).dataset.researchState,'researching');assert.equal(f.state.completedEvents,0);
 f.send('BNTECHDONE:',{id:a.id,name:a.name,player:2});assert.equal(f.card(a.id),undefined);
});
check('Duel keeps its legacy available-only rows, native-index selection and original status wording',()=>{
 const f=fixture('duel'),a=f.topic('R-A','Ready'),b=f.topic('R-B','Hidden active',1);
 f.snapshot([a],[f.lab(10,0,{idle:false,topicId:b.id,topicName:b.name})]);
 assert.equal(f.list.cards.length,1);assert.equal(f.card(b.id),undefined);assert.equal(f.card(a.id).dataset.researchState,undefined);
 assert.match(f.card(a.id).raw,/>READY</);assert.equal(f.c.selectTopic(0),true);assert.equal(f.state.selectedTopicIndex,0);
 assert.deepEqual(clone(f.state.selectedTopicIds),[]);
});
check('all four mode entrypoints reuse this renderer; no per-mode research screen is substituted',()=>{
 const main=fs.readFileSync(path.join(root,'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'),'utf8');
 const block=main.slice(main.indexOf('private void installTouchControls()'),main.indexOf('try (ByteArrayOutputStream',main.indexOf('private void installTouchControls()')));
 assert.equal((block.match(/"warzone-mobile-research.js"/g)||[]).length,3);
 assert.match(fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/engine.html'),'utf8'),/src="\/warzone-mobile-research\.js"/);
});
const inputs=[file,'tools/test-research-status-073.cjs'];
const report={version:'0.73',passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,
 scope:'Actual shared research renderer/functions and synthetic DOM/native-mailbox fixtures across Towers, FFA, Campaign, Multiplayer; Duel guard',
 checksPassed:checks.length,checks,sources:inputs.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
fs.writeFileSync(path.join(root,'qa/research-status-073/checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false,report:'qa/research-status-073/checks.json'}));
