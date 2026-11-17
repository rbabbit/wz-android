"""Small host-only attachment checks; creates no APK/source ZIP or actual proof."""
from pathlib import Path
from hashlib import file_digest
import base64, importlib.util, io, json, uuid
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
packager=Path(__file__).resolve().parent/'package-normal-source.py'
if not packager.is_file():packager=Path(__file__).resolve().parent/'package-complete-source.py'
spec=importlib.util.spec_from_file_location('normal089_packager',packager)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def digest(path):
    with path.open('rb') as stream:return file_digest(stream,'sha256').hexdigest()

profile=ROOT/'source-overlay/normal-release-089/overlay-manifest.json'
if not profile.is_file():profile=ROOT/'normal-release-089/overlay-manifest.json'
before=digest(profile)
work=ROOT/'source-overlay'/('attachment-check-'+uuid.uuid4().hex)
assert work.resolve().is_relative_to((ROOT/'source-overlay').resolve())
runtime=work/'owned-runtime';runtime.mkdir(parents=True)
data=runtime/'view.json';data.write_text('{"fixtureOnly":true}\n')
image=runtime/'view.png';image.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCfYAAAAASUVORK5CYII='))
apk_sha='d'*64;apk_size=123
proof=work/'fixture-updater.json'
value=dict(passed=True,inAppUpdateJourneyVerified=True,candidateAPK_SHA256=apk_sha,versionCode=89,versionName='0.89',
           certificateSHA256=module.SIGNER,downloadedAPK_SHA256=apk_sha,downloadedAPKBytes=apk_size,
           fixtureOnly=True,evidenceFiles=[dict(path=str(p),sha256=digest(p)) for p in [data,image]])
proof.write_text(json.dumps(value))
destination=work/'valid'
manifest=module.updater_attachments(proof,apk_sha,apk_size,destination,runtime)
assert len(manifest['files'])==3
for row in manifest['files']:
    p=destination/row['path'];assert digest(p)==row['sha256'] and p.stat().st_size==row['bytes']
assert module.updater_attachments(proof,apk_sha,apk_size,destination,runtime)==manifest

def refused(target):
    try:module.updater_attachments(proof,apk_sha,apk_size,target,runtime)
    except RuntimeError:return
    raise AssertionError('Expected updater attachment refusal')

original=data.read_bytes();data.write_bytes(original+b'TAMPERED')
refused(work/'tampered');assert not (work/'tampered').exists();data.write_bytes(original)
path_open=Path.open
def changed_during_read(path,mode='r',*args,**kwargs):
    if path==data and mode=='rb':
        with path_open(path,mode,*args,**kwargs) as stream:value=stream.read()
        return io.BytesIO(value+b'CHANGED_DURING_READ')
    return path_open(path,mode,*args,**kwargs)
with mock.patch.object(Path,'open',changed_during_read): refused(work/'changed-during-read')
assert not (work/'changed-during-read').exists()
is_symlink=Path.is_symlink
def manifest_symlink(path):
    return True if path.name=='ATTACHMENTS.json' else is_symlink(path)
with mock.patch.object(Path,'is_symlink',manifest_symlink):
    refused(work/'manifest-symlink')
    with mock.patch.object(module,'PROFILE',work/'prepared-manifest-symlink'):
        try:module.prepared_attachments()
        except RuntimeError:pass
        else:raise AssertionError('Expected prepared manifest symlink refusal')
assert not (work/'manifest-symlink').exists()
outside=work/'outside.json';outside.write_text('{"outsideOwnedRuntime":true}')
value['evidenceFiles']=[dict(path=str(outside),sha256=digest(outside))];proof.write_text(json.dumps(value))
refused(work/'outside-target');assert not (work/'outside-target').exists()
assert digest(profile)==before
result=dict(passed=True,scope='Host-only synthetic attachment fixtures; no actual runtime/update proof',
            packagerSHA256=digest(packager),
            positiveCopiesAndHashes=True,repeatedExactCopy=True,tamperedInputRefusedBeforeCopy=True,
            outsideOwnedRuntimeRefusedBeforeCopy=True,sourceOverrideManifestUnchanged=True,
            changedDuringReadRefusedBeforeCopy=True,manifestSymlinkRefusedMock=True,
            sourceProfileManifestSHA256=before,APKOrZIPCreated=False,fixture=str(work))
(ROOT/'release-records').mkdir(parents=True,exist_ok=True)
(ROOT/'release-records/update-attachment-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
