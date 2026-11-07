'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const out=l.out,file=path.join(out,'back-menu.json'),r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),checks:{},cancels:[],panels:[],started:new Date().toISOString()};
const write=()=>fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
async function until(fn,message,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const x=await fn();if(x)return x;await l.delay(150)}throw Error(message)}
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
const hasDialog=()=>l.tree().nodes.some(n=>n.text==='Return to main menu?');
async function nativeButton(text){const node=await until(()=>l.tree().nodes.find(n=>n.text?.toLowerCase()===text.toLowerCase()&&n.clickable==='true'),'Native button '+text);const b=[...node.bounds.matchAll(/\d+/g)].map(x=>+x[0]);l.adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
async function startup(){let c;await until(async()=>{try{c=await l.connect();return true}catch(e){if(!/not ready|ECONNREFUSED|fetch failed/.test(String(e)))throw e;return false}},'Fresh WebView',15000);await c.wait('window.__towersHtml?.isActive()&&Boolean(window.__warzoneCommands?.report().snapshot)&&!window.__kalaWarzoneTouch.report().cameraFacingPending',90000,{timeoutMs:90000});return c;}
(async()=>{let c;try{
 c=await j.connectReady();await j.resume(c);const saved=await c.save('before-main-menu-return');
 r.save=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave/gam.json';return{path:p,bytes:Array.from(f.readFile(p))}})()`);r.phoneDesigns=await c.evaluate('BlockNightAndroid.loadDesigns()');
 for(const name of ['factory','help','research','build']){
  if(name==='help'){await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden')}
  else if(name==='research'){await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open')}
  else if(name==='build'){await c.tap('#wt-open-build');await c.wait('!__warzoneCommands.report().selectingTrucks')}
  else{await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"')}
  l.adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page&&!__warzoneCommands.report().buildOpen&&!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose&&parent.document.getElementById("warzone-towers-help-overlay")?.hidden!==false');
  assert.equal(await c.evaluate('__towersHtml.report().menuRequested'),false);r.panels.push({name,clock:await clock(c)});write();
 }
 await c.tap('#wt-open-design');await c.tap('#wt-design-name');const ime=()=>/mInputShown=true/.test(l.adb('shell','dumpsys','input_method').toString());await until(ime,'Real keyboard shown');l.screen('keyboard-before-back');l.adb('shell','input','keyevent','4');await until(()=>!ime(),'Keyboard dismissed');assert.equal(await c.evaluate('__warzoneCommands.report().page'),'design');assert.equal(await c.evaluate('__towersHtml.report().menuRequested'),false);
 l.adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page');r.checks.panelAndKeyboardBack=true;l.screen('keyboard-and-page-back-restored');
 for(const method of ['Cancel','android-back','Cancel']){
  l.adb('shell','input','keyevent','4');await until(hasDialog,'Return confirmation shown');const before=await clock(c);const s=await c.evaluate('__towersHtml.report()');assert.equal(s.menuRequested,true);assert.equal(s.phase,'playing');
  const png=l.screen('main-menu-confirmation-'+(r.cancels.length+1));
  if(method==='Cancel')await nativeButton('Cancel');else l.adb('shell','input','keyevent','4');
  await c.wait('!__towersHtml.report().menuRequested');assert.equal(hasDialog(),false);const after=await j.waitAdvancingClock(c,before);r.cancels.push({method,beforeClock:before,afterClock:after,screen:png});assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneDesigns);write();
 }
 await c.tap('#wt-open-queue');await c.wait('__warzoneCommands.report().page==="queue"');l.adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page');l.screen('cancel-restores-queue-input');
 const oldSession=await c.evaluate('__towersHtml.report().session');l.adb('shell','input','keyevent','4');await until(hasDialog,'Return confirmation shown before Return');await nativeButton('Return');c.close();c=null;
 const startLabel='Start game, Dustfall';await until(()=>l.tree().nodes.some(n=>n['content-desc']===startLabel||n.text===startLabel),'Direct main menu/map selection',15000);r.mainMenuScreen=l.screen('direct-main-menu');
 assert.ok(!l.tree().nodes.some(n=>/BATTLE ENDED/.test(n.text||'')),'no neutral ended interstitial');
 await l.nativeTap(startLabel);c=await startup();r.newSession=await c.evaluate('__towersHtml.report().session');assert.notEqual(r.newSession,oldSession);r.newBattleClock=await j.waitAdvancingClock(c,await clock(c));
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneDesigns);const persisted=await c.evaluate(`Array.from(LaunchedModule.FS.readFile(${JSON.stringify(r.save.path)}))`);assert.deepEqual(persisted,r.save.bytes,'genuine native QuickSave remains byte-identical after main menu return and new battle');r.save.sha256=crypto.createHash('sha256').update(Buffer.from(r.save.bytes)).digest('hex');delete r.save.bytes;
 r.checks.phoneDesignsPreserved=true;l.adb('shell','input','keyevent','4');await until(hasDialog,'Fresh session has own confirmation');await nativeButton('Cancel');await c.wait('!__towersHtml.report().menuRequested');r.freshInputClock=await j.waitAdvancingClock(c,await clock(c));l.screen('fresh-battle-cancel-restored');
 r.checks.backConfirmationCancelReturn=true;r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('back-menu-failure')}catch(_){}throw e;
 }finally{if(c){try{r.pausedAt=await j.pause(c)}catch(e){r.cleanupFailure=String(e);r.passed=false;}c.close()}r.finished=new Date().toISOString();write()}
})().catch(e=>{console.error(e);process.exitCode=1});
