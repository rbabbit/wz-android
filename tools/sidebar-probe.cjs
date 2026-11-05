/* Small real-emulator probe. Native state is inspected through ordinary saves. */
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const adbExe=path.join(process.env.ANDROID_HOME||'C:/Users/punke/AppData/Local/Android/Sdk','platform-tools/adb.exe');
const device=process.env.WZ_QA_DEVICE||'emulator-5556';
const adb=(...args)=>execFileSync(adbExe,['-s',device,...args],{timeout:20000,maxBuffer:16*1024*1024});
const out=process.env.WZ_QA_OUT?path.resolve(process.env.WZ_QA_OUT):path.resolve(__dirname,'../qa/v5.7');fs.mkdirSync(out,{recursive:true});
async function connect(){
 const pid=adb('shell','pidof','com.rbabbit.warzonetowers').toString().trim();
 adb('forward','tcp:9226',`localabstract:webview_devtools_remote_${pid}`);
 const tabs=await(await fetch('http://127.0.0.1:9226/json')).json();
 const tab=tabs.find(t=>t.url.includes('/mobile.html'));
 if(!tab)throw Error('Towers WebView not ready');
 const socket=new WebSocket(tab.webSocketDebuggerUrl);let id=0;const pending=new Map();
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const m=JSON.parse(String(event.data));if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error||m.result.exceptionDetails?p.reject(m.error||m.result.exceptionDetails):p.resolve(m.result.result.value);}};
 function evaluate(expression){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject,timer:setTimeout(()=>reject(Error('CDP timeout')),45000)});socket.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression:`(()=>{const f=document.getElementById('warzone-game-frame');return f?f.contentWindow.eval(${JSON.stringify(expression)}):eval(${JSON.stringify(expression)});})()`,returnByValue:true,awaitPromise:true}}));});}
 return {evaluate,close:()=>socket.close()};
}
(async()=>{
 const [mode,...args]=process.argv.slice(2);
 if(mode==='screen'){fs.writeFileSync(path.join(out,args[0]+'.png'),adb('exec-out','screencap','-p'));return;}
 const c=await connect();
 try {
  if(['tap','map','world','site','save'].includes(mode)&&!await c.evaluate('parent.document.visibilityState==="visible"'))throw Error('Towers is not foreground; refusing input into another app');
  if(['tap','map','world','site','save'].includes(mode)&&await c.evaluate('__warzoneTowersWaves.report().snapshot?.phase==="defeated"'))throw Error('Native match ended; refusing input into its replay overlay');
  if(mode==='eval'||mode==='eval-file'){const value=await c.evaluate(mode==='eval-file'?fs.readFileSync(args[0],'utf8'):args.join(' '));console.log(typeof value==='string'?value:JSON.stringify(value));}
  else if(mode==='wait'){
   const expression=args.join(' ');let value;
   const deadline=Date.now()+Math.min(120000,Math.max(5000,Number(process.env.WZ_QA_WAIT_MS)||40000));while(Date.now()<deadline){value=await c.evaluate(expression);if(value){console.log(JSON.stringify(value));return;}await new Promise(r=>setTimeout(r,250));}
   throw Error('Observable condition did not become true: '+expression);
  }
  else if(mode==='map'){
   const [x,y]=args.map(Number),p=await c.evaluate(`(()=>{const r=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:r.x+innerWidth-216+(64-${x})*3,y:r.y+innerHeight-216+(64-${y})*3,w:parent.innerWidth,h:parent.innerHeight};})()`);
   const png=adb('exec-out','screencap','-p');adb('shell','input','tap',String(Math.round(p.x*png.readUInt32BE(16)/p.w)),String(Math.round(p.y*png.readUInt32BE(20)/p.h)));console.log('Android minimap tap',x,y);
  }
  else if(mode==='world'||mode==='site'){
   const [x,y]=args.map(Number);
   const wx=(x+(mode==='site'?0:.5))*128+(mode==='site'?1:0),wy=(y+(mode==='site'?0:.5))*128+(mode==='site'?1:0);
   const frame=await c.evaluate('(()=>{WarzoneTerrain.active(true);return __kalaWarzoneTouch.report().nativeRenderFrames;})()');
   const deadline=Date.now()+5000;
   while(await c.evaluate('__kalaWarzoneTouch.report().nativeRenderFrames')<frame+2){if(Date.now()>deadline)throw Error('No fresh native terrain frames');await new Promise(r=>setTimeout(r,30));}
   const point=await c.evaluate(`(()=>{WarzoneTerrain.active(true);let z=0;for(let i=0;i<24;i++){const p=WarzoneTerrain.project(${wx},${wy},z),pick=p&&WarzoneTerrain.pick(p.x,p.y);if(!pick)throw Error('Tile not visible');if(Math.hypot(pick.worldX-${wx},pick.worldY-${wy})<2){const r=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y,w:parent.innerWidth,h:parent.innerHeight,pick};}z=(z+pick.height)/2;}throw Error('Projection did not converge');})()`);
   const visible=await c.evaluate(`parent.document.elementFromPoint(${point.x},${point.y})?.id==='warzone-game-frame'`);
   if(!visible)throw Error('Projected tile is covered by the command HUD; move the camera before tapping');
   const png=adb('exec-out','screencap','-p');
   adb('shell','input','tap',String(Math.round(point.x*png.readUInt32BE(16)/point.w)),String(Math.round(point.y*png.readUInt32BE(20)/point.h)));
   console.log('Android world tap',x,y,point);
  }
  else if(mode==='save'){
   const deadline=Date.now()+10000;while(await c.evaluate('__warzoneCommands.report().siteChecks||__kalaWarzoneTouch.report().pendingClicks')){if(Date.now()>deadline)throw Error('Native input did not drain before QuickSave');await new Promise(r=>setTimeout(r,50));}
   const directory="LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave'";
   const stamp=`(()=>{try{return LaunchedModule.FS.stat(${directory}+'/droid.json').mtime.getTime()}catch(_){return 0}})()`;
   const before=await c.evaluate(stamp);
   await c.evaluate('__kalaWarzoneTouch.nativePressKey("F7","F7",118);true');
   let fresh=false;
   for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,150));if(await c.evaluate(stamp)>before){fresh=true;break;}}
   if(!fresh)throw Error('Native Towers QuickSave did not update');
   const result=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=${directory},result={campaign:__warzoneTowersWaves.report(),commands:__warzoneCommands.report(),research:__blockNightResearch.report()};for(const n of f.readdir(p)){if(n.endsWith('.json'))result[n]=JSON.parse(f.readFile(p+'/'+n,{encoding:'utf8'}));}return result;})()`);
   fs.writeFileSync(path.join(out,args[0]+'.json'),JSON.stringify(result,null,2));
   console.log('Fresh native Towers save:',args[0]);
  }
  else if(mode==='tap'){
   const p=await c.evaluate(`(()=>{const selector=${JSON.stringify(args[0])},d=parent.document,e=d.querySelector(selector)||document.querySelector(selector);if(!e)throw Error('Missing '+selector);e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),o=e.ownerDocument===document?parent.document.getElementById('warzone-game-frame').getBoundingClientRect():{left:0,top:0};if(!r.width||!r.height||e.disabled)throw Error('Not tappable '+selector);return{x:o.left+r.left+r.width/2,y:o.top+r.top+r.height/2,w:parent.innerWidth,h:parent.innerHeight};})()`);
   const png=adb('exec-out','screencap','-p');
   adb('shell','input','tap',String(Math.round(p.x*png.readUInt32BE(16)/p.w)),String(Math.round(p.y*png.readUInt32BE(20)/p.h)));
   console.log('Android tap',args[0],p.x,p.y);
  } else throw Error('Use eval, tap or screen');
 } finally {c.close();}
})().catch(e=>{console.error(e);process.exit(1);});
