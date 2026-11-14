"""Install the source-built pair with frozen Towers VFS/data, then add campaign."""
from pathlib import Path
from hashlib import sha256
import argparse,json,subprocess,sys

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'archive/native-campaign-0.51'
ASSETS=ROOT/'app/src/main/assets/warzone'
def digest(p):return sha256(p.read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--install',action='store_true');a=p.parse_args()
    build_path=next(OUT/name for name in ['selection-native-build.json','intel-native-build.json','radar-native-build.json','native-build.json'] if (OUT/name).exists())
    build=json.loads(build_path.read_text());assert build['passed'] and len(build['compiledObjects']) in [1,2,4]
    for row in build['raw']:assert digest(a.raw/row['file'])==row['sha256']
    frozen={name:digest(ASSETS/name) for name in ['warzone2100.js','warzone2100.wasm','warzone2100.data']}
    subprocess.run([sys.executable,str(ROOT/'tools/integrate-native-runtime.py'),'--raw-js',str(a.raw/'warzone2100.js'),'--raw-wasm',str(a.raw/'warzone2100.wasm'),'--baseline-assets',str(ASSETS),'--out',str(a.out)],check=True,stdout=subprocess.DEVNULL)
    proof=json.loads((a.out/'native-runtime-integration.json').read_text())
    assert proof['passed'] and proof['generatedCodeUnchangedOutsideIndexAndExistingWorkerHook']
    assert (a.out/'warzone2100.data').read_bytes()==(ASSETS/'warzone2100.data').read_bytes()
    if a.install:
        for name in ['warzone2100.js','warzone2100.wasm']:(ASSETS/name).write_bytes((a.out/name).read_bytes())
    assert digest(ASSETS/'warzone2100.data')==frozen['warzone2100.data']
    if (OUT/'native-payload.json').exists() and not (OUT/'native-payload-base.json').exists():
        (OUT/'native-payload-base.json').write_bytes((OUT/'native-payload.json').read_bytes())
    report={'version':'0.51','passed':True,'sourceBuiltPairedRuntime':True,'frozenTowersDataUnchanged':True,'generatedCodeUnchangedOutsideIndexAndExistingWorkerHook':True,'nativeBuildProof':str(build_path.relative_to(ROOT)),'nativeBuildSHA256':digest(build_path),'previous':frozen,'outputs':{name:digest(a.out/name) for name in frozen},'runtimeIntegration':proof}
    (OUT/'native-payload.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['passed','sourceBuiltPairedRuntime','frozenTowersDataUnchanged','outputs']}))

if __name__=='__main__':main()
