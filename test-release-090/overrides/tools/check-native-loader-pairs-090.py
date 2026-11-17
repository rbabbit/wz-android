"""Read-only check of every full generated loader and its exact linked WASM."""
from pathlib import Path
from hashlib import file_digest, sha256
import argparse, json, re, runpy

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'vendor/native-090'

def digest(path):
    with path.open('rb') as stream: return file_digest(stream,'sha256').hexdigest()

def hashed(value): return sha256(value.encode()).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-project',type=Path,default=Path('C:/timerApp/candidates/normal-0.89-20261116'))
    args=parser.parse_args()
    assets=ROOT/'app/src/main/assets';base=args.baseline_project/'app/src/main/assets'
    package=runpy.run_path(str(OUT/'recipes/integrate-native-runtime.py'))['package_call']
    report=json.loads((OUT/'runtime-integration.json').read_text())
    build=json.loads((OUT/'native-build.json').read_text())
    for link in build['links']:
        for item in link['raw']: assert digest(OUT/'raw'/link['variant']/item['file'])==item['sha256']
    rows=[]
    pairs=[('shared','warzone/warzone2100.js','warzone/warzone2100.wasm','warzone/warzone2100.data',None),
           ('towers','warzone/warzone2100-towers-052.js','warzone/warzone2100-towers-052.wasm','warzone/warzone2100.data','warzone/index.html'),
           ('multiplayer','multiplayer/warzone2100.js','multiplayer/warzone2100.wasm','multiplayer/warzone2100.data','multiplayer/engine.html')]
    pairs += [('shared',f'warzone/warzone2100-{alias}.js','warzone/warzone2100.wasm',f'warzone/warzone2100-{alias}.data',f'warzone/index-{alias}.html') for alias in ['campaign','ffa','duel']]
    full_loaders={p.relative_to(assets).as_posix() for p in assets.rglob('*.js') if 'var createWZModule = (() => {' in p.read_text(encoding='utf-8',errors='replace')}
    assert full_loaders=={row[1] for row in pairs},('Unreviewed full generated loader',full_loaders)
    directory=r'Module\["FS_createPath"\]\("[^"\\]*","[^"\\]*",true,true\);'
    hook=r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;'
    standard='var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
    for family,jsname,wasmname,dataname,entry in pairs:
        raw=(OUT/'raw'/family/'warzone2100.js').read_text();actual=(assets/jsname).read_text();old=(base/jsname).read_text()
        assert digest(assets/wasmname)==digest(OUT/'raw'/family/'warzone2100.wasm')
        assert digest(assets/dataname)==digest(base/dataname)
        expected=package(old);parsed=package(actual);fresh=package(raw)
        assert expected[2]==parsed[2] and expected[3]['remote_package_size']<=(assets/dataname).stat().st_size
        old_data=re.findall(r'var REMOTE_PACKAGE_BASE="[^"\\]+";',old)
        raw_data=re.findall(r'var REMOTE_PACKAGE_BASE="[^"\\]+";',raw)
        assert len(old_data)==len(raw_data)==1 and actual.count(old_data[0])==1
        normalized=actual[:parsed[0]]+'INDEX'+actual[parsed[1]:]
        normalized_raw=raw[:fresh[0]]+'INDEX'+raw[fresh[1]:]
        normalized=normalized.replace(old_data[0],raw_data[0],1)
        if family=='multiplayer':
            worker="globalThis.assert=(v,m)=>{if(!v)throw Error(m||'Emscripten assertion failed');};if(typeof importScripts==='function')importScripts('socket-bridge.js','lobby-http.js');\n"
            assert actual.startswith(worker) and old.startswith(worker)
            normalized=normalized[len(worker):].replace('flags&=~32;','if(flags&32){return-2}',1)
            normalized=normalized.replace('preMain();Module["onRuntimeInitialized"]?.();readyPromiseResolve?.(Module);var noInitialRun=false;',
                                          'preMain();readyPromiseResolve?.(Module);var noInitialRun=false;',1)
        else:
            hooks=re.findall(hook,old,re.S);assert len(hooks)==1 and actual.count(hooks[0])==1
            normalized=normalized.replace(hooks[0],standard,1)
        # Remove only exact retained declarations missing from the raw build.
        missing=[s for s in re.findall(directory,old) if s not in set(re.findall(directory,raw))]
        if missing:
            assert normalized.count(''.join(missing))==1
            normalized=normalized.replace(''.join(missing),'',1)
        assert normalized==normalized_raw,('Generated runtime differs outside reviewed adapters',jsname)
        consts=re.search(r'var ASM_CONSTS=(.*?);function',actual,re.S)
        raw_consts=re.search(r'var ASM_CONSTS=(.*?);function',raw,re.S)
        assert consts and raw_consts and consts.group(1)==raw_consts.group(1)
        keys=re.findall(r'(?:\{|,)(\d+):',consts.group(1))
        assert keys and len(keys)==len(set(keys))
        # Each pthread imports its own current full loader, never the generic old
        # filename. This keeps all worker ASM tables paired with that loader.
        assert 'var pthreadMainJs=_scriptName;worker=new Worker(pthreadMainJs,{name:"em-pthread"})' in actual
        route=None
        if entry:
            html=(assets/entry).read_text();assert (assets/entry).read_bytes()==(base/entry).read_bytes()
            assert 'src="'+Path(jsname).name+'"' in html
            if family=='towers': assert "return prefix + 'warzone2100-towers-052.wasm'" in html
            elif family=='shared': assert 'warzone2100-towers-052.wasm' not in html
            route=dict(html=entry,loader=jsname,wasm=wasmname,entrypointUnchanged=True)
        rows.append(dict(loader=jsname,family=family,wasm=wasmname,loaderSHA256=digest(assets/jsname),wasmSHA256=digest(assets/wasmname),
                         data=dataname,dataSHA256=digest(assets/dataname),dataUnchanged=True,remotePackageBase=old_data[0],
                         packageIndexUnchanged=True,generatedProgramNormalizedIdenticalToLinkedRaw=True,
                         ASM_CONSTS_SHA256=hashed(consts.group(1)),ASM_CONSTS_keys=[int(k) for k in keys],
                         pthreadUsesOwnLoader=True,entrypointRoute=route))
    assert report['everySharedCoreLoaderPaired'] and len(report['sharedLoaderAliases'])==3
    result=dict(passed=True,fullGeneratedLoadersFound=len(full_loaders),allFullLoadersChecked=True,
                nativeSourceBuildRecordSHA256=digest(OUT/'native-build.json'),runtimeIntegrationSHA256=digest(OUT/'runtime-integration.json'),
                loaders=rows,actualAndroidStartupTest=False,
                scope='Source/raw-pair/static entrypoint proof only; exact APK startup is a separate runtime requirement')
    (OUT/'checks/loader-pairs.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='loaders'},indent=2))

if __name__=='__main__': main()
