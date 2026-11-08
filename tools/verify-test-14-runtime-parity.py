"""Verify the authorized R2→R3 Build-queue CSS-only APK member delta.

This does not turn R2 gameplay into an R3 test. It preserves the original APK
identities and proves unchanged runtime members; actual R3 checks remain due.
"""
from pathlib import Path
from zipfile import ZipFile
import argparse
import difflib
import json
import re
import runpy
from hashlib import sha256

ROOT=Path(__file__).resolve().parents[1]
h=runpy.run_path(str(ROOT/'tools/verify-test-14-package.py'),run_name='parity14_helpers')
digest,require,zip_digest=(h[n] for n in ('digest','require','zip_digest'))
R2='a89c36044df2a22dbc63c24c482eaf6fac1d4a570977f4f5c1104bccbbb102f0'
R3='4f32c53107ebab719146961118ff0333af9b4b33bc66a2312c0724821a2e03ff'
R3_JS='cbe26057e7940b987ac05858b235162a8fa0cb916b64a736cf1f74d507f15b75'
R4_JS='489dd244b1ec8912115f91d5941b4e17e7aa85fa191dd98e8555f5de68f82f2d'
R4='cb37793fd6908ecc3daa0bcf96f217a597e3614944c7d11c4d725ea1b80a3485'
CSS='assets/warzone/ui/towers-commands.css'
OLD=b'.wt-towers-polished #wt-sidebar-queue{height:auto;flex:0 1 auto;'
NEW=b'.wt-towers-polished #wt-sidebar-queue{height:auto;flex:0 0 auto;'


def verify(baseline,candidate,expected):
    require(digest(baseline)==R2,'Wrong preserved R2 APK')
    actual=digest(candidate)
    require(re.fullmatch('[a-f0-9]{64}',expected) and actual==expected and actual!=R2,'Wrong expected R3 candidate')
    with ZipFile(baseline) as old,ZipFile(candidate) as new:
        require(old.testzip() is None and new.testzip() is None,'APK CRC mismatch')
        names=set(old.namelist())
        require(len(names)==len(old.namelist()) and names==set(new.namelist()) and len(names)==len(new.namelist()),'APK entry inventory changed')
        changed=sorted(name for name in names if zip_digest(old,name)!=zip_digest(new,name))
        signing=lambda name:bool(re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))',name,re.I))
        require(CSS in changed and all(name==CSS or signing(name) for name in changed),'APK runtime delta exceeds authorized Build CSS: '+str(changed))
        before=old.read(CSS);after=new.read(CSS)
        require(before.count(OLD)==1 and after==before.replace(OLD,NEW,1),'CSS delta exceeds the single Build-queue flex reservation')
        diff=''.join(difflib.unified_diff(before.decode('utf-8').splitlines(True),after.decode('utf-8').splitlines(True),fromfile='R2/towers-commands.css',tofile='R3/towers-commands.css'))
    return {'passed':True,'baselineAPK_SHA256':R2,'candidateAPK_SHA256':actual,
            'baselineAPK':{'path':str(baseline.resolve()),'sha256':R2},'candidateAPK':{'path':str(candidate.resolve()),'sha256':actual},
            'changedAssets':[CSS],'changedAPKEntries':changed,'allOtherAPKMembersIdentical':True,
            'singleBuildQueueFlexChange':True,'CSSDiff':diff,
            'scope':'Only Towers Build queue flex changes from 0 1 auto to 0 0 auto, plus APK signing metadata. Android manifest/resources/DEX, all JS/WASM/data, all other assets and native styling are exact.',
            'evidencePolicy':'Retained R2 native FIFO/IME/save records keep their R2 identity. R3 requires new real production/queue/completion and all remaining relevant R3 journeys before delivery.'}


def verify_scroll(baseline,candidate,expected):
    require(digest(baseline)==R3 and digest(candidate)==expected and re.fullmatch('[a-f0-9]{64}',expected),'Wrong preserved R3/new scroll candidate identity')
    name='assets/warzone-command-pages.js'
    with ZipFile(baseline) as old,ZipFile(candidate) as new:
        require(old.testzip() is None and new.testzip() is None,'APK CRC mismatch')
        names=set(old.namelist());require(len(names)==len(old.namelist()) and names==set(new.namelist()) and len(names)==len(new.namelist()),'APK entry inventory changed')
        changed=sorted(n for n in names if zip_digest(old,n)!=zip_digest(new,n))
        signing=lambda n:bool(re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))',n,re.I))
        require(name in changed and all(n==name or signing(n) for n in changed),'Scroll candidate changes another runtime member: '+str(changed))
        require(zip_digest(old,name)==R3_JS and zip_digest(new,name)==R4_JS,'Command UI differs from the exact reviewed scroll patch')
        before=old.read(name).decode('utf-8');after=new.read(name).decode('utf-8');spans=[]
        for start,end in (('  function loadSaved(', '  function open('),('  function saveTemplate(', '  function renderFactory('),('  function beginPlacement(', '  function resetDraft('),('  function readDraft(', '  function applySize('),('    else if(d.produce||d.produceTemplate)', '    else if(d.control)')):
            a=before[before.index(start):before.index(end)];b=after[after.index(start):after.index(end)]
            require(a==b,'Reviewed native/storage contract span changed: '+start);spans.append({'start':start,'end':end,'identical':True})
        diff=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='R3/warzone-command-pages.js',tofile='R4/warzone-command-pages.js'))
    return {'passed':True,'baselineAPK_SHA256':R3,'candidateAPK_SHA256':expected,'baselineAPK':{'path':str(baseline.resolve()),'sha256':R3},'candidateAPK':{'path':str(candidate.resolve()),'sha256':expected},'changedAssets':[name],'changedAPKEntries':changed,'allOtherAPKMembersIdentical':True,'reviewedTowersScrollOnlyChange':True,'baselineCommandJS_SHA256':R3_JS,'reviewedCommandJS_SHA256':R4_JS,'unchangedNativeContractSpans':spans,'JSDiff':diff,'scope':'Exact reviewed Towers-only scroll-owner preservation, selected-part/library-row reveal, inline confirmation focus and deliberate new/discard scroll reset. Every other APK runtime member, CSS, DEX/resources and complete Towers/Duel engine/data remain identical.','evidencePolicy':'Older full FIFO and short-production records retain their original APK identities. R4 requires new real production/completion, fresh actual keyboard/save/Library/Design checks and all remaining relevant R4 journeys.'}


