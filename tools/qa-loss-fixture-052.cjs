'use strict';
// Emulator-only casualty fixture. No test hooks are compiled into the app.
// Starts from an ordinary saved world with three real build jobs. The fixture
// changes one truck's health and relocates one existing enemy for a bounded
// real native fatal-damage event. Native destruction/order handling is unmocked.
const fs=require('node:fs'),path=require('node:path');
const q=require('./campaign-live-051.cjs');
if(q.device!=='emulator-5558')throw Error('Casualty fixture is restricted to prepared emulator5558');
const dir='C:/timerApp/_release-records/loss-builders052';
const file=path.join(dir,'casualty-ready.json');
const decoded=(v,name)=>JSON.parse(Buffer.from(v.files[name]).toString('utf8'));
const encoded=v=>[...Buffer.from(JSON.stringify(v))];
function seed(){
  const v=JSON.parse(fs.readFileSync(path.join(dir,'prepared.json'),'utf8'));
  const d=decoded(v,'droid.json'),s=decoded(v,'struct.json');
  const truck=Object.values(d).find(t=>t.player===0&&t.id===160001),enemy=Object.values(d).find(t=>t.player===1&&t.weapons>0);
  if(!truck||!enemy||v.jobs.length!==3)throw Error('Prepared units/jobs invalid');
  truck.health=1;
  const originalEnemy={id:enemy.id,position:enemy.position,order:enemy['order/type']};
  enemy.position=[truck.position[0]-256,truck.position[1],truck.position[2]];
  enemy.action=0;enemy.actionString='DACTION_NONE';enemy['order/type']=3;
  enemy['order/obj/id']=truck.id;enemy['order/obj/player']=0;enemy['order/obj/type']=0;
  enemy['order/pos']=truck.position.slice(0,2);enemy['orderList/size']=0;
  enemy.moveStatus=0;enemy.moveSpeed=0;enemy.pathIndex=0;enemy.pathLength=0;enemy['visible/0']=255;
  const removed=[];for(const[k,t]of Object.entries(s))if(t.player===0&&t.name==='GuardTower1'){removed.push(t.id);delete s[k];}
  const replacements=Object.values(d).filter(t=>t.player===0&&t.id!==truck.id&&t.droidType===3);
  for(const[t,p]of replacements.map((t,i)=>[t,[[55,70],[57,70],[55,74]][i]])){t.position=[p[0]*128+64,p[1]*128+64,128];}
  v.files['droid.json']=encoded(d);v.files['struct.json']=encoded(s);delete v.droids;
  v.fixture={seeded:true,description:'One existing builder at1health; one existing enemy positioned nearby with ATTACK order; five guard towers removed only from fixture to permit the casualty; three original replacement trucks placed in the connected rear base.',truckId:truck.id,enemyId:enemy.id,originalEnemy,replacements:replacements.map(t=>({id:t.id,position:t.position})),removedGuardTowerIDs:removed,jobs:v.jobs};
  fs.writeFileSync(file,JSON.stringify(v));fs.writeFileSync(path.join(q.out,'casualty-fixture.json'),JSON.stringify(v.fixture,null,2));console.log(JSON.stringify(v.fixture));
}
async function restore(){
  const v=JSON.parse(fs.readFileSync(file,'utf8')),c=await q.connect();
  try{
    await c.wait('window.WarzoneBriefing?.report().phase==="released"||(window.WarzoneSavedGames?.loading&&WarzoneSavedGames.ready)',15000);
    await c.host(`(()=>{const f=document.getElementById('warzone-game-frame');f.focus({preventScroll:true});f.contentDocument.getElementById('canvas').focus({preventScroll:true});return true})()`);
    await c.paint();
    const payload=JSON.stringify({path:v.path,files:v.files});
    await c.evaluate(`(()=>{const v=${payload},f=LaunchedModule.FS;f.mkdirTree(v.path);for(const[n,b]of Object.entries(v.files))f.writeFile(v.path+'/'+n,new Uint8Array(b));return true})()`);
    await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
    await c.wait(`__warzoneCommands.report().snapshot?.jobs.some(j=>j.id===${JSON.stringify(v.jobs[0])})`,15000);
    await c.wait(`!__warzoneCommands.report().snapshot?.trucks.some(t=>t.id===${v.fixture.truckId})`,12000);
    const state=await c.evaluate('({commands:__warzoneCommands.report(),wave:__warzoneTowersWaves.report(),notices:WarzoneNotices.report(),draw:WarzoneBuildDisplay.report()})');
    const installed=q.adb('shell','pm','path',q.packageId).toString().trim().replace(/^package:/,'');
    const sha=q.adb('shell','sha256sum',installed).toString().split(/\s/)[0];
    fs.writeFileSync(path.join(q.out,process.env.WZ_QA_CASE||'casualty-observed')+'.json',JSON.stringify({installedAPK_SHA256:sha,fixture:v.fixture,state},null,2));
    q.screen(process.env.WZ_QA_CASE||'casualty-observed');
    console.log(JSON.stringify({observedNativeDeath:true,trucks:state.commands.snapshot.trucks,jobs:state.commands.snapshot.jobs,notices:state.notices}));
    if(process.argv.includes('--quiet')){
      const stamp=await c.evaluate(`LaunchedModule.FS.stat(LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave/droid.json').mtime.getTime()`);
      await c.evaluate('__kalaWarzoneTouch.nativePressKey("F7","F7",118);true');
      await c.wait(`LaunchedModule.FS.stat(LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave/droid.json').mtime.getTime()>${stamp}`);
      // The actual casualty above is already recorded. Isolate the subsequent
      // construction check by removing hostile actors/remaining spawn entries
      // from a test-only native checkpoint, without adding units, power or tech.
      const quiet=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',d=JSON.parse(f.readFile(p+'/droid.json',{encoding:'utf8'})),s=JSON.parse(f.readFile(p+'/scriptstate.json',{encoding:'utf8'})),removed=[];for(const[k,v]of Object.entries(d))if(v.player!==0){removed.push(v.id);delete d[k];}for(const g of Object.values(s))if(g&&g.SaveLoad_objects)for(const o of g.SaveLoad_objects)if(Array.isArray(o.queue))o.queue=[];f.writeFile(p+'/droid.json',JSON.stringify(d));f.writeFile(p+'/scriptstate.json',JSON.stringify(s));return{removedHostileIDs:removed,description:'Post-casualty construction-only checkpoint; remaining hostile actors and scheduled spawn entries removed only in the emulator fixture.'}})()`);
      await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
      await c.wait('__warzoneTowersWaves.report().snapshot.enemyDroids===0',15000);
      fs.writeFileSync(path.join(q.out,'quiet-fixture.json'),JSON.stringify(quiet,null,2));
      console.log('Prepared isolated post-casualty construction checkpoint');
    }
  }finally{c.close();}
}
(async()=>{if(process.argv[2]==='seed')seed();else if(process.argv[2]==='restore')await restore();else throw Error('Use seed or restore');})().catch(e=>{console.error(e);process.exitCode=1});
