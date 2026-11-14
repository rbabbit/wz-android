/* Execute the real Towers locateFile function and validate the paired binaries. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets/warzone');
const read=name=>fs.readFileSync(path.join(assets,name)),hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const html=read('index.html').toString(),start=html.indexOf("Module['locateFile'] = function(path, prefix) {");
assert(start>=0);const end=html.indexOf('\n      }',start);assert(end>start);
const context={Module:{},WZ_DATA_FILES_URL_HOST:'https://assets/',WZ_DATA_FILES_URL_SUBDIR:'warzone/',WZ_MUSIC_PKG_SUBDIR:'music/',WZ_TERRAIN_PKG_SUBDIR:'terrain/',console:{debug(){}}};
vm.runInNewContext(html.slice(start,end+'\n      }'.length),context);
const locate=context.Module.locateFile;
assert.equal(locate('warzone2100.wasm','/warzone/'),'/warzone/warzone2100-towers-052.wasm');
assert.equal(locate('warzone2100.data','ignored/'),'https://assets/warzone/warzone2100.data');
assert.equal(locate('warzone2100-music.data','ignored/'),'https://assets/warzone/music/warzone2100-music.data');
assert.equal(locate('warzone2100-terrain-classic.data','ignored/'),'https://assets/warzone/terrain/warzone2100-terrain-classic.data');
assert.equal(locate('ordinary.bin','/warzone/'),'/warzone/ordinary.bin');
assert(html.includes('src="warzone2100-towers-052.js"'));
assert(read('index-duel.html').toString().includes('src="warzone2100-duel.js"'));
assert(read('index-campaign.html').toString().includes('src="warzone2100-campaign.js"'));
for(const filename of ['warzone2100.wasm','warzone2100-towers-052.wasm'])assert(WebAssembly.validate(read(filename)),filename);
const proof=JSON.parse(fs.readFileSync(path.join(root,'archive/native-unit-loss-0.52/native-payload.json')));
const appended=JSON.parse(fs.readFileSync(path.join(root,'archive/loss-builders-0.52-payload.json')));
assert(appended.passed&&appended.originalDataPrefixUnchanged);
const data=read('warzone2100.data');
assert.equal(data.length,appended.dataBytes);
assert.equal(hash(data),appended.dataSHA256);
assert.equal(hash(data.subarray(0,appended.baselineDataBytes)),proof.preservedFiles['warzone2100.data']);
assert.equal(appended.baselineDataSHA256,proof.preservedFiles['warzone2100.data']);
for(const [filename,digest] of Object.entries(proof.preservedFiles))if(filename!=='warzone2100.data')assert.equal(hash(read(filename)),digest,filename);
const before=fs.readFileSync(path.join(root,appended.nativeLoaderBeforeScenario.path));
assert.equal(hash(before),proof.towersLoader.sha256);
assert.equal(hash(before),appended.nativeLoaderBeforeScenario.sha256);
const loader=read(proof.towersLoader.file);
assert.equal(hash(loader),appended.loaderSHA256);
function packageParts(source){
  const matches=[...source.matchAll(/\bloadPackage\(\s*\{\s*(?:files|"files")\s*:/g)];assert.equal(matches.length,1);
  const start=matches[0].index,brace=source.indexOf('{',start);let depth=0,quote=null,escaped=false,close=-1;
  for(let i=brace;i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;}
    else if(c==='"'||c==="'")quote=c;
    else if(c==='{')depth++;
    else if(c==='}'&&!--depth){close=i;break;}
  }
  assert(close>brace);const suffix=source.slice(close+1).match(/^\s*\)/);assert(suffix);
  const end=close+1+suffix[0].length;
  const metadata=JSON.parse(source.slice(brace,close+1).replace(/([{,]\s*)([A-Za-z_][A-Za-z_0-9]*)\s*:/g,'$1"$2":'));
  return {body:source.slice(0,start)+'PACKAGE_INDEX'+source.slice(end),metadata};
}
const originalPackage=packageParts(before.toString()),currentPackage=packageParts(loader.toString());
assert.equal(currentPackage.body,originalPackage.body);
assert.equal(hash(Buffer.from(currentPackage.body)),appended.runtimeBodySHA256);
assert.equal(currentPackage.metadata.remote_package_size,data.length);
assert.equal(originalPackage.metadata.remote_package_size,appended.baselineDataBytes);
assert.equal(currentPackage.metadata.files.length,originalPackage.metadata.files.length);
const previousFiles=new Map(originalPackage.metadata.files.map(row=>[row.filename,row]));
let changedFiles=0,unchangedFiles=0;
for(const row of currentPackage.metadata.files){
  const old=previousFiles.get(row.filename);assert(old,'Unexpected virtual file '+row.filename);
  assert(Number.isInteger(row.start)&&Number.isInteger(row.end)&&row.start>=0&&row.start<=row.end&&row.end<=data.length);
  if(row.filename===appended.onlyChangedVirtualFile){
    changedFiles++;assert.equal(row.start,appended.baselineDataBytes);assert.equal(row.end,data.length);
    const source=fs.readFileSync(path.join(root,appended.sourcePath));assert.equal(hash(source),appended.sourceSHA256);
    assert.deepEqual(data.subarray(row.start,row.end),source);
  }else{assert.deepEqual(row,old);unchangedFiles++;}
}
assert.equal(changedFiles,1);assert.equal(unchangedFiles,appended.unchangedOtherVirtualFiles);
assert.equal(hash(read(proof.towersWASM.file)),proof.towersWASM.sha256);
const result={version:'0.52',passed:true,actualLocateFileExecuted:true,routingCases:5,towersNewPair:true,campaignAndDuelOriginalPairPreserved:true,bothWASMBinariesValidate:true,originalDataPrefixBytes:appended.baselineDataBytes,originalDataPrefixUnchanged:true,nativeGeneratedBodyUnchanged:true,matchedNativeLoaderBeforeScenarioSHA256:hash(before),onlyChangedVirtualFile:appended.onlyChangedVirtualFile,unchangedOtherVirtualFiles:unchangedFiles,deliveryTowersLoaderSHA256:hash(loader),deliveryDataSHA256:hash(data),emulatorUsed:false};
fs.writeFileSync(path.join(root,'archive/native-unit-loss-0.52/runtime-isolation-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
