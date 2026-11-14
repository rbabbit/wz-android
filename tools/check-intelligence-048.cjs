'use strict';
// Actual UI in a bounded DOM/native-transport fixture. No Android/native/gameplay execution.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');process.chdir(root);
const intelligence='app/src/main/assets/warzone-intelligence.js',notices='app/src/main/assets/warzone-towers-notices.js';
const sources=[intelligence,notices],source=p=>fs.readFileSync(p,'utf8'),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const checks=[];async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
function fixture({duel=false,withNotices=false,intelligenceSource=source(intelligence)}={}){
 let now=0,serial=0,phase='playing',clock=50000,nativeClock=50000,log=Buffer.from('historic output\n'),nativePreview=false;
 const timers=new Map(),files=new Map(),listeners=new Map(),nodes=[],requests=[],resize=[],channels=[],held=new Set(),calls=[];
 const dataName=k=>k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 class Node{
  constructor(tag){this.tagName=tag.toLowerCase();this.children=[];this.attributes={};this.dataset={};this.events=new Map();this.hidden=false;this.textContent='';this.parentNode=null;this.scrollTop=0;this.value='';this.rect={x:0,y:0,width:900,height:500};this.style={setProperty:(k,v)=>this.style[k]=v};const classes=new Set();this.classList={add:(...v)=>v.forEach(s=>classes.add(s)),remove:(...v)=>v.forEach(s=>classes.delete(s)),contains:s=>classes.has(s),toggle:(s,on)=>{const next=on===undefined?!classes.has(s):Boolean(on);next?classes.add(s):classes.delete(s);return next;}};nodes.push(this);}
  set id(v){this.attributes.id=v;}get id(){return this.attributes.id||'';}
  set className(v){for(const s of String(v).split(/\s+/).filter(Boolean))this.classList.add(s);}
  setAttribute(k,v){this.attributes[k]=String(v);if(k.startsWith('data-'))this.dataset[dataName(k)]=String(v);if(k==='class')this.className=v;}
  getAttribute(k){return Object.hasOwn(this.attributes,k)?this.attributes[k]:null;}
  removeAttribute(k){delete this.attributes[k];if(k.startsWith('data-'))delete this.dataset[dataName(k)];}
  append(...values){for(const v of values){v.parentNode=this;this.children.push(v);}}appendChild(v){this.append(v);return v;}
  replaceChildren(...values){this.children.forEach(n=>n.parentNode=null);this.children=[];this.append(...values);}get childNodes(){return this.children;}
  addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);}
  emit(name,event={}){const e={target:this,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...event};for(const fn of this.events.get(name)||[])fn(e);return e;}
  matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));const attr=selector.match(/^\[([^\]=]+)(?:=["']?([^"'\]]+)["']?)?\]$/);return attr?this.getAttribute(attr[1])!==null&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]):this.tagName===selector;}
  closest(selector){for(let n=this;n;n=n.parentNode)if(selector.split(',').some(s=>n.matches(s.trim())))return n;return null;}
  querySelectorAll(selector){const result=[];const visit=n=>{for(const c of n.children){if(selector.split(',').some(s=>c.matches(s.trim())))result.push(c);visit(c);}};visit(this);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  set innerHTML(html){this.replaceChildren();const stack=[this];for(const m of html.matchAll(/<\/?([\w-]+)([^>]*)>/g)){if(m[0][1]==='/'){if(stack.length>1)stack.pop();continue;}const n=new Node(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))n.setAttribute(a[1],a[2]??'');stack.at(-1).append(n);if(!['input','img','link','br'].includes(n.tagName))stack.push(n);}}
  getBoundingClientRect(){return{...this.rect,left:this.rect.x,top:this.rect.y,right:this.rect.x+this.rect.width,bottom:this.rect.y+this.rect.height};}
  focus(){document.activeElement=this;}
 }
 const document={createElement:tag=>new Node(tag),head:new Node('head'),body:new Node('body'),getElementById:id=>nodes.find(n=>n.id===id)||null,addEventListener(name,fn){if(!listeners.has('doc:'+name))listeners.set('doc:'+name,[]);listeners.get('doc:'+name).push(fn);}};
 const canvas=new Node('canvas');canvas.id='canvas';document.body.append(canvas);
 const add=(fn,delay,repeat=0)=>{const id=++serial;timers.set(id,{fn,at:now+delay,repeat});return id;};
 const topic=(id,name,extra={})=>({id,name,hasMessage:true,hasModel:true,read:false,description:['Original report for '+name],unlocks:[],...extra});
 let history=[topic('R-MG','Machinegun'),topic('R-Cannon','Light Cannon'),topic('R-Start','Starting body',{hasMessage:false,hasModel:false,initialGrant:true})];
 const responseFor=command=>{const value={nonce:command.nonce,ok:true,gameTime:nativeClock,viewport:{width:1800,height:1000},preview:{active:nativePreview}};
  if(command.action==='open'){nativePreview=false;value.preview={active:false};}if(['open','list'].includes(command.action))value.history=clone(history);
  if(command.action==='select'){const selected=history.find(t=>t.id===command.topicId);if(selected)selected.read=true;value.selected=clone(selected);if(!value.selected)return{...value,ok:false,error:'Topic unavailable'};}
  if(command.action==='layout'){nativePreview=true;value.preview={active:true};value.selected=clone(history.find(t=>t.id===command.topicId));}
  if(command.action==='close'){nativePreview=false;value.preview={active:false};}
  return value;};
 let responder=responseFor;
 const respond=(command,override)=>files.set('/tmp/warzone-towers-intelligence-state.json',JSON.stringify(override||responder(command)));
 const nativeFS={writeFile:(p,s)=>files.set(p,s),rename(a,b){files.set(b,files.get(a));files.delete(a);if(b==='/tmp/warzone-towers-intelligence-command.json'){const command=JSON.parse(files.get(b));requests.push(command);if(!held.has(command.action))respond(command);}},readFile(p){if(!files.has(p))throw Error('ENOENT');return files.get(p);},readdir:()=>['native.log'],stat:()=>({size:log.length}),open:()=>1,read(stream,buffer,offset,length,position){const bytes=log.subarray(position,position+length);buffer.set(bytes,offset);return bytes.length;},close(){}};
 class BroadcastChannel{constructor(name){this.name=name;this.callbacks=[];this.closed=false;channels.push(this);}addEventListener(name,fn){if(name==='message')this.callbacks.push(fn);}close(){this.closed=true;}emit(text){if(!this.closed)this.callbacks.forEach(fn=>fn({data:text}));}}
 const reportDefinitions=new Set(['R-MG','R-Cannon','R-Gauss']);
 const artworkCalls=[];
 const window={parent:null,document,WarzoneResearchArt:{apply:(image,topic)=>{artworkCalls.push(topic.id);image.src='/warzone/research-icons/'+encodeURIComponent(topic.id)+'.gif';},isReportDefinition:topic=>reportDefinitions.has(topic.id)},LaunchedModule:{FS:nativeFS,WZVAL_configDirPath:'/config'},__warzoneDuelConfig:duel?{mode:'duel'}:undefined,
  __towersHtml:{session:'fixture036',isActive:()=>phase==='playing',isEnded:()=>phase==='ended',report:()=>({phase})},__warzoneTowersWaves:{report:()=>({snapshot:{gameTime:clock}})},
  __warzoneCommands:{cancelDemolish:()=>calls.push('cancel-demolish'),selectMode:async()=>true},__kalaWarzoneTouch:{prepareHeaderMenu:()=>true,cancelFacilityNavigation:()=>calls.push('cancel-facility'),releaseAll:(...args)=>calls.push(['release',...args])},
  addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}};
 const context=vm.createContext({window,document,performance:{now:()=>now},setTimeout:(fn,delay)=>add(fn,delay),clearTimeout:id=>timers.delete(id),setInterval:(fn,delay)=>add(fn,delay,delay),clearInterval:id=>timers.delete(id),requestAnimationFrame:fn=>add(fn,16),cancelAnimationFrame:id=>timers.delete(id),ResizeObserver:class{constructor(fn){resize.push(fn);}observe(){}},BroadcastChannel,TextDecoder,Uint8Array,Map,Set,Number,Math,JSON,Promise});
 vm.runInContext(intelligenceSource,context,{filename:intelligence});if(withNotices)vm.runInContext(source(notices),context,{filename:notices});
 const slot=document.getElementById('wt-intelligence-preview');if(slot)slot.rect={x:500,y:130,width:240,height:180};
 const dispatch=(name,detail)=>{for(const fn of listeners.get(name)||[])fn({detail,type:name});};
 async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}
 async function advance(ms){const end=now+ms;for(let i=0;i<1000;i++){await settle();const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;await settle();return;}const[id,t]=next;timers.delete(id);now=t.at;if(t.repeat)timers.set(id,{...t,at:now+t.repeat});t.fn();}throw Error('Bounded timer fixture exhausted');}
 async function run(promise,max=6000){let done=false,value,error;Promise.resolve(promise).then(v=>{value=v;done=true;},e=>{error=e;done=true;});for(let i=0;i<max/10&&!done;i++)await advance(10);assert.ok(done,'UI operation exceeded bounded fixture deadline');if(error)throw error;return value;}
 return{window,document,requests,held,calls,files,channels,slot,resize,artworkCalls,reportDefinitions,run,advance,settle,dispatch,respond,topic,history:()=>history,setHistory:v=>history=v,setResponder:fn=>responder=fn,defaultResponse:responseFor,clock:v=>clock=v,nativeClock:v=>nativeClock=v,
  box:()=>document.getElementById('wt-game-notice'),title:()=>document.getElementById('wt-game-notice')?.children[0],detail:()=>document.getElementById('wt-game-notice')?.children[1],engine:text=>dispatch('blocknight-engine-output',{text}),append:text=>log=Buffer.concat([log,Buffer.from(text)]),truncate:text=>log=Buffer.from(text),end(){phase='ended';dispatch('warzone-battle-ended');},key:e=>{for(const fn of listeners.get('keydown')||[])fn({preventDefault(){},stopImmediatePropagation(){},...e});}};
}
const packet=v=>'BNNOTICE:'+JSON.stringify(v),completed=(id='R-Cannon',gameTime=50000)=>({id,name:'Light Cannon',player:0,labId:7,gameTime});
const ids=f=>f.document.getElementById('wt-intelligence-list').children.map(n=>n.dataset.intelTopic).filter(Boolean);
(async()=>{
 await check('Only completed topics with actual native messages appear; grants, authored-only and minor topics stay excluded',async()=>{
  const f=fixture();f.setHistory([...f.history(),f.topic('R-Grant','Granted major',{initialGrant:true}),
   f.topic('R-Minor','Minor upgrade',{hasMessage:false}),f.topic('R-Definition','Authored only',{hasMessage:false,hasReport:true}),
   f.topic('R-UnknownStart','Save-loaded native report',{initialGrant:null}),f.topic('R-Cannon','Duplicate'),{id:'R-Bad',hasMessage:true}]);
  await f.run(f.window.__warzoneIntelligence.open());
  assert.deepEqual(ids(f),['R-MG','R-Cannon','R-UnknownStart']);
  const panel=f.document.getElementById('wt-intelligence-panel');
  assert.equal(panel.querySelectorAll('[data-intel-filter]').length,0);
  assert.equal(source(intelligence).includes('All completed'),false);
  assert.equal(f.window.__warzoneIntelligence.report().history.some(t=>t.initialGrant===true),false);
 });
 await check('Direct deep links and public selection cannot bypass report eligibility or expose starting technologies',async()=>{
  for(const id of ['R-Start','R-Missing','R-Definition']){
   const f=fixture();f.setHistory([...f.history(),f.topic('R-Definition','Authored major only',{hasReport:true,hasMessage:false})]);
   assert.equal(await f.run(f.window.__warzoneIntelligence.open(id)),false);
   assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);
   assert.equal(f.requests.some(r=>r.action==='select'),false);
   assert.equal(f.requests.at(-1).action,'close');
  }
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(80);
  const before=f.requests.length,selected=api.report().selectedId;
  assert.equal(await f.run(api.select('R-Start')),false);
  assert.equal(f.requests.length,before);assert.equal(api.report().selectedId,selected);
  assert.equal(await f.run(api.open('R-Start')),false);assert.equal(api.report().selectedId,selected);
 });
 await check('Valid report selection retains exact native ID, model geometry, normal opening silence and deliberate replay audio',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;assert.equal(await f.run(api.open()),true);await f.advance(100);
  const select=f.requests.find(r=>r.action==='select'),layout=f.requests.find(r=>r.action==='layout');
  assert.equal(select.topicId,'R-Cannon');assert.equal(select.playAudio,false);
  assert.deepEqual(layout.rect,{x:1000,y:260,width:480,height:360});assert.equal(layout.topicId,'R-Cannon');
  assert.equal(f.slot.classList.contains('preview-ready'),true);assert.equal(api.report().history.find(t=>t.id==='R-Cannon').read,true);
  f.slot.emit('click');await f.advance(100);assert.equal(f.requests.filter(r=>r.action==='select').at(-1).playAudio,true);
  assert.ok(f.artworkCalls.includes('R-Cannon'));
 });
 await check('A missed completion event is recovered by a bounded live refresh without resetting query, scroll, model or audio',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(100);
  const input=f.document.getElementById('wt-intelligence-search'),list=f.document.getElementById('wt-intelligence-list'),copy=f.document.getElementById('wt-intelligence-copy');
  input.value='cannon';input.emit('input');list.scrollTop=37;copy.scrollTop=18;
  const beforeSelect=f.requests.filter(r=>r.action==='select').length;
  f.setHistory([...f.history(),f.topic('R-Gauss','Gauss Cannon')]);await f.advance(2200);
  assert.ok(api.report().history.some(t=>t.id==='R-Gauss'));assert.equal(api.report().query,'cannon');
  assert.equal(list.scrollTop,37);assert.equal(copy.scrollTop,18);assert.equal(api.report().selectedId,'R-Cannon');
  assert.equal(f.slot.classList.contains('preview-ready'),true);assert.equal(f.requests.filter(r=>r.action==='select').length,beforeSelect);
  assert.equal(f.requests.filter(r=>r.action==='list').length,1);
 });
 await check('Burst completion events and concurrent refresh callers coalesce into one native list request',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(100);f.held.add('list');
  for(let i=0;i<20;i++)f.dispatch('blocknight-research-completed',completed());await f.advance(250);
  const concurrent=[api.refresh(),api.refresh(),api.refresh()];await f.advance(800);
  assert.equal(f.requests.filter(r=>r.action==='list').length,1);
  f.respond(f.requests.find(r=>r.action==='list'));await f.run(Promise.all(concurrent));
  assert.equal(api.report().pending,0);
 });
 await check('Fresh deep links query native report membership before selecting newly completed IDs',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());
  f.setHistory([...f.history(),f.topic('R-Gauss','Gauss Cannon')]);const before=f.requests.length;
  assert.equal(await f.run(api.open('R-Gauss')),true);await f.advance(80);
  const next=f.requests.slice(before);assert.equal(next[0].action,'list');
  assert.equal(next.find(r=>r.action==='select').topicId,'R-Gauss');assert.equal(api.report().selectedId,'R-Gauss');
 });
 await check('Immediate list errors retain current valid details and keep periodic retries bounded',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(100);
  f.setResponder(command=>command.action==='list'?{nonce:command.nonce,ok:false,error:'Temporary list failure'}:f.defaultResponse(command));
  await f.advance(3700);
  assert.ok(f.requests.filter(r=>r.action==='list').length<=2);
  assert.equal(api.report().selectedId,'R-Cannon');assert.equal(api.report().open,true);
  assert.equal(f.slot.classList.contains('preview-ready'),true);
 });
 await check('A withdrawn selected report is covered and cleared before the native preview reset acknowledges',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(100);
  f.setHistory(f.history().filter(t=>t.id!=='R-Cannon'));f.held.add('open');const pending=api.refresh();await f.advance(50);
  assert.equal(api.report().selectedId,'');assert.equal(api.report().selected,null);
  assert.equal(f.slot.classList.contains('preview-ready'),false);assert.equal(f.slot.querySelector('.wt-intel-preview-cover').hidden,false);
  assert.equal(f.document.getElementById('wt-intelligence-name').textContent,'Research reports');
  const reset=f.requests.filter(r=>r.action==='open').at(-1);f.respond(reset);assert.equal(await f.run(pending),true);
  assert.equal(ids(f).includes('R-Cannon'),false);
 });
 await check('A stale native selection response cannot display a topic lacking its report message',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;
  f.setResponder(command=>{const value=f.defaultResponse(command);if(command.action==='select')value.selected.hasMessage=false;return value;});
  await f.run(api.open('R-Cannon'));await f.advance(100);
  assert.equal(api.report().selectedId,'');assert.equal(api.report().selected,null);
  assert.equal(f.slot.classList.contains('preview-ready'),false);assert.equal(f.requests.some(r=>r.action==='layout'),false);
  assert.match(f.document.getElementById('wt-intelligence-status').textContent,/no Intelligence report/);
 });
 await check('A report withdrawn during native model layout never opens its transparent aperture',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;
  f.setResponder(command=>{const value=f.defaultResponse(command);if(command.action==='layout')value.selected.hasMessage=false;return value;});
  await f.run(api.open());await f.advance(150);
  assert.equal(api.report().selectedId,'');assert.equal(f.slot.classList.contains('preview-ready'),false);
  assert.equal(f.slot.querySelector('.wt-intel-preview-cover').hidden,false);
 });
 await check('Closing or ending while a refresh is pending rejects late history and never reopens the preview aperture',async()=>{
  for(const ended of [false,true]){
   const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(80);f.held.add('list');
   const refresh=api.refresh();await f.advance(30);
   const closing=ended?(f.end(),null):api.close();f.respond(f.requests.filter(r=>r.action==='list').at(-1));await f.run(refresh);
   if(closing)await f.run(closing);else await f.advance(100);
   assert.equal(api.report().open,false);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);
   assert.equal(f.slot.classList.contains('preview-ready'),false);
  }
 });
 await check('Genuine native game-time rewind closes stale history; opening a lower-clock loaded save establishes a fresh baseline',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(100);f.nativeClock(20000);await f.advance(650);
  assert.equal(api.report().open,false);assert.equal(api.report().history.length,0);
  f.setHistory([f.topic('R-Loaded','Loaded native report',{initialGrant:null})]);await f.run(api.open());await f.advance(650);
  assert.equal(api.report().open,true);assert.deepEqual(ids(f),['R-Loaded']);
 });
 await check('Normal close retains the opaque cover until acknowledgement, and late layout cannot reopen a closed report',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(80);f.held.add('close');const closing=api.close();await f.advance(20);
  assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,false);assert.equal(f.slot.querySelector('.wt-intel-preview-cover').hidden,false);
  f.respond(f.requests.at(-1));assert.equal(await f.run(closing),true);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);
  const g=fixture(),other=g.window.__warzoneIntelligence;g.held.add('layout');await g.run(other.open());await g.advance(30);
  await g.run(other.close());assert.equal(g.slot.classList.contains('preview-ready'),false);
 });
 await check('Major report notices preserve click/keyboard deep links; minor completion notices remain noninteractive',async()=>{
  for(const key of ['click','Enter',' ']){
   const f=fixture({withNotices:true});f.dispatch('blocknight-research-completed',completed());
   assert.equal(f.box().getAttribute('role'),'button');assert.equal(f.box().getAttribute('data-research-topic'),'R-Cannon');
   if(key==='click')f.box().emit('click');else f.box().emit('keydown',{key});await f.advance(100);
   assert.equal(f.window.__warzoneIntelligence.report().selectedId,'R-Cannon');
  }
  const f=fixture({withNotices:true});f.dispatch('blocknight-research-completed',completed('R-Minor'));
  assert.equal(f.title().textContent,'Research complete');assert.equal(f.box().getAttribute('role'),'status');
  assert.equal(f.box().getAttribute('data-research-topic'),null);f.box().emit('click');f.box().emit('keydown',{key:'Enter'});await f.advance(100);
  assert.equal(f.requests.length,0);
 });
 await check('An authored definition without a current engine message cannot open through its completion notice',async()=>{
  const f=fixture({withNotices:true});f.reportDefinitions.add('R-Start');f.dispatch('blocknight-research-completed',completed('R-Start'));
  f.box().emit('click');await f.advance(100);assert.equal(f.requests.some(r=>r.action==='select'),false);
  assert.equal(f.window.__warzoneIntelligence.report().open,false);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);
 });
 await check('Generic notices and hidden/expired report notices cannot trigger report navigation',async()=>{
  const f=fixture({withNotices:true});f.dispatch('blocknight-research-completed',completed());f.window.WarzoneNotices.show('Game saved');
  assert.equal(f.box().getAttribute('data-research-topic'),null);f.box().emit('click');
  f.dispatch('blocknight-research-completed',completed('R-MG'));await f.advance(4900);assert.equal(f.box().hidden,true);f.box().emit('click');await f.advance(80);
  assert.equal(f.requests.length,0);
 });
 await check('Missing artwork helper leaves the genuine report visible without substituting a lab icon',async()=>{
  const f=fixture();delete f.window.WarzoneResearchArt;await f.run(f.window.__warzoneIntelligence.open());
  assert.equal(f.window.__warzoneIntelligence.report().selectedId,'R-Cannon');
  const image=f.document.getElementById('wt-intelligence-list').children[0].children[0];assert.equal(image.hidden,true);
  assert.equal(source(intelligence).includes('Research%20Module.gif'),false);
 });
 await check('F5/Escape, menu preparation gates and dormant Duel retain their existing navigation boundaries',async()=>{
  const f=fixture();f.key({code:'F5'});await f.advance(100);assert.equal(f.window.__warzoneIntelligence.report().open,true);
  f.key({key:'Escape'});await f.advance(100);assert.equal(f.window.__warzoneIntelligence.report().open,false);
  f.window.__kalaWarzoneTouch.prepareHeaderMenu=()=>false;assert.equal(await f.run(f.window.__warzoneIntelligence.open()),false);
  const duel=fixture({duel:true,withNotices:true});assert.equal(duel.window.__warzoneIntelligence,undefined);assert.equal(duel.window.WarzoneNotices,undefined);
 });
 await check('The preserved v0.47 source reproduces the first-600ms mixed-clock close; fixed source stays open with 100/500/1000ms HUD lag',async()=>{
  const fallback=JSON.parse(fs.readFileSync('archive/fallback-0.48.json','utf8'));
  const priorSource=fallback.files.find(row=>row.path.endsWith('-source.zip')).path;
  const old=require('node:child_process').execFileSync('python',['-c',
   'import sys,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',priorSource,intelligence],{encoding:'utf8'});
  const before=fixture({intelligenceSource:old});before.nativeClock(50100);await before.run(before.window.__warzoneIntelligence.open());
  await before.advance(650);assert.equal(before.window.__warzoneIntelligence.report().open,false);
  assert.equal(before.requests.filter(r=>r.action==='heartbeat').length,0,'old source closes before asking native heartbeat');
  for(const lag of [100,500,1000]){
   const f=fixture(),api=f.window.__warzoneIntelligence;f.nativeClock(50000+lag);
   await f.run(api.open());await f.advance(3100);
   assert.equal(api.report().open,true,'fixed source stays open with '+lag+'ms lag');
   assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,false);
   assert.ok(f.requests.filter(r=>r.action==='heartbeat').length>=4);
   assert.equal(f.requests.filter(r=>r.action==='close').length,0);assert.equal(api.report().lastClock,50000+lag);
  }
 });
 await check('Stale, backwards, missing and malformed wave HUD snapshots cannot be mistaken for a loaded game',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;f.nativeClock(51000);await f.run(api.open());
  for(const hud of [49000,1000,0,null,'older']){f.clock(hud);await f.advance(650);assert.equal(api.report().open,true);}
  delete f.window.__warzoneTowersWaves;await f.advance(650);assert.equal(api.report().open,true);
  assert.equal(api.report().lastClock,51000);assert.equal(api.report().selectedId,'R-Cannon');
 });
 await check('Native clocks may advance or remain paused, and valid zero is accepted as an opening baseline',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());
  for(const native of [50000,50000,50600,50600,52000]){f.nativeClock(native);await f.advance(650);assert.equal(api.report().open,true);assert.equal(api.report().lastClock,native);}
  const zero=fixture();zero.nativeClock(0);await zero.run(zero.window.__warzoneIntelligence.open());await zero.advance(650);
  assert.equal(zero.window.__warzoneIntelligence.report().lastClock,0);assert.equal(zero.window.__warzoneIntelligence.report().open,true);
 });
 await check('Missing, null, non-finite, boolean, negative and string native heartbeat timestamps never become a false zero or rewind',async()=>{
  for(const bad of [undefined,null,NaN,Infinity,false,true,-1,'49000','']){
   const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());
   f.setResponder(command=>{const value=f.defaultResponse(command);if(command.action==='heartbeat'){
    if(bad===undefined)delete value.gameTime;else value.gameTime=bad;
   }return value;});
   await f.advance(1900);assert.equal(api.report().open,true,'invalid clock '+String(bad));assert.equal(api.report().lastClock,50000);
  }
 });
 await check('An absent or invalid native opening timestamp waits for a valid native heartbeat rather than borrowing the HUD clock',async()=>{
  for(const bad of [undefined,null,false,'50000',-1]){
   const f=fixture(),api=f.window.__warzoneIntelligence;f.clock(999999);
   f.setResponder(command=>{const value=f.defaultResponse(command);if(command.action==='open'){
    if(bad===undefined)delete value.gameTime;else value.gameTime=bad;
   }return value;});
   await f.run(api.open());assert.equal(api.report().lastClock,null);
   await f.advance(650);assert.equal(api.report().lastClock,50000);assert.equal(api.report().open,true);
  }
 });
 await check('A real native not-open response still closes the stale panel without leaving a model aperture',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(80);
  f.setResponder(command=>command.action==='heartbeat'?{nonce:command.nonce,ok:false,gameTime:20000,error:'not-open',preview:{active:false,reason:'game-loaded'}}:f.defaultResponse(command));
  await f.advance(650);assert.equal(api.report().open,false);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);
  assert.equal(api.report().selected,null);assert.equal(f.slot.classList.contains('preview-ready'),false);assert.equal(api.report().lastError,'not-open');
  f.setResponder(f.defaultResponse);f.nativeClock(20000);await f.run(api.open());await f.advance(650);assert.equal(api.report().open,true);
 });
 await check('Late successful and failed native heartbeats cannot alter a panel that was closed and reopened',async()=>{
  for(const failed of [false,true]){
   const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(80);f.held.add('heartbeat');await f.advance(550);
   const old=f.requests.filter(r=>r.action==='heartbeat').at(-1);assert.ok(old);
   const closing=api.close();
   f.respond(old,failed?{nonce:old.nonce,ok:false,error:'Late failure',gameTime:1}:{...f.defaultResponse(old),gameTime:1});
   await f.run(closing);f.held.delete('heartbeat');f.nativeClock(80000);
   await f.run(api.open());await f.advance(650);
   assert.equal(api.report().open,true);assert.equal(api.report().lastClock,80000);assert.equal(api.report().lastError,'');
   assert.equal(api.report().selectedId,'R-Cannon');assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,false);
  }
 });
 for(const file of sources)new vm.Script(source(file),{filename:file});
 const report={version:'0.48',passed:true,checks,checksPassed:checks.length,
  emulatorUsed:false,browserUsed:false,androidRuntimeExecuted:false,actualNativeEngineExecuted:false,screensVerified:false,gameplayVerified:false,
  scope:'Actual Intelligence/notices JavaScript in a bounded DOM/native-response fixture with independent wave/native clocks and native timestamps in every normal reply; native report eligibility remains authoritative. No browser, native engine, Android, model rendering or audio playback executed.',
  sources:[...sources,'tools/check-intelligence-048.cjs'].map(p=>({path:p,sha256:hash(p)})),recordedUTC:new Date().toISOString()};
 fs.writeFileSync('archive/intelligence-0.48-checks.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,report:'archive/intelligence-0.48-checks.json'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
