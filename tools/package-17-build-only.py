"""Package 0.17 after a source audit/build; no tests, emulator or runtime checks.

Hashing, APK metadata inspection and source archive readback are packaging
integrity operations only. This tool does not import or reuse older QA gates.
"""
from pathlib import Path
from hashlib import file_digest
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent
STORED={'.gz','.xz','.zst','.zip','.png','.jpg','.jpeg','.webp','.ogg','.mp3','.wasm','.data','.woff2'}
SKIP={'.git','.gradle','.kotlin','.idea','build','node_modules','__pycache__'}


def require(value,message):
    if not value:raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:return file_digest(stream,'sha256').hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--output',type=Path,default=BASE)
    args=parser.parse_args();candidate=digest(args.apk)
    require(candidate==args.expected_sha256,'Built APK differs from the supplied candidate hash')
    fallback=ROOT/'archive/fallback-0.17.json';saved=json.loads(fallback.read_text(encoding='utf-8'))
    for entry in saved['files']:
        path=Path(entry['path']);require(path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256'],'0.16 fallback changed: '+str(path))
    baseline=Path(saved['files'][0]['path'])
    with ZipFile(args.apk) as apk,ZipFile(baseline) as old:
        require(apk.testzip() is None,'Built APK archive CRC mismatch')
        new_names=set(apk.namelist());old_names=set(old.namelist())
        require(not old_names-new_names and new_names-old_names<={'assets/warzone/ui/icons/deselect.svg'},'APK member inventory changed unexpectedly')
        changed=[]
        for name in apk.namelist():
            if name not in old_names:
                changed.append(name);continue
            with old.open(name) as stream:before=file_digest(stream,'sha256').hexdigest()
            with apk.open(name) as stream:after=file_digest(stream,'sha256').hexdigest()
            if before!=after:changed.append(name)
        expected_assets={'assets/warzone-touch-controls.js','assets/warzone-command-pages.js','assets/warzone/ui/towers-shell.css','assets/warzone/ui/icons/deselect.svg'}
        changed_assets={name for name in changed if name.startswith('assets/')}
        require(changed_assets==expected_assets,'Unexpected changed APK assets')
        require(all(name in expected_assets or name in {'AndroidManifest.xml','resources.arsc'} or re.fullmatch(r'classes(?:\d+)?\.dex',name) or re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))',name,re.I) for name in changed),'APK changes exceed the field-menu assets/version/signing metadata')
    sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    badging=subprocess.check_output([str(sdk/'build-tools/36.1.0/aapt2.exe'),'dump','badging',str(args.apk)],text=True,encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='17'","versionName='0.17'","application-label:'Warzone Towers'")),'Built APK has the wrong package/version/label')
    paths=[args.output/name for name in ('Warzone-Towers-0.17.apk','warzone-towers-0.17-source.zip','Warzone-Towers-0.17-SHA256.txt')]
    apk_out,source,checksums=paths;partial=source.with_suffix('.zip.partial')
    require(not any(path.exists() for path in paths+[partial]),'Existing delivery or partial archive must not be overwritten')
    record={'version':'0.17','versionCode':17,'candidateAPK_SHA256':candidate,'scope':'Source audit and Android build only; no tests, emulator or gameplay/runtime verification.','testingPerformed':False,'emulatorUsed':False,'runtimeVerified':False,'packagingIntegrityOnly':True,'changedAPKMembers':changed,'unchangedOtherAPKAssets':True,'fallbackRecord':{'path':'archive/fallback-0.17.json','sha256':digest(fallback)},'recordedUTC':datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}
    (ROOT/'archive/release-0.17-build-only.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    subprocess.run([sys.executable,str(ROOT/'tools/verify-project.py'),'--refresh'],cwd=ROOT,check=True)
    manifest=json.loads((ROOT/'archive/repository-files.json').read_text(encoding='utf-8'))['files']
    names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0');files=[]
    for name in sorted(set(filter(None,names))):
        rel=Path(name)
        if any(part in SKIP for part in rel.parts):continue
        require(rel.suffix.lower() not in {'.jks','.keystore','.pyc','.pem','.p12','.pfx'} and not rel.name.startswith('.env') and name not in {'local.properties','tools/live-cdp-url.txt'},'Private/local file in source inventory: '+name)
        path=ROOT/rel
        if path.is_file():files.append((name,path))
    expected={entry['path']:entry for entry in manifest}
    require(set(expected)|{'archive/repository-files.json'}=={name for name,_ in files},'Complete source inventory differs from the refreshed manifest')
    args.output.mkdir(parents=True,exist_ok=True)
    with ZipFile(partial,'w',ZIP_DEFLATED,compresslevel=3) as archive:
        for name,path in files:archive.write(path,name,compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist())==len(files),'Source archive entry count mismatch')
        for name,path in files:
            with archive.open(name) as stream:archived=file_digest(stream,'sha256').hexdigest()
            require(archived==digest(path) and (name not in expected or archived==expected[name]['sha256']),'Archived source differs: '+name)
    require(digest(args.apk)==candidate,'Built APK changed during packaging')
    shutil.copyfile(args.apk,apk_out);require(digest(apk_out)==candidate,'Delivered APK differs from built APK')
    partial.rename(source);source_sha=digest(source)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source.name}\n',encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed':True,'testingPerformed':False,'emulatorUsed':False,'runtimeVerified':False,'apk':str(apk_out),'apkBytes':apk_out.stat().st_size,'candidateAPK_SHA256':candidate,'source':str(source),'sourceBytes':source.stat().st_size,'sourceZIP_SHA256':source_sha,'sourceFiles':len(files),'checksums':str(checksums),'streamedEverySourceEntryCRCAndSHA':True},indent=2))


if __name__=='__main__':main()
