"""Prepare complete0.91 TEST source; final --package requires exact APK runtime."""
from pathlib import Path, PurePosixPath
from hashlib import file_digest, sha256
import argparse, json, re, shutil, subprocess, sys, uuid, zipfile
ROOT = Path(__file__).resolve().parents[1]
BASE = Path('C:/timerApp/warzone-towers-0.90-test-source.zip')
BASE_SHA = '657f72b0f880d283ee4e83937cb2ba945119e0a1fb0399a26cc9b781705274a8'
OUTPUT = Path('C:/timerApp/warzone-towers-0.91-test-source.zip')
NAME = 'test-release-091'
PROFILE = ROOT / 'source-overlay' / NAME
RUNTIME = ROOT.parents[1] / 'players-091-20261116'
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
ASSETS = {'multiplayer/mobile-controls.js', 'multiplayer/index.html', 'warzone/warzone2100-ffa.js', 'warzone/warzone2100.js', 'multiplayer/multiplayer.css', 'warzone-command-pages.js', 'warzone/warzone2100-towers-052.wasm', 'warzone/warzone2100-duel.js', 'multiplayer/warzone2100.wasm', 'multiplayer/warzone2100.js', 'warzone/warzone2100-campaign.js', 'warzone/ui/towers-game-controls.css', 'warzone/warzone2100.wasm', 'warzone-touch-controls.js', 'multiplayer/session.js', 'warzone/warzone2100-towers-052.js'}

def document(data):
    return json.loads(data.decode('utf-8-sig'))

def require(value, message):
    if not value:
        raise RuntimeError(message)

def digest(path):
    with Path(path).open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()

def readjson(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)

def jwrite(path, value):
    write(path, (json.dumps(value, indent=2) + '\n').encode())

def safe(name):
    p = PurePosixPath(name)
    require(name and str(p) == name and (not p.is_absolute()) and ('..' not in p.parts) and ('\\' not in name) and (':' not in name), 'Unsafe profile path')
    return name

def target(name):
    p = PROFILE / safe(name)
    require(not PROFILE.is_symlink() and (not p.is_symlink()) and p.resolve().is_relative_to(PROFILE.resolve()), 'Unsafe audit attachment target')
    return p

def bounded(path, limit):
    require(path.is_file() and (not path.is_symlink()) and (0 < path.stat().st_size <= limit), 'Invalid/oversized proof file')
    with path.open('rb') as stream:
        data = stream.read(limit + 1)
    require(0 < len(data) <= limit, 'Proof grew beyond bound')
    return data

def stage(payloads):
    for name, data in payloads:
        secret_check(name, data)
        p = target(name)
        if p.exists():
            require(p.is_file() and digest(p) == sha256(data).hexdigest(), 'Preserve changed prepared audit attachment')
    for name, data in payloads:
        write(target(name), data)

def secret_check(name, data):
    require(Path(name).name not in {'local.properties', '.env', 'id_rsa', 'id_ed25519', 'known_hosts'} and Path(name).suffix.lower() not in {'.jks', '.keystore', '.key', '.pem', '.p12'}, 'Sensitive source path refused')
    require(not any((x in data for x in [b'-----BEGIN PRIVATE KEY-----', b'-----BEGIN OPENSSH PRIVATE KEY-----', b'-----BEGIN RSA PRIVATE KEY-----'])), 'Private key bytes refused')
