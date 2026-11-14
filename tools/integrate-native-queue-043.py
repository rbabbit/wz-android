"""Integrate the bounded cancellation hook plus the one commands VFS override.

Source-built JS/WASM are matched; all other authored data, runtime index entries
and the existing worker hook are retained byte-for-byte. No runtime is executed.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
from datetime import datetime, timezone
import argparse
import json
import os
import runpy
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'archive/native-queue-0.43'
ASSETS=ROOT/'app/src/main/assets/warzone'
VIRTUAL='/data/mp/tests/warzone-towers-commands.js'
RUNTIME=runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'),run_name='queue_043_integrator')


def digest(path):
    value=sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''):value.update(block)
    return value.hexdigest()


def atomic(path,value):
    with tempfile.NamedTemporaryFile(dir=path.parent,prefix='.queue043-',suffix='.tmp',delete=False) as stream:
        stage=Path(stream.name);stream.write(value);stream.flush();os.fsync(stream.fileno())
    try:
        assert stage.read_bytes()==value
        os.replace(stage,path)
    finally:
        if stage.exists():stage.unlink()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--raw',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--install',action='store_true')
    p.add_argument('--replace-candidate',type=Path)
    a=p.parse_args()
    assert ROOT not in a.out.resolve().parents
    saved=json.loads((ROOT/'archive/fallback-0.43.json').read_text(encoding='utf-8-sig'))
    row=next(r for r in saved['files'] if r['path'].endswith('.apk'))
    baseline=Path(row['path'])
    assert baseline.stat().st_size==row['bytes'] and digest(baseline)==row['sha256']
    build=json.loads((OUT/'native-build.json').read_text())
    assert build['version']=='0.43' and build['passed'] and build['nativeFullFreshBuildPerformed'] is False
    assert build['compiledObjects']==['src/CMakeFiles/warzone2100.dir/quickjs_backend.cpp.o']
    for r in build['raw']:
        file=a.raw/r['file'];assert file.stat().st_size==r['bytes'] and digest(file)==r['sha256']
    subprocess.run([sys.executable,str(ROOT/'tools/integrate-native-runtime.py'),
                    '--raw-js',str(a.raw/'warzone2100.js'),'--raw-wasm',str(a.raw/'warzone2100.wasm'),
                    '--baseline-apk',str(baseline),'--out',str(a.out)],check=True,stdout=subprocess.DEVNULL)
    integration=json.loads((a.out/'native-runtime-integration.json').read_text())
    assert integration['passed'] and integration['generatedCodeUnchangedOutsideIndexAndExistingWorkerHook']
    integration.update({'version':'0.43','emulatorUsed':False,'androidRuntimeExecuted':False,
                        'scope':'Source-built exact-current cancellation hook integrated with frozen v0.42 package index and worker hook before the separately recorded commands append',
                        'changedVFSFiles':[],'workerHookChanged':False})
    (OUT/'native-runtime-integration.json').write_text(json.dumps(integration,indent=2)+'\n')
    script=(a.out/'warzone2100.js').read_text(encoding='utf-8')
    data=(a.out/'warzone2100.data').read_bytes()
    begin,end,_,metadata=RUNTIME['package_call'](script)
    names=RUNTIME['verify_index'](metadata,data)
    source=(ROOT/'scenario/warzone-towers-commands.js').read_bytes()
    appended=data+source
    rows=[dict(r,start=len(data),end=len(appended)) if r['filename']==VIRTUAL else dict(r) for r in metadata['files']]
    index=dict(metadata,files=rows,remote_package_size=len(appended),package_uuid='warzone-towers-queue-0.43-'+sha256(appended).hexdigest()[:16])
    generated=script[:begin]+'loadPackage('+json.dumps(index,separators=(',',':'))+')'+script[end:]
    start,stop,_,verified=RUNTIME['package_call'](generated)
    assert generated[:start]+'PACKAGE_INDEX'+generated[stop:]==script[:begin]+'PACKAGE_INDEX'+script[end:]
    assert RUNTIME['verify_index'](verified,appended)==names
    for old,current in zip(metadata['files'],verified['files']):
        expected=source if old['filename']==VIRTUAL else data[old['start']:old['end']]
        assert appended[current['start']:current['end']]==expected,'Unrelated VFS changed: '+old['filename']
    assert appended[:len(data)]==data
    (a.out/'warzone2100.js').write_bytes(generated.encode())
    (a.out/'warzone2100.data').write_bytes(appended)
    proof={'version':'0.43','passed':True,'emulatorUsed':False,'androidRuntimeExecuted':False,'gameplayVerified':False,
           'scope':'Matched one-object native cancellation build plus one commands VFS replacement; no other authored data or worker hook change',
           'nativeBuildProof':'archive/native-queue-0.43/native-build.json','nativeBuildProofSHA256':digest(OUT/'native-build.json'),
           'nativeRuntimeProof':'archive/native-queue-0.43/native-runtime-integration.json',
           'nativeRuntimeProofSHA256':digest(OUT/'native-runtime-integration.json'),
           'baselineAPK':str(baseline),'baselineSHA256':row['sha256'],
           'changedVFSFiles':[VIRTUAL],'addedVFSFiles':[],'removedVFSFiles':[],
           'unchangedVirtualFiles':len(names)-1,'frozenDataPrefixUnchanged':True,
           'nativeProgramUnchangedOutsidePackageIndex':True,'matchedWASMUnchanged':True,'workerHookChanged':False,
           'source':{'path':'scenario/warzone-towers-commands.js','bytes':len(source),'sha256':sha256(source).hexdigest()},
           'outputs':[{'file':n,'bytes':(a.out/n).stat().st_size,'sha256':digest(a.out/n)} for n in ['warzone2100.js','warzone2100.wasm','warzone2100.data']],
           'recordedUTC':datetime.now(timezone.utc).isoformat()}
    (OUT/'native-payload.json').write_text(json.dumps(proof,indent=2)+'\n')
    if a.install:
        with ZipFile(baseline) as archive:
            previous = {}
            if a.replace_candidate:
                previous = {n:(a.replace_candidate/n).read_bytes() for n in ['warzone2100.js','warzone2100.wasm','warzone2100.data']}
                old_js = previous['warzone2100.js'].decode()
                old_start,old_stop,_,old_index=RUNTIME['package_call'](old_js)
                assert old_js[:old_start]+'INDEX'+old_js[old_stop:]==generated[:start]+'INDEX'+generated[stop:]
                assert previous['warzone2100.wasm']==(a.raw/'warzone2100.wasm').read_bytes()
                assert previous['warzone2100.data'][:len(data)]==data
                assert RUNTIME['verify_index'](old_index,previous['warzone2100.data'])==names
                for old,current in zip(metadata['files'],old_index['files']):
                    if old['filename']!=VIRTUAL:
                        assert previous['warzone2100.data'][current['start']:current['end']]==data[old['start']:old['end']]
            for n in ['warzone2100.js','warzone2100.wasm','warzone2100.data']:
                current=(ASSETS/n).read_bytes()
                assert current in [archive.read('assets/warzone/'+n),(a.out/n).read_bytes(),previous.get(n)],'Native baseline changed: '+n
        for n in ['warzone2100.data','warzone2100.wasm','warzone2100.js']:atomic(ASSETS/n,(a.out/n).read_bytes())
    print(json.dumps(proof))


if __name__=='__main__':main()
