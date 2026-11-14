'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=process.env.WZ_NATIVE_QA||path.join(root,'qa/lab');
const device=process.env.WZ_QA_DEVICE||'emulator-5556',packageId=process.env.WZ_QA_PACKAGE||'com.rbabbit.warzonetowers.lab';
const cdpPort=Number(process.env.WZ_QA_CDP_PORT||9256);
if(packageId!=='com.rbabbit.warzonetowers.lab')throw Error('Lab QA refuses to target the stable app: '+packageId);
if(!Number.isInteger(cdpPort)||cdpPort<1024||cdpPort>65535)throw Error('Invalid Lab CDP port');
fs.mkdirSync(out,{recursive:true});
const rawAdb=(...args)=>execFileSync(require('./android-sdk.cjs').adb,['-s',device,...args],{timeout:20000,maxBuffer:32*1024*1024});
function assertLabForeground(){const activity=rawAdb('shell','dumpsys','activity','activities').toString().split('\n').filter(s=>/mResumedActivity|topResumedActivity/.test(s));if(!activity.some(s=>s.includes(packageId+'/')))throw Error('Refusing device input: Towers Lab is not the resumed Activity');}
function adb(...args){if(args[0]==='shell'){
 if(args[1]==='input')assertLabForeground();
 if(args[1]==='am'&&args[2]==='force-stop'&&args[3]!==packageId)throw Error('Refusing to stop another app');
 if(args[1]==='am'&&args[2]==='start'){const n=args.indexOf('-n');if(n<0||!String(args[n+1]).startsWith(packageId+'/'))throw Error('Refusing to launch another app');}
 if(args[1]==='pm'&&args[2]==='clear'&&args[3]!==packageId)throw Error('Refusing to clear another app');
 }return rawAdb(...args);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function screen(name){const file=path.join(out,name+'.png');fs.writeFileSync(file,adb('exec-out','screencap','-p'));return file;}
function decode(s){return s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
function tree(){const dumped=adb('shell','uiautomator','dump','/sdcard/towers-native-ui.xml').toString();if(!dumped.includes('dumped to'))return {xml:'',nodes:[]};const xml=adb('shell','cat','/sdcard/towers-native-ui.xml').toString();return {xml,nodes:[...xml.matchAll(/<node\s[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],decode(v[2])])))};}
async function nativeTap(label,timeout=30000){
 const end=Date.now()+timeout;
 while(Date.now()<end){
  try{assertLabForeground();}catch{await delay(150);continue;}
  const node=tree().nodes.find(n=>(n.text===label||n['content-desc']===label||n['resource-id']===label)&&n.enabled==='true'&&n.bounds!=='[0,0][0,0]');
  if(node){const p=[...node.bounds.matchAll(/\d+/g)].map(m=>Number(m[0]));adb('shell','input','tap',String(Math.round((p[0]+p[2])/2)),String(Math.round((p[1]+p[3])/2)));return node;}
  await delay(150);
 }
 throw Error('Lab native control not ready: '+label);
}
async function connect(){const pid=adb('shell','pidof',packageId).toString().trim();if(!/^\d+$/.test(pid))throw Error('Towers Lab process is not ready');adb('forward','tcp:'+cdpPort,'localabstract:webview_devtools_remote_'+pid);const tabs=await(await fetch('http://127.0.0.1:'+cdpPort+'/json')).json(),tab=tabs.find(t=>/\/mobile(?:-duel|-campaign|-ffa)?\.html(?:[?#]|$)/.test(t.url));if(!tab)throw Error('Towers game WebView not ready');const ws=new WebSocket(tab.webSocketDebuggerUrl),pending=new Map(),errors=[];let serial=0;await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(String(e.data));if(m.method==='Runtime.exceptionThrown')errors.push(m.params);const entry=pending.get(m.id);if(entry){pending.delete(m.id);clearTimeout(entry.timer);m.error||m.result?.exceptionDetails?entry.reject(m.error||m.result.exceptionDetails):entry.resolve(m.result);}};
const call=(method,params={},options={})=>new Promise((resolve,reject)=>{const timeoutMs=Number(options.timeoutMs??20000);if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>300000){reject(Error('Invalid CDP timeout'));return;}const id=++serial;pending.set(id,{resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method+' after '+timeoutMs+'ms'));},timeoutMs)});ws.send(JSON.stringify({id,method,params}));});
const host=async(expression,options={})=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},options);return r.result.value;};
const evaluate=(expression,options={})=>host(`document.getElementById('warzone-game-frame')?.contentWindow?.eval(${JSON.stringify(expression)})`,options);
const wait=async(expression,timeout=30000,options={})=>{const end=Date.now()+timeout;while(Date.now()<end){const v=await evaluate(expression,options);if(v)return v;await delay(150);}throw Error('State did not arrive: '+expression);};
const paint=()=>host('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
const tap=async selector=>{
 let p;const end=Date.now()+5000;
 while(Date.now()<end){
  await evaluate(`(parent.document.querySelector(${JSON.stringify(selector)})||document.querySelector(${JSON.stringify(selector)}))?.scrollIntoView({block:'nearest'});true`);await paint();
  p=await evaluate(`(()=>{const e=parent.document.querySelector(${JSON.stringify(selector)})||document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;const b=e.getBoundingClientRect(),f=e.ownerDocument===document?parent.document.getElementById('warzone-game-frame').getBoundingClientRect():{x:0,y:0};if(!b.width||!b.height||e.closest('[inert]')||!e.contains(e.ownerDocument.elementFromPoint(b.x+b.width/2,b.y+b.height/2)))return null;return{x:b.x+f.x+b.width/2,y:b.y+f.y+b.height/2,w:parent.innerWidth,h:parent.innerHeight};})()`);
  if(p)break;await delay(80);
 }
 if(!p)throw Error('Control stayed hidden, inert or covered: '+selector);
 if(process.env.WZ_QA_UI_INPUT==='trusted-cdp'){assertLabForeground();const startAt=Date.now()/1000;await Promise.all([call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}],timestamp:startAt}),delay(60).then(()=>call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[],timestamp:startAt+.06}))]);}
 else{const png=adb('exec-out','screencap','-p');adb('shell','input','tap',String(Math.round(p.x*png.readUInt32BE(16)/p.w)),String(Math.round(p.y*png.readUInt32BE(20)/p.h)));}
 await paint();
};
const save=async name=>{const stamp=`(()=>{try{return LaunchedModule.FS.stat(LaunchedModule.WZVAL_configDirPath+'/savegames/campaign/QuickSave/droid.json').mtime.getTime()}catch(_){return 0}})()`;const before=await evaluate(stamp);await wait('!__kalaWarzoneTouch.report().pendingClicks');await evaluate('__kalaWarzoneTouch.nativePressKey("F7","F7",118);true');await wait(stamp+'>'+before,15000);const data=await evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/campaign/QuickSave',r={commands:__warzoneCommands.report(),research:__blockNightResearch.report(),campaign:__warzoneCampaign.report()};for(const n of f.readdir(p))if(n.endsWith('.json'))r[n]=JSON.parse(f.readFile(p+'/'+n,{encoding:'utf8'}));return r;})()`);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));return data;};
await call('Runtime.enable');return {evaluate,host,wait,tap,paint,screen,save,call,errors,close:()=>ws.close()};}
module.exports={connect,adb,delay,screen,tree,nativeTap,root,out,packageId,device,cdpPort,assertLabForeground};
if(require.main===module)(async()=>{const [action,...args]=process.argv.slice(2);if(action==='native-tap')return nativeTap(args.join(' '));if(action==='tree'){const t=tree();fs.writeFileSync(path.join(out,'latest-ui.xml'),t.xml);console.log(JSON.stringify(t.nodes.map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds,class:n.class})).filter(n=>n.text||n.label)));return;}if(action==='screen'){console.log(screen(args[0]));return;}const c=await connect();try{if(action==='eval')console.log(JSON.stringify(await c.evaluate(args.join(' '))));else if(action==='wait')console.log(JSON.stringify(await c.wait(args.join(' '))));else if(action==='tap')await c.tap(args[0]);else if(action==='save')await c.save(args[0]);else throw Error('Unknown action');}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
