"""Verify offline Duel packaging and the unchanged Towers benchmark.

This checks source bytes, native VFS contents, provenance and APK identity.
Actual launcher, policy, bot gameplay and outcomes require emulator evidence.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import argparse
import json
import os
import re
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
QA = ROOT/'qa/test-10'
prior = runpy.run_path(str(ROOT/'tools/verify-test-09-package.py'), run_name='release10_helpers')
digest, read, require, local, zip_digest, dex_defines, signing_certificate, stable_integrity = (
    prior[n] for n in ('digest','read','require','local','zip_digest','dex_defines','signing_certificate','stable_integrity'))
package_call = runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'), run_name='release10_runtime')['package_call']
FROZEN = dict(prior['FROZEN'], **{
    'Warzone-Towers-0.9.apk': 'f05b5b9b617efa620f0f7ec6165d84e4c243457928c23e4547c7ca932148e8b4',
    'warzone-towers-0.9-source.zip': 'd8676d9dd13402551b28cf3e3c808013845ccb26db96a5b1546fa3343723ccbc',
    'Warzone-Towers-0.9-SHA256.txt': 'e037da9691cbe0cdc69a4d9d7e9e870676cea26c6ee95837add47e8a46fa9e62',
})
FALLBACK = BASE/'fallbacks/towers-benchmark-0.9-before-duel-20261108'
STOCK_BYTES = 64424618
STOCK_SHA256 = '9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
NEW_ASSETS = {'assets/warzone-duel-ui.js'} | {'assets/warzone/'+n for n in (
    'warzone2100-duel.js','warzone2100-duel.data','index-duel.html','mobile-duel.html')}
CHANGED_ASSETS = {'assets/warzone-html-session.js','assets/warzone-touch-controls.js'}
CHANGED_SOURCE = {'app/src/main/'+n for n in CHANGED_ASSETS} | {
    'app/build.gradle.kts',
    'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
    'app/src/main/java/com/rbabbit/blocknight/warzone/GraphicsSetupView.java',
}
NEW_SOURCE = {'app/src/main/'+n for n in NEW_ASSETS} | {
    'app/src/main/java/com/rbabbit/blocknight/warzone/BattleLaunchSpec.java'}
NEW_NAMESPACES = ('scenario/duel/','map/duel-ro-half/','vendor/duel-stock/','vendor/duel-map/')
EMULATOR_CHECKS = {'modeSelection','towersRegression','cannonDuel','rocketsDuel',
                   'nativePolicyEnforced','botProductionCombat','savesAndMenuReturns','nativeOutcomes'}


def record(path):
    return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def frozen_artifacts():
    records = prior['frozen_artifacts']()
    for name in ('Warzone-Towers-0.9.apk','warzone-towers-0.9-source.zip','Warzone-Towers-0.9-SHA256.txt'):
        for path in (BASE/name,FALLBACK/name):
            require(digest(path)==FROZEN[name], 'Frozen benchmark changed: '+str(path))
            records.append({'path':str(path),'sha256':FROZEN[name]})
    return records


def verify_duel_payload(apk):
    towers = apk.read('assets/warzone/warzone2100.js').decode('utf-8')
    duel = apk.read('assets/warzone/warzone2100-duel.js').decode('utf-8')
    begin,end,_,baseline = package_call(towers)
    dbegin,dend,_,metadata = package_call(duel)
    normalized = towers[:begin]+'PACKAGE'+towers[end:]
    require(duel[:dbegin]+'PACKAGE'+duel[dend:]==normalized, 'Duel compiled program differs outside literal package metadata')
    excluded = {'files','remote_package_size','package_uuid'}
    require({k:v for k,v in metadata.items() if k not in excluded}=={k:v for k,v in baseline.items() if k not in excluded}, 'Unexpected non-index package metadata')
    data = apk.read('assets/warzone/warzone2100-duel.data')
    data_hash = sha256(data).hexdigest()
    require(len(data)>=STOCK_BYTES and sha256(data[:STOCK_BYTES]).hexdigest()==STOCK_SHA256, 'Duel stock prefix changed')
    require(metadata.get('remote_package_size')==len(data) and metadata.get('package_uuid')=='duel-'+data_hash, 'Duel native package size/UUID mismatch')
    stock_path = ROOT/'vendor/duel-stock/package-index.json'
    require(digest(stock_path)=='cbc1dbb8934e2adad9e0b075dc31d0c5513d8a00c0f8fe3afc8b0a8c76826b0f', 'Imported official stock index changed')
    stock = read(stock_path)
    require(isinstance(stock,list) and len(stock)==3789, 'Incomplete official stock VFS index')
    original = {entry['filename']:entry for entry in stock}
    require(len(original)==len(stock), 'Duplicate official stock VFS path')
    for name,entry in original.items():
        require(name.startswith('/') and type(entry['start']) is int and type(entry['end']) is int and 0<=entry['start']<=entry['end']<=STOCK_BYTES, 'Invalid official stock VFS entry')
    source,map_source = ROOT/'scenario/duel',ROOT/'map/duel-ro-half'
    addon = original['/data/mp/addon.lev']
    expected = {'/data/mp/addon.lev':data[addon['start']:addon['end']]+b'\n'+(map_source/'level.lev').read_bytes()}
    def file(virtual,path):
        expected[virtual] = path.read_bytes()
    for name in ('game.map','ttypes.ttp','droid.json','feature.json','struct.json','gam.json'):
        file('/data/mp/multiplay/maps/duel-ro-half/'+name,map_source/name)
    file('/data/mp/multiplay/maps/duel-ro-half.gam',map_source/'gam.json')
    for name,src in (('duel.json','challenge.json'),('duel-policy.js','policy.js'),('duel-rules.js','rules.js'),
                     ('duel-commands.js','commands.js'),('duel-research-bridge.js','research-bridge.js')):
        file('/data/mp/tests/'+name,source/src)
    for virtual,src in (
        ('/data/mp/multiplay/script/rules/init.js','rules.js'),
        ('/data/mp/multiplay/script/duel-policy.json','policy.json'),
        ('/data/mp/multiplay/skirmish/duel-ai.js','ai.js'),
        ('/data/mp/multiplay/skirmish/duel-ai.json','ai.json'),
        ('/data/mp/multiplay/skirmish/nb_includes/produce.js','ai-production.js'),
        ('/data/mp/multiplay/skirmish/nb_includes/research.js','ai-research.js'),
        ('/data/mp/stats/research.json','research.json'),('/data/mp/stats/templates.json','templates.json')):
        file(virtual,source/src)
    for folder in ('multiplay/script','multiplay/script/rules','multiplay/skirmish'):
        expected['/data/mp/'+folder+'/duel-config.json'] = json.dumps({'mode':'duel','humanBranch':'cannon','botBranch':'rockets'}).encode()
        if folder!='multiplay/script':file('/data/mp/'+folder+'/duel-policy.json',source/'policy.json')
    for name in ('warzone-towers-catalog.json','warzone-towers-command.json','warzone-towers-control-command.json','blocknight-queue-command.json','blocknight-zoom-command.json'):
        for folder in ('/data/mp/tests/','/data/mp/multiplay/script/rules/'):
            file(folder+name,ROOT/'scenario'/name)
    entries = metadata.get('files',[])
    actual = {entry.get('filename'):entry for entry in entries}
    require(len(actual)==len(entries) and actual.keys()==original.keys()|expected.keys(), 'Unexpected/missing Duel VFS paths')
    for name,entry in actual.items():
        require(type(entry.get('start')) is int and type(entry.get('end')) is int and 0<=entry['start']<=entry['end']<=len(data), 'Invalid Duel VFS offset')
        if name not in expected:
            require(entry==original[name], 'Official stock VFS metadata/audio flags changed: '+name)
    # Embedded override order may change without changing semantics; require
    # exact source bytes, disjoint appended ranges and no hidden extra payload.
    ranges=[]
    for name,content in expected.items():
        entry=actual[name];start,end=entry['start'],entry['end']
        require(set(entry)=={'filename','start','end'} and start>=STOCK_BYTES and data[start:end]==content, 'Duel source not embedded exactly: '+name)
        ranges.append((start,end))
    cursor=STOCK_BYTES
    for start,end in sorted(ranges):
        require(start==cursor, 'Gap/overlap in appended Duel package');cursor=end
    require(cursor==len(data), 'Unindexed bytes in Duel package')
    proof = read(source/'PACKAGE.json')
    require(proof.get('passed') is True and proof.get('compiledProgramUnchangedOutsidePackageMetadata') is True and proof.get('sharedWASM') is True, 'Duel build provenance incomplete')
    require(proof.get('stockPrefixBytes')==STOCK_BYTES and proof.get('stockPrefixSHA256')==STOCK_SHA256 and proof.get('stockRecords')==len(stock) and proof.get('duelRecords')==len(entries), 'Duel build VFS provenance mismatch')
    declared = proof.get('virtualOverrides',[])
    require(len(declared)==len(expected) and {e['path'] for e in declared}==expected.keys(), 'Duel override provenance inventory mismatch')
    for entry in declared:
        content=expected[entry['path']]
        require(entry['sha256']==sha256(content).hexdigest() and entry['bytes']==len(content), 'Duel override provenance changed')
    outputs=proof.get('outputs',[])
    expected_outputs={'app/src/main/assets/warzone/'+n for n in ('warzone2100-duel.js','warzone2100-duel.data','index-duel.html','mobile-duel.html')}
    require(len(outputs)==len(expected_outputs) and {e['path'] for e in outputs}==expected_outputs, 'Duel output provenance inventory mismatch')
    for entry in outputs:
        path=local(entry['path'])
        require(digest(path)==entry['sha256'] and path.stat().st_size==entry['bytes'], 'Duel generated output/provenance differs')
    expected_inputs={'app/src/main/assets/warzone/'+n for n in ('warzone2100.js','warzone2100.wasm','warzone2100.data','index.html','mobile.html')}
    require(len(proof.get('towersInputs',[]))==len(expected_inputs) and {e['path'] for e in proof['towersInputs']}==expected_inputs, 'Incomplete preserved Towers build inputs')
    for entry in proof['towersInputs']:
        require(digest(local(entry['path']))==entry['sha256'], 'Duel build mutated its Towers input')
    imports=read(ROOT/'vendor/duel-stock/IMPORT.json')
    require(imports.get('stockPrefixBytes')==STOCK_BYTES and imports.get('stockPrefixSHA256')==STOCK_SHA256, 'Official stock import provenance changed')
    for entry in imports.get('inputs',[]):
        require(digest(local(entry['path']))==entry['sha256'], 'Retained import source changed: '+entry['path'])
    require(digest(ROOT/'vendor/duel-map/original/RO_1v1Full.wz')=='565649bdaa014905d1317b30745bd9e6c3de4650741c170c2639ff7e66d717ef', 'Authored original map changed')
    require((ROOT/'vendor/duel-map/map/README.md').is_file() and (ROOT/'tools/build-duel-package.py').is_file(), 'Original map attribution or reproducible builder missing')
    return {'passed':True,'stockPrefixBytes':STOCK_BYTES,'stockPrefixSHA256':STOCK_SHA256,'stockVFSRecords':len(stock),'duelVFSRecords':len(entries),'embeddedSourceOverrides':len(expected),
            'compiledProgramUnchangedOutsidePackageMetadata':True,'normalizedProgramSHA256':sha256(normalized.encode()).hexdigest(),'sharedWASM':True,'duelDataSHA256':data_hash,
            'buildProof':record(source/'PACKAGE.json')}


def verify(apk_path):
    candidate=digest(apk_path);artifacts=frozen_artifacts();source_files=[];native_files=[];duel_files=[]
    with ZipFile(BASE/'Warzone-Towers-0.9.apk') as old,ZipFile(apk_path) as apk,ZipFile(BASE/'warzone-towers-0.9-source.zip') as source:
        require(apk.testzip() is None,'APK CRC mismatch')
        old_names={n for n in old.namelist() if not n.endswith('/')};names={n for n in apk.namelist() if not n.endswith('/')}
        require(len(names)==len(apk.namelist()),'Duplicate APK entry or directory entry')
        require(old_names<=names,'Benchmark APK entry removed')
        extra=names-old_names
        require(extra>=NEW_ASSETS and all(n in NEW_ASSETS or re.fullmatch(r'classes\d*\.dex',n) or n.startswith('META-INF/') for n in extra),'Unexpected/missing new APK assets: '+str(extra))
        changed={n for n in old_names if zip_digest(old,n)!=zip_digest(apk,n)}
        require(changed<=CHANGED_ASSETS|{'AndroidManifest.xml'}|{n for n in names if re.fullmatch(r'classes\d*\.dex',n) or n.startswith('META-INF/')},'Existing APK change outside Duel UI/lifecycle scope: '+str(changed))
        require(CHANGED_ASSETS<=changed,'Expected guarded Duel UI/lifecycle implementation missing')
        activity_dex={n for n in names if re.fullmatch(r'classes\d*\.dex',n) and dex_defines(apk.read(n),b'Lcom/rbabbit/blocknight/warzone/MainActivity;')}
        require(len(activity_dex)==1 and activity_dex<=changed|extra,'Expected native launcher implementation missing')
        assets={n for n in names if n.startswith('assets/')}
        current={'assets/'+p.relative_to(ROOT/'app/src/main/assets').as_posix():p for p in (ROOT/'app/src/main/assets').rglob('*') if p.is_file()}
        require(current.keys()==assets,'Source/APK asset inventory differs')
        for name,path in current.items():require(digest(path)==zip_digest(apk,name),'Stale source asset: '+name)
        source_names=set(source.namelist())
        runtime=sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[ROOT/'app/build.gradle.kts']
        runtime_names={p.relative_to(ROOT).as_posix() for p in runtime}
        old_runtime={n for n in source_names if n.startswith('app/src/') and not n.endswith('/')}|{'app/build.gradle.kts'}
        require(runtime_names==old_runtime|NEW_SOURCE,'Runtime source inventory differs outside explicit Duel additions')
        changed_source=set()
        for path in runtime:
            name=path.relative_to(ROOT).as_posix();rec=record(path);source_files.append(rec)
            if name not in source_names or rec['sha256']!=zip_digest(source,name):changed_source.add(name)
        require(changed_source==CHANGED_SOURCE|NEW_SOURCE,'Unexpected/missing runtime source differences: '+str(changed_source))
        preserved={n for n in source_names if n.startswith(('vendor/','map/','scenario/')) and not n.endswith('/')}
        actual_preserved={p.relative_to(ROOT).as_posix() for folder in ('vendor','map','scenario') for p in (ROOT/folder).rglob('*') if p.is_file()}
        require(preserved<=actual_preserved and all(n.startswith(NEW_NAMESPACES) for n in actual_preserved-preserved),'Existing map/mod source removed or additions outside Duel namespace')
        for name in preserved:require(digest(local(name))==zip_digest(source,name),'Existing map/scenario/vendor source changed: '+name)
        for name in sorted(actual_preserved-preserved):duel_files.append(record(local(name)))
        for name in ('tools/build-duel-package.py','tools/integrate-native-runtime.py'):duel_files.append(record(local(name)))
        baseline=json.loads(source.read('qa/test-09/package-verification.json'))
        require(baseline['candidateAPK_SHA256']==FROZEN['Warzone-Towers-0.9.apk'],'Wrong prior benchmark package report')
        for entry in baseline['nativeSourceFiles']:
            path=local(entry['path']);require(digest(path)==entry['sha256'],'Native source/provenance changed: '+entry['path']);native_files.append(record(path))
        native_hashes={n:zip_digest(apk,'assets/warzone/'+n) for n in ('warzone2100.js','warzone2100.wasm','warzone2100.data','index.html','mobile.html')}
        duel_proof=verify_duel_payload(apk)
    sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    aapt=sdk/'build-tools/36.1.0/aapt2.exe';require(aapt.is_file(),'Configure Android build-tools36.1.0')
    badging=subprocess.check_output([str(aapt),'dump','badging',str(apk_path)],text=True,encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='10'","versionName='0.10'","application-label:'Warzone Towers'"):
        require(token in badging,'Wrong APK identity: '+token)
    certificate=signing_certificate(apk_path,sdk)
    require(certificate==signing_certificate(BASE/'Warzone-Towers-0.9.apk',sdk),'APK update signing certificate changed')
    return {'passed':True,'verification':'Package/source/preservation only; actual policy, bot play, results and screen review are separate',
            'candidateAPK_SHA256':candidate,'package':'com.rbabbit.warzonetowers.lab','label':'Warzone Towers','version':'0.10','versionCode':10,
            'baselineAPK_SHA256':FROZEN['Warzone-Towers-0.9.apk'],'sameSigningCertificateSHA256':certificate,'compiledEngineUnchanged':True,
            'towersNativeAndPagesUnchanged':True,'nativePayloadSHA256':native_hashes,'duelPayloadVerification':duel_proof,
            'modifiedAssets':sorted(changed&assets),'addedAssets':sorted(NEW_ASSETS),'changedRuntimeFiles':sorted(changed_source),'sourceAssetsMatchAPK':len(current),
            'sourceFiles':source_files,'nativeSourceFiles':native_files,'duelSourceFiles':duel_files,'preservedArtifacts':artifacts,'stable':stable_integrity()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out',type=Path,default=QA/'package-verification.json')
    args=parser.parse_args();report=verify(args.apk);args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in {'sourceFiles','nativeSourceFiles','duelSourceFiles','preservedArtifacts'}},indent=2))


if __name__=='__main__':main()
