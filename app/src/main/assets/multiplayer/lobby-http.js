/* Preserve the native engine's signed lobby requests outside browser CORS. */
(() => {
 if(globalThis.PcLobbyHttp)return;
 const Original=globalThis.XMLHttpRequest, channel=new BroadcastChannel('pc-lobby-http'),pending=new Map(),main=typeof window!=='undefined'&&window.top===window&&typeof AndroidLobbyHttp!=='undefined';
 const encode=a=>{const b=typeof a==='string'?new TextEncoder().encode(a):new Uint8Array(a||0);let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);};
 const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 function send(c){if(!main)return channel.postMessage({command:c});AndroidLobbyHttp.request(c.id,c.method,c.url,JSON.stringify(c.headers),c.body);}
 function deliver(e){const cb=pending.get(e.id);if(cb){pending.delete(e.id);cb(e);}}
 channel.onmessage=({data})=>{if(data.command&&main)send(data.command);if(data.event)deliver(data.event);};
 globalThis.PcLobbyHttp={receive(id,status,headers,body,error){const e={id,status,headers,body,error};deliver(e);channel.postMessage({event:e});}};
 function request(method,url,headers,body,done){const id=Math.floor(Math.random()*2000000000)+1;pending.set(id,done);send({id,method,url,headers,body:encode(body)});return()=>pending.delete(id);}
 const allowed=url=>{try{return new URL(url,globalThis.location.href).origin==='https://wzlobby.wz2100.net';}catch{return false;}};
 class NativeXHR extends EventTarget{
  constructor(){super();this.readyState=0;this.status=0;this.statusText='';this.response=null;this.responseType='';this.responseText='';this.timeout=0;this.headers={};this.responseHeaders={};}
  dispatchEvent(e){super.dispatchEvent(e);this['on'+e.type]?.call(this,e);return true;}
  open(method,url,async=true){if(!async)throw Error('Synchronous lobby requests are unsupported');this.method=method;this.url=String(url);this.readyState=1;this.dispatchEvent(new Event('readystatechange'));}
  setRequestHeader(k,v){this.headers[k]=v;}
  getAllResponseHeaders(){return Object.entries(this.responseHeaders).map(([k,v])=>k+': '+v).join('\r\n');}
  getResponseHeader(k){return Object.entries(this.responseHeaders).find(([n])=>n.toLowerCase()===k.toLowerCase())?.[1]??null;}
  overrideMimeType(){}
  send(body){this.cancel=request(this.method,this.url,this.headers,body,e=>{this.status=e.status;this.responseURL=this.url;try{this.responseHeaders=JSON.parse(e.headers||'{}');}catch{}if(!e.error){this.readyState=2;this.dispatchEvent(new Event('readystatechange'));this.readyState=3;this.dispatchEvent(new Event('readystatechange'));}const data=decode(e.body||'');this.responseText=new TextDecoder().decode(data);this.response=this.responseType==='arraybuffer'?data.buffer:this.responseType==='json'?(()=>{try{return JSON.parse(this.responseText);}catch{return null;}})():this.responseText;this.readyState=4;this.dispatchEvent(new Event('readystatechange'));this.dispatchEvent(new Event(e.error?'error':'load'));this.dispatchEvent(new Event('loadend'));});}
  abort(){this.cancel?.();this.readyState=0;this.dispatchEvent(new Event('abort'));this.dispatchEvent(new Event('loadend'));}
 }
 globalThis.XMLHttpRequest=function(){const real=new Original();let chosen=null;return new Proxy(real,{get(t,p){if(p==='open')return(method,url,...rest)=>{chosen=allowed(url)?new NativeXHR():real;return chosen.open(method,url,...rest);};const target=chosen||real,value=target[p];return typeof value==='function'?value.bind(target):value;},set(t,p,v){(chosen||real)[p]=v;return true;}});};
 for(const [k,v]of Object.entries({UNSENT:0,OPENED:1,HEADERS_RECEIVED:2,LOADING:3,DONE:4}))globalThis.XMLHttpRequest[k]=v;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(url,options={})=>{if(!allowed(String(url)))return originalFetch(url,options);return new Promise((resolve,reject)=>request(options.method||'GET',String(url),Object.assign({Origin:'wz2100://wz2100.net',Referer:'https://github.com/Warzone2100/warzone2100'},options.headers||{}),options.body,e=>{if(e.error)return reject(Error(e.error));resolve(new Response([204,205,304].includes(e.status)?null:decode(e.body||''),{status:e.status,headers:JSON.parse(e.headers||'{}')}));}));};
})();
