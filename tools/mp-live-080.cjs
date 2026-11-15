'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const pkg='com.rbabbit.warzonetowers.lab',device='emulator-5558',out=path.resolve(__dirname,'../qa/multiplayer-room-080');
const executable='C:/Users/punke/AppData/Local/Android/Sdk/platform-tools/adb.exe';
fs.mkdirSync(out,{recursive:true});
const adb=(...args)=>execFileSync(executable,['-s',device,...args],{timeout:30000,maxBuffer:48*1024*1024});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function foreground(){const text=adb('shell','dumpsys','activity','activities').toString().split('\n').filter(s=>/mResumedActivity|topResumedActivity/.test(s)).join('\n');if(!text.includes(pkg+'/'))throw Error('Expected app is not foreground');}
function screen(name){const file=path.join(out,name+'.png');fs.writeFileSync(file,adb('exec-out','screencap','-p'));return file;}
async function nativeTap(label){
 for(let attempt=0;attempt<8;attempt++){
  try{foreground();}catch(error){if(attempt===7)throw error;await delay(300);continue;}const dump=adb('shell','uiautomator','dump','/sdcard/mp080-ui.xml').toString();
  if(!dump.includes('dumped')){await delay(300);continue;}
  const xml=adb('shell','cat','/sdcard/mp080-ui.xml').toString();
  const rows=[...xml.matchAll(/<node\s[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
  const row=rows.find(n=>n.enabled==='true'&&[n.text,n['content-desc']].some(v=>v?.toLowerCase()===label.toLowerCase()));
  if(row){const b=[...row.bounds.matchAll(/\d+/g)].map(m=>+m[0]);adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));return row;}
  await delay(300);
 }
 throw Error('Native control not visible: '+label);
}
async function connect(fragment='/multiplayer/index.html'){
 const pid=adb('shell','pidof',pkg).toString().trim();if(!pid)throw Error('App is not running');
 adb('forward','tcp:9279','localabstract:webview_devtools_remote_'+pid);
 let tab;const tabDeadline=Date.now()+10000;do{const tabs=await(await fetch('http://127.0.0.1:9279/json')).json();tab=tabs.find(t=>t.url.includes(fragment));if(tab)break;await delay(100);}while(Date.now()<tabDeadline);if(!tab)throw Error('Requested page is not ready: '+fragment);
 const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let serial=0;const pending=new Map();
 socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 async function call(method,params={}){const id=++serial;const response=await new Promise((resolve,reject)=>{pending.set(id,resolve);socket.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error('CDP timeout: '+method));},20000).unref();});if(response.error)throw Error(JSON.stringify(response.error));return response.result;}
 async function evaluate(expression){const response=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result?.value;}
 const child=expression=>evaluate(`(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow;if(!w)throw Error('Engine frame is absent');return w.eval(${JSON.stringify(expression)});})()`);
 async function wait(expression,label,timeout=15000){const start=Date.now();let last;do{last=await evaluate(expression);if(last)return last;await delay(150);}while(Date.now()-start<timeout);throw Error('Timed out: '+label+'; last='+JSON.stringify(last));}
 async function touch(x,y){foreground();await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,radiusX:2,radiusY:2,force:.6,id:1}]});await delay(65);await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 async function tap(selector,inChild=false){
  await evaluate(`(async()=>{const f=document.querySelector('#warzone-game-frame'),d=${inChild?'f?.contentDocument':'document'},e=d?.querySelector(${JSON.stringify(selector)});if(!e||e.hidden||e.disabled)throw Error('Control not available: '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(requestAnimationFrame);})()`);
  const p=await evaluate(`(()=>{const f=document.querySelector('#warzone-game-frame'),d=${inChild?'f?.contentDocument':'document'},e=d?.querySelector(${JSON.stringify(selector)});if(!e||e.hidden||e.disabled)throw Error('Control not available: '+${JSON.stringify(selector)});const b=e.getBoundingClientRect(),o=${inChild?'f.getBoundingClientRect()':'{left:0,top:0}'};if(b.width<=0||b.height<=0)throw Error('Control has no visible bounds');const x=o.left+b.left+b.width/2,y=o.top+b.top+b.height/2;if(x<0||y<0||x>=innerWidth||y>=innerHeight)throw Error('Control outside visible viewport');return{x,y};})()`);return touch(p.x,p.y);
 }
 async function save(name){const value=await evaluate(`({url:location.href,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,session:PcMultiplayerSession.report(),native:document.querySelector('#warzone-game-frame')?.contentWindow?.PcMultiplayerNativeUI?.report?.(),commands:document.querySelector('#warzone-game-frame')?.contentWindow?.__warzoneCommands?.report?.(),research:document.querySelector('#warzone-game-frame')?.contentWindow?.__blockNightResearch?.report?.()})`);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2));screen(name);return value;}
 await wait(fragment.includes('/multiplayer/')?'typeof PcMultiplayerSession!=="undefined"':'!!document.body','Page script readiness');
 return{call,evaluate,child,wait,tap,touch,save,close:()=>socket.close()};
}
if(require.main===module)(async()=>{const[action,...args]=process.argv.slice(2);if(action==='native-tap')return console.log(JSON.stringify(await nativeTap(args.join(' '))));if(action==='screen')return console.log(screen(args[0]));const c=await connect();try{if(action==='eval')console.log(JSON.stringify(await c.evaluate(args.join(' '))));else if(action==='save')console.log(JSON.stringify(await c.save(args[0])));else if(action==='tap')await c.tap(args[0],args[1]==='child');else throw Error('Unknown command');}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={adb,screen,nativeTap,connect,foreground,delay,out};
