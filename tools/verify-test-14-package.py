"""Verify Towers 0.14 compact Towers page scope; no gameplay verdict.

All Towers/Duel programs, data, maps and scenarios remain exact to 0.13. Three
Android files allow only audited style additions with the remaining logic exact;
footer/current-work assets remain frozen. Actual final-APK input/gameplay and
manual screenshot acceptance are separate release requirements.
"""
from pathlib import Path
from zipfile import ZipFile
import argparse
from hashlib import sha256
import json
import os
import re
import runpy
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent
QA=ROOT/'qa/test-14'
prior=runpy.run_path(str(ROOT/'tools/verify-test-13-package.py'),run_name='release14_helpers')
digest,read,require,local,zip_digest,signing_certificate,stable_integrity=(
    prior[n] for n in ('digest','read','require','local','zip_digest','signing_certificate','stable_integrity'))
FROZEN=dict(prior['FROZEN'],**{
    'Warzone-Towers-0.13.apk':'73c0b220e0c457e0b9a8e71dc9c2b3061cfb6731d3203e28970fbcc09a039cdb',
    'warzone-towers-0.13-source.zip':'bdf9e5575a3464d075b06d461474da3d671ce4c3cf6f5e9e4cf1648be3591e4b',
    'Warzone-Towers-0.13-SHA256.txt':'bc60c74356a91cbdc6a8f571a7a9f9aefe6dd7f8cb7aa028d8326ed1dcfb1c0e',
})
FALLBACK=BASE/'fallbacks/towers-before-compact-0.14-20261108'
CHANGED_ASSETS={'assets/warzone-command-pages.js','assets/warzone-touch-controls.js','assets/warzone-mobile-research.js',
                'assets/warzone/ui/towers-commands.css','assets/warzone/ui/towers-research.css','assets/warzone/ui/towers-shell.css'}
ALLOWED_SOURCE={'app/src/main/'+n for n in CHANGED_ASSETS}|{'app/build.gradle.kts'}
NATIVE_STYLE_SOURCE={'app/src/main/java/com/rbabbit/blocknight/warzone/'+n for n in ('GraphicsSetupView.java','MusicSetupView.java','MainActivity.java')}
ALLOWED_SOURCE |= NATIVE_STYLE_SOURCE
PROTECTED_ASSETS={'assets/warzone/ui/lab-ui.js','assets/warzone/ui/towers-status.js','assets/warzone/ui/towers-status.css'}
EMULATOR_CHECKS={'pageInventoryCovered','compactNormalLayouts','fiveLabs','tenFactories',
                 'nativeProductionAndQueues','currentCandidateNativeProduction','manualResearchAndQueues','phoneSaveAndKeyboard',
                 'buildMovementAndGestures','menuAndInputReturns','footerAndStatusPreserved','duelPreserved'}
REQUIRED_SOURCE_TESTS={'test-14-commands.cjs','test-14-scroll.cjs','test-14-research.cjs','test-14-shell.cjs','test-14-native-style.py','test-12-status.cjs',
                       'test-12-world-routing.cjs','test-12-world-taps.cjs',
                       'test-android-back-routing.cjs','test-test-lifecycle.cjs','test-duel-ui.cjs'}


def record(path):return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def frozen_artifacts():
    records=prior['frozen_artifacts']()
    for name in ('Warzone-Towers-0.13.apk','warzone-towers-0.13-source.zip','Warzone-Towers-0.13-SHA256.txt'):
        for path in (BASE/name,FALLBACK/name):
            require(digest(path)==FROZEN[name],'Accepted 0.13 fallback changed: '+str(path))
            records.append({'path':str(path),'sha256':FROZEN[name]})
    return records


def initial_preservation():
    path=FALLBACK/'preserved.json';value=read(path)
    require(value.get('passed') is True and value.get('sourceManifestFiles')==7498 and value.get('archiveEntries')==7499 and value.get('everyArchiveEntryCRCAndSHA256Verified') is True and value.get('everyManifestSourceFileVerified') is True,'Initial complete 0.13 archive/working-tree preservation proof missing')
    require(value.get('sourceManifestSHA256')=='b614839c5a9851755311d877192ff59d9369eedf5075fc05393713ec1f703703','Wrong accepted pre-edit source manifest')
    return {'path':str(path),'sha256':digest(path),'sourceManifestFiles':7498,'archiveEntries':7499,'completeSourceVerifiedBeforeEdits':True}


