'use strict';
/* Bounded source fixtures with native/Android API stubs; no emulator or gameplay. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),file='app/src/main/assets/warzone/saved-games.js';
const source=fs.readFileSync(path.join(root,file),'utf8'),checks=[];
const slot='wt_'+'1'.repeat(32),logical='original-economic-run',doc='fresh-document';
const clone=x=>JSON.parse(JSON.stringify(x));
const rawSave=time=>({
  'gam.json':Buffer.from(JSON.stringify({gameTime:time,levelName:'Towers-Easy01'})),
  'main.json':Buffer.from('{}'),'gameinfo.json':Buffer.from('{}'),'game.map':Buffer.from([0,1,255]),
  'scriptstate.json':Buffer.from(JSON.stringify({globals_0:{wtreward_match:{session:logical},warzoneTowersWaves_state:{wave:4}}})),
  'nested/binary.bjo':Buffer.from([9,200,0,255])
});
function fixture(options={}){
  let now=1000,next=0,clock=5000,paused=false,done=false,modifierClock=null;
  const timers=new Map(),calls=[],listeners=new Map(),memory=new Map(),notices=[];
  const setTimeout=(fn,delay=0)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;};
  const clearTimeout=id=>timers.delete(id),settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
  const mfs={mkdirTree(name){calls.push(['mkdir',name]);},writeFile(name,data){memory.set(name,{bytes:Buffer.from(data),mtime:now});},
    readFile(name,config){const value=memory.get(name);if(!value)throw Error('ENOENT');return config?.encoding?value.bytes.toString('utf8'):new Uint8Array(value.bytes);},
    stat(name){const value=memory.get(name);if(!value)throw Error('ENOENT');return{mtime:new Date(value.mtime),mode:32768,size:value.bytes.length};},
    lstat(name){if(memory.has(name))return this.stat(name);if([...memory.keys()].some(k=>k.startsWith(name+'/')))return{mode:16384};throw Error('ENOENT');},
    isDir:mode=>mode===16384,isFile:mode=>mode===32768,
    readdir(name){const prefix=name+'/';return['.','..',...new Set([...memory.keys()].filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length).split('/')[0]))];},
    syncfs(populate,callback){calls.push(['explicit-sync',populate]);setTimeout(()=>callback(options.syncError?Error('blocked'):null),10);}};
  const saved=rawSave(2000),encoded=Object.fromEntries(Object.entries(saved).map(([n,b])=>[n,b.toString('base64')]));
  const payload={metadata:{id:slot,session:logical,mapId:'easy01',gameTime:2000,nativeLevel:'Towers-Easy01'},files:encoded};
  if(options.badPath)payload.files['../escape']=Buffer.from('x').toString('base64');
  if(options.badSlot)payload.metadata.id='../QuickSave';
  const quote={ok:true,session:logical,baseConfig:{session:logical,items:{fortress:1}},items:{fortress:1},remaining:{fortress:1},completedWaves:[1,2,3]};
  const commands={afterBuildExit(fn){calls.push(['build-exit']);if(options.cancelOnClose){done=true;listeners.get('warzone-battle-ended')?.();return Promise.reject(Error('The battle ended while closing Build.'));}return options.delayedExit?new Promise((resolve,reject)=>setTimeout(()=>{try{resolve(fn());}catch(error){reject(error);}},20000)):Promise.resolve(fn());},
    report:()=>({pending:0}),send(action,data){calls.push([action,clone(data||{})]);return Promise.resolve({ok:true,gameTime:clock,result:action==='resume-rewards'?{...quote,resumed:true}:clone(quote)});}};
  const canvas={focus:()=>calls.push(['focus-canvas']),dispatchEvent:event=>{modifierClock=clock;calls.push(['native-event',clone(event)]);return true;}};
  const document={getElementById:id=>id==='canvas'?canvas:null};
  const window={document,errorLog:options.oldSaveError?['writeGameFile:5023 Unable to save level name - too long']:[],__towersHtml:{session:doc,isActive:()=>true,isEnded:()=>done},parent:{document},
    __warzoneCommands:commands,__warzoneTowersWaves:{report:()=>({snapshot:{gameTime:clock,totalRounds:30}})},
    __blockNightResearch:{close:()=>calls.push(['close-tech'])},WarzoneMusic:{closeMenu:()=>calls.push(['close-music'])},
    WarzoneRewards:{ready:true,cancelTarget:()=>calls.push(['cancel-target']),reconcilePending:async(c,s)=>{calls.push(['pending',s]);return true;}},
    __kalaWarzoneTouch:{report:()=>({pendingClicks:0}),releaseAll:()=>calls.push(['release']),
      nativePressKey(key,code,keycode){assert.ok(modifierClock!==null&&clock>modifierClock,'F7 follows an observed native clock advance after both-sided modifier releases');calls.push(['key',key,code,keycode]);if(options.nativeSaveError){window.errorLog.push(options.nativeSaveError);return;}if(options.noNativeSave)return;
        paused=true;setTimeout(()=>{for(const [name,data]of Object.entries(rawSave(clock)))mfs.writeFile('/config/savegames/skirmish/QuickSave/'+name,data);
          window.wz_js_save_config_dir_to_persistent_storage(true,()=>{paused=false;calls.push(['native-resumed']);});},20);}},
    BlockNightAndroid:{savedGamePayload:session=>{calls.push(['payload',session]);return JSON.stringify(options.loading?payload:{});},
      rewardResumeCaps:session=>{calls.push(['caps',session]);return JSON.stringify({...quote,research:false,supply:false,pendingTransactions:[]});},
      savedGameRestored:(session,id,proof)=>{calls.push(['restored',session,id,JSON.parse(proof)]);return options.restoreRejected!==true;},
      rewardInventorySnapshot:(session,quote)=>{calls.push(['inventory-proof',session,JSON.parse(quote)]);return true;},
      showNotice:message=>notices.push(message),storeSavedGame:(session,meta,values)=>{calls.push(['archive',session,JSON.parse(meta),JSON.parse(values)]);return JSON.stringify({ok:true,id:slot});}},
    wz_js_get_config_dir_path:()=>'/config',wz_js_save_config_dir_to_persistent_storage(user,callback){calls.push(['native-sync',user]);setTimeout(callback,60);},
    constructWZModuleConfig(){return{arguments:['--configdir=/config','--skirmish=towers-easy01.json','--debug=main'],preRun:[m=>{
      const remove=m.removeRunDependency;m.removeRunDependency=function(id){calls.push(['normal-wrapper',id]);return remove.call(this,id);};}],
      WZVAL_configDirPath:'/config',FS:mfs,canvas,removeRunDependency(id){calls.push(['base-remove',id]);}};},
    addEventListener(name,fn){listeners.set(name,fn);}};
  if(options.duel)window.__warzoneDuelConfig={mode:'duel'};
  const context={window,document,location:{search:'?map=easy01&battle_session='+doc},URLSearchParams,TextEncoder,TextDecoder,
    Uint8Array,Map,Set,Promise,Date:class extends Date{static now(){return now;}},setTimeout,clearTimeout,
    KeyboardEvent:class{constructor(type,config){Object.assign(this,{type},config);}},
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64')};
  vm.runInNewContext(source,context,{filename:file});
  const m=window.constructWZModuleConfig();window.LaunchedModule=m;window.Module=m;
  function tick(){if(done)return;if(!paused&&!options.frozenClock)clock+=100;setTimeout(tick,50);}setTimeout(tick,50);
  return{window,api:window.WarzoneSavedGames,module:m,memory,calls,notices,payload,saved,
    hydrate(){for(const fn of m.preRun)fn(m);m.removeRunDependency('persistent_warzone2100_config_dir');},
    end(){done=true;listeners.get('warzone-battle-ended')?.();},
    async finish(promise){let finished=false,value,error;Promise.resolve(promise).then(v=>{finished=true;value=v;},e=>{finished=true;error=e;});
      for(let count=0;!finished&&count<1500;count++){await settle();if(finished)break;const nextTimer=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];assert.ok(nextTimer,'Promise stalled without observable work');timers.delete(nextTimer[0]);now=nextTimer[1].at;nextTimer[1].fn();}
      assert.ok(finished,'Fixture exceeded bounded timer iterations');if(error)throw error;return value;},
    async advance(milliseconds){const target=now+milliseconds;for(let count=0;count<1500;count++){await settle();const timer=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!timer||timer[1].at>target)break;timers.delete(timer[0]);now=timer[1].at;timer[1].fn();}now=target;await settle();},
    dispose(){done=true;timers.clear();}};
}
async function check(name,run){await run();checks.push({name,passed:true,kind:'source fixture with native and Android stubs'});}
(async()=>{
  await check('Fresh games preserve ordinary startup arguments and readiness',async()=>{const f=fixture();assert.equal(f.api.loading,false);assert.equal(f.api.ready,true);assert.ok(f.module.arguments.includes('--skirmish=towers-easy01.json'));f.dispose();});
  await check('Restore uses loadskirmish, hydrates every native byte after IDBFS, preserves config wrapper, no .gam needed',async()=>{
    const f=fixture({loading:true});assert.equal(f.api.ready,false);assert.deepEqual(Array.from(f.module.arguments),['--configdir=/config','--debug=main','--loadskirmish='+slot]);
    for(const fn of f.module.preRun)fn(f.module);assert.equal(f.memory.size,0);f.module.removeRunDependency('unrelated');assert.equal(f.memory.size,0);
    f.module.removeRunDependency('persistent_warzone2100_config_dir');for(const[name,bytes]of Object.entries(f.saved))assert.deepEqual(f.memory.get('/config/savegames/skirmish/'+slot+'/'+name).bytes,bytes);
    assert.ok(f.calls.some(c=>c[0]==='normal-wrapper'));assert.ok(f.calls.some(c=>c[0]==='base-remove'));assert.equal(f.api.report().hydrated,true);f.dispose();});
  await check('Invalid slot IDs and traversal files stop native loading',async()=>{
    for(const option of [{badSlot:true},{badPath:true}])assert.throws(()=>fixture({loading:true,...option}),/saved game/i);});
  await check('Restore reconciles pending purchases before fresh caps and requires actual native quote and Android acknowledgement',async()=>{
    const f=fixture({loading:true});f.hydrate();assert.equal(await f.finish(f.api.resumeRewards(f.window.__warzoneCommands,doc)),true);assert.equal(f.api.ready,true);
    const pending=f.calls.findIndex(c=>c[0]==='pending'),caps=f.calls.findIndex(c=>c[0]==='caps'),resume=f.calls.findIndex(c=>c[0]==='resume-rewards'),proof=f.calls.find(c=>c[0]==='restored');
    assert.ok(pending<caps&&caps<resume);assert.equal(proof[1],doc);assert.equal(proof[3].session,logical);assert.ok(proof[3].gameTime>=2000);f.dispose();});
  await check('Stale document and rejected restored-world acknowledgement never become ready',async()=>{
    const f=fixture({loading:true});f.hydrate();await assert.rejects(f.api.resumeRewards(f.window.__warzoneCommands,'stale-doc'),/not restored/);assert.equal(f.api.ready,false);f.dispose();
    const g=fixture({loading:true,restoreRejected:true});g.hydrate();await assert.rejects(g.finish(g.api.resumeRewards(g.window.__warzoneCommands,doc)),/verified/);assert.equal(g.api.ready,false);g.dispose();});
  await check('Save uses one genuine F7, original native persistence, resumed clock and successful explicit sync before byte-exact phone archive',async()=>{
    const f=fixture();const promise=f.api.save();assert.equal(await f.api.save(),false);assert.equal(await f.finish(promise),true,JSON.stringify(f.notices));
    const key=f.calls.filter(c=>c[0]==='key');assert.deepEqual(key,[['key','F7','F7',118]]);
    const releases=f.calls.filter(c=>c[0]==='native-event');assert.equal(releases.length,8);
    const expected=[['Control',17],['Shift',16],['Alt',18],['Meta',91]].flatMap(([key,number])=>[['Left',1],['Right',2]].map(([side,location])=>({
      type:'keyup',key,code:key+side,location,keyCode:number,which:number,bubbles:true,cancelable:true,repeat:false,ctrlKey:false,shiftKey:false,altKey:false,metaKey:false})));
    assert.deepEqual(releases.map(c=>c[1]),expected);assert.ok(f.calls.findLastIndex(c=>c[0]==='native-event')<f.calls.findIndex(c=>c[0]==='key'));
    const resumed=f.calls.findIndex(c=>c[0]==='native-resumed'),sync=f.calls.findIndex(c=>c[0]==='explicit-sync'),archive=f.calls.findIndex(c=>c[0]==='archive');
    assert.ok(resumed<sync&&sync<archive);const record=f.calls[archive];assert.equal(record[1],doc);assert.equal(record[2].session,logical);assert.equal(record[2].wave,4);assert.equal(record[2].totalWaves,30);
    for(const[name,encoded]of Object.entries(record[3]))assert.deepEqual(Buffer.from(encoded,'base64'),f.memory.get('/config/savegames/skirmish/QuickSave/'+name).bytes);
    assert.equal(f.api.report().busy,false);assert.equal(f.notices.filter(n=>n.startsWith('Game saved.')).length,1);f.dispose();});
  await check('Native persistence failure, paused clock and missing fresh save never claim or archive success',async()=>{
    for(const option of [{syncError:true},{frozenClock:true},{noNativeSave:true}]){const f=fixture(option);assert.equal(await f.finish(f.api.save()),false);assert.ok(!f.calls.some(c=>c[0]==='archive'));assert.ok(!f.notices.some(n=>n.startsWith('Game saved.')));assert.equal(f.api.report().busy,false);f.dispose();}});
  await check('New native save errors fail immediately and specifically; old errors never poison a later successful save',async()=>{
    for(const [error,message]of [['[writeGameFile:5023] Unable to save level name - too long (max20)','internal name is too long'],['writeGameFile failed to write gam.json','could not create']]){
      const f=fixture({nativeSaveError:error});assert.equal(await f.finish(f.api.save()),false);assert.ok(f.notices.some(value=>value.includes(message)));assert.ok(!f.calls.some(c=>c[0]==='archive'));f.dispose();}
    const f=fixture({oldSaveError:true});assert.equal(await f.finish(f.api.save()),true);f.dispose();});
  await check('Timed-out delayed menu exit cannot later send F7 or archive stale callbacks',async()=>{
    const f=fixture({delayedExit:true});assert.equal(await f.finish(f.api.save()),false);assert.ok(!f.calls.some(c=>c[0]==='key'));await f.advance(6000);assert.ok(!f.calls.some(c=>c[0]==='key'));assert.ok(!f.calls.some(c=>c[0]==='archive'));f.dispose();});
  await check('Battle disposal cancels pending save before native input',async()=>{const f=fixture({delayedExit:true});const saving=f.api.save();f.end();assert.equal(await f.finish(saving),false);assert.ok(!f.calls.some(c=>c[0]==='key'));f.dispose();});
  await check('Synchronous retirement consumes an already-rejected Build exit promise without an unhandled rejection',async()=>{
    const unhandled=[],observe=error=>unhandled.push(error);process.on('unhandledRejection',observe);
    try {const f=fixture({cancelOnClose:true});assert.equal(await f.finish(f.api.save()),false);assert.ok(!f.calls.some(c=>c[0]==='key'||c[0]==='archive'));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);f.dispose();}
    finally {process.removeListener('unhandledRejection',observe);}});
  await check('Duel mode remains untouched',async()=>{const f=fixture({duel:true});assert.equal(f.api,undefined);f.dispose();});
  const sources=[file,'tools/check-saved-games-027.cjs','app/src/main/assets/warzone/index.html'].map(name=>({path:name,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}));
  fs.writeFileSync(path.join(root,'archive/saved-games-web-0.27-checks.json'),JSON.stringify({version:'0.27',emulatorUsed:false,scope:'Source fixtures only; no real engine, Android or gameplay execution.',passed:true,checks,sources},null,2)+'\n');
  console.log('PASS '+checks.length+' focused saved-game source fixtures (no emulator).');
})().catch(error=>{console.error(error);process.exitCode=1;});
