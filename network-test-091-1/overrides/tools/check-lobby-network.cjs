'use strict';
// API-contract checks in isolated JS contexts. No network, Android, or game state.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const bridge=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/lobby-http.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/lobby-ui.js'),'utf8');
const URL_LIST='https://wzlobby.wz2100.net/lobby/api/v1/games';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Clock{
 constructor(){this.now=100000;this.next=0;this.timers=new Map();}
 set(fn,ms=0){const id=++this.next;this.timers.set(id,{fn,at:this.now+Number(ms)});return id;}
 clear(id){this.timers.delete(id);}
 async advance(ms){const end=this.now+ms;let limit=100;while(limit--){const next=[...this.timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.now=next[1].at;this.timers.delete(next[0]);next[1].fn();await flush();}assert(limit>0,'Unbounded timer loop');this.now=end;await flush();}
}
class Element extends EventTarget{
 constructor(){super();this.children=[];this.dataset={};this.attributes={};this.style={setProperty(){}};this.clientHeight=400;this.disabled=false;this.textContent='';}
 replaceChildren(...items){this.children=items;}
 append(...items){this.children.push(...items);}
 setAttribute(k,v){this.attributes[k]=String(v);}
}
function fixture(){
 const clock=new Clock(),channels=[],calls=[],cancels=[],originalCalls=[],contexts=[];
 class Channel{constructor(name){this.name=name;channels.push(this);}postMessage(data){for(const c of channels)if(c!==this&&c.name===this.name)c.onmessage?.({data:structuredClone(data)});}}
 class OriginalXHR extends EventTarget{open(...args){this.opened=args;}abort(){this.aborted=true;}send(body){this.body=body;}setRequestHeader(){}}
 const native={request(id,method,url,headers,body){const call={id,method,url,headers:JSON.parse(headers),body};calls.push(call);native.onRequest?.(call);},cancel(id){cancels.push(id);}};
 function context(main=true,withUI=false){
  const events=new EventTarget(),elements=Object.fromEntries(['#lobby','#lobby-status','#rooms','#hide-empty'].map(k=>[k,new Element()]));
  const document=new EventTarget();Object.assign(document,{hidden:false,readyState:'complete',querySelector:k=>elements[k]||null,createElement:()=>new Element()});
  const publishes=[];const fakeDate=class extends Date{static now(){return clock.now;}};
  const sandbox={console:{warn(){}},TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,EventTarget,Event,DOMException,AbortController,Response,Request,Headers,URL,
   crypto:{randomUUID:()=>crypto.randomUUID()},Math:Object.assign(Object.create(Math),{random:()=>0.25}),Date:fakeDate,
   setTimeout:clock.set.bind(clock),clearTimeout:clock.clear.bind(clock),BroadcastChannel:Channel,XMLHttpRequest:OriginalXHR,
   btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),location:{href:'https://appassets.androidplatform.net/multiplayer/index.html'},
   fetch:(...args)=>{originalCalls.push(args);return Promise.resolve(new Response('browser'));},
   addEventListener:events.addEventListener.bind(events),localStorage:{getItem(){return null;},setItem(){}},innerWidth:800,innerHeight:600,
   PcMultiplayerSession:{active:false},PcNativeLobby:{publish:s=>publishes.push(JSON.parse(JSON.stringify(s)))}};
  if(main){sandbox.window=sandbox;sandbox.top=sandbox;sandbox.AndroidLobbyHttp=native;}
  if(withUI)sandbox.document=document;
  vm.createContext(sandbox);vm.runInContext(bridge,sandbox);if(withUI)vm.runInContext(ui,sandbox);
  const item={ctx:sandbox,elements,document,publishes,events};contexts.push(item);return item;
 }
 function reply(call,status=200,body='ok',headers={}){contexts.find(x=>x.ctx.AndroidLobbyHttp)?.ctx.PcLobbyHttp.receive(call.id,status,JSON.stringify(headers),Buffer.from(body).toString('base64'),'');}
 function fail(call,error='Network is unreachable'){contexts.find(x=>x.ctx.AndroidLobbyHttp)?.ctx.PcLobbyHttp.receive(call.id,0,'{}','',error);}
 return{clock,calls,cancels,originalCalls,native,context,reply,fail};
}
const listing=name=>JSON.stringify({type:'header',motd:'Fixture'})+'\n'+JSON.stringify({id:'room-1',name,map:'Sk-Mountain',players:{cur:1,max:4},v:'4.7.0',netv:[16384,104],conn:['tcp:ip4'],private:false});
const tests=[];const test=(name,run)=>tests.push({name,run});
test('fetch AbortSignal cancels native transport and ignores late callback',async()=>{
 const f=fixture(),{ctx}=f.context(),a=new AbortController();const result=ctx.fetch(URL_LIST,{signal:a.signal});const rejected=result.catch(e=>e);assert.equal(f.calls.length,1);a.abort();assert.deepEqual(f.cancels,[f.calls[0].id]);assert.equal((await rejected).name,'AbortError');f.reply(f.calls[0]);assert.equal(ctx.PcLobbyHttp.report().pending,0);assert.equal(ctx.PcLobbyHttp.report().relayed,0);
});
test('already-aborted Request never dispatches',async()=>{
 const f=fixture(),{ctx}=f.context(),a=new AbortController();a.abort();await assert.rejects(ctx.fetch(new Request(URL_LIST,{signal:a.signal})),e=>e.name==='AbortError');assert.equal(f.calls.length,0);
});
test('abort synchronous with bridge dispatch is cleaned up',async()=>{
 const f=fixture(),{ctx}=f.context(),a=new AbortController();f.native.onRequest=()=>a.abort();await assert.rejects(ctx.fetch(URL_LIST,{signal:a.signal}),e=>e.name==='AbortError');assert.equal(f.cancels.length,1);assert.equal(ctx.PcLobbyHttp.report().relayed,0);
});
test('XHR signed POST method/path/custom headers/raw view bytes are unchanged',async()=>{
 const f=fixture(),{ctx}=f.context(),x=new ctx.XMLHttpRequest(),url='https://wzlobby.wz2100.net/lobby/api/v1/game/fixture-123/request-join';x.open('POST',url);x.setRequestHeader('X-WZ-Test-Signature','fixture');x.responseType='arraybuffer';x.send(new Uint8Array([7,0,255,128,9]).subarray(1,4));const call=f.calls[0];assert.equal(call.method,'POST');assert.equal(call.url,url);assert.equal(call.headers['X-WZ-Test-Signature'],'fixture');assert.deepEqual([...Buffer.from(call.body,'base64')],[0,255,128]);f.reply(call,201,'response',{'X-WZ-Result':'fixture'});assert.equal(x.status,201);assert.equal(x.getResponseHeader('x-wz-result'),'fixture');assert.equal(Buffer.from(x.response).toString(),'response');
});
test('XHR before-open handlers/listeners abort once; reuse rejects old reply',async()=>{
 const f=fixture(),{ctx}=f.context(),x=new ctx.XMLHttpRequest();let aborted=0,ended=0,loaded=0;x.onabort=()=>aborted++;x.addEventListener('loadend',()=>ended++);x.addEventListener('load',()=>loaded++);x.open('GET',URL_LIST);x.send();const old=f.calls[0];x.abort();assert.equal(aborted,1);assert.equal(ended,1);assert.equal(x.readyState,0);assert.deepEqual(f.cancels,[old.id]);x.open('GET',URL_LIST);x.send();const next=f.calls[1];assert.notEqual(next.id,old.id);f.reply(old,200,'late');assert.equal(loaded,0);assert.equal(x.readyState,1);f.reply(next,200,'new');assert.equal(loaded,1);assert.equal(ended,2);assert.equal(x.responseText,'new');x.abort();assert.equal(aborted,1);
});
test('XHR timeout really cancels and cannot emit a later load',async()=>{
 const f=fixture(),{ctx}=f.context(),x=new ctx.XMLHttpRequest();let timeout=0,end=0,load=0;x.timeout=25;x.ontimeout=()=>timeout++;x.onloadend=()=>end++;x.onload=()=>load++;x.open('POST',URL_LIST+'/fixture');x.send('signed-body');await f.clock.advance(25);assert.equal(timeout,1);assert.equal(end,1);assert.equal(x.status,0);assert.equal(x.readyState,4);assert.equal(f.cancels.length,1);f.reply(f.calls[0]);assert.equal(load,0);assert.equal(end,1);
});
test('XHR completion clears timeout; abort at headers suppresses load',async()=>{
 const f=fixture(),{ctx}=f.context(),x=new ctx.XMLHttpRequest();let timeout=0,load=0,abort=0;x.timeout=10;x.ontimeout=()=>timeout++;x.onload=()=>load++;x.open('GET',URL_LIST);x.send();f.reply(f.calls[0]);await f.clock.advance(20);assert.equal(load,1);assert.equal(timeout,0);x.open('GET',URL_LIST);x.onabort=()=>abort++;x.onreadystatechange=()=>{if(x.readyState===2)x.abort();};x.send();f.reply(f.calls[1]);assert.equal(abort,1);assert.equal(load,1);
});
test('worker requests have separate native IDs and cancellation owners',async()=>{
 const f=fixture();f.context();const one=f.context(false).ctx,two=f.context(false).ctx,a=new AbortController();const p=one.fetch(URL_LIST,{signal:a.signal}).catch(e=>e);const q=two.fetch(URL_LIST);assert.equal(f.calls.length,2);assert.notEqual(f.calls[0].id,f.calls[1].id);a.abort();assert.deepEqual(f.cancels,[f.calls[0].id]);assert.equal((await p).name,'AbortError');f.reply(f.calls[0],200,'stale');f.reply(f.calls[1],200,'worker-two');assert.equal(await(await q).text(),'worker-two');assert.equal(two.PcLobbyHttp.report().pending,0);
});
test('pagehide releases parent and worker transports without replay',async()=>{
 const f=fixture(),main=f.context(),worker=f.context(false);const p=main.ctx.fetch(URL_LIST).catch(e=>e),q=worker.ctx.fetch(URL_LIST,{method:'POST',body:'fixture-signed'}).catch(e=>e);main.events.dispatchEvent(new Event('pagehide'));assert.equal(f.cancels.length,2);await Promise.all([p,q]);assert.equal(main.ctx.PcLobbyHttp.report().relayed,0);assert.equal(worker.ctx.PcLobbyHttp.report().pending,0);assert.equal(f.calls.filter(x=>x.method==='POST').length,1);
});
test('other hosts retain original browser transport',async()=>{
 const f=fixture(),{ctx}=f.context();assert.equal(await(await ctx.fetch('https://example.com/fixture')).text(),'browser');const x=new ctx.XMLHttpRequest();x.open('GET','https://example.com/fixture');x.send('browser');assert.equal(f.calls.length,0);assert.equal(f.originalCalls.length,1);assert.equal(x.body,'browser');
});
test('listing20s deadline cancels native request; late success cannot replace UI',async()=>{
 const f=fixture(),h=f.context(true,true);assert.equal(f.calls.length,1);await f.clock.advance(20000);assert.deepEqual(f.cancels,[f.calls[0].id]);assert.equal(h.ctx.PcLobbyUi.snapshot().loading,false);assert.match(h.ctx.PcLobbyUi.snapshot().error,/timed out/);f.reply(f.calls[0],200,listing('Late'));await flush();assert.equal(h.ctx.PcLobbyUi.snapshot().games.length,0);
});
test('resume during load coalesces once; failed recovery never loops',async()=>{
 const f=fixture(),h=f.context(true,true);h.ctx.PcLobbyUi.resume();h.ctx.PcLobbyUi.resume();h.ctx.PcLobbyUi.resume();await f.clock.advance(20000);assert.equal(f.calls.length,2);assert(f.calls.every(x=>x.method==='GET'&&x.url===URL_LIST));f.fail(f.calls[1]);await flush();h.ctx.PcLobbyUi.resume();await f.clock.advance(60000);assert.equal(f.calls.length,2);const manual=h.ctx.refreshPcLobby();assert.equal(f.calls.length,3);f.reply(f.calls[2],200,listing('Manual'));await manual;
});
test('resume inside throttle is retained and a fresh result consumes intent',async()=>{
 const f=fixture(),h=f.context(true,true);f.fail(f.calls[0]);await flush();assert.equal(h.ctx.PcLobbyUi.resume(),true);h.ctx.PcLobbyUi.resume();await f.clock.advance(4999);assert.equal(f.calls.length,1);await f.clock.advance(1);assert.equal(f.calls.length,2);f.reply(f.calls[1],200,listing('Fresh'));await flush();h.ctx.PcLobbyUi.resume();await f.clock.advance(10000);assert.equal(f.calls.length,2);assert.equal(h.ctx.PcLobbyUi.snapshot().games[0].name,'Fresh');
});
test('successful in-flight listing consumes queued resume without a second GET',async()=>{
 const f=fixture(),h=f.context(true,true);h.ctx.PcLobbyUi.resume();f.reply(f.calls[0],200,listing('Current'));await flush();await f.clock.advance(6000);assert.equal(f.calls.length,1);
});
test('cached rooms survive errors; active game blocks delayed directory updates',async()=>{
 const f=fixture(),h=f.context(true,true);f.reply(f.calls[0],200,listing('Cached'));await flush();const refresh=h.ctx.refreshPcLobby();f.fail(f.calls[1]);await refresh;assert.equal(h.ctx.PcLobbyUi.snapshot().games[0].name,'Cached');assert.equal(h.ctx.PcLobbyUi.snapshot().stale,true);h.ctx.PcLobbyUi.resume();h.ctx.PcMultiplayerSession.active=true;const count=h.publishes.length;await f.clock.advance(5000);assert.equal(f.calls.length,2);assert.equal(h.ctx.PcLobbyUi.resume(),false);assert.equal(await h.ctx.refreshPcLobby(),false);assert.equal(h.publishes.length,count);h.ctx.PcMultiplayerSession.active=false;const next=h.ctx.refreshPcLobby();h.ctx.PcMultiplayerSession.active=true;f.reply(f.calls[2],200,listing('Must not replace'));await next;assert.equal(h.ctx.PcLobbyUi.snapshot().games[0].name,'Cached');assert.equal(h.publishes.length,count+1);
});
(async()=>{const failures=[];for(const t of tests){let timer;try{await Promise.race([t.run(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Unsettled contract fixture')),1000);})]);}catch(error){failures.push({name:t.name,error:String(error.stack||error)});}finally{clearTimeout(timer);}}console.log(JSON.stringify({sourceRoot:root,passed:failures.length===0,checks:tests.length,failures},null,2));process.exitCode=failures.length?1:0;})().catch(error=>{console.error(error);process.exitCode=1;});
