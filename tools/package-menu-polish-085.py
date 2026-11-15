"""Package v0.85 after focused code/build checks. No emulator or device actions."""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
from datetime import datetime, timezone
import argparse, json, re, runpy, shutil, subprocess

ROOT=Path(__file__).resolve().parents[1]
B=runpy.run_path(str(ROOT/'tools/package-native-landings-084.py'),run_name='menu085_shared_helpers')
H,C=B['H'],B['C']
digest,zip_digest,require=C['digest'],C['zip_digest'],C['require']
QA='qa/menu-polish-085/'
JAVA='app/src/main/java/com/rbabbit/blocknight/warzone/'
ASSETS='app/src/main/assets/'
GRADLE='app/build.gradle.kts'
MANIFEST=C['MANIFEST']
TOOL='tools/package-menu-polish-085.py'
RECORD='archive/release-0.85-menu-polish.json'
RELEASE='docs/releases/0.85-menu-polish.md'
PRODUCT={JAVA+n for n in ('HomeModesView.java','CampaignSetupView.java','CampaignLandingLayout.java','MultiplayerLobbyView.java')}
PRODUCT|={ASSETS+n for n in ('guide/index.html','guide/guide.css','guide/guide.js','multiplayer/room-ui.css')}
DOCS={'AGENTS.md','README.md','README-WARZONE-TOWERS.md','docs/KNOWN-ISSUES.md'}
BASE_APK_SHA='2dd4b698c8b0a2a98a7fdd1b0d138f081eb366f491026964d35b802ae6442a63'
BASE_SOURCE_SHA='9a295c7cd569ab0cd30dc84cd33d240c5bbb7d3d1c5dbc8169eaa36ec208c159'

def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8-sig'))
def pin(path):return dict(path=path.relative_to(ROOT).as_posix(),bytes=path.stat().st_size,sha256=digest(path))
def check_pins(rows):
    for row in rows:
        path=(ROOT/row['path']).resolve()
        require(path.is_relative_to(ROOT) and path.is_file() and digest(path)==row['sha256'],'Stale evidence/source: '+row['path'])

def baseline():
    fallback=read(QA+'fallback.json')
    require(fallback.get('sha256VerifiedBeforeEdits') is True and fallback.get('version')=='0.85','Initial fallback verification missing')
    result=[]
    for suffix,expected in (('.apk',BASE_APK_SHA),('.zip',BASE_SOURCE_SHA)):
        rows=[row for row in fallback['immutableFallbacks'] if row['path'].endswith(suffix)]
        require(len(rows)==1,'Ambiguous baseline')
        row=rows[0];path=Path(row['path'])
        require(row['sha256']==expected and path.stat().st_size==row['bytes'] and digest(path)==expected,'Fallback changed')
        result.append(path)
    return result

def verify_build(apk,expected,hosts):
    proof=read(QA+'verification.json')
    require(proof.get('version')=='0.85' and proof.get('passed') is True,'Focused build/code proof missing')
    require(proof.get('emulatorUsed') is False and proof.get('actualAndroidViewsExecuted') is False,'No-emulator scope misreported')
    require(proof.get('candidateAPK_SHA256')==expected==digest(apk),'Candidate changed')
    require(all(proof['checks'].get(name) is True for name in ('homeTagline','guideModeRemoval','campaignHeadingRemoval','lobbyHeader','fullscreenMap','androidBuild')),'A requested check is missing')
    require('BUILD SUCCESSFUL' in (ROOT/QA/'build.log').read_text(encoding='utf-8-sig',errors='replace'),'Android build failed')
    check_pins(proof['sources']+proof['evidence']+[proof['buildLog']])
    require(PRODUCT|{GRADLE,TOOL}<={row['path'] for row in proof['sources']},'Product/version/package source pins missing')
    for name in hosts:
        host=read(name)
        require(host.get('version')=='0.85' and host.get('passed') is True and host.get('emulatorUsed') is False,'Focused checker failed: '+name)
        check_pins(host.get('sources',[]))
    return proof

def inventory(source):
    with ZipFile(source) as old:required=set(old.namelist())
    raw=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode()
    names=required|set(filter(None,raw.split('\0')))|{MANIFEST,RECORD,RELEASE}
    files={}
    for name in sorted(names):
        rel=Path(name)
        if name==QA+'package.log':continue
        if name.startswith('qa/') and name not in required and not name.startswith(QA):continue
        if rel.suffix.lower() in {'.class','.pyc','.tmp','.partial'} or any(p in C['SKIP'] or p.endswith('-host-classes') for p in rel.parts):
            require(name not in required,'Prior source member would be omitted: '+name);continue
        if name in C['TRANSIENT']:continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES']|{'.key','.sta2','.apk'} and not rel.name.startswith('.env') and name!='local.properties','Private/runtime archive path: '+name)
        path=ROOT/name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST,RECORD}),'Source missing: '+name)
        files[name]=path
    require(required<=set(files),'A prior complete-source member is missing')
    return files,required

def verify_source(source,files):
    with ZipFile(source) as old:
        prior={r['path']:r for r in json.loads(old.read(MANIFEST))['files']}
        require(set(prior)==set(old.namelist())-{MANIFEST},'Incomplete baseline manifest')
        expected=old.read(GRADLE).replace(b'versionCode = 84',b'versionCode = 85').replace(b'versionName = "0.84"',b'versionName = "0.85"')
        require(files[GRADLE].read_bytes()==expected,'Gradle changed beyond the version')
        changed=[]
        for name,row in prior.items():
            if digest(files[name])==row['sha256']:continue
            require(name in PRODUCT|DOCS|{GRADLE},'Unexpected changed baseline source: '+name)
            changed.append(name)
        added=set(files)-set(old.namelist())
        require(all(n in {TOOL,RECORD,RELEASE} or n.startswith(('tools/',QA)) for n in added),'Unexpected added product/source file')
    return dict(changedBaselineSources=changed,everyBaselineSourceMemberRetained=True,addedSources=sorted(added))

