"""Package exact-emulator-verified082 APK and complete retained source.

No build, emulator, network, native rebuild or observation is performed here.
Only the Home tagline and isolated MP spectator interface/client, version and
documentation may change from delivered081. Reuse unchanged compressed source members verbatim.
"""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import argparse, json, re, runpy, shutil, subprocess

ROOT=Path(__file__).resolve().parents[1]
P=runpy.run_path(str(ROOT/'tools/package-multiplayer-072.py'),run_name='spectator082_helpers')
H,C=P['H'],P['C']
digest,zip_digest,require=(C[k] for k in ('digest','zip_digest','require'))
MANIFEST=C['MANIFEST'];ASSETS='app/src/main/assets/';MP=ASSETS+'multiplayer/'
HOME='app/src/main/java/com/rbabbit/blocknight/warzone/HomeModesView.java'
NATIVE='vendor/multiplayer/native-082/'
QA='qa/multiplayer-spectator-082/'
STOCK_DATA_SHA='9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
UPSTREAM='7d3d8e51a61ceee89e6bf672a41337e1a9cd7392'
GRADLE='app/build.gradle.kts';TOOL='tools/package-multiplayer-spectator-082.py'
FALLBACK=QA+'fallback.json'
RECORD='archive/release-0.82-multiplayer-spectator.json'
RELEASE='docs/releases/0.82-multiplayer-spectator.md'
BASELINE_APK_SHA='f7bd4fc6d03a54f8f3f9995dcdfdec0be69efd02eac95bbd45a7c9a463ee724b'
BASELINE_SOURCE_SHA='7b7dd7923aa58339629f7d5a95b7e1e0a4f7b28d55733ebff5b585a08601be29'
PRODUCT={MP+n for n in ('index.html','multiplayer.css','session.js','native-ui-adapter.js',
    'mobile-controls.js','warzone2100.js','warzone2100.wasm')}|{HOME}
BINARY_PRODUCT={MP+'warzone2100.js',MP+'warzone2100.wasm'}
DOCS={'AGENTS.md','README.md','README-WARZONE-TOWERS.md','design-qa.md','docs/KNOWN-ISSUES.md','vendor/multiplayer/README.md'}
APK_ASSETS={'assets/'+p[len(ASSETS):] for p in PRODUCT if p.startswith(ASSETS)}
REQUIRED_CHECKS=('exactDeliveryAPK','homeTagline','spectatorPrestartAndMatch',
    'spectatorFramesAdvance','spectatorCamera','spectatorReadOnly','spectatorMenusAndReturn',
    'ordinaryPlayerPermissions')

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def repository_path(value):
    path=Path(value);path=(path if path.is_absolute() else ROOT/path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(),'Missing/outside repository evidence: '+str(value))
    return path

def pin(path):
    return dict(path=path.relative_to(ROOT).as_posix(),bytes=path.stat().st_size,sha256=digest(path))

def checked_sources(proof,label):
    rows=proof.get('sources');require(isinstance(rows,list) and rows,label+' has no checked source pins')
    names=set()
    for row in rows:
        path=repository_path(row.get('path',''));name=path.relative_to(ROOT).as_posix()
        require(name not in names and digest(path)==row.get('sha256'),label+' has duplicate/stale source: '+name)
        names.add(name)
    return names

def baseline_paths():
    rows=read_json(ROOT/FALLBACK).get('immutableFallbacks',[]);paths=[]
    for suffix,expected in (('.apk',BASELINE_APK_SHA),('.zip',BASELINE_SOURCE_SHA)):
        matches=[r for r in rows if str(r.get('path','')).endswith(suffix)]
        require(len(matches)==1,'Ambiguous081 fallback '+suffix);row=matches[0];path=Path(row['path']).resolve()
        require(path.is_file() and row.get('sha256')==expected and path.stat().st_size==row.get('bytes')
            and digest(path)==expected,'Delivered081 fallback changed: '+str(path));paths.append(path)
    return paths

