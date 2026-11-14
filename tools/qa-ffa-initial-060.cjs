'use strict';
process.env.WZ_QA_DEVICE='emulator-5558';
process.env.WZ_NATIVE_QA=require('node:path').resolve(__dirname,'../qa/ffa-060');
const q=require('./campaign-live-051.cjs'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  q.adb('shell','am','force-stop',q.packageId);
  if(!fs.existsSync(path.join(q.out,'original-wallet.xml')))
    fs.writeFileSync(path.join(q.out,'original-wallet.xml'),q.adb('exec-out','run-as',q.packageId,'cat','shared_prefs/warzone-towers-rewards.xml'));
  console.log(q.adb('install','-r',path.join(q.root,'app/build/outputs/apk/debug/app-debug.apk')).toString());
  q.adb('shell','wm','size','1080x2400');q.adb('shell','wm','density','480');
  q.adb('shell','am','start','-n',q.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');
  await q.nativeTap('Free for all');q.screen('initial-ffa-setup');
  await q.nativeTap('START FFA');
  let c;for(let i=0;i<40&&!c;i++){try{c=await q.connect();}catch(_){await q.delay(300);}}
  if(!c)throw Error('FFA WebView did not appear');
  try{
    await c.wait('Boolean(window.__warzoneFfa?.report?.().snapshot)',70000);
      const snapshot=await c.evaluate('({ffa:__warzoneFfa.report(),html:__towersHtml.report(),commands:__warzoneCommands.report(),touch:__kalaWarzoneTouch.report(),saves:WarzoneSavedGames.report()})');
    fs.writeFileSync(path.join(q.out,'initial-state.json'),JSON.stringify(snapshot,null,2));
    q.screen('initial-ffa-native');console.log(JSON.stringify({ready:true,phase:snapshot.html.phase,ffa:snapshot.ffa.snapshot?.mode,players:snapshot.ffa.snapshot?.players.map(p=>({player:p.player,human:p.isHuman,ai:p.isAI,difficulty:p.difficulty,units:p.units.length,structures:p.structures.length})),errors:c.errors}));
  }catch(error){q.screen('initial-failure');fs.writeFileSync(path.join(q.out,'initial-failure.json'),JSON.stringify(await c.evaluate('({html:window.__towersHtml?.report(),ffa:window.__warzoneFfa?.report?.(),errors:window.errorLog,engine:window.Module?.calledRun,logs:(()=>{try{const m=window.LaunchedModule||window.Module,p=m.WZVAL_configDirPath+"/logs";return m.FS.readdir(p).filter(x=>x.endsWith(".log")).map(n=>m.FS.readFile(p+"/"+n,{encoding:"utf8"}).slice(-25000));}catch(e){return String(e)}})()})'),null,2));throw error;}
  finally{c.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
