"""Package exact-emulator-verified v0.83 portrait Home and complete retained source.

This tool does not build, operate devices, generate observations or publish.
Only the approved native Home/orientation code, five new image resources,
exact version update and documentation may differ from delivered v0.82.
Unchanged source ZIP members retain their original compressed bytes.
"""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import argparse, hashlib, io, json, re, runpy, shutil, struct, subprocess

ROOT = Path(__file__).resolve().parents[1]
P = runpy.run_path(str(ROOT/'tools/package-multiplayer-072.py'), run_name='portrait083_helpers')
H, C = P['H'], P['C']
digest, zip_digest, require = (C[k] for k in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ASSETS = 'app/src/main/assets/'
DRAWABLE = 'app/src/main/res/drawable-nodpi/'
QA = 'qa/portrait-home-083/'
GRADLE = 'app/build.gradle.kts'
TOOL = 'tools/package-portrait-home-083.py'
FALLBACK = QA+'fallback.json'
ART = QA+'art-provenance.json'
REFERENCE = QA+'reference.png'
RECORD = 'archive/release-0.83-portrait-home.json'
RELEASE = 'docs/releases/0.83-portrait-home.md'
BASELINE_APK_SHA = 'fecd9bfb968cf0a96f0e8bf978c8616dfdbe5057bf2c83ee3b5971aff82bf702'
BASELINE_SOURCE_SHA = '034217613e15c49e037f0a463605466eb62240f57e4965495e171b4dc4b59c3e'
IMAGES = {DRAWABLE+'home_portrait_'+name+'_083.png'
          for name in ('hero', 'campaign', 'towers', 'ffa', 'multiplayer')}
NEW_JAVA = {JAVA+'PortraitHomeLayout.java', JAVA+'HomeOrientationPolicy.java'}
PRODUCT = {JAVA+name for name in ('HomeModesView.java', 'MainActivity.java', 'GraphicsSetupView.java')}
PRODUCT |= NEW_JAVA | IMAGES | {'app/src/main/AndroidManifest.xml'}
DOCS = {'AGENTS.md', 'README.md', 'README-WARZONE-TOWERS.md', 'design-qa.md', 'docs/KNOWN-ISSUES.md'}
REQUIRED_CHECKS = ('exactDeliveryAPK', 'homePortraitFidelity', 'allSixDestinationsLandscape',
                   'backToPortraitHome', 'noActivityReload', 'landscapeGameplayStable',
                   'smallPhoneLayout', 'enlargedTextLayout', 'resumeRestoration')
# Adding five drawable names reassigns resource IDs in these existing compiled
# XML references. Their sources stay frozen; every changed binary word and the
# full decoded XML tree must resolve to exactly the same resource name.
REFERENCE_RELINK_XML = {
    'res/drawable/ic_launcher_foreground.xml', 'res/drawable/warzone_splash.xml',
    'res/drawable/notification_bg.xml', 'res/drawable/notification_bg_low.xml',
    'res/drawable/notification_tile_bg.xml', 'res/layout/offline_ads_dialog.xml',
    'res/mipmap-anydpi-v26/ic_launcher.xml', 'res/mipmap-anydpi-v26/ic_launcher_round.xml'}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def repository_path(value):
    path = Path(value); path = (path if path.is_absolute() else ROOT/path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside repository evidence: '+str(value))
    return path


def pin(path):
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def checked_sources(proof, label):
    rows = proof.get('sources'); require(isinstance(rows, list) and rows, label+' has no checked source pins')
    names = set()
    for row in rows:
        path = repository_path(row.get('path', '')); name = path.relative_to(ROOT).as_posix()
        require(name not in names and digest(path) == row.get('sha256'), label+' has duplicate/stale source: '+name)
        names.add(name)
    return names


def baseline_paths():
    proof = read_json(ROOT/FALLBACK)
    require(proof.get('version') == '0.83' and proof.get('sha256VerifiedBeforeEdits') is True,
            'Verified initial v0.82 fallback record required')
    paths = []
    for suffix, expected in (('.apk', BASELINE_APK_SHA), ('.zip', BASELINE_SOURCE_SHA)):
        rows = [r for r in proof.get('immutableFallbacks', []) if str(r.get('path', '')).endswith(suffix)]
        require(len(rows) == 1, 'Ambiguous082 fallback '+suffix)
        row = rows[0]; path = Path(row['path']).resolve()
        require(path.is_file() and row.get('sha256') == expected and path.stat().st_size == row.get('bytes')
                and digest(path) == expected, 'Delivered082 fallback changed: '+str(path))
        paths.append(path)
    return paths


def validate_art():
    from PIL import Image
    proof = read_json(ROOT/ART); rows = proof.get('assets', [])
    require(proof.get('version') == '0.83' and len(rows) == 5 and {r.get('path') for r in rows} == IMAGES,
            'Five exact approved portrait artwork resources required')
    reference = proof.get('sourceReference', {})
    require(reference.get('path') == REFERENCE and digest(repository_path(REFERENCE)) == reference.get('sha256'),
            'Selected original reference missing/changed')
    for row in rows:
        path = repository_path(row['path'])
        require(row.get('copiedWithoutImageModification') is True and row.get('sha256') == digest(path)
                and row.get('bytes') == path.stat().st_size and isinstance(row.get('prompt'), str)
                and row['prompt'].strip(), 'Artwork provenance changed/incomplete: '+row['path'])
        with Image.open(path) as image:
            require(image.format == 'PNG' and image.size == (row['width'], row['height']), 'Wrong artwork dimensions/format')
            image.verify()
    return dict(provenance=pin(ROOT/ART), reference=pin(ROOT/REFERENCE), assets=[dict(r) for r in rows])


def validate_observations(verification_path, host_paths, build_log, expected):
    proof = read_json(verification_path)
    require(proof.get('version') == '0.83' and proof.get('passed') is True and proof.get('emulatorUsed') is True,
            'Passed real083 exact-APK verification required')
    require(proof.get('candidateAPK_SHA256') == proof.get('installedAPK_SHA256') == expected,
            'Emulator did not run the exact delivery APK')
    require(isinstance(proof.get('device'), str) and proof['device'].startswith('emulator-'), 'Emulator identity missing')
    require(all(proof.get('checks', {}).get(name) is True for name in REQUIRED_CHECKS),
            'Required portrait/orientation/layout/restoration observations missing')
    require(isinstance(proof.get('verificationScope'), str) and proof['verificationScope'].strip()
            and isinstance(proof.get('limitations'), list), 'Verification scope/limitations missing')
    require('BUILD SUCCESSFUL' in build_log.read_text(encoding='utf-8-sig', errors='replace'), 'Successful final build log missing')
    require(proof.get('buildLog', {}).get('sha256') == digest(build_log), 'Build log changed after recording')
    require(PRODUCT | {GRADLE, TOOL, ART} <= checked_sources(proof, 'Exact-APK proof'),
            'Verification lacks current083 product/version/package/art pins')
    evidence = {verification_path.relative_to(ROOT).as_posix(), build_log.relative_to(ROOT).as_posix(), ART, REFERENCE}
    observed = set(); rows = proof.get('evidence', [])
    require(isinstance(rows, list) and rows, 'Pinned actual observations missing')
    for row in rows:
        path = repository_path(row.get('path', '')); name = path.relative_to(ROOT).as_posix()
        require(name not in observed and row == pin(path), 'Missing/stale actual observation: '+name)
        observed.add(name)
    require(any(n.endswith('.png') for n in observed) and any(n.endswith('.json') for n in observed),
            'Actual screenshots and device/installation/navigation state required')
    evidence |= observed; coverage = set(); hosts = []; counts = {}
    require(host_paths, 'Current native Home geometry/orientation host proofs required')
    for path in host_paths:
        host = read_json(path); label = path.relative_to(ROOT).as_posix()
        require(host.get('version') == '0.83' and host.get('passed') is True and host.get('emulatorUsed') is False
                and not host.get('fatal'), 'Failed/stale083 focused proof: '+label)
        require(host.get('engineExecuted', host.get('actualNativeEngineExecuted', False)) is False,
                'Host checks must not claim native gameplay: '+label)
        checks = host.get('checks')
        require(isinstance(checks, list) and checks and host.get('checksPassed') == len(checks)
                and all(isinstance(c, str) and c.strip() for c in checks), 'Missing assertion inventory: '+label)
        sources = checked_sources(host, label); coverage |= sources
        evidence |= {n for n in sources if n.startswith('qa/')}; evidence.add(label)
        counts[label] = len(checks); hosts.append(pin(path))
        for key in ('exceptions', 'badRequests'):
            if key in host: require(host[key] == [], 'Focused runtime/asset error: '+label)
        for value in host.get('screenshots', []):
            value = value.get('path') if isinstance(value, dict) else value
            shot = repository_path(value) if Path(value).is_absolute() or str(value).startswith('qa/') else repository_path(path.parent/value)
            require(shot.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n', 'Focused screenshot is not PNG')
            evidence.add(shot.relative_to(ROOT).as_posix())
    require(PRODUCT-IMAGES <= coverage, 'Focused proofs do not pin all scoped native Home/orientation sources')
    return dict(emulatorProof=pin(verification_path), buildLog=pin(build_log), focusedProofs=hosts,
                focusedAssertionCounts=counts, device=proof['device'], checks=proof['checks'],
                verificationScope=proof['verificationScope'], limitations=proof['limitations'],
                exactInstalledAPKVerified=True, emulatorUsed=True), evidence


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    retained = evidence | {FALLBACK, TOOL, RELEASE, ART, REFERENCE}
    names = set(filter(None, raw.decode().split('\0'))) | required | retained | {MANIFEST, RECORD}
    names |= {p.relative_to(ROOT).as_posix() for p in (ROOT/'app/src').rglob('*') if p.is_file()}
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if name.startswith('qa/') and name not in required | retained: continue
        if any(p in C['SKIP'] for p in rel.parts) or name in C['TRANSIENT'] or rel.suffix in {'.partial', '.tmp'}:
            require(name not in required | retained, 'Required source member would be omitted: '+name); continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES'] and not rel.name.startswith('.env')
                and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source: '+name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar', '-userdata.tar')), 'Runtime/userdata archive in source: '+name)
        path = ROOT/name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST, RECORD}), 'Missing source: '+name)
        files[name] = path
    require(required | retained <= set(files), 'Prior source or required083 evidence omitted')
    return files