def validate_observations(emulator_path,host_paths,build_log,expected):
    proof=read_json(emulator_path)
    require(proof.get('version')=='0.82' and proof.get('passed') is True and proof.get('emulatorUsed') is True,
        'Passed real082 emulator proof required')
    require(proof.get('candidateAPK_SHA256')==proof.get('installedAPK_SHA256')==expected,
        'Emulator did not run the exact delivery APK')
    require(isinstance(proof.get('device'),str) and proof['device'].startswith('emulator-'),
        'Observed emulator identity is missing')
    require(all(proof.get('checks',{}).get(name) is True for name in REQUIRED_CHECKS),
        'Required Home/spectator exact-APK observations are missing')
    require(isinstance(proof.get('verificationScope'),str) and proof['verificationScope'].strip()
        and isinstance(proof.get('limitations'),list),'Emulator scope/limitations are missing')
    require(proof.get('fixture',{}).get('publicMessagesSent') is False,'Public-room messages are not authorized')
    require('BUILD SUCCESSFUL' in build_log.read_text(encoding='utf-8-sig',errors='replace'),
        'Successful final Gradle build log missing')
    require(proof.get('buildLog',{}).get('sha256')==digest(build_log),'Build log changed after emulator recording')
    require(PRODUCT|{GRADLE,TOOL} <= checked_sources(proof,'Exact-APK proof'),
        'Emulator evidence lacks current082 product/version/package source pins')
    evidence={emulator_path.relative_to(ROOT).as_posix(),build_log.relative_to(ROOT).as_posix()}
    rows=proof.get('evidence',[]);require(isinstance(rows,list) and rows,'Pinned actual observations missing')
    observed=set()
    for row in rows:
        path=repository_path(row['path']);name=path.relative_to(ROOT).as_posix()
        require(name not in observed and row==pin(path),'Missing/stale emulator observation: '+name)
        observed.add(name)
    require(any(n.endswith('.png') for n in observed) and any(n.endswith('.json') for n in observed),
        'Actual emulator screenshots and native/installation state are both required')
    evidence|=observed;coverage=set();hosts=[];counts={}
    require(host_paths,'Focused current-source host/browser proof missing')
    for path in host_paths:
        host=read_json(path);label=path.relative_to(ROOT).as_posix()
        require(host.get('version')=='0.82' and host.get('passed') is True and host.get('emulatorUsed') is False
            and not host.get('fatal'),'Failed/stale082 focused proof: '+label)
        require(host.get('engineExecuted',host.get('actualNativeEngineExecuted',False)) is False,
            'Host checks must not claim native gameplay: '+label)
        checks=host.get('checks');require(isinstance(checks,list) and checks and host.get('checksPassed')==len(checks)
            and all(isinstance(c,str) and c.strip() for c in checks),'Missing passed assertion inventory: '+label)
        host_sources=checked_sources(host,label);coverage|=host_sources;evidence|={n for n in host_sources if n.startswith('qa/')};counts[label]=len(checks);hosts.append(pin(path));evidence.add(label)
        if 'exceptions' in host:require(host['exceptions']==[],'Host/browser runtime error: '+label)
        if 'badRequests' in host:require(host['badRequests']==[],'Host/browser asset error: '+label)
        for value in host.get('screenshots',[]):
            candidate=Path(value)
            shot=repository_path(value) if candidate.is_absolute() or str(value).startswith('qa/') else repository_path(path.parent/candidate)
            require(shot.read_bytes()[:8]==b'\x89PNG\r\n\x1a\n','Focused screenshot is not PNG')
            evidence.add(shot.relative_to(ROOT).as_posix())
    require(PRODUCT-BINARY_PRODUCT<=coverage,'Focused checks do not pin all scoped Home/spectator source files')
    return dict(emulatorProof=pin(emulator_path),buildLog=pin(build_log),focusedProofs=hosts,
        focusedAssertionCounts=counts,device=proof['device'],checks=proof['checks'],
        verificationScope=proof['verificationScope'],limitations=proof['limitations'],
        exactInstalledAPKVerified=True,emulatorUsed=True),evidence

