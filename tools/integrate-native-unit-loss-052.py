"""Install the source-built Towers pair without changing Campaign/Duel runtime."""
from pathlib import Path
from hashlib import sha256
import argparse,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'archive/native-unit-loss-0.52';ASSETS=ROOT/'app/src/main/assets/warzone'
def digest(path):return sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--raw',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);parser.add_argument('--install',action='store_true');args=parser.parse_args()
    build=json.loads((OUT/'native-build.json').read_text());assert build['passed'] and build['compiledObjects']==['src/CMakeFiles/warzone2100.dir/droid.cpp.o']
    for row in build['raw']:assert digest(args.raw/row['file'])==row['sha256']
    preserved=['warzone2100.js','warzone2100.wasm','warzone2100.data','index-duel.html','index-campaign.html','mobile-campaign.html','warzone2100-campaign.js','warzone2100-campaign.data']
    before={name:digest(ASSETS/name) for name in preserved}
    assert before['warzone2100.wasm']=='497c65308d3e85f0b5370ec0ff0eb48e6a0876e735ad45e3b280829c7f3c2a06'
    assert before['warzone2100.js']=='fdf0c4807323b15a00cbe92947db2fb6b2da771384af9f3fba08fc5be03c5949'
    subprocess.run([sys.executable,str(ROOT/'tools/integrate-native-runtime.py'),'--raw-js',str(args.raw/'warzone2100.js'),'--raw-wasm',str(args.raw/'warzone2100.wasm'),'--baseline-assets',str(ASSETS),'--out',str(args.out)],check=True,stdout=subprocess.DEVNULL)
    runtime=json.loads((args.out/'native-runtime-integration.json').read_text());assert runtime['passed'] and runtime['generatedCodeUnchangedOutsideIndexAndExistingWorkerHook']
    assert (args.out/'warzone2100.data').read_bytes()==(ASSETS/'warzone2100.data').read_bytes()
    original=(ASSETS/'index.html').read_bytes();text=original.decode()
    anchor="      Module['locateFile'] = function(path, prefix) {"
    mapping="\n        // This Towers-only native notice build has its own matched runtime.\n        if (path === 'warzone2100.wasm') return prefix + 'warzone2100-towers-052.wasm';"
    assert text.count(anchor)==1 and text.count('src="warzone2100.js"')==1
    changed=text.replace(anchor,anchor+mapping,1).replace('src="warzone2100.js"','src="warzone2100-towers-052.js"',1)
    assert changed.replace(anchor+mapping,anchor,1).replace('src="warzone2100-towers-052.js"','src="warzone2100.js"',1)==text
    (OUT/'original-index.html').write_bytes(original);(OUT/'index.html').write_bytes(changed.encode())
    if args.install:
        (ASSETS/'warzone2100-towers-052.js').write_bytes((args.out/'warzone2100.js').read_bytes())
        (ASSETS/'warzone2100-towers-052.wasm').write_bytes((args.out/'warzone2100.wasm').read_bytes())
        (ASSETS/'index.html').write_bytes(changed.encode())
    after={name:digest(ASSETS/name) for name in preserved};assert after==before
    report={'version':'0.52','passed':True,'sourceBuiltPairedTowersRuntime':True,'onlyNativeObject':'droid.cpp','nativeBuildProofSHA256':digest(OUT/'native-build.json'),'campaignAndDuelFilesByteUnchanged':True,'preservedFiles':before,'towersIndexBeforeSHA256':sha256(original).hexdigest(),'towersIndexAfterSHA256':sha256(changed.encode()).hexdigest(),'towersLoader':{'file':'warzone2100-towers-052.js','sha256':digest(args.out/'warzone2100.js')},'towersWASM':{'file':'warzone2100-towers-052.wasm','sha256':digest(args.out/'warzone2100.wasm')},'frozenPackageIndexAndOutputHookPreserved':True,'runtimeIntegration':runtime,'installed':args.install}
    (OUT/'native-payload.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report[k] for k in ['passed','campaignAndDuelFilesByteUnchanged','towersLoader','towersWASM','installed']}))

if __name__=='__main__':main()
