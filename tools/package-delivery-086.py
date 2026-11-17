"""Verify and package the exact v0.86 APK and complete retained source.

No build, emulator, device observation, Git publication or VPS operation occurs
here. Evidence belongs to this candidate hash. Every v0.85 source ZIP member is
retained; unchanged members reuse their original compressed bytes. Native source,
music, engines and data are frozen except three command-only VFS appends.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
from datetime import datetime, timezone
import argparse, json, re, runpy, shutil, subprocess

ROOT = Path(__file__).resolve().parents[1]
H = runpy.run_path(str(ROOT/'tools/package-42-sage.py'), run_name='delivery086_zip_helpers')
C = H['COMMON']
digest, zip_digest, require = (C[k] for k in ('digest', 'zip_digest', 'require'))
VFS = runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'), run_name='delivery086_vfs_helpers')
MANIFEST = C['MANIFEST']
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ASSETS = 'app/src/main/assets/'
GRADLE = 'app/build.gradle.kts'
BUILD_CONFIG = 'app/build/generated/source/buildConfig/debug/com/rbabbit/blocknight/warzone/BuildConfig.java'
QA = 'qa/delivery-086/'
TOOL = 'tools/package-delivery-086.py'
RECORD = 'archive/release-0.86.json'
RELEASE = 'docs/releases/0.86.md'
BASE_APK = ROOT.parent/'Warzone-Towers-0.85.apk'
BASE_SOURCE = ROOT.parent/'warzone-towers-0.85-source.zip'
BASE_APK_SHA = '3ac04321ffcd98b928577ac7b14e717fdd04c695170001e1b830df9b95a2735f'
BASE_SOURCE_SHA = '8bf7ab85374f5d65c7490b7e4fcb46e6377094ec74abc5e148ab7b6f77dc84ce'
JAVA_CHANGED = {JAVA+n for n in ('GraphicsSetupView.java', 'HomeModesView.java',
    'HomeMenuLayout.java', 'MainActivity.java', 'MultiplayerActivity.java',
    'MultiplayerLobbyView.java', 'MultiplayerLobbyModel.java')}
JAVA_NEW = {JAVA+n for n in ('AppUpdateController.java', 'AppUpdatePolicy.java',
    'AppUpdateProvider.java', 'AppUpdateTransfer.java', 'MultiplayerSessionService.java')}
MP_CHANGED = {ASSETS+'multiplayer/'+n for n in ('engine.html', 'session.js',
    'lobby-ui.js', 'native-landing.js', 'room-ui.js', 'mobile-ui-runtime.js')}
MP_NEW = {ASSETS+'multiplayer/background-frames.js'}
PAYLOADS = (
    ('warzone2100-towers-052.js', 'warzone2100.data', '/data/mp/tests/warzone-towers-commands.js',
     ('scenario/warzone-towers-commands.js',)),
    ('warzone2100-ffa.js', 'warzone2100-ffa.data', '/data/mp/tests/ffa-commands.js',
     ('scenario/ffa/commands.js',)),
    ('warzone2100-campaign.js', 'warzone2100-campaign.data', '/data/base/script/campaign/mobile/campaign-bridge.js',
     ('campaign/mobile-events.js', 'campaign/research-bridge.js', 'campaign/commands.js')))
PAYLOAD_SOURCE = {ASSETS+'warzone/'+n for row in PAYLOADS for n in row[:2]}
COMMAND_SOURCE = {'scenario/warzone-towers-commands.js', 'scenario/ffa/commands.js', 'campaign/commands.js'}
ASSET_SOURCE = MP_CHANGED | MP_NEW | PAYLOAD_SOURCE | {ASSETS+'warzone-command-pages.js', ASSETS+'warzone/ui/towers-commands.css'}
RESOURCE_NEW = {'app/src/main/res/drawable/ic_multiplayer_session.xml'}
PRODUCT = JAVA_CHANGED | JAVA_NEW | ASSET_SOURCE | COMMAND_SOURCE | RESOURCE_NEW | {'app/src/main/AndroidManifest.xml'}
DOCS = {'AGENTS.md', 'README.md', 'README-WARZONE-TOWERS.md', 'docs/KNOWN-ISSUES.md'}
NEW_DOCS = {RELEASE, 'docs/releases/0.86-manufacturing-all.md', 'docs/warzone-updates-086.md',
    'docs/updates-086.md', 'docs/deployment/warzone-updates-086.md', 'docs/APP-UPDATES.md',
    'docs/releases/0.86-mp-background-audit.md'}
NEW_TOOLS = {TOOL} | {'tools/'+n for n in ('device-086.cjs', 'embed-manufacturing-all-086.py',
    'test-manufacturing-all-086.cjs', 'test-manufacturing-all-browser-086.cjs',
    'test-multiplayer-lifecycle-086.cjs', 'test-app-updates-086.java', 'test-app-updates-086.py',
    'deploy-warzone-updates-086.py', 'deploy-warzone-updates-086.ps1', 'deploy-warzone-updates-086.sh',
    'journey-086.cjs', 'deploy-warzone-update-086.py', 'record-delivery-086.py', 'probe-manufacturing-086.cjs',
    'manufacturing-gameplay-086.cjs', 'directory-error-086.cjs', 'load-retained-towers-086.cjs',
    'update-journey-086.cjs', 'mp-input-086.cjs')}
NEW_QA = ('qa/delivery-086/', 'qa/manufacturing-all-086/', 'qa/mp-updates-manufacturing-086/', 'qa/updates-086/')
QA_SUFFIXES = {'.json', '.png', '.xml', '.log', '.txt'}


def read(name):
    return json.loads((ROOT/name).read_text(encoding='utf-8-sig'))


def pin(path):
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def check_pins(rows, label):
    require(isinstance(rows, list) and rows, label+' has no pins')
    found = set()
    for row in rows:
        path = (ROOT/row.get('path', '')).resolve()
        require(path.is_relative_to(ROOT) and path.is_file() and row['path'] not in found,
                label+' invalid/duplicate source: '+str(row.get('path')))
        require(digest(path) == row.get('sha256'), label+' stale source/evidence: '+row['path'])
        if 'bytes' in row:
            require(path.stat().st_size == row['bytes'], label+' stale size: '+row['path'])
        found.add(row['path'])
    return found


def baseline():
    proof = read(QA+'fallback.json')
    require(proof.get('version') == '0.86' and proof.get('baselineVersion') == '0.85'
            and proof.get('sha256VerifiedBeforeEdits') is True, 'Initial fallback proof missing')
    expected = {str(BASE_APK.resolve()): (616050844, BASE_APK_SHA), str(BASE_SOURCE.resolve()): (3135416714, BASE_SOURCE_SHA)}
    require(len(proof.get('immutableFallbacks', [])) == 2, 'Ambiguous baseline inventory')
    for row in proof['immutableFallbacks']:
        path = Path(row['path']).resolve()
        require(str(path) in expected, 'Unexpected baseline path')
        size, sha = expected[str(path)]
        require(row.get('bytes') == size and row.get('sha256') == sha and path.stat().st_size == size
                and digest(path) == sha, 'Preserved v0.85 fallback changed: '+str(path))


def verify_build(apk, expected):
    proof = read(QA+'verification.json')
    require(proof.get('version') == '0.86' and proof.get('passed') is True, 'Current candidate verification missing')
    require(proof.get('candidateAPK_SHA256') == expected == digest(apk), 'Candidate verification/hash differs')
    require(isinstance(proof.get('limitations'), list) and all(isinstance(v, str) for v in proof['limitations']),
            'Explicit runtime limits must be recorded')
    require(isinstance(proof.get('observations'), list) and proof['observations'],
            'Fresh observed checks must be recorded; inherited success is insufficient')
    require(proof.get('checks', {}).get('androidBuild') is True, 'Successful Android build not recorded')
    source_names = check_pins(proof.get('sources'), 'Delivery sources')
    check_pins(proof.get('evidence'), 'Delivery evidence')
    check_pins([proof.get('buildLog', {})], 'Build log')
    log = (ROOT/proof['buildLog']['path']).read_text(encoding='utf-8-sig', errors='replace')
    require('BUILD SUCCESSFUL' in log, 'Recorded build failed')
    required_sources = {p for p in PRODUCT if (ROOT/p).exists() and (p in JAVA_NEW|MP_NEW|RESOURCE_NEW or p in changed_tracked())}
    require(required_sources|{GRADLE, TOOL} <= source_names, 'Changed product/version/package source pins missing')
    for name in ('qa/mp-updates-manufacturing-086/lifecycle-host.json', 'qa/updates-086/host-checks.json',
                 'qa/manufacturing-all-086/all.json', 'qa/manufacturing-all-086/baseline-native.json',
                 'qa/manufacturing-all-086/baseline-ui.json', 'qa/manufacturing-all-086/browser.json'):
        host = read(name)
        require(host.get('passed') is True, 'Focused feature check failed: '+name)
        require(host.get('emulatorUsed', False) is False and host.get('actualNativeEngineExecuted', False) is False
                and host.get('androidRuntime', False) is False and host.get('engineExecuted', False) is False,
                'Host proof incorrectly claims Android/native execution: '+name)
        check_pins(host.get('sources'), 'Focused feature check '+name)
    return proof


def changed_tracked():
    raw = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '-z'], cwd=ROOT).decode()
    return set(filter(None, raw.split('\0')))


def inventory():
    with ZipFile(BASE_SOURCE) as old:
        required = set(old.namelist())
    tracked = set(filter(None, subprocess.check_output(['git', 'ls-files', '--cached', '-z'], cwd=ROOT).decode().split('\0')))
    explicit = {n for n in JAVA_NEW|MP_NEW|RESOURCE_NEW|NEW_DOCS|NEW_TOOLS if (ROOT/n).is_file()}
    explicit |= {MANIFEST, RECORD, RELEASE}
    for prefix in NEW_QA:
        folder = ROOT/prefix
        if folder.exists():
            explicit |= {p.relative_to(ROOT).as_posix() for p in folder.rglob('*') if p.is_file()
                         and p.suffix.lower() in QA_SUFFIXES and not any(part in {'host-classes', '__pycache__'} or part.endswith('-classes') for part in p.relative_to(folder).parts)
                         and p.name != 'package.log'}
    names = required|tracked|explicit
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if (any(part in C['SKIP'] or part.endswith('-host-classes') for part in rel.parts)
                or name in C['TRANSIENT'] or rel.suffix.lower() in {'.class', '.pyc', '.partial', '.tmp'}):
            require(name not in required, 'A prior complete-source member would be omitted: '+name)
            continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES']|{'.key', '.sta2', '.apk'}
                and not rel.name.startswith('.env') and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/runtime source: '+name)
        path = ROOT/name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST, RECORD}), 'Missing retained source: '+name)
        files[name] = path
    require(required <= set(files), 'A complete v0.85 source member would be removed')
    require(JAVA_NEW|MP_NEW|RESOURCE_NEW|{TOOL, RELEASE} <= set(files), 'A new product/reproduction file is missing')
    return files, required


def verify_source(files):
    with ZipFile(BASE_SOURCE) as old:
        prior = {row['path']:row for row in json.loads(old.read(MANIFEST))['files']}
        require(set(prior) == set(old.namelist())-{MANIFEST}, 'Baseline source manifest is incomplete')
        expected_gradle = old.read(GRADLE).replace(b'versionCode = 85', b'versionCode = 86').replace(b'versionName = "0.85"', b'versionName = "0.86"')
        require(files[GRADLE].read_bytes() == expected_gradle, 'Gradle changed beyond versionCode/versionName')
        changed = []
        for name, row in prior.items():
            if digest(files[name]) == row['sha256']:
                continue
            require(name in PRODUCT|DOCS|{GRADLE}, 'Unrelated/historical baseline source changed: '+name)
            changed.append(name)
        added = set(files)-set(old.namelist())
        require(all(n in JAVA_NEW|MP_NEW|RESOURCE_NEW|NEW_DOCS|NEW_TOOLS|{RECORD}
                    or any(n.startswith(prefix) for prefix in NEW_QA) for n in added), 'Unlisted new source member: '+str(sorted(added-(JAVA_NEW|MP_NEW|RESOURCE_NEW|NEW_DOCS|NEW_TOOLS|{RECORD}))))
        # These assets must be full retained bytes, never Git LFS pointers.
        require(files[C['NATIVE_SOURCE']].stat().st_size > 100*1024*1024, 'Full native source is absent')
        require(digest(files[C['NATIVE_SOURCE']]) == prior[C['NATIVE_SOURCE']]['sha256'], 'Retained native source changed')
    return dict(everyBaselineSourceMemberRetained=True, changedBaselineSources=changed, addedSources=sorted(added), fullNativeSourceAndMusicRetained=True)


def assembled(parts):
    if len(parts) == 1:
        return (ROOT/parts[0]).read_bytes()
    return '\n'.join((ROOT/p).read_text(encoding='utf-8') for p in parts).encode('utf-8')


def verify_command_payloads(current, old):
    proof = read('qa/manufacturing-all-086/payload.json')
    require(proof.get('version') == '0.86' and proof.get('passed') is True and proof.get('noNativeBuild') is True, 'Fresh command append proof missing')
    check_pins(proof['sources'], 'Command append tools')
    reports = []
    for loader_name, data_name, virtual, parts in PAYLOADS:
        loader_path = 'assets/warzone/'+loader_name
        before = old.read(loader_path).decode('utf-8'); after = current.read(loader_path).decode('utf-8')
        start, end, _, baseline_index = VFS['package_call'](before)
        nstart, nend, _, index = VFS['package_call'](after)
        require(before[:start]+'PACKAGE_INDEX'+before[end:] == after[:nstart]+'PACKAGE_INDEX'+after[nend:], 'Compiled loader/program changed: '+loader_name)
        data = old.read('assets/warzone/'+data_name); result = current.read('assets/warzone/'+data_name)
        content = assembled(parts)
        require(result == data+content, 'Data change is not exact command append: '+data_name)
        entries = {row['filename']:row for row in index['files']}
        originals = {row['filename']:row for row in baseline_index['files']}
        require(set(entries) == set(originals) and len(entries) == len(index['files']) and index['remote_package_size'] == len(result), 'VFS inventory/size changed')
        for name, row in entries.items():
            expected = dict(originals[name])
            if name == virtual:
                expected.update(start=len(data), end=len(result))
            require(row == expected, 'Unrelated VFS metadata changed: '+name)
        require(entries[virtual]['end']-entries[virtual]['start'] == len(content), 'Command row length differs')
        reports.append(dict(loader=loader_name, data=data_name, onlyChangedVirtualFile=virtual,
                            originalDataPrefixUnchanged=True, compiledProgramUnchanged=True, unchangedOtherVirtualFiles=len(entries)-1))
    return reports


def resource_ids(aapt, apk):
    output = subprocess.check_output([str(aapt), 'dump', 'resources', str(apk)], text=True, encoding='utf-8')
    return {address.lower():name for address, name in re.findall(r'\bresource (0x[0-9a-fA-F]+) ([^\s]+)', output)}


def normalized_resource_xml(aapt, apk, name, ids):
    output = subprocess.check_output([str(aapt), 'dump', 'xmltree', '--file', name, str(apk)], text=True, encoding='utf-8')
    return re.sub(r'0x7f[0-9a-fA-F]{6}', lambda m: ids.get(m.group(0).lower(), m.group(0)), output)


def verify_apk(apk, expected):
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='86'", "versionName='0.86'", "application-label:'Warzone Towers'")), 'APK identity/version differs')
    certificate = H['certificate'](apk, java, signer)
    require(certificate == H['certificate'](BASE_APK, java, signer), 'Signing identity changed')
    config = (ROOT/BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*86\s*;', config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.86"\s*;', config), 'Generated Android version differs')
    allowed_assets = {'assets/'+name[len(ASSETS):] for name in ASSET_SOURCE}
    allowed_resources = {'res/drawable/ic_multiplayer_session.xml'}
    changed, relocated = [], []
    with ZipFile(apk) as current, ZipFile(BASE_APK) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and prior <= names and current.testzip() is None, 'APK corrupt or prior member removed')
        current_ids, old_ids = resource_ids(aapt, apk), resource_ids(aapt, BASE_APK)
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name):
                continue
            if name.startswith('res/') and name not in allowed_resources:
                require(name in prior and name.endswith('.xml') and normalized_resource_xml(aapt, apk, name, current_ids) == normalized_resource_xml(aapt, BASE_APK, name, old_ids), 'Unrelated Android resource changed: '+name)
                relocated.append(name)
            else:
                require(C['metadata'](name) or name in allowed_assets|allowed_resources, 'Unexpected APK member changed: '+name)
            changed.append(name)
        assets = {p.relative_to(ROOT/ASSETS).as_posix():p for p in (ROOT/ASSETS).rglob('*') if p.is_file()}
        require({name for name in names if name.startswith('assets/')} == {'assets/'+name for name in assets}, 'Source/APK asset inventory differs')
        for name, path in assets.items():
            require(zip_digest(current, 'assets/'+name) == digest(path), 'Source/APK asset differs: '+name)
        require(current.getinfo('assets/warzone/music/music.data').compress_type == ZIP_STORED, 'Soundtrack compression changed')
        payloads = verify_command_payloads(current, old)
        ordered = sorted(current.infolist(), key=lambda info:info.header_offset); gaps = [ordered[0].header_offset]
        for i, info in enumerate(ordered):
            end = info.header_offset+30+len(info.filename.encode())+len(info.extra)+info.compress_size
            following = ordered[i+1].header_offset if i+1 < len(ordered) else current.start_dir
            gaps.append(max(0, following-end))
        require(max(gaps) < 2*1024*1024, 'Large unused APK gap; clean rebuild required')
    require(digest(apk) == expected, 'Candidate changed during APK validation')
    return dict(certificateSHA256=certificate, changedAPKMembers=changed,
                resourceReferenceRelocationsOnly=relocated, allSourceAssetsMatchAPK=True,
                frozenEnginesWasmMapsMusicAndLibraries=True, commandOnlyPayloadAppends=payloads)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--validate-only', action='store_true')
    parser.add_argument('--validate-apk-only', action='store_true',
                        help='Write hash-bound APK integrity proof before deployment; no delivery archives')
    args = parser.parse_args(); expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK checksum')
    apk = ROOT/'app/build/outputs/apk/debug/app-debug.apk'
    baseline()
    if args.validate_apk_only:
        integrity = verify_apk(apk, expected)
        report = dict(version='0.86', passed=True, candidateAPK_SHA256=expected, deliveryWritten=False,
                      scope='APK identity/signature, source/asset parity, frozen native assets and three exact command-only appends; no runtime observation.',
                      sources=[pin(ROOT/name) for name in sorted({TOOL, GRADLE} | {p for p in PRODUCT if (ROOT/p).is_file()})],
                      recordedUTC=datetime.now(timezone.utc).isoformat(), **integrity)
        destination = ROOT/QA/'apk-integrity.json'
        destination.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(dict(passed=True, candidateAPK_SHA256=expected, deliveryWritten=False,
                              report=destination.relative_to(ROOT).as_posix()), indent=2)); return
    proof = verify_build(apk, expected)
    files, required = inventory(); preservation = verify_source(files); integrity = verify_apk(apk, expected)
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files), **preservation, **integrity), indent=2)); return
    out = ROOT.parent
    apk_out = out/'Warzone-Towers-0.86.apk'; zip_out = out/'warzone-towers-0.86-source.zip'
    partial = zip_out.with_suffix('.zip.partial'); checksums = out/'Warzone-Towers-0.86-SHA256.txt'
    require(not any(path.exists() for path in (apk_out, zip_out, partial, checksums)), 'New delivery outputs already exist; never overwrite')
    record = dict(version='0.86', versionCode=86, candidateAPK_SHA256=expected,
        scope='MP session/background and directory retries; VPS signed APK update flow; same-category Manufacturing ALL plus existing cycle.',
        packageIntegrityPassed=True, nativeBuildPerformed=False, githubPublished=False,
        verification=pin(ROOT/QA/'verification.json'), fallback=pin(ROOT/QA/'fallback.json'),
        observations=proof['observations'], limitations=proof['limitations'], checks=proof['checks'],
        runtimeEvidenceIsCandidateSpecific=True, sourcePreservation=preservation,
        recordedUTC=datetime.now(timezone.utc).isoformat(), **integrity)
    for key in ('emulatorUsed', 'actualAndroidViewsExecuted', 'actualNativeEngineExecuted', 'vpsUpdateDeployment'):
        if key in proof:
            record[key] = proof[key]
    (ROOT/RECORD).write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
    entries = [dict(path=name, bytes=path.stat().st_size, sha256=digest(path)) for name, path in files.items() if name != MANIFEST]
    (ROOT/MANIFEST).write_text(json.dumps(dict(schemaVersion=1, files=entries), indent=2)+'\n', encoding='utf-8')
    reused = H['write_source_zip'](BASE_SOURCE, partial, files, entries)
    shutil.copy2(apk, apk_out); require(digest(apk_out) == expected, 'Copied APK differs')
    with ZipFile(partial) as archive, ZipFile(apk_out) as packed:
        require(required <= set(archive.namelist()), 'A baseline source ZIP member was omitted')
        for name in files:
            if name.startswith(ASSETS):
                require(zip_digest(archive, name) == zip_digest(packed, 'assets/'+name[len(ASSETS):]), 'Packaged source/APK asset differs: '+name)
    partial.rename(zip_out); source_sha = digest(zip_out)
    require(digest(BASE_APK) == BASE_APK_SHA and digest(BASE_SOURCE) == BASE_SOURCE_SHA, 'Fallback changed during packaging')
    checksums.write_text(expected+'  '+apk_out.name+'\n'+source_sha+'  '+zip_out.name+'\n', encoding='utf-8')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=expected,
        source=str(zip_out), sourceSHA256=source_sha, checksums=str(checksums), sourceFiles=len(files),
        rawCopiedUnchangedZIPMembers=reused), indent=2))


if __name__ == '__main__':
    main()