WRAPPER = '"""Apply retained normal test0.90, then exact0.91 TEST source; build APK only."""\nfrom pathlib import Path,PurePosixPath\nfrom hashlib import file_digest\nimport argparse,json,shutil,subprocess,sys\nHERE=Path(__file__).resolve().parent;ROOT=HERE.parent\ndef require(value,message):\n if not value:raise RuntimeError(message)\ndef digest(path):\n if not path.is_file():return None\n with path.open(\'rb\')as stream:return file_digest(stream,\'sha256\').hexdigest()\ndef guarded(base,name):\n p=PurePosixPath(name);require(name and str(p)==name and not p.is_absolute()and\'..\'not in p.parts and\'\\\\\'not in name and\':\'not in name,\'Invalid profile path\')\n target=base/name;require(not target.is_symlink()and target.resolve().is_relative_to(base.resolve()),\'Profile path escape\');return target\ndef main():\n p=argparse.ArgumentParser(description=__doc__);p.add_argument(\'--apply-only\',action=\'store_true\')\n for name in [\'keystore\',\'alias\',\'java-home\',\'android-sdk\']:p.add_argument(\'--\'+name)\n p.add_argument(\'--online\',action=\'store_true\');p.add_argument(\'--test-ads\',action=\'store_true\');a=p.parse_args()\n if not a.apply_only:require(all([a.keystore,a.alias,a.java_home,a.android_sdk]),\'Explicit normal private --keystore/--alias/--java-home/--android-sdk required\')\n m=json.loads((HERE/\'overlay-manifest.json\').read_text());rows=m[\'files\'];test={r[\'path\']:r for r in rows}\n for row in m[\'retainedProfileFiles\']:require(digest(guarded(ROOT,row[\'path\']))==row[\'sha256\'],\'Retained source profile changed: \'+row[\'path\'])\n for row in rows:require(digest(guarded(HERE/\'overrides\',row[\'path\']))==row[\'testSHA256\'],\'Changed test override: \'+row[\'path\'])\n allowed={name:set(values)for name,values in m[\'acceptedRootHashes\'].items()}\n for row in rows:allowed.setdefault(row[\'path\'],set()).update([row[\'rootBaselineSHA256\'],row[\'priorSHA256\'],row[\'testSHA256\']])\n for name,values in allowed.items():require(digest(guarded(ROOT,name))in values,\'Preserve local edits before applying test profile: \'+name)\n prior=m[\'priorEffectiveFiles\']\n needed=any(digest(ROOT/name)not in {value,test.get(name,{}).get(\'testSHA256\',value)}for name,value in prior.items())\n if needed:\n  for name,value in prior.items():\n   if name in test and digest(ROOT/name)==test[name][\'testSHA256\']:\n    source=ROOT/m[\'priorOverrideSources\'][name];target=guarded(ROOT,name);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)\n  subprocess.run([sys.executable,str(ROOT/\'test-release-090/prepare-and-build.py\'),\'--apply-only\'],cwd=ROOT,check=True)\n for row in rows:\n  target=guarded(ROOT,row[\'path\']);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(HERE/\'overrides\'/row[\'path\'],target)\n expected=dict(prior);expected.update({r[\'path\']:r[\'testSHA256\']for r in rows})\n require(all(digest(ROOT/name)==value for name,value in expected.items()),\'Prepared test source identity mismatch\')\n print(\'Applied exact0.91 local TEST source. No AAB or publication target.\')\n if not a.apply_only:\n  command=[sys.executable,str(ROOT/\'tools/build-normal-apk.py\'),\'--keystore\',a.keystore,\'--alias\',a.alias,\'--java-home\',a.java_home,\'--android-sdk\',a.android_sdk]\n  if a.online:command.append(\'--online\')\n  if a.test_ads:command.append(\'--test-ads\')\n  raise SystemExit(subprocess.run(command,cwd=ROOT).returncode)\nif __name__==\'__main__\':main()\n'
README = "# Complete Warzone Towers0.91 TEST source\n\nThis archive retains EVERY member of the complete0.90 test checkpoint source ZIP, its original\ncompressed local-record bytes and historical engine/source/media inputs. The\ntest-release-091 profile adds the exact current test sources and native builds.\nExtract the ENTIRE ZIP and keep google-play-release, normal-release-089, test-release-090 and\ntest-release-091. The archive root initially represents historical source;\napply the test profile before building the current APK.\n\n    python test-release-091/prepare-and-build.py --apply-only\n    python test-release-091/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK\n\nThe wrapper prepares retained normal test0.90 first, then0.91 with SHA256 guards.\nFull repeated application and interrupted mixtures of exact root/Play/normal89/\ntest90/test91 bytes are supported. Unrelated local edits and changed override/profile\nsources are refused before mutation. Copies are not an atomic transaction;\npreserve unrelated work separately. Private signing keys/passwords, local SDK\nsettings, SSH keys and emulator userdata are excluded. Use the existing normal\npublisher key (certificate4499efe0...), not the Google Play upload key. Builder\npassword prompts do not echo. --online permits dependency downloads; otherwise\ncached Gradle dependencies are used. Output: app/build/outputs/apk/release/app-release.apk.\n\nVersion0.91/code91 is a LOCAL TEST APK. No AAB, VPS/feed/website, GitHub or Google\nPlay publication is performed or authorized by this profile. User testing and\nexplicit approval of this exact build are required before later publication.\nHistorical publication records/tools remain historical and are not test gates.\n\nPLAYERS is an opaque black/white read-only native roster across all modes and real spectators. Native capability gates preserve hidden statistics, blind names and rich observer details. Legacy navigation is context/role scoped. ALL COMBAT, selection, camera, gameplay/data/protocol behavior from90 remains. Final VALIDATION/RUNTIME/AUDIT distinguish actual complete checks from an incomplete test checkpoint. Historical90 limitations remain historical.\n\nAfter application, vendor/native-091/BUILD.md and CONTRACT.md document the exact\nthree native lineages, shared policy, source deltas, warm-cache commands and\nheader-safe cold bootstrap. Six full JS loaders and three WASM files are paired;\nall aliases are regenerated from their matching raw programs. Cold wrappers were\nsyntax checked, not rebuilt from fresh dependencies. Objects, redundant generated\ndata/HTML and host executables are excluded from the overlay.\n\nVALIDATION.json, APK-INTEGRITY.json, RUNTIME.json and AUDIT.md contain exact test\nAPK/runtime identity and explicit fixture/environment limits. JSON/PNG runtime\nevidence is exported only from the report's explicit hash-bound list; raw native\nsaves, full userdata and private host keys are not bundled as evidence. Restore\nchecks are source-only and do not replace actual Android gameplay verification.\n"