def source_inventory(required,evidence):
    raw=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT)
    retained=evidence|{FALLBACK,TOOL,RELEASE}|native_evidence();names=set(filter(None,raw.decode().split('\0')))|required|retained|{MANIFEST,RECORD}
    names|={p.relative_to(ROOT).as_posix() for p in (ROOT/'app/src').rglob('*') if p.is_file()}
    if (ROOT/NATIVE).is_dir():names|={p.relative_to(ROOT).as_posix() for p in (ROOT/NATIVE).rglob('*') if p.is_file()}
    files={}
    for name in sorted(names):
        rel=Path(name)
        if name.startswith('qa/') and name not in required|retained:continue
        if any(p in C['SKIP'] for p in rel.parts) or name in C['TRANSIENT'] or rel.suffix in {'.partial','.tmp'}:
            require(name not in required|retained,'Required source member would be omitted: '+name);continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES'] and not rel.name.startswith('.env')
            and name not in {'local.properties','tools/live-cdp-url.txt'},'Private/local source: '+name)
        require(not name.endswith(('.apk','-source.zip','-data.tar','-userdata.tar')),'Runtime/userdata archive in source: '+name)
        path=ROOT/name;require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST,RECORD}),'Missing source: '+name)
        files[name]=path
    require(required|retained <= set(files),'Prior source or required082 evidence omitted')
    return files

def native_evidence():
    if not (ROOT/NATIVE).is_dir():return set()
    folder=ROOT/QA
    names={p.relative_to(ROOT).as_posix() for p in folder.glob('*') if p.is_file()
        and (p.name.startswith(('native-','compile-')) and p.suffix in {'.json','.log','.cpp','.txt'})}
    names|={'tools/'+name for name in ('prepare-multiplayer-native-082.py','build-multiplayer-native-082.py','integrate-multiplayer-native-082.py')}
    return names