def validate_source(source, files, evidence):
    with ZipFile(source) as old:
        names = set(old.namelist()); require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        manifest = json.loads(old.read(MANIFEST))['files']; prior = {row['path']: row for row in manifest}
        require(len(prior) == len(manifest) and set(prior) == names-{MANIFEST}, 'Incomplete082 complete-source manifest')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 82') == gradle.count(b'versionName = "0.82"') == 1, 'Ambiguous082 version')
        expected = gradle.replace(b'versionCode = 82', b'versionCode = 83').replace(b'versionName = "0.82"', b'versionName = "0.83"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact82-to83 version update')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']: continue
            require(name in PRODUCT | DOCS | {GRADLE}, 'Source outside portrait Home/orientation scope changed: '+name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files)-names
        for name in additions:
            require(name in NEW_JAVA | IMAGES | evidence | {FALLBACK, RELEASE, TOOL, RECORD, ART, REFERENCE}
                    or name.startswith(('tools/', 'archive/')), 'Unexpected source addition: '+name)
        require(NEW_JAVA | IMAGES <= additions, 'Expected083 helper/image additions missing or overwrite baseline resources')
    return dict(changedBaselineSources=changed, addedSources=sorted(additions), baselineSourceEntries=len(names),
                everyBaselineSourceEntryRetained=True, allExistingAssetsNativeLibrariesMapsMusicAndResourceSourcesFrozen=True,
                onlyApprovedNativeHomeOrientationAndNewArtworkChanged=True)


