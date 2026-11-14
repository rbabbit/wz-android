/* Five focused source/VM groups with mocked native fields; no engine execution. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),SOURCE='scenario/warzone-towers-commands.js';
const source=fs.readFileSync(path.join(ROOT,SOURCE),'utf8');
const sandbox={namespace(){},includeJSON(){return {buildings:[],components:{}};},BUILT:1,
  DROID_CONSTRUCT:3,DROID_REPAIR:4,DROID_COMMAND:5,DROID_ECM:6,DROID_SENSOR:7,
  getDroidProduction(factory){return factory.virtual;}};
vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:SOURCE});
const normalize=sandbox.wtcmd_currentProduction,observe=sandbox.wtcmd_productionObservation;
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(system='construct',equipment='Spade1Mk1',type=sandbox.DROID_CONSTRUCT,weapons=[]){
  const design={fullname:'Unit · F9',name:'',body:'Body1REC',propulsion:'wheeled01',droidType:type,
    templateId:117,construct:'ZNULLCONSTRUCT',repair:'ZNULLREPAIR',brain:'ZNULLBRAIN',ecm:'ZNULLECM',sensor:'ZNULLSENSOR',weapons,cost:50,points:100};
  if(system)design[system]=equipment;
  return {id:9,status:1,virtual:{name:'Unit · F9',body:design.body,propulsion:design.propulsion,droidType:type,
    weapons:weapons.map(id=>({id}))},towersProduction:{active:true,nativeQueueEmpty:true,templateId:117,
    currentName:'Unit · F9',timeStarted:1000,totalBuildPoints:100,remainingBuildPoints:70,buildPointsPerSecond:10,
    state:'building',subjectDesign:design}};
}
const activeFor=design=>({id:'app-job',started:-999,design:plain(design)}),checks=[];
function check(name,fn){fn();checks.push({name,passed:true});}
check('Constructor recovers the exact native Spade and restores a matching managed queue count',()=>{
  const factory=fixture(),current=normalize(factory);
  assert.deepStrictEqual(plain(current.turrets),['Spade1Mk1']);assert.strictEqual(current.construct,'Spade1Mk1');
  assert.strictEqual(current.nativeTemplateId,117);assert.strictEqual(current.name,'Unit');
  const result=observe(factory,current,activeFor(current));assert.strictEqual(result.queueKnown,true);
  assert.strictEqual(result.progress.ratio,.3);assert.strictEqual(result.progress.remainingSeconds,7);
  assert.strictEqual(result.progress.currentId,'9:117:1000');
});
check('Repair, sensor, ECM, command-brain and cyborg system designs keep native equipment without name guesses',()=>{
  for(const [field,id,type,weapons] of [['repair','RepairTurret',sandbox.DROID_REPAIR,[]],
    ['sensor','SensorTurret',sandbox.DROID_SENSOR,[]],['ecm','ECMTurret',sandbox.DROID_ECM,[]],
    ['brain','CommandBrain',sandbox.DROID_COMMAND,['LinkedCommandGun']]]){
    const factory=fixture(field,id,type,weapons),current=normalize(factory);
    assert.deepStrictEqual(plain(current.turrets),[id]);assert.strictEqual(current[field],id);
    assert.deepStrictEqual(plain(current.weapons),weapons);assert.strictEqual(observe(factory,current,activeFor(current)).queueKnown,true);
  }
  const cyborg=fixture('construct','CyborgSpade',sandbox.DROID_CONSTRUCT);
  cyborg.towersProduction.subjectDesign.droidType=13;cyborg.virtual.body=cyborg.towersProduction.subjectDesign.body='CyborgBody';
  assert.deepStrictEqual(plain(normalize(cyborg).turrets),['CyborgSpade']);
  assert.strictEqual(normalize(cyborg).droidType,13);
});
check('Weapon designs retain every actual weapon even when their display name resembles a truck',()=>{
  const factory=fixture(null,null,0,['Cannon1Mk1','MG1Mk1']);
  factory.virtual.name=factory.towersProduction.currentName=factory.towersProduction.subjectDesign.fullname='Truck · F9';
  const current=normalize(factory);assert.deepStrictEqual(plain(current.turrets),['Cannon1Mk1','MG1Mk1']);
  assert.strictEqual(current.construct,'ZNULLCONSTRUCT');assert.strictEqual(observe(factory,current,activeFor(current)).queueKnown,true);
});
check('Stale subject identity, mismatched native design and unknown future native orders stay conservative',()=>{
  for(const change of [s=>s.templateId=118,s=>s.fullname='Other · F9',s=>s.body='OtherBody',s=>s.propulsion='OtherPropulsion']){
    const factory=fixture();change(factory.towersProduction.subjectDesign);
    const current=normalize(factory);assert.deepStrictEqual(plain(current.turrets),[]);
    assert.strictEqual(current.nativeTemplateId,undefined);
    assert.strictEqual(observe(factory,current,activeFor({name:'Unit',body:'Body1REC',propulsion:'wheeled01',turrets:['Spade1Mk1']})).queueKnown,false);
  }
  const factory=fixture(),current=normalize(factory);factory.towersProduction.nativeQueueEmpty=false;
  assert.strictEqual(observe(factory,current,activeFor(current)).queueKnown,false);
  factory.towersProduction.templateId=118;
  assert.strictEqual(observe(factory,current,activeFor(current)).progress.available,false);
});
check('Native delta reuses convTemplate within the existing Towers gate and leaves global convDroid unchanged',()=>{
  const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
  const before=read('archive/native-production-0.40/quickjs_backend.cpp'),after=read('archive/native-production-0.41/quickjs_backend.cpp');
  const begin='JSValue convDroid(const DROID *psDroid, JSContext *ctx)\n{',end='//;; ## Base Object';
  assert.strictEqual(before.slice(before.indexOf(begin),before.indexOf(end)),after.slice(after.indexOf(begin),after.indexOf(end)));
  const helper=read('archive/native-production-0.41/production-helper.inc');
  assert(helper.includes('JSValue subjectDesign = convTemplate(subject, ctx);'));
  assert(helper.includes('subjectDesign, "templateId", JS_NewUint32(ctx, subject->multiPlayerID)'));
  assert(helper.includes('fopen("/tmp/warzone-towers-ui-v34", "rb")'));
  assert(!/active\.design/.test(normalize.toString()));
});
const inputs=[SOURCE,'archive/native-production-0.41/production-helper.inc',
  'archive/native-production-0.41/quickjs_backend.cpp','tools/check-production-current-041.cjs'];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex');
const report={version:'0.41',passed:true,emulatorUsed:false,androidRuntimeExecuted:false,gameplayVerified:false,
  scope:'Source and mocked native-field normalization only; no native execution, actual queue or rendered-thumbnail verification.',
  checksPassed:checks.length,checks,sources:inputs.map(file=>({path:file,sha256:digest(file)})),recordedUTC:new Date().toISOString()};
fs.writeFileSync(path.join(ROOT,'archive/production-current-0.41-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks:checks.length,emulatorUsed:false}));