def validate_native_inputs(files,prior):
    require(digest(files[MP+'warzone2100.data'])==STOCK_DATA_SHA,'Official MP data changed')
    changed=any(digest(files[name])!=prior[name]['sha256'] for name in BINARY_PRODUCT)
    if not changed:
        require(not (ROOT/NATIVE).exists(),'New native sources exist but integrated compiler pair was not changed')
        return dict(nativeBuildPerformed=False,nativePairFrozen=True,officialMPDataFrozen=True)
    overlays=read_json(ROOT/NATIVE/'source-overlays.json')
    require(overlays.get('version')=='0.82' and overlays.get('upstreamCommit')==UPSTREAM
        and overlays.get('nativeDataUnchanged') is True and overlays.get('simulationSourcesUnchanged') is True,
        'Wrong spectator native provenance')
    rows=overlays.get('changed',[])+overlays.get('newIncludes',[])
    require(overlays.get('onlyChangedTranslationUnit')=='src/quickjs_backend.cpp','Spectator change must stay in private QJS UI client')
    helpers=overlays.get('sourceHelpers',[])
    require({r.get('path') for r in helpers}=={NATIVE+'mobile-ui-native.cpp.inc'},'Private native helper source pin missing')
    for row in helpers:
        require(row['path'] in files and digest(files[row['path']])==row['sha256'],'Native source helper changed')
    prepared=read_json(ROOT/(QA+'native-prepare.json'))
    require(prepared.get('sourceHelpers')==helpers,'Prepared native helper differs from reviewed source')
    require(rows and len(rows)==len({r['path'] for r in rows}),'Incomplete native source/include inventory')
    for row in rows:
        name=NATIVE+Path(row['path']).name
        require(name in files and files[name].stat().st_size==row['bytes'] and digest(files[name])==row['sha256'],
            'Native overlay/include changed: '+name)
        if row['path']!='src/quickjs_backend.cpp':
            retained='vendor/multiplayer/native-080/'+Path(row['path']).name
            require(retained in files and digest(files[name])==digest(files[retained]),'Non-owner native source changed: '+name)
    patch=(ROOT/NATIVE/'native-ui.patch').read_text(encoding='utf-8-sig')
    require(set(re.findall(r'^\+\+\+ b/(.+)$',patch,re.M))=={r['path'] for r in rows},'Native patch inventory differs')
    protocol=(ROOT/NATIVE/'netplay_config.h').read_text(encoding='utf-8-sig')
    require('NETCODE_VERSION_MAJOR = 0x4000' in protocol and 'NETCODE_VERSION_MINOR = 104' in protocol,'Official protocol changed')
    build=read_json(ROOT/(QA+'native-build.json'))
    require(build.get('version')=='0.82' and build.get('upstreamCommit')==UPSTREAM and build.get('protocolHeader')==protocol,'Wrong native compiler provenance')
    compiled={r['path']:r['sha256'] for r in build.get('sources',[])}
    retained_build=read_json(ROOT/'qa/multiplayer-room-080/native-build.json')
    retained_compiled={r['path']:r['sha256'] for r in retained_build.get('sources',[])}
    require(set(compiled)==set(retained_compiled) and all(value==retained_compiled[name] for name,value in compiled.items() if name!='src/quickjs_backend.cpp'),'Simulation/unrelated native compilation input changed')
    require(all(compiled.get(r['path'])==r['sha256'] for r in overlays.get('changed',[])),'Compiled source hashes differ')
    for row in build.get('raw',[]):
        name=NATIVE+'raw-'+row['name'];require(name in files and files[name].stat().st_size==row['bytes'] and digest(files[name])==row['sha256'],'Native compiler output changed: '+name)
    require({r['name'] for r in build.get('raw',[])}=={'warzone2100.js','warzone2100.wasm'},'Matched compiler pair incomplete')
    host=read_json(ROOT/(QA+'native-checks.json'));require(host.get('passed') is True and host.get('version')=='0.82','Native helper checks failed/missing')
    checked=checked_sources(host,'Native spectator checks')
    require({r['path'] for r in helpers}<=checked,'Private native helper lacks checked source pin')
    # Retained room includes are independently compared byte-for-byte with080 above.
    integration=read_json(ROOT/NATIVE/'runtime-integration.json')
    require(integration.get('version')=='0.82' and integration.get('protocol')==[16384,104] and integration.get('noWasmBinaryPatching') is True
        and integration.get('frozenDataSHA256')==STOCK_DATA_SHA,'Wrong spectator runtime integration')
    outputs=integration.get('outputs',[]);require({r['name'] for r in outputs}=={'warzone2100.js','warzone2100.wasm','warzone2100.data'},'Incomplete integrated pair/data inventory')
    for row in outputs:
        name=MP+row['name'];require(name in files and files[name].stat().st_size==row['bytes'] and digest(files[name])==row['sha256'],'Integrated native asset differs: '+name)
    require(digest(files[MP+'warzone2100.wasm'])==digest(files[NATIVE+'raw-warzone2100.wasm']),'WASM changed after compilation')
    return dict(nativeBuildPerformed=True,upstreamCommit=UPSTREAM,protocol=[16384,104],officialMPDataFrozen=True,
        completeNativePatch=pin(ROOT/NATIVE/'native-ui.patch'),nativeBuild=pin(ROOT/(QA+'native-build.json')),
        sourceOverlayManifest=pin(ROOT/NATIVE/'source-overlays.json'),integration=pin(ROOT/NATIVE/'runtime-integration.json'),
        portableNativeSourcesAndRawPairVerified=True,wasmBinaryUnmodifiedAfterCompiler=True)