def inputs():
    paths = {'AGENTS.md', 'app/build.gradle.kts', 'tools/build-normal-apk.py'} | {'app/src/main/assets/' + x for x in ASSETS}
    for p in (ROOT / 'tools').iterdir():
        if p.is_file() and '091' in p.name:
            require(p.suffix in {'.py', '.cjs', '.sh', '.java'}, 'Unexpected091 tool')
            paths.add(p.relative_to(ROOT).as_posix())
    native = ROOT / 'vendor/native-091'
    manifest = readjson(native / 'source-provenance-manifest.json')
    for row in manifest['files']:
        require(digest(ROOT / row['path']) == row['sha256'], 'Native source input changed: ' + row['path'])
    for p in native.rglob('*'):
        if not p.is_file():
            continue
        rel = p.relative_to(native)
        if rel.parts[0] in {'objects', 'raw'}:
            continue
        if rel.parts[0] == 'integrated' and p.name != 'runtime-integration.json':
            continue
        if rel.parts[0] == 'checks' and p.suffix not in {'.json', '.txt', '.log'}:
            continue
        require(p.suffix in {'.cpp', '.h', '.inc', '.patch', '.json', '.txt', '.py', '.sh', '.md', '.log'}, 'Unreviewed native source type')
        paths.add(p.relative_to(ROOT).as_posix())
    for name in ['initial-fallback.json', 'PLAYERS-AUDIT-AND-CHECKS.md', 'players-ui-091-checks.json', 'players-combat-regression-091.json', 'players-native-ui-review-091.json', 'scoped-asset-changes.json']:
        require((ROOT / 'release-records' / name).is_file(), 'Missing source/check record: ' + name)
        paths.add('release-records/' + name)
    return sorted(paths)

