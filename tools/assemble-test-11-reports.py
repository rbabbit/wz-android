"""Assemble Towers 0.11 evidence after exact-APK checks and visual review.

This performs no gameplay, screenshot acceptance, packaging or publication.
All named raw reports, current source/package hashes and the explicit manual
review must already pass. The delivery gate is written last.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import json
import os
import re
import runpy

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/test-11'
h=runpy.run_path(str(ROOT/'tools/verify-test-11-package.py'),run_name='release11_assembly')
digest,read,require,local=(h[n] for n in ('digest','read','require','local'))
EXPECTED='09440e33070aabf0dacd22e8b495f6d696735bb45f9084bd2fca5e25d9b10471'
RAW={'layouts':'final-layouts/layouts.json','five':'final-five/five-facilities.json',
     'ordinary':'final-ordinary/ordinary.json','modules':'final-modules/module-journey-dustfall.json',
     'back':'final-back/dialog.json','duel':'final-duel/smoke.json'}
OUTPUTS={'emulator-verification.json','visual-review.json','DELIVERY.json','REPORT.md'}


def record(path):
    return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def identity(value):
    return value.get('candidateAPK_SHA256') or value.get('identity',{}).get('candidateAPK_SHA256')


def passing(path,candidate):
    require(path.is_file(),'Required evidence missing: '+str(path))
    value=read(path)
    require(value.get('passed') is True and identity(value)==candidate,'Failed or wrong-APK evidence: '+str(path))
    require(not any(value.get(k) for k in ('failure','cleanupFailure','recoveryFailure')),'Unresolved raw evidence failure: '+str(path))
    after=value.get('afterIdentity',{})
    require(not after or after.get('candidateAPK_SHA256')==candidate,'Post-check installed identity changed: '+str(path))
    return value


def checked(value,keys,label):
    require(all(value.get('checks',{}).get(k) is True for k in keys),'Missing required '+label+' check: '+str(keys))


def accepted_screens(path,raw_paths):
    value=read(path);require(value.get('reviewed') is True,'Explicit manual screenshot review required')
    entries=value.get('screenshots',[]);require(entries and isinstance(entries,list),'Explicit accepted screenshots required')
    allowed={str((QA/relative).parent.resolve()) for relative in raw_paths.values()}
    result=[];names=set()
    for entry in entries:
        require(isinstance(entry,dict) and entry.get('accepted') is True,'Screenshot not explicitly accepted')
        p=local(entry['path'])
        require(p.is_file() and p.suffix.lower()=='.png' and (str(p.parent.resolve()) in allowed or p.is_relative_to(QA/'comparisons')),'Screenshot outside final raw/comparison evidence folders')
        require(p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'),'Invalid reviewed PNG')
        rec=record(p);require(rec['path'] not in names,'Duplicate accepted screenshot')
        require(not entry.get('sha256') or entry['sha256']==rec['sha256'],'Reviewed screenshot changed after acceptance')
        names.add(rec['path']);rec['accepted']=True
        if entry.get('notes'):rec['notes']=str(entry['notes'])
        result.append(rec)
    observations=value.get('observations',[]);limitations=value.get('limitations',[])
    require(isinstance(observations,list) and isinstance(limitations,list),'Manual observations/limitations must be lists')
    return result,observations,limitations


def resolve_raw(path):
    p=Path(path)
    p=p.resolve() if p.is_absolute() else (QA/p).resolve()
    require(p.is_relative_to(QA.resolve()),'Raw report outside scoped QA: '+str(p))
    return p


def assemble(apk,accepted,expected,modules,design_qa):
    candidate=digest(apk);require(re.fullmatch('[a-f0-9]{64}',expected) and candidate==expected,'APK differs from expected delivery candidate')
    paths={name:resolve_raw(relative) for name,relative in RAW.items()}
    paths['modules']=resolve_raw(modules)
    raw={name:passing(path,candidate) for name,path in paths.items()}
    raw_paths={name:path.relative_to(QA).as_posix() for name,path in paths.items()}
    code=passing(QA/'code-checks.json',candidate);package=passing(QA/'package-verification.json',candidate)
    tests=code.get('tests',[])
    require(tests and all(t.get('passed') is True and t.get('exitCode')==0 for t in tests),'Source checks failed/incomplete')
    require({'test-11-commands.cjs','test-11-research.cjs','test-android-back-routing.cjs','test-test-lifecycle.cjs','test-duel-ui.cjs'}<={t['name'] for t in tests},'Required Towers/mode-guard/Back source checks missing')
    require(package.get('version')=='0.11' and package.get('baselineAPK_SHA256')==h['FROZEN']['Warzone-Towers-0.10.apk'],'Wrong package/fallback identity')
    require(all(package.get(k) is True for k in ('compiledEngineUnchanged','towersAndDuelPayloadsUnchanged','duelScenarioUnchanged','nativeReturnDialogUnchanged')),'UI-only game/Duel/native dialog preservation proof missing')
    for entry in package['sourceFiles']+package['nativeSourceFiles']+package['duelSourceFiles']+code.get('sourceFiles',[]):
        require(digest(local(entry['path']))==entry['sha256'],'Source changed since verification: '+entry['path'])
    checked(raw['layouts'],{'approvedLayouts'},'approved layouts')
    profiles=raw['layouts'].get('profiles',[])
    require(len(profiles)>=3,'Wide, normal and compact/enlarged layout profiles required')
    pages={'research','factory','design','saved','queue','build','help'}
    for p in profiles:require(pages<={s.get('page') for s in p.get('screens',[])},'Incomplete actual screen profile: '+str(p.get('name')))
    five=raw['five'];require(five.get('seeded') is True and bool(five.get('fixtureDisclosure')),'Five-facility seeded setup disclosure missing')
    require(five.get('nativeFacilityCounts')=={'labs':5,'vehicleFactories':5,'cyborgFactories':5},'Actual native5/5/5 counts missing')
    checked(five,{'fiveLabs','tenFactories','manualResearchQueues','fixtureProductionCompleted','nativeSaveLoad','compactFiveLabsAndTenFactories'},'five labs/ten factories')
    require(len(five.get('factorySelections',[]))==10 and len(five.get('compact',{}).get('factorySelections',[]))==10,'Every normal/compact factory selector must be exercised')
    require(five.get('compact',{}).get('restoredInput') is True,'Native input not checked after compact profile restoration')
    require({o.get('kind') for o in five.get('productionOrders',[])}=={'Factory','Cyborg factory'} and len(five.get('nativeProducedUnits',[]))>=2,'Fifth vehicle/cyborg factories lack native ordinary-cost unit completions')
    ordinary=raw['ordinary'];require(ordinary.get('seeded') is False,'Independent ordinary gameplay must use an unmodified native setup')
    checked(ordinary,{'ordinaryProduction','designPhonePersistence','keyboardAndMenuReturns'},'ordinary gameplay/design/keyboard')
    module=raw['modules'];require(module.get('seeded') is False,'Module gameplay must use ordinary native structures')
    d=module.get('dustfall',{});require(d.get('passed') is True,'Ordinary Dustfall module journey failed')
    require(len(d.get('researchNative',[]))>=2 and all(v.get('modules')==1 for v in d['researchNative']),'Two ordinary completed Research Modules missing')
    require(d.get('powerNative',{}).get('modules')==1 and d.get('towerNative',{}).get('currentBuildPts',0)>=300 and len(d.get('fifo',[]))==2,'Native Power Module/ordinary tower FIFO proof missing')
    q=d.get('quickload',{});require(q.get('rewoundClock',float('inf'))<q.get('preLoadClock',0)-2000 and q.get('inputClock') is not None,'Genuine native save/load and restored module input missing')
    back=raw['back'];checked(back,{'polishedBlackWhiteNativeStyle','realSystemBackCancel','cancelReturnFreshBattle','phoneDesignsAndSavePreserved'},'native Back dialog/returns')
    require(len(back.get('navigationEvents',[]))>=3 and all(e.get('source')=='actual-SystemUI-button' and e.get('pixels',{}).get('ready') is True for e in back['navigationEvents']),'Observed actual SystemUI Back-button input missing')
    checked(raw['duel'],{'duelPreserved'},'retained Duel smoke')
    require(design_qa.is_file(),'Current visual comparison report missing')
    qa_text=design_qa.read_text(encoding='utf-8')
    first_heading=next((line for line in qa_text.splitlines() if line.startswith('# ')),'')
    result=re.search(r'final result:\s*(passed|blocked|failed)',qa_text,re.I)
    require('0.11' in first_heading and candidate in qa_text.lower() and result and result.group(1).lower()=='passed','Visual comparison report is historical, blocked, failed or for another APK')
    screens,observations,extra_limits=accepted_screens(accepted,raw_paths)
    now=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    fixture={'path':paths['five'].relative_to(ROOT).as_posix(),'seeded':True,'disclosure':five['fixtureDisclosure']}
    limitations=[
        'Actual checks ran in the owned Android emulator. Physical-handset GPU/FPS, audio and optional HQ downloads were not newly verified.',
        'The software-emulator black-terrain limitation remains; the native game program, terrain/map data and both gameplay packages are byte-identical to the accepted 0.10 fallback.',
        'The five-lab/five-vehicle/five-cyborg case uses a disclosed complete-native-save facility setup. It verifies real native facility counts, actual UI selection/queues and normal-cost unit completions, not ordinary construction of all nine added facilities.',
        'Ordinary production/design/keyboard and Dustfall module/ordinary FIFO/save-load checks are separate unmodified native gameplay journeys.',
        'Duel remains available and its legacy UI/mode received a scoped preservation smoke check. Its unchanged bot scenario was not newly balanced or subjected to another full combat campaign.',
        'No complete 30-wave Towers victory was rerun for this UI-only update. Engine, maps, rules, costs, research availability and opponent data remain frozen.',
        'The acknowledged pre-existing placement-preview source harness failure is excluded from passing source evidence. Actual scoped construction/module/native completion checks are recorded separately.',
    ]+extra_limits
    source_reports=[record(p) for p in paths.values()]
    emulator={'passed':True,'candidateAPK_SHA256':candidate,'installedAPK_SHA256':candidate,'version':'0.11','package':'com.rbabbit.warzonetowers.lab',
              'emulatorTesting':True,'gameplayTesting':True,'recordedUTC':now,'checks':{k:True for k in h['EMULATOR_CHECKS']},'sourceReports':source_reports,'fixtureDisclosures':[fixture],'limitations':limitations,
              'method':'Derived from passed exact-installed-APK raw screen/layout, native5/5/5 setup, ordinary gameplay, Dustfall module/FIFO/save-load, actualSystemUIBack and retained Duel mode reports. Source checks and generated mocks alone are not gameplay evidence.'}
    visual={'passed':True,'candidateAPK_SHA256':candidate,'reviewed':True,'recordedUTC':now,'reviewInput':record(accepted),'designQA':record(design_qa),
            'screenshots':screens,'observations':observations,'limitations':limitations}
    excluded={str((QA/name).resolve()) for name in OUTPUTS|{'code-checks.json','package-verification.json'}}|{str(p.resolve()) for p in paths.values()}|{str(accepted.resolve())}
    diagnostics=[record(p) for p in sorted(QA.rglob('*.json')) if str(p.resolve()) not in excluded]
    report=f'''# Warzone Towers 0.11 — approved compact interface

Exact installed APK: `{candidate}`. The approved Build, Research and Factory layouts are implemented with existing HTML/CSS, real game assets and native game data. Design, saved blueprints, activity, Help and the header use the same visual language. The Android launcher/icon and polished native Return dialog are retained.

The [layout journey]({raw_paths['layouts']}) records every relevant screen at wide, normal and compact/enlarged profiles. Research combines the selected-topic action with the active lab and waiting queue; large topic images remain. Factories have independent vehicle/cyborg selector strips. There is no invented factory ETA, percentage or assembled 3D design preview.

The [five-facility journey]({raw_paths['five']}) proves actual native counts of five laboratories, five vehicle factories and five cyborg factories. All ten factory IDs and the fifth lab are selected with real input. Per-lab manual research, actual production from the fifth factory of each family, compact finger panning, retained selections/offsets across Back and input restoration are recorded. Its facility setup is explicitly seeded; native rules, limits, components, research, power and costs are not changed.

The [ordinary journey]({raw_paths['ordinary']}) independently verifies normal production, phone blueprint persistence and real keyboard/menu returns. The [Dustfall module journey]({raw_paths['modules']}) verifies actual Research/Power Modules, module→ordinary construction FIFO, native structure completion, genuine save/load and restored input. The [Back journey]({raw_paths['back']}) uses observed actual Android SystemUI Back buttons, Cancel, confirmed Return and a fresh battle. The [retained Duel smoke]({raw_paths['duel']}) confirms that the deferred 1v1 remains available with its original mode/UI.

The [manual design comparison]({os.path.relpath(design_qa,QA).replace(chr(92),'/')}) and explicit accepted-screen list are separate from source checks. The package verifier confirms unchanged original Towers/Duel programs/data/entrypoints, native provenance, maps/scenarios, signing identity and fifty preserved fallback artifacts. The immutable 0.9 GitHub benchmark and separate v6.4 remain preserved.

All required final reports passed. Earlier failed candidates, preparation and observer diagnostics are retained as supporting evidence and excluded from passing delivery claims. Complete-source packaging requires inventory/CRC/SHA readback before delivery.

Limitations:

'''+''.join('- '+str(item)+'\n' for item in limitations)+'\nSeeded facility disclosure:\n\n- '+fixture['disclosure']+'\n'
    # Preconditions run before any output; the delivery gate is written last.
    (QA/'emulator-verification.json').write_text(json.dumps(emulator,indent=2)+'\n',encoding='utf-8')
    (QA/'visual-review.json').write_text(json.dumps(visual,indent=2)+'\n',encoding='utf-8')
    (QA/'REPORT.md').write_text(report,encoding='utf-8')
    reports=[record(QA/name) for name in ('package-verification.json','code-checks.json','emulator-verification.json','visual-review.json')]
    gate={'passed':True,'candidateAPK_SHA256':candidate,'version':'0.11','package':'com.rbabbit.warzonetowers.lab','emulatorTesting':True,'gameplayTesting':True,'visualReview':True,
          'recordedUTC':now,'reports':reports,'supportingReports':diagnostics,'reportMarkdown':record(QA/'REPORT.md'),'limitations':limitations,'fixtureDisclosures':[fixture]}
    (QA/'DELIVERY.json').write_text(json.dumps(gate,indent=2)+'\n',encoding='utf-8')
    return {'passed':True,'candidateAPK_SHA256':candidate,'rawReports':len(source_reports),'acceptedScreenshots':len(screens),'supportingDiagnostics':len(diagnostics)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,required=True)
    parser.add_argument('--accepted',type=Path,required=True)
    parser.add_argument('--expected-sha256',default=EXPECTED)
    parser.add_argument('--modules',default=RAW['modules'],help='Module raw report path, absolute or relative to qa/test-11')
    parser.add_argument('--design-qa',type=Path,default=ROOT/'design-qa.md')
    args=parser.parse_args();accepted=args.accepted.resolve();design_qa=args.design_qa.resolve()
    require(accepted.is_relative_to(QA.resolve()),'Retain manual acceptance inside scoped QA')
    require(design_qa.is_relative_to(ROOT),'Retain current visual comparison report in project')
    print(json.dumps(assemble(args.apk,accepted,args.expected_sha256,args.modules,design_qa),indent=2))


if __name__=='__main__':main()