def validate_source(source,files,evidence):
    with ZipFile(source) as old:
        names=set(old.namelist());require(len(names)==len(old.namelist()),'Duplicate baseline source entry')
        manifest=json.loads(old.read(MANIFEST))['files'];prior={r['path']:r for r in manifest}
        require(len(prior)==len(manifest) and set(prior)==names-{MANIFEST},'Incomplete081 complete-source manifest')
        gradle=old.read(GRADLE);require(gradle.count(b'versionCode = 81')==gradle.count(b'versionName = "0.81"')==1,'Ambiguous081 version')
        expected=gradle.replace(b'versionCode = 81',b'versionCode = 82').replace(b'versionName = "0.81"',b'versionName = "0.82"')
        require(files[GRADLE].read_bytes()==expected,'Gradle changed beyond version81-to82')
        changed=[]
        for name,row in prior.items():
            actual=digest(files[name])
            if actual==row['sha256']:continue
            require(name in PRODUCT|DOCS|{GRADLE},'Source outside requested082 Home/spectator scope changed: '+name)
            changed.append(dict(path=name,beforeSHA256=row['sha256'],sha256=actual))
        additions=set(files)-names
        for name in additions:
            require(not name.startswith(('app/','scenario/','campaign/','vendor/')) or name.startswith(NATIVE),'New product/native file is not authorized: '+name)
            require(name.startswith(('tools/','archive/','docs/')) or name.startswith(NATIVE) or name in evidence|native_evidence()|{FALLBACK},'Unexpected source addition: '+name)
    native=validate_native_inputs(files,prior)
    return dict(changedBaselineSources=changed,addedSources=sorted(additions),baselineSourceEntries=len(names),
        everyBaselineSourceEntryRetained=True,allOtherModesSharedUIAndDataFrozen=True,onlyApprovedHomeAndSpectatorScopeChanged=True,**native)

