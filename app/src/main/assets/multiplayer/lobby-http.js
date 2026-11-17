/* Preserve the native engine's signed lobby requests outside browser CORS. */
(() => {
 'use strict';
 if(globalThis.PcLobbyHttp)return;
 const Original=globalThis.XMLHttpRequest,originalFetch=globalThis.fetch;
 const channel=new BroadcastChannel('pc-lobby-http'),pending=new Map(),routes=new Map(),routeKeys=new Map();
 const main=typeof window!=='undefined'&&window.top===window&&typeof AndroidLobbyHttp!=='undefined';
 const client=globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
 let nextLocal=0,nextBridge=Math.floor(Math.random()*1000000000)+1;
 const encode=value=>{const bytes=typeof value==='string'?new TextEncoder().encode(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value||0);let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);};
 const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 const allowed=url=>{try{return new URL(url,globalThis.location.href).origin==='https://wzlobby.wz2100.net';}catch{return false;}};
 const key=command=>command.client+':'+command.id;
 function deliver(event){if(event.client!==client)return;const done=pending.get(event.id);if(done){pending.delete(event.id);done(event);}}
 function complete(id,status,headers,body,error){
  const route=routes.get(id);if(!route)return false;
  routes.delete(id);routeKeys.delete(key(route));
  const event={client:route.client,id:route.id,status,headers,body,error};
  deliver(event);channel.postMessage({event});return true;
 }
 function relay(command){
  if(routeKeys.has(key(command)))return;
  // Main-frame IDs cannot collide between independently loaded workers.
  // Never reuse one in this page: late callbacks have no new owner.
  if(nextBridge>2147483647){const event={client:command.client,id:command.id,status:0,headers:'{}',body:'',error:'Lobby request ID limit reached'};deliver(event);channel.postMessage({event});return;}
  const id=nextBridge++;routes.set(id,command);routeKeys.set(key(command),id);
  try{AndroidLobbyHttp.request(id,command.method,command.url,JSON.stringify(command.headers),command.body);}
  catch(error){complete(id,0,'{}','',String(error?.message||error));}
 }
 function cancelRoute(command){
  const id=routeKeys.get(key(command));if(id===undefined)return;
  routeKeys.delete(key(command));routes.delete(id);
  try{AndroidLobbyHttp.cancel(id);}catch{}
 }
 function request(method,url,headers,body,done){
  const command={client,id:++nextLocal,method,url,headers,body:encode(body)};
  pending.set(command.id,done);
  try{if(main)relay(command);else channel.postMessage({command});}
  catch(error){deliver({client,id:command.id,status:0,headers:'{}',body:'',error:String(error?.message||error)});}
  return()=>{if(!pending.delete(command.id))return;if(main)cancelRoute(command);else channel.postMessage({cancel:{client,id:command.id}});};
 }
 channel.onmessage=({data})=>{
  if(data.command&&main)relay(data.command);
  if(data.cancel&&main)cancelRoute(data.cancel);
  if(data.event)deliver(data.event);
 };
 globalThis.PcLobbyHttp={receive:complete,report:()=>({pending:pending.size,relayed:routes.size,main})};
 globalThis.addEventListener?.('pagehide',()=>{
  for(const [id,done]of [...pending]){
   pending.delete(id);if(main)cancelRoute({client,id});else channel.postMessage({cancel:{client,id}});
   done({client,id,status:0,headers:'{}',body:'',error:'The lobby page closed.'});
  }
  if(main)for(const route of [...routes.values()]){cancelRoute(route);channel.postMessage({event:{client:route.client,id:route.id,status:0,headers:'{}',body:'',error:'The lobby page closed.'}});}
 });

 class NativeXHR extends EventTarget{
  constructor(){super();this.readyState=0;this.status=0;this.statusText='';this.response=null;this.responseType='';this.responseText='';this.timeout=0;this.headers={};this.responseHeaders={};this.active=false;this.identity=null;this.cancel=null;this.timer=null;}
  dispatchEvent(event){super.dispatchEvent(event);this['on'+event.type]?.call(this,event);return true;}
  reset(){this.status=0;this.statusText='';this.response=null;this.responseText='';this.responseHeaders={};}
  dispose(){this.active=false;this.identity=null;clearTimeout(this.timer);this.timer=null;const cancel=this.cancel;this.cancel=null;cancel?.();}
  open(method,url,async=true){if(!async)throw Error('Synchronous lobby requests are unsupported');this.dispose();this.reset();this.method=String(method);this.url=String(url);this.headers={};this.readyState=1;this.dispatchEvent(new Event('readystatechange'));}
  setRequestHeader(name,value){if(this.readyState!==1||this.active)throw new DOMException('The request is not open.','InvalidStateError');name=String(name);value=String(value);const old=Object.keys(this.headers).find(k=>k.toLowerCase()===name.toLowerCase());if(old)this.headers[old]+=', '+value;else this.headers[name]=value;}
  getAllResponseHeaders(){return Object.entries(this.responseHeaders).map(([k,v])=>k+': '+v).join('\r\n');}
  getResponseHeader(name){return Object.entries(this.responseHeaders).find(([k])=>k.toLowerCase()===String(name).toLowerCase())?.[1]??null;}
  overrideMimeType(){}
  fail(type){if(!this.active)return;this.dispose();this.reset();this.readyState=4;this.dispatchEvent(new Event('readystatechange'));this.dispatchEvent(new Event(type));this.dispatchEvent(new Event('loadend'));if(type==='abort')this.readyState=0;}
  send(body){
   if(this.readyState!==1||this.active)throw new DOMException('The request is not open.','InvalidStateError');
   const identity=this.identity={};this.active=true;
   if(this.timeout>0)this.timer=setTimeout(()=>this.fail('timeout'),this.timeout);
   const cancel=request(this.method,this.url,this.headers,body,event=>{
    if(!this.active||identity!==this.identity)return;
    clearTimeout(this.timer);this.timer=null;this.cancel=null;
    this.status=event.status;this.responseURL=this.url;
    try{this.responseHeaders=JSON.parse(event.headers||'{}');}catch{this.responseHeaders={};}
    if(!event.error){
     this.readyState=2;this.dispatchEvent(new Event('readystatechange'));if(!this.active||identity!==this.identity)return;
     this.readyState=3;this.dispatchEvent(new Event('readystatechange'));if(!this.active||identity!==this.identity)return;
    }
    let data;try{data=decode(event.body||'');}catch{this.fail('error');return;}
    this.responseText=new TextDecoder().decode(data);
    this.response=this.responseType==='arraybuffer'?data.buffer:this.responseType==='json'?(()=>{try{return JSON.parse(this.responseText);}catch{return null;}})():this.responseText;
    this.active=false;this.identity=null;this.readyState=4;this.dispatchEvent(new Event('readystatechange'));this.dispatchEvent(new Event(event.error?'error':'load'));this.dispatchEvent(new Event('loadend'));
   });
   if(this.active&&identity===this.identity)this.cancel=cancel;else cancel();
  }
  abort(){if(this.active)this.fail('abort');else{this.dispose();this.reset();this.readyState=0;}}
 }
 globalThis.XMLHttpRequest=function(){
  const real=new Original(),settings=new Map(),listeners=new Set();let chosen=null;
  function remove(record){listeners.delete(record);for(const target of record.targets)target.removeEventListener(record.type,record.wrapper,record.capture);}
  function attach(record,target){if(!record.targets.has(target)){target.addEventListener(record.type,record.wrapper,record.options);record.targets.add(target);}}
  return new Proxy(real,{
   get(target,property){
    if(property==='open')return(method,url,...rest)=>{
     if(chosen instanceof NativeXHR)chosen.dispose();else if(chosen)real.abort();
     chosen=allowed(String(url))?new NativeXHR():real;
     for(const [name,value]of settings)chosen[name]=value;
     for(const record of listeners)attach(record,chosen);
     return chosen.open(method,url,...rest);
    };
    if(property==='addEventListener')return(type,callback,options)=>{
     if(!callback)return;const capture=typeof options==='boolean'?options:Boolean(options?.capture);
     if([...listeners].some(r=>r.type===type&&r.callback===callback&&r.capture===capture))return;
     const record={type,callback,options,capture,targets:new Set()};
     record.wrapper=function(event){if(options?.once)remove(record);if(typeof callback==='function')callback.call(this,event);else callback.handleEvent(event);};
     listeners.add(record);attach(record,chosen||real);
    };
    if(property==='removeEventListener')return(type,callback,options)=>{const capture=typeof options==='boolean'?options:Boolean(options?.capture);for(const record of [...listeners])if(record.type===type&&record.callback===callback&&record.capture===capture)remove(record);};
    const value=(chosen||real)[property];return typeof value==='function'?value.bind(chosen||real):value;
   },
   set(target,property,value){if(String(property).startsWith('on')||['timeout','responseType','withCredentials'].includes(property))settings.set(property,value);(chosen||real)[property]=value;return true;}
  });
 };
 for(const [k,v]of Object.entries({UNSENT:0,OPENED:1,HEADERS_RECEIVED:2,LOADING:3,DONE:4}))globalThis.XMLHttpRequest[k]=v;

 function fetchHeaders(input){
  const headers={};
  if(Array.isArray(input))for(const [name,value]of input)headers[name]=String(value);
  else if(input?.forEach&&typeof input!=='string')input.forEach((value,name)=>{headers[name]=value;});
  else Object.assign(headers,input||{});
  for(const [name,value]of Object.entries({Origin:'wz2100://wz2100.net',Referer:'https://github.com/Warzone2100/warzone2100'}))if(!Object.keys(headers).some(k=>k.toLowerCase()===name.toLowerCase()))headers[name]=value;
  return headers;
 }
 globalThis.fetch=(input,options={})=>{
  const url=typeof input==='string'||input instanceof URL?String(input):input?.url;
  if(!allowed(url))return originalFetch.call(globalThis,input,options);
  const signal=options.signal===undefined?input?.signal:options.signal;
  return new Promise((resolve,reject)=>{
   let settled=false,cancel=null;
   const clean=()=>signal?.removeEventListener('abort',abort);
   const abort=()=>{if(settled)return;settled=true;clean();cancel?.();reject(signal?.reason===undefined?new DOMException('The request was aborted.','AbortError'):signal.reason);};
   if(signal?.aborted){abort();return;}
   signal?.addEventListener('abort',abort,{once:true});
   const start=body=>{
    if(settled)return;
    try{
     cancel=request(options.method||input?.method||'GET',url,fetchHeaders(options.headers===undefined?input?.headers:options.headers),body,event=>{
      if(settled)return;settled=true;clean();
      if(event.error||!event.status){reject(new TypeError(event.error||'Lobby network request failed'));return;}
      try{resolve(new Response([204,205,304].includes(event.status)?null:decode(event.body||''),{status:event.status,headers:JSON.parse(event.headers||'{}')}));}catch(error){reject(error);}
     });
     if(settled)cancel();
    }catch(error){if(!settled){settled=true;clean();reject(error);}}
   };
   if(options.body===undefined&&input&&typeof input.clone==='function'&&input.body)input.clone().arrayBuffer().then(start,error=>{if(!settled){settled=true;clean();reject(error);}});
   else start(options.body);
  });
 };
})();
