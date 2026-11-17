'use strict';
// One real finger pan after Android Home return in an already-ready private match.
const q=require('./device-086.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const c=await q.connect();try{
 const state=()=>c.child('PcMultiplayerNative.state');
 await c.wait('PcMultiplayerSession.phase==="game"&&document.getElementById("warzone-game-frame").contentWindow.PcMultiplayerNative.state.worldReady','native world');
 const before=await state();q.adb('shell','input','keyevent','3');await q.delay(6500);
 const background=await state();assert(background.gameTime>before.gameTime);
 q.adb('shell','input','keyevent','187');await q.delay(500);q.nativeTap('Warzone Towers');
 await c.wait('!PcMultiplayerSession.background&&PcMultiplayerSession.phase==="game"','real same-match resume');await q.delay(700);
 const viewport=await c.evaluate('[innerWidth,innerHeight]');
 // Live rendering can prevent uiautomator's idle condition. Use the actual
 // framebuffer and the observed full-height landscape WebView, right-aligned
 // after Android's left cutout inset, rather than stale hierarchy XML.
 const png=q.adb('exec-out','screencap','-p'),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 const scale=height/viewport[1],left=width-viewport[0]*scale;
 assert(width>height&&left>=-2&&left<width*.1,'Observed full-height landscape viewport/cutout');
 const b=[Math.max(0,left),0,width,height];
 const point=(x,y)=>[Math.round(b[0]+x*(b[2]-b[0])/viewport[0]),Math.round(b[1]+y*(b[3]-b[1])/viewport[1])];
 const cameraBefore=(await state()).view.camera;
 q.adb('shell','input','swipe',...point(550,300).map(String),...point(710,330).map(String),'180');
 await c.wait(`(()=>{const a=document.getElementById('warzone-game-frame').contentWindow.PcMultiplayerNative.state.view.camera;return a.x!==${cameraBefore.x}||a.y!==${cameraBefore.y}})()`,'actual native camera movement',5000);
 const after=await state();await c.snapshot('delivery-post-update-mp-pan');
 const record={passed:true,actualAndroid:true,actualNativeEngineExecuted:true,actualFingerInput:true,
  candidateAPK_SHA256:'475a4cc87aca6be4348082f7e48b3e22e9eddcf6347475438b4ff06e329ae05b',
  before,background,cameraBefore,after,viewport,webViewBounds:b,
  viewportMethod:'Actual framebuffer and full-height landscape CSS viewport; left cutout independently inspected in screenshot',
  controls:await c.child('PcMultiplayerControls.report()')};
 fs.writeFileSync(path.join(q.out,'delivery-post-update-mp-input.json'),JSON.stringify(record,null,2));
 console.log(JSON.stringify({passed:true,cameraBefore,cameraAfter:after.view.camera,backgroundClockAdvance:background.gameTime-before.gameTime}));
}finally{c.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
