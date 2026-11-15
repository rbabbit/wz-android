"""Package the exact-emulator-verified v0.84 native landing menus and complete source.

No build, device operation, network request, Git publication or observation is
performed here. Every delivered v0.83 source member is retained. Unchanged ZIP
members reuse their compressed bytes; engines, data, maps, music, artwork and
native libraries stay frozen. Only the named native landing/orientation files,
minimal Multiplayer landing hooks, exact version and release evidence may change.
"""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import argparse, json, re, runpy, shutil, subprocess

ROOT = Path(__file__).resolve().parents[1]
P = runpy.run_path(str(ROOT/'tools/package-multiplayer-072.py'), run_name='landings084_helpers')
H, C = P['H'], P['C']
digest, zip_digest, require = (C[k] for k in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ASSETS = 'app/src/main/assets/'
MP = ASSETS+'multiplayer/'
QA = 'qa/native-landings-084/'
GRADLE = 'app/build.gradle.kts'
TOOL = 'tools/package-native-landings-084.py'
FALLBACK = QA+'fallback.json'
RECORD = 'archive/release-0.84-native-landings.json'
RELEASE = 'docs/releases/0.84-native-landings.md'
BASELINE_APK_SHA = '8706aae52cf0cf7d560885fcef041125bdafb3cc44f22a7f6786d3f540285747'
BASELINE_SOURCE_SHA = 'd6956b307338d045642df65bae5ccac3b1aa7ce8e4cb48a40810450d38ea3299'
NEW_JAVA = {JAVA+n for n in ('CampaignLandingLayout.java', 'TowersSetupLayout.java',
                            'MultiplayerLobbyModel.java', 'MultiplayerLobbyView.java')}
PRODUCT = {JAVA+n for n in ('HomeModesView.java', 'CampaignSetupView.java', 'GraphicsSetupView.java',
    'FfaSetupView.java', 'FfaSetupLayout.java', 'MapPreviewPager.java', 'MainActivity.java', 'MultiplayerActivity.java')}
PRODUCT |= NEW_JAVA | {'app/src/main/AndroidManifest.xml'}
MP_HOOKS = {MP+n for n in ('index.html', 'lobby-ui.js', 'session.js', 'multiplayer.css', 'native-landing.js')}
PRODUCT |= MP_HOOKS
NEW_PRODUCT = NEW_JAVA | {MP+'native-landing.js'}
DOCS = {'AGENTS.md', 'README.md', 'README-WARZONE-TOWERS.md', 'design-qa.md', 'docs/KNOWN-ISSUES.md'}
APK_ASSETS = {'assets/'+n[len(ASSETS):] for n in MP_HOOKS}
REQUIRED_CHECKS = ('exactDeliveryAPK', 'landscapeHomeFidelity', 'allSixDestinations', 'compactCampaign',
    'towersPicker', 'ffaPicker', 'nativeMultiplayerList', 'persistentMobilePlayerName',
    'privateRoomMatchReturn', 'smallPhoneLayout', 'enlargedTextLayout', 'inputRestoration')
CSS_HIDE = 'body.mp-native-landing #setup{display:none!important}'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def repository_path(value):
    path = Path(value); path = (path if path.is_absolute() else ROOT/path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside repository evidence: '+str(value))
    return path


def pin(path):
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def checked_sources(proof, label):
    rows = proof.get('sources'); require(isinstance(rows, list) and rows, label+' has no source pins')
    names = set()
    for row in rows:
        path = repository_path(row.get('path', '')); name = path.relative_to(ROOT).as_posix()
        require(name not in names and digest(path) == row.get('sha256'), label+' has stale/duplicate source: '+name)
        names.add(name)
    return names


def baseline_paths():
    proof = read_json(ROOT/FALLBACK)
    require(proof.get('version') == '0.84' and proof.get('sha256VerifiedBeforeEdits') is True,
            'Initial hash-verified delivered v0.83 fallback required')
    paths = []
    for suffix, expected in (('.apk', BASELINE_APK_SHA), ('.zip', BASELINE_SOURCE_SHA)):
        rows = [r for r in proof.get('immutableFallbacks', []) if str(r.get('path', '')).endswith(suffix)]
        require(len(rows) == 1, 'Ambiguous v0.83 fallback '+suffix)
        row = rows[0]; path = Path(row['path']).resolve()
        require(path.is_file() and row.get('sha256') == expected and path.stat().st_size == row.get('bytes')
                and digest(path) == expected, 'Delivered v0.83 fallback changed: '+str(path))
        paths.append(path)
    return paths


def validate_observations(verification_path, host_paths, build_log, expected):
    proof = read_json(verification_path)
    require(proof.get('version') == '0.84' and proof.get('passed') is True and proof.get('emulatorUsed') is True,
            'Passed real v0.84 exact-APK emulator observations required')
    require(proof.get('candidateAPK_SHA256') == proof.get('installedAPK_SHA256') == expected,
            'Emulator did not run the exact delivery APK')
    require(isinstance(proof.get('device'), str) and proof['device'].startswith('emulator-'), 'Emulator identity missing')
    require(all(proof.get('checks', {}).get(name) is True for name in REQUIRED_CHECKS),
            'Required native landing/layout/profile/match/input observations missing')
    require(isinstance(proof.get('verificationScope'), str) and proof['verificationScope'].strip()
            and isinstance(proof.get('limitations'), list), 'Verification scope/limitations missing')
    require(proof.get('fixture', {}).get('publicMessagesSent') is False, 'Public-room messages are not authorized')
    require('BUILD SUCCESSFUL' in build_log.read_text(encoding='utf-8-sig', errors='replace'), 'Final successful build log missing')
    require(proof.get('buildLog', {}).get('sha256') == digest(build_log), 'Build log changed after verification')
    require(PRODUCT | {GRADLE, TOOL} <= checked_sources(proof, 'Exact-APK proof'),
            'Exact-APK proof must pin current landing/version/package sources')
    evidence = {verification_path.relative_to(ROOT).as_posix(), build_log.relative_to(ROOT).as_posix()}
    seen = set()
    for row in proof.get('evidence', []):
        path = repository_path(row.get('path', '')); name = path.relative_to(ROOT).as_posix()
        require(name not in seen and row.get('sha256') == digest(path)
                and row.get('bytes', path.stat().st_size) == path.stat().st_size,
                'Missing/stale observed evidence: '+name)
        seen.add(name)
    require(any(n.endswith('.png') for n in seen) and any(n.endswith('.json') for n in seen),
            'Actual screenshots and structured installed/navigation state required')
    evidence |= seen; hosts = []; counts = {}
    require(host_paths, 'Current focused native landing host checks required')
    for path in host_paths:
        host = read_json(path); label = path.relative_to(ROOT).as_posix()
        require(host.get('version') == '0.84' and host.get('passed') is True
                and host.get('emulatorUsed') is False and not host.get('fatal'), 'Failed/stale focused proof: '+label)
        require(host.get('engineExecuted', host.get('actualNativeEngineExecuted', False)) is False,
                'Host checks must not claim native gameplay: '+label)
        checks = host.get('checks')
        require(isinstance(checks, list) and checks and host.get('checksPassed') == len(checks)
                and all(isinstance(c, str) and c.strip() for c in checks), 'Focused assertion inventory missing: '+label)
        pins = checked_sources(host, label)
        evidence |= {n for n in pins if n.startswith('qa/')}; evidence.add(label)
        for key in ('exceptions', 'badRequests'):
            if key in host: require(host[key] == [], 'Focused runtime/asset errors: '+label)
        counts[label] = len(checks); hosts.append(pin(path))
    return dict(emulatorProof=pin(verification_path), buildLog=pin(build_log), focusedProofs=hosts,
        focusedAssertionCounts=counts, device=proof['device'], checks=proof['checks'], fixture=proof['fixture'],
        verificationScope=proof['verificationScope'], limitations=proof['limitations'],
        exactInstalledAPKVerified=True, emulatorUsed=True), evidence


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    retained = evidence | {FALLBACK, TOOL, RELEASE}
    names = set(filter(None, raw.decode().split('\0'))) | required | retained | {MANIFEST, RECORD}
    names |= {p.relative_to(ROOT).as_posix() for p in (ROOT/'app/src').rglob('*') if p.is_file()}
    # Preserve all new QA084 observations and source fixtures, not compiled Java/cache products.
    names |= {p.relative_to(ROOT).as_posix() for p in (ROOT/QA).rglob('*') if p.is_file()
              and p.suffix.lower() not in {'.class', '.tmp', '.partial', '.pyc'}
              and not any(part.endswith('-host-classes') or part == '__pycache__' for part in p.parts)}
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if name == QA+'package.log': continue  # Output of this command must not hash itself.
        if name.startswith('qa/') and name not in required | retained and not name.startswith(QA): continue
        generated = rel.suffix.lower() in {'.class', '.partial', '.tmp', '.pyc'} or any(
            part.endswith('-host-classes') for part in rel.parts)
        if any(part in C['SKIP'] for part in rel.parts) or name in C['TRANSIENT'] or generated:
            require(name not in required | retained, 'Required source member would be omitted: '+name); continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES'] | {'.key', '.sta2'} and not rel.name.startswith('.env')
                and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source file: '+name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar', '-userdata.tar')), 'Runtime/userdata archive in source: '+name)
        path = ROOT/name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST, RECORD}), 'Missing source: '+name)
        files[name] = path
    require(required | retained <= set(files), 'Prior complete source or required evidence omitted')
    return files


