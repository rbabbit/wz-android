"""Local-only immutable GitHub test artifact preparation. No network/Git/device calls."""
from pathlib import Path
import hashlib, json, shutil

ROOT = Path('C:/timerApp')
OUT = ROOT/'releases/v0.92-test'
RECORDS = ROOT/'candidates/players-polish-0.92-20261117/release-records'
APK = ROOT/'Warzone-Towers-0.92-Test.apk'
SOURCE = ROOT/'warzone-towers-0.92-test-source.zip'
APK_SHA = '134246af423c0ea04b375409f41d179813a739968d260855e73784a9109b6b66'
SOURCE_SHA = '63e26582d2c97ed88f57469be8a556b205532c83b660e937bd983b2be8cf8057'
PART_SIZE = 1792*1024*1024

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()

def write(path,text):
    with path.open('x',encoding='utf-8',newline='\n') as stream:
        stream.write(text)

def copy(source,name):
    path=OUT/name
    with source.open('rb') as src,path.open('xb') as dst:
        shutil.copyfileobj(src,dst,8*1024*1024)
    assert digest(path)==digest(source),name
    return path

def row(path):
    return dict(path=str(path),name=path.name,bytes=path.stat().st_size,sha256=digest(path))

def main():
    assert APK.stat().st_size==640638187 and digest(APK)==APK_SHA
    assert SOURCE.stat().st_size==3328733032 and digest(SOURCE)==SOURCE_SHA
    OUT.mkdir(parents=True,exist_ok=True)
    assert not any(OUT.iterdir()),'Refusing to replace existing preparation'
    combined=hashlib.sha256();parts=[]
    with SOURCE.open('rb') as src:
        for number in (1,2):
            path=OUT/(SOURCE.name+f'.{number:03}')
            requested=min(PART_SIZE,SOURCE.stat().st_size-src.tell())
            part_hash=hashlib.sha256();count=0
            with path.open('xb') as dst:
                while count<requested:
                    data=src.read(min(8*1024*1024,requested-count));assert data
                    dst.write(data);part_hash.update(data);combined.update(data);count+=len(data)
            assert 0<count<2*1024**3
            parts.append(dict(path=str(path),name=path.name,bytes=count,sha256=part_hash.hexdigest()))
        assert not src.read(1),'Source bytes left after two parts'
    assert combined.hexdigest()==SOURCE_SHA
    # Independent concatenation stream check; original ZIP is never changed.
    joined=hashlib.sha256();total=0
    for part in parts:
        with Path(part['path']).open('rb') as stream:
            while data:=stream.read(8*1024*1024):joined.update(data);total+=len(data)
    assert total==SOURCE.stat().st_size and joined.hexdigest()==SOURCE_SHA
    apk_copy=copy(APK,APK.name)
    join=OUT/'Join-Source.ps1'
    specification='\n'.join("    @{Name='%s'; Bytes=%d; Hash='%s'}"%(p['name'],p['bytes'],p['sha256'])+(',' if i==0 else '') for i,p in enumerate(parts))
    write(join,"""# Download this script and both numbered source parts into one folder.
$ErrorActionPreference = 'Stop'
$taskSourceName = 'warzone-towers-0.92-test-source.zip'
$taskExpectedHash = 'WHOLE'
$taskParts = @(
PARTS
)
$taskTarget = Join-Path $PSScriptRoot $taskSourceName
$taskPartial = Join-Path $PSScriptRoot ($taskSourceName + '.partial')
if (Test-Path -LiteralPath $taskTarget) { throw 'The complete ZIP already exists; no file was replaced.' }
if (Test-Path -LiteralPath $taskPartial) { throw 'A partial output already exists; no file was replaced.' }
foreach ($taskPart in $taskParts) {
    $taskPartPath = Join-Path $PSScriptRoot $taskPart.Name
    if (!(Test-Path -LiteralPath $taskPartPath -PathType Leaf)) { throw ('Missing source part: ' + $taskPart.Name) }
    if ((Get-Item -LiteralPath $taskPartPath).Length -ne $taskPart.Bytes) { throw ('Source part length mismatch: ' + $taskPart.Name) }
    if ((Get-FileHash -LiteralPath $taskPartPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPart.Hash) { throw ('Source part checksum mismatch: ' + $taskPart.Name) }
}
$taskOutputStream = [System.IO.File]::Open($taskPartial, [System.IO.FileMode]::CreateNew)
try {
    foreach ($taskPart in $taskParts) {
        $taskInputStream = [System.IO.File]::OpenRead((Join-Path $PSScriptRoot $taskPart.Name))
        try { $taskInputStream.CopyTo($taskOutputStream, 8388608) } finally { $taskInputStream.Dispose() }
    }
} finally { $taskOutputStream.Dispose() }
if ((Get-FileHash -LiteralPath $taskPartial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpectedHash) { throw 'Joined source checksum mismatch; partial output retained for inspection.' }
[System.IO.File]::Move($taskPartial, $taskTarget)
Write-Output ('Verified complete source ZIP: ' + $taskTarget)
""".replace('WHOLE',SOURCE_SHA).replace('PARTS',specification))
    readme=OUT/'SOURCE-README.txt'
    write(readme,"""Warzone Towers 0.92 TEST — complete source backup

The exact delivered source ZIP is split into two binary parts for GitHub attachment limits. First part: 1.75 GiB; second part: the remainder. Both are below 2 GiB. No source bytes were removed or rewritten.

Download warzone-towers-0.92-test-source.zip.001, warzone-towers-0.92-test-source.zip.002 and Join-Source.ps1 into one folder, then run the PowerShell script. It verifies both lengths and SHA256 hashes, creates a new .partial output, verifies the whole ZIP and renames it without overwriting an existing ZIP or partial output.

Other systems can concatenate .001 followed by .002 as binary data; verify the resulting ZIP against SHA256SUMS.txt. The complete ZIP is 3,328,733,032 bytes with SHA256:
SOURCEHASH

Extract the complete ZIP and read the test-release-092 restoration instructions. This archive preserves all 14,705 original baseline members plus 84 current-profile members, including 62 curated JSON/PNG evidence files. Current source bytes are supplied by the current restoration profile; use its documented guarded application workflow. Historical source/validation layers remain preserved. The autogenerated GitHub source archive is separate and may contain Git LFS pointers.

This is a normal signed TEST APK and an authorized private GitHub backup. It is not a Google Play AAB or promotion to the stable/VPS updater. No VPS, update feed or Google Play upload is part of this publication. Historical sealed records retain published:false to describe the original local test delivery before this later GitHub authorization.
""".replace('SOURCEHASH',SOURCE_SHA))
    copies=[copy(RECORDS/'AUDIT.md','AUDIT.md'),copy(RECORDS/'apk-integrity.json','APK-INTEGRITY.json'),copy(RECORDS/'focused-runtime.json','RUNTIME.json'),copy(RECORDS/'final-validation.json','VALIDATION.json'),copy(RECORDS/'source-package-validation.json','SOURCE-PACKAGE-VALIDATION.json'),copy(RECORDS/'players-ui-092-checks.json','PLAYERS-UI-CHECKS.json'),copy(ROOT/'Warzone-Towers-0.92-Test-Delivery.json','DELIVERY.json')]
    notes=OUT/'release-notes.md'
    write(notes,"""Warzone Towers 0.92 TEST backs up the tested clean Players redesign and all current source, with the existing normal signing key and accepted cellular networking fix preserved. This is an authorized private GitHub test backup, not a stable promotion or VPS/update-feed/Google Play deployment. No AAB was built.

The Players surfaces now use compact Research-style monochrome panels, without oversized titles, mode/role filler or redundant Close controls. PLAYERS remains the global toggle. Native player rows, colours, Host/You badges and privacy dashes remain; multiplayer Participants/Spectators tabs and permitted spectator Details retain Economy & Army/Upgrades views.

Verification on the exact delivery APK covered Campaign, Towers, FFA, owned multiplayer and live spectator roles, physical 2400×1080/1280×720 layouts, real finger scrolling/toggles, repeated keyboard returns, native movement, normal factory production during Players, selection restoration and user Return/lobby/Home cleanup. Source checks preserve Java/networking/native/data/gameplay bytes relative to accepted0.91-network.1. AUDIT.md and the sealed runtime records give the precise evidence and limits.

Limits: retained emulator terrain remains black as in the baseline; foreground/header/minimap/Players pixels were reviewed using host GPU. Private MP tests used a synthetic directory to reach real owned native hosts; no public match or new physical-phone cellular test is claimed. Towers uses disclosed previously seeded combat units, while Campaign/FFA checkpoints are unmodified and recorded production is ordinary native factory work. Nonempty OFF was observed offline; the final MP OFF/native-deselect check started with zero combat units. Historical incomplete fixture reports remain preserved with explicit source-schema/combined completion records.

Download the APK directly. The complete source ZIP is split into .001 and .002; download both plus Join-Source.ps1 or follow SOURCE-README.txt. The join script verifies both parts and recreates the exact original ZIP without overwriting files. SHA256SUMS.txt includes the APK, attachments and complete source checksum. The 62 curated evidence files are inside the complete source ZIP; raw private host logs, keys and device exports are excluded.

Exact APK SHA256: `APK_HASH`

Exact complete-source ZIP SHA256: `SOURCE_HASH`

Sealed records describe the original local test delivery; their historical `published:false` fields predate this separately authorized GitHub backup.
""".replace('APK_HASH',APK_SHA).replace('SOURCE_HASH',SOURCE_SHA))
    assets=[row(apk_copy)]+parts+[row(join),row(readme)]+[row(p)for p in copies]
    sums=OUT/'SHA256SUMS.txt'
    write(sums,''.join(p['sha256']+'  '+p['name']+'\n'for p in assets)+SOURCE_SHA+'  '+SOURCE.name+'\n')
    assets.append(row(sums))
    write(OUT/'assets.json',json.dumps(assets,indent=2)+'\n')
    proof=dict(localPreparationOnly=True,networkGitDeviceCalls=False,sourceZIP=dict(path=str(SOURCE),bytes=SOURCE.stat().st_size,sha256=SOURCE_SHA),apk=dict(path=str(APK),bytes=APK.stat().st_size,sha256=APK_SHA),partLimitBytes=PART_SIZE,parts=parts,independentConcatenatedStreamVerified=True,concatenatedBytes=total,concatenatedSHA256=joined.hexdigest(),assetCount=len(assets),privateTestBackup=True,stablePromotion=False,vpsOrPlayPublication=False)
    write(OUT/'artifact-preparation-validation.json',json.dumps(proof,indent=2)+'\n')
    print(json.dumps(dict(prepared=True,output=str(OUT),parts=[dict(name=p['name'],bytes=p['bytes'],sha256=p['sha256'])for p in parts],assets=len(assets),joinedSHA256=joined.hexdigest()),indent=2))

if __name__=='__main__':main()
