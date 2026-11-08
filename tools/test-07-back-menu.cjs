'use strict';
// Actual SystemUI navigation-button touches; keyevent checks are separate cases.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {execFileSync}=require('child_process');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const out=l.out,file=path.join(out,'back-menu.json');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),checks:{},navigationEvents:[],realKeyEvents:[],cancels:[],panels:[],started:new Date().toISOString()};
const write=()=>fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
async function until(fn,message,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const x=await fn();if(x)return x;await l.delay(150)}throw Error(message)}
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const hasDialog=()=>l.tree().nodes.some(n=>n.text==='Return to main menu?');
const bounds=node=>{const b=[...node.bounds.matchAll(/\d+/g)].map(x=>+x[0]);assert.equal(b.length,4);assert.ok(b[2]>b[0]&&b[3]>b[1]);return b;};
const routeLogs=()=>l.adb('shell','logcat','-d','-v','epoch','-s','BlockNightWZ:I','*:S').toString().split(/\r?\n/).filter(x=>x.includes('Back routed before WebView:'));
async function nativeButton(text){const node=await until(()=>l.tree().nodes.find(n=>n.text?.toLowerCase()===text.toLowerCase()&&n.clickable==='true'),'Native button '+text);const b=bounds(node);l.adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
function systemBackNode(){return l.tree().nodes.find(n=>(n['resource-id']==='com.android.systemui:id/back'||n.package==='com.android.systemui'&&n['content-desc']?.toLowerCase()==='back')&&n.enabled==='true'&&n.bounds!=='[0,0][0,0]');}
let backGeometry;
async function systemBack(label){
 const reveals=[],png=l.adb('exec-out','screencap','-p'),w=png.readUInt32BE(16),h=png.readUInt32BE(20),mode=l.adb('shell','settings','get','secure','navigation_mode').toString().trim(),before=routeLogs();
 const profile=[w,h,mode].join('/');if(backGeometry?.profile!==profile)backGeometry=null;
 if(!backGeometry&&process.env.WZ_SYSTEM_BACK_GEOMETRY){
  const geometry=JSON.parse(fs.readFileSync(process.env.WZ_SYSTEM_BACK_GEOMETRY));
  assert.equal(geometry.profile,profile,'observed navigation screenshot matches actual device/navigation mode');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(geometry.measurementScreen)).digest('hex'),geometry.screenshotSHA256,'observed native button screenshot unchanged');
  backGeometry=geometry;r.systemBackGeometry=geometry;
 }
 const cached=Boolean(backGeometry);
 const reveal=swipe=>{l.adb('shell','input','swipe',...swipe.map(String),'180');reveals.push(swipe);};
 // Reveal immersive navigation as a user does. There is deliberately no
 // input-keyevent fallback: this check requires the actual SystemUI triangle.
 if(!backGeometry){
  let node=systemBackNode();
  for(const swipe of [[w-1,Math.round(h/2),Math.max(1,w-90),Math.round(h/2)],[Math.round(w/2),h-1,Math.round(w/2),Math.max(1,h-90)]]){
   if(node)break;reveal(swipe);node=systemBackNode();
  }
  assert.ok(node,'Actual SystemUI Back button not available; three-button navigation fixture required');
  const b=bounds(node),point=[Math.round((b[0]+b[2])/2),Math.round((b[1]+b[3])/2)];
  const swipe=point[0]>w*.85?[w-1,Math.round(h/2),Math.max(1,w-90),Math.round(h/2)]:point[0]<w*.15?[1,Math.round(h/2),Math.min(w-1,90),Math.round(h/2)]:[Math.round(w/2),h-1,Math.round(w/2),Math.max(1,h-90)];
  backGeometry={profile,device:[w,h],navigationMode:mode,resourceId:node['resource-id'],description:node['content-desc'],bounds:node.bounds,point,revealSwipe:swipe,measuredFor:label,measuredAt:new Date().toISOString()};
  // A UIAutomator dump can outlast the transient bar. Reveal once more before
  // capturing its visible native geometry, then tap without another slow dump.
  reveal(swipe);backGeometry.measurementScreen=l.screen('system-back-measured-navigation');r.systemBackGeometry=backGeometry;
 }else{
  // Reuse only geometry actually observed on this unchanged device profile.
  // Every event still reveals and touches the real SystemUI button.
  reveal(backGeometry.revealSwipe);
 }
 // SystemUI animates transient navigation separately from the app window.
 // Observe the actual white Back triangle and Home circle before a real tap;
 // never infer readiness from a completed edge swipe or a fixed delay.
 let navigationScreen,navigationPixels;const deadline=Date.now()+3500;
 do{
  navigationScreen=l.screen('system-back-visible-'+r.navigationEvents.length);
  const script='import json,sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");x,y=map(int,sys.argv[2:4]);b=im.getpixel((x,y));h=im.getpixel((x,im.height//2));print(json.dumps({"back":b,"home":h,"ready":min(b)>220 and min(h)>220}))';
  navigationPixels=JSON.parse(execFileSync(process.env.WZ_QA_PYTHON||'python',['-c',script,navigationScreen,...backGeometry.point.map(String)],{encoding:'utf8',windowsHide:true}));
  if(navigationPixels.ready)break;reveal(backGeometry.revealSwipe);
 }while(Date.now()<deadline);
 assert.equal(navigationPixels.ready,true,'Actual Back triangle and Home circle must be visibly ready before the test tap');
 l.adb('shell','input','tap',...backGeometry.point.map(String));
 const entry={label,source:'actual-SystemUI-button',resourceId:backGeometry.resourceId,description:backGeometry.description,bounds:backGeometry.bounds,device:[w,h],navigationMode:mode,point:backGeometry.point,cachedGeometry:cached,geometryProvenance:{measuredFor:backGeometry.measuredFor,measuredAt:backGeometry.measuredAt,screen:backGeometry.measurementScreen,profile},navigationScreen,navigationPixels,revealSwipes:reveals,routeLogsBefore:before.length};r.navigationEvents.push(entry);write();return entry;
}
async function startup(){let c;await until(async()=>{try{c=await l.connect();return true}catch(e){if(!/not ready|ECONNREFUSED|fetch failed/.test(String(e)))throw e;return false}},'Fresh WebView',15000);await c.wait('window.__towersHtml?.isActive()&&Boolean(window.__warzoneCommands?.report().snapshot)&&!window.__kalaWarzoneTouch.report().cameraFacingPending',90000,{timeoutMs:90000});return c;}
async function confirm(c,label){const e=await systemBack(label);await until(hasDialog,'Actual SystemUI Back opens confirmation');assert.equal(await c.evaluate('__towersHtml.report().menuRequested'),true);e.routeLogs=routeLogs().slice(e.routeLogsBefore);return e;}
(async()=>{let c;try{
 const args=process.argv.slice(2),mapIndex=args.indexOf('--map'),freshMap=mapIndex>=0?args[mapIndex+1]:'td2';assert.ok(['td1','td2'].includes(freshMap),'--map requires td1 or td2');r.freshStart=args.includes('--fresh');
 c=r.freshStart?await j.start(freshMap):await j.connectReady();await j.resume(c);r.map=await c.evaluate('new URLSearchParams(location.search).get("map")||"td2"');r.viewport=await c.host('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');r.navigationMode=l.adb('shell','settings','get','secure','navigation_mode').toString().trim();
 await c.save('before-main-menu-return');
 r.save=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave/gam.json';return{path:p,bytes:Array.from(f.readFile(p))}})()`);r.phoneDesigns=await c.evaluate('BlockNightAndroid.loadDesigns()');
 for(const name of ['factory','help','research','build']){
  if(name==='help'){await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden')}
  else if(name==='research'){await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open')}
  else if(name==='build'){await c.tap('#wt-open-build');await c.wait('!__warzoneCommands.report().selectingTrucks')}
  else{await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"')}
  await systemBack('panel-'+name);await c.wait('!__warzoneCommands.report().page&&!__warzoneCommands.report().buildOpen&&!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose&&parent.document.getElementById("warzone-towers-help-overlay")?.hidden!==false');
  assert.equal(await c.evaluate('__towersHtml.report().menuRequested'),false);r.panels.push({name,clock:await clock(c)});write();
 }
 await c.tap('#wt-open-design');await c.tap('#wt-design-name');const ime=()=>/mInputShown=true/.test(l.adb('shell','dumpsys','input_method').toString());await until(ime,'Real keyboard shown');l.screen('keyboard-before-system-back');
 await systemBack('keyboard-dismiss');await until(()=>!ime(),'SystemUI Back dismisses keyboard');assert.equal(await c.evaluate('__warzoneCommands.report().page'),'design');assert.equal(await c.evaluate('__towersHtml.report().menuRequested'),false);await c.paint();l.screen('keyboard-dismiss-keeps-design');
 await systemBack('design-page-close');await c.wait('!__warzoneCommands.report().page');await c.paint();r.checks.panelAndKeyboardBack=true;r.checks.keyboardPriority=true;l.screen('keyboard-and-page-system-back-restored');
 for(const method of ['Cancel','system-back','Cancel']){
  await confirm(c,'confirmation-open-'+(r.cancels.length+1));const before=await clock(c),s=await c.evaluate('__towersHtml.report()');assert.equal(s.phase,'playing');const png=l.screen('system-back-confirmation-'+(r.cancels.length+1));
  if(method==='Cancel')await nativeButton('Cancel');else await systemBack('dialog-cancel');
  await c.wait('!__towersHtml.report().menuRequested');assert.equal(hasDialog(),false);const after=await j.waitAdvancingClock(c,before);r.cancels.push({method,beforeClock:before,afterClock:after,screen:png});assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneDesigns);write();
 }
 for(const code of [111,4]){
  const before=routeLogs();l.adb('shell','input','keyevent',String(code));await until(hasDialog,'Real Android key '+code+' opens app confirmation');const logs=routeLogs().slice(before.length);
  if(code===111)assert.ok(logs.some(x=>x.includes('Back routed before WebView: 111')),'real Escape is intercepted before Chromium');
  const key={code,source:'real-Android-keyevent',routeLogs:logs,route:logs.some(x=>x.includes('Back routed before WebView: '+code))?'legacy-before-WebView':'modern-Android-dispatcher'};r.realKeyEvents.push(key);l.screen('real-key-'+code+'-confirmation');await nativeButton('Cancel');await c.wait('!__towersHtml.report().menuRequested');await j.waitAdvancingClock(c,await clock(c));write();
 }
 r.checks.legacyBackRouting=true;
 await c.tap('#wt-open-queue');await c.wait('__warzoneCommands.report().page==="queue"');await systemBack('queue-close');await c.wait('!__warzoneCommands.report().page');await c.paint();l.screen('cancel-restores-queue-input');
 const oldSession=await c.evaluate('__towersHtml.report().session');await confirm(c,'confirmed-return-open');await nativeButton('Return');c.close();c=null;
 const startLabel='Start game, '+(r.map==='td1'?'Dustfall':'Iron Valley');await until(()=>l.tree().nodes.some(n=>n['content-desc']===startLabel||n.text===startLabel),'Direct main menu/map selection',15000);r.mainMenuScreen=l.screen('direct-main-menu');assert.ok(!l.tree().nodes.some(n=>/BATTLE ENDED/.test(n.text||'')),'no ended interstitial');
 await l.nativeTap(startLabel);c=await startup();r.newSession=await c.evaluate('__towersHtml.report().session');assert.notEqual(r.newSession,oldSession);r.newBattleClock=await j.waitAdvancingClock(c,await clock(c));
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneDesigns);const persisted=await c.evaluate(`Array.from(LaunchedModule.FS.readFile(${JSON.stringify(r.save.path)}))`);assert.deepEqual(persisted,r.save.bytes,'native QuickSave remains byte-identical after return/new battle');r.save.sha256=crypto.createHash('sha256').update(Buffer.from(r.save.bytes)).digest('hex');delete r.save.bytes;
 r.checks.phoneDesignsPreserved=true;await confirm(c,'fresh-session-confirmation');await nativeButton('Cancel');await c.wait('!__towersHtml.report().menuRequested');r.freshInputClock=await j.waitAdvancingClock(c,await clock(c));await c.paint();l.screen('fresh-battle-cancel-restored');
 assert.ok(r.navigationEvents.length>=12&&r.navigationEvents.every(x=>x.source==='actual-SystemUI-button'));r.checks.realSystemNavigationBack=true;r.checks.backConfirmationCancelReturn=true;r.afterIdentity=j.installedIdentity(process.env.WZ_QA_APK);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('back-menu-failure')}catch(_){}throw e;
 }finally{if(c){try{r.pausedAt=await j.pause(c)}catch(e){r.cleanupFailure=String(e);r.passed=false;}c.close()}r.finished=new Date().toISOString();write()}
})().catch(e=>{console.error(e);process.exitCode=1});
