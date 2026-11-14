'use strict';
/* Bounded source fixtures. Real map load/AI/save checks remain device QA. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),maps=JSON.parse(fs.readFileSync(path.join(root,'app/src/main/assets/ffa-maps.json'),'utf8')).maps;
const checks=[];const clone=v=>JSON.parse(JSON.stringify(v));
const bootstrap=fs.readFileSync(path.join(root,'app/src/main/assets/warzone/index-ffa.html'),'utf8').match(/<script>\s*const ffaRequestedDifficulty[\s\S]*?<\/script>/)[0].replace(/^<script>/,'').replace(/<\/script>$/,'');
function launch(query){const c={window:{},location:{search:query},URLSearchParams};vm.createContext(c);vm.runInContext(bootstrap,c);return c.window;}
function config(query){return launch(query).__warzoneFfaConfig;}
const nativeMaps=launch('').__warzoneFfaMaps;
function check(name,body){return Promise.resolve().then(body).then(()=>{checks.push(name);console.log('PASS: '+name);});}

// Refine the existing prepared save fixture with native map/slot flags. The
// synthetic worlds are labelled as such; a genuine legacy ZIP is also used.
let helper=fs.readFileSync(path.join(root,'tools/check-cobra-save-064.cjs'),'utf8').split('\nconst snapshot=f=>')[0];
const seam='const exported={exports:{}};vm.runInNewContext(helper';
const refinement=String.raw`
  if(ffa){
    head=head.replace('const rawSave=', 'const fixtureRawSave=');
    const mapTable=MAP_TABLE_LITERAL;
    const mapSetup='  const mapTable='+JSON.stringify(mapTable)+';\n  const map=mapTable.find(value=>value.id===(options.mapId||"emag"));\n  if(!map)throw Error("Unknown fixture map");\n'+
      '  const rawSave=(time,type="cobra",difficulty="easy",session=logical)=>{const files=fixtureRawSave(time,type,difficulty,session);const gam=JSON.parse(files["gam.json"]), main=JSON.parse(files["main.json"]), scripts=JSON.parse(files["scriptstate.json"]);gam.levelName=map.level;gam.multiMaxPlayers=map.players;gam.netSelectedPlayer=0;gam.multiAlliance=0;gam.netPlayers=Array.from({length:map.players},(_,i)=>({aiName:i?(type==="cobra"?"Cobra":"NullBot (ground)"):"Nexus",difficulty:i?{easy:1,medium:2,hard:3}[difficulty]:-2,allocated:i?0:1,position:i,team:i}));main.levelName=map.level;main.maxPlayers=map.players;main.selectedPlayer=0;main.allianceSetting=0;main.players=gam.netPlayers.map((value,index)=>({...value,index,nameAI:value.aiName,allocated:index===0,alliances:Array.from({length:map.players},(_,other)=>other===index?3:0)}));scripts.globals_0.ffaConfig.map=map.id;for(const key of Object.keys(scripts))if(/^globals_[1-9]/.test(key))delete scripts[key];for(let me=1;me<map.players;me++)scripts["globals_"+me]={me,scriptName:type==="cobra"?"Cobra":"ffa-nullbot"};for(const[name,value]of Object.entries({"gam.json":gam,"main.json":main,"scriptstate.json":scripts}))files[name]=Buffer.from(JSON.stringify(value));return files;};\n';
    head=head.replace('function fixture(options={}){','function fixture(options={}){\n'+mapSetup);
    head=head.replaceAll("nativeLevel:'FFA-EMAG-T1'",'nativeLevel:map.level');
    head=head.replaceAll("mapId:'emag',mapName:'EMAG FFA'",'mapId:map.id,mapName:map.name,players:map.players,bots:map.bots');
    head=head.replace("window.__warzoneFfaMode=true;",'window.__warzoneFfaMaps=mapTable;\n  window.__warzoneFfaMode=true;');
    head=head.replace("Object.freeze({mode:'ffa',map:'emag',difficulty:","Object.freeze({mode:'ffa',map:map.id,mapName:map.name,players:map.players,bots:map.bots,level:map.level,difficulty:");
    head=head.replace("snapshot:{mode:'ffa',session:","snapshot:{mode:'ffa',map:map.id,mapName:map.name,maxPlayers:map.players,session:");
    head=head.replace('players:options.livePlayers||Array.from({length:4}', 'players:options.livePlayers||Array.from({length:map.players}');
  }
` .replace('MAP_TABLE_LITERAL',JSON.stringify(maps));
assert(helper.includes(seam));helper=helper.replace(seam,'helper=helper.replace("  const exported={exports:{}};",'+JSON.stringify(refinement)+'+"\\n  const exported={exports:{}};");\n'+seam);
const exported={exports:{}};vm.runInNewContext(helper+'\nmodule.exports={fixture,towerFixture};',{require,__dirname:path.join(root,'tools'),module:exported,console,process,Buffer,setImmediate,URLSearchParams,TextEncoder,TextDecoder},{filename:'FFA map-aware prepared save fixture'});
const {fixture,towerFixture}=exported.exports;
const snapshot=f=>f.window.__warzoneFfa.report().snapshot;
function alter(payload,name,fn){const value=JSON.parse(Buffer.from(payload.files[name],'base64'));fn(value);payload.files[name]=Buffer.from(JSON.stringify(value)).toString('base64');}
async function using(options,body){const f=fixture(options);try{await body(f);}finally{f.dispose();}}

async function main(){
  await check('All fifty-one known maps select immutable wrapper identity, difficulty and player count',()=>{
    assert.equal(maps.length,51);for(const count of[2,3,4])assert.equal(maps.filter(map=>map.id.startsWith('ntw-'+count+'p-')&&map.players===count).length,15);
    for(const map of maps)for(const difficulty of['easy','medium','hard']){const value=config('?bnFfaMap='+map.id+'&bnFfaDifficulty='+difficulty);assert.equal(value.map,map.id);assert.equal(value.level,map.level);assert.equal(value.players,map.players);assert.equal(value.bots,map.bots);assert.equal(value.difficulty,difficulty);assert.equal(value.botType,'cobra');}
    assert.equal(config('').map,'emag');for(const bad of['','unknown','EMAG','../emag','ntw-2p-00','ntw-2p-16','ntw-3p-1','ntw-5p-01','ntw-4p-015'])assert.throws(()=>config('?bnFfaMap='+encodeURIComponent(bad)),/Unknown FFA map/);
    assert.equal(config('?bnFfaMap=emaj-6p&bnFfaBotType=nullbot').botType,'cobra');
  });
  await check('Native FFA observer covers every active slot, hostility and air caps, including two/three/four/six-player research',()=>{
    const policy=JSON.parse(fs.readFileSync(path.join(root,'scenario/ffa/policy.json'),'utf8'));
    for(const map of maps)for(const difficulty of['easy','medium','hard']){
      const caps=new Map(),timers=[],packets=[],cfg={mode:'ffa',map:map.id,difficulty,player:0,botType:'cobra',players:map.players,bots:map.bots,level:map.level};
      const c={console,JSON,Date,Boolean,Array,Object,Number,Math,maxPlayers:map.players,selectedPlayer:0,gameTime:1000,mapWidth:map.width,mapHeight:map.height,
        includeJSON:n=>n==='ffa-policy.json'?policy:n==='ffa-maps.json'?{maps:nativeMaps}:cfg,include(){},receiveAllEvents(){},namespace(){},addGuideTopic(){},
        setupStructureLimit(){},applyLimitSet(){},setStructureLimits:(id,limit,player)=>caps.set(player+':'+id,limit),setTimer:name=>{timers.push(name);return true;},queue(){},
        campaignMobileState:()=>({nativeLevel:map.level,paused:false}),playerData:Array.from({length:map.players},(_,player)=>({isHuman:player===0,isAI:player!==0,scriptName:player?'Cobra.js':'',team:player,position:player,difficulty:{easy:1,medium:2,hard:3}[difficulty]})),
        startPositions:[],enumStruct:()=>[],enumDroid:()=>[],enumSelected:()=>[],getStructureLimit:(id,player)=>caps.get(player+':'+id),playerPower:()=>2500,
        alliancesType:0,allianceExistsBetween:(a,b)=>a===b,DROID_ANY:0,FACTORY:1,CYBORG_FACTORY:2,VTOL_FACTORY:3,
        blockNightEmitResearchSnapshotV23(){},dump:text=>packets.push(JSON.parse(text.slice(6)))};
      vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'scenario/ffa/stock/structurelimits.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(root,'scenario/ffa/policy.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(root,'scenario/ffa/rules.js'),'utf8'),c);
      assert.equal(timers.length,0,'No native timer ID is created before restore hydration');c.ffa_eventGameInit();for(let player=0;player<map.players;player++)c.setupStructureLimit(player);
      for(let player=0;player<map.players;player++)assert.equal(caps.get(player+':A0PowerGenerator'),map.id==='contact'?14:8,'Only Contact overrides actual stock setupStructureLimit power limit');
      c.applyLimitSet();c.ffa_eventResearched({id:'R-Wpn-MG1Mk1'},null,map.players-1);c.ffaStart();c.ffaStart();
      const packet=packets.at(-1);assert.equal(packet.map,map.id);assert.equal(packet.requestedLevel,map.level);assert.equal(packet.maxPlayers,map.players);assert.equal(packet.bots,map.bots);assert.equal(packet.players.length,map.players);assert.equal(packet.botType,'cobra');
      assert.equal(packet.players.at(-1).researchCompletedCount,1);assert.equal(packet.alliances.length,map.players);packet.alliances.forEach((row,a)=>{assert.equal(row.length,map.players);row.forEach((v,b)=>assert.equal(v,a===b));});
      assert(packet.players.every(player=>player.powerGeneratorLimit===(map.id==='contact'?14:8)));
      for(let player=0;player<map.players;player++)for(const id of policy.airStructures)assert.equal(caps.get(player+':'+id),0);
      assert.equal(new Set(timers).size,timers.length,'Repeated lifecycle starts cannot duplicate registered bridge timers');
      const label={hidden:false,querySelector:n=>labels[n],getBoundingClientRect:()=>({left:500})},labels={strong:{textContent:''},small:{textContent:''}},document={getElementById:id=>id==='blocknight-combat-hud'?{children:[]}:id==='wt-ffa-status'?label:null};
      let activated=0;const window={document,parent:null,__warzoneFfaConfig:{...cfg,level:map.level,mapName:map.name},__towersHtml:{activate(){activated++;}},addEventListener(){}};window.parent=window;
      const hud=vm.createContext({window,document,setInterval(){},TextDecoder,Uint8Array,JSON,Number,Boolean,String,Array,Promise});vm.runInContext(fs.readFileSync(path.join(root,'app/src/main/assets/warzone-ffa-hud.js'),'utf8'),hud);
      assert.equal(window.__warzoneFfa.accept(clone(packet)),true);assert(labels.small.textContent.startsWith(map.bots+' Cobra'));assert.equal(activated,1);
      const missing=clone(packet);missing.players.pop();assert.equal(window.__warzoneFfa.accept(missing),false);assert.equal(window.__warzoneFfa.accept({...clone(packet),maxPlayers:map.players===6?4:6}),false);
      assert.equal(window.__warzoneFfa.accept({...clone(packet),nativeLevel:'wrong-level'}),false);assert.equal(activated,1);
    }
  });
  await check('Actual native policy rejects mismatched map slots while retaining minimal legacy EMAG config',()=>{
    const policy=JSON.parse(fs.readFileSync(path.join(root,'scenario/ffa/policy.json'),'utf8'));
    const source=fs.readFileSync(path.join(root,'scenario/ffa/policy.js'),'utf8');
    const evaluate=cfg=>vm.runInNewContext(source,{includeJSON:name=>name==='ffa-policy.json'?policy:name==='ffa-maps.json'?{maps:nativeMaps}:cfg});
    evaluate({mode:'ffa',map:'emag',difficulty:'easy',player:0});
    for(const map of maps){
      const cfg={mode:'ffa',map:map.id,difficulty:'easy',player:0,players:map.players,bots:map.bots,level:map.level};evaluate(cfg);
      for(const change of[{players:map.players+1},{bots:map.bots+1},{level:'other'},{player:1},{difficulty:'other'}])assert.throws(()=>evaluate({...cfg,...change}),/Invalid FFA launch config/);
      if(map.id!=='emag')for(const missing of['players','bots','level']){const invalid={...cfg};delete invalid[missing];assert.throws(()=>evaluate(invalid),/Invalid FFA launch config/);}
    }
  });
  await check('Map-aware native archive restore and F7 save keep every map and all active bot contexts',async()=>{
    for(const map of maps)for(const difficulty of['easy','medium','hard'])await using({mapId:map.id,difficulty,loading:true},async f=>{f.hydrate();assert.equal(await f.api.resumeFfa(snapshot(f)),true);const proof=f.calls.find(call=>call[0]==='restored')[3];assert.equal(proof.mapId,map.id);assert.equal(proof.nativeLevel,map.level);assert.equal(proof.players,map.players);assert.equal(proof.bots,map.bots);assert.equal(await f.finish(f.api.save()),true,JSON.stringify(f.notices));const metadata=f.calls.find(call=>call[0]==='ffa-archive')[2];assert.equal(metadata.mapId,map.id);assert.equal(metadata.players,map.players);assert.equal(metadata.bots,map.bots);assert.equal(metadata.botType,'cobra');});
  });
  await check('Configured slot count, human ownership, hostility and bot5 cannot be forged or omitted',()=>{
    const mutations=[p=>p.metadata.mapId='emag',p=>p.metadata.nativeLevel='FFA-EMAG-T1',p=>p.metadata.players=4,p=>delete p.metadata.players,
      p=>alter(p,'gam.json',g=>g.multiMaxPlayers=4),p=>alter(p,'main.json',g=>g.maxPlayers=4),p=>alter(p,'gam.json',g=>g.netPlayers[5].aiName='Nexus'),
      p=>alter(p,'main.json',g=>g.players[5].team=1),p=>alter(p,'main.json',g=>g.players[5].allocated=true),p=>alter(p,'main.json',g=>g.players[1].alliances[5]=3),
      p=>alter(p,'main.json',g=>g.players[1].alliances=[0]),
      p=>alter(p,'scriptstate.json',g=>delete g.globals_5),p=>alter(p,'scriptstate.json',g=>g.globals_5.scriptName='ffa-nullbot')];
    for(const alterPayload of mutations)assert.throws(()=>fixture({loading:true,mapId:'emaj-6p',alterPayload}),/FFA/i);
  });
  await check('The actual legacy EMAG NullBot archive stays byte-exact and defaults to four slots',async()=>{
    const archive=path.join(root,'archive/cobra-0.64/original-easy-nullbot.zip'),before=fs.readFileSync(archive),payload=JSON.parse(cp.execFileSync('python',['-c',"import zipfile,json,base64,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({'metadata':json.loads(z.read('metadata.json')),'files':{n[7:]:base64.b64encode(z.read(n)).decode() for n in z.namelist() if n.startswith('native/')}}))",archive],{encoding:'utf8',maxBuffer:16*1024*1024}));
    await using({loading:true,botType:'nullbot',difficulty:'easy',realPayload:payload,startClock:payload.metadata.gameTime+1000},async f=>{f.hydrate();assert.equal(await f.api.resumeFfa(snapshot(f)),true);assert.equal(f.calls.find(call=>call[0]==='restored')[3].players,4);assert(!payload.metadata.botType);assert(!payload.metadata.players);});assert(before.equals(fs.readFileSync(archive)));
  });
  await check('Campaign restore and Towers reward save still use their original branches',async()=>{
    const {harness}=require('./check-campaign-js-051.cjs'),h=harness(),id='wt_'+'a'.repeat(32),gam={levelName:'CAM_1A',gameTime:1000};const files=Object.fromEntries(['gam.json','main.json','gameinfo.json','scriptstate.json','game.map'].map(name=>[name,Buffer.from(name==='gam.json'?JSON.stringify(gam):'{}').toString('base64')]));h.window.WarzoneSavedGames=undefined;h.window.BlockNightAndroid.campaignSavePayload=()=>JSON.stringify({metadata:{id,mode:'campaign',session:'cam1a_1',nativeLevel:'CAM_1A',mission:'cam1a',gameTime:1000},files});h.window.BlockNightAndroid.campaignSaveRestored=()=>true;h.run('warzone/saved-games.js');const cfg=h.window.constructWZModuleConfig(),module={FS:h.filesystem,WZVAL_configDirPath:'/warzone2100-campaign',removeRunDependency(){}};for(const fn of cfg.preRun)fn(module);module.removeRunDependency('persistent_warzone2100_config_dir');assert.equal(await h.window.WarzoneSavedGames.resumeCampaign({mission:'cam1a'}),true);
    const t=towerFixture();try{assert.equal(await t.finish(t.api.save()),true);}finally{t.dispose();}
  });
  const report={version:'0.67',passed:true,checksPassed:checks.length,emulatorUsed:false,checks,syntheticNativeProtocolFixture:true,actualNativeEngineExecuted:false,sources:['app/src/main/assets/warzone/saved-games.js','app/src/main/assets/warzone-ffa-hud.js','app/src/main/assets/warzone/index-ffa.html','app/src/main/assets/ffa-maps.json','scenario/ffa/policy.js','scenario/ffa/rules.js','tools/check-ffa-maps-js-067.cjs'].map(name=>({path:name,bytes:fs.statSync(path.join(root,name)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}))};fs.writeFileSync(path.join(root,'archive/ffa-maps-0.67-js-checks.json'),JSON.stringify(report,null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