def footer_shell_style(css):
    # Record every footer selector's declarations independently of any shared
    # field-control selector, plus the three variables those declarations use.
    rules=[]
    for match in re.finditer(r'([^{}]+)\{([^{}]*)\}',css):
        selectors=[re.sub(r'\s+',' ',s).strip() for s in match.group(1).split(',') if '#lab-ops' in s]
        body=re.sub(r'\s+','',match.group(2))
        rules.extend((selector,body) for selector in selectors)
    values={name:re.findall(r'--towers-'+name+r'\s*:\s*([^;{}]+)',css) for name in ('line','accent','muted')}
    return {'rules':rules,'variables':values}


def java_style_block(source,signature):
    start=source.index(signature);brace=source.index('{',start);depth=0;quote=None;escaped=False;line_comment=False;block_comment=False
    i=brace
    while i<len(source):
        char=source[i];nxt=source[i:i+2]
        if line_comment:
            if char=='\n':line_comment=False
        elif block_comment:
            if nxt=='*/':block_comment=False;i+=1
        elif quote:
            if escaped:escaped=False
            elif char=='\\':escaped=True
            elif char==quote:quote=None
        elif nxt=='//':line_comment=True;i+=1
        elif nxt=='/*':block_comment=True;i+=1
        elif char in {'"',"'"}:quote=char
        elif char=='{':depth+=1
        elif char=='}':
            depth-=1
            if depth==0:return start,i+1,source[start:i+1]
        i+=1
    raise RuntimeError('Unterminated named Java style helper: '+signature)


def native_style_only(source_archive):
    """Remove only audited style additions; all remaining Java must be exact."""
    base='app/src/main/java/com/rbabbit/blocknight/warzone/'
    signatures={
        'GraphicsSetupView.java':['    private void applyCompactTowersStyle() {'],
        'MusicSetupView.java':['    void setCompactTowers(boolean compact) {','    private void fitCompactTowersPanel() {','    private void fitCompactTowersContent(boolean shortLayout) {'],
        'MainActivity.java':[],
    }
    # Pin the reviewed helper bodies. Updating these requires another concrete
    # style-only diff review, rather than hiding unrelated logic in a helper.
    expected_helpers={
        '    private void applyCompactTowersStyle() {':'76c0b9148fae18e73900c97c7022052f1c28d827ecafdbe64b3f7caea4fee0d8',
        '    void setCompactTowers(boolean compact) {':'d3f0966766120b81c3d4ee675d397f3655adf17576dd5b8133a2c3fe971bfa3d',
        '    private void fitCompactTowersPanel() {':'e27eac07e134ed9af9665ae58e7f7e4e1769ce350a2d4532e91aaf10f9ce64d1',
        '    private void fitCompactTowersContent(boolean shortLayout) {':'6ac35197e15b06128f3e12fc0738c515cfa3b09fdeba253f3754ee6d2af16bc5',
    }
    records=[];helpers=[]
    def normalized(value):return '\n'.join(line.rstrip() for line in value.replace('\r\n','\n').splitlines() if line.strip())+'\n'
    for name,methods in signatures.items():
        path=base+name;before=source_archive.read(path).decode('utf-8').replace('\r\n','\n');current=local(path).read_text(encoding='utf-8').replace('\r\n','\n');residual=current
        for signature in methods:
            start,end,body=java_style_block(residual,signature);fingerprint=sha256(body.encode()).hexdigest()
            require(expected_helpers.get(signature)==fingerprint,'Native style helper differs from reviewed body: '+signature)
            helpers.append({'path':path,'signature':signature.strip(),'sha256':fingerprint})
            # Remove its adjacent explanatory Javadoc as part of the addition.
            comment=residual.rfind('    /**',0,start)
            if comment>=0 and re.fullmatch(r'\s*/\*\*(?:(?!\*/).)*\*/\s*',residual[comment:start],re.S):start=comment
            residual=residual[:start]+residual[end:]
        if name=='GraphicsSetupView.java':
            for line in ('import android.graphics.Color;\n','        applyCompactTowersStyle();\n'):
                require(residual.count(line)==1,'Unexpected native Graphics style call/import');residual=residual.replace(line,'',1)
        elif name=='MusicSetupView.java':
            for line in ('    private boolean compactTowers;\n','    private LinearLayout compactPanel;\n','    private Boolean compactShortLayout;\n','        compactPanel=panel;\n','            if(compactTowers){fitCompactTowersPanel();return;}\n'):
                require(residual.count(line)==1,'Unexpected native Music style addition');residual=residual.replace(line,'',1)
        else:
            line='    musicSetup.setCompactTowers(!"duel".equals(graphicsSetup != null ? graphicsSetup.selectedMatchMode() : matchMode));\n'
            require(residual.count(line)==1,'Unexpected native Music mode/style integration');residual=residual.replace(line,'',1)
            line='    if (isDuelBattle()) surface.setStroke(dp(1), 0xFF252B2F);'
            require(residual.count(line)==1,'Unexpected Return border integration');residual=residual.replace(line,'    surface.setStroke(dp(1), 0xFF252B2F);',1)
        require(normalized(residual)==normalized(before),'Android action/input/preference/download logic changed outside audited style additions: '+path)
        records.append({'path':path,'normalizedOriginalSHA256':sha256(normalized(before).encode()).hexdigest(),'currentSHA256':digest(local(path)),'residualMatchesAcceptedSource':True})
    return {'passed':True,'styleOnlyJavaFiles':records,'reviewedHelpers':helpers,'allOtherJavaLogicIdentical':True,'duelDefaultStylePreserved':True,'scope':'Named reviewed visual helpers, their mode-guarded call sites and Towers-only confirmation border; all remaining Java source is exact to 0.13 after whitespace normalization.'}


