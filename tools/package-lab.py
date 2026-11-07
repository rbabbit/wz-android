"""Package the exact verified Lab APK and complete editable isolated project."""
from pathlib import Path
from hashlib import file_digest
from zipfile import ZipFile, ZIP_DEFLATED
import argparse, json, shutil, subprocess

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
p.add_argument('--output',type=Path,default=ROOT.parent)
args=p.parse_args()
def digest(path):
    with path.open('rb') as f:return file_digest(f,'sha256').hexdigest()
gate=json.loads((ROOT/'qa/lab-01/DELIVERY.json').read_text(encoding='utf-8'))
assert gate['passed'] is True and gate['emulatorTesting'] is True
assert gate['candidateAPK_SHA256']==digest(args.apk),'Delivery APK differs from observed tests'
for entry in gate['reports']:
    path=(ROOT/entry['path']).resolve()
    assert path.is_relative_to(ROOT) and path.is_file()
    assert digest(path)==entry['sha256'],'Verification record changed: '+entry['path']
check=json.loads((ROOT/'qa/lab-01/package-verification.json').read_text(encoding='utf-8'))
assert check['passed'] and check['candidateAPK_SHA256']==gate['candidateAPK_SHA256']
for entry in check['sourceFiles']:
    assert digest(ROOT/entry['path'])==entry['sha256'],'Runtime source changed after exact-APK verification: '+entry['path']
for file,expected in {
    'Warzone-Towers-v6.4-Build-Blueprints.apk':'12532300d9ce2010b911fae879a6e197eb059a98bd672901bd65307cd9f3532a',
    'warzone-towers-v6.4-build-blueprints-source.zip':'46346399ae4df757b2e9f7178fb427b2ae5c66c0352fb1c8e99d63da3302b610'
}.items():assert digest(ROOT.parent/file)==expected,'Stable fallback changed: '+file
stable=ROOT.parent/'wz-tower-defense'
assert subprocess.check_output(['git','status','--porcelain=v1'],cwd=stable,text=True)==''
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=stable,text=True).strip()=='9280cccad984320503240d9a39e7d766646c1dfe'
apk=args.output/'Warzone-Towers-Lab-01.apk'
source=args.output/'warzone-towers-lab-01-source.zip'
hashes=args.output/'Warzone-Towers-Lab-01-SHA256.txt'
assert not any(f.exists() for f in (apk,source,hashes)),'Never overwrite an existing delivery'
subprocess.run(['git','rev-parse','--show-toplevel'],cwd=ROOT,check=True,capture_output=True)
names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0')
paths=[]
for name in sorted(set(names)):
    if not name:continue
    f=(ROOT/name).resolve()
    assert f.is_relative_to(ROOT)
    assert not f.name.endswith(('.jks','.keystore')) and f.name!='local.properties' and not f.name.startswith('.env')
    if f.is_file():paths.append((name,f))
args.output.mkdir(parents=True,exist_ok=True)
shutil.copyfile(args.apk,apk)
with ZipFile(source,'w',ZIP_DEFLATED,compresslevel=6) as z:
    for name,f in paths:z.write(f,name)
hashes.write_text(f'{digest(apk)}  {apk.name}\n{digest(source)}  {source.name}\n',encoding='utf-8')
assert digest(apk)==gate['candidateAPK_SHA256']
print(json.dumps({'apk':str(apk),'apkSHA256':digest(apk),'source':str(source),'sourceSHA256':digest(source),'sourceFiles':len(paths),'checksums':str(hashes)},indent=2))
