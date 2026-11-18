"""Source-build native Medium repair policy and protected ALL COMBAT dispatch.

Uses independent objects and three output lineages; both retained warm caches
and all inherited native0.90/0.91 objects remain byte-identical.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,json,os,runpy,shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-093'
H=runpy.run_path(str(ROOT/'tools/build-native-selection-089.py'));digest=H['digest'];jwrite=H['jwrite']

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--baseline-project',type=Path,default=Path('/mnt/c/timerApp/github-staging/wz-android-0.92'))
 p.add_argument('--inherited-090',type=Path,default=Path('/mnt/c/timerApp/candidates/normal-test-0.90-20261116/vendor/native-090'))
 p.add_argument('--inherited-091',type=Path,default=Path('/mnt/c/timerApp/candidates/normal-test-0.91-20261116/vendor/native-091'))
 p.add_argument('--offline-cache',type=Path,default=Path('/home/punkech/wz-blueprint-20261107'))
 p.add_argument('--mp-cache',type=Path,default=Path('/home/punkech/wz-mp-070'))
 p.add_argument('--rebuild',action='store_true');a=p.parse_args()
 assert os.name!='nt'
 previous=OUT/'native-build.json'
 if previous.exists():
  assert a.rebuild,'Explicit --rebuild required to replace an experimental native build'
  (OUT/'proof'/('previous-native-build-'+digest(previous)[:12]+'.json')).write_bytes(previous.read_bytes())
 preparation=json.loads((OUT/'source-preparation.json').read_text());assert preparation['passed']
 baseline=json.loads((a.baseline_project/'vendor/native-091/native-build.json').read_text());assert baseline['passed']
 integration=json.loads((a.baseline_project/'vendor/native-091/runtime-integration.json').read_text())
 for row in integration['variants']:
  assert digest(a.baseline_project/'app/src/main/assets'/row['baselineWASM']['path'])==row['installedWASM_SHA256']
 caches={'offline':a.offline_cache.resolve(),'multiplayer':a.mp_cache.resolve()};before={};env={}
 for family,cache in caches.items():
  before[family]=H['frozen'](cache);env[family]=H['environment'](cache);jwrite(OUT/'proof'/(family+'-cache-before.json'),before[family])
  # The focused order dispatch patch must start from THIS retained family,
  # including any earlier customized gameplay paths, never a guessed stock file.
  for name in ['order.cpp','keybind.cpp']:
   row=next(r for r in preparation['sourceChanges']if r['family']==family and r['path']=='src/'+name)
   assert row['beforeSHA256']==digest(cache/'source/src'/name)
 inherited={};inherited_records=[]
 for generation,family,name in [(90,'offline','src/display3d.cpp'),(90,'multiplayer','src/display3d.cpp'),
                               (90,'offline','src/droid.cpp'),(91,'offline','src/spectatorwidgets.cpp'),(91,'multiplayer','src/spectatorwidgets.cpp')]:
  directory=a.inherited_090 if generation==90 else a.inherited_091
  record=json.loads((directory/'native-build.json').read_text())
  row=next(x for x in record['compileResults']if x['family']==family and x['path']==name)
  original=directory/row['object'];assert digest(original)==row['sha256']
  local=OUT/'objects/inherited'/family/(Path(name).name+'.o');local.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original,local)
  inherited[(family,name)]=local;inherited_records.append(dict(generation=generation,family=family,path=name,
   originalObject=str(original),originalProofSHA256=digest(directory/'native-build.json'),object=str(local.relative_to(OUT)),sha256=digest(local)))
 jobs=[]
 for variant,family,name in [('shared','offline','hci.cpp'),('towers','offline','hci.cpp'),
                            ('offline','offline','order.cpp'),('multiplayer','multiplayer','quickjs_backend.cpp'),('multiplayer','multiplayer','order.cpp'),
                            ('offline','offline','keybind.cpp'),('multiplayer','multiplayer','keybind.cpp')]:
  source=OUT/'source'/family/'src'/name;obj=OUT/'objects'/variant/(name+'.o');obj.parent.mkdir(parents=True,exist_ok=True)
  original,command=H['compile_command'](caches[family],'src/'+name,source,obj)
  command[1:1]=['-iquote',str(OUT/'source/common'),'-iquote',str(ROOT/'vendor/native-091/source/common'),
                '-iquote',str(ROOT/'vendor/native-090/source/common')]+(['-DMOBILE_PLAYERS_SCENARIO91=1']if variant=='towers'else[])
  jobs.append((variant,family,name,original,command,obj))
 proof=dict(version='0.93',upstreamCommit=baseline['upstreamCommit'],baselineVersion='0.92/native0.91',baselineNativeProofSHA256=digest(a.baseline_project/'vendor/native-091/native-build.json'),
  cacheRoots={k:str(v)for k,v in caches.items()},sourceChanges=preparation['sourceChanges'],compiles=[],links=[],inheritedObjects=inherited_records,
  dataRebuiltOrShipped=False,fullFreshBuildPerformed=False,towersRosterDefine='MOBILE_PLAYERS_SCENARIO91=1')
 for variant,family,name,original,command,obj in jobs:
  proof['compiles'].append(dict(variant=variant,family=family,path='src/'+name,originalCommand=original,isolatedCommand=command,object=str(obj.relative_to(OUT))))
 jwrite(OUT/'build-plan.json',proof)
 def compile_one(job):
  variant,family,name,original,command,obj=job
  seconds=H['execute'](command,caches[family],env[family],OUT/'logs'/('compile-'+variant+'-'+name+'.log'))
  result=dict(variant=variant,family=family,path='src/'+name,object=str(obj.relative_to(OUT)),sha256=digest(obj),seconds=seconds)
  print(json.dumps(dict(compiled=result)),flush=True);return result
 with ThreadPoolExecutor(max_workers=2)as pool:proof['compileResults']=list(pool.map(compile_one,jobs))
 objects={(v,n):o for v,_,n,_,_,o in jobs}
 def link_one(variant):
  family='multiplayer'if variant=='multiplayer'else'offline'
  replacements={H['target'](name):obj for (f,name),obj in inherited.items()if f==family and name!='src/droid.cpp'}
  replacements[H['target']('src/order.cpp')]=objects[(family,'order.cpp')]
  replacements[H['target']('src/keybind.cpp')]=objects[(family,'keybind.cpp')]
  if variant=='multiplayer':replacements[H['target']('src/quickjs_backend.cpp')]=objects[('multiplayer','quickjs_backend.cpp')]
  else:
   replacements[H['target']('src/hci.cpp')]=objects[(variant,'hci.cpp')]
   if variant=='shared':replacements[H['target']('src/droid.cpp')]=inherited[('offline','src/droid.cpp')]
  output=OUT/'raw'/variant;output.mkdir(parents=True,exist_ok=True)
  original,command,omitted=H['link_command'](caches[family],replacements,output)
  seconds=H['execute'](command,caches[family],env[family],OUT/'logs'/('link-'+variant+'.log'))
  result=dict(variant=variant,originalCommand=original,isolatedCommand=command,omittedMissingGeneratedPreloads=omitted,seconds=seconds,
   raw=[dict(file=n,bytes=(output/n).stat().st_size,sha256=digest(output/n))for n in ['warzone2100.js','warzone2100.wasm']])
  print(json.dumps(dict(linked=variant,seconds=seconds,raw=result['raw'])),flush=True);return result
 with ThreadPoolExecutor(max_workers=2)as pool:proof['links']=list(pool.map(link_one,['shared','towers','multiplayer']))
 for family,cache in caches.items():
  after=H['frozen'](cache);jwrite(OUT/'proof'/(family+'-cache-after.json'),after);assert before[family]==after,'Retained warm cache changed'
 for row in inherited_records:
  assert digest(Path(row['originalObject']))==row['sha256'] and digest(OUT/row['object'])==row['sha256']
 proof['sourceInputs']=[dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p))for p in sorted((OUT/'source').rglob('*'))if p.is_file()]
 proof.update(passed=True,warmSourcesObjectsLibrariesAndRawOutputsUnchanged=True,baseline090And091ObjectsUnchanged=True)
 jwrite(OUT/'native-build.json',proof);print(json.dumps(dict(passed=True,variants=3,isolatedCompiles=7)),flush=True)
if __name__=='__main__':main()
