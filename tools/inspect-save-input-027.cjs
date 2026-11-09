process.env.WZ_NATIVE_QA='C:/timerApp/wz-towers-lab/qa/0.27-saves';
const l=require('./native-live.cjs');
(async()=>{const c=await l.connect();try{
for(const obj of ['window','document','document.getElementById("canvas")']){
 const r=await c.call('Runtime.evaluate',{expression:'document.getElementById("warzone-game-frame").contentWindow.eval('+JSON.stringify(obj)+')'});
 console.log('remote',JSON.stringify(r.result));
 const listeners=await c.call('DOMDebugger.getEventListeners',{objectId:r.result.objectId});
 console.log(obj,JSON.stringify(listeners.listeners.filter(x=>/key/.test(x.type)).map(x=>({type:x.type,capture:x.useCapture,line:x.lineNumber,url:x.scriptId,handler:x.handler.description.slice(0,150)}))));
}
await c.evaluate('document.getElementById("canvas").focus();true');
await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'F7',code:'F7',windowsVirtualKeyCode:118,nativeVirtualKeyCode:118});
await l.delay(100);
await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'F7',code:'F7',windowsVirtualKeyCode:118,nativeVirtualKeyCode:118});
await l.delay(700);
console.log(await c.evaluate('({report:WarzoneSavedGames.report(),files:LaunchedModule.FS.readdir("/warzone2100/savegames/skirmish")})'));
}finally{c.close()}})().catch(console.error);
