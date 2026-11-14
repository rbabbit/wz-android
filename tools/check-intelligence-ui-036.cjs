'use strict';
// Actual UI modules in a bounded DOM/native-transport fixture. No emulator claim.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');process.chdir(root);
const intelligence='app/src/main/assets/warzone-intelligence.js',notices='app/src/main/assets/warzone-towers-notices.js';
const sources=[intelligence,notices],source=p=>fs.readFileSync(p,'utf8'),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const checks=[];async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
function fixture({duel=false,withNotices=false}={}){
 let now=0,serial=0,phase='playing',clock=50000,log=Buffer.from('historic output\n'),nativePreview=false;
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
 const responseFor=command=>{const value={nonce:command.nonce,ok:true,viewport:{width:1800,height:1000},preview:{active:nativePreview}};
  if(['open','list'].includes(command.action))value.history=clone(history);
  if(command.action==='select'){value.selected=clone(history.find(t=>t.id===command.topicId));if(!value.selected)return{...value,ok:false,error:'Topic unavailable'};}
  if(command.action==='layout'){nativePreview=true;value.preview={active:true};}
  if(command.action==='close'){nativePreview=false;value.preview={active:false};}
  return value;};
 let responder=responseFor;
 const respond=(command,override)=>files.set('/tmp/warzone-towers-intelligence-state.json',JSON.stringify(override||responder(command)));
 const nativeFS={writeFile:(p,s)=>files.set(p,s),rename(a,b){files.set(b,files.get(a));files.delete(a);if(b==='/tmp/warzone-towers-intelligence-command.json'){const command=JSON.parse(files.get(b));requests.push(command);if(!held.has(command.action))respond(command);}},readFile(p){if(!files.has(p))throw Error('ENOENT');return files.get(p);},readdir:()=>['native.log'],stat:()=>({size:log.length}),open:()=>1,read(stream,buffer,offset,length,position){const bytes=log.subarray(position,position+length);buffer.set(bytes,offset);return bytes.length;},close(){}};
 class BroadcastChannel{constructor(name){this.name=name;this.callbacks=[];this.closed=false;channels.push(this);}addEventListener(name,fn){if(name==='message')this.callbacks.push(fn);}close(){this.closed=true;}emit(text){if(!this.closed)this.callbacks.forEach(fn=>fn({data:text}));}}
 const window={parent:null,document,LaunchedModule:{FS:nativeFS,WZVAL_configDirPath:'/config'},__warzoneDuelConfig:duel?{mode:'duel'}:undefined,
  __towersHtml:{session:'fixture036',isActive:()=>phase==='playing',isEnded:()=>phase==='ended',report:()=>({phase})},__warzoneTowersWaves:{report:()=>({snapshot:{gameTime:clock}})},
  __warzoneCommands:{cancelDemolish:()=>calls.push('cancel-demolish'),selectMode:async()=>true},__kalaWarzoneTouch:{prepareHeaderMenu:()=>true,cancelFacilityNavigation:()=>calls.push('cancel-facility'),releaseAll:(...args)=>calls.push(['release',...args])},
  addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}};
 const context=vm.createContext({window,document,performance:{now:()=>now},setTimeout:(fn,delay)=>add(fn,delay),clearTimeout:id=>timers.delete(id),setInterval:(fn,delay)=>add(fn,delay,delay),clearInterval:id=>timers.delete(id),requestAnimationFrame:fn=>add(fn,16),cancelAnimationFrame:id=>timers.delete(id),ResizeObserver:class{constructor(fn){resize.push(fn);}observe(){}},BroadcastChannel,TextDecoder,Uint8Array,Map,Set,Number,Math,JSON,Promise});
 vm.runInContext(source(intelligence),context,{filename:intelligence});if(withNotices)vm.runInContext(source(notices),context,{filename:notices});
 const slot=document.getElementById('wt-intelligence-preview');if(slot)slot.rect={x:500,y:130,width:240,height:180};
 const dispatch=(name,detail)=>{for(const fn of listeners.get(name)||[])fn({detail,type:name});};
 async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}
 async function advance(ms){const end=now+ms;for(let i=0;i<1000;i++){await settle();const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;await settle();return;}const[id,t]=next;timers.delete(id);now=t.at;if(t.repeat)timers.set(id,{...t,at:now+t.repeat});t.fn();}throw Error('Bounded timer fixture exhausted');}
 async function run(promise,max=6000){let done=false,value,error;Promise.resolve(promise).then(v=>{value=v;done=true;},e=>{error=e;done=true;});for(let i=0;i<max/10&&!done;i++)await advance(10);assert.ok(done,'UI operation exceeded bounded fixture deadline');if(error)throw error;return value;}
 return{window,document,requests,held,calls,files,channels,slot,resize,run,advance,settle,dispatch,respond,topic,history:()=>history,setHistory:v=>history=v,setResponder:fn=>responder=fn,defaultResponse:responseFor,clock:v=>clock=v,
  box:()=>document.getElementById('wt-game-notice'),title:()=>document.getElementById('wt-game-notice')?.children[0],detail:()=>document.getElementById('wt-game-notice')?.children[1],engine:text=>dispatch('blocknight-engine-output',{text}),append:text=>log=Buffer.concat([log,Buffer.from(text)]),truncate:text=>log=Buffer.from(text),end(){phase='ended';dispatch('warzone-battle-ended');},key:e=>{for(const fn of listeners.get('keydown')||[])fn({preventDefault(){},stopImmediatePropagation(){},...e});}};
}
const packet=v=>'BNNOTICE:'+JSON.stringify(v),camera=(direction='north',gameTime=50000)=>({kind:'camera',direction,gameTime}),completed=(id='R-Cannon',gameTime=50000)=>({id,name:'Light Cannon',player:0,labId:7,gameTime});
(async()=>{
 await check('actual model layout sends selected native topic ID with measured viewport rectangle',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;assert.equal(await f.run(api.open()),true);await f.advance(100);
  const select=f.requests.find(r=>r.action==='select'),layout=f.requests.find(r=>r.action==='layout');assert.equal(select.topicId,'R-Cannon');assert.equal(select.playAudio,false);assert.equal(layout.topicId,select.topicId);assert.deepEqual(layout.rect,{x:1000,y:260,width:480,height:360});
  assert.equal(f.slot.classList.contains('preview-ready'),true);assert.equal(f.slot.querySelector('.wt-intel-preview-cover').hidden,true);
  f.slot.rect.width=210;f.resize[0]();await f.advance(100);assert.equal(f.requests.filter(r=>r.action==='layout').at(-1).rect.width,420);assert.equal(f.requests.filter(r=>r.action==='layout').at(-1).topicId,'R-Cannon');
 });
 await check('report image retry requests the same native topic and its report audio',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open('R-MG'));await f.advance(80);const before=f.requests.length;f.slot.emit('click');await f.advance(100);const request=f.requests.slice(before).find(r=>r.action==='select');assert.equal(request.topicId,'R-MG');assert.equal(request.playAudio,true);assert.equal(api.report().selectedId,'R-MG');
 });
 await check('missing-cache deep link refreshes completed history then selects the exact newly finished topic',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());const before=f.requests.length;f.setHistory([...f.history(),f.topic('R-Gauss','Gauss Cannon')]);assert.equal(await f.run(api.open('R-Gauss')),true);await f.advance(80);
  const next=f.requests.slice(before);assert.equal(next[0].action,'list');assert.equal(next.find(r=>r.action==='select').topicId,'R-Gauss');assert.equal(api.report().selectedId,'R-Gauss');assert.equal(api.report().filter,'all');
 });
 await check('report filters and empty deep links preserve native history IDs without treating starting tech as reports',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());const list=f.document.getElementById('wt-intelligence-list');assert.deepEqual(list.children.map(r=>r.getAttribute('data-intel-topic')),['R-MG','R-Cannon']);
  await f.run(api.open('R-Start'));assert.equal(api.report().selectedId,'R-Start');assert.equal(api.report().selected.initialGrant,true);assert.equal(f.document.getElementById('wt-intelligence-copy').children[0].textContent,'Original report for Starting body');
 });
 await check('cancelling a delayed native open cannot reopen the panel or send a stale selection',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;f.held.add('open');const opening=api.open('R-Cannon');await f.advance(20);assert.equal(f.requests.at(-1).action,'open');const closing=api.close();await f.run(closing);assert.equal(await f.run(opening),false);assert.equal(api.report().open,false);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);assert.equal(f.requests.some(r=>r.action==='select'),false);
 });
 await check('normal close keeps an opaque cover until native acknowledgement and paint complete',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(80);f.held.add('close');const closing=api.close();await f.advance(20);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,false);assert.equal(f.document.getElementById('wt-intelligence-scrim').hidden,false);assert.equal(f.slot.querySelector('.wt-intel-preview-cover').hidden,false);assert.equal(f.slot.classList.contains('preview-ready'),false);
  f.respond(f.requests.at(-1));assert.equal(await f.run(closing),true);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);
 });
 await check('native close failure stays covered and reports failure; an explicit retry can finish',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;await f.run(api.open());await f.advance(80);f.setResponder(command=>command.action==='close'?{nonce:command.nonce,ok:false,error:'Native close rejected'}:f.defaultResponse(command));
  assert.equal(await f.run(api.close()),false);assert.equal(api.report().open,true);assert.equal(api.report().closing,false);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,false);assert.equal(f.document.getElementById('wt-intelligence-scrim').hidden,false);assert.equal(f.slot.querySelector('.wt-intel-preview-cover').hidden,false);assert.equal(f.slot.classList.contains('preview-ready'),false);assert.match(api.report().lastError,/Native close rejected/);
  f.setResponder(f.defaultResponse);assert.equal(await f.run(api.close()),true);
 });
 await check('late layout response after close cannot restore the native model hole',async()=>{
  const f=fixture(),api=f.window.__warzoneIntelligence;f.held.add('layout');await f.run(api.open());await f.advance(30);assert.equal(f.requests.at(-1).action,'layout');const closing=api.close();await f.run(closing);assert.equal(f.slot.classList.contains('preview-ready'),false);assert.equal(f.document.getElementById('wt-intelligence-panel').hidden,true);
 });
 await check('clicking a completed-research notice opens its exact native Intelligence report',async()=>{
  const f=fixture({withNotices:true});f.dispatch('blocknight-research-completed',completed());assert.equal(f.box().getAttribute('role'),'button');assert.equal(f.box().getAttribute('tabindex'),'0');assert.equal(f.box().getAttribute('data-research-topic'),'R-Cannon');f.box().emit('click');await f.advance(100);assert.equal(f.window.__warzoneIntelligence.report().selectedId,'R-Cannon');assert.equal(f.requests.find(r=>r.action==='select').topicId,'R-Cannon');assert.equal(f.box().hidden,true);
 });
 await check('Enter and Space activate exact-ID completion notices with keyboard semantics',async()=>{
  for(const key of ['Enter',' ']){const f=fixture({withNotices:true});f.dispatch('blocknight-research-completed',completed());const e=f.box().emit('keydown',{key});assert.equal(e.prevented,true);assert.equal(e.stopped,true);await f.advance(100);assert.equal(f.window.__warzoneIntelligence.report().selectedId,'R-Cannon');}
 });
 await check('ordinary save/round/camera notices remove research interactivity and never open a report',async()=>{
  const f=fixture({withNotices:true});f.dispatch('blocknight-research-completed',completed());for(const show of [()=>f.window.WarzoneNotices.show('Game saved'),()=>f.engine(packet(camera())),()=>f.engine(packet({kind:'round',round:1,totalRounds:15,player:0,gameTime:50000}))]){show();assert.equal(f.box().getAttribute('role'),'status');assert.equal(f.box().getAttribute('data-research-topic'),null);assert.equal(f.box().getAttribute('tabindex'),null);assert.equal(f.box().getAttribute('aria-label'),null);f.box().emit('click');f.box().emit('keydown',{key:'Enter'});}assert.equal(f.requests.length,0);
 });
 await check('duplicate engine/channel/log packets do not show twice or extend the notice lifetime',async()=>{
  const f=fixture({withNotices:true});await f.advance(650);const p=packet(camera());f.engine(p);await f.advance(4400);f.channels[0].emit(p);f.append(p+'\n');await f.advance(450);assert.equal(f.window.WarzoneNotices.report().shown,1);assert.equal(f.box().hidden,true);
  f.dispatch('blocknight-research-completed',completed());f.dispatch('blocknight-research-completed',completed());assert.equal(f.window.WarzoneNotices.report().shown,2);
 });
 await check('stale, foreign, malformed and pre-load packets retain original rejection rules',async()=>{
  const f=fixture({withNotices:true});for(const value of [null,{kind:'camera',direction:'diagonal',gameTime:50000},{kind:'round',round:2,totalRounds:15,player:1,gameTime:50000},camera('north',10000),camera('north',90000)])f.engine(packet(value));
  for(const value of [{...completed(),player:1},{...completed(),name:''},completed('R-Old',10000),completed('R-Future',90000),completed('R-Initial',1000)])f.dispatch('blocknight-research-completed',value);f.engine('BNNOTICE:not json');assert.equal(f.window.WarzoneNotices.report().shown,0);
  f.engine(packet(camera()));f.clock(30000);f.engine(packet(camera()));assert.equal(f.box().hidden,true);f.engine(packet(camera('south',30000)));assert.equal(f.title().textContent,'View aligned to South');
 });
 await check('log fallback still skips existing history, buffers partial lines and handles truncation',async()=>{
  const f=fixture({withNotices:true});await f.advance(650);assert.equal(f.window.WarzoneNotices.report().shown,0);const p=packet(camera('east'));f.append(p.slice(0,19));await f.advance(650);assert.equal(f.window.WarzoneNotices.report().shown,0);f.append(p.slice(19)+'\n');await f.advance(650);assert.equal(f.title().textContent,'View aligned to East');f.truncate(packet(camera('west'))+'\n');await f.advance(650);assert.equal(f.title().textContent,'View aligned to West');
 });
 await check('battle end prevents late notices/model reopening and Duel creates neither feature',async()=>{
  const f=fixture({withNotices:true});await f.run(f.window.__warzoneIntelligence.open());f.dispatch('blocknight-research-completed',completed());const before=f.window.WarzoneNotices.report().shown;f.end();f.engine(packet(camera('east')));f.dispatch('blocknight-research-completed',completed('R-Other'));await f.advance(100);assert.equal(f.window.WarzoneNotices.report().shown,before);assert.equal(f.box().hidden,true);assert.equal(f.channels[0].closed,true);assert.equal(f.window.__warzoneIntelligence.report().open,false);assert.equal(await f.run(f.window.__warzoneIntelligence.open()),false);
  const duel=fixture({duel:true,withNotices:true});assert.equal(duel.window.__warzoneIntelligence,undefined);assert.equal(duel.window.WarzoneNotices,undefined);assert.equal(duel.channels.length,0);
 });
 const proof={version:'0.36',passed:true,recordedUTC:new Date().toISOString(),scope:'Actual Intelligence/notices modules in bounded DOM/native-transport fixtures; no Android/native gameplay, visual or emulator verification',checks,sources:[...sources,'tools/check-intelligence-ui-036.cjs'].map(p=>({path:p,sha256:hash(p)}))};
 fs.mkdirSync('qa/0.36-intelligence',{recursive:true});fs.writeFileSync('qa/0.36-intelligence/ui-source-checks.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
