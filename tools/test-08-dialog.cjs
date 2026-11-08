'use strict';
// Scoped native-dialog QA. Root runs this on the exact installed delivery APK.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {execFileSync}=require('child_process');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
assert.ok(process.env.WZ_QA_APK,'WZ_QA_APK must name the exact candidate');
const file=path.join(l.out,'dialog.json'),python=process.env.WZ_QA_PYTHON||'python';
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),checks:{},navigationEvents:[],dialogs:[],cancels:[],started:new Date().toISOString()};
const write=()=>fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
const py=(script,...args)=>JSON.parse(execFileSync(python,['-c',script,...args],{encoding:'utf8',windowsHide:true,timeout:10000}));
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
async function until(fn,message,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await l.delay(120)}throw Error(message)}
function bounds(node){assert.ok(node,'measured native node');const b=[...node.bounds.matchAll(/\d+/g)].map(v=>+v[0]);assert.equal(b.length,4);assert.ok(b[2]>b[0]&&b[3]>b[1]);return b;}
const navFile=process.env.WZ_SYSTEM_BACK_GEOMETRY||path.join(l.root,'qa/test-07/back/observed-system-back.json');
const nav=JSON.parse(fs.readFileSync(navFile,'utf8'));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(nav.measurementScreen)).digest('hex'),nav.screenshotSHA256,'observed actual SystemUI geometry provenance');
const navPixels='import json,sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");x,y=map(int,sys.argv[2:4]);b=im.getpixel((x,y));h=im.getpixel((x,im.height//2));print(json.dumps({"back":b,"home":h,"ready":min(b)>220 and min(h)>220}))';
async function systemBack(label){
 const p=l.adb('exec-out','screencap','-p'),device=[p.readUInt32BE(16),p.readUInt32BE(20)],mode=l.adb('shell','settings','get','secure','navigation_mode').toString().trim();
 assert.equal(nav.profile,[...device,mode].join('/'),'actual viewport/navigation mode matches measured SystemUI');
 let screen,pixels;const end=Date.now()+3500,reveals=[];
 do{l.adb('shell','input','swipe',...nav.revealSwipe.map(String),'180');reveals.push(nav.revealSwipe);screen=l.screen('dialog-system-back-visible-'+r.navigationEvents.length);pixels=py(navPixels,screen,...nav.point.map(String));if(pixels.ready)break;}while(Date.now()<end);
 assert.equal(pixels.ready,true,'actual native white Back triangle and Home circle visibly ready');
 l.adb('shell','input','tap',...nav.point.map(String));
 r.navigationEvents.push({label,source:'actual-SystemUI-button',device,navigationMode:mode,point:nav.point,bounds:nav.bounds,geometryProvenance:navFile,measurementScreen:nav.measurementScreen,screen,pixels,revealSwipes:reveals});write();
}
const pixelScript=`import json,sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); boxes=json.loads(sys.argv[2]); out={}
for name,b in boxes.items():
 x1,y1,x2,y2=map(int,b); crop=im.crop((x1+3,y1+3,x2-3,y2-3)); pixels=list(crop.getdata()); n=max(1,len(pixels))
 out[name]={'bounds':b,'samples':n,'blackFraction':sum(max(p)<=8 for p in pixels)/n,'whitePixels':sum(min(p)>=220 and max(p)-min(p)<=12 for p in pixels),'tealPixels':sum(p[1]>p[0]+20 and p[2]>p[0]+15 and p[1]>100 and p[2]>90 for p in pixels)}
out['ready']=all(out[n]['whitePixels']>=10 for n in ['title','cancel','return']) and out['card']['blackFraction']>.70
print(json.dumps(out))`;
let geometry;
function measureDialog(){
 const tree=l.tree(),title=tree.nodes.find(n=>n.text==='Return to main menu?'),cancel=tree.nodes.find(n=>n.text?.toLowerCase()==='cancel'&&n.clickable==='true'),ret=tree.nodes.find(n=>n.text?.toLowerCase()==='return'&&n.clickable==='true');
 if(!title||!cancel||!ret)return null;
 const titleBox=bounds(title),cancelBox=bounds(cancel),returnBox=bounds(ret),union=[Math.min(titleBox[0],cancelBox[0],returnBox[0]),Math.min(titleBox[1],cancelBox[1],returnBox[1]),Math.max(titleBox[2],cancelBox[2],returnBox[2]),Math.max(titleBox[3],cancelBox[3],returnBox[3])];
 const containers=tree.nodes.filter(n=>n.bounds&&n.bounds!=='[0,0][0,0]').map(n=>({node:n,b:bounds(n)})).filter(v=>v.b[0]<=union[0]&&v.b[1]<=union[1]&&v.b[2]>=union[2]&&v.b[3]>=union[3]).sort((a,b)=>(a.b[2]-a.b[0])*(a.b[3]-a.b[1])-(b.b[2]-b.b[0])*(b.b[3]-b.b[1]));
 const card=containers.find(v=>v.node['resource-id']==='android:id/parentPanel')||containers[0];assert.ok(card,'native dialog containing view');
 const densityText=l.adb('shell','wm','density').toString(),density=Number((densityText.match(/Override density:\s*(\d+)/)||densityText.match(/Physical density:\s*(\d+)/)||[])[1]);assert.ok(density>=100,'observed Android display density');const scale=density/160;
 for(const [name,b]of [['Cancel',cancelBox],['Return',returnBox]]){assert.ok(b[3]-b[1]>=48*scale-1,name+' native touch height >=48dp');assert.ok(b[2]-b[0]>=88*scale-1,name+' native touch width >=88dp');}
 const png=l.adb('exec-out','screencap','-p'),w=png.readUInt32BE(16),h=png.readUInt32BE(20);assert.ok(card.b[0]>=0&&card.b[1]>=0&&card.b[2]<=w&&card.b[3]<=h,'compact dialog fits physical viewport');assert.ok((card.b[2]-card.b[0])/scale<=362,'compact dialog width capped at360dp');
 fs.writeFileSync(path.join(l.out,'dialog-native-ui.xml'),tree.xml);
 return{boxes:{card:card.b,title:titleBox,cancel:cancelBox,return:returnBox},density,densityText,scale,device:[w,h],nativeNodes:{title,cancel,return:ret,card:card.node}};
}
async function dialog(c,label){
 await systemBack(label);await c.wait('__towersHtml.report().menuRequested');
 if(!geometry){geometry=await until(measureDialog,'actual native title/Cancel/Return nodes');r.geometry=geometry;write();}
 let screen,pixels;await until(()=>{screen=l.screen('dialog-'+label);pixels=py(pixelScript,screen,JSON.stringify(geometry.boxes));return pixels.ready},'black native dialog and white title/actions visibly rendered',7000);
 for(const name of ['card','cancel','return'])assert.ok(pixels[name].blackFraction>.70,name+' interior is black');
 for(const name of ['title','cancel','return']){assert.ok(pixels[name].whitePixels>=10,name+' visible white text');assert.equal(pixels[name].tealPixels,0,name+' has no inherited teal tint');}
 const state=await c.evaluate('__towersHtml.report()');assert.equal(state.phase,'playing');assert.equal(state.menuRequested,true);const entry={label,screen,pixels,state};r.dialogs.push(entry);write();return entry;
}
function nativeButton(name){const b=geometry.boxes[name.toLowerCase()];assert.ok(b,'measured dialog button');l.adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
async function startup(){let c;await until(async()=>{try{c=await l.connect();return true}catch(e){if(!/not ready|ECONNREFUSED|fetch failed/.test(String(e)))throw e;return false}},'fresh game WebView',15000);await c.wait('window.__towersHtml?.isActive()&&Boolean(window.__warzoneCommands?.report().snapshot)&&!window.__kalaWarzoneTouch.report().cameraFacingPending',90000,{timeoutMs:90000});return c;}
(async()=>{let c;try{
 const source=fs.readFileSync(path.join(l.root,'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'),'utf8'),method=source.slice(source.indexOf('  private void showMainMenuDialog('),source.indexOf('  private void returnToMainMenu()'));
 assert.ok(method.includes('Color.BLACK')&&method.includes('Color.WHITE'));assert.ok(!/nativePressKey|KEYCODE_ESCAPE/.test(method),'native confirmation does not send engine Escape');r.checks.noEnginePauseSource=true;
 c=await j.connectReady();await j.resume(c);r.map=await c.evaluate('new URLSearchParams(location.search).get("map")||"td2"');r.phoneDesigns=await c.evaluate('BlockNightAndroid.loadDesigns()');r.originalSession=await c.evaluate('__towersHtml.report().session');
 await c.save('dialog-before-return-native-save');r.save=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave/gam.json';return{path:p,bytes:Array.from(f.readFile(p))}})()`);
 for(const method of ['Cancel','real-SystemUI-Back','Cancel']){const before=await clock(c);await dialog(c,'cancel-'+(r.cancels.length+1));if(method==='Cancel')nativeButton('Cancel');else await systemBack('dialog-real-back-cancel');await c.wait('!__towersHtml.report().menuRequested');const after=await j.waitAdvancingClock(c,before);assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneDesigns);r.cancels.push({method,beforeClock:before,afterClock:after});write();}
 await dialog(c,'confirmed-return');nativeButton('Return');c.close();c=null;
 const label='Start game, '+(r.map==='td1'?'Dustfall':'Iron Valley');let menuTree;await until(()=>{menuTree=l.tree();return menuTree.nodes.some(n=>n['content-desc']===label||n.text===label)},'direct native main menu',15000);assert.ok(!menuTree.nodes.some(n=>/BATTLE ENDED/.test(n.text||'')));r.mainMenuScreen=l.screen('dialog-direct-main-menu');
 await l.nativeTap(label);c=await startup();r.newSession=await c.evaluate('__towersHtml.report().session');assert.notEqual(r.newSession,r.originalSession);r.freshBattleClock=await j.waitAdvancingClock(c,await clock(c));assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneDesigns);
 const bytes=await c.evaluate(`Array.from(LaunchedModule.FS.readFile(${JSON.stringify(r.save.path)}))`);assert.deepEqual(bytes,r.save.bytes,'native QuickSave gam.json byte-identical after actual Return and fresh battle');r.save.sha256=crypto.createHash('sha256').update(Buffer.from(r.save.bytes)).digest('hex');delete r.save.bytes;
 await dialog(c,'fresh-battle-cancel');nativeButton('Cancel');await c.wait('!__towersHtml.report().menuRequested');r.freshInputClock=await j.waitAdvancingClock(c,await clock(c));await c.paint();r.restoredScreen=l.screen('dialog-fresh-battle-restored');
 assert.equal(r.dialogs.length,5);assert.equal(r.navigationEvents.length,6);assert.ok(r.navigationEvents.every(e=>e.pixels.ready));r.checks.blackWhiteNativeStyle=true;r.checks.minimumNativeTargets=true;r.checks.realSystemBackCancel=true;r.checks.cancelReturnFreshBattle=true;r.checks.phoneDesignsAndSavePreserved=true;
 r.afterIdentity=j.installedIdentity(process.env.WZ_QA_APK);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);assert.deepEqual(c.errors,[]);r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('dialog-failure')}catch(_){}throw e;
 }finally{if(c){try{r.fixtureCleanupPause=await j.pause(c)}catch(e){r.cleanupFailure=String(e);r.passed=false;}c.close()}r.finished=new Date().toISOString();write()}
})().catch(e=>{console.error(e);process.exitCode=1});