def prepare(source):
    names = source.namelist()
    require(len(names) == len(set(names)) == 14383, 'Unexpected complete0.90 member set')
    previous = json.loads(source.read('test-release-090/overlay-manifest.json'))
    effective = dict(previous['priorEffectiveFiles'])
    sources = dict(previous['priorOverrideSources'])
    accepted = {name: set(values) for name, values in previous['acceptedRootHashes'].items()}
    for row in previous['files']:
        accepted.setdefault(row['path'], set()).update([row['rootBaselineSHA256'], row['priorSHA256'], row['testSHA256']])
        effective[row['path']] = row['testSHA256']
        sources[row['path']] = 'test-release-090/overrides/' + row['path']
    rows = []
    allowed = set()
    for name in inputs():
        safe(name)
        path = ROOT / name
        require(path.is_file() and (not path.is_symlink()), 'Missing/symlink source input')
        data = path.read_bytes()
        secret_check(name, data)
        raw = sha256(source.read(name)).hexdigest() if name in names else None
        rows.append(dict(path=name, rootBaselineSHA256=raw, priorSHA256=effective.get(name, raw), testSHA256=sha256(data).hexdigest(), bytes=len(data)))
        write(PROFILE / 'overrides' / name, data)
        allowed.add('overrides/' + name)
    retained = [dict(path=name, sha256=sha256(source.read(name)).hexdigest()) for name in names if name.startswith(('google-play-release/', 'normal-release-089/', 'test-release-090/')) and (not name.endswith('/'))]
    m = dict(schemaVersion=1, versionCode=91, versionName='0.91', profile='local-test-normal-apk-only', completeBaselineArchive=BASE.name, completeBaselineSHA256=BASE_SHA, completeBaselineMembers=14383, priorEffectiveFiles=effective, priorOverrideSources=sources, acceptedRootHashes={name: sorted(values, key=lambda x: x or '') for name, values in accepted.items()}, retainedProfileFiles=retained, files=rows)
    jwrite(PROFILE / 'overlay-manifest.json', m)
    write(PROFILE / 'prepare-and-build.py', WRAPPER.encode())
    write(PROFILE / 'README.md', README.encode())
    write(PROFILE / 'package-complete-source.py', Path(__file__).read_bytes())
    allowed.update({'overlay-manifest.json', 'prepare-and-build.py', 'README.md', 'package-complete-source.py', 'RESTORE-CHECK.json', 'VALIDATION.json', 'APK-INTEGRITY.json', 'RUNTIME.json', 'AUDIT.md', 'RUNTIME-ATTACHMENTS.json', 'PACKAGING-CHECKS.json'})
    attachment_manifest = target('RUNTIME-ATTACHMENTS.json')
    if attachment_manifest.is_file():
        for row in readjson(attachment_manifest)['files']:
            name = safe(row['path'])
            require(name.startswith('validation/runtime/'), 'Unexpected runtime attachment')
            require(digest(target(name)) == row['sha256'], 'Changed prepared attachment')
            allowed.add(name)
    actual = {p.relative_to(PROFILE).as_posix() for p in PROFILE.rglob('*') if p.is_file()}
    require(actual <= allowed, 'Unexpected/stale test profile files: ' + str(actual - allowed))
    return m

def restore(source, m):
    fixture = ROOT / 'source-overlay' / ('restore-check-test091-' + uuid.uuid4().hex)
    require(fixture.resolve().is_relative_to((ROOT / 'source-overlay').resolve()), 'Unsafe fixture')
    fixture.mkdir()
    paths = set(m['acceptedRootHashes']) | {x['path'] for x in m['files']}
    names = set(source.namelist())
    for name in paths | {x['path'] for x in m['retainedProfileFiles']}:
        if name in names:
            write(fixture / name, source.read(name))
    shutil.copytree(PROFILE, fixture / NAME)
    cmd = [sys.executable, str(fixture / NAME / 'prepare-and-build.py'), '--apply-only']

    def run(ok=True):
        p = subprocess.run(cmd, capture_output=True, text=True)
        require((p.returncode == 0) == ok, p.stdout + p.stderr)

    def state():
        return {name: digest(fixture / name) if (fixture / name).is_file() else None for name in paths}
    expected = dict(m['priorEffectiveFiles'])
    expected.update({x['path']: x['testSHA256'] for x in m['files']})

    def exact():
        require(all((digest(fixture / name) == value for name, value in expected.items())), 'Restore differs')
    run()
    exact()
    before = state()
    run()
    require(state() == before, 'Repeated apply differs')
    write(fixture / 'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java', source.read('app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'))
    write(fixture / 'app/build.gradle.kts', source.read('normal-release-089/overrides/app/build.gradle.kts'))
    (fixture / 'tools/build-native-players-091.py').unlink()
    run()
    exact()
    for name in ['AGENTS.md', 'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java']:
        p = fixture / name
        old = p.read_bytes()
        p.write_bytes(old + b'\nLOCAL EDIT GUARD\n')
        before = state()
        run(False)
        require(state() == before, 'Local-edit refusal mutated source')
        p.write_bytes(old)
    p = fixture / NAME / 'overrides/app/build.gradle.kts'
    old = p.read_bytes()
    p.write_bytes(old + b'TAMPERED')
    before = state()
    run(False)
    require(state() == before, 'Corrupt override mutated source')
    p.write_bytes(old)
    exact()
    result = dict(passed=True, firstApply=True, repeatedApply=True, interruptedKnownStateApply=True, localEditRefusedBeforeMutation=True, corruptOverrideRefusedBeforeMutation=True, buildOrPublicationExecuted=False, sourceProfileManifestSHA256=digest(PROFILE / 'overlay-manifest.json'), fixture=str(fixture))
    jwrite(PROFILE / 'RESTORE-CHECK.json', result)
    return result

