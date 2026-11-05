"""Package the exact tested campaign APK and complete editable source snapshot."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED
import json, subprocess, shutil

root=Path(__file__).resolve().parents[1]
output=root.parent
gate=json.loads((root/'qa/campaign-v1/delivery-gate.json').read_text(encoding='utf8'))
built=root/'app/build/outputs/apk/debug/app-debug.apk'
assert gate['passed'] and gate['apkSHA256']==sha256(built.read_bytes()).hexdigest()
assert not subprocess.check_output(['git','status','--porcelain'],cwd=root).strip(),'Commit tested source first'
apk=output/'Warzone-Campaign-Test-v1.apk'
archive=output/'warzone-campaign-test-v1-source.zip'
assert not apk.exists() and not archive.exists(),'Delivery artifacts are frozen; use a new version'
shutil.copyfile(built,apk)
names=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode('utf8').split('\0')
with ZipFile(archive,'w',ZIP_DEFLATED,compresslevel=5) as z:
    for name in names:
        if name and (root/name).is_file():z.write(root/name,name)
with ZipFile(archive) as z:
    assert z.testzip() is None
    assert b'com.rbabbit.warzonecampaign' in z.read('app/build.gradle.kts')
    assert z.read('app/src/main/assets/warzone/warzone2100.data')==(root/'app/src/main/assets/warzone/warzone2100.data').read_bytes()
    assert json.loads(z.read('qa/campaign-v1/delivery-gate.json'))['passed']
lines=[]
for artifact in (apk,archive):
    digest=sha256(artifact.read_bytes()).hexdigest()
    lines.append(digest+'  '+artifact.name)
    print(artifact.name,artifact.stat().st_size,digest)
(output/'Warzone-Campaign-Test-v1-SHA256.txt').write_text('\n'.join(lines)+'\n',encoding='utf8')
