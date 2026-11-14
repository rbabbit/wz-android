'use strict';
// Focused route/layout regression on the already installed delivery APK.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const q=require('./campaign-live-051.cjs');
const apk=path.join(q.root,'app/build/outputs/apk/debug/app-debug.apk');
const candidateAPK_SHA256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
const assert=(ok,why)=>{if(!ok)throw Error(why);};
async function connectReady(){const end=Date.now()+30000;while(Date.now()<end){try{return await q.connect();}catch(error){if(!/not ready/.test(String(error.message||error)))throw error;await q.delay(150);}}throw Error('WebView not ready');}
function installed(){const p=q.adb('shell','pm','path',q.packageId).toString().trim().replace(/^package:/,'');assert(q.adb('shell','sha256sum',p).toString().startsWith(candidateAPK_SHA256),'Installed APK changed');}
async function home(){q.adb('shell','input','keyevent','4');await q.nativeTap('Return');}
async function layout(c){return c.host(`(()=>{const h=document.getElementById('blocknight-combat-hud'),s=document.getElementById('warzone-command-strip'),f=document.getElementById('warzone-game-frame'),p=document.getElementById('warzone-campaign-status');return{width:innerWidth,height:innerHeight,strip:s?.getBoundingClientRect().toJSON(),hud:h?.getBoundingClientRect().toJSON(),scrollWidth:h?.scrollWidth,clientWidth:h?.clientWidth,frame:f?.getBoundingClientRect().toJSON(),status:p&&{rect:p.getBoundingClientRect().toJSON(),visibility:getComputedStyle(p).visibility}}})()`);}
async function towers(){
  installed();if(!process.argv.includes('--resume-existing')){await home();await q.nativeTap('PLAY');}const c=await connectReady();
  try{
    await c.wait('window.__warzoneTowersWaves?.report().snapshot&&window.__warzoneCommands?.report().snapshot?.hasHQ',45000);
    const initial=await c.evaluate('({wave:__warzoneTowersWaves.report().snapshot,campaign:!!window.__warzoneCampaign,config:LaunchedModule.WZVAL_configDirPath,save:WarzoneSavedGames.report(),commands:__warzoneCommands.report().snapshot})');
    assert(!initial.campaign&&initial.config==='/warzone2100','Campaign leaked into Towers');
    for(const id of ['#blocknight-tech','#wt-open-factory','#wt-open-queue','#blocknight-help']){await c.tap(id);await c.tap(id);}
    await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().nativeBuildGroup.length>0&&!__warzoneCommands.report().selectingTrucks',20000);
    const build=await c.evaluate('__warzoneCommands.report()');
    assert(build.snapshot.selectedUnits.every(u=>u.constructor),'Build selected non-constructors');
    await c.tap('#wt-open-build');await c.wait('!__warzoneCommands.report().nativeClosing&&!__kalaWarzoneTouch.report().pendingClicks');
    await c.evaluate('WarzoneTerrain.refresh();true');
    const before=await c.evaluate('WarzoneTerrain.project(32*128,60*128,128)');
    q.adb('shell','input','swipe','1600','420','1840','520','240');
    await c.wait('__kalaWarzoneTouch.report().panPhase==="idle"');
    await c.evaluate('WarzoneTerrain.refresh();true');
    const after=await c.evaluate('({point:WarzoneTerrain.project(32*128,60*128,128),touch:__kalaWarzoneTouch.report()})');
    assert(Math.hypot(after.point.x-before.x,after.point.y-before.y)>10&&after.touch.heldKeys.length===0,'Towers pan did not move/release');
    const errors=await c.evaluate(String.raw`(errorLog||[]).filter(v=>/error\s*\||Uncaught|Assert in Warzone/.test(v))`);assert(!errors.length,'Towers native errors: '+JSON.stringify(errors));
    q.screen('final-towers-gameplay');
    fs.writeFileSync(path.join(q.out,'towers-regression.json'),JSON.stringify({passed:true,candidateAPK_SHA256,initial,buildSelection:build.nativeBuildGroup,before,after,layout:await layout(c),errors},null,2));
    await home();console.log('PASS Towers route, native selection, menus and pan');
  }finally{c.close();}
}
async function small(){
  installed();q.adb('shell','wm','size','720x1280');q.adb('shell','wm','density','320');
  let c;
  try{
    await q.nativeTap('Open the original campaign');
    const setup=q.tree();q.screen('final-small-campaign-setup');
    const png=q.adb('exec-out','screencap','-p'),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    assert(width===1280&&height===720,'Small phone viewport did not apply');
    for(const text of ['NEW CAMPAIGN','CONTINUE','BACK']){
      const n=setup.nodes.find(v=>v.text===text&&v.enabled==='true');assert(n,'Missing small setup '+text);
      const b=[...n.bounds.matchAll(/\d+/g)].map(v=>+v[0]);assert(b[2]<=width&&b[3]<=height&&b[0]>=0&&b[1]>=0,'Small setup clipped '+text);
    }
    await q.nativeTap('CONTINUE');await q.nativeTap('LOAD');c=await connectReady();
    await c.wait('window.WarzoneSavedGames?.ready&&window.WarzoneSavedGames?.loading&&window.__warzoneCampaign?.report().nativeState?.worldSafe',45000);
    const initial=await layout(c);assert(initial.width<=1100,'Compact CSS branch not exercised');
    // The existing Android wrapper preserves Warzone's minimum engine height
    // by scaling its virtual viewport. Test the real <=1100 compact branch,
    // rather than incorrectly assuming physical1280 implies CSS<=800.
    assert(initial.strip.height<=125&&initial.frame.bottom<=initial.height+1,'Campaign frame/header clipped');
    if(initial.status?.visibility!=='hidden')assert(initial.status.rect.right<=initial.width+1&&initial.status.rect.bottom<=initial.strip.bottom+1,'Small status overflow');
    await c.tap('#blocknight-base');await c.wait('!__kalaWarzoneTouch.report().zoomPending',10000);
    await c.tap('#wt-campaign-all-combat');await c.wait('__warzoneCampaign.report().selectedCount===4');
    q.screen('final-small-campaign-gameplay');
    await c.tap('#wt-open-factory');q.screen('final-small-manufacturing');await c.tap('#wt-open-factory');
    for(const id of ['#blocknight-tech','#wt-open-queue','#blocknight-help']){await c.tap(id);await c.tap(id);}
    const final=await c.evaluate('({touch:__kalaWarzoneTouch.report(),campaign:__warzoneCampaign.report(),save:WarzoneSavedGames.report()})');
    assert(final.touch.heldKeys.length===0&&!final.touch.gestureActive,'Small UI left held input');
    fs.writeFileSync(path.join(q.out,'small-layout.json'),JSON.stringify({passed:true,candidateAPK_SHA256,physical:{width,height,density:320},nativeSetup:setup.nodes.filter(v=>v.text),initial,after:await layout(c),final},null,2));
    await home();console.log('PASS small-phone campaign setup, load, scrolling header and menu returns');
  }finally{c?.close();q.adb('shell','wm','size','1080x2400');q.adb('shell','wm','density','300');}
}
(async()=>{if(process.argv[2]==='towers')await towers();else if(process.argv[2]==='small')await small();else throw Error('Use towers or small');})().catch(e=>{console.error(e);process.exitCode=1;});
