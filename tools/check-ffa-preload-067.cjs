'use strict';
/* Replays actual loader paths and wrapper preRun against a strict filesystem.
 * createDataFile NEVER creates a directory. This is not an engine/gameplay test.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),relative='app/src/main/assets/warzone/warzone2100-ffa.js';
const loader=fs.readFileSync(path.join(root,relative),'utf8'),html=fs.readFileSync(path.join(root,'app/src/main/assets/warzone/index-ffa.html'),'utf8');
const packageData=fs.readFileSync(path.join(root,'app/src/main/assets/warzone/warzone2100-ffa.data'));
const start=loader.indexOf('loadPackage({')+'loadPackage('.length;assert(start>'loadPackage('.length);
let depth=0,quoted=false,escape=false,end=-1;
for(let i=start;i<loader.length;i++){
  const c=loader[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;}
  else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){end=i+1;break;}
}
assert(end>start);const metadata=JSON.parse(loader.slice(start,end));
const fixedPaths=[...loader.matchAll(/Module\["FS_createPath"\]\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*"),true,true\)/g)].map(match=>[JSON.parse(match[1]),JSON.parse(match[2])]);
assert(fixedPaths.length>100,'Read real original compiled-loader directory calls');
const prepareStart=html.indexOf('function prepareFfaModule('),prepareEnd=html.indexOf('    function constructWZModuleConfig(',prepareStart);
assert(prepareStart>=0&&prepareEnd>prepareStart);const generatedPrepare=html.slice(prepareStart,prepareEnd);
assert(!generatedPrepare.includes('FFA_NATIVE_PACKAGE_DIRECTORIES'));
const removeStart=loader.indexOf('function removeRunDependency('),removeEnd=loader.indexOf('function abort(',removeStart);
assert(removeStart>0&&removeEnd>removeStart);const actualRemoveDependency=loader.slice(removeStart,removeEnd);
const priorPath='scenario/ffa/test-fixtures/preload-before-066.js',prior=fs.readFileSync(path.join(root,priorPath),'utf8');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,priorPath))).digest('hex'),'bc5a13b289d93ea13b37817b45e613062fba9bb8da35ac0ace96338336c2509b');
const config={mode:'ffa',map:'emaj-6p',mapName:'EMAJ-6P',players:6,bots:5,level:'FFA-EMAJ6-T1',difficulty:'hard',botType:'cobra',player:0};
const structureRecord=metadata.files.find(row=>row.filename==='/data/mp/stats/structure.json');assert(structureRecord);
const structureBytes=packageData.subarray(structureRecord.start,structureRecord.end),stockStructures=JSON.parse(structureBytes.toString('utf8'));
function strictFS(){
  const dirs=new Set(['/']),files=new Map(),writes=[];
  return{dirs,files,writes,
    mkdirTree(name){assert(name.startsWith('/'));let current='';for(const part of name.split('/').filter(Boolean)){assert(part!=='.'&&part!=='..');current+='/'+part;dirs.add(current);}},
    createPath(parent,name){assert(dirs.has(parent),'Missing original createPath parent '+parent);const full=path.posix.join(parent,name);dirs.add(full);},
    createDataFile(full,bytes=null){const parent=path.posix.dirname(full);if(!dirs.has(parent)){const e=Error('ENOENT '+parent+' while creating '+full);e.code='ENOENT';throw e;}assert(!files.has(full),'Duplicate package file '+full);files.set(full,bytes);},
    analyzePath(full){return{exists:dirs.has(full)||files.has(full)};},
    readFile(full,options){assert(files.has(full)&&files.get(full)!==null,'Read must use actual preloaded bytes: '+full);const value=Buffer.from(files.get(full));return options?.encoding?value.toString(options.encoding):new Uint8Array(value);},
    writeFile(full,data){assert(dirs.has(path.posix.dirname(full)),'Config write parent must exist');assert(files.has(full),'Config file must be installed first');files.set(full,data);writes.push(full);}
  };
}
function replay(source,selectedConfig=config){
  const FS=strictFS(),module={FS,preRun:[],calledRun:false};const context=vm.createContext({JSON,Array,Error});vm.runInContext(source,context);context.prepareFfaModule(module,selectedConfig);
  module.preRun.forEach(callback=>callback(module));fixedPaths.forEach(([parent,name])=>FS.createPath(parent,name));
  const missing=[];for(const file of metadata.files){try{FS.createDataFile(file.filename,file.filename===structureRecord.filename?structureBytes:null);}catch(error){assert.equal(error.code,'ENOENT');missing.push({file:file.filename,parent:path.posix.dirname(file.filename)});}}
  return{module,FS,missing};
}
function finishPreload(loaded,onNativeContinuation=()=>{}){
  let continued=false;
  const context=vm.createContext({Module:loaded.module,runDependencies:1,dependenciesFulfilled(){
    // This is a host observation point, not C++ execution. The exact compiled
    // removeRunDependency body must finish the wrapper's real monitor first.
    assert.equal(loaded.module.ffaConfigInstalled,true);onNativeContinuation();continued=true;loaded.module.calledRun=true;
  }});
  vm.runInContext(actualRemoveDependency,context);context.removeRunDependency('datafile_src/warzone2100.data');
  assert(continued,'Actual runtime dependency handler reaches continuation only after configuration');
}
const before=replay(prior),oldMissingParents=[...new Set(before.missing.map(value=>value.parent))].sort();
assert.deepEqual(oldMissingParents,JSON.parse(fs.readFileSync(path.join(root,'app/src/main/assets/ffa-maps.json'),'utf8')).maps.filter(map=>map.id!=='emag').map(map=>'/data/mp/multiplay/maps/'+map.mapDirectory).sort(),'Actual prior wrapper misses every new map directory');
const after=replay(generatedPrepare);assert.equal(after.missing.length,0,'Every actual native package parent exists before data-file creation');
const parents=[...new Set(metadata.files.map(row=>path.posix.dirname(row.filename)))].sort();
const proof=JSON.parse(fs.readFileSync(path.join(root,'scenario/ffa/PACKAGE.json'),'utf8'));assert.deepEqual(proof.nativePreloadDirectories,parents,'Generated preRun directories derive from full VFS metadata');
finishPreload(after);assert.equal(after.module.ffaConfigInstalled,true);assert.equal(after.FS.writes.length,3);
for(const file of after.FS.writes)assert.deepEqual(JSON.parse(after.FS.files.get(file)),config,'Map-specific config remains installed before native startup');
const mapStructureLimits=[];
for(const map of proof.maps){
  const limits=proof.authoredStructureLimits[map.id],selected={...config,map:map.id,mapName:map.name,players:map.players,bots:map.bots,level:map.level,structureLimits:limits};
  const loaded=replay(generatedPrepare,selected);let atContinuation;
  finishPreload(loaded,()=>{atContinuation=JSON.parse(loaded.FS.readFile(structureRecord.filename,{encoding:'utf8'}));});
  const actual=JSON.parse(loaded.FS.readFile(structureRecord.filename,{encoding:'utf8'}));
  assert.deepEqual(atContinuation,actual,'Required stats are already installed before actual dependency continuation');
  const changed=Object.keys(stockStructures).filter(id=>JSON.stringify(stockStructures[id])!==JSON.stringify(actual[id]));
  if(map.id==='contact'){
    assert.deepEqual(limits,{A0PowerGenerator:14});assert.deepEqual(changed,['A0PowerGenerator']);
    assert.deepEqual(actual.A0PowerGenerator.userLimits,[0,14,14]);
    const expected={...stockStructures.A0PowerGenerator,userLimits:[0,14,14]};assert.deepEqual(actual.A0PowerGenerator,expected,'Only the initial generator limit tuple changes');
    assert.equal(loaded.FS.writes[0],structureRecord.filename,'Stats override precedes config completion/native startup');
  }else{assert.deepEqual(limits,{});assert.deepEqual(actual,stockStructures);assert(!loaded.FS.writes.includes(structureRecord.filename),'Unrelated map stats are never rewritten');}
  assert.equal(loaded.module.calledRun,true);mapStructureLimits.push({id:map.id,overrides:limits,changedStructureRecords:changed,installedBeforeNativeStartup:true});
}
const report={version:'0.67',passed:true,checksPassed:mapStructureLimits.length,emulatorUsed:false,actualNativeEngineExecuted:false,strictFilesystemNoImplicitParentCreation:true,
  priorWrapperReproducesENOENT:true,priorMissingParents:oldMissingParents,checkedPackageFiles:metadata.files.length,checkedParentDirectories:parents.length,
  originalCompiledPathCalls:fixedPaths.length,allMapChallengeScriptParentsCovered:true,configMirrorsInstalledBeforeNativeStartup:true,
  mapStructureLimits,
  actualCompiledRemoveDependencyOrderingVerified:true,
  sources:[relative,'app/src/main/assets/warzone/warzone2100-ffa.data','app/src/main/assets/warzone/index-ffa.html','scenario/ffa/runtime-prepare.js','tools/build-ffa-package.py','tools/check-ffa-preload-067.cjs',priorPath].map(name=>({path:name,bytes:fs.statSync(path.join(root,name)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}))};
fs.writeFileSync(path.join(root,'archive/ffa-maps-0.67-preload-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,priorMissingParents:oldMissingParents,packageFiles:metadata.files.length,parents:parents.length,nativeEngineExecuted:false,actualDependencyHandlerExecuted:true}));
