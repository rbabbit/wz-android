"""Compile/link three0.90 native lineages outside frozen caches and0.89 outputs."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,json,os,runpy,shutil,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-090'
HELPERS=ROOT/'tools/build-native-selection-089.py'
H=runpy.run_path(str(HELPERS));digest=H['digest'];jwrite=H['jwrite'];frozen=H['frozen'];run=H['run'];write=H['write']
BASE89={'shared':'b1addc472eb09750e3c33dc3979af3c13e9266e439d894cead015616572e7caf',
        'towers':'e3cccd033a5874d0451aaa095cdef6c8146dcdb95ec1288f36d9482ab9b6b236',
        'multiplayer':'2f884ca84c3c29bdbeed8102d710c40e73b29320d1e99c1ff64d97269d252fbc'}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--offline-cache',type=Path,default=Path('/home/punkech/wz-blueprint-20261107'))
    p.add_argument('--mp-cache',type=Path,default=Path('/home/punkech/wz-mp-070'))
    p.add_argument('--baseline-project',type=Path,default=Path('/mnt/c/timerApp/candidates/normal-0.89-20261116'))
    args=p.parse_args();assert os.name!='nt','Run under Linux/WSL'
    assert not (OUT/'native-build.json').exists(),'Preserve prior completed native build'
    preparation=json.loads((OUT/'source-preparation.json').read_text());assert preparation['passed']
    caches={'offline':args.offline_cache.resolve(),'multiplayer':args.mp_cache.resolve()};before={};envs={}
    proof=dict(version='0.90',upstreamCommit=H['COMMIT'],cacheRoots={k:str(v) for k,v in caches.items()},
               baselineExpectedWASM_SHA256=BASE89,sourceChanges=preparation['sourceChanges'],compiles=[],links=[],
               dataRebuiltOrShipped=False,fullFreshBuildPerformed=False,helperSHA256=digest(HELPERS))
    base=args.baseline_project/'app/src/main/assets'
    for family,name in [('shared','warzone/warzone2100.wasm'),('towers','warzone/warzone2100-towers-052.wasm'),('multiplayer','multiplayer/warzone2100.wasm')]:
        assert digest(base/name)==BASE89[family]
    for family,cache in caches.items():
        assert run(['git','-C',str(cache/'source'),'rev-parse','HEAD'])==H['COMMIT']
        assert (cache/'emsdk/upstream/emscripten/emscripten-version.txt').read_text().strip(' \n\"')=='4.0.10'
        before[family]=frozen(cache);envs[family]=H['environment'](cache)
        jwrite(OUT/'proof'/(family+'-cache-before.json'),before[family])
        modified=run(['git','-C',str(cache/'source'),'diff','--name-only']).splitlines()
        untracked=run(['git','-C',str(cache/'source'),'ls-files','--others','--exclude-standard']).splitlines()
        for relative in modified+untracked:write(OUT/'bootstrap'/family/'source'/relative,(cache/'source'/relative).read_bytes())
        write(OUT/'bootstrap'/family/'baseline-git.patch',subprocess.check_output(['git','-C',str(cache/'source'),'diff','--binary','HEAD']))
        write(OUT/'bootstrap'/family/'CMakeCache.txt',(cache/'build/CMakeCache.txt').read_bytes())
    assert digest(caches['offline']/'build/src/warzone2100.wasm')==H['EXPECTED_WASM']['towers']
    assert digest(caches['multiplayer']/'build/src/warzone2100.wasm')==H['EXPECTED_WASM']['multiplayer']
    jobs=[]
    for family,names in [('offline',['src/display3d.cpp','src/hci.cpp']),('multiplayer',['src/display3d.cpp','src/quickjs_backend.cpp'])]:
        for name in names:
            source=OUT/'source'/family/name;assert source.is_file()
            obj=OUT/'objects'/family/(Path(name).name+'.o');obj.parent.mkdir(parents=True,exist_ok=True)
            original,command=H['compile_command'](caches[family],name,source,obj)
            command[1:1]=['-iquote',str(OUT/'source/common')]
            jobs.append((family,name,original,command,obj))
    stock=args.baseline_project/'vendor/native-089/source/shared051/src/droid.cpp'
    assert digest(stock)=='b32c09a40baf1f34b1b00c33b2928f8e771b35646e65508a3331dd0104ccfea4'
    source=OUT/'source/shared051/src/droid.cpp';write(source,stock.read_bytes())
    obj=OUT/'objects/shared051/droid.cpp.o';obj.parent.mkdir(parents=True,exist_ok=True)
    original,command=H['compile_command'](caches['offline'],'src/droid.cpp',source,obj)
    jobs.append(('offline','src/droid.cpp',original,command,obj))
    for family,name,original,command,obj in jobs:
        proof['compiles'].append(dict(family=family,path=name,originalCommand=original,isolatedCommand=command,object=str(obj.relative_to(OUT))))
    jwrite(OUT/'build-plan.json',proof)
    def compile_one(job):
        family,name,original,command,obj=job
        seconds=H['execute'](command,caches[family],envs[family],OUT/'logs'/('compile-'+obj.parent.name+'-'+Path(name).stem+'.log'))
        row=dict(family=family,path=name,seconds=seconds,object=str(obj.relative_to(OUT)),sha256=digest(obj))
        print(json.dumps(dict(compiled=row)),flush=True);return row
    with ThreadPoolExecutor(max_workers=2) as pool:proof['compileResults']=list(pool.map(compile_one,jobs))
    objects={(family,name):obj for family,name,_,_,obj in jobs}
    links=[]
    for variant,family in [('shared','offline'),('towers','offline'),('multiplayer','multiplayer')]:
        names=['src/display3d.cpp','src/hci.cpp'] if family=='offline' else ['src/display3d.cpp','src/quickjs_backend.cpp']
        replacements={H['target'](name):objects[(family,name)] for name in names}
        if variant=='shared':replacements[H['target']('src/droid.cpp')]=objects[('offline','src/droid.cpp')]
        output=OUT/'raw'/variant;output.mkdir(parents=True,exist_ok=True)
        original,command,omitted=H['link_command'](caches[family],replacements,output)
        links.append((variant,family,original,command,omitted,output))
    def link_one(job):
        variant,family,original,command,omitted,output=job
        seconds=H['execute'](command,caches[family],envs[family],OUT/'logs'/('link-'+variant+'.log'))
        row=dict(variant=variant,originalCommand=original,isolatedCommand=command,omittedMissingGeneratedPreloads=omitted,seconds=seconds,
                 raw=[dict(file=name,bytes=(output/name).stat().st_size,sha256=digest(output/name)) for name in ['warzone2100.js','warzone2100.wasm']])
        print(json.dumps(dict(linked=variant,seconds=seconds,raw=row['raw'])),flush=True);return row
    with ThreadPoolExecutor(max_workers=2) as pool:proof['links']=list(pool.map(link_one,links))
    for family,cache in caches.items():
        after=frozen(cache);jwrite(OUT/'proof'/(family+'-cache-after.json'),after)
        assert before[family]==after,'Frozen native cache changed'
    proof['sourceInputs']=[dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p)) for p in sorted((OUT/'source').rglob('*')) if p.is_file()]
    proof.update(passed=True,warmSourcesObjectsLibrariesAndRawOutputsUnchanged=True)
    jwrite(OUT/'native-build.json',proof)
    print(json.dumps(dict(passed=True,variants=3,cacheSourcesObjectsLibrariesAndOldOutputsUnchanged=True)),flush=True)

if __name__=='__main__':main()
