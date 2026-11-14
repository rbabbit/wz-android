'use strict';
/* Source protocol checks reuse the prepared native-save fixture; no device or engine runs here. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixturePath='tools/check-saved-games-027.cjs';
const original=fs.readFileSync(path.join(root,fixturePath),'utf8').split('\nasync function check(')[0];
function loadFixture(ffa){
  let head=original;
  function replace(from,to){assert.equal(head.split(from).length,2,'Prepared fixture seam changed: '+from);head=head.replace(from,to);}
  if(ffa){
    head=head.replaceAll('Towers-Easy01','FFA-EMAG-T1').replaceAll('/config','/warzone2100-ffa-easy');
    replace("{wtreward_match:{session:logical},warzoneTowersWaves_state:{wave:4}}",
      "{ffaSession:logical,ffaConfig:{mode:'ffa',map:'emag',difficulty:'easy',player:0},ffaOutcome:''}");
    replace("metadata:{id:slot,session:logical,mapId:'easy01',gameTime:2000,nativeLevel:'FFA-EMAG-T1'}",
      "metadata:{id:slot,mode:'ffa',session:logical,mapId:'emag',mapName:'EMAG FFA',difficulty:'easy',gameTime:2000,nativeLevel:'FFA-EMAG-T1'}");
    replace("readFile(name,config){const value=memory.get(name);",`readFile(name,config){
      if(name==='/tmp/warzone-campaign-state-v51.json'){
        const frame={mode:'campaign',nativeLevel:'FFA-EMAG-T1',gameTime:clock,playing:false,worldSafe:false,
          paused:Boolean(options.nativePaused),video:false,nativeMenuOpen:Boolean(options.nativeMenu),transportOpen:false,intelligenceOpen:false};
        return config?.encoding?JSON.stringify(frame):new TextEncoder().encode(JSON.stringify(frame));
      }
      const value=memory.get(name);`);
    replace('    report:()=>({pending:0}),send(action,data)',"    close(){calls.push(['close-commands']);return Promise.resolve(true);},report:()=>({pending:0}),send(action,data)");
    replace("showNotice:message=>notices.push(message),storeSavedGame:","showNotice:message=>notices.push(message),ffaSave:");
    replace("savedGameRestored:(session,id,proof)=>", "ffaRestored:(session,id,proof)=>");
    replace("calls.push(['archive',session,JSON.parse(meta),JSON.parse(values)]);return JSON.stringify({ok:true,id:slot});",
      "calls.push(['ffa-archive',session,JSON.parse(meta),JSON.parse(values)]);return JSON.stringify(options.archiveRejected?{ok:false,error:'Phone archive rejected'}:{ok:true,id:slot});");
    replace("  const context={window,document,location:{search:'?map=easy01&battle_session='+doc},",`  options.alterPayload?.(payload);
  window.__warzoneFfaMode=true;
  window.__warzoneFfaConfig=Object.freeze({mode:'ffa',map:'emag',difficulty:'easy'});
  window.__warzoneFfa={nativeUiActive:()=>Boolean(options.nativeUi),refreshIntent:()=>calls.push(['refresh-intent']),
    report:()=>({snapshot:{mode:'ffa',session:options.liveSession||logical,nativeLevel:'FFA-EMAG-T1',difficulty:options.liveDifficulty||'easy',
      phase:options.terminal?'victory':'active',playing:!options.terminal,gameTime:clock}})};
  window.dispatchEvent=event=>{calls.push(['save-state',clone(event.detail)]);if(options.endAtPhase===event.detail.phase){done=true;listeners.get('warzone-battle-ended')?.();}return true;};
  const context={window,document,location:{search:'?mode=ffa&map=emag&battle_session='+doc},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},`);
    replace("--skirmish=towers-easy01.json", "--skirmish=ffa-emag-easy.json");
  }
  const exported={exports:{}};
  vm.runInNewContext(head+'\nmodule.exports={fixture};',{
    require,__dirname:path.join(root,'tools'),module:exported,console,process,Buffer,
    setImmediate,URLSearchParams,TextEncoder,TextDecoder
  },{filename:fixturePath+(ffa?' (FFA protocol extension)':' (unchanged Towers fixture)')});
  return exported.exports.fixture;
}
const fixture=loadFixture(true),towerFixture=loadFixture(false),checks=[];
const snapshot=f=>f.window.__warzoneFfa.report().snapshot;
async function check(name,fn){await fn();checks.push(name);console.log('PASS: '+name);}
async function using(options,fn){const f=fixture(options);try{await fn(f);}finally{f.dispose();}}
async function main(){
  await check('FFA fresh launch keeps its native scenario, exposes only FFA restore and never enters reward recovery',async()=>{
    await using({},async f=>{
      assert.equal(f.api.loading,false);assert.equal(f.api.ready,true);assert.equal(f.api.report().mode,'ffa');
      assert(f.module.arguments.includes('--skirmish=ffa-emag-easy.json'));assert.equal(typeof f.api.resumeFfa,'function');
      assert.equal(f.api.resumeRewards,undefined);assert.equal(f.api.resumeCampaign,undefined);
      assert(!f.calls.some(c=>['caps','resume-rewards','pending','inventory-proof'].includes(c[0])));
    });
  });
  await check('FFA restore hydrates every native byte under skirmish only, then requires matching native session, difficulty, level and phone proof',async()=>{
    const options={loading:true,liveSession:'unrelated-session'};
    await using(options,async f=>{
      assert.equal(f.api.ready,false);assert(f.module.arguments.includes('--loadskirmish='+f.payload.metadata.id));
      assert(!f.module.arguments.some(x=>/^--(?:loadcampaign|skirmish|game)=/.test(x)));
      f.hydrate();for(const[name,bytes]of Object.entries(f.saved))assert.deepEqual(f.memory.get('/warzone2100-ffa-easy/savegames/skirmish/'+f.payload.metadata.id+'/'+name).bytes,bytes);
      assert(![...f.memory.keys()].some(name=>name.includes('/savegames/campaign/')));
      assert.equal(await f.api.resumeFfa(snapshot(f)),false);options.liveSession=f.payload.metadata.session;options.liveDifficulty='hard';
      assert.equal(await f.api.resumeFfa(snapshot(f)),false);options.liveDifficulty='easy';
      assert.equal(await f.api.resumeFfa(snapshot(f)),true);assert.equal(f.api.ready,true);
      const proof=f.calls.find(c=>c[0]==='restored');assert.equal(proof[3].mode,'ffa');assert.equal(proof[3].session,f.payload.metadata.session);
      assert.equal(proof[3].difficulty,'easy');assert.equal(proof[3].nativeLevel,'FFA-EMAG-T1');
    });
  });
  await check('FFA archive rejects Campaign/Towers mode, other maps, difficulty, mismatched native globals and terminal rules before native hydration',async()=>{
    const mutations=[p=>p.metadata.mode='campaign',p=>p.metadata.mode='towers',p=>p.metadata.mapId='easy01',p=>p.metadata.difficulty='hard',
      p=>p.metadata.gameTime++,p=>p.metadata.nativeLevel='CAM_1A',
      p=>{p.files['scriptstate.json']=Buffer.from(JSON.stringify({globals_0:{ffaSession:'other-run',ffaConfig:{mode:'ffa',map:'emag',difficulty:'easy',player:0},ffaOutcome:''}})).toString('base64');},
      p=>{const script=JSON.parse(Buffer.from(p.files['scriptstate.json'],'base64'));script.globals_0.ffaOutcome='victory';p.files['scriptstate.json']=Buffer.from(JSON.stringify(script)).toString('base64');}];
    for(const alterPayload of mutations){let failed=false;try{const f=fixture({loading:true,alterPayload});f.dispose();}catch(error){failed=true;assert.match(error.message,/FFA save/i);}assert(failed,'Invalid archive must stop native startup');}
  });
  await check('FFA rejected restored-world acknowledgement remains restoring',async()=>{
    await using({loading:true,restoreRejected:true},async f=>{f.hydrate();await assert.rejects(f.api.resumeFfa(snapshot(f)),/verified/);assert.equal(f.api.ready,false);});
  });
  await check('FFA Save uses real F7/persistence/resumed clock/sync before archiving exact native files and immutable identity',async()=>{
    await using({},async f=>{
      const pending=f.api.save();assert.equal(await f.api.save(),false);assert.equal(await f.finish(pending),true,JSON.stringify(f.notices));
      assert.equal(f.calls.filter(c=>c[0]==='key'&&c[1]==='F7').length,1);
      const archives=f.calls.filter(c=>c[0]==='ffa-archive');assert.equal(archives.length,1);
      const metadata=JSON.parse(JSON.stringify(archives[0][2])),files=archives[0][3];assert.deepEqual(metadata,{mode:'ffa',session:f.payload.metadata.session,mapId:'emag',mapName:'EMAG FFA',difficulty:'easy',nativeLevel:'FFA-EMAG-T1',gameTime:metadata.gameTime});
      assert(metadata.gameTime>=5000);assert.equal(JSON.parse(Buffer.from(files['gam.json'],'base64')).gameTime,metadata.gameTime);
      assert.deepEqual(Buffer.from(files['game.map'],'base64'),f.saved['game.map']);
      assert.equal(JSON.parse(Buffer.from(files['scriptstate.json'],'base64')).globals_0.ffaSession,metadata.session);
      const key=f.calls.findIndex(c=>c[0]==='key'),resumed=f.calls.findIndex(c=>c[0]==='native-resumed'),sync=f.calls.findIndex(c=>c[0]==='explicit-sync'),archive=f.calls.findIndex(c=>c[0]==='ffa-archive');
      assert(key<resumed&&resumed<sync&&sync<archive);assert.equal(f.api.report().phase,'saved');
      assert(!f.calls.some(c=>['caps','resume-rewards','pending','inventory-proof','archive'].includes(c[0])));
    });
  });
  await check('FFA rejected phone writes, native sync failures, paused/menu worlds and retired operations cannot publish Saved',async()=>{
    for(const options of[{archiveRejected:true},{syncError:true},{nativePaused:true,frozenClock:true},{nativeMenu:true},{terminal:true},{endAtPhase:'start'},{endAtPhase:'write'}]){
      await using(options,async f=>{assert.equal(await f.finish(f.api.save()),false);assert.notEqual(f.api.report().phase,'saved');assert(!f.calls.some(c=>c[0]==='save-state'&&c[1].phase==='saved'));});
    }
  });
  await check('Existing Campaign restore keeps its original payload, campaign CLI/storage and acknowledgement',async()=>{
    const {harness}=require('./check-campaign-js-051.cjs'),h=harness(),id='wt_'+'a'.repeat(32),gam={levelName:'CAM_1A',gameTime:1000};
    const files=Object.fromEntries(['gam.json','main.json','gameinfo.json','scriptstate.json','game.map'].map(name=>[name,Buffer.from(name==='gam.json'?JSON.stringify(gam):'{}').toString('base64')]));
    h.window.WarzoneSavedGames=undefined;h.window.BlockNightAndroid.campaignSavePayload=()=>JSON.stringify({metadata:{id,mode:'campaign',session:'cam1a_1',nativeLevel:'CAM_1A',mission:'cam1a',gameTime:1000},files});
    let restored=0;h.window.BlockNightAndroid.campaignSaveRestored=()=>{restored++;return true;};h.run('warzone/saved-games.js');
    const config=h.window.constructWZModuleConfig();assert(config.arguments.includes('--loadcampaign='+id));
    const module={FS:h.filesystem,WZVAL_configDirPath:'/warzone2100-campaign',removeRunDependency(){}};for(const fn of config.preRun)fn(module);module.removeRunDependency('persistent_warzone2100_config_dir');
    assert(h.values.has('/warzone2100-campaign/savegames/campaign/'+id+'/gam.json'));
    assert.equal(await h.window.WarzoneSavedGames.resumeCampaign({mission:'cam1a'}),true);assert.equal(restored,1);assert.equal(h.window.WarzoneSavedGames.resumeFfa,undefined);
  });
  await check('Existing Towers save keeps native rewards reconciliation and the original archive callback',async()=>{
    const f=towerFixture();try{assert.equal(await f.finish(f.api.save()),true);assert.equal(f.calls.filter(c=>c[0]==='archive').length,1);assert(f.calls.some(c=>c[0]==='pending'));assert(f.calls.some(c=>c[0]==='inventory-proof'));}finally{f.dispose();}
  });
  console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
