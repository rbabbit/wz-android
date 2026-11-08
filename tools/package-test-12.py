"""Package Towers 0.12 only after exact-APK checks and manual acceptance.

Reuse the established complete-source inventory and streaming CRC/SHA readback.
This tool neither builds the engine nor accepts screenshots or failed checks.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
import argparse
import json
import runpy
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent
QA=ROOT/'qa/test-12'
h=runpy.run_path(str(ROOT/'tools/verify-test-12-package.py'),run_name='release12_packaging')
digest,read,require,local=(h[n] for n in ('digest','read','require','local'))
REQUIRED={'package-verification.json','code-checks.json','emulator-verification.json','visual-review.json'}
STORED={'.gz','.zip','.png','.jpg','.jpeg','.webp','.ogg','.mp3','.wasm','.data','.woff2'}


def validate(apk):
    candidate=digest(apk);gate=read(QA/'DELIVERY.json')
    require(all(gate.get(k) is True for k in ('passed','emulatorTesting','gameplayTesting','visualReview')),'Delivery evidence incomplete')
    require(gate.get('candidateAPK_SHA256')==candidate and gate.get('version')=='0.12' and gate.get('package')=='com.rbabbit.warzonetowers.lab','Wrong delivery identity')
    reports=gate.get('reports',[]);names=[e['path'] for e in reports]
    require(len(names)==len(set(names)) and {'qa/test-12/'+n for n in REQUIRED}<=set(names),'Missing/duplicate required reports')
    for entry in reports:
        p=local(entry['path']);value=read(p)
        require(digest(p)==entry['sha256'] and value.get('passed') is True and value.get('candidateAPK_SHA256')==candidate,'Evidence changed/failed/wrong APK: '+entry['path'])
        require(not value.get('failure') and not value.get('cleanupFailure'),'Unresolved required report failure')
    for entry in gate.get('supportingReports',[]):
        require(entry['path'] not in names and digest(local(entry['path']))==entry['sha256'],'Diagnostic evidence changed or counted as a pass')
    emulator,code,visual,package=(read(QA/n) for n in ('emulator-verification.json','code-checks.json','visual-review.json','package-verification.json'))
    for key in ('reviewInput','designQA'):
        entry=visual.get(key)
        require(isinstance(entry,dict) and entry.get('path') and entry.get('sha256') and digest(local(entry['path']))==entry['sha256'],'Manual review/acceptance missing or changed: '+key)
    markdown=gate.get('reportMarkdown')
    require(isinstance(markdown,dict) and markdown.get('path')=='qa/test-12/REPORT.md' and digest(local(markdown['path']))==markdown.get('sha256'),'Delivery report changed after assembly')
    require(all(emulator.get(k) is True for k in ('emulatorTesting','gameplayTesting')) and emulator.get('installedAPK_SHA256')==candidate,'Exact installed-APK proof missing')
    require(all(emulator.get('checks',{}).get(k) is True for k in h['EMULATOR_CHECKS']),'A scoped status/world-opening/gameplay check is missing')
    sources=emulator.get('sourceReports',[])
    require(len(sources)>=3 and len({e['path'] for e in sources})==len(sources),'Distinct scoped raw reports required')
    raws=[]
    for entry in sources:
        p=local(entry['path']);require(p.is_relative_to(QA) and digest(p)==entry['sha256'],'Raw evidence changed/outside scoped QA')
        value=read(p);raws.append(value)
        actual=value.get('candidateAPK_SHA256') or value.get('identity',{}).get('candidateAPK_SHA256')
        require(value.get('passed') is True and actual==candidate and not any(value.get(k) for k in ('failure','cleanupFailure','recoveryFailure')),'Failed/wrong-APK raw evidence: '+entry['path'])
        if value.get('seeded') is True:require(value.get('fixtureDisclosure') and gate.get('limitations'),'Seeded native fixture requires disclosure')
    require(any(r.get('nativeFacilityCounts')=={'labs':5,'vehicleFactories':5,'cyborgFactories':5} and all(r.get('checks',{}).get(k) is True for k in ('fiveLabs','tenFactories','compactStatusLayout')) for r in raws),'Actual native 5/5/5 status/layout proof missing')
    require(any(r.get('seeded') is False and r.get('checks',{}).get('ordinaryProduction') is True for r in raws),'Unmodified native ordinary production proof missing')
    tests=code.get('tests',[])
    require(tests and len({t.get('name') for t in tests})==len(tests) and all(t.get('passed') is True and t.get('exitCode')==0 for t in tests),'Source checks incomplete/failed')
    require(h['REQUIRED_SOURCE_TESTS']<={t['name'] for t in tests},'Status/world-routing/lifecycle/Duel/Back source regression missing')
    require(next(t for t in tests if t['name']=='test-12-world-taps.cjs').get('args')==['--source'],'World geometry source check must use the input-free --source mode')
    require(visual.get('reviewed') is True and visual.get('screenshots') and isinstance(gate.get('limitations'),list),'Manual review/limitations missing')
    for entry in visual['screenshots']:
        p=local(entry['path'])
        require(p.is_relative_to(QA) and p.suffix.lower()=='.png' and p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') and digest(p)==entry['sha256'] and entry.get('accepted') is True,'Reviewed screenshot changed/missing/rejected')
    require(package.get('version')=='0.12' and all(package.get(k) is True for k in ('compiledEngineUnchanged','duelPayloadUnchanged','duelScenarioUnchanged','nativeAndroidSourceUnchanged','towersMapsRulesUnchanged','towersObserverOnlyDataChange')),'Wrong package scope/preservation proof')
    require(package.get('duelPayloadVerification',{}).get('passed') is True and package.get('towersPayloadVerification',{}).get('passed') is True,'Native VFS/Duel proof missing')
    current=package['sourceFiles']+package['nativeSourceFiles']+package['duelSourceFiles']+[package['observerSource']]+code.get('sourceFiles',[])+package['towersPayloadVerification']['appendSources']
    for entry in current:require(digest(local(entry['path']))==entry['sha256'],'Source changed after verification: '+entry['path'])
    for entry in package['preservedArtifacts']:require(digest(Path(entry['path']))==entry['sha256'],'Fallback changed: '+entry['path'])
    stable=h['stable_integrity'](full=False)
    require(stable['manifestSHA256']==package['stable']['manifestSHA256'] and package['stable'].get('allManifestFilesVerified') is True,'Stable preservation proof changed/incomplete')
    return candidate,package


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--output',type=Path,default=BASE)
    args=parser.parse_args();candidate,package=validate(args.apk)
    manifest=read(ROOT/'archive/repository-files.json')['files']
    for entry in manifest:
        p=local(entry['path']);require(p.is_file() and p.stat().st_size==entry['bytes'] and digest(p)==entry['sha256'],'Source manifest stale: '+entry['path'])
    listed=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0')
    files=[]
    for name in sorted(set(filter(None,listed))):
        rel=Path(name)
        if any(part in {'.git','.gradle','.kotlin','.idea','build','node_modules','__pycache__'} for part in rel.parts):continue
        require(rel.suffix.lower() not in {'.jks','.keystore','.pyc','.pem','.p12','.pfx'} and not rel.name.startswith('.env') and name not in {'local.properties','tools/live-cdp-url.txt'},'Private/local file in source inventory: '+name)
        p=local(name)
        if p.is_file():files.append((name,p))
    archive_names={n for n,_ in files}
    require({e['path'] for e in manifest}<=archive_names and 'archive/repository-files.json' in archive_names,'Source inventory incomplete')
    require({e['path'] for e in package['nativeSourceFiles']+package['duelSourceFiles']}<=archive_names,'Complete native/Duel sources or reproducible builder missing')
    apk,source,checksums=(args.output/n for n in ('Warzone-Towers-0.12.apk','warzone-towers-0.12-source.zip','Warzone-Towers-0.12-SHA256.txt'))
    partial=source.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk,source,checksums,partial)),'Existing delivery/partial must not be overwritten')
    args.output.mkdir(parents=True,exist_ok=True)
    with ZipFile(partial,'w',ZIP_DEFLATED,compresslevel=3) as archive:
        for name,p in files:archive.write(p,name,compress_type=ZIP_STORED if p.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist())==len(archive_names) and set(archive.namelist())==archive_names,'Source archive inventory mismatch')
        for name,p in files:require(h['zip_digest'](archive,name)==digest(p),'Archived source differs: '+name)
    require(digest(args.apk)==candidate,'Candidate changed during packaging')
    shutil.copyfile(args.apk,apk);require(digest(apk)==candidate,'Delivered APK differs from tested candidate')
    partial.rename(source);source_digest=digest(source)
    checksums.write_text(f'{candidate}  {apk.name}\n{source_digest}  {source.name}\n',encoding='utf-8')
    print(json.dumps({'apk':str(apk),'candidateAPK_SHA256':candidate,'source':str(source),'sourceZIP_SHA256':source_digest,'sourceFiles':len(files),'checksums':str(checksums),'streamedEverySourceEntryCRCAndSHA':True},indent=2))


if __name__=='__main__':main()
