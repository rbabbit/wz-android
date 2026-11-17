'use strict';
// Headless ADB/CDP helper. No desktop mouse, focus, or visible host control.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const pkg='com.rbabbit.warzonetowers.lab',device='emulator-5558';
const out=path.resolve(__dirname,'../qa/delivery-086');fs.mkdirSync(out,{recursive:true});
const adb=(...args)=>cp.execFileSync('C:/Users/punke/AppData/Local/Android/Sdk/platform-tools/adb.exe',['-s',device,...args],{timeout:30000,maxBuffer:32*1024*1024});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function screen(name){fs.writeFileSync(path.join(out,name+'.png'),adb('exec-out','screencap','-p'));}
function nativeRows(){
 adb('shell','uiautomator','dump','/sdcard/delivery086.xml');
 return [...adb('shell','cat','/sdcard/delivery086.xml').toString().matchAll(/<node\s[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
}
function nativeTap(label){const rows=nativeRows(),e=rows.find(r=>r.enabled==='true'&&r['content-desc']?.toLowerCase()===label.toLowerCase())||rows.find(r=>r.enabled==='true'&&r.text.toLowerCase()===label.toLowerCase());if(!e)throw Error('No visible native control: '+label);const b=[...e.bounds.matchAll(/\d+/g)].map(x=>+x[0]);adb('shell','input','tap',''+Math.round((b[0]+b[2])/2),''+Math.round((b[1]+b[3])/2));return e;}
async function connect(fragment='/multiplayer/index.html'){
 const pid=adb('shell','pidof',pkg).toString().trim();if(!pid)throw Error('App absent');
 adb('forward','tcp:9286','localabstract:webview_devtools_remote_'+pid);
 const tabs=await(await fetch('http://127.0.0.1:9286/json')).json();const tab=tabs.find(t=>t.url.includes(fragment));if(!tab)throw Error('Page absent: '+fragment+'; '+tabs.map(t=>t.url).join(','));
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map();
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 async function call(method,params={}){const serial=++id;const m=await new Promise((r,j)=>{pending.set(serial,r);ws.send(JSON.stringify({id:serial,method,params}));setTimeout(()=>{if(pending.delete(serial))j(Error('CDP timeout '+method));},20000).unref();});if(m.error)throw Error(JSON.stringify(m.error));return m.result;}
 async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
 const child=e=>evaluate(`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(e)})`);
 async function wait(expression,label,timeout=30000){const end=Date.now()+timeout;let value;do{value=await evaluate(expression);if(value)return value;await delay(200);}while(Date.now()<end);throw Error('Timeout '+label+' last='+JSON.stringify(value));}
 async function tap(selector){const p=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>!n.hidden&&!n.disabled&&n.getBoundingClientRect().width&&n.getBoundingClientRect().height);if(!e)throw Error('Unavailable control');e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();if(!b.width||!b.height)throw Error('Invisible control');return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1,radiusX:2,radiusY:2,force:.7}]});await delay(70);await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 async function snapshot(name){const v=await evaluate(`(()=>{const w=document.getElementById('warzone-game-frame')?.contentWindow;return{url:location.href,viewport:[innerWidth,innerHeight],hidden:document.hidden,session:globalThis.PcMultiplayerSession?.report?.(),native:w?.PcMultiplayerNative?.state,room:w?.PcMultiplayerNative?.room,commands:w?.__warzoneCommands?.report?.()}})()`);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(v,null,2));screen(name);return v;}
 return{call,evaluate,child,wait,tap,snapshot,close:()=>ws.close()};
}
if(require.main===module)(async()=>{const[action,...args]=process.argv.slice(2);if(action==='screen')return screen(args[0]);if(action==='rows')return console.log(JSON.stringify(nativeRows().map(r=>({text:r.text,description:r['content-desc'],bounds:r.bounds})),null,2));if(action==='native-tap')return nativeTap(args.join(' '));const c=await connect();try{if(action==='eval')console.log(JSON.stringify(await c.evaluate(args.join(' '))));else if(action==='snapshot')console.log(JSON.stringify(await c.snapshot(args[0])));else if(action==='tap')await c.tap(args[0]);else throw Error('Unknown action');}finally{c.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={adb,delay,screen,nativeRows,nativeTap,connect,out};
