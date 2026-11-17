"""Prepare/check the complete normal0.89 source profile; --package is final only."""
from pathlib import Path, PurePosixPath
from hashlib import file_digest, sha256
from datetime import datetime, timezone
import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = Path('C:/timerApp/warzone-towers-0.87-google-play-source.zip')
BASE_SHA = '1ba4c59a0804793284faaeb25121d1239873bca161a87951594e7e660c3f6320'
OUTPUT = Path('C:/timerApp/warzone-towers-0.89-source.zip')
PROFILE_NAME = 'normal-release-089'
PROFILE = ROOT/'source-overlay'/PROFILE_NAME
RUNTIME_EVIDENCE = ROOT.parents[1]/'normal-update-089-20261116'
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
ASSETS = [
    'multiplayer/session.js', 'multiplayer/warzone2100.js', 'multiplayer/warzone2100.wasm',
    'warzone-campaign-hud.js', 'warzone-touch-controls.js', 'warzone/ui/towers-game-controls.css',
    'warzone/warzone2100-towers-052.js', 'warzone/warzone2100-towers-052.wasm',
    'warzone/warzone2100.js', 'warzone/warzone2100.wasm',
    'warzone/warzone2100-campaign.js', 'warzone/warzone2100-ffa.js', 'warzone/warzone2100-duel.js',
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)


def jwrite(path, value):
    write(path, (json.dumps(value, indent=2)+'\n').encode())


