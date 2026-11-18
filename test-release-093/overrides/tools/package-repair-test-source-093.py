"""Prepare a complete 0.93 normal-test source profile; pack only with a passed exact-APK runtime seal."""
from datetime import datetime, timezone
from hashlib import file_digest, sha256
from pathlib import Path, PurePosixPath
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = 'test-release-093'
PROFILE = ROOT / NAME
BASE = Path('C:/timerApp/warzone-towers-0.92-test-source.zip')
BASE_SHA = '63e26582d2c97ed88f57469be8a556b205532c83b660e937bd983b2be8cf8057'
BASE_MEMBERS = 14789
OUTPUT = Path('C:/timerApp/warzone-towers-0.93-test-source.zip')
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
ASSET_ROOT = 'app/src/main/assets/'
UI = {
    'warzone-touch-controls.js', 'warzone-campaign-hud.js', 'warzone/ui/towers-game-controls.css',
    'warzone/ui/icons/wrench.svg', 'multiplayer/index.html', 'multiplayer/mobile-controls.js',
    'multiplayer/native-ui-adapter.js', 'multiplayer/session.js',
}
ENGINES = {
    'multiplayer/warzone2100.js', 'multiplayer/warzone2100.wasm', 'warzone/warzone2100.js',
    'warzone/warzone2100.wasm', 'warzone/warzone2100-campaign.js', 'warzone/warzone2100-duel.js',
    'warzone/warzone2100-ffa.js', 'warzone/warzone2100-towers-052.js', 'warzone/warzone2100-towers-052.wasm',
}
RETAINED = ('google-play-release/', 'normal-release-089/', 'test-release-090/',
            'test-release-091/', 'network-test-091-1/', 'test-release-092/')


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(path):
    if not path.is_file():
        return None
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def readjson(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Replace rather than overwrite so fixture hardlinks cannot mutate originals.
    temporary = path.with_name(path.name + '.source-profile-tmp')
    with temporary.open('wb') as stream:
        stream.write(data)
    os.replace(temporary, path)


def jwrite(path, data):
    write(path, (json.dumps(data, indent=2) + '\n').encode())


def safe(name):
    value = PurePosixPath(name)
    require(name and str(value) == name and not value.is_absolute() and '..' not in value.parts
            and '\\' not in name and ':' not in name, 'Unsafe source-profile path: ' + name)
    return name


def guarded(base, name):
    target = base / safe(name)
    require(not base.is_symlink() and not target.is_symlink()
            and target.resolve().is_relative_to(base.resolve()), 'Source-profile path escape')
    return target


def secret_check(name, data):
    item = PurePosixPath(name)
    require(item.name not in {'local.properties', '.env', 'id_rsa', 'id_ed25519', 'known_hosts'}
            and item.suffix.lower() not in {'.apk', '.aab', '.jks', '.keystore', '.key', '.pem', '.p12'},
            'Private/build artifact path refused: ' + name)
    require(not any(b'-----BEGIN ' + kind + b'-----' in data for kind in
                    [b'PRIVATE KEY', b'OPENSSH PRIVATE KEY', b'RSA PRIVATE KEY']), 'Private key bytes refused')
    if item.suffix.lower() != '.json':
        return
    private = {'password', 'hostpassword', 'gamepassword', 'keystorepassword', 'jointoken', 'jointokens',
               'hosttoken', 'lobbyconnecttoken', 'authorization', 'cookie', 'setcookie', 'attest',
               'signature', 'phoneserial', 'deviceserial', 'ssid'}
    def inspect(value):
        if isinstance(value, dict):
            for key, child in value.items():
                normalized = re.sub('[^a-z0-9]', '', key.lower())
                accessibility_false = (normalized == 'password' and child == 'false'
                    and {'class', 'resource-id', 'bounds'} <= value.keys()
                    and re.fullmatch(r'\[\d+,\d+\]\[\d+,\d+\]', str(value['bounds'])) is not None)
                require(normalized not in private or child in (None, '', False) or accessibility_false,
                        'Private JSON field refused: ' + name + ':' + key)
                inspect(child)
        elif isinstance(value, list):
            for child in value:
                inspect(child)
    inspect(json.loads(data.decode('utf-8-sig')))


def inputs():
    names = {'AGENTS.md', 'app/build.gradle.kts', 'tools/build-normal-apk.py',
             'tools/package-repair-test-source-093.py'}
    names |= {ASSET_ROOT + name for name in UI | ENGINES}
    names |= {p.relative_to(ROOT).as_posix() for p in (ROOT / 'vendor/native-093').rglob('*')
              if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}
    names |= {p.relative_to(ROOT).as_posix() for p in (ROOT / 'tools').glob('*093*')
              if p.is_file() and p.suffix in {'.py', '.cjs', '.js', '.sh', '.json', '.md'}}
    require(any(name.startswith('vendor/native-093/raw/') for name in names), 'Raw 0.93 native outputs missing')
    require(any(name.startswith('vendor/native-093/objects/') for name in names), 'Native 0.93 objects missing')
    for name in names:
        path = guarded(ROOT, name)
        require(path.is_file() and path.stat().st_size <= 256 * 1024 * 1024, 'Missing/oversized source input: ' + name)
    gradle = (ROOT / 'app/build.gradle.kts').read_text()
    require(re.search(r'\bversionCode\s*=\s*93\b', gradle)
            and re.search(r'\bversionName\s*=\s*"0\.93"', gradle), 'Refusing to package a different/future app version')
    return sorted(names)


def native_source_gate():
    proof = readjson(ROOT / 'vendor/native-093/native-build.json')
    require(proof.get('passed') is True and proof.get('version') == '0.93', 'Native build proof is not passed 0.93')
    for row in proof['sourceInputs']:
        require(digest(guarded(ROOT, row['path'])) == row['sha256'], 'Native source changed after compilation: ' + row['path'])
    for row in proof['compileResults'] + proof['inheritedObjects']:
        require(digest(guarded(ROOT / 'vendor/native-093', row['object'])) == row['sha256'], 'Native object changed after compilation')


def prepare(source):
    names = source.namelist()
    require(len(names) == len(set(names)) == BASE_MEMBERS, 'Unexpected complete 0.92 member set')
    require(not any(name.startswith(NAME + '/') for name in names), 'Baseline already contains this source profile')
    native_source_gate()
    prior = json.loads(source.read('test-release-092/overlay-manifest.json'))
    effective = dict(prior['priorEffectiveFiles'])
    sources = dict(prior['priorOverrideSources'])
    accepted = {name: set(values) for name, values in prior['acceptedRootHashes'].items()}
    for row in prior['files']:
        accepted.setdefault(row['path'], set()).update([row['rootBaselineSHA256'], row['priorSHA256'], row['testSHA256']])
        effective[row['path']] = row['testSHA256']
        sources[row['path']] = 'test-release-092/overrides/' + row['path']
    cache = {}
    def archived_hash(name):
        if name not in cache:
            if name not in source.NameToInfo:
                cache[name] = None
            else:
                with source.open(name) as stream:
                    cache[name] = file_digest(stream, 'sha256').hexdigest()
        return cache[name]

    old = readjson(PROFILE / 'overlay-manifest.json') if (PROFILE / 'overlay-manifest.json').is_file() else None
    require(not (PROFILE / 'PACKAGE-SEAL.json').exists(), 'Refusing to change a sealed source profile')
    if old:
        for row in old['files']:
            require(digest(guarded(PROFILE / 'overrides', row['path'])) == row['testSHA256'],
                    'Prepared override changed outside source preparation: ' + row['path'])
    rows, prior_roots = [], []
    for name in inputs():
        data = (ROOT / name).read_bytes()
        secret_check(name, data)
        raw = archived_hash(name)
        before = effective.get(name, raw)
        after = sha256(data).hexdigest()
        accepted.setdefault(name, set()).update([raw, before, after])
        if before is not None and name not in effective:
            effective[name] = before
            sources[name] = name
        if name in effective and sources.get(name, name) == name:
            prior_name = 'prior-root/' + name
            require(raw == effective[name], 'No retained canonical prior source for ' + name)
            write(guarded(PROFILE, prior_name), source.read(name))
            sources[name] = NAME + '/' + prior_name
            prior_roots.append({'path': prior_name, 'sha256': raw})
        rows.append({'path': name, 'rootBaselineSHA256': raw, 'priorSHA256': before,
                     'testSHA256': after, 'bytes': len(data)})
        write(guarded(PROFILE / 'overrides', name), data)

    # Guard all app source inputs, including unchanged data/media and Java,
    # while leaving unrelated user files untouched.
    guarded_app = {name for name in names if name.startswith(('app/src/', 'gradle/')) and not name.endswith('/')}
    guarded_app |= {'build.gradle.kts', 'settings.gradle.kts', 'gradlew', 'gradlew.bat'}
    for name in guarded_app:
        raw = archived_hash(name)
        accepted.setdefault(name, set()).update([raw, effective.get(name, raw)])
    # GitHub backup metadata was added after the historical archive was sealed.
    # Accept only its specific retained commit, never arbitrary current edits.
    commit = 'f8ff13d584d7362878bc9011c592cf52852d94ff'
    if (ROOT / '.git').exists():
        known = subprocess.run(['git', 'show', commit + ':AGENTS.md'], cwd=ROOT, capture_output=True)
        require(known.returncode == 0, 'Retained Git source baseline is unavailable')
        accepted.setdefault('AGENTS.md', set()).add(sha256(known.stdout).hexdigest())

    asset_names = {name for name in names if name.startswith(ASSET_ROOT) and not name.endswith('/')}
    asset_names |= {name for name in effective if name.startswith(ASSET_ROOT)}
    effective_assets = {name: effective.get(name, archived_hash(name)) for name in sorted(asset_names)}
    effective_assets.update({row['path']: row['testSHA256'] for row in rows if row['path'].startswith(ASSET_ROOT)})
    build_names = guarded_app | {name for name in effective if name.startswith(('app/src/', 'gradle/'))}
    build_names.add('app/build.gradle.kts')
    build_sources = {name: effective.get(name, archived_hash(name)) for name in sorted(build_names)}
    build_sources.update({row['path']: row['testSHA256'] for row in rows if row['path'] in build_sources})
    retained = [{'path': name, 'sha256': archived_hash(name)} for name in names
                if name.startswith(RETAINED) and not name.endswith('/')]
    document_hashes = {name: digest(PROFILE / name) for name in ['prepare-and-build.py', 'README.md']}
    require(all(document_hashes.values()), 'Source wrapper/README missing')
    document_hashes['package-complete-source.py'] = digest(Path(__file__))
    manifest = dict(schemaVersion=1, versionCode=93, versionName='0.93', profile='local-normal-test-apk-only',
        completeBaselineArchive=BASE.name, completeBaselineSHA256=BASE_SHA, completeBaselineMembers=BASE_MEMBERS,
        priorEffectiveFiles=effective, priorOverrideSources=sources,
        priorRestoreSources={row['path']: sources[row['path']] for row in rows if row['path'] in effective},
        acceptedRootHashes={name: sorted(values, key=lambda value: value or '') for name, values in sorted(accepted.items())},
        retainedProfileFiles=retained, priorRootFiles=prior_roots, profileDocuments=document_hashes,
        knownAppSources=sorted({name for name in guarded_app | set(effective) if name.startswith('app/src/')}
                               | {row['path'] for row in rows if row['path'].startswith('app/src/')}),
        effectiveAPKAssets=effective_assets, effectiveBuildSources=build_sources, files=rows)
    jwrite(PROFILE / 'overlay-manifest.json', manifest)
    # The same self-contained packager can operate after full archive extraction.
    write(PROFILE / 'package-complete-source.py', Path(__file__).read_bytes())
    jwrite(PROFILE / 'SOURCE-PACKAGE-PREPARATION.json', dict(status='draft-source-only', runtimeVerified=False,
        archiveCreated=False, published=False, noVPSUpload=True, aabBuilt=False,
        preparedUTC=datetime.now(timezone.utc).isoformat(), sourceFiles=len(rows),
        sourceProfileManifestSHA256=digest(PROFILE / 'overlay-manifest.json'),
        completeBaselineSHA256=BASE_SHA))
    return manifest


def check_restore(source, manifest):
    fixture = ROOT / 'source-overlay' / ('restore-check-repair093-' + uuid.uuid4().hex)
    fixture.mkdir(parents=True)
    mutable = set(manifest['priorEffectiveFiles']) | {row['path'] for row in manifest['files']}
    paths = set(manifest['acceptedRootHashes']) | {row['path'] for row in manifest['retainedProfileFiles']}
    immutable_links = 0
    retained_hashes = {row['path']: row['sha256'] for row in manifest['retainedProfileFiles']}
    for name in sorted(paths):
        if name not in source.NameToInfo:
            continue
        target = guarded(fixture, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        candidate = guarded(ROOT, name)
        # Only immutable profile sources and never-written source inputs may
        # share bytes with the candidate; every restored destination is a copy.
        immutable = name not in mutable
        known = retained_hashes.get(name)
        allowed = {known} if known is not None else set(manifest['acceptedRootHashes'].get(name, []))
        if immutable and candidate.is_file() and digest(candidate) in allowed:
            os.link(candidate, target)
            immutable_links += 1
        else:
            write(target, source.read(name))
    shutil.copytree(PROFILE, fixture / NAME, copy_function=os.link)
    command = [sys.executable, str(fixture / NAME / 'prepare-and-build.py'), '--apply-only']
    def run(passed=True):
        result = subprocess.run(command, capture_output=True, text=True, timeout=180)
        require((result.returncode == 0) == passed, 'Restore check result differs:\n' + result.stdout + result.stderr)
    expected = dict(manifest['priorEffectiveFiles'])
    expected.update({row['path']: row['testSHA256'] for row in manifest['files']})
    def state():
        return {name: digest(guarded(fixture, name)) for name in mutable}
    def exact():
        require(all(digest(guarded(fixture, name)) == value for name, value in expected.items()), 'Restored effective source differs')
    run(); exact()
    before = state(); run(); require(before == state(), 'Idempotent restoration changed source')
    write(fixture / 'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
          source.read('app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'))
    write(fixture / 'app/build.gradle.kts', source.read('normal-release-089/overrides/app/build.gradle.kts'))
    (fixture / (ASSET_ROOT + 'warzone/ui/icons/wrench.svg')).unlink()
    run(); exact()
    for name, replacement in [
        ('app/build.gradle.kts', lambda value: value.replace(b'versionCode = 93', b'versionCode = 94')),
        (ASSET_ROOT + 'warzone-touch-controls.js', lambda value: value + b'\nUNKNOWN LOCAL EDIT\n'),
    ]:
        target = fixture / name
        original = target.read_bytes(); write(target, replacement(original)); before = state()
        run(False); require(before == state(), 'Unknown/future edit refusal mutated source'); write(target, original)
    target = fixture / NAME / 'overrides/app/build.gradle.kts'
    original = target.read_bytes(); write(target, original + b'TAMPERED')
    before = state(); run(False); require(before == state(), 'Corrupt override refusal mutated source'); write(target, original)
    exact()
    result = dict(passed=True, actualAndroidRun=False, scope='Source restoration and preflight guards only',
        firstApply=True, repeatedApply=True, interruptedKnownStateApply=True, future094RefusedBeforeMutation=True,
        localEditRefusedBeforeMutation=True, corruptOverrideRefusedBeforeMutation=True,
        immutableSourceHardlinks=immutable_links, mutableSourceFiles=len(mutable), fixture=str(fixture),
        buildOrPublicationExecuted=False, sourceProfileManifestSHA256=digest(PROFILE / 'overlay-manifest.json'))
    jwrite(PROFILE / 'RESTORE-CHECK.json', result)
    return result


def build_source_gate(manifest):
    expected = manifest['effectiveBuildSources']
    require(all(digest(guarded(ROOT, name)) == wanted for name, wanted in expected.items()),
            'Java/Gradle/app source changed after preparation')
    actual = {path.relative_to(ROOT).as_posix() for path in (ROOT / 'app/src').rglob('*') if path.is_file()}
    require(actual == set(manifest['knownAppSources']), 'Current app source member set differs from exact 0.93 source')


def profile_member_gate(manifest, runtime_names=None):
    allowed = {'overlay-manifest.json', 'SOURCE-PACKAGE-PREPARATION.json', 'SOURCE-PACKAGE-CHECKS.json',
               'RESTORE-CHECK.json', 'RUNTIME.json', 'RUNTIME-ATTACHMENTS.json', 'VALIDATION.json',
               'APK-INTEGRITY.json', 'AUDIT.md', 'PACKAGE-SEAL.json'}
    allowed.update(manifest['profileDocuments'])
    allowed.update('overrides/' + row['path'] for row in manifest['files'])
    allowed.update(row['path'] for row in manifest['priorRootFiles'])
    for name, wanted in manifest['profileDocuments'].items():
        require(digest(guarded(PROFILE, name)) == wanted, 'Prepared profile document changed: ' + name)
    for row in manifest['files']:
        require(digest(guarded(PROFILE / 'overrides', row['path'])) == row['testSHA256'],
                'Prepared source override changed: ' + row['path'])
    for row in manifest['priorRootFiles']:
        require(digest(guarded(PROFILE, row['path'])) == row['sha256'], 'Prepared prior-root source changed: ' + row['path'])
    if runtime_names is None and (PROFILE / 'RUNTIME-ATTACHMENTS.json').is_file():
        rows = readjson(PROFILE / 'RUNTIME-ATTACHMENTS.json')['files']
        runtime_names = [row['path'] for row in rows]
        for row in rows:
            require(digest(guarded(PROFILE, row['path'])) == row['sha256'], 'Curated runtime attachment changed')
    for name in runtime_names or []:
        require(safe(name).startswith('validation/runtime/'), 'Unexpected runtime attachment path')
        allowed.add(name)
    actual = set()
    for item in PROFILE.rglob('*'):
        require(not item.is_symlink(), 'Source profile symlink refused')
        if item.is_file():
            actual.add(item.relative_to(PROFILE).as_posix())
    require(actual <= allowed, 'Unexpected/stale source profile members refused: ' + str(sorted(actual - allowed)))
    for name in actual:
        if not name.startswith(('overrides/', 'prior-root/', 'validation/runtime/')):
            data = guarded(PROFILE, name).read_bytes()
            require(len(data) <= 8 * 1024 * 1024, 'Oversized source-profile record')
            secret_check(name, data)


def runtime_gate(manifest, runtime_path, apk):
    runtime_data = runtime_path.read_bytes()
    secret_check('RUNTIME.json', runtime_data)
    runtime = json.loads(runtime_data.decode('utf-8-sig'))
    require(runtime.get('passed') is True and runtime.get('status') == 'passed', 'Passed runtime seal required')
    for key, value in {'versionCode': 93, 'versionName': '0.93', 'certificateSHA256': SIGNER,
                       'normalBuild': True, 'aabBuilt': False, 'noVPSUpload': True, 'published': False}.items():
        require(runtime.get(key) == value, 'Runtime seal identity/scope mismatch: ' + key)
    require(set(runtime.get('modesVerified', [])) == {'towers', 'ffa', 'campaign', 'multiplayer'}, 'Exact APK four-mode runtime scope required')
    require(runtime.get('remainingVerification') == [] and bool(runtime.get('verifiedChecks')), 'Required runtime checks remain incomplete')
    require(apk.is_file(), 'Exact normal delivery APK missing')
    apk_sha = digest(apk)
    require(runtime.get('candidateAPK_SHA256', runtime.get('sha256')) == apk_sha, 'Runtime seal references a different APK')
    if 'bytes' in runtime:
        require(runtime['bytes'] == apk.stat().st_size, 'Runtime APK size mismatch')
    require(runtime.get('sourceProfileManifestSHA256') == digest(PROFILE / 'overlay-manifest.json'), 'Runtime source profile identity is missing or changed')
    native_source_gate()
    require(set(inputs()) == {row['path'] for row in manifest['files']},
            'Source input set changed; refresh the draft source profile before sealing')
    for name, wanted in manifest['profileDocuments'].items():
        require(digest(PROFILE / name) == wanted, 'Source wrapper/document changed after preparation: ' + name)
    build_source_gate(manifest)
    for row in manifest['files']:
        require(digest(guarded(ROOT, row['path'])) == row['testSHA256']
                and digest(guarded(PROFILE / 'overrides', row['path'])) == row['testSHA256'],
                'Source changed after preparation: ' + row['path'])
    expected = manifest['effectiveAPKAssets']
    actual = {p.relative_to(ROOT).as_posix() for p in (ROOT / ASSET_ROOT).rglob('*') if p.is_file()}
    require(actual == set(expected), 'Current app asset set differs from complete source profile')
    with zipfile.ZipFile(apk) as archive:
        members = {name for name in archive.namelist() if name.startswith('assets/') and not name.endswith('/')}
        require(members == {'assets/' + name.removeprefix(ASSET_ROOT) for name in expected}, 'APK asset member set differs')
        for name, wanted in expected.items():
            require(digest(ROOT / name) == wanted, 'Current app asset changed: ' + name)
            with archive.open('assets/' + name.removeprefix(ASSET_ROOT)) as stream:
                require(file_digest(stream, 'sha256').hexdigest() == wanted, 'APK/source asset differs: ' + name)
    evidence = runtime.get('evidenceFiles')
    require(isinstance(evidence, list) and bool(evidence), 'Explicit curated runtime evidence required')
    planned = ['validation/runtime/' + str(number).zfill(3) + '-'
               + re.sub('[^A-Za-z0-9._-]', '_', Path(row['path']).name)
               for number, row in enumerate(evidence, 1)]
    profile_member_gate(manifest, planned)
    attachments, total = [], 0
    for number, row in enumerate(evidence, 1):
        path = Path(row['path'])
        require(path.is_absolute() and path.is_file() and not path.is_symlink()
                and path.suffix.lower() in {'.json', '.png'}, 'Only existing absolute JSON/PNG evidence paths are accepted')
        require(not any(re.search(r'(?:private.*host|userdata|helper|phone.dump|credentials|logcat)', part, re.I)
                        for part in path.parts[:-1]), 'Private host/device/helper evidence refused')
        require(not re.search(r'(?:^|[._-])(?:password|secret|credentials?|keystore|known_hosts|logcat|userdata|dump)(?:[._-]|$)', path.name, re.I), 'Private evidence filename refused')
        size = path.stat().st_size
        require(0 < size <= 16 * 1024 * 1024 and row.get('bytes', size) == size, 'Runtime evidence size differs/exceeds bound')
        data = path.read_bytes(); total += len(data)
        require(sha256(data).hexdigest() == row['sha256'], 'Runtime evidence changed: ' + path.name)
        secret_check(path.name, data)
        require(path.suffix.lower() != '.png' or data.startswith(b'\x89PNG\r\n\x1a\n'), 'PNG signature missing')
        name = 'validation/runtime/' + str(number).zfill(3) + '-' + re.sub('[^A-Za-z0-9._-]', '_', path.name)
        write(guarded(PROFILE, name), data)
        attachments.append({'path': name, 'bytes': len(data), 'sha256': sha256(data).hexdigest()})
    require(total <= 96 * 1024 * 1024, 'Curated runtime evidence exceeds total bound')
    write(PROFILE / 'RUNTIME.json', runtime_data)
    jwrite(PROFILE / 'RUNTIME-ATTACHMENTS.json', {'files': attachments})
    for name in ['VALIDATION.json', 'APK-INTEGRITY.json']:
        path = PROFILE / name
        require(path.is_file(), 'Root curated seal document missing: ' + name)
        data = path.read_bytes(); secret_check(name, data)
        proof = json.loads(data.decode('utf-8-sig'))
        require(proof.get('passed') is True
                and proof.get('candidateAPK_SHA256', proof.get('sha256')) == apk_sha
                and proof.get('versionCode') == 93 and proof.get('versionName') == '0.93'
                and proof.get('certificateSHA256') == SIGNER, 'Curated seal document identity mismatch: ' + name)
        require(proof.get('sourceProfileManifestSHA256') == digest(PROFILE / 'overlay-manifest.json'), 'Curated seal source profile identity is missing or changed')
    require((PROFILE / 'AUDIT.md').is_file(), 'Root curated AUDIT.md missing')
    return runtime, apk_sha


def package(base, output, manifest):
    require(not output.exists(), 'Refusing to overwrite an existing source delivery')
    profile_member_gate(manifest)
    original_names = set()
    with zipfile.ZipFile(base) as archive:
        original = archive.infolist(); prefix = archive.start_dir
        original_names = {row.filename for row in original}
    with base.open('rb') as source, output.open('xb') as destination:
        shutil.copyfileobj(source, destination, 8 * 1024 * 1024)
    with zipfile.ZipFile(output, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in sorted(PROFILE.rglob('*')):
            if item.is_file():
                require(not item.is_symlink(), 'Profile symlink refused')
                name = NAME + '/' + item.relative_to(PROFILE).as_posix()
                require(name not in original_names, 'Archive member collision')
                archive.write(item, name)
    with zipfile.ZipFile(output) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and names[:len(original)] == [row.filename for row in original], 'Original member preservation failed')
        require(archive.testzip() is None, 'Source archive member CRC failure')
        for before, after in zip(original, archive.infolist()):
            require((before.CRC, before.file_size, before.compress_size, before.header_offset)
                    == (after.CRC, after.file_size, after.compress_size, after.header_offset), 'Original compressed member metadata changed')
        for item in PROFILE.rglob('*'):
            if item.is_file():
                with archive.open(NAME + '/' + item.relative_to(PROFILE).as_posix()) as stream:
                    require(file_digest(stream, 'sha256').hexdigest() == digest(item), 'Packaged 0.93 profile differs')
    with base.open('rb') as before, output.open('rb') as after:
        remaining = prefix
        while remaining:
            size = min(remaining, 8 * 1024 * 1024)
            require(before.read(size) == after.read(size), 'Original compressed local records changed')
            remaining -= size
    return dict(output=str(output), bytes=output.stat().st_size, sha256=digest(output),
                allOriginal14789MembersPreserved=True, originalLocalRecordPrefixBytes=prefix,
                originalLocalRecordPrefixByteIdentical=True, noDuplicateMembers=True,
                baselineMembers=len(original), totalMembers=len(names))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true', help='Refresh draft source hashes; does not package or validate gameplay')
    parser.add_argument('--check-restore', action='store_true', help='Run isolated known-state restoration/guard checks')
    parser.add_argument('--pack', action='store_true')
    parser.add_argument('--runtime', type=Path)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/release/app-release.apk')
    parser.add_argument('--base', type=Path, default=BASE)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    require(not args.pack or args.runtime is not None, '--pack requires an explicit passed --runtime seal')
    require(not args.pack or not args.prepare, 'Prepare source first; do not refresh it during sealing')
    require(not args.pack or (PROFILE / 'overlay-manifest.json').is_file(), 'Prepare source before packing')
    require(not args.pack or not args.output.exists(), 'Refusing to overwrite a delivery source archive')
    require(not args.pack or not args.output.with_name(args.output.name + '.validation.json').exists(),
            'Refusing to overwrite an existing source delivery receipt')
    require(digest(args.base) == BASE_SHA, 'Immutable complete 0.92 source baseline changed')
    with zipfile.ZipFile(args.base) as source:
        manifest = prepare(source) if args.prepare or not (PROFILE / 'overlay-manifest.json').exists() else readjson(PROFILE / 'overlay-manifest.json')
        report = dict(sourceProfileManifestSHA256=digest(PROFILE / 'overlay-manifest.json'),
                      sourceFiles=len(manifest['files']), archiveCreated=False, runtimeVerified=False,
                      published=False, noVPSUpload=True, aabBuilt=False)
        if args.check_restore:
            report['restoration'] = check_restore(source, manifest)
    if args.pack:
        restore = readjson(PROFILE / 'RESTORE-CHECK.json')
        require(restore.get('passed') is True and restore.get('sourceProfileManifestSHA256') == report['sourceProfileManifestSHA256'], 'Current source restoration checks required before packing')
        runtime, apk_sha = runtime_gate(manifest, args.runtime.resolve(), args.apk.resolve())
        jwrite(PROFILE / 'PACKAGE-SEAL.json', dict(passed=True, status='source-profile-sealed',
            sourceProfileManifestSHA256=report['sourceProfileManifestSHA256'], runtimeSHA256=digest(args.runtime),
            candidateAPK_SHA256=apk_sha, versionCode=93, versionName='0.93', certificateSHA256=SIGNER,
            normalBuild=True, aabBuilt=False, noVPSUpload=True, published=False,
            completeBaselineSHA256=BASE_SHA, sourceRestorationPassed=True,
            note='The archive hash is recorded externally after archive creation.'))
        jwrite(PROFILE / 'SOURCE-PACKAGE-CHECKS.json', dict(report, runtimeVerified=True,
            candidateAPK_SHA256=apk_sha, sourceRestorationPassed=True,
            note='All source/runtime gates passed before packaging; final archive receipt is external.'))
        report.update(package(args.base, args.output, manifest), archiveCreated=True, runtimeVerified=True,
                      candidateAPK_SHA256=apk_sha, passed=True, status='passed')
        jwrite(args.output.with_name(args.output.name + '.validation.json'), report)
    else:
        jwrite(PROFILE / 'SOURCE-PACKAGE-CHECKS.json', report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