def verify(apk_path):
    candidate=digest(apk_path);preservation=initial_preservation();artifacts=frozen_artifacts();source_files=[]
    with ZipFile(BASE/'Warzone-Towers-0.13.apk') as old,ZipFile(apk_path) as apk,ZipFile(BASE/'warzone-towers-0.13-source.zip') as source:
        require(apk.testzip() is None,'APK CRC mismatch')
        old_names=set(old.namelist());names=set(apk.namelist())
        require(len(names)==len(apk.namelist()) and not any(n.endswith('/') for n in names),'Duplicate/directory APK entry')
        require(old_names==names,'APK entry inventory changed during existing-asset UI work')
        changed={n for n in old_names if zip_digest(old,n)!=zip_digest(apk,n)}
        allowed=CHANGED_ASSETS|{'AndroidManifest.xml'}|{n for n in names if re.fullmatch(r'classes\d*\.dex',n) or n.startswith('META-INF/')}
        require(CHANGED_ASSETS<=changed and changed<=allowed,'APK change outside compact Towers-page scope: '+str(changed))
        assets={n for n in names if n.startswith('assets/')}
        current={'assets/'+p.relative_to(ROOT/'app/src/main/assets').as_posix():p for p in (ROOT/'app/src/main/assets').rglob('*') if p.is_file()}
        require(current.keys()==assets,'Source/APK asset inventory differs')
        for name,path in current.items():require(digest(path)==zip_digest(apk,name),'Stale packaged asset: '+name)
        for name in PROTECTED_ASSETS:require(zip_digest(apk,name)==zip_digest(old,name),'Protected footer/status asset changed: '+name)
        shell='assets/warzone/ui/towers-shell.css'
        require(footer_shell_style(apk.read(shell).decode('utf-8'))==footer_shell_style(old.read(shell).decode('utf-8')),'Footer shell rules/colour variables changed')
        source_names=set(source.namelist())
        runtime=sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[local('app/build.gradle.kts')]
        old_runtime={n for n in source_names if n.startswith('app/src/') and not n.endswith('/')}|{'app/build.gradle.kts'}
        require({p.relative_to(ROOT).as_posix() for p in runtime}==old_runtime,'Runtime inventory changed outside existing UI assets')
        changed_source=set()
        for path in runtime:
            name=path.relative_to(ROOT).as_posix();rec=record(path);source_files.append(rec)
            if rec['sha256']!=zip_digest(source,name):changed_source.add(name)
        require(changed_source==ALLOWED_SOURCE,'Unexpected/missing runtime source change: '+str(changed_source))
        native_style=native_style_only(source)
        preserved={n for n in source_names if n.startswith(('vendor/','map/','scenario/')) and not n.endswith('/')}
        actual={p.relative_to(ROOT).as_posix() for folder in ('vendor','map','scenario') for p in (ROOT/folder).rglob('*') if p.is_file()}
        require(preserved==actual,'Map/scenario/vendor inventory changed')
        for name in preserved:require(digest(local(name))==zip_digest(source,name),'Game/map/scenario/Duel source changed: '+name)
        baseline=json.loads(source.read('qa/test-13/package-verification.json'))
        require(baseline['passed'] is True and baseline['candidateAPK_SHA256']==FROZEN['Warzone-Towers-0.13.apk'],'Wrong accepted package baseline')
        native_files=[];duel_files=[]
        for key,records in (('nativeSourceFiles',native_files),('duelSourceFiles',duel_files)):
            for entry in baseline[key]:
                path=local(entry['path']);require(digest(path)==entry['sha256'],'Native/Duel provenance changed: '+entry['path']);records.append(record(path))
        fixed=('warzone2100.js','warzone2100.wasm','warzone2100.data','index.html','mobile.html',
               'warzone2100-duel.js','warzone2100-duel.data','index-duel.html','mobile-duel.html')
        native_hashes={n:zip_digest(apk,'assets/warzone/'+n) for n in fixed}
        for name,value in native_hashes.items():require(value==zip_digest(old,'assets/warzone/'+name),'Frozen complete Towers/Duel payload changed: '+name)
        towers_proof=baseline['acceptedTowersPayloadVerification'];duel_proof=baseline['acceptedDuelPayloadVerification']
        require(towers_proof.get('passed') is True and duel_proof.get('passed') is True,'Accepted complete VFS/Duel preservation proof missing')
    sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    aapt=sdk/'build-tools/36.1.0/aapt2.exe';require(aapt.is_file(),'Configure Android build-tools36.1.0')
    badging=subprocess.check_output([str(aapt),'dump','badging',str(apk_path)],text=True,encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='14'","versionName='0.14'","application-label:'Warzone Towers'"):
        require(token in badging,'Wrong APK identity: '+token)
    certificate=signing_certificate(apk_path,sdk)
    require(certificate==signing_certificate(BASE/'Warzone-Towers-0.13.apk',sdk),'Update signing identity changed')
    return {'passed':True,'verification':'Source/package/preservation only; exact-APK compact layouts, input and gameplay and manual screen review are separate',
            'candidateAPK_SHA256':candidate,'package':'com.rbabbit.warzonetowers.lab','label':'Warzone Towers','version':'0.14','versionCode':14,
            'baselineAPK_SHA256':FROZEN['Warzone-Towers-0.13.apk'],'sameSigningCertificateSHA256':certificate,
            'compiledEngineUnchanged':True,'towersAndDuelPayloadsUnchanged':True,'mapsAndScenariosUnchanged':True,
            'nativeAndroidLogicPreserved':True,'duelNativeDefaultsPreserved':True,'nativeStyleVerification':native_style,'footerAndStatusAssetsUnchanged':True,
            'footerShellRulesUnchanged':True,'protectedAssets':sorted(PROTECTED_ASSETS),
            'nativePayloadSHA256':native_hashes,'acceptedTowersPayloadVerification':towers_proof,
            'acceptedDuelPayloadVerification':duel_proof,'modifiedAssets':sorted(changed&assets),'addedAssets':[],
            'changedRuntimeFiles':sorted(changed_source),'sourceAssetsMatchAPK':len(current),'sourceFiles':source_files,
            'nativeSourceFiles':native_files,'duelSourceFiles':duel_files,'preservedArtifacts':artifacts,'initialFallbackProof':preservation,'stable':stable_integrity()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out',type=Path,default=QA/'package-verification.json')
    args=parser.parse_args();report=verify(args.apk);args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in {'sourceFiles','nativeSourceFiles','duelSourceFiles','preservedArtifacts','acceptedTowersPayloadVerification','acceptedDuelPayloadVerification'}},indent=2))


if __name__=='__main__':main()