def readjson(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def safe_name(name):
    value = PurePosixPath(name)
    require(not value.is_absolute() and '..' not in value.parts and '\\' not in name and ':' not in name,
            'Invalid archive/profile path: '+name)
    require(name and str(value) == name, 'Noncanonical archive/profile path: '+name)
    return name


def current(path):
    return digest(path) if path.is_file() else None


def normal_inputs():
    paths = {'AGENTS.md', 'app/build.gradle.kts', 'tools/build-normal-apk.py'}
    paths.update('app/src/main/assets/'+name for name in ASSETS)
    for tool in (ROOT/'tools').iterdir():
        if tool.is_file() and '089' in tool.name:
            require(tool.suffix in {'.py','.cjs','.sh','.java'}, 'Unreviewed0.89 tool type: '+tool.name)
            paths.add(tool.relative_to(ROOT).as_posix())
    native = ROOT/'vendor/native-089'
    manifest = readjson(native/'source-provenance-manifest.json')
    require(len(manifest['files']) == 46, 'Review changed native source manifest before packaging')
    for row in manifest['files']:
        require(digest(ROOT/row['path']) == row['sha256'], 'Native reproduction input changed: '+row['path'])
        paths.add(row['path'])
    for path in native.rglob('*'):
        if not path.is_file():
            continue
        relative = path.relative_to(native)
        # Objects, raw generated payloads/HTML and host-test executables are not source inputs.
        if relative.parts[0] in {'objects', 'raw'}:
            continue
        if relative.parts[0] == 'integrated' and path.name != 'runtime-integration.json':
            continue
        if relative.parts[0] == 'checks' and path.suffix not in {'.json', '.log', '.txt'}:
            continue
        if path.suffix.lower() in {'.o', '.a', '.exe', '.obj', '.data', '.html', '.pyc'}:
            continue
        require(relative.parts[0] in {'source','patches','bootstrap','proof','recipes','logs','checks','integrated'}
                or (len(relative.parts)==1 and path.name in {'BOOTSTRAP.md','build-plan.json','native-build.json',
                    'runtime-integration.json','source-provenance-manifest.json'}),
                'Unreviewed native packaging path: '+str(relative))
        require(path.suffix.lower() in {'.cpp','.inc','.h','.patch','.json','.txt','.py','.sh','.md','.log'},
                'Unreviewed native packaging file type: '+str(relative))
        paths.add(path.relative_to(ROOT).as_posix())
    for name in ['initial-fallback.json', 'ISSUES-AND-CHECKS.md', 'all-combat-ui-089-checks.json',
                 'campaign-layout-js-089-checks.json', 'vps-deploy-guard-checks.json',
                 'deployment-independent-review.json', 'source-package-independent-review.json', 'apk-integrity.json']:
        require((ROOT/'release-records'/name).is_file(), 'Missing source/check record: '+name)
        paths.add('release-records/'+name)
    return sorted(paths)


PREPARE = r'''"""Apply the retained Play0.87 then exact normal0.89 source; build signed APK only."""
from pathlib import Path, PurePosixPath
from hashlib import file_digest
import argparse, json, shutil, subprocess, sys
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent

def require(value,message):
    if not value: raise RuntimeError(message)

def digest(path):
    if not path.is_file(): return None
    with path.open('rb') as stream: return file_digest(stream,'sha256').hexdigest()

def guarded(base,name):
    value=PurePosixPath(name)
    require(name and str(value)==name and not value.is_absolute() and '..' not in value.parts
            and '\\' not in name and ':' not in name,'Invalid profile path: '+name)
    path=base/name
    require(not path.is_symlink() and path.resolve().is_relative_to(base.resolve()),'Symlink/path escape: '+name)
    return path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-only',action='store_true')
    parser.add_argument('--keystore')
    parser.add_argument('--alias')
    parser.add_argument('--java-home')
    parser.add_argument('--android-sdk')
    parser.add_argument('--online',action='store_true')
    parser.add_argument('--test-ads',action='store_true')
    args=parser.parse_args()
    if not args.apply_only:
        require(all([args.keystore,args.alias,args.java_home,args.android_sdk]),
                'Normal APK build requires explicit --keystore, --alias, --java-home and --android-sdk')
    manifest=json.loads((HERE/'overlay-manifest.json').read_text(encoding='utf-8'))
    rows=manifest['files']; normal={row['path']:row for row in rows}
    play=manifest['retainedPlayFiles']
    # Validate every source and destination BEFORE any copy or retained-profile invocation.
    for item in manifest['retainedProfileFiles']:
        require(digest(guarded(ROOT,item['path']))==item['sha256'],'Retained Play profile changed: '+item['path'])
    for row in rows:
        require(digest(guarded(HERE/'overrides',row['path']))==row['normalSHA256'],'Invalid normal override: '+row['path'])
    destinations={row['path']:set([row['rootBaselineSHA256'],row['normalSHA256']]) for row in rows}
    for row in play:
        destinations.setdefault(row['path'],set()).update([row['baselineSHA256'],row['playSHA256']])
    for name,allowed in destinations.items():
        require(digest(guarded(ROOT,name)) in allowed,'Preserve local edits before applying normal profile: '+name)
    # The original retained wrapper cannot accept a newer normal value. If a partial
    # known-state extraction still needs Play preparation, normalize overlapping
    # normal files to their exact retained Play bytes, then use its original guards.
    need_play=any(digest(ROOT/row['path']) not in
                  {row['playSHA256'],normal.get(row['path'],{}).get('normalSHA256',row['playSHA256'])}
                  for row in play)
    if need_play:
        for row in play:
            if row['path'] in normal and digest(ROOT/row['path'])==normal[row['path']]['normalSHA256']:
                path=guarded(ROOT,row['path']); path.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(ROOT/'google-play-release/overrides'/row['path'],path)
        subprocess.run([sys.executable,str(ROOT/'google-play-release/prepare-and-build.py'),'--apply-only'],cwd=ROOT,check=True)
    for row in rows:
        destination=guarded(ROOT,row['path']); destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(HERE/'overrides'/row['path'],destination)
    expected={row['path']:row['playSHA256'] for row in play}
    expected.update({row['path']:row['normalSHA256'] for row in rows})
    require(all(digest(ROOT/name)==value for name,value in expected.items()),'Applied source identity mismatch')
    print('Applied exact normal0.89 source; updater enabled; no AAB target.')
    if not args.apply_only:
        command=[sys.executable,str(ROOT/'tools/build-normal-apk.py'),'--keystore',args.keystore,'--alias',args.alias,
                 '--java-home',args.java_home,'--android-sdk',args.android_sdk]
        if args.online: command.append('--online')
        if args.test_ads: command.append('--test-ads')
        raise SystemExit(subprocess.run(command,cwd=ROOT).returncode)
if __name__=='__main__': main()
'''


README = '''# Complete Warzone Towers normal0.89 source

This archive preserves all14,008 members of the immutable complete Google Play
0.87 source, including all historical source/assets and the full native source
snapshot. The normal-release-089 profile adds the exact new normal0.89 source.
Extract the ENTIRE archive into a new directory; retain both profile folders.

Prepare the current source without building:

    python normal-release-089/prepare-and-build.py --apply-only

Build only the signed normal/updater APK with explicitly supplied private inputs:

    python normal-release-089/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK

No key, alias secret/password, local SDK settings, SSH keys or runtime userdata
is provided. Use the existing normal publisher key (certificate4499efe0...),
not the Google Play upload key. Passwords are prompted without echo or read from
the builder's documented private environment. --online allows Gradle downloads;
the default uses cached dependencies. Output: app/build/outputs/apk/release/
app-release.apk. This wrapper never requests an AAB or publishes any artifact.

The wrapper applies the original guarded google-play-release --apply-only first
when needed, then normal0.89 overrides. It preflights every managed destination
and retained profile source before changes. Repeated full application and
interrupted mixtures containing only exact baseline/Play/normal bytes are
supported; unrelated local edits are refused before mutation. Copying is not an
atomic filesystem transaction; a disk/process failure can leave a recognized
partial state, which can be reapplied. Preserve unrelated local work separately.
Running Gradle at an untouched extracted root builds the historical baseline;
apply this normal profile first. The retained Play profile remains available
for historical reproduction and is not the default normal build wrapper.

Version0.89/code89 retains notification consent and enables normal signed APK
updates. Horizontal selected-unit health/background rectangles are removed in
all four modes; selection corners and unrelated status remain. ALL COMBAT uses
actual owned native combat/selected IDs. The abandoned0.88 camera pilot is not
included. All data/maps/media and the network protocol remain unchanged.

Compiled JS/WASM are supplied as three exact source-built pairs: shared0.51 for
Campaign/FFA, Towers0.52 with its retained loss notice, and Multiplayer082.
Campaign, FFA and deferred Duel each also have their own full generated loader,
rebuilt from the new shared raw JS with their frozen per-mode package adapters.
These six full JS loaders and three WASM files are nine compiled assets total.
See vendor/native-089/BOOTSTRAP.md AFTER application for complete retained native
source bootstrap, pinned toolchains, source patches, isolated warm-cache build
commands, raw/output hashes, integration proofs and focused C++ source checks.
Native object caches/test executables and redundant generated data/HTML are
excluded. A full fresh dependency rebuild was documented, not executed; exact
delivery binaries were built using the recorded unchanged warm dependencies.

VALIDATION.json, APK-INTEGRITY.json, RUNTIME.json, PUBLICATION.json and AUDIT.md
describe the exact checked APK, observed gameplay and publication checks/limits.
UPDATE-JOURNEY.json and validation/update-journey/ retain the actual in-app update
report and explicitly hashed PNG/JSON evidence. ATTACHMENTS.json binds their
packaged names, sizes and hashes. These are audit attachments, not app sources.
RESTORE-CHECK.json records source restoration only; scripts/build checks do not
establish Android gameplay. Fixture userdata, host keys and live runtime files
are intentionally excluded. Existing historical archive members are preserved.
'''


RELEASE_NOTES = '''# Normal0.89 verification conditions

The delivery retains the normal publisher signing chain, updater and version
0.89/code89. Its app sources and compiled native pairs are bound by the source
override manifest and exact APK integrity/runtime records.

Fixture disclosure: Towers checks use a disclosed private native saved-state
fixture with two seeded MG tanks. Campaign uses an existing native campaign
checkpoint. FFA and Multiplayer production checks require ordinary native
Manufacturing; a pass is claimed only where the final runtime report confirms
it. Seeded/checkpoint states are test infrastructure and are
not bundled into the APK or substituted for ordinary production checks.

The baseline emulator renders black terrain. Screens, native IDs/selection,
orders/production and input returns can be checked there; this evidence does
not establish physical-device terrain quality. Read AUDIT.md and the actual
runtime/update reports for exact observations and any remaining limits.

The failed first0.89 candidate (858a1000...) had an old dedicated Campaign
loader paired with the new shared WASM. The corrected B2 candidate is bound
by its full SHA256 in VALIDATION.json. All six full generated JS loaders and
three WASM files pass the recorded static native-pair proof; runtime claims
come only from the exact B2 APK reports, not that static check alone.
'''


def prepared_attachments():
    """Permit only exact previously generated audit attachment members."""
    path=PROFILE/'ATTACHMENTS.json'
    require(not path.is_symlink() and path.resolve().is_relative_to(PROFILE.resolve()), 'Unsafe prepared attachment manifest')
    if not path.is_file():
        return set()
    value=readjson(path)
    require(value.get('schemaVersion') == 1 and value.get('kind') == 'Post-publication updater audit attachments',
            'Unrecognized attachment manifest')
    result={'ATTACHMENTS.json'}
    for row in value.get('files',[]):
        name=safe_name(row['path'])
        require(name == 'UPDATE-JOURNEY.json' or name.startswith('validation/update-journey/'), 'Unreviewed attachment member')
        target=PROFILE/name
        require(target.is_file() and not target.is_symlink() and target.resolve().is_relative_to(PROFILE.resolve()),
                'Missing/symlink attachment: '+name)
        require(target.stat().st_size == row['bytes'] and digest(target) == row['sha256'], 'Prepared attachment changed: '+name)
        require(name not in result, 'Duplicate prepared attachment')
        result.add(name)
    return result


def updater_attachments(proof_path, apk_sha, apk_bytes, destination, runtime_root=RUNTIME_EVIDENCE, expected_report_sha=None):
    """Validate and copy only explicitly hash-bound updater JSON/images."""
    require(proof_path.is_file() and not proof_path.is_symlink(), 'Updater proof must be a regular file')
    require(proof_path.stat().st_size <= 4*1024*1024, 'Updater proof too large')
    with proof_path.open('rb') as stream: proof_bytes=stream.read(4*1024*1024+1)
    require(len(proof_bytes)<=4*1024*1024, 'Updater proof grew beyond bound')
    proof_sha=sha256(proof_bytes).hexdigest()
    if expected_report_sha is not None: require(proof_sha==expected_report_sha, 'Updater proof changed during packaging')
    require(not any(marker in proof_bytes for marker in [b'-----BEGIN OPENSSH PRIVATE KEY-----',
                b'-----BEGIN RSA PRIVATE KEY-----',b'-----BEGIN PRIVATE KEY-----']), 'Private key in updater proof refused')
    proof=json.loads(proof_bytes.decode('utf-8-sig'))
    require(proof.get('passed') is True and proof.get('inAppUpdateJourneyVerified') is True,
            'Actual in-app update journey has not passed')
    require(proof.get('candidateAPK_SHA256') == apk_sha and proof.get('versionCode') == 89
            and proof.get('versionName') == '0.89' and proof.get('certificateSHA256') == SIGNER,
            'Updater journey describes another APK/version/signer')
    require(proof.get('downloadedAPK_SHA256') == apk_sha and proof.get('downloadedAPKBytes') == apk_bytes,
            'Actual updater full-APK download identity missing')
    evidence=proof.get('evidenceFiles')
    require(isinstance(evidence,list) and bool(evidence), 'Updater evidence files are required')
    require(len(evidence) <= 64, 'Too many updater evidence attachments')
    payloads=[];seen=set();total=0
    for index,row in enumerate(evidence,1):
        require(isinstance(row,dict) and isinstance(row.get('path'),str)
                and re.fullmatch('[0-9a-f]{64}',str(row.get('sha256',''))), 'Invalid updater evidence reference')
        source=Path(row['path'])
        if not source.is_absolute(): source=proof_path.parent/source
        require(source.is_file() and not source.is_symlink(), 'Updater evidence must be a regular file')
        resolved=source.resolve()
        require(resolved.is_relative_to(runtime_root.resolve()), 'Updater evidence is outside the owned runtime directory')
        require(resolved not in seen, 'Duplicate updater evidence input');seen.add(resolved)
        require(source.suffix.lower() in {'.json','.png'}, 'Only updater JSON/PNG may be attached')
        require(not re.search(r'(?:^|[._-])(?:password|secret|credentials?|id_rsa|id_ed25519|keystore|known_hosts)(?:[._-]|$)',source.name,re.I),
                'Sensitive updater attachment name refused')
        size=source.stat().st_size;total+=size
        require(0<size<=32*1024*1024 and total<=128*1024*1024, 'Updater evidence attachment size bound exceeded')
        with source.open('rb') as stream: data=stream.read(32*1024*1024+1)
        require(len(data)==size and sha256(data).hexdigest()==row['sha256'], 'Updater evidence missing/changed: '+str(source))
        require(not any(marker in data for marker in [b'-----BEGIN OPENSSH PRIVATE KEY-----',
                    b'-----BEGIN RSA PRIVATE KEY-----',b'-----BEGIN PRIVATE KEY-----']), 'Private key in updater evidence refused')
        if source.suffix.lower()=='.json':
            json.loads(data.decode('utf-8-sig'))
        else:
            require(data.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG updater evidence')
        name='validation/update-journey/'+proof_sha+'/evidence-'+str(index).zfill(3)+source.suffix.lower()
        payloads.append((name,data))
    payloads.insert(0,('UPDATE-JOURNEY.json',proof_bytes))
    manifest=dict(schemaVersion=1,kind='Post-publication updater audit attachments',
                  candidateAPK_SHA256=apk_sha,sourceReportSHA256=proof_sha,
                  files=[dict(path=name,bytes=len(data),sha256=sha256(data).hexdigest()) for name,data in payloads])
    existing=destination/'ATTACHMENTS.json'
    require(not destination.is_symlink() and not existing.is_symlink()
            and existing.resolve().is_relative_to(destination.resolve()), 'Unsafe updater attachment manifest')
    if existing.is_file():
        require(readjson(existing)==manifest, 'Preserve previous updater attachments before changing proof')
    # All sources and bounds are validated before any audit attachment is copied.
    for name,data in payloads:
        target=destination/safe_name(name)
        require(not target.is_symlink() and target.resolve().is_relative_to(destination.resolve()), 'Unsafe updater attachment target')
        if target.exists(): require(digest(target)==sha256(data).hexdigest(), 'Preserve changed updater attachment')
    for name,data in payloads: write(destination/name,data)
    jwrite(destination/'ATTACHMENTS.json',manifest)
    return manifest


def prepare_profile(source):
    old = json.loads(source.read('google-play-release/overlay-manifest.json'))
    names = set(source.namelist())
    require(len(names) == 14008 and len(names) == len(source.namelist()), 'Unexpected/duplicate complete baseline members')
    rows = []
    allowed = set()
    for name in normal_inputs():
        safe_name(name)
        path = ROOT/name
        require(path.is_file() and not path.is_symlink(), 'Missing/symlink source input: '+name)
        data = path.read_bytes()
        require(path.name not in {'local.properties','id_rsa','id_ed25519','known_hosts','.env'}
                and path.suffix.lower() not in {'.key','.pem','.jks','.keystore','.p12'}, 'Sensitive source path refused: '+name)
        require(not any(marker in data for marker in [b'-----BEGIN OPENSSH PRIVATE KEY-----',
                    b'-----BEGIN RSA PRIVATE KEY-----',b'-----BEGIN PRIVATE KEY-----']),
                'Private-key bytes refused: '+name)
        baseline = sha256(source.read(name)).hexdigest() if name in names else None
        rows.append(dict(path=name, rootBaselineSHA256=baseline, normalSHA256=sha256(data).hexdigest(), bytes=len(data)))
        write(PROFILE/'overrides'/name, data)
        allowed.add('overrides/'+name)
    retained = [dict(path=name, sha256=sha256(source.read(name)).hexdigest())
                for name in sorted(names) if name.startswith('google-play-release/') and not name.endswith('/')]
    manifest = dict(schemaVersion=1, versionCode=89, versionName='0.89', profile='normal-updater-apk-only',
                    completeBaselineArchive=BASE.name, completeBaselineSHA256=BASE_SHA,
                    completeBaselineMembers=14008, retainedPlayFiles=old['files'], retainedProfileFiles=retained, files=rows)
    jwrite(PROFILE/'overlay-manifest.json', manifest)
    write(PROFILE/'prepare-and-build.py', PREPARE.encode())
    write(PROFILE/'README.md', README.encode())
    write(PROFILE/'RELEASE-NOTES.md', RELEASE_NOTES.encode())
    write(PROFILE/'package-complete-source.py', Path(__file__).read_bytes())
    attachment_checks=ROOT/'release-records/update-attachment-checks.json'
    require(attachment_checks.is_file(), 'Run focused updater attachment checks before source preparation')
    attachment_check_record=readjson(attachment_checks)
    require(attachment_check_record.get('passed') is True
            and attachment_check_record.get('packagerSHA256')==digest(Path(__file__))
            and attachment_check_record.get('sourceProfileManifestSHA256')==digest(PROFILE/'overlay-manifest.json'),
            'Rerun focused updater attachment checks for the current packager/profile')
    write(PROFILE/'PACKAGING-CHECKS.json',attachment_checks.read_bytes())
    write(PROFILE/'check-update-attachments.py',(ROOT/'release-records/check-update-attachments.py').read_bytes())
    allowed.update({'overlay-manifest.json', 'prepare-and-build.py', 'README.md', 'RELEASE-NOTES.md', 'package-complete-source.py', 'RESTORE-CHECK.json', 'PACKAGING-CHECKS.json', 'check-update-attachments.py'})
    allowed.update({'VALIDATION.json', 'APK-INTEGRITY.json', 'RUNTIME.json', 'PUBLICATION.json', 'AUDIT.md'})
    allowed.update(prepared_attachments())
    actual = {p.relative_to(PROFILE).as_posix() for p in PROFILE.rglob('*') if p.is_file()}
    require(actual <= allowed, 'Unexpected/stale file in source profile: '+str(sorted(actual-allowed)))
    return manifest


def restore_checks(source, manifest):
    fixture = ROOT/'source-overlay'/('restore-check-normal089-'+uuid.uuid4().hex)
    require(fixture.resolve().is_relative_to((ROOT/'source-overlay').resolve()), 'Unsafe restore fixture')
    fixture.mkdir()
    names = set(source.namelist())
    inputs = {row['path'] for row in manifest['files']} | {row['path'] for row in manifest['retainedPlayFiles']}
    inputs |= {row['path'] for row in manifest['retainedProfileFiles']}
    for name in inputs:
        if name in names:
            write(fixture/name, source.read(name))
    shutil.copytree(PROFILE, fixture/PROFILE_NAME)
    command = [sys.executable, str(fixture/PROFILE_NAME/'prepare-and-build.py'), '--apply-only']

    def run(ok=True, args=None):
        p = subprocess.run(args or command, capture_output=True, text=True)
        require((p.returncode == 0) == ok, 'Restore check return mismatch: '+p.stdout+p.stderr)
        return p

    def state():
        return {name: current(fixture/name) for name in sorted(inputs)}

    def exact():
        expected = {r['path']: r['playSHA256'] for r in manifest['retainedPlayFiles']}
        expected.update({r['path']: r['normalSHA256'] for r in manifest['files']})
        require(all(current(fixture/name) == value for name, value in expected.items()), 'Restored source differs')

    run(); exact()
    stable = state(); run(); require(state() == stable, 'Repeated apply changed source'); exact()
    # Deliberately mix an already-normal overlap, a root baseline, a Play source,
    # and a missing newly-added source input. Reapplication must recover exactly.
    write(fixture/'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
          source.read('app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'))
    write(fixture/'app/build.gradle.kts', source.read('google-play-release/overrides/app/build.gradle.kts'))
    missing = fixture/'tools/build-normal-apk.py'; missing.unlink()
    run(); exact()
    for name in ['AGENTS.md', 'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java']:
        path = fixture/name; original = path.read_bytes()
        path.write_bytes(original+b'\nUNRELATED LOCAL EDIT GUARD\n')
        before = state(); run(False)
        require(state() == before, 'Local edit rejection mutated managed source')
        path.write_bytes(original)
    overridden = fixture/PROFILE_NAME/'overrides/tools/build-normal-apk.py'
    original = overridden.read_bytes(); overridden.write_bytes(original+b'\nTAMPERED OVERRIDE\n')
    before = state(); run(False); require(state() == before, 'Corrupt override mutated source')
    overridden.write_bytes(original)
    run(False, [sys.executable, str(fixture/PROFILE_NAME/'prepare-and-build.py'), '--keystore', 'dummy'])
    exact()
    report = dict(passed=True, completeBaselineSHA256=BASE_SHA,
                  sourceProfileManifestSHA256=digest(PROFILE/'overlay-manifest.json'),
                  firstApply=True, repeatedApply=True, interruptedKnownStateApply=True,
                  normalAndRetainedLocalEditRefusedBeforeMutation=True, corruptOverrideRefusedBeforeMutation=True,
                  explicitNormalSigningInputsRequired=True, buildOrGradleExecuted=False,
                  archiveCreated=False, fixture=str(fixture))
    jwrite(PROFILE/'RESTORE-CHECK.json', report)
    return report


def final_gates(manifest):
    records = ROOT/'release-records'
    final = readjson(records/'final-validation.json')
    integrity = readjson(records/'apk-integrity.json')
    runtime_path = records/'focused-runtime.json'
    runtime = readjson(runtime_path)
    apk = Path(integrity['apk'])
    expected = digest(apk)
    for label, proof in [('final', final), ('integrity', integrity), ('runtime', runtime)]:
        require(proof.get('passed') is True and proof.get('candidateAPK_SHA256') == expected,
                label+' proof has not passed for exact APK')
        require(proof.get('versionCode') == 89 and proof.get('versionName') == '0.89'
                and proof.get('certificateSHA256') == SIGNER, label+' release identity mismatch')
    require(final.get('sourceProfileManifestSHA256') == digest(PROFILE/'overlay-manifest.json'), 'Final source-profile identity mismatch')
    for key,name in [('integrityProof','apk-integrity.json'),('runtimeProof','focused-runtime.json')]:
        reference=final.get(key,{})
        require(reference.get('path')==name and reference.get('sha256')==digest(records/name), 'Final '+key+' reference mismatch')
    require(integrity.get('allSourceAssetsMatchAPK') is True and integrity.get('playStoreBuild') is False
            and integrity.get('aabBuilt') is False and integrity.get('bytes') == apk.stat().st_size,
            'Normal signed APK integrity contract mismatch')
    require(set(integrity.get('changedAssets', [])) == set(ASSETS), 'Unexpected APK source scope')
    # Reuse the reviewed deployer's exact four-mode runtime/evidence/hash gate;
    # loading its module does not invoke publication or SSH.
    spec = importlib.util.spec_from_file_location('normal089_deploy_proof_gate', ROOT/'tools/deploy-warzone-update-089.py')
    deploy = importlib.util.module_from_spec(spec); spec.loader.exec_module(deploy)
    deploy.validate_proofs(apk, expected, records/'apk-integrity.json', runtime_path)
    publication_ref = final.get('publicationProof', {})
    require(isinstance(publication_ref.get('path'), str), 'Post-publication proof reference required')
    publication_path = Path(publication_ref['path'])
    if not publication_path.is_absolute(): publication_path = records/publication_path
    require(publication_path.is_file() and digest(publication_path) == publication_ref.get('sha256'), 'Publication proof missing/changed')
    publication = readjson(publication_path)
    require(publication.get('state') == 'complete' and publication.get('sha256') == expected
            and publication.get('bytes') == apk.stat().st_size and publication.get('versionCode') == 89
            and publication.get('versionName') == '0.89', 'Post-publication proof release mismatch')
    public_apk=publication.get('externalAPK',{});public_feed=publication.get('externalFeed',{})
    require(public_apk.get('sha256') == expected and public_apk.get('bytes') == apk.stat().st_size
            and public_apk.get('fullResponseVerified') is True and public_apk.get('url') == deploy.PUBLIC_APK,
            'Post-publication full canonical APK proof missing')
    require(public_feed.get('verified') is True and public_feed.get('url') == deploy.PUBLIC_FEED
            and public_feed.get('sha256') == publication.get('feedSHA256')
            and publication.get('feedPublished') is True and publication.get('externalFeedVerified') is True
            and publication.get('fullExternalAPKVerifiedBeforeFeed') is True
            and publication.get('websiteUnchanged') is True and publication.get('caddyUnchanged') is True,
            'Post-publication matching feed/website proof missing')
    require((records/'AUDIT.md').is_file(), 'Final observed audit required')
    require(final.get('auditSHA256')==digest(records/'AUDIT.md'), 'Final audit reference changed')
    update_ref=final.get('postPublicationUpdateProof',{})
    require(isinstance(update_ref.get('path'),str), 'Separate actual updater journey proof required')
    update_path=Path(update_ref['path'])
    if not update_path.is_absolute(): update_path=records/update_path
    require(update_path.is_file() and digest(update_path)==update_ref.get('sha256'), 'Updater proof missing/changed')
    with zipfile.ZipFile(apk) as packed:
        for row in manifest['files']:
            if row['path'].startswith('app/src/main/assets/'):
                name = 'assets/'+row['path'].removeprefix('app/src/main/assets/')
                with packed.open(name) as stream:
                    require(file_digest(stream, 'sha256').hexdigest() == row['normalSHA256'], 'Current profile asset differs from APK: '+name)
    updater_attachments(update_path,expected,apk.stat().st_size,PROFILE,expected_report_sha=update_ref['sha256'])
    for destination, source in [('VALIDATION.json', records/'final-validation.json'),
                                ('APK-INTEGRITY.json', records/'apk-integrity.json'),
                                ('RUNTIME.json', runtime_path), ('PUBLICATION.json', publication_path),
                                ('AUDIT.md', records/'AUDIT.md')]:
        write(PROFILE/destination, source.read_bytes())
    return expected


def package():
    require(not OUTPUT.exists(), 'Refusing to overwrite delivery source archive')
    # Exclusive output creation, preserving every original compressed/local record byte.
    with BASE.open('rb') as source, OUTPUT.open('xb') as target:
        shutil.copyfileobj(source, target, 8*1024*1024)
    with zipfile.ZipFile(BASE) as before:
        original = before.infolist(); prefix = before.start_dir
    with zipfile.ZipFile(OUTPUT, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
        for path in sorted(PROFILE.rglob('*')):
            if path.is_file():
                require(not path.is_symlink(), 'Profile symlink refused')
                target.write(path, PROFILE_NAME+'/'+path.relative_to(PROFILE).as_posix())
    with zipfile.ZipFile(OUTPUT) as after:
        names = after.namelist()
        require(len(names) == len(set(names)), 'Duplicate archive members')
        require(names[:len(original)] == [x.filename for x in original], 'Original member order changed')
        for old, new in zip(original, after.infolist()[:len(original)]):
            require((old.CRC, old.file_size, old.compress_size, old.header_offset, old.compress_type) ==
                    (new.CRC, new.file_size, new.compress_size, new.header_offset, new.compress_type), 'Original member metadata changed')
        for path in PROFILE.rglob('*'):
            if path.is_file():
                with after.open(PROFILE_NAME+'/'+path.relative_to(PROFILE).as_posix()) as stream:
                    require(file_digest(stream, 'sha256').hexdigest() == digest(path), 'Packaged profile differs')
    with BASE.open('rb') as before, OUTPUT.open('rb') as after:
        remaining = prefix
        while remaining:
            amount = min(8*1024*1024, remaining)
            require(before.read(amount) == after.read(amount), 'Original local-record prefix changed')
            remaining -= amount
    return dict(output=str(OUTPUT), bytes=OUTPUT.stat().st_size, sha256=digest(OUTPUT),
                allOriginal14008MembersPreserved=True, originalLocalRecordPrefixBytes=prefix,
                originalLocalRecordPrefixByteIdentical=True, noDuplicateMembers=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', action='store_true', help='Final archive creation, only after final/runtime/publication proof')
    args = parser.parse_args()
    require(digest(BASE) == BASE_SHA, 'Immutable complete0.87 source archive changed')
    with zipfile.ZipFile(BASE) as source:
        manifest = prepare_profile(source)
        # Final gate runs before the final restore fixture or archive is created.
        apk_sha = final_gates(manifest) if args.package else None
        report = restore_checks(source, manifest)
    report.update(profile=str(PROFILE), sourceFiles=len(manifest['files']),
                  sourceProfileManifestSHA256=digest(PROFILE/'overlay-manifest.json'),
                  recordedUTC=datetime.now(timezone.utc).isoformat())
    if args.package:
        report.update(package(), archiveCreated=True, candidateAPK_SHA256=apk_sha)
    jwrite(ROOT/'release-records/source-package-validation.json', report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
