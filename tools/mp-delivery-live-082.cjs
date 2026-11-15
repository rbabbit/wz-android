'use strict';
const q=require('./mp-live-082.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../qa/multiplayer-spectator-082');
const stage=process.argv[2]||'observer';
async function shot(c,name,extra={}){
 const v=await c.evaluate(`(()=>{const w=document.getElementById('warzone-game-frame')?.contentWindow;return{viewport:[innerWidth,innerHeight],session:PcMultiplayerSession.report(),native:w?.PcMultiplayerNative?.state,controls:w?.PcMultiplayerControls?.report?.(),adapter:w?.PcMultiplayerNativeUI?.report?.(),commands:w?.__warzoneCommands?.report?.(),music:w?.WarzoneMapMusic?.report?.(),visible:[...document.querySelectorAll('#warzone-command-strip button,#lab-ops,#unit-controls,#mp-power-hud')].filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).display!=='none'&&!e.hidden).map(e=>e.id),cover:document.getElementById('loading-cover').hidden}})()`);
 Object.assign(v,extra);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(v,null,2));fs.writeFileSync(path.join(out,name+'.png'),q.adb('exec-out','screencap','-p'));return v;
}
async function touch(c,type,points){return c.call('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1,radiusX:2,radiusY:2,force:.7}))});}
async function pan(c,hold=310){
 if(hold<260){
  // A normal player holds to box-select. Generate this quick swipe inside
  // Android, avoiding desktop/CDP round trips turning it into a long hold.
  q.adb('shell','uiautomator','dump','/sdcard/pan082.xml');const xml=q.adb('shell','cat','/sdcard/pan082.xml').toString();
  const row=[...xml.matchAll(/<node\s[^>]+>/g)].map(m=>m[0]).find(s=>s.includes('class="android.webkit.WebView"'));
  const b=[...row.match(/bounds="([^"]+)"/)[1].matchAll(/\d+/g)].map(m=>+m[0]),v=await c.evaluate('[innerWidth,innerHeight]');
  const point=(x,y)=>[Math.round(b[0]+x*(b[2]-b[0])/v[0]),Math.round(b[1]+y*(b[3]-b[1])/v[1])];
  q.adb('shell','input','swipe',...point(620,330).map(String),...point(480,302).map(String),'240');return;
 }
 await touch(c,'touchStart',[{x:620,y:330}]);await q.delay(hold);for(let i=1;i<=7;i++){await touch(c,'touchMove',[{x:620+i*20,y:330+i*4}]);await q.delay(40);}await touch(c,'touchEnd',[]);
}
async function pair(c,kind){const cx=640,cy=325;let start=[{x:cx-70,y:cy},{x:cx+70,y:cy}];await touch(c,'touchStart',start);for(let i=1;i<=8;i++){const a=kind==='rotate'?i*Math.PI/48:0,r=kind==='zoom'?70+i*8:70,dy=kind==='tilt'?i*9:0;await touch(c,'touchMove',[{x:cx-r*Math.cos(a),y:cy-r*Math.sin(a)+dy},{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)+dy}]);await q.delay(40);}await touch(c,'touchEnd',[]);}
(async()=>{const c=await q.connect();try{
 if(stage==='observer'){
  await c.wait('PcMultiplayerSession.report().nativeUi?.gameTime>2&&PcMultiplayerSession.report().nativeUi?.view.frame>4','advancing spectator world',45000);
  const before=await shot(c,'delivery-observer-before');assert(before.native.spectator);assert.equal(before.native.canIssueOrders,false);assert(before.cover);
  assert.deepEqual(before.visible.sort(),['blocknight-music','leave']);
  const denied=await c.evaluate(`(async()=>{const w=document.getElementById('warzone-game-frame').contentWindow;return{research:PcMultiplayerSession.command('research'),trucks:w.PcMultiplayerControls.command('trucks'),combat:w.PcMultiplayerControls.setCombatLock(true),native:await w.PcMultiplayerNative.command('select-visible-trucks',{})}})()`);
  assert.equal(denied.research,false);assert.equal(denied.trucks,false);assert.equal(denied.combat,false);assert.equal(denied.native.ok,false);
  const nativeBlocked=await c.child(`(()=>{const m=LaunchedModule,nonce='qa082-observer-denied';m.FS.writeFile('/tmp/mp-mobile-input.json',JSON.stringify({action:'select-visible-trucks',nonce}));return nonce})()`);
  await c.wait(`(()=>{try{return JSON.parse(document.getElementById('warzone-game-frame').contentWindow.LaunchedModule.FS.readFile('/tmp/mp-mobile-input-result.json',{encoding:'utf8'})).nonce===${JSON.stringify(nativeBlocked)}}catch{return false}})()`,'native read-only acknowledgement');
  const response=await c.child(`JSON.parse(LaunchedModule.FS.readFile('/tmp/mp-mobile-input-result.json',{encoding:'utf8'}))`);assert.equal(response.ok,false);assert.deepEqual(response.selectedIds,[]);
  await pan(c);await c.wait(`PcMultiplayerSession.report().nativeUi?.view.camera.x!==${before.native.view.camera.x}||PcMultiplayerSession.report().nativeUi?.view.camera.y!==${before.native.view.camera.y}`,'spectator actual middle-drag pan');
  const panned=await shot(c,'delivery-observer-pan',{denied,response});
  await pair(c,'rotate');await c.wait(`PcMultiplayerSession.report().nativeUi?.view.camera.yaw!==${panned.native.view.camera.yaw}`,'spectator rotation');const rotated=await shot(c,'delivery-observer-rotate');
  await pair(c,'zoom');await c.wait(`PcMultiplayerSession.report().nativeUi?.view.camera.distance!==${rotated.native.view.camera.distance}`,'spectator zoom');const zoomed=await shot(c,'delivery-observer-zoom');
  await pair(c,'tilt');await c.wait(`PcMultiplayerSession.report().nativeUi?.view.camera.pitch!==${zoomed.native.view.camera.pitch}`,'spectator tilt');const tilted=await shot(c,'delivery-observer-tilt');
  assert(tilted.native.gameTime>before.native.gameTime);assert(tilted.native.view.frame>before.native.view.frame);assert(!tilted.session.errors.some(x=>/Invalid player index/.test(x)));
  await c.touch(1147,497);await q.delay(500);await shot(c,'delivery-observer-minimap');
  await c.tap('#blocknight-music');await shot(c,'delivery-observer-music');await c.tap('#blocknight-music');await shot(c,'delivery-observer-after-music');
  const renderer=await c.child(`(()=>{const m=LaunchedModule;const text=m.FS.readFile(wz_js_get_config_dir_path()+'/config',{encoding:'utf8'});const gl=Module.canvas.getContext('webgl2')||Module.canvas.getContext('webgl');return{config:text.split('\\n').filter(s=>/terrain|texture|shader|shadow|antialias|opengl/i.test(s)),renderer:gl?{version:gl.getParameter(gl.VERSION),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),units:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),error:gl.getError()}:null}})()`);
  fs.writeFileSync(path.join(out,'delivery-observer-renderer.json'),JSON.stringify(renderer,null,2));
  await c.tap('#leave');q.adb('shell','input','keyevent','4');await q.delay(300);await shot(c,'delivery-observer-return-cancel');
  await c.tap('#leave');await q.nativeTap('Return');await q.delay(700);
 }else if(stage==='owner'){
  await c.wait('PcMultiplayerSession.report().nativeUi?.canIssueOrders===true&&PcMultiplayerSession.report().nativeUi.gameTime>2','real owner match',45000);
  const before=await shot(c,'delivery-player-before');assert.equal(before.native.spectator,false);assert.equal(before.native.realPlayer,before.native.player);assert(before.visible.includes('blocknight-tech'));assert(before.visible.includes('lab-ops'));
  for(const [id,name]of [['#blocknight-tech','research'],['#wt-open-factory','manufacturing'],['#wt-open-queue','queue']]){await c.tap(id);await q.delay(250);await shot(c,'delivery-player-'+name);await c.tap(id);}
  const result=await c.child(`PcMultiplayerNative.command('select-visible-trucks',{})`);assert(result.ok);await shot(c,'delivery-player-trucks',{result});
  const p=await c.evaluate('PcMultiplayerSession.report().nativeUi.view.camera');await pan(c,20);await c.wait(`PcMultiplayerSession.report().nativeUi?.view.camera.x!==${p.x}||PcMultiplayerSession.report().nativeUi?.view.camera.y!==${p.y}`,'ordinary player pan');await shot(c,'delivery-player-pan');
  await c.tap('#leave');await q.nativeTap('Return');await q.delay(700);
 }else if(stage==='owner-finish'){
  const p=await c.evaluate('PcMultiplayerSession.report().nativeUi.view.camera');await pan(c,20);await c.wait(`PcMultiplayerSession.report().nativeUi?.view.camera.x!==${p.x}||PcMultiplayerSession.report().nativeUi?.view.camera.y!==${p.y}`,'ordinary player pan');await shot(c,'delivery-player-pan');
  await c.tap('#leave');await q.nativeTap('Return');await q.delay(700);
 }else throw Error('Unknown delivery stage');
}catch(e){try{await shot(c,'failure-'+stage,{error:String(e)});}catch{}throw e;}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
