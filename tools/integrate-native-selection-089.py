"""Install only source-built0.89 native pairs with exact retained data/hooks.

This follows the retained offline/MP integration recipes. It adds no new
generated-code behavior; new display behavior comes exclusively from C++.
"""
from pathlib import Path
from hashlib import sha256
import argparse,json,re,runpy,shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-089'
def digest(b):return sha256(b).hexdigest()
def filehash(p):return digest(p.read_bytes())
def jwrite(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--baseline-project',type=Path,default=Path('/mnt/c/timerApp/candidates/play-store-0.87-20261116'))
 p.add_argument('--retained-project',type=Path,default=Path('/mnt/c/timerApp/wz-towers-lab'))
 a=p.parse_args();record=json.loads((OUT/'native-build.json').read_text());assert record['passed'] and record['warmSourcesObjectsLibrariesAndRawOutputsUnchanged']
 for link in record['links']:
  for item in link['raw']:
   assert filehash(OUT/'raw'/link['variant']/item['file'])==item['sha256'],'Recorded raw source-built pair changed'
 recipes=OUT/'recipes';recipes.mkdir(parents=True,exist_ok=True)
 for name in ['integrate-native-runtime.py','integrate-multiplayer-native-082.py','build-native-blueprint.sh']:
  shutil.copy2(a.retained_project/'tools'/name,recipes/name)
 helper=runpy.run_path(str(recipes/'integrate-native-runtime.py'));package=helper['package_call'];reports=[]
 old_report=json.loads((OUT/'runtime-integration.json').read_text()) if (OUT/'runtime-integration.json').is_file() else {}
 old_variants={row['variant']:row for row in old_report.get('variants',[])}
 assets=ROOT/'app/src/main/assets';base=a.baseline_project/'app/src/main/assets'
 configs=[('shared','warzone/warzone2100.js','warzone/warzone2100.wasm','warzone/warzone2100.data'),
          ('towers','warzone/warzone2100-towers-052.js','warzone/warzone2100-towers-052.wasm','warzone/warzone2100.data'),
          ('multiplayer','multiplayer/warzone2100.js','multiplayer/warzone2100.wasm','multiplayer/warzone2100.data')]
 original_assets={p:filehash(assets/p) for _,j,w,d in configs for p in [j,w,d]}
 for variant,jsname,wasmname,dataname in configs:
  raw=(OUT/'raw'/variant/'warzone2100.js').read_text();wasm=(OUT/'raw'/variant/'warzone2100.wasm').read_bytes()
  baseline=(base/jsname).read_text();data=(base/dataname).read_bytes()
  old=old_variants.get(variant,{})
  assert filehash(assets/jsname) in {filehash(base/jsname),old.get('installedJS_SHA256')} and filehash(assets/wasmname) in {filehash(base/wasmname),old.get('installedWASM_SHA256')},'Candidate runtime changed before integration'
  assert digest(data)==filehash(assets/dataname)
  frozen=package(baseline);fresh=package(raw)
  # Shared0.51 intentionally indexes the preserved prefix of the physical
  # data file; Towers0.52 indexes its appended command tail. Keep both indexes
  # byte-identical instead of silently extending the shared profile's index.
  assert 0<frozen[3]['remote_package_size']<=len(data)
  paths=[x['filename'] for x in frozen[3]['files']];assert len(paths)==len(set(paths))
  for item in frozen[3]['files']:assert 0<=item['start']<=item['end']<=len(data)
  result=raw[:fresh[0]]+frozen[2]+raw[fresh[1]:]
  pattern=r'Module\["FS_createPath"\]\("[^"\\]*","[^"\\]*",true,true\);'
  existing=set(re.findall(pattern,result));missing=[s for s in re.findall(pattern,baseline) if s not in existing]
  inserted=''
  if missing:
   declarations=list(re.finditer(pattern,result));assert declarations
   position=declarations[-1].end();inserted=''.join(missing);result=result[:position]+inserted+result[position:]
  contract=helper['verify_runtime_contract'](baseline,raw)
  normalized=result
  if variant!='multiplayer':
   hooks=re.findall(r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;',baseline,re.S)
   assert len(hooks)==1 and 'BroadcastChannel' in hooks[0] and 'BNTECH' in hooks[0] and 'BNQUEUE' in hooks[0]
   original='var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
   assert result.count(original)==1
   result=result.replace(original,hooks[0],1)
   normalized=result.replace(hooks[0],original,1)
   integrations=['exact retained frozen package index','exact retained worker-output hook','retained preload-directory declarations']
  else:
   assert digest(data)=='9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
   gate='if(flags&32){return-2}';replacement='flags&=~32;';assert result.count(gate)==1
   result=result.replace(gate,replacement,1)
   marker='preMain();readyPromiseResolve?.(Module);var noInitialRun=false;'
   callback='preMain();Module["onRuntimeInitialized"]?.();readyPromiseResolve?.(Module);var noInitialRun=false;'
   assert result.count(marker)==1;result=result.replace(marker,callback,1)
   worker="globalThis.assert=(v,m)=>{if(!v)throw Error(m||'Emscripten assertion failed');};if(typeof importScripts==='function')importScripts('socket-bridge.js','lobby-http.js');\n"
   assert baseline.startswith(worker)
   result=worker+result
   normalized=result[len(worker):].replace(callback,marker,1).replace(replacement,gate,1)
   integrations=['exact retained official frozen package index','retained preload-directory declarations','existing Android worker transport imports','existing AI_ADDRCONFIG gate integration','existing runtime-ready callback']
  parsed=package(normalized);normalized=normalized[:parsed[0]]+'FROZEN_PACKAGE_INDEX'+normalized[parsed[1]:]
  if inserted:normalized=normalized.replace(inserted,'',1)
  normalized_raw=raw[:fresh[0]]+'FROZEN_PACKAGE_INDEX'+raw[fresh[1]:]
  assert normalized==normalized_raw,'Generated code changed outside retained integrations'
  final=package(result);assert final[2]==frozen[2] and final[3]==frozen[3]
  # Prove every exact preload directory is created in parent-first order.
  import posixpath
  known={'/'}
  for call in re.finditer(r'Module\["FS_createPath"\]\(("[^"\\]*"),("[^"\\]*"),true,true\);',result):
   parent,name=json.loads('['+call.group(1)+','+call.group(2)+']');parent=posixpath.normpath('/'+parent.lstrip('/'));assert parent in known
   current=parent
   for component in name.split('/'):
    if component:current=posixpath.normpath(posixpath.join(current,component));known.add(current)
  # Authored offline map parents have always been created by the page's
  # existing blockNightPrepareCustomMapDirectory preRun hook, not raw glue.
  # Validate those retained declarations too; do not add a second runtime hook.
  wrapper_names={'shared':['warzone/index-campaign.html','warzone/index-ffa.html'],
                 'towers':['warzone/index.html'],'multiplayer':[]}[variant]
  wrapper_proof=[]
  directory_call=re.compile(r'Module\.FS_createPath\(\s*([\'"])(.*?)\1\s*,\s*([\'"])(.*?)\3\s*,\s*true\s*,\s*true\s*\)')
  for wrapper_name in wrapper_names:
   old_wrapper=(base/wrapper_name).read_text();current_wrapper=(assets/wrapper_name).read_text()
   calls=[(m.group(2),m.group(4)) for m in directory_call.finditer(old_wrapper)]
   assert calls==[(m.group(2),m.group(4)) for m in directory_call.finditer(current_wrapper)],'Authored preRun directory declarations changed'
   wrapper_known=set(known)
   for parent,name in calls:
    parent=posixpath.normpath('/'+parent.lstrip('/'));assert parent in wrapper_known
    current=parent
    for component in name.split('/'):
     if component:current=posixpath.normpath(posixpath.join(current,component));wrapper_known.add(current)
   absent=sorted({posixpath.dirname(item['filename']) for item in final[3]['files'] if posixpath.dirname(item['filename']) not in wrapper_known})
   assert not absent,(variant,wrapper_name,absent)
   wrapper_proof.append({'path':wrapper_name,'existingDirectoryCalls':len(calls),'allFrozenFileParentsAvailable':True,'declarationsUnchanged':True})
  if not wrapper_names:assert all(posixpath.dirname(item['filename']) in known for item in final[3]['files'])
  assert wasm.startswith(b'\0asm')
  integrated=OUT/'integrated'/variant;integrated.mkdir(parents=True,exist_ok=True)
  (integrated/'warzone2100.js').write_text(result,newline='\n');(integrated/'warzone2100.wasm').write_bytes(wasm)
  (assets/jsname).write_bytes((integrated/'warzone2100.js').read_bytes());(assets/wasmname).write_bytes(wasm)
  assert filehash(assets/dataname)==digest(data)
  row={'variant':variant,'passed':True,'baselineJS':{'path':jsname,'sha256':digest(baseline.encode())},
       'baselineWASM':{'path':wasmname,'sha256':filehash(base/wasmname)},'frozenData':{'path':dataname,'sha256':digest(data),'bytes':len(data)},
       'rawJS_SHA256':digest(raw.encode()),'rawWASM_SHA256':digest(wasm),'installedJS_SHA256':filehash(assets/jsname),'installedWASM_SHA256':filehash(assets/wasmname),
       'frozenPackageIndexSHA256':digest(frozen[2].encode()),'frozenVirtualFiles':len(paths),'unindexedFrozenDataTailBytes':len(data)-frozen[3]['remote_package_size'],'insertedRetainedDirectoryDeclarations':len(missing),
       'retainedWrapperDirectoryProof':wrapper_proof,'generatedCodeUnchangedOutsideRetainedIntegrations':True,'integrations':integrations,'runtimeContract':contract}
  jwrite(integrated/'runtime-integration.json',row);reports.append(row)
  print(json.dumps({'installed':variant,'jsSHA256':row['installedJS_SHA256'],'wasmSHA256':row['installedWASM_SHA256'],'frozenDataUnchanged':True}),flush=True)
 # Campaign/FFA/deferred Duel are complete generated loaders, not thin aliases.
 # They all resolve shared0.51 WASM and must derive from the matching new raw JS.
 aliases=[]
 raw=(OUT/'raw/shared/warzone2100.js').read_text();fresh=package(raw)
 original_output='var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
 original_data='var REMOTE_PACKAGE_BASE="warzone2100.data";'
 old_aliases={row['alias']:row for row in old_report.get('sharedLoaderAliases',[])}
 for alias in ['campaign','ffa','duel']:
  jsname='warzone/warzone2100-'+alias+'.js';dataname='warzone/warzone2100-'+alias+'.data';wrapper='warzone/index-'+alias+'.html'
  baseline=(base/jsname).read_text();data=(base/dataname).read_bytes();frozen=package(baseline)
  assert filehash(assets/jsname) in {filehash(base/jsname),old_aliases.get(alias,{}).get('installedJS_SHA256')},'Unrecognized alias loader edit'
  assert digest(data)==filehash(assets/dataname) and 0<frozen[3]['remote_package_size']<=len(data)
  assert all(0<=item['start']<=item['end']<=len(data) for item in frozen[3]['files'])
  assert len(frozen[3]['files'])==len({item['filename'] for item in frozen[3]['files']})
  result=raw[:fresh[0]]+frozen[2]+raw[fresh[1]:]
  pattern=r'Module\["FS_createPath"\]\("[^"\\]*","[^"\\]*",true,true\);'
  existing=set(re.findall(pattern,result));missing=[s for s in re.findall(pattern,baseline) if s not in existing]
  inserted=''
  if missing:
   declarations=list(re.finditer(pattern,result));assert declarations
   position=declarations[-1].end();inserted=''.join(missing);result=result[:position]+inserted+result[position:]
  hooks=re.findall(r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;',baseline,re.S)
  assert len(hooks)==1 and 'BroadcastChannel' in hooks[0] and 'BNTECH' in hooks[0] and 'BNQUEUE' in hooks[0]
  data_names=re.findall(r'var REMOTE_PACKAGE_BASE="[^"\\]+";',baseline)
  assert len(data_names)==1 and result.count(original_data)==1 and result.count(original_output)==1
  result=result.replace(original_data,data_names[0],1).replace(original_output,hooks[0],1)
  # Every byte outside the exact old package/output/data-name/directory adapters
  # must equal the NEW shared raw generated runtime, including all ASM_CONSTS.
  normalized=result.replace(data_names[0],original_data,1).replace(hooks[0],original_output,1)
  parsed=package(normalized);normalized=normalized[:parsed[0]]+'FROZEN_PACKAGE_INDEX'+normalized[parsed[1]:]
  if inserted:normalized=normalized.replace(inserted,'',1)
  normalized_raw=raw[:fresh[0]]+'FROZEN_PACKAGE_INDEX'+raw[fresh[1]:]
  assert normalized==normalized_raw,'Alias generated program differs from its linked raw JS'
  assert package(result)[2]==frozen[2]
  assert (assets/wrapper).read_bytes()==(base/wrapper).read_bytes(),'Alias entrypoint changed'
  assert 'src="warzone2100-'+alias+'.js"' in (assets/wrapper).read_text()
  assert 'warzone2100-towers-052.wasm' not in (assets/wrapper).read_text()
  assert 'var ASM_CONSTS=' in result and 'var ASM_CONSTS=' in raw
  # Numeric addresses and each function body come from the same new raw source;
  # the stronger whole-program normalization above verifies the entire table.
  table=lambda s: s[s.index('var ASM_CONSTS='):s.index('var ASM_CONSTS=')+s[s.index('var ASM_CONSTS='):].index(';function')]
  assert table(result)==table(raw)
  integrated=OUT/'integrated'/('shared-'+alias);integrated.mkdir(parents=True,exist_ok=True)
  (integrated/'warzone2100.js').write_text(result,newline='\n');(assets/jsname).write_bytes((integrated/'warzone2100.js').read_bytes())
  row={'alias':alias,'passed':True,'baselineJS':{'path':jsname,'sha256':filehash(base/jsname)},
       'installedJS_SHA256':filehash(assets/jsname),'sharedWASMPath':'warzone/warzone2100.wasm',
       'sharedWASM_SHA256':filehash(assets/'warzone/warzone2100.wasm'),'rawSharedJS_SHA256':digest(raw.encode()),
       'frozenData':{'path':dataname,'sha256':digest(data),'bytes':len(data)},
       'frozenPackageIndexSHA256':digest(frozen[2].encode()),'remotePackageBaseDeclaration':data_names[0],
       'frozenWorkerOutputHookSHA256':digest(hooks[0].encode()),'insertedRetainedDirectoryDeclarations':len(missing),
       'entrypoint':{'path':wrapper,'sha256':filehash(assets/wrapper),'unchanged':True},
       'generatedProgramIncludingASM_CONSTSMatchesRawShared':True,'ASM_CONSTS_SHA256':digest(table(result).encode()),
       'runtimeContract':helper['verify_runtime_contract'](baseline,raw)}
  jwrite(integrated/'runtime-integration.json',row);aliases.append(row)
  print(json.dumps({'installedAlias':alias,'jsSHA256':row['installedJS_SHA256'],'sharedWASM_SHA256':row['sharedWASM_SHA256']}),flush=True)
 protocol=(Path(record.get('cacheRoots',{}).get('multiplayer','/home/punkech/wz-mp-070'))/'build/lib/netplay/netplay_config.h')
 if protocol.is_file():
  text=protocol.read_text();assert 'NETCODE_VERSION_MINOR = 104' in text
  (OUT/'proof/protocol-header.h').write_text(text)
 jwrite(OUT/'runtime-integration.json',{'passed':True,'nativeSourceBuildRecord':'native-build.json','variants':reports,'sharedLoaderAliases':aliases,'everySharedCoreLoaderPaired':True,'dataUnchanged':True,'protocol':[16384,104],'noWASMBinaryPatching':True})
if __name__=='__main__':main()