def validate_compiled_xml_relinks(aapt, apk, baseline, current, old):
    mappings = []
    for path in (baseline, apk):
        dump = subprocess.check_output([str(aapt), 'dump', 'resources', str(path)], text=True, encoding='utf-8')
        mapping = {int(m.group(1), 16): m.group(2)
                   for m in re.finditer(r'^\s*resource (0x[0-9a-fA-F]{8}) ([^\s]+)', dump, re.M)}
        require(mapping, 'AAPT resource-name inventory is empty')
        mappings.append(mapping)
    before_names, after_names = (set(m.values()) for m in mappings)
    expected_names = {'drawable/'+Path(p).stem for p in IMAGES}
    require(before_names <= after_names and after_names-before_names == expected_names,
            'Resource-name inventory changed beyond the five new Home images')
    rows = []
    for name in old.namelist():
        if not name.startswith('res/') or not name.endswith('.xml'): continue
        before, after = old.read(name), current.read(name)
        if before == after: continue
        require(name in REFERENCE_RELINK_XML, 'Unreviewed existing compiled XML changed: '+name)
        require(len(before) == len(after) and len(before) % 4 == 0, 'Compiled XML structure/length changed: '+name)
        words = []
        for offset in range(0, len(before), 4):
            a, b = struct.unpack_from('<I', before, offset)[0], struct.unpack_from('<I', after, offset)[0]
            if a == b: continue
            require(a in mappings[0] and b in mappings[1] and mappings[0][a] == mappings[1][b],
                    'Compiled XML changed beyond same-name resource-ID relinking: '+name+' at '+str(offset))
            words.append(dict(offset=offset, beforeID=f'0x{a:08x}', afterID=f'0x{b:08x}', resource=mappings[0][a]))
        canonical = []
        for path, mapping in zip((baseline, apk), mappings):
            tree = subprocess.check_output([str(aapt), 'dump', 'xmltree', '--file', name, str(path)],
                                           text=True, encoding='utf-8')
            canonical.append(re.sub(r'0x[0-9a-fA-F]{8}',
                lambda m: '{'+mapping[int(m[0], 16)]+'}' if int(m[0], 16) in mapping else m[0], tree))
        require(words and canonical[0] == canonical[1], 'Decoded XML semantics changed: '+name)
        rows.append(dict(path=name, beforeSHA256=hashlib.sha256(before).hexdigest(), sha256=hashlib.sha256(after).hexdigest(),
                         sameLength=True, onlySameNameResourceIdWordsChanged=True, changedReferenceWords=words,
                         canonicalXmlTreesEqual=True, canonicalXmlTreeSHA256=hashlib.sha256(canonical[0].encode()).hexdigest(),
                         canonicalXmlTree=canonical[0]))
    return rows


