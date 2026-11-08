"""Assemble 0.10 delivery evidence only after final exact-APK checks pass.

This performs no gameplay, screenshot review, packaging or publication. The
reviewer must supply an explicit accepted-screen list; missing/failed/stale
evidence prevents every output from being written.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import json
import re
import runpy

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/test-10'
h=runpy.run_path(str(ROOT/'tools/verify-test-10-package.py'),run_name='release10_assembly')
digest,read,require,local=(h[n] for n in ('digest','read','require','local'))
EXPECTED='d29a3e6e2e6da13a8eac6b2d6540b5c4070b39f0115de1dc44025822237a31b3'
RAW={
    'cannon':'final-cannon/duel.json',
    'combat':'final-cannon/combat.json',
    'rockets':'final-rockets/duel.json',
    'save':'final-save-rewind/save-ordinary.json',
    'victory':'final-victory/save-victory.json',
    'defeat':'final-defeat/save-defeat.json',
    'modes':'final-modes/modes.json',
    'header':'final-towers-header/header.json',
    'dialog':'final-towers-dialog/dialog.json',
}
OPTIONAL={'replay':('final-replay-recovered/replay.json','final-replay/replay.json')}
OUTPUTS={'emulator-verification.json','visual-review.json','DELIVERY.json','REPORT.md'}
BRANCH_CHECKS={'nativeModeReady','manualResearchBranchAndQueue','incompatiblePhoneBlueprintsPreserved',
               'nativePolicyEnforced','noDuplicateStarterCards','visibleNativeTruckSelection',
               'nativeQueuedProductionCompleted','ordinaryBotProduction','researchAndCancelReturns'}


def record(path):
    return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def identity(value):
    return value.get('candidateAPK_SHA256') or value.get('identity',{}).get('candidateAPK_SHA256')


def passing(path,candidate):
    require(path.is_file(),'Required evidence missing: '+str(path))
    value=read(path)
    require(value.get('passed') is True and identity(value)==candidate,'Failed or wrong-APK evidence: '+str(path))
    require(not any(value.get(k) for k in ('failure','cleanupFailure','recoveryFailure')),'Unresolved evidence failure: '+str(path))
    after=value.get('afterIdentity',{})
    require(not after or after.get('candidateAPK_SHA256')==candidate,'Post-check installed identity changed: '+str(path))
    return value


def checked(value,keys,label):
    require(all(value.get('checks',{}).get(k) is True for k in keys),'Missing required '+label+' checks: '+str(keys))


def accepted_screens(path,raw_paths):
    value=read(path)
    require(isinstance(value,dict) and value.get('reviewed') is True,'Explicit manual review confirmation required')
    entries=value.get('screenshots',[])
    require(entries and isinstance(entries,list),'Explicit accepted screenshot list required')
    allowed={str((QA/relative).parent.resolve()) for relative in raw_paths.values()}
    result=[];names=set()
    for entry in entries:
        require(isinstance(entry,dict) and entry.get('accepted') is True,'A screenshot was not explicitly accepted')
        screenshot=local(entry['path'])
        require(screenshot.is_file() and screenshot.suffix.lower()=='.png' and str(screenshot.parent)==str(screenshot.parent.resolve()) and str(screenshot.parent.resolve()) in allowed,'Screenshot outside final exact-APK evidence folders')
        require(screenshot.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'),'Invalid reviewed PNG')
        rec=record(screenshot)
        require(rec['path'] not in names,'Duplicate reviewed screenshot')
        require(not entry.get('sha256') or entry['sha256']==rec['sha256'],'Reviewed screenshot changed since acceptance')
        names.add(rec['path']);rec['accepted']=True
        if entry.get('notes'):rec['notes']=str(entry['notes'])
        result.append(rec)
    observations=value.get('observations',[])
    require(isinstance(observations,list),'Visual observations must be a list')
    return result,observations,value.get('limitations',[])


def assemble(apk,accepted,expected):
    candidate=digest(apk)
    require(re.fullmatch('[a-f0-9]{64}',expected) and candidate==expected,'APK differs from the explicitly expected final candidate')
    raw={name:passing(QA/relative,candidate) for name,relative in RAW.items()}
    raw_paths=dict(RAW)
    for name,candidates in OPTIONAL.items():
        for relative in candidates:
            path=QA/relative
            # Prefer the continued, already-replayed battle after its final
            # checks pass. The earlier transport failure remains diagnostic.
            if path.is_file() and read(path).get('passed') is True:
                raw[name]=passing(path,candidate);raw_paths[name]=relative;break
    code=passing(QA/'code-checks.json',candidate)
    package=passing(QA/'package-verification.json',candidate)
    tests=code.get('tests',[])
    require(tests and all(t.get('passed') is True and t.get('exitCode')==0 for t in tests),'Current source checks incomplete/failed')
    require({'test-duel-ui.cjs','test-test-lifecycle.cjs','test-android-back-routing.cjs'}<={t['name'] for t in tests},'Duel/shared lifecycle/native Back source evidence missing')
    require(any('duel' in t['name'].lower() and t['name']!='test-duel-ui.cjs' for t in tests),'Native Duel policy source evidence missing')
    require(package.get('version')=='0.10' and package.get('baselineAPK_SHA256')==h['FROZEN']['Warzone-Towers-0.9.apk'],'Wrong package/benchmark identity')
    require(package.get('towersNativeAndPagesUnchanged') is True and package.get('compiledEngineUnchanged') is True and package.get('duelPayloadVerification',{}).get('passed') is True,'Native preservation/Duel provenance proof incomplete')
    for entry in package['sourceFiles']+package['nativeSourceFiles']+package['duelSourceFiles']+code.get('sourceFiles',[]):
        require(digest(local(entry['path']))==entry['sha256'],'Source changed since verification: '+entry['path'])
    for branch,other in (('cannon','rockets'),('rockets','cannon')):
        value=raw[branch]
        require(value.get('seeded') is False and value.get('branch')==branch and value.get('opponent')==other,'Wrong/seeded ordinary branch journey')
        checked(value,BRANCH_CHECKS,branch+' Duel')
    require(raw['combat'].get('seeded') is False,'Ordinary combat must use unmodified native units')
    checked(raw['combat'],{'actualHumanSelectionAndMovement','ordinaryNativeCombat'},'ordinary combat')
    require(raw['save'].get('action')=='ordinary' and raw['save'].get('seeded') is False,'Ordinary save/load must be unmodified')
    checked(raw['save'],{'nativeSaveLoadAndInput'},'ordinary native save/load')
    fixtures=[]
    for name,phase in (('victory','victory'),('defeat','defeated')):
        value=raw[name]
        require(value.get('action')==name and value.get('seeded') is True and bool(value.get('fixtureDisclosure')),'Terminal fixture disclosure missing')
        checked(value,{'nativeHQOutcome'},name+' native result')
        require(value.get('after',{}).get('duel',{}).get('snapshot',{}).get('phase')==phase,'Wrong native '+name+' phase')
        require(value.get('after',{}).get('html',{}).get('phase')=='ended' and value['after']['html'].get('result')==phase,'Wrong HTML '+name+' result')
        fixtures.append({'path':(QA/RAW[name]).relative_to(ROOT).as_posix(),'seeded':True,'disclosure':value['fixtureDisclosure']})
    profiles=raw['modes'].get('profiles',[])
    require(len(profiles)>=2,'Standard/compact native launcher profiles missing')
    for profile in profiles:
        states=profile.get('states',[])
        require(len(states)>=4 and any(s.get('mode')=='towers' for s in states) and all(any(s.get('mode')=='duel' and s.get('weapon')==branch for s in states) for branch in ('cannon','rockets')),'Native launcher mode/branch round trip missing')
    checked(raw['header'],{'statsRemoved','compactHeaderAndOverlayInput','researchAndBuildReturns'},'Towers header/build/overlay')
    checked(raw['dialog'],{'polishedBlackWhiteNativeStyle','flatCancelCharcoalReturn','noStrongWhiteOutlines','minimumNativeTargets','realSystemBackCancel','cancelReturnFreshBattle','phoneDesignsAndSavePreserved'},'Towers native dialog/returns')
    if 'replay' in raw:
        checked(raw['replay'],{'nativeResultReplay','replayedBattleCancelAndReturn'},'native result replay/returns')
        require(raw['replay'].get('replayed',{}).get('duel',{}).get('snapshot',{}).get('humanBranch')==raw['victory']['after']['duel']['snapshot']['humanBranch'],'Native replay changed the selected weapon branch')
        require(raw['replay']['replayed'].get('session') and raw['replay']['replayed']['session']!=raw['victory']['after']['html'].get('session'),'Native replay did not establish a distinct battle session')
    screens,observations,extra_limits=accepted_screens(accepted,raw_paths)
    require(isinstance(extra_limits,list),'Visual limitations must be a list')
    limitations=[
        'Verified on the Android emulator; a physical handset, hardware GPU/FPS, audio and HQ graphics were not newly tested.',
        'Both weapon branches used ordinary authored units, manual research and normal production. Sustained ordinary combat was observed in the Cannon-human/Rockets-bot journey.',
        'Victory and defeat handling used explicitly seeded complete-save copies with one Command Centre removed. These are native outcome/lifecycle checks, not naturally completed wins/losses.',
        'The Towers benchmark payload/maps remain byte-identical. Scoped Towers launcher/build/research/overlay/Back regressions were replayed; a complete30-wave run was not repeated.',
        'An earlier ordinary F8 preflight observed a stale clock packet. The passing final-save-rewind check required an actual native clock rewind, fresh command replies and restored research/input; the earlier transport/readiness attempt is diagnostic only.',
    ]+extra_limits
    if 'replay' in raw and raw['replay'].get('readinessRecovery'):
        limitations.append('Replay readiness fixture continuation: '+str(raw['replay']['readinessRecovery'])+' The same already-started battle was checked with a bounded90-second readiness transport; no additional Replay input or runtime change was used. The original20-second observer timeout is retained as diagnostic evidence.')
    now=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    source_reports=[record(QA/relative) for relative in raw_paths.values()]
    emulator={'passed':True,'candidateAPK_SHA256':candidate,'installedAPK_SHA256':candidate,'version':'0.10','package':'com.rbabbit.warzonetowers.lab',
        'emulatorTesting':True,'gameplayTesting':True,'recordedUTC':now,'sourceReports':source_reports,
        'checks':{key:True for key in h['EMULATOR_CHECKS']},'fixtureDisclosures':fixtures,'limitations':limitations,
        'method':'Derived only from final exact-installed-APK raw launcher/Towers/both-branch/native-policy/ordinary-combat/save-load/outcome reports. Seeded terminal fixtures are separate from ordinary gameplay.'}
    visual={'passed':True,'candidateAPK_SHA256':candidate,'reviewed':True,'recordedUTC':now,'reviewInput':record(accepted),
            'screenshots':screens,'observations':observations,'limitations':limitations}
    excluded={str((QA/name).resolve()) for name in OUTPUTS|{'code-checks.json','package-verification.json'}}|{str((QA/relative).resolve()) for relative in raw_paths.values()}|{str(accepted.resolve())}
    diagnostics=[record(p) for p in sorted(QA.rglob('*.json')) if str(p.resolve()) not in excluded]
    replay_summary=f'The [native replay journey]({raw_paths["replay"]}) observed the actual result-panel Replay, a distinct fresh battle with the same chosen branch, and Cancel/Return to the custom main menu. Any observer-readiness continuation is disclosed below.\n\n' if 'replay' in raw else ''
    report=f'''# Warzone Towers 0.10 — offline 1v1

Exact installed candidate: `{candidate}`. All required final source, package-preservation, emulator and explicitly reviewed screenshot evidence passed. Source-archive creation remains gated on complete inventory, CRC and SHA readback.

The native launcher keeps Towers as its default and adds 1v1 vs Bot with Cannon or Rockets. The human and bot use opposite weapon branches plus shared technology. Research remains manually queued; production uses normal native power/time; the phone blueprint library is retained and incompatible designs stay unavailable. The 1v1 field shows branch, native elapsed time and own HQ status without wave controls.

The [Cannon journey](final-cannon/duel.json) and [Rockets journey](final-rockets/duel.json) verified branch-filtered research, manual queues, forbidden research/design/production rejection, retained MG blueprints, genuine visible truck selection, ordinary production/completion and menu returns. The [combat journey](final-cannon/combat.json) observed real selected-unit movement and ordinary native fighting. The [save/load journey](final-save-rewind/save-ordinary.json) restored a genuine native save, branch policy and working research/input.

The [victory](final-victory/save-victory.json) and [defeat](final-defeat/save-defeat.json) reports exercise authoritative native HQ outcomes and lifecycle handling using disclosed modified complete-save copies. They do not establish naturally won/lost matches.

{replay_summary}The [native mode journey](final-modes/modes.json) covered default Towers, both 1v1 branch selections and returning to Towers in normal and compact/enlarged-text profiles. The [Towers header](final-towers-header/header.json) and [native dialog](final-towers-dialog/dialog.json) regressions replayed Build/Research/Factory/Design/Queue/Help, actual SystemUI Back, Cancel, direct main-menu return and a fresh session.

The package verifier confirms unchanged benchmark Towers JS/WASM/data/index/mobile, metadata-only differences in the separate Duel runtime, the unchanged64,424,618-byte official stock prefix and exact retained source embedding. Complete native source, authored map/attribution, Duel policy and reproducible package builder are retained. The frozen0.9 benchmark (`v0.9-benchmark`, commit `28fe51dc5725d5262b0302de10776ae1a37eb994`), older APK/source artifacts and separate v6.4 fallback remain preserved.

Earlier candidate/startup/transport diagnostics are retained as supporting evidence and are excluded from the passing delivery evidence.

Limitations:

'''+''.join('- '+str(item)+'\n' for item in limitations)+'\nSeeded fixture disclosures:\n\n'+''.join('- '+fixture['disclosure']+'\n' for fixture in fixtures)
    # Every precondition above runs before any output is written. The gate is
    # written last so interrupted output generation cannot authorize packaging.
    QA.mkdir(parents=True,exist_ok=True)
    (QA/'emulator-verification.json').write_text(json.dumps(emulator,indent=2)+'\n',encoding='utf-8')
    (QA/'visual-review.json').write_text(json.dumps(visual,indent=2)+'\n',encoding='utf-8')
    (QA/'REPORT.md').write_text(report,encoding='utf-8')
    reports=[record(QA/name) for name in ('package-verification.json','code-checks.json','emulator-verification.json','visual-review.json')]
    gate={'passed':True,'version':'0.10','package':'com.rbabbit.warzonetowers.lab','candidateAPK_SHA256':candidate,
          'emulatorTesting':True,'gameplayTesting':True,'visualReview':True,'recordedUTC':now,'reports':reports,
          'supportingReports':diagnostics,'reportMarkdown':record(QA/'REPORT.md'),'limitations':limitations,'fixtureDisclosures':fixtures}
    (QA/'DELIVERY.json').write_text(json.dumps(gate,indent=2)+'\n',encoding='utf-8')
    return {'passed':True,'candidateAPK_SHA256':candidate,'rawReports':len(source_reports),'acceptedScreenshots':len(screens),'supportingDiagnostics':len(diagnostics),'outputs':sorted(OUTPUTS)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,required=True)
    parser.add_argument('--accepted',type=Path,required=True,help='Explicit {reviewed:true,screenshots:[{path,accepted:true}],observations:[]} input')
    parser.add_argument('--expected-sha256',default=EXPECTED)
    args=parser.parse_args()
    accepted=args.accepted.resolve()
    require(accepted.is_relative_to(QA.resolve()),'Retain manual review input inside qa/test-10')
    print(json.dumps(assemble(args.apk,accepted,args.expected_sha256),indent=2))


if __name__=='__main__':main()