def normalized_text(value):
    return '\n'.join(value.decode('utf-8-sig').splitlines()).strip()


def validate_source(source, files, evidence):
    with ZipFile(source) as old:
        names = set(old.namelist()); require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        manifest = json.loads(old.read(MANIFEST))['files']; prior = {r['path']: r for r in manifest}
        require(len(prior) == len(manifest) and set(prior) == names-{MANIFEST}, 'Incomplete v0.83 complete-source manifest')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 83') == gradle.count(b'versionName = "0.83"') == 1, 'Ambiguous v0.83 version')
        expected = gradle.replace(b'versionCode = 83', b'versionCode = 84').replace(b'versionName = "0.83"', b'versionName = "0.84"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact 83-to84 version update')
        css = MP+'multiplayer.css'
        require(normalized_text(files[css].read_bytes()) in {
            normalized_text(old.read(css)), normalized_text(old.read(css))+'\n'+CSS_HIDE},
            'MP CSS changed beyond the one native-landing hide selector')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']: continue
            require(name in PRODUCT | DOCS | {GRADLE}, 'Source outside approved native landing scope changed: '+name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files)-names
        for name in additions:
            require(name in NEW_PRODUCT | evidence | {FALLBACK, RELEASE, TOOL, RECORD}
                    or name.startswith(('tools/', 'archive/', QA)), 'Unexpected source addition: '+name)
        require(NEW_PRODUCT <= additions, 'Expected v0.84 landing helpers/assets missing or overwriting baseline files')
    return dict(changedBaselineSources=changed, addedSources=sorted(additions), baselineSourceEntries=len(names),
        everyBaselineSourceEntryRetained=True, prior083ArtworkRetained=True,
        allNativeEnginesDataMapsMusicArtLibrariesAndOtherAssetsFrozen=True)


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK missing/changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='84'",
            "versionName='0.84'", "application-label:'Warzone Towers'")), 'Wrong v0.84 APK identity/version')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT/H['BUILD_CONFIG']).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*84\s*;', config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.84"\s*;', config),
            'Generated BuildConfig version mismatch')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt/duplicate APK')
        require(prior <= names, 'A baseline APK member was removed')
        source_assets = {p.relative_to(ROOT/ASSETS).as_posix(): p for p in (ROOT/ASSETS).rglob('*') if p.is_file()}
        require({n for n in names if n.startswith('assets/')} == {'assets/'+n for n in source_assets}, 'APK/source asset inventory mismatch')
        changed = []
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name): continue
            require(C['metadata'](name) or name in APK_ASSETS, 'Unexpected changed APK member: '+name)
            changed.append(name)
        for name, path in source_assets.items():
            require(zip_digest(current, 'assets/'+name) == digest(path), 'APK/source asset mismatch: '+name)
        frozen = 0
        for name in prior:
            if name.startswith(('lib/', 'res/', 'assets/')) and name not in APK_ASSETS:
                require(zip_digest(current, name) == zip_digest(old, name), 'Frozen resource/library/game asset changed: '+name)
                frozen += 1
        require(current.getinfo('assets/warzone/music/music.data').compress_type == ZIP_STORED, 'Bundled soundtrack was compressed')
        ordered = sorted(current.infolist(), key=lambda i: i.header_offset); gaps = [ordered[0].header_offset]
        for i, info in enumerate(ordered):
            end = info.header_offset+30+len(info.filename.encode('utf-8'))+len(info.extra)+info.compress_size
            following = ordered[i+1].header_offset if i+1 < len(ordered) else current.start_dir
            gaps.append(max(0, following-end))
        require(max(gaps) < 2*1024*1024, 'Large unused APK gap; clean build required')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, everyBaselineAPKMemberRetained=True,
        allAPKAssetsMatchSource=True, frozenAPKResourceLibraryAndAssetMembers=frozen,
        allUnrelatedAssetResourceAndLibraryBytesFrozen=True, maximumAPKZipGapBytes=max(gaps))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True); parser.add_argument('--build-log', required=True)
    parser.add_argument('--verification', required=True); parser.add_argument('--host-proof', action='append', default=[])
    parser.add_argument('--evidence', action='append', default=[]); parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true'); args = parser.parse_args()
    expected = args.expected_sha256.lower(); require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery outputs must stay outside repository')
    for name in PRODUCT | DOCS | {GRADLE, TOOL, FALLBACK, RELEASE}: repository_path(name)
    proof_path = repository_path(args.verification); log = repository_path(args.build_log)
    verification, evidence = validate_observations(proof_path, [repository_path(p) for p in args.host_proof], log, expected)
    evidence |= {repository_path(p).relative_to(ROOT).as_posix() for p in args.evidence}
    baseline, source = baseline_paths()
    with ZipFile(source) as old: required = set(old.namelist())
    files = source_inventory(required, evidence); preservation = validate_source(source, files, evidence)
    apk_record = validate_apk(args.apk.resolve(), baseline, expected)
    require(digest(args.apk) == expected, 'APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files),
            exactAPKVerification=verification, **preservation, **apk_record), indent=2)); return
    apk_out, source_out, checksum = (args.output/n for n in ('Warzone-Towers-0.84.apk',
        'warzone-towers-0.84-source.zip', 'Warzone-Towers-0.84-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.84', versionCode=84, candidateAPK_SHA256=expected,
        scope='Approved compact landscape native Home/Campaign/Towers/FFA/Multiplayer landing menus and minimal landing hooks. Existing game/room UI, native engines, protocol, maps, music, artwork and gameplay retained.',
        exactAPKVerification=verification, fallback=pin(ROOT/FALLBACK), sourcePreservation=preservation,
        **apk_record, nativeBuildPerformed=False, emulatorUsed=True, actualAndroidViewsExecuted=True,
        offlineHostChecksPassed=True, buildChecksPassed=True, packageChecksPassed=True,
        githubPublicationPerformedByPackager=False, vpsChanged=False, recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT/RECORD).write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
    entries = [dict(path=n, bytes=p.stat().st_size, sha256=digest(p)) for n, p in files.items() if n != MANIFEST]
    (ROOT/MANIFEST).write_text(json.dumps(dict(schemaVersion=1, files=entries), indent=2)+'\n', encoding='utf-8')
    args.output.mkdir(parents=True, exist_ok=True); reused = H['write_source_zip'](source, partial, files, entries)
    require(digest(args.apk) == expected, 'Candidate changed during source packaging')
    shutil.copy2(args.apk, apk_out); require(digest(apk_out) == expected, 'APK copy changed')
    with ZipFile(partial) as archive, ZipFile(apk_out) as apk:
        require(required <= set(archive.namelist()), 'Prior complete source member missing')
        for name in files:
            if name.startswith(ASSETS): require(zip_digest(archive, name) == zip_digest(apk,
                'assets/'+name[len(ASSETS):]), 'SourceZIP/APK asset mismatch: '+name)
    partial.rename(source_out); source_sha = digest(source_out)
    require(digest(args.apk) == expected and digest(apk_out) == expected, 'Exact APK changed before delivery')
    require(digest(baseline) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Fallback changed during packaging')
    checksum.write_text(expected+'  '+apk_out.name+'\n'+source_sha+'  '+source_out.name+'\n', encoding='utf-8')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=expected, source=str(source_out),
        sourceSHA256=source_sha, checksums=str(checksum), sourceFiles=len(files), rawCopiedUnchangedZIPMembers=reused,
        everySourceMemberCRCAndSHAStreamed=True, exactTestedAPKCopied=True, packageChecksPassed=True), indent=2))


if __name__ == '__main__': main()