def validate_apk(apk,baseline,expected):
    require(apk.is_file() and digest(apk)==expected,'Candidate APK missing/changed')
    aapt,java,signer=H['sdk_paths']();badging=subprocess.check_output([str(aapt),'dump','badging',str(apk)],text=True,encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='82'","versionName='0.82'","application-label:'Warzone Towers'")),
        'Wrong082 APK identity/version')
    signing=H['certificate'](apk,java,signer);require(signing==H['certificate'](baseline,java,signer),'Signing certificate changed')
    config=(ROOT/H['BUILD_CONFIG']).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*82\s*;',config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.82"\s*;',config),'Generated BuildConfig version mismatch')
    with ZipFile(apk) as current,ZipFile(baseline) as old:
        names,prior=set(current.namelist()),set(old.namelist())
        require(len(names)==len(current.namelist()) and current.testzip() is None,'Corrupt/duplicate APK')
        require(prior<=names,'A baseline APK member was removed')
        source_assets={p.relative_to(ROOT/ASSETS).as_posix():p for p in (ROOT/ASSETS).rglob('*') if p.is_file()}
        require({n for n in names if n.startswith('assets/')}=={'assets/'+n for n in source_assets},'Unexpected APK asset inventory')
        changed=[]
        for name in sorted(names):
            if name in prior and zip_digest(current,name)==zip_digest(old,name):continue
            require(C['metadata'](name) or name in APK_ASSETS,'Unexpected changed APK member: '+name);changed.append(name)
        for name,path in source_assets.items():require(zip_digest(current,'assets/'+name)==digest(path),'APK/source asset mismatch: '+name)
        for name in prior:
            if name.startswith(('lib/','res/')) or name.startswith('assets/') and name not in APK_ASSETS:
                require(zip_digest(current,name)==zip_digest(old,name),'Frozen native/game/other asset changed: '+name)
        require(current.getinfo('assets/warzone/music/music.data').compress_type==ZIP_STORED,'Bundled soundtrack was compressed')
        ordered=sorted(current.infolist(),key=lambda i:i.header_offset);gaps=[ordered[0].header_offset]
        for i,info in enumerate(ordered):
            end=info.header_offset+30+len(info.filename.encode('utf-8'))+len(info.extra)+info.compress_size
            next_start=ordered[i+1].header_offset if i+1<len(ordered) else current.start_dir;gaps.append(max(0,next_start-end))
        require(max(gaps)<2*1024*1024,'Large unused APK gap; clean build required')
    return dict(certificateSHA256=signing,changedAPKMembers=changed,everyBaselineAPKMemberRetained=True,
        allAPKAssetsMatchSource=True,allOtherEnginesDataLibrariesResourcesAndAssetsFrozen=True,
        officialMPDataFrozen=True,maximumAPKZipGapBytes=max(gaps))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256',required=True);parser.add_argument('--build-log',required=True)
    parser.add_argument('--emulator-proof',required=True);parser.add_argument('--host-proof',action='append',default=[])
    parser.add_argument('--evidence',action='append',default=[]);parser.add_argument('--output',type=Path,default=ROOT.parent)
    parser.add_argument('--validate-only',action='store_true');args=parser.parse_args()
    expected=args.expected_sha256.lower();require(re.fullmatch('[0-9a-f]{64}',expected),'Invalid expected APK SHA256')
    require(not args.output.resolve().is_relative_to(ROOT),'Delivery outputs must stay outside repository')
    baseline,source=baseline_paths();proof_path=repository_path(args.emulator_proof);log=repository_path(args.build_log)
    hosts=[repository_path(p) for p in args.host_proof]
    verification,evidence=validate_observations(proof_path,hosts,log,expected)
    evidence|={repository_path(p).relative_to(ROOT).as_posix() for p in args.evidence}
    with ZipFile(source) as old:required=set(old.namelist())
    files=source_inventory(required,evidence);preservation=validate_source(source,files,evidence)
    apk_record=validate_apk(args.apk.resolve(),baseline,expected);require(digest(args.apk)==expected,'APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True,deliveryWritten=False,sourceFiles=len(files),exactAPKVerification=verification,**preservation,**apk_record),indent=2));return
    apk_out,source_out,checksum=(args.output/n for n in ('Warzone-Towers-0.82.apk','warzone-towers-0.82-source.zip','Warzone-Towers-0.82-SHA256.txt'))
    partial=source_out.with_suffix('.zip.partial');require(not any(p.exists() for p in (apk_out,source_out,checksum,partial)),'Delivery output already exists')
    record=dict(version='0.82',versionCode=82,candidateAPK_SHA256=expected,
        scope='Small exact Home tagline; Multiplayer spectator match entry, advancing rendered frames, camera, read-only capabilities and returns. Official data, protocol, simulation and all other modes/shared UI frozen.',
        exactAPKVerification=verification,fallback=pin(ROOT/FALLBACK),sourcePreservation=preservation,**apk_record,
        emulatorUsed=True,actualAndroidViewsExecuted=True,offlineHostChecksPassed=True,buildChecksPassed=True,packageChecksPassed=True,
        githubPublished=False,vpsChanged=False,recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT/RECORD).write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    entries=[dict(path=n,bytes=p.stat().st_size,sha256=digest(p)) for n,p in files.items() if n!=MANIFEST]
    (ROOT/MANIFEST).write_text(json.dumps(dict(schemaVersion=1,files=entries),indent=2)+'\n',encoding='utf-8')
    args.output.mkdir(parents=True,exist_ok=True);reused=H['write_source_zip'](source,partial,files,entries)
    require(digest(args.apk)==expected,'Candidate changed while complete source was packaged')
    shutil.copy2(args.apk,apk_out);require(digest(apk_out)==expected,'APK copy changed')
    with ZipFile(partial) as archive,ZipFile(apk_out) as apk:
        require(required<=set(archive.namelist()),'Prior complete source member missing')
        for name in files:
            if name.startswith(ASSETS):require(zip_digest(archive,name)==zip_digest(apk,'assets/'+name[len(ASSETS):]),'SourceZIP/APK asset mismatch: '+name)
    partial.rename(source_out);source_sha=digest(source_out)
    require(digest(args.apk)==expected and digest(apk_out)==expected,'Exact APK changed before delivery')
    require(digest(baseline)==BASELINE_APK_SHA and digest(source)==BASELINE_SOURCE_SHA,'Fallback changed during packaging')
    checksum.write_text(expected+'  '+apk_out.name+'\n'+source_sha+'  '+source_out.name+'\n',encoding='utf-8')
    print(json.dumps(dict(packageIntegrityPassed=True,apk=str(apk_out),apkSHA256=expected,source=str(source_out),sourceSHA256=source_sha,
        checksums=str(checksum),sourceFiles=len(files),rawCopiedUnchangedZIPMembers=reused,everySourceMemberCRCAndSHAStreamed=True,
        exactTestedAPKCopied=True,packageChecksPassed=True),indent=2))

if __name__=='__main__':main()
