"""Five isolated objects, three source-built native lineages; preserve0.90/caches."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,json,os,runpy
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-091'
H=runpy.run_path(str(ROOT/'tools/build-native-selection-089.py'));digest=H['digest'];jwrite=H['jwrite']
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--baseline-project',type=Path,default=Path('/mnt/c/timerApp/candidates/normal-test-0.90-20261116'))
 p.add_argument('--offline-cache',type=Path,default=Path('/home/punkech/wz-blueprint-20261107'))
 p.add_argument('--mp-cache',type=Path,default=Path('/home/punkech/wz-mp-070'));a=p.parse_args()
 assert os.name!='nt' and not(OUT/'native-build.json').exists()
 base=a.baseline_project;old=base/'vendor/native-090';preparation=json.loads((OUT/'source-preparation.json').read_text());assert preparation['passed']
 baseline=json.loads((old/'native-build.json').read_text());assert baseline['passed']
 expected={'shared':'eefcf462ba169877d276cdb92773d8fa16fe8f9a6070222275166fa9ffa6a144','towers':'defca4e2532abce2832b22a74e0bcdf87451b4876a045bbe213d934b637a7577','multiplayer':'b0586374d4f8d1e017ee88a26bb062dbb7114e2b4517cd7e7f58cc9022344125'}
 integration=json.loads((old/'runtime-integration.json').read_text())
 for row in integration['variants']:assert row['installedWASM_SHA256']==expected[row['variant']] and digest(base/'app/src/main/assets'/row['baselineWASM']['path'])==expected[row['variant']]
 caches={'offline':a.offline_cache.resolve(),'multiplayer':a.mp_cache.resolve()};before={};env={}
 for family,cache in caches.items():
  before[family]=H['frozen'](cache);env[family]=H['environment'](cache);jwrite(OUT/'proof'/(family+'-cache-before.json'),before[family])
 inherited={}
 for family,name in [('offline','src/display3d.cpp'),('multiplayer','src/display3d.cpp'),('offline','src/droid.cpp')]:
  row=next(x for x in baseline['compileResults']if x['family']==family and x['path']==name);obj=old/row['object'];assert digest(obj)==row['sha256'];inherited[(family,name)]=obj
 jobs=[]
 for variant,family,name in [('shared','offline','hci.cpp'),('towers','offline','hci.cpp'),('offline','offline','spectatorwidgets.cpp'),('multiplayer','multiplayer','quickjs_backend.cpp'),('multiplayer','multiplayer','spectatorwidgets.cpp')]:
  source=OUT/'source'/family/'src'/name;obj=OUT/'objects'/variant/(name+'.o');obj.parent.mkdir(parents=True,exist_ok=True)
  original,command=H['compile_command'](caches[family],'src/'+name,source,obj)
  command[1:1]=['-iquote',str(OUT/'source/common'),'-iquote',str(old/'source/common')]+(['-DMOBILE_PLAYERS_SCENARIO91=1']if variant=='towers'else[])
  jobs.append((variant,family,name,original,command,obj))
 proof=dict(version='0.91',upstreamCommit=baseline['upstreamCommit'],baselineVersion='0.90',baselineNativeProofSHA256=digest(old/'native-build.json'),
  cacheRoots={k:str(v)for k,v in caches.items()},sourceChanges=preparation['sourceChanges'],compiles=[],links=[],inheritedObjects=[dict(family=f,path=n,object=str(o),sha256=digest(o))for(f,n),o in inherited.items()],
  dataRebuiltOrShipped=False,fullFreshBuildPerformed=False,towersRosterDefine='MOBILE_PLAYERS_SCENARIO91=1')
 for variant,family,name,original,command,obj in jobs:proof['compiles'].append(dict(variant=variant,family=family,path='src/'+name,originalCommand=original,isolatedCommand=command,object=str(obj.relative_to(OUT))))
 jwrite(OUT/'build-plan.json',proof)
 def compile_one(job):
  variant,family,name,original,command,obj=job;seconds=H['execute'](command,caches[family],env[family],OUT/'logs'/('compile-'+variant+'-'+name+'.log'))
  result=dict(variant=variant,family=family,path='src/'+name,object=str(obj.relative_to(OUT)),sha256=digest(obj),seconds=seconds);print(json.dumps(dict(compiled=result)),flush=True);return result
 with ThreadPoolExecutor(max_workers=2)as pool:proof['compileResults']=list(pool.map(compile_one,jobs))
 objects={(v,n):o for v,_,n,_,_,o in jobs}
 def link_one(variant):
  family='multiplayer'if variant=='multiplayer'else'offline'
  replacements={H['target']('src/display3d.cpp'):inherited[(family,'src/display3d.cpp')],H['target']('src/spectatorwidgets.cpp'):objects[(family,'spectatorwidgets.cpp')]}
  if variant=='multiplayer':replacements[H['target']('src/quickjs_backend.cpp')]=objects[('multiplayer','quickjs_backend.cpp')]
  else:
   replacements[H['target']('src/hci.cpp')]=objects[(variant,'hci.cpp')]
   if variant=='shared':replacements[H['target']('src/droid.cpp')]=inherited[('offline','src/droid.cpp')]
  output=OUT/'raw'/variant;output.mkdir(parents=True,exist_ok=True);original,command,omitted=H['link_command'](caches[family],replacements,output)
  seconds=H['execute'](command,caches[family],env[family],OUT/'logs'/('link-'+variant+'.log'))
  result=dict(variant=variant,originalCommand=original,isolatedCommand=command,omittedMissingGeneratedPreloads=omitted,seconds=seconds,
   raw=[dict(file=n,bytes=(output/n).stat().st_size,sha256=digest(output/n))for n in ['warzone2100.js','warzone2100.wasm']]);print(json.dumps(dict(linked=variant,seconds=seconds,raw=result['raw'])),flush=True);return result
 with ThreadPoolExecutor(max_workers=2)as pool:proof['links']=list(pool.map(link_one,['shared','towers','multiplayer']))
 for family,cache in caches.items():
  after=H['frozen'](cache);jwrite(OUT/'proof'/(family+'-cache-after.json'),after);assert before[family]==after,'Frozen warm cache changed'
 for obj in inherited.values():assert digest(obj)==next(x['sha256']for x in proof['inheritedObjects']if x['object']==str(obj))
 proof['sourceInputs']=[dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p))for p in sorted((OUT/'source').rglob('*'))if p.is_file()]
 proof.update(passed=True,warmSourcesObjectsLibrariesAndRawOutputsUnchanged=True,baseline090ObjectsUnchanged=True)
 jwrite(OUT/'native-build.json',proof);print(json.dumps(dict(passed=True,variants=3,isolatedCompiles=5)),flush=True)
if __name__=='__main__':main()