def gates(m, allow_incomplete=False):
    records = ROOT / 'release-records'
    buffers = {name: bounded(records / name, 4 * 1024 * 1024) for name in ['final-validation.json', 'apk-integrity.json', 'focused-runtime.json', 'AUDIT.md', 'source-attachment-checks.json']}
    final = document(buffers['final-validation.json'])
    integrity = document(buffers['apk-integrity.json'])
    runtime = document(buffers['focused-runtime.json'])
    apk = Path(integrity['apk'])
    expected = digest(apk)
    for label, value in [('final', final), ('integrity', integrity), ('runtime', runtime)]:
        require(value.get('candidateAPK_SHA256') == expected and value.get('versionCode') == 91 and (value.get('versionName') == '0.91') and (value.get('certificateSHA256') == SIGNER), label + ' proof identity mismatch')
    require(integrity.get('passed') is True, 'Exact normal test integrity must pass')
    complete = runtime.get('passed') is True
    if complete:
        require(final.get('passed') is True, 'Complete final validation required')
        require(set(runtime.get('modesVerified', [])) == {'towers', 'ffa', 'campaign', 'multiplayer'} and set(runtime.get('rolesVerified', [])) == {'player', 'spectator'}, 'Missing four-mode/two-role runtime')
        for key in ['playersRosterVerified', 'roleVisibilityVerified', 'nativeMenuNavigationVerified', 'gameplayAndInputPreserved', 'layoutAndTouchVerified']:
            require(runtime.get(key) is True, 'Runtime check missing: ' + key)
    else:
        require(allow_incomplete and final.get('passed') is False and (runtime.get('passed') is False) and (final.get('status') == 'incomplete') and (runtime.get('status') == 'incomplete'), 'Explicit honest incomplete test checkpoint required')
        for key in ['verifiedChecks', 'remainingVerification']:
            require(isinstance(runtime.get(key), list) and bool(runtime[key]) and all((isinstance(x, str) and x.strip() for x in runtime[key])), 'Missing incomplete scope: ' + key)
        require(buffers['AUDIT.md'].startswith(b'# INCOMPLETE'), 'Incomplete audit banner required')
    require(final.get('sourceProfileManifestSHA256') == digest(PROFILE / 'overlay-manifest.json'), 'Final source manifest mismatch')
    require(integrity.get('allSourceAssetsMatchAPK') is True and integrity.get('playStoreBuild') is False and (integrity.get('aabBuilt') is False) and (set(integrity.get('changedAssets', [])) == ASSETS), 'Normal test integrity scope mismatch')
    for key, name in [('integrityProof', 'apk-integrity.json'), ('runtimeProof', 'focused-runtime.json')]:
        ref = final.get(key, {})
        require(ref.get('path') == name and ref.get('sha256') == sha256(buffers[name]).hexdigest(), 'Final proof reference changed')
    require(final.get('auditSHA256') == sha256(buffers['AUDIT.md']).hexdigest(), 'Final audit changed')
    checks = document(buffers['source-attachment-checks.json'])
    require(checks.get('passed') is True and checks.get('packagerSHA256') == digest(Path(__file__)), 'Current packaging guard checks required')
    evidence = runtime.get('evidenceFiles')
    require(isinstance(evidence, list) and bool(evidence), 'Hash-bound runtime evidence required')
    attachments = []
    for i, row in enumerate(evidence, 1):
        path = Path(row['path'])
        path = path if path.is_absolute() else records / path
        require(path.resolve().is_relative_to(RUNTIME.resolve()), 'Evidence outside owned runtime directory')
        require(path.is_file() and (not path.is_symlink()) and (digest(path) == row['sha256']), 'Runtime evidence changed: ' + str(path))
        if path.suffix.lower() not in {'.json', '.png'}:
            continue
        require(not re.search('(?:^|[._-])(?:password|secret|credentials?|id_rsa|id_ed25519|keystore|known_hosts)(?:[._-]|$)', path.name, re.I), 'Sensitive runtime attachment name')
        data = bounded(path, 32 * 1024 * 1024)
        require(sha256(data).hexdigest() == row['sha256'], 'Runtime evidence changed during copy')
        secret_check(path.name, data)
        if path.suffix.lower() == '.json':
            json.loads(data.decode('utf-8-sig'))
        else:
            require(data.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG attachment')
        filename = re.sub('[^A-Za-z0-9._-]', '_', path.name)
        name = 'validation/runtime/' + str(i).zfill(3) + '-' + filename
        attachments.append((name, data, row['path']))
    require(bool(attachments), 'At least one captured JSON/PNG runtime attachment is required')
    require(sum((len(x[1]) for x in attachments)) <= 128 * 1024 * 1024, 'Runtime attachment total bound exceeded')
    with zipfile.ZipFile(apk) as z:
        for row in m['files']:
            if row['path'].startswith('app/src/main/assets/'):
                with z.open('assets/' + row['path'].removeprefix('app/src/main/assets/')) as stream:
                    require(file_digest(stream, 'sha256').hexdigest() == row['testSHA256'], 'Current source asset differs from APK')
    payloads = [(name, data) for name, data, _ in attachments]
    payloads.append(('RUNTIME-ATTACHMENTS.json', (json.dumps(dict(files=[dict(path=n, sha256=sha256(d).hexdigest(), bytes=len(d), source=p) for n, d, p in attachments]), indent=2) + '\n').encode()))
    payloads.extend(((dst, buffers[src]) for dst, src in [('VALIDATION.json', 'final-validation.json'), ('APK-INTEGRITY.json', 'apk-integrity.json'), ('RUNTIME.json', 'focused-runtime.json'), ('AUDIT.md', 'AUDIT.md'), ('PACKAGING-CHECKS.json', 'source-attachment-checks.json')]))
    stage(payloads)
    return (expected, complete)

def package():
    require(not OUTPUT.exists(), 'Refusing to overwrite a delivery source archive')
    with BASE.open('rb') as source, OUTPUT.open('xb') as target:
        shutil.copyfileobj(source, target, 8 * 1024 * 1024)
    with zipfile.ZipFile(BASE) as z:
        original = z.infolist()
        prefix = z.start_dir
    with zipfile.ZipFile(OUTPUT, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(PROFILE.rglob('*')):
            if p.is_file():
                require(not p.is_symlink(), 'Profile symlink refused')
                z.write(p, NAME + '/' + p.relative_to(PROFILE).as_posix())
    with zipfile.ZipFile(OUTPUT) as z:
        names = z.namelist()
        require(len(names) == len(set(names)) and names[:len(original)] == [x.filename for x in original], 'Baseline member preservation failed')
        for old, new in zip(original, z.infolist()):
            require((old.CRC, old.file_size, old.compress_size, old.header_offset) == (new.CRC, new.file_size, new.compress_size, new.header_offset), 'Baseline member metadata changed')
        for p in PROFILE.rglob('*'):
            if p.is_file():
                with z.open(NAME + '/' + p.relative_to(PROFILE).as_posix()) as stream:
                    require(file_digest(stream, 'sha256').hexdigest() == digest(p), 'Packaged profile differs')
    with BASE.open('rb') as old, OUTPUT.open('rb') as new:
        left = prefix
        while left:
            size = min(left, 8 * 1024 * 1024)
            require(old.read(size) == new.read(size), 'Original compressed local records changed')
            left -= size
    return dict(output=str(OUTPUT), bytes=OUTPUT.stat().st_size, sha256=digest(OUTPUT), allOriginal14383MembersPreserved=True, originalLocalRecordPrefixBytes=prefix, originalLocalRecordPrefixByteIdentical=True, noDuplicateMembers=True)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--package', action='store_true')
    p.add_argument('--allow-incomplete', action='store_true')
    a = p.parse_args()
    require(not a.allow_incomplete or a.package, 'Incomplete flag is only an explicit package choice')
    require(not a.package or not OUTPUT.exists(), 'Refusing to overwrite a delivery source archive')
    require(digest(BASE) == BASE_SHA, 'Immutable complete0.90 source baseline changed')
    with zipfile.ZipFile(BASE) as source:
        m = prepare(source)
        gate = gates(m, a.allow_incomplete) if a.package else None
        report = restore(source, m)
    report.update(sourceFiles=len(m['files']), sourceProfileManifestSHA256=digest(PROFILE / 'overlay-manifest.json'), archiveCreated=False, publicationRequired=False)
    if a.package:
        if not gate[1]:
            require((PROFILE / 'README.md').read_bytes() == README.encode(), 'Unexpected prepared README')
            write(PROFILE / 'README.md', b'# INCOMPLETE LOCAL TEST CHECKPOINT\n\nRuntime verification remains incomplete. Read AUDIT.md and RUNTIME.json before testing. No publication is authorized.\n\n' + README.encode())
        report.update(package(), archiveCreated=True, candidateAPK_SHA256=gate[0], sourceRestorationPassed=True, passed=gate[1], runtimePassed=gate[1], status='verified-local-test' if gate[1] else 'incomplete')
    jwrite(ROOT / 'release-records/source-package-validation.json', report)
    print(json.dumps(report, indent=2))
if __name__ == '__main__':
    main()