def verify_apk(apk,base,expected):
    aapt,java,signer=H['sdk_paths']()
    badging=subprocess.check_output([str(aapt),'dump','badging',str(apk)],text=True,encoding='utf-8')
    require(all(s in badging for s in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='85'","versionName='0.85'","application-label:'Warzone Towers'")),'APK identity/version mismatch')
    signing=H['certificate'](apk,java,signer)
    require(signing==H['certificate'](base,java,signer),'Signing certificate changed')
    config=(ROOT/H['BUILD_CONFIG']).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*85\s*;',config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.85"\s*;',config),'Generated version mismatch')
    asset_allow={'assets/'+n[len(ASSETS):] for n in PRODUCT if n.startswith(ASSETS)}
    with ZipFile(apk) as current,ZipFile(base) as old:
        names,prior=set(current.namelist()),set(old.namelist())
        require(len(names)==len(current.namelist()) and current.testzip() is None and prior<=names,'APK corrupt or prior member removed')
        changed=[]
        for name in sorted(names):
            if name in prior and zip_digest(current,name)==zip_digest(old,name):continue
            require(C['metadata'](name) or name in asset_allow,'Unexpected APK change: '+name);changed.append(name)
        assets={p.relative_to(ROOT/ASSETS).as_posix():p for p in (ROOT/ASSETS).rglob('*') if p.is_file()}
        require({n for n in names if n.startswith('assets/')}=={'assets/'+n for n in assets},'Source/APK asset inventory mismatch')
        for name,path in assets.items():require(zip_digest(current,'assets/'+name)==digest(path),'Source/APK mismatch: '+name)
        for name in prior:
            if name.startswith(('assets/','lib/','res/')) and name not in asset_allow:
                require(zip_digest(current,name)==zip_digest(old,name),'Frozen game/resource asset changed: '+name)
        require(current.getinfo('assets/warzone/music/music.data').compress_type==ZIP_STORED,'Soundtrack compression changed')
        ordered=sorted(current.infolist(),key=lambda i:i.header_offset);gaps=[ordered[0].header_offset]
        for i,info in enumerate(ordered):
            end=info.header_offset+30+len(info.filename.encode())+len(info.extra)+info.compress_size
            following=ordered[i+1].header_offset if i+1<len(ordered) else current.start_dir
            gaps.append(max(0,following-end))
        require(max(gaps)<2*1024*1024,'Large unused APK gap')
    require(digest(apk)==expected,'Candidate changed during verification')
    return dict(certificateSHA256=signing,changedAPKMembers=changed,unrelatedAssetsResourcesLibrariesFrozen=True,allSourceAssetsMatchAPK=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--host-proof',action='append',default=[])
    args=parser.parse_args();expected=args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}',expected),'Bad expected APK hash')
    apk=ROOT/'app/build/outputs/apk/debug/app-debug.apk'
    proof=verify_build(apk,expected,args.host_proof)
    base,source=baseline();files,required=inventory(source)
    preservation=verify_source(source,files);integrity=verify_apk(apk,base,expected)
    out=ROOT.parent;apk_out=out/'Warzone-Towers-0.85.apk';zip_out=out/'warzone-towers-0.85-source.zip';partial=zip_out.with_suffix('.zip.partial');checksums=out/'Warzone-Towers-0.85-SHA256.txt'
    require(not any(p.exists() for p in (apk_out,zip_out,partial,checksums)),'Delivery output already exists')
    record=dict(version='0.85',versionCode=85,candidateAPK_SHA256=expected,emulatorUsed=False,actualAndroidViewsExecuted=False,nativeBuildPerformed=False,
        scope='Five requested copy/layout corrections only; user will test Android APK. No GitHub/VPS actions.',buildAndFocusedCodeChecksPassed=True,packageIntegrityPassed=True,
        verification=pin(ROOT/QA/'verification.json'),fallback=pin(ROOT/QA/'fallback.json'),limitations=proof['limitations'],sourcePreservation=preservation,**integrity,recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT/RECORD).write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    entries=[dict(path=n,bytes=p.stat().st_size,sha256=digest(p)) for n,p in files.items() if n!=MANIFEST]
    (ROOT/MANIFEST).write_text(json.dumps(dict(schemaVersion=1,files=entries),indent=2)+'\n',encoding='utf-8')
    reused=H['write_source_zip'](source,partial,files,entries)
    shutil.copy2(apk,apk_out);require(digest(apk_out)==expected,'APK copy changed')
    with ZipFile(partial) as archive,ZipFile(apk_out) as packed:
        require(required<=set(archive.namelist()),'Prior source member omitted')
        for name in files:
            if name.startswith(ASSETS):require(zip_digest(archive,name)==zip_digest(packed,'assets/'+name[len(ASSETS):]),'ZIP/APK mismatch: '+name)
    partial.rename(zip_out);source_sha=digest(zip_out)
    require(digest(base)==BASE_APK_SHA and digest(source)==BASE_SOURCE_SHA,'Fallback changed during packaging')
    checksums.write_text(expected+'  '+apk_out.name+'\n'+source_sha+'  '+zip_out.name+'\n',encoding='utf-8')
    print(json.dumps(dict(packageIntegrityPassed=True,emulatorUsed=False,apk=str(apk_out),apkSHA256=expected,source=str(zip_out),sourceSHA256=source_sha,checksums=str(checksums),sourceFiles=len(files),rawCopiedUnchangedZIPMembers=reused),indent=2))

if __name__=='__main__':main()