def verify_music(baseline,candidate,expected):
    require(digest(baseline)==R4 and digest(candidate)==expected and re.fullmatch('[a-f0-9]{64}',expected),'Wrong preserved R4/new Music candidate identity')
    with ZipFile(baseline) as old,ZipFile(candidate) as new:
        require(old.testzip() is None and new.testzip() is None,'APK CRC mismatch')
        names=set(old.namelist());require(len(names)==len(old.namelist()) and names==set(new.namelist()) and len(names)==len(new.namelist()),'APK member inventory changed')
        assets={n for n in names if n.startswith('assets/') and not n.endswith('/')}
        require(len(assets)==473 and all(zip_digest(old,n)==zip_digest(new,n) for n in assets),'HTML/game/native payload assets changed with Music styling')
        changed=sorted(n for n in names if zip_digest(old,n)!=zip_digest(new,n))
        dex=lambda n:bool(re.fullmatch(r'classes(?:\d+)?\.dex',n))
        signing=lambda n:bool(re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))',n,re.I))
        require(any(dex(n) for n in changed) and all(dex(n) or signing(n) for n in changed),'APK delta exceeds Music DEX/signing: '+str(changed))
    source_report=ROOT/'qa/test-14/diagnostics/r4-verification/package-verification.json';before=h['read'](source_report)
    require(before.get('passed') is True and before.get('candidateAPK_SHA256')==R4,'Original R4 source verification missing')
    music='app/src/main/java/com/rbabbit/blocknight/warzone/MusicSetupView.java';modified=[]
    for entry in before['sourceFiles']:
        if digest(h['local'](entry['path']))!=entry['sha256']:modified.append(entry['path'])
    require(modified==[music],'Another app source changed with Music: '+str(modified))
    with ZipFile(ROOT.parent/'warzone-towers-0.13-source.zip') as source:style=h['native_style_only'](source)
    require(style.get('passed') is True and style.get('allOtherJavaLogicIdentical') is True,'Reviewed native Music style-only residual fails')
    return {'passed':True,'baselineAPK_SHA256':R4,'candidateAPK_SHA256':expected,'baselineAPK':{'path':str(baseline.resolve()),'sha256':R4},'candidateAPK':{'path':str(candidate.resolve()),'sha256':expected},'assetsIdentical':True,'htmlGameAssetsIdentical':True,'assetCount':len(assets),'changedAssets':[],'changedAPKEntries':changed,'onlyNativeTowersMusicStyleChanged':True,'changedAppSourceFiles':modified,'nativeStyleVerification':style,'baselineSourceVerification':{'path':source_report.relative_to(ROOT).as_posix(),'sha256':digest(source_report)},'scope':'All473 HTML/game/program/data assets and all non-DEX APK members except signing are exact R4. Only the reviewed Towers short-height Music visual helper/Boolean differ in app source; normalized Java action/input/Back/preferences/download code and default Duel remain exact0.13.','evidencePolicy':'Retained R4 command UI/native-production records keep their original identities. Require fresh R5 normal/compact page smoke and outstanding actions, current R5 native production/completion, and fresh native Music at both profiles.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage',choices=('queue','scroll','music'),default='queue')
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--out',type=Path)
    defaults={'queue':('towers-0.14-r2-diagnostic-before-build-queue-20261108/Warzone-Towers-0.14-R2.apk','r2-to-r3-parity.json',verify),'scroll':('towers-0.14-r3-diagnostic-before-scroll-20261108/Warzone-Towers-0.14-R3.apk','r3-to-r4-parity.json',verify_scroll),'music':('towers-0.14-r4-diagnostic-before-music-20261108/Warzone-Towers-0.14-R4.apk','r4-to-r5-parity.json',verify_music)}
    args=parser.parse_args();prior,report,verify_stage=defaults[args.stage];baseline=args.baseline or ROOT.parent/'fallbacks'/prior
    args.out=args.out or ROOT/'qa/test-14'/report
    value=verify_stage(baseline,args.apk,args.expected_sha256);args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(value,indent=2))


if __name__=='__main__':main()
