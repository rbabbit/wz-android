// Focused headless component check. Actual APK verification belongs to root.
import { spawn } from 'node:child_process';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
const here=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const server=spawn('python',[path.join(here,'host-server.py')],{windowsHide:true,stdio:'pipe'});
const browser=spawn(edge,['--headless=new','--disable-gpu-sandbox','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--remote-debugging-port=47950','--remote-allow-origins=*','--no-first-run','--disable-background-networking','--user-data-dir='+path.join(here,'host-browser-profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;let sequence=0;const pending=new Map(),errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(method,params={}){const id=++sequence;return await new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
let result;
try{
  let targets;
  for(let n=0;n<100;n++){try{targets=await(await fetch('http://127.0.0.1:47950/json/list')).json();break;}catch{}await sleep(100);}
  if(!targets)throw new Error('Headless browser did not start');
  socket=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
  await rpc('Runtime.enable');await rpc('Page.enable');
  await rpc('Emulation.setDeviceMetricsOverride',{width:980,height:440,deviceScaleFactor:1,mobile:false});
  const replay='https://warzone2100.retropaganda.info/replays/1794989715726.wzrp';
  await rpc('Page.navigate',{url:'http://127.0.0.1:47949/hub/replay/index.html?replay='+encodeURIComponent(replay)});
  let report;
  for(let n=0;n<180;n++){
    report=await evaluate('window.WarzoneReplay?.report?.() || window.HubReplay?.report?.() || null');
    if(report?.ready&&report?.presented3d&&!report?.loading)break;
    if(errors.length||report?.errors?.length)throw new Error(JSON.stringify({errors,report}));
    await sleep(500);
  }
  if(!report?.ready||!report?.presented3d)throw new Error('Real 3D replay not ready: '+JSON.stringify(report));
  const ready=report;
  await evaluate(`document.getElementById('replayBattlefieldPlay').click()`);
  const paused=await evaluate('WarzoneReplay.report()');if(paused.playing)throw new Error('pause failed');
  await evaluate(`(()=>{const r=document.getElementById('replayBattlefieldRange');r.value='120100';r.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  // Native snapshots are recorded at120002ms; the normal slider has100ms steps.
  const seek=await evaluate('WarzoneReplay.report()');if(seek.time!==120100||seek.visibleFrame.time!==120002||seek.visibleFrame.droids!==61||seek.visibleFrame.structures!==145)throw new Error('Real-frame seek mismatch:'+JSON.stringify(seek));
  const visible=await evaluate(`({text:document.body.innerText,controls:[...document.querySelectorAll('button,select,input')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>({id:e.id,r:e.getBoundingClientRect().toJSON()}))})`);
  if(/team momentum|score|K\/D|research timeline|Raw extracted/i.test(visible.text))throw new Error('Analytics visible');
  const screenshots=[];
  for(const [width,height]of[[980,440],[760,360],[560,280]]){
    await rpc('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(250);
    const png=await rpc('Page.captureScreenshot',{format:'png'});const name=`host-${width}x${height}.png`;await writeFile(path.join(here,name),Buffer.from(png.data,'base64'));screenshots.push(name);
  }
  await evaluate(`dispatchEvent(new Event('warzone-hub-pause'))`);const lifecyclePaused=await evaluate('WarzoneReplay.report()');if(!lifecyclePaused.lifecyclePaused||lifecyclePaused.playing)throw new Error('lifecycle pause failed');
  await evaluate(`dispatchEvent(new Event('warzone-hub-resume'));WarzoneReplay.dispose()`);const disposed=await evaluate('WarzoneReplay.report()');if(!disposed.disposed||disposed.playing||disposed.pendingRequests)throw new Error('dispose failed');
  result={passed:true,scope:'headless component only; genuine public8068 replay and telemetry, not emulator',ready,paused,seek,visible,screenshots,lifecyclePaused,disposed,errors};
}catch(error){result={passed:false,error:String(error),errors};if(socket?.readyState===1){try{result.report=await evaluate('window.WarzoneReplay?.report?.() || window.HubReplay?.report?.()');const png=await rpc('Page.captureScreenshot',{format:'png'});await writeFile(path.join(here,'host-failure.png'),Buffer.from(png.data,'base64'));}catch{}}}
finally{if(socket?.readyState===1){try{await rpc('Browser.close');}catch{}socket.close();}browser.kill();server.kill();}
await writeFile(path.join(here,'HOST-SMOKE.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.passed?{passed:true,frames:result.ready.frames,models:result.ready.models,seek:result.seek.visibleFrame,screenshots:result.screenshots}:result,null,2));if(!result.passed)process.exitCode=1;
