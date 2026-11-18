"""Prepare exact local test-backup attachments. No Git, network or device mutations."""
from pathlib import Path
import argparse, hashlib, json, re, shutil, zipfile

HERE = Path(__file__).resolve().parent
OUT = HERE / 'release'
ROOT = Path('C:/timerApp')
PART_BYTES = 1792 * 1024 * 1024
SOURCE = ROOT / 'warzone-towers-0.95-test-source.zip'
PINS = {
    'Warzone-Towers-0.93-Test.apk': ('4f48c3e3ba80c6562ce711a4adab17704cd40737bc0362e6732bd58ecf2862b1',640785707),
    'Warzone-Towers-0.94-Test.apk': ('f1449962be8ac490ac62a5f44a8903c349cffb908f59af646b3d00a664c31069',723456353),
    'Warzone-Towers-0.95-Test.apk': ('4e9492ce31cab58baeae6927e43a5363b15304076fac1e342abe3faf3fffb253',730744002),
}

def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()

def write(path,text):
    with path.open('x',encoding='utf-8',newline='\n') as stream: stream.write(text)

def row(path): return {'path':str(path),'name':path.name,'bytes':path.stat().st_size,'sha256':digest(path)}

def copy(path,name):
    target=OUT/name
    with path.open('rb') as source,target.open('xb') as dest: shutil.copyfileobj(source,dest,8*1024*1024)
    assert digest(path)==digest(target),name
    return target

