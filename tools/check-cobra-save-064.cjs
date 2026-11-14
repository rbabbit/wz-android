'use strict';
/* Actual FFA save/HUD code with the prepared native-save protocol fixture. No device/native engine. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),fixturePath='tools/check-ffa-save-060.cjs',checks=[];
const legacyPath='scenario/ffa/test-fixtures/legacy-nullbot-hard.zip';
let helper=fs.readFileSync(path.join(root,fixturePath),'utf8').split('\nconst fixture=loadFixture(true)')[0];
assert(helper.includes('function loadFixture(ffa)'));
const refinement=String.raw`
  if(ffa){
    function amend(from,to){assert.equal(head.split(from).length,2,'Prepared native-save seam changed: '+from);head=head.replace(from,to);}
    amend("const rawSave=time=>({", "const rawSave=(time,type='cobra',difficulty='easy',session=logical)=>({");
    amend("JSON.stringify({gameTime:time,levelName:'FFA-EMAG-T1'})", "JSON.stringify({gameTime:time,levelName:'FFA-EMAG-T1',netPlayers:Array.from({length:4},(_,i)=>i?{aiName:type==='cobra'?'Cobra':'NullBot (ground)',difficulty:{easy:1,medium:2,hard:3}[difficulty]}:{aiName:'Nexus',difficulty:-2})})");
    amend("'main.json':Buffer.from('{}')", "'main.json':Buffer.from(JSON.stringify({players:Array.from({length:4},(_,i)=>({index:i,nameAI:i?(type==='cobra'?'Cobra':'NullBot (ground)'):'Nexus',difficulty:i?{easy:1,medium:2,hard:3}[difficulty]:-2}))}))");
    amend("{globals_0:{ffaSession:logical,ffaConfig:{mode:'ffa',map:'emag',difficulty:'easy',player:0},ffaOutcome:''}}", "{globals_0:{ffaSession:session,ffaConfig:{mode:'ffa',map:'emag',difficulty,player:0},ffaOutcome:''},...Object.fromEntries([1,2,3].map(me=>['globals_'+me,{me,scriptName:type==='cobra'?'Cobra':'ffa-nullbot'}]))}");
    amend('rawSave(2000)',"rawSave(2000,options.archiveBotType||options.botType||'cobra',options.difficulty||'easy')");
    amend('rawSave(clock)',"rawSave(clock,options.nativeBotType||options.botType||'cobra',options.difficulty||'easy',options.liveSession||payload.metadata.session)");
    amend("clock=5000", "clock=options.startClock||5000");
    amend("mapName:'EMAG FFA',difficulty:'easy',gameTime:2000", "mapName:'EMAG FFA',difficulty:options.difficulty||'easy',botType:options.botType||'cobra',gameTime:2000");
    amend("  options.alterPayload?.(payload);", "  if(options.realPayload){payload.metadata=clone(options.realPayload.metadata);payload.files=clone(options.realPayload.files);}\n  if(options.legacyMetadata)delete payload.metadata.botType;\n  options.alterPayload?.(payload);");
    amend("Object.freeze({mode:'ffa',map:'emag',difficulty:'easy'})", "Object.freeze({mode:'ffa',map:'emag',difficulty:options.difficulty||'easy',botType:options.wrapperBotType||options.botType||'cobra'})");
    amend("session:options.liveSession||logical,nativeLevel:'FFA-EMAG-T1',difficulty:options.liveDifficulty||'easy',", "session:options.liveSession||payload.metadata.session,nativeLevel:'FFA-EMAG-T1',difficulty:options.liveDifficulty||options.difficulty||'easy',botType:options.liveBotType||options.botType||'cobra',players:options.livePlayers||Array.from({length:4},(_,player)=>({player,botType:player?(options.botType||'cobra'):'human',scriptName:player?((options.botType||'cobra')==='cobra'?'Cobra.js':'ffa-nullbot.js'):''})),");
  }
`;
const seam='  const exported={exports:{}};';assert.equal(helper.split(seam).length,2);helper=helper.replace(seam,refinement+'\n'+seam);
const exported={exports:{}};vm.runInNewContext(helper+'\nmodule.exports={fixture:loadFixture(true),towerFixture:loadFixture(false)};',{
  require,__dirname:path.join(root,'tools'),module:exported,console,process,Buffer,setImmediate,URLSearchParams,TextEncoder,TextDecoder
},{filename:fixturePath+' (Cobra native identity extension)'});
const {fixture,towerFixture}=exported.exports;
const snapshot=f=>f.window.__warzoneFfa.report().snapshot,clone=value=>JSON.parse(JSON.stringify(value));
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64');
function alterJSON(payload,name,change){const value=JSON.parse(Buffer.from(payload.files[name],'base64'));change(value);payload.files[name]=encode(value);}
async function using(options,body){const f=fixture(options);try{await body(f);}finally{f.dispose();}}
async function check(name,body){await body();checks.push({name,passed:true});console.log('PASS: '+name);}
function hud(botType='cobra'){
  const text={strong:{textContent:''},small:{textContent:''}},label={hidden:false,querySelector:name=>text[name],getBoundingClientRect:()=>({left:500})};
  const document={getElementById:id=>id==='blocknight-combat-hud'?{children:[]}:id==='wt-ffa-status'?label:null};
  let activated=0;const window={document,parent:null,__warzoneFfaConfig:{mode:'ffa',difficulty:'easy',botType},__towersHtml:{activate(){activated++;}},addEventListener(){}};window.parent=window;
  const context=vm.createContext({window,document,setInterval(){},TextDecoder,Uint8Array,JSON,Number,Boolean,String,Array,Promise});
  vm.runInContext(fs.readFileSync(path.join(root,'app/src/main/assets/warzone-ffa-hud.js'),'utf8'),context);
  return{window,text,api:window.__warzoneFfa,activated:()=>activated};
}
async function main(){
  const genuine=JSON.parse(cp.execFileSync('python',['-c',"import zipfile,json,base64,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({'metadata':json.loads(z.read('metadata.json')),'files':{n[7:]:base64.b64encode(z.read(n)).decode() for n in z.namelist() if n.startswith('native/')}}))",path.join(root,legacyPath)],{encoding:'utf8',maxBuffer:16*1024*1024}));
  const legacyHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,legacyPath))).digest('hex');
  await check('Genuine metadata-less NullBot archive restores byte-for-byte with actual bot proof and without rewriting old metadata',async()=>{
    const before=JSON.stringify(genuine),options={loading:true,botType:'nullbot',difficulty:'hard',realPayload:genuine,startClock:genuine.metadata.gameTime+1000};
    await using(options,async f=>{assert(!f.payload.metadata.botType);f.hydrate();for(const[name,data]of Object.entries(genuine.files))assert.deepEqual(f.memory.get('/warzone2100-ffa-easy/savegames/skirmish/'+genuine.metadata.id+'/'+name).bytes,Buffer.from(data,'base64'));assert.equal(await f.api.resumeFfa(snapshot(f)),true);const proof=f.calls.find(call=>call[0]==='restored')[3];assert.equal(proof.botType,'nullbot');assert(!f.payload.metadata.botType);});
    assert.equal(JSON.stringify(genuine),before);
  });
  await check('Cobra Easy/Medium/Hard native F7 archives actual bot identity after persistence, resumed clock and sync',async()=>{
    for(const difficulty of['easy','medium','hard'])await using({difficulty},async f=>{assert.equal(await f.finish(f.api.save()),true,JSON.stringify(f.notices));const archive=f.calls.find(call=>call[0]==='ffa-archive');assert.equal(archive[2].botType,'cobra');assert.equal(archive[2].difficulty,difficulty);const gam=JSON.parse(Buffer.from(archive[3]['gam.json'],'base64'));assert(gam.netPlayers.slice(1).every(player=>player.aiName==='Cobra'));assert.equal(f.calls.filter(call=>call[0]==='key').length,1);});
  });
  await check('New saves from restored NullBot worlds explicitly remain NullBot',async()=>{
    await using({loading:true,botType:'nullbot',legacyMetadata:true},async f=>{f.hydrate();assert.equal(await f.api.resumeFfa(snapshot(f)),true);assert.equal(await f.finish(f.api.save()),true);assert.equal(f.calls.find(call=>call[0]==='ffa-archive')[2].botType,'nullbot');});
  });
  await check('Cobra and explicit NullBot restores require native live identity before readiness',async()=>{
    for(const botType of['cobra','nullbot'])await using({loading:true,botType},async f=>{f.hydrate();assert.equal(await f.api.resumeFfa(snapshot(f)),true);assert.equal(f.calls.find(call=>call[0]==='restored')[3].botType,botType);});
  });
  await check('Legacy metadata cannot relabel Cobra native files; explicit mismatches, unknown and mixed bot metadata fail startup',()=>{
    for(const alterPayload of[p=>delete p.metadata.botType,p=>p.metadata.botType='nullbot',p=>p.metadata.botType='mixed',p=>p.metadata.botType='unknown',p=>p.metadata.botType='']){
      assert.throws(()=>fixture({loading:true,alterPayload}),/FFA save|FFA bots/i);
    }
  });
  await check('Archive GAM, main and script contexts must all agree, including mixed or duplicate player contexts',()=>{
    const changes=[p=>alterJSON(p,'gam.json',gam=>gam.netPlayers[2].aiName='NullBot (ground)'),p=>alterJSON(p,'main.json',main=>main.players[2].nameAI='NullBot (ground)'),
      p=>alterJSON(p,'scriptstate.json',state=>state.globals_2.scriptName='ffa-nullbot'),p=>alterJSON(p,'scriptstate.json',state=>state.globals_99={me:2,scriptName:'Cobra'}),
      p=>alterJSON(p,'gam.json',gam=>gam.netPlayers[2].difficulty=3),p=>alterJSON(p,'main.json',main=>main.players[2].difficulty=3)];
    for(const alterPayload of changes)assert.throws(()=>fixture({loading:true,alterPayload}),/FFA bots/i);
  });
  await check('A mismatched restore wrapper cannot silently change the saved bot type',()=>{
    assert.throws(()=>fixture({loading:true,botType:'cobra',wrapperBotType:'nullbot'}),/different bots/);
    assert.throws(()=>fixture({loading:true,botType:'nullbot',legacyMetadata:true,wrapperBotType:'cobra'}),/different bots/);
  });
  await check('Mixed, unknown and wrongly scripted live bots cannot become restored-ready or create an archive',async()=>{
    for(const options of[{liveBotType:'mixed'},{liveBotType:'unknown'},{livePlayers:[{player:1,botType:'cobra',scriptName:'Cobra.js'},{player:2,botType:'nullbot',scriptName:'ffa-nullbot.js'},{player:3,botType:'cobra',scriptName:'Cobra.js'}]}]){
      await using({loading:true,...options},async f=>{f.hydrate();await assert.rejects(f.api.resumeFfa(snapshot(f)),/FFA bot/i);assert.equal(f.api.ready,false);});
      await using(options,async f=>{assert.equal(await f.finish(f.api.save()),false);assert(!f.calls.some(call=>call[0]==='ffa-archive'));});
    }
  });
  await check('Saved native files cannot disagree with the live Cobra packet at archive time',async()=>{
    await using({nativeBotType:'nullbot'},async f=>{assert.equal(await f.finish(f.api.save()),false);assert(!f.calls.some(call=>call[0]==='ffa-archive'));assert.match(f.api.report().error,/FFA bots/);});
  });
  await check('Unexpected actual bot families cannot archive under a different requested launch',async()=>{
    for(const botType of['cobra','nullbot'])await using({botType,wrapperBotType:botType==='cobra'?'nullbot':'cobra'},async f=>{assert.equal(await f.finish(f.api.save()),false);assert(!f.calls.some(call=>call[0]==='ffa-archive'));assert.match(f.api.report().error,/requested match/);});
  });
  await check('HUD labels actual Cobra/NullBot and refuses mixed, unknown or mismatched player identities',()=>{
    for(const botType of['cobra','nullbot']){const f=hud(botType),packet={mode:'ffa',map:'emag',session:'native-world',difficulty:'easy',botType,gameTime:1000,phase:'active',players:[0,1,2,3].map(player=>({player,botType:player?botType:'human',scriptName:player?(botType==='cobra'?'Cobra.js':'ffa-nullbot.js'):''}))};assert.equal(f.api.accept(packet),true);assert(f.text.small.textContent.includes(botType==='cobra'?'Cobra':'NullBot'));assert.equal(f.activated(),1);const broken=clone(packet);broken.players[2].scriptName=botType==='cobra'?'ffa-nullbot.js':'Cobra.js';assert.equal(f.api.accept(broken),false);assert.equal(f.activated(),1);const mismatched=hud(botType==='cobra'?'nullbot':'cobra');assert.equal(mismatched.api.accept(packet),false);assert.equal(mismatched.activated(),0,'Unexpected family activated the requested match');assert.equal(mismatched.api.report().snapshot,null);}
    for(const botType of['mixed','unknown'])assert.equal(hud().api.accept({mode:'ffa',map:'emag',session:'x',difficulty:'easy',botType,gameTime:1000,players:[]}),false);
  });
  await check('Existing Campaign restore and Towers reward save paths retain their original behavior',async()=>{
    const {harness}=require('./check-campaign-js-051.cjs'),h=harness(),id='wt_'+'a'.repeat(32),gam={levelName:'CAM_1A',gameTime:1000};
    const files=Object.fromEntries(['gam.json','main.json','gameinfo.json','scriptstate.json','game.map'].map(name=>[name,Buffer.from(name==='gam.json'?JSON.stringify(gam):'{}').toString('base64')]));
    h.window.WarzoneSavedGames=undefined;h.window.BlockNightAndroid.campaignSavePayload=()=>JSON.stringify({metadata:{id,mode:'campaign',session:'cam1a_1',nativeLevel:'CAM_1A',mission:'cam1a',gameTime:1000},files});h.window.BlockNightAndroid.campaignSaveRestored=()=>true;h.run('warzone/saved-games.js');const cfg=h.window.constructWZModuleConfig(),module={FS:h.filesystem,WZVAL_configDirPath:'/warzone2100-campaign',removeRunDependency(){}};for(const fn of cfg.preRun)fn(module);module.removeRunDependency('persistent_warzone2100_config_dir');assert.equal(await h.window.WarzoneSavedGames.resumeCampaign({mission:'cam1a'}),true);
    const t=towerFixture();try{assert.equal(await t.finish(t.api.save()),true);assert.equal(t.calls.filter(call=>call[0]==='archive').length,1);assert(t.calls.some(call=>call[0]==='inventory-proof'));}finally{t.dispose();}
  });
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,legacyPath))).digest('hex'),legacyHash);
  const inputs=['app/src/main/assets/warzone/saved-games.js','app/src/main/assets/warzone-ffa-hud.js','tools/check-cobra-save-064.cjs',legacyPath];
  const report={version:'0.64',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,genuineLegacyArchive:legacyPath,legacySHA256:legacyHash,syntheticCobraIdentityFixture:true,
    sources:inputs.map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')})),recordedUTC:new Date().toISOString()};
  fs.writeFileSync(path.join(root,'archive/cobra-0.64-js-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