def validate_apk(apk, baseline, expected):
    from PIL import Image
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK missing/changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='83'",
            "versionName='0.83'", "application-label:'Warzone Towers'")), 'Wrong083 APK identity/version')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT/H['BUILD_CONFIG']).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*83\s*;', config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.83"\s*;', config),
            'Generated BuildConfig version mismatch')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt/duplicate APK')
        require(prior <= names, 'A baseline APK member was removed')
        xml_relinks = validate_compiled_xml_relinks(aapt, apk, baseline, current, old)
        relinked = {row['path'] for row in xml_relinks}
        source_assets = {p.relative_to(ROOT/ASSETS).as_posix(): p for p in (ROOT/ASSETS).rglob('*') if p.is_file()}
        require({n for n in names if n.startswith('assets/')} == {'assets/'+n for n in source_assets}, 'APK asset inventory changed')
        art_members = {}; artwork = []
        for source in sorted(IMAGES):
            matches = [n for n in names if n.startswith('res/') and Path(n).name == Path(source).name]
            require(len(matches) == 1 and matches[0] not in prior, 'New artwork resource missing/ambiguous: '+source)
            member = matches[0]; art_members[member] = source
            with Image.open(ROOT/source) as original, Image.open(io.BytesIO(current.read(member))) as packaged:
                require(original.size == packaged.size and original.convert('RGBA').tobytes() == packaged.convert('RGBA').tobytes(),
                        'APK artwork pixels differ from generated source: '+source)
            artwork.append(dict(source=source, apkPath=member, sourceSHA256=digest(ROOT/source), apkSHA256=zip_digest(current, member)))
        changed = []
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name): continue
            require(C['metadata'](name) or name in art_members or name in relinked, 'Unexpected changed APK member: '+name)
            changed.append(name)
        for name, path in source_assets.items():
            require(zip_digest(current, 'assets/'+name) == digest(path), 'APK/source asset mismatch: '+name)
        for name in prior:
            if name.startswith(('lib/', 'res/', 'assets/')) and name not in relinked:
                require(zip_digest(current, name) == zip_digest(old, name), 'Frozen existing resource/library/game asset changed: '+name)
        require(current.getinfo('assets/warzone/music/music.data').compress_type == ZIP_STORED, 'Bundled soundtrack was compressed')
        ordered = sorted(current.infolist(), key=lambda i: i.header_offset); gaps = [ordered[0].header_offset]
        for i, info in enumerate(ordered):
            end = info.header_offset+30+len(info.filename.encode('utf-8'))+len(info.extra)+info.compress_size
            next_start = ordered[i+1].header_offset if i+1 < len(ordered) else current.start_dir
            gaps.append(max(0, next_start-end))
        require(max(gaps) < 2*1024*1024, 'Large unused APK gap; clean build required')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, everyBaselineAPKMemberRetained=True,
                allAPKAssetsMatchSource=True, allExistingAssetAndLibraryBytesFrozen=True,
                existingNonRelinkedResourceBytesFrozen=True, compiledXmlResourceReferencesSemanticallyFrozen=True,
                compiledXmlResourceRelinks=xml_relinks,
                newArtworkPixelsMatchSource=True, newArtwork=artwork, maximumAPKZipGapBytes=max(gaps))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True); parser.add_argument('--build-log', required=True)
    parser.add_argument('--verification', required=True); parser.add_argument('--host-proof', action='append', default=[])
    parser.add_argument('--evidence', action='append', default=[]); parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true'); args = parser.parse_args()
    expected = args.expected_sha256.lower(); require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery outputs must stay outside repository')
    # Reject simple path/proof mistakes before streaming the multi-gigabyte fallback.
    for name in PRODUCT | DOCS | {GRADLE, TOOL, FALLBACK, ART, REFERENCE, RELEASE}:
        repository_path(name)
    proof_path = repository_path(args.verification); log = repository_path(args.build_log)
    verification, evidence = validate_observations(proof_path, [repository_path(p) for p in args.host_proof], log, expected)
    art = validate_art(); evidence |= {repository_path(p).relative_to(ROOT).as_posix() for p in args.evidence}
    baseline, source = baseline_paths()
    with ZipFile(source) as old: required = set(old.namelist())
    files = source_inventory(required, evidence); preservation = validate_source(source, files, evidence)
    apk_record = validate_apk(args.apk.resolve(), baseline, expected)
    require(digest(args.apk) == expected, 'APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files),
              exactAPKVerification=verification, **preservation, **apk_record), indent=2)); return
    apk_out, source_out, checksum = (args.output/n for n in ('Warzone-Towers-0.83.apk', 'warzone-towers-0.83-source.zip', 'Warzone-Towers-0.83-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.83', versionCode=83, candidateAPK_SHA256=expected,
        scope='Approved portrait Home artwork/native layout, six landscape destinations and portrait Home return/restoration. All existing game assets, native clients, gameplay and unrelated interfaces frozen.',
        exactAPKVerification=verification, fallback=pin(ROOT/FALLBACK), artwork=art,
        sourcePreservation=preservation, **apk_record, nativeBuildPerformed=False, emulatorUsed=True,
        actualAndroidViewsExecuted=True, offlineHostChecksPassed=True, buildChecksPassed=True, packageChecksPassed=True,
        githubPublished=False, vpsChanged=False, recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT/RECORD).write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
    entries = [dict(path=n, bytes=p.stat().st_size, sha256=digest(p)) for n, p in files.items() if n != MANIFEST]
    (ROOT/MANIFEST).write_text(json.dumps(dict(schemaVersion=1, files=entries), indent=2)+'\n', encoding='utf-8')
    args.output.mkdir(parents=True, exist_ok=True); reused = H['write_source_zip'](source, partial, files, entries)
    require(digest(args.apk) == expected, 'Candidate changed during source packaging')
    shutil.copy2(args.apk, apk_out); require(digest(apk_out) == expected, 'APK copy changed')
    with ZipFile(partial) as archive, ZipFile(apk_out) as apk:
        require(required <= set(archive.namelist()), 'Prior complete source member missing')
        for name in files:
            if name.startswith(ASSETS): require(zip_digest(archive, name) == zip_digest(apk, 'assets/'+name[len(ASSETS):]), 'SourceZIP/APK asset mismatch: '+name)
        for name in IMAGES: require(zip_digest(archive, name) == digest(ROOT/name), 'Source ZIP artwork changed: '+name)
    partial.rename(source_out); source_sha = digest(source_out)
    require(digest(args.apk) == expected and digest(apk_out) == expected, 'Exact APK changed before delivery')
    require(digest(baseline) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Fallback changed during packaging')
    checksum.write_text(expected+'  '+apk_out.name+'\n'+source_sha+'  '+source_out.name+'\n', encoding='utf-8')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=expected, source=str(source_out),
        sourceSHA256=source_sha, checksums=str(checksum), sourceFiles=len(files), rawCopiedUnchangedZIPMembers=reused,
        everySourceMemberCRCAndSHAStreamed=True, exactTestedAPKCopied=True, packageChecksPassed=True), indent=2))


if __name__ == '__main__': main()
