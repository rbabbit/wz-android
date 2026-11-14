/* Android raw TCP adapter for Emscripten SOCKFS. No WebSocket framing on wire. */
(() => {
  if (globalThis.PcSocket) return;
  const sockets = new Map(), channel = new BroadcastChannel('pc-native-sockets');
  const main = typeof window !== 'undefined' && window.top === window && typeof AndroidSocketBridge !== 'undefined';
  const bytes = b => { const raw=atob(b),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a.buffer; };
  const encode = a => {const v=new Uint8Array(a);let s='';for(let i=0;i<v.length;i+=16384)s+=String.fromCharCode(...v.subarray(i,i+16384));return btoa(s);};
  function command(c) {
    if (!main) return channel.postMessage({command:c});
    if(c.action==='open')AndroidSocketBridge.open(c.id,c.host,c.port);
    else if(c.action==='send')AndroidSocketBridge.send(c.id,encode(c.data));
    else if(c.action==='close')AndroidSocketBridge.close(c.id);
  }
  function deliver(e) {
    const socket=sockets.get(e.id);if(!socket)return;
    if(e.type==='open'){socket.readyState=1;socket.dispatchEvent(new Event('open'));}
    else if(e.type==='data'){socket.dispatchEvent(new MessageEvent('message',{data:bytes(e.payload)}));}
    else if(e.type==='error'){socket.dispatchEvent(new Event('error'));console.error('TCP',socket.url,e.payload);}
    else if(e.type==='close'){socket.readyState=3;socket.dispatchEvent(new CloseEvent('close',{code:1000,wasClean:true}));sockets.delete(e.id);}
  }
  channel.onmessage=({data})=>{if(data.command&&main)command(data.command);else if(data.event)deliver(data.event);};
  globalThis.PcSocket={receive(id,type,payload){const e={id,type,payload};deliver(e);channel.postMessage({event:e});}};
  const Original=globalThis.WebSocket;
  class RawTcp extends EventTarget {
    constructor(url,protocols){super();const u=new URL(url);this.id=Math.floor(Math.random()*2000000000)+1;this.url=url;this.readyState=0;this.binaryType='arraybuffer';this.bufferedAmount=0;this.protocol='binary';this.extensions='';sockets.set(this.id,this);command({action:'open',id:this.id,host:u.hostname,port:Number(u.port||80)});}
    dispatchEvent(e){super.dispatchEvent(e);this['on'+e.type]?.call(this,e);return true;}
    send(data){if(this.readyState!==1)throw new DOMException('Socket is not open','InvalidStateError');const a=ArrayBuffer.isView(data)?data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength):data;if(!(a instanceof ArrayBuffer))throw TypeError('Only binary TCP payloads supported');command({action:'send',id:this.id,data:a});}
    close(){if(this.readyState>=2)return;this.readyState=2;command({action:'close',id:this.id});}
  }
  for(const [n,v] of Object.entries({CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3})){RawTcp[n]=v;RawTcp.prototype[n]=v;}
  globalThis.WebSocket=function(url,protocols){return String(url).startsWith('ws://')?new RawTcp(url,protocols):new Original(url,protocols);};
  Object.assign(globalThis.WebSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3});
})();