def publisher(manifest_sha,source_sha,source_bytes,count):
    text=(ROOT/'releases/publish-v092-test.py').read_text(encoding='utf-8')
    replacements={
        "OUT = Path('C:/timerApp/releases/v0.92-test')": "OUT = Path(__file__).resolve().parent / 'release'",
        "CREDENTIAL_CWD = Path('C:/timerApp/wz-towers-lab')": "CREDENTIAL_CWD = Path('C:/timerApp/candidates/hub-replay-test-0.95-20261118')",
        "TAG = 'v0.92-test'": "TAG = 'v0.95-test'",
        "TITLE = 'Warzone Towers 0.92 — Players TEST backup'": "TITLE = 'Warzone Towers 0.95 — Repair, Survival and Replays TEST backup'",
        "USER_AGENT = 'Warzone-v092-test-backup'": "USER_AGENT = 'Warzone-v095-test-backup'",
    }
    for old,new in replacements.items(): assert old in text,old; text=text.replace(old,new)
    for key,value in [('MANIFEST_SHA256',manifest_sha),('APK_SHA256',PINS['Warzone-Towers-0.95-Test.apk'][0]),('SOURCE_SHA256',source_sha)]:
        text,n=re.subn(r"(?m)^"+key+r" = '[a-f0-9]+'$",key+' = '+repr(value),text); assert n==1,key
    manifest='''def manifest():
    path=OUT/'assets.json'
    require(not path.is_symlink() and digest(path)==MANIFEST_SHA256,'Pinned prepared asset manifest changed')
    rows=json.loads(path.read_text(encoding='utf-8'))
    require(isinstance(rows,list) and len(rows)==COUNT,'Prepared asset count differs')
    names=set()
    for row in rows:
        name=row.get('name');require(isinstance(name,str) and re.fullmatch(r'[A-Za-z0-9._-]+',name),'Invalid asset name')
        require(name not in names,'Duplicate asset name');names.add(name)
        p=Path(row['path']);require(not p.is_symlink() and p.resolve().parent==OUT.resolve() and p.name==name,'Asset outside exact release folder')
        require(isinstance(row.get('bytes'),int) and 0<row['bytes']<2*1024**3 and p.stat().st_size==row['bytes'],'Asset length differs: '+name)
        require(re.fullmatch(r'[a-f0-9]{64}',row.get('sha256','')) and digest(p)==row['sha256'],'Asset checksum differs: '+name)
    pins=PINS
    for name,(sha,size)in pins.items():
        found=next((r for r in rows if r['name']==name),None)
        require(found and found['sha256']==sha and found['bytes']==size,'Exact tested APK differs: '+name)
    parts=[r for r in rows if r['name'].startswith('warzone-towers-0.95-test-source.zip.')]
    require({r['name'] for r in parts}=={'warzone-towers-0.95-test-source.zip.001','warzone-towers-0.95-test-source.zip.002'} and sum(r['bytes'] for r in parts)==SOURCE_BYTES,'Complete source part inventory differs')
    proof=json.loads((OUT/'artifact-preparation-validation.json').read_text(encoding='utf-8'))
    require(proof.get('independentConcatenatedStreamVerified') is True and proof.get('sourceZIP',{}).get('sha256')==SOURCE_SHA256 and proof.get('sourceZIP',{}).get('bytes')==SOURCE_BYTES,'Whole source binding differs')
    return rows


'''.replace('COUNT',str(count)).replace('SOURCE_BYTES',str(source_bytes)).replace('PINS',repr(PINS))
    start=text.index('def manifest():');end=text.index('def save_record(',start);text=text[:start]+manifest+text[end:]
    text=text.replace('All13 exact assets','All prepared exact assets').replace('Explicit GitHub test-backup publisher.','Explicit GitHub 0.93–0.95 test-backup publisher.')
    return text

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--source-sha',required=True);args=ap.parse_args()
    assert re.fullmatch('[a-f0-9]{64}',args.source_sha)
    proof=SOURCE.with_suffix('.zip.validation.json');source_proof=json.loads(proof.read_text())
    assert source_proof.get('passed') is True and source_proof.get('sha256')==args.source_sha and source_proof.get('bytes')==SOURCE.stat().st_size
    assert digest(SOURCE)==args.source_sha
    for name,(sha,size)in PINS.items(): assert (ROOT/name).stat().st_size==size and digest(ROOT/name)==sha,name
    assert not OUT.exists(),'Prepared release folder exists; preserve it'
    OUT.mkdir(parents=True)
    parts=[];combined=hashlib.sha256()
    with SOURCE.open('rb')as source:
        for number in (1,2):
            p=OUT/(SOURCE.name+f'.{number:03}');count=0;h=hashlib.sha256()
            with p.open('xb')as target:
                while count<PART_BYTES:
                    chunk=source.read(min(8*1024*1024,PART_BYTES-count))
                    if not chunk:break
                    target.write(chunk);count+=len(chunk);h.update(chunk);combined.update(chunk)
            assert 0<count<2*1024**3
            parts.append({'path':str(p),'name':p.name,'bytes':count,'sha256':h.hexdigest()})
        assert not source.read(1),'Source needs more than2parts'
    assert combined.hexdigest()==args.source_sha
    independent=hashlib.sha256();total=0
    for part in parts:
        with Path(part['path']).open('rb')as stream:
            while chunk:=stream.read(8*1024*1024):independent.update(chunk);total+=len(chunk)
    assert total==SOURCE.stat().st_size and independent.hexdigest()==args.source_sha
    apks=[row(copy(ROOT/name,name))for name in PINS]
    join=OUT/'Join-Source.ps1'
    specification=',\n'.join("    @{Name='%s'; Bytes=%d; Hash='%s'}"%(p['name'],p['bytes'],p['sha256'])for p in parts)
    write(join,"""# Place this script and both .zip.001/.zip.002 files in one folder.
$ErrorActionPreference = 'Stop'
$taskSourceName = 'warzone-towers-0.95-test-source.zip'
$taskExpectedHash = 'WHOLE'
$taskParts = @(
PARTS
)
$taskTarget = Join-Path $PSScriptRoot $taskSourceName
$taskPartial = Join-Path $PSScriptRoot ($taskSourceName + '.partial')
if ((Test-Path -LiteralPath $taskTarget) -or (Test-Path -LiteralPath $taskPartial)) { throw 'Output already exists; no file was replaced.' }
foreach ($taskPart in $taskParts) {
    $taskInput = Join-Path $PSScriptRoot $taskPart.Name
    if (!(Test-Path -LiteralPath $taskInput -PathType Leaf)) { throw ('Missing source part: ' + $taskPart.Name) }
    if ((Get-Item -LiteralPath $taskInput).Length -ne $taskPart.Bytes) { throw ('Length mismatch: ' + $taskPart.Name) }
    if ((Get-FileHash -LiteralPath $taskInput -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPart.Hash) { throw ('Checksum mismatch: ' + $taskPart.Name) }
}
$taskOutput = [System.IO.File]::Open($taskPartial, [System.IO.FileMode]::CreateNew)
try {
    foreach ($taskPart in $taskParts) {
        $taskInput = [System.IO.File]::OpenRead((Join-Path $PSScriptRoot $taskPart.Name))
        try { $taskInput.CopyTo($taskOutput, 8388608) } finally { $taskInput.Dispose() }
    }
} finally { $taskOutput.Dispose() }
if ((Get-FileHash -LiteralPath $taskPartial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpectedHash) { throw 'Joined checksum mismatch; partial file retained.' }
[System.IO.File]::Move($taskPartial, $taskTarget)
Write-Output ('Verified complete source ZIP: ' + $taskTarget)
""".replace('WHOLE',args.source_sha).replace('PARTS',specification))
    readme=OUT/'SOURCE-README.txt'
    write(readme,f'''Warzone Towers 0.95 normal TEST — complete source backup

The complete 0.95 source ZIP includes retained earlier source/profiles, 0.93 Repair/ALL COMBAT, 0.94 Survival/More Fortress and 0.95 focused Hub replay. It preserves all prior 0.94 archive members and adds guarded test-release-095 restoration files and curated verification. No source bytes were omitted to meet attachment limits.

Download both warzone-towers-0.95-test-source.zip.001 and .002 plus Join-Source.ps1 into one folder. Run the PowerShell script to verify both parts, concatenate in order and verify the whole ZIP without overwriting an existing output. Each part is below 2 GiB. Other systems may concatenate the numbered parts as binary data and verify SHA256SUMS.txt.

Complete ZIP bytes: {SOURCE.stat().st_size}
Complete ZIP SHA256: {args.source_sha}

Extract the joined ZIP and read test-release-095/README.md. Run its guarded restore/apply workflow to materialize exact current source before building; earlier historical source roots remain unchanged. Supply your own retained normal signing key; signing keys/passwords, browser profiles and raw device/private host exports are not included. GitHub autogenerated source archives may contain Git LFS pointer files; these numbered complete-source attachments contain actual source/asset bytes.

All three exact tested normal APKs 0.93/0.94/0.95 are attached separately. RECENT-TEST-RECORDS.zip contains curated audit/delivery/integrity summaries. Test limits remain explicit in their individual audits. No AAB, VPS update feed or Google Play deployment is part of this private GitHub test backup. It is not a stable/latest release promotion.
''')
    records={
      '0.93/AUDIT.md':ROOT/'candidates/repair-toggle-0.93-20261117/test-release-093/AUDIT.md',
      '0.93/APK-INTEGRITY.json':ROOT/'candidates/repair-toggle-0.93-20261117/test-release-093/APK-INTEGRITY.json',
      '0.93/DELIVERY.json':ROOT/'Warzone-Towers-0.93-Test-Delivery.json',
      '0.93/PACKAGE-SEAL.json':ROOT/'candidates/repair-toggle-0.93-20261117/test-release-093/PACKAGE-SEAL.json',
      '0.94/AUDIT.md':ROOT/'candidates/survival-test-0.94-20261118/test-release-094/AUDIT.md',
      '0.94/APK-INTEGRITY.json':ROOT/'survival-094-20261118/candidate5-APK-INTEGRITY.json',
      '0.94/DELIVERY.json':ROOT/'survival-094-20261118/RUNTIME094.json',
      '0.94/PACKAGE-SEAL.json':ROOT/'candidates/survival-test-0.94-20261118/test-release-094/PACKAGE-SEAL.json',
      '0.95/AUDIT.md':ROOT/'hub-replay-095-20261118/AUDIT095.md',
      '0.95/APK-INTEGRITY.json':ROOT/'hub-replay-095-20261118/09-candidate1-integrity.json',
      '0.95/DELIVERY.json':ROOT/'hub-replay-095-20261118/DELIVERY095.json',
      '0.95/SOURCE-DELTA.json':ROOT/'hub-replay-095-20261118/08-authorized-source-delta.json',
      '0.95/replay-phone.png':ROOT/'hub-replay-095-20261118/24-exact1-seek-zoom-camera.png',
      '0.95/replay-compact.png':ROOT/'hub-replay-095-20261118/78-exact1-compact-replay.png',
    }
    bundle=OUT/'RECENT-TEST-RECORDS.zip'
    with zipfile.ZipFile(bundle,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as archive:
        for name,path in records.items(): assert path.is_file(),path; archive.write(path,name)
    with zipfile.ZipFile(bundle)as archive:assert archive.testzip()is None
    source_validation=copy(proof,'SOURCE-PACKAGE-VALIDATION.json')
    assets=apks+parts+[row(p)for p in [join,readme,bundle,source_validation]]
    sums=OUT/'SHA256SUMS.txt';write(sums,''.join(r['sha256']+'  '+r['name']+'\n'for r in assets)+args.source_sha+'  '+SOURCE.name+'\n');assets.append(row(sums))
    manifest=OUT/'assets.json';write(manifest,json.dumps(assets,indent=2)+'\n')
    validation={'localPreparationOnly':True,'networkGitDeviceCalls':False,'sourceZIP':{'path':str(SOURCE),'bytes':SOURCE.stat().st_size,'sha256':args.source_sha},'partLimitBytes':PART_BYTES,'parts':parts,'independentConcatenatedStreamVerified':True,'concatenatedSHA256':independent.hexdigest(),'concatenatedBytes':total,'APKs':apks,'assets':len(assets),'privatePrerelease':True,'stablePromotion':False,'vpsOrPlayPublication':False}
    write(OUT/'artifact-preparation-validation.json',json.dumps(validation,indent=2)+'\n')
    write(OUT/'release-notes.md','''This private test backup commits the complete recent Warzone work and retains all three exact tested normal APKs. It is a GitHub backup, with no VPS/update-feed or Google Play deployment and no AAB. The stable/latest release is unchanged.

- 0.93: Medium-damage automatic Repair for existing/new combat units; ALL COMBAT protects retreating, repairing and rearming units and rejoins eligible units. Earlier Players and cellular-network work remains included.
- 0.94: Play Survival with single-player TDN2 and Wave maps, supplied wave/Power logic, More Fortress crystal-only purchases/effects, and native save/load restoration fixes. More Fortress topics cannot be researched. Verification was intentionally limited to the opening stage; actual first-kill Power payout and later-wave completion remain unverified.
- 0.95: Hub Watch Replay opens only the battlefield, minimap and playback/camera controls. Two real processed public recordings were checked in the exact APK, with native-frame seek comparisons, touch controls, repeated Back, Android Recents, actual offline-error/Retry recovery, phone/compact layouts and unchanged retained save ZIPs. Playback depends on the external processed-replay service; all historical or unprocessed-record variants and physical-phone performance were not exhaustively tested.

Download the normal APK version you need directly. For complete current source, download both numbered 0.95 ZIP parts and Join-Source.ps1, then follow SOURCE-README.txt and test-release-095/README.md. Checksums cover each asset and the joined complete source. All original 0.94 archive members and earlier historical restoration profiles remain preserved. RECENT-TEST-RECORDS.zip contains precise audit/delivery/integrity records and selected screenshots; their historical publication flags describe the original local test stage, before this separate GitHub authorization.
''')
    script=HERE/'publish-release.py';write(script,publisher(digest(manifest),args.source_sha,SOURCE.stat().st_size,len(assets)))
    print(json.dumps({'prepared':True,'output':str(OUT),'assetCount':len(assets),'manifestSHA256':digest(manifest),'sourceSHA256':args.source_sha,'sourceBytes':SOURCE.stat().st_size,'publisherSHA256':digest(script),'parts':parts},indent=2),flush=True)

if __name__=='__main__':main()
