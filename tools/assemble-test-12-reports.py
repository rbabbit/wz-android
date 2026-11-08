"""Assemble existing exact-APK Towers 0.12 evidence and explicit visual review.

No emulator input, screenshot acceptance, native fixture changes or packaging
occurs here. Raw checks must already pass; the delivery gate is written last.
"""
from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
import argparse
import json
import os
import re
import runpy

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/test-12'
h=runpy.run_path(str(ROOT/'tools/verify-test-12-package.py'),run_name='release12_assembly')
digest,read,require,local=(h[n] for n in ('digest','read','require','local'))
RAW={'journey':'final-status/status.json','five':'final-five/five.json',
     'world':'final-world/world.json','back':'final-back/dialog.json','duel':'final-duel/smoke.json'}
OUTPUTS={'emulator-verification.json','visual-review.json','DELIVERY.json','REPORT.md'}


def record(path):return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def identity(value):return value.get('candidateAPK_SHA256') or value.get('identity',{}).get('candidateAPK_SHA256')


def passing(path,candidate):
    require(path.is_file(),'Required evidence missing: '+str(path));value=read(path)
    require(value.get('passed') is True and identity(value)==candidate,'Failed/wrong-APK evidence: '+str(path))
    require(not any(value.get(k) for k in ('failure','cleanupFailure','recoveryFailure')),'Unresolved raw evidence failure: '+str(path))
    after=value.get('afterIdentity',{})
    require(not after or after.get('candidateAPK_SHA256')==candidate,'Installed APK changed during raw check')
    if value.get('seeded') is True:require(value.get('fixtureDisclosure'),'Seeded fixture disclosure missing')
    return value


def checked(value,keys,label):
    require(all(value.get('checks',{}).get(k) is True for k in keys),'Missing '+label+' checks: '+str(sorted(keys)))


def native_gameplay(value):
    production=value.get('production',{});orders=production.get('orders',[])
    require(len(orders)>=2 and len({o.get('factoryId') for o in orders})>=2,'Independent ordinary factory production orders missing')
    for order in orders:
        completed=[u for u in production.get('produced',[]) if u.get('factoryId')==order['factoryId']]
        require(completed and any(d.get('id')==u.get('id') and d.get('player')==0 for d in production.get('nativeUnits',[]) for u in completed),'Ordinary factory completion lacks a native unit record')
    current=value.get('currentProduction',{});native=current.get('native',{})
    shown=[row for row in current.get('sidebar',{}).get('rows',[]) if row.get('id')==native.get('id')]
    require(native.get('active',{}).get('design',{}).get('name') and native.get('queue') and len(shown)==1 and shown[0].get('name')==native['active']['design']['name'],'Current-item sidebar not correlated with actual active factory and waiting queue')
    require(not re.search(r'queue|up next|\d+\s*%|\bETA\b',current.get('text',''),re.I),'Current-only sidebar exposes waiting/progress claims')
    construction=value.get('construction',{});sites=construction.get('sites',[])
    require(len(sites)==2 and len(construction.get('native',[]))==2 and all(s.get('currentBuildPts')==300 for s in construction['native']),'Two ordinary native construction completions missing')
    for site in sites:
        reply=site.get('reply',{});job=reply.get('result',{})
        require(reply.get('ok') is True and job.get('workers') and any(done.get('id')==job.get('id') for done in construction.get('completed',[])),'Accepted construction group/FIFO completion missing')
        during=[item for item in construction.get('during',{}).get('jobs',[]) if item.get('id')==job.get('id')]
        require(not during or sorted(during[0].get('workers',[]))==sorted(job['workers']),'Status opening changed native construction worker group')
    require(type(value.get('savedClock')) is int and value.get('restoredInputClock',-1)>value['savedClock'],'Ordinary native save and later restored-input clock missing')


def continuation(value,candidate):
    if not value.get('continuation'):return []
    reference=value.get('diagnostic',{});path=local(reference.get('path',''))
    require(path.is_relative_to(QA) and digest(path)==reference.get('sha256'),'Ordinary continuation diagnostic missing/changed')
    prior=read(path)
    require(identity(prior)==candidate and prior.get('passed') is False and bool(prior.get('failure')),'Continuation must retain its actual earlier failed report without promoting it to a pass')
    checked(prior,{'ordinaryProduction','footerStatus','nativeFacilityIdentity'},'retained pre-construction partial proof')
    require(value.get('production')==prior.get('production') and value.get('currentProduction')==prior.get('currentProduction'),'Continuation altered the retained partial production/status proof')
    selection=value.get('manualSelection',{});truck=selection.get('truck',{}).get('id')
    require(truck and any(unit.get('id')==truck for unit in selection.get('selected',[])) and truck in value.get('construction',{}).get('workers',[]),'Actual manual constructor selection missing from continuation')
    return [str(value['continuation'])]


def back_continuation(value,candidate):
    if not value.get('continuation'):return []
    reference=value.get('diagnostic',{});path=local(reference.get('path',''))
    require(path.is_relative_to(QA) and digest(path)==reference.get('sha256'),'Back continuation diagnostic missing/changed')
    prior=read(path)
    require(identity(prior)==candidate and prior.get('passed') is False and prior.get('failure'),'Back continuation must preserve its failed observer report')
    dialogs=prior.get('dialogs',[]);events=prior.get('navigationEvents',[])
    require(len(dialogs)==4 and len(events)==5 and value.get('dialogs',[])[:4]==dialogs and value.get('navigationEvents',[])[:5]==events,'Earlier actual Back actions changed or are missing')
    require(len(value.get('dialogs',[]))==5 and len(value.get('navigationEvents',[]))==6,'Final actual fresh-battle Back/Cancel case missing')
    require(value.get('originalSession')==prior.get('originalSession') and value.get('newSession') and value['newSession']!=value['originalSession'],'Return did not establish a different actual battle session')
    require(prior.get('save',{}).get('bytes') and value.get('save',{}).get('path')==prior['save']['path'] and value.get('phoneDesigns')==prior.get('phoneDesigns') and value.get('save',{}).get('sha256')==sha256(bytes(prior['save']['bytes'])).hexdigest(),'Phone designs/actual native save bytes changed during Back recovery')
    require(value.get('freshBattleClock',-1)>=value.get('recoveryObservedClock',float('inf')) and value.get('freshInputClock',-1)>value.get('freshBattleClock',float('inf')),'Same ready fresh battle and final restored native input clock missing')
    return [str(value['continuation'])]


def max_facilities(value):
    ids=value.get('nativeIds',{})
    require(set(ids)=={'labs','vehicle','cyborg'} and all(len(v)==5 and len(set(v))==5 for v in ids.values()),'Real unique 5/5/5 native IDs missing')
    research=value.get('research',{});status=research.get('status',{})
    require([r.get('id') for r in status.get('status',{}).get('rows',[])]==ids['labs'],'Research sidebar rows do not match actual native labs')
    active=[r for r in status['status']['rows'] if r.get('id')==research.get('labId')]
    require(len(active)==1 and active[0].get('name')==research.get('active',{}).get('name') and research.get('waiting',{}).get('name') not in status.get('text',''),'Current lab item/hidden waiting item proof missing')
    for family in ('vehicle','cyborg'):
        proof=value.get('tenFactories',{}).get(family,{})
        require([r.get('id') for r in proof.get('status',{}).get('rows',[])]==ids[family],'Factory status rows do not match actual native family IDs')
        orders=[o for o in value.get('productionOrders',[]) if o.get('kind')==family and o.get('factoryId')==ids[family][4]]
        require(len(orders)==1,'Fifth '+family+' actual production order missing')
        row=[r for r in orders[0].get('status',{}).get('status',{}).get('rows',[]) if r.get('id')==ids[family][4]]
        require(len(row)==1 and row[0].get('active') is True and len(row[0].get('components',[]))>=3,'Fifth factory lacks current real component status')
        produced=[u for u in value.get('nativeUnits',[]) if u.get('factoryId')==ids[family][4]]
        require(produced and any(d.get('id')==u.get('id') for d in value.get('nativeUnitRecords',[]) for u in produced),'Fifth factory lacks a completed native unit record')
    compact=value.get('compact',{});cases=compact.get('cases',[])
    require(compact.get('actual',{}).get('device')==[854,480] and compact.get('profile',{}).get('fontScale')==1.3 and compact.get('profile',{}).get('commandScale')==1.4,'Actual compact/enlarged status profile missing')
    require({(c.get('kind'),c.get('family')) for c in cases}=={('research',None),('production','vehicle'),('production','cyborg')} and all(c.get('androidBackClosedOnlySidebar') is True for c in cases),'Compact row families/Back input cases missing')
    require(compact.get('restored',{}).get('device') and all(c.get('proof',{}).get('dockVisible') is True and all(h.get('hit') is True for h in c['proof'].get('footerHits',[])) for c in cases),'Restored viewport or visible reachable footer missing')
    roundtrip=value.get('roundtrip',{})
    require(roundtrip.get('rewoundClock',float('inf'))<roundtrip.get('preLoadClock',0)-2000 and roundtrip.get('inputClock',-1)>roundtrip.get('rewoundClock',float('inf')),'Actual native save rewind and restored input missing')
    expected=set(ids['labs']+ids['vehicle']+ids['cyborg'])
    require(set(roundtrip.get('ids',[]))==expected and {r.get('id') for r in roundtrip.get('research',{}).get('rows',[])}==set(ids['labs']),'Native facility IDs/current sidebar did not survive save/load')


def resolve_raw(value):
    p=Path(value);p=p.resolve() if p.is_absolute() else (QA/p).resolve()
    require(p.is_relative_to(QA.resolve()),'Raw evidence outside scoped QA: '+str(p));return p


def world_cases(value,candidate):
    """Use the actual mesh-tap reports instead of trusting an aggregate flag."""
    entries=value.get('worldCases',[]);require(isinstance(entries,list) and entries,'Actual world-tap report index missing')
    reports=[];coverage=set()
    for entry in entries:
        reference=entry.get('report',{});path=local(reference.get('path',''))
        require(path.is_relative_to(QA) and digest(path)==reference.get('sha256'),'World-tap raw report missing/changed')
        raw=passing(path,candidate);kind=entry.get('kind');native_id=entry.get('nativeId')
        require(kind in {'research','factory','cyborg','vtol'} and raw.get('kind')==kind and type(native_id) is int and native_id>0 and raw.get('nativeId')==native_id,'Wrong world facility kind/native ID')
        require(entry.get('map') in {'ironvalley','dustfall'},'World case map not identified')
        checked(raw,{'noStockNativeLeftClick','fullResearchOpenedForNativeLabId' if kind=='research' else 'fullFactoryOpenedForNativeFactoryId'},'actual world-tap opening')
        require(raw.get('nativeLeftDown')==[] and raw.get('point') and not raw.get('inspectionOnly'),'World case only inspected or forwarded a native left press')
        after=raw.get('after',{})
        if kind=='research':
            research=after.get('research',{});labs=research.get('labs',[]);selected=research.get('activeLab')
            require(research.get('open') is True and type(selected) is int and 0<=selected<len(labs) and labs[selected].get('id')==native_id,'World lab page selected a different native lab')
        else:
            require(after.get('factoryId')==native_id and after.get('commands',{}).get('page')=='factory','World factory page selected a different native factory')
        coverage.add((entry['map'],kind));reports.append(record(path))
    require({('ironvalley','research'),('ironvalley','factory'),('dustfall','research'),('dustfall','factory')}<=coverage,'Actual lab and vehicle-factory taps required on both Towers maps')
    require(any(kind=='cyborg' for _,kind in coverage),'Actual world cyborg-factory tap missing')
    require(len({r['path'] for r in reports})==len(reports),'Duplicate world tap counted twice')
    return reports


def accepted_screens(path):
    value=read(path);require(value.get('reviewed') is True,'Explicit manual visual review required')
    entries=value.get('screenshots',[]);require(isinstance(entries,list) and entries,'Accepted screenshots missing')
    result=[];names=set()
    for entry in entries:
        require(isinstance(entry,dict) and entry.get('accepted') is True,'Screenshot not explicitly accepted')
        p=local(entry['path']);require(p.is_relative_to(QA) and p.is_file() and p.suffix.lower()=='.png' and p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'),'Invalid/out-of-scope accepted PNG')
        rec=record(p);require(rec['path'] not in names and (not entry.get('sha256') or entry['sha256']==rec['sha256']),'Duplicate/changed accepted screenshot')
        names.add(rec['path']);rec['accepted']=True
        if entry.get('notes'):rec['notes']=str(entry['notes'])
        result.append(rec)
    observations=value.get('observations',[]);limitations=value.get('limitations',[])
    require(isinstance(observations,list) and isinstance(limitations,list),'Manual observations/limitations must be lists')
    return result,observations,limitations


def assemble(args):
    candidate=digest(args.apk)
    require(re.fullmatch('[a-f0-9]{64}',args.expected_sha256) and candidate==args.expected_sha256,'APK differs from explicit expected candidate')
    paths={key:resolve_raw(getattr(args,key)) for key in RAW};raw={key:passing(path,candidate) for key,path in paths.items()}
    code=passing(QA/'code-checks.json',candidate);package=passing(QA/'package-verification.json',candidate)
    tests=code.get('tests',[])
    require(tests and len({t.get('name') for t in tests})==len(tests) and all(t.get('passed') is True and t.get('exitCode')==0 for t in tests),'Source checks failed/incomplete')
    require(h['REQUIRED_SOURCE_TESTS']<={t['name'] for t in tests},'Required status/world/mode/Back source checks missing')
    require(next(t for t in tests if t['name']=='test-12-world-taps.cjs').get('args')==['--source'],'World geometry source check must use input-free --source mode')
    require(package.get('version')=='0.12' and package.get('baselineAPK_SHA256')==h['FROZEN']['Warzone-Towers-0.11.apk'],'Wrong package/fallback identity')
    require(all(package.get(k) is True for k in ('compiledEngineUnchanged','duelPayloadUnchanged','duelScenarioUnchanged','nativeAndroidSourceUnchanged','towersMapsRulesUnchanged','towersObserverOnlyDataChange')),'Package preservation proof missing')
    current=package['sourceFiles']+package['nativeSourceFiles']+package['duelSourceFiles']+[package['observerSource']]+code.get('sourceFiles',[])+package['towersPayloadVerification']['appendSources']
    for entry in current:require(digest(local(entry['path']))==entry['sha256'],'Source changed since verification: '+entry['path'])
    journey=raw['journey'];require(journey.get('seeded') is False,'Ordinary status/gameplay journey must use an unmodified native setup')
    checked(journey,{'footerStatus','nativeFacilityIdentity','ordinaryProduction','constructionQueuePreserved','savesAndInputRestored'},'ordinary status/gameplay')
    native_gameplay(journey)
    continuation_limits=continuation(journey,candidate)
    five=raw['five'];require(five.get('seeded') is True and five.get('fixtureDisclosure'),'5/5/5 setup disclosure missing')
    require(five.get('nativeFacilityCounts')=={'labs':5,'vehicleFactories':5,'cyborgFactories':5},'Actual native5/5/5 counts missing')
    checked(five,{'fiveLabs','tenFactories','compactStatusLayout','footerStatus','nativeFacilityIdentity','savesAndInputRestored'},'max-facility status/selection')
    max_facilities(five)
    nested=world_cases(raw['world'],candidate)
    checked(raw['world'],{'worldFacilityOpeningBothMaps','nativeFacilityIdentity','worldInputModesPreserved'},'world taps/input modes')
    back=raw['back'];checked(back,{'polishedBlackWhiteNativeStyle','realSystemBackCancel','cancelReturnFreshBattle','phoneDesignsAndSavePreserved'},'actual native Back/menu return')
    require(len(back.get('navigationEvents',[]))>=3 and all(e.get('source')=='actual-SystemUI-button' and e.get('pixels',{}).get('ready') is True for e in back['navigationEvents']),'Observed actual Android SystemUI Back buttons missing')
    back_limits=back_continuation(back,candidate)
    checked(raw['duel'],{'duelPreserved'},'retained Duel smoke')
    design=args.design_qa.resolve();accepted=args.accepted.resolve()
    require(design.is_relative_to(ROOT) and design.is_file() and accepted.is_relative_to(QA),'Current design review/acceptance outside project QA')
    text=design.read_text(encoding='utf-8');heading=next((line for line in text.splitlines() if line.startswith('# ')),'');result=re.search(r'final result:\s*(passed|blocked|failed)',text,re.I)
    require('0.12' in heading and candidate in text.lower() and result and result.group(1).lower()=='passed','Visual review historical/blocked/failed/wrong APK')
    screens,observations,extra_limits=accepted_screens(accepted)
    now=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    limitations=[
        'Checks ran on the exact delivery APK in the owned Android emulator; physical-handset GPU/FPS and audio were not newly verified.',
        'The existing software-emulator black-terrain limitation remains. The compiled engine, official/accepted data prefix, map/rule contents and complete Duel package are preserved; only the indexed read-only Towers facility/production observer changes.',
        'The five-lab/five-vehicle/five-cyborg setup is a disclosed complete native save with added completed facilities. Real native IDs, queues, status pages and input are checked; this does not claim ordinary construction of all added facilities.',
        'Ordinary production, construction/queues and save/input restoration use a separate unmodified native setup. No complete 30-wave victory or new Duel balancing campaign was rerun for this status/interface change.',
        'Factory status uses observed native activity/current items and queue data. No production ETA or percentage is invented.',
    ]+continuation_limits+back_limits+extra_limits
    fixtures=[{'path':paths['five'].relative_to(ROOT).as_posix(),'seeded':True,'disclosure':five['fixtureDisclosure']}]
    sources=[record(p) for p in paths.values()]+nested
    emulator={'passed':True,'candidateAPK_SHA256':candidate,'installedAPK_SHA256':candidate,'version':'0.12','package':'com.rbabbit.warzonetowers.lab','emulatorTesting':True,'gameplayTesting':True,'recordedUTC':now,'checks':{k:True for k in h['EMULATOR_CHECKS']},'sourceReports':sources,'fixtureDisclosures':fixtures,'limitations':limitations,
              'method':'Exact-installed-APK ordinary/footer, disclosed max-facility, real native-mesh taps on both maps, actual Android Back and retained Duel reports. Source checks alone are not gameplay evidence.'}
    visual={'passed':True,'candidateAPK_SHA256':candidate,'reviewed':True,'recordedUTC':now,'reviewInput':record(accepted),'designQA':record(design),'screenshots':screens,'observations':observations,'limitations':limitations}
    excluded={str((QA/name).resolve()) for name in OUTPUTS|{'code-checks.json','package-verification.json'}}|{str(p.resolve()) for p in paths.values()}|{str(local(r['path']).resolve()) for r in nested}|{str(accepted)}
    diagnostics=[record(p) for p in sorted(QA.rglob('*.json')) if str(p.resolve()) not in excluded]
    links={key:path.relative_to(QA).as_posix() for key,path in paths.items()}
    report=f'''# Warzone Towers 0.12 — live facility status and world pages

Exact installed APK: `{candidate}`. The compact Towers interface adds current research/production status and opens the complete existing Research or Factory page for the owned facility touched in the battlefield. Selection is correlated with actual native facility IDs. The Android icon/name and Return confirmation are retained.

The [ordinary status journey]({links['journey']}) records live facility status plus normal production, construction queues and save/input restoration. The [max-facility journey]({links['five']}) uses the disclosed complete-native-save setup for five laboratories, five vehicle factories and five cyborg factories at normal and compact/enlarged profiles. The [world-tap index]({links['world']}) links individual real mesh-tap reports for Research and vehicle factories on both maps, plus a cyborg factory. Native stock menus and unrelated unit/build input must remain intercepted or preserved as appropriate.

Where an ordinary journey is a documented continuation, its original failed report remains a hashed diagnostic. Retained passing production/status steps and the later real manual-truck construction steps are distinguished; this does not claim an uninterrupted run or a fix to the unchanged automatic truck picker.

The [actual Android Back journey]({links['back']}) records Cancel, confirmed Return and a fresh battle with phone designs/saves retained. The [retained Duel smoke]({links['duel']}) checks the deferred mode with its original payload and interface. The [manual visual review]({os.path.relpath(design,QA).replace(chr(92),'/')}) and accepted screenshots are separate from source checks.

Package verification checks the unchanged compiled program outside literal VFS metadata, unchanged WASM, the complete accepted Towers data prefix, exact supported append/reindex inputs and the single indexed observer-script delta. All other indexed Towers map/rule/data files and the complete Duel payload are exact. The original 0.11 APK/source, older fallbacks, immutable 0.9 GitHub benchmark and separate v6.4 remain preserved. Complete-source delivery still requires streaming archive CRC/SHA readback.

Earlier failed/preparation reports are retained as diagnostics and excluded from passing claims.

Limitations:

'''+''.join('- '+str(item)+'\n' for item in limitations)+'\nSeeded facility disclosure:\n\n- '+five['fixtureDisclosure']+'\n'
    (QA/'emulator-verification.json').write_text(json.dumps(emulator,indent=2)+'\n',encoding='utf-8')
    (QA/'visual-review.json').write_text(json.dumps(visual,indent=2)+'\n',encoding='utf-8')
    (QA/'REPORT.md').write_text(report,encoding='utf-8')
    reports=[record(QA/name) for name in ('package-verification.json','code-checks.json','emulator-verification.json','visual-review.json')]
    gate={'passed':True,'candidateAPK_SHA256':candidate,'version':'0.12','package':'com.rbabbit.warzonetowers.lab','emulatorTesting':True,'gameplayTesting':True,'visualReview':True,'recordedUTC':now,'reports':reports,'supportingReports':diagnostics,'reportMarkdown':record(QA/'REPORT.md'),'limitations':limitations,'fixtureDisclosures':fixtures}
    (QA/'DELIVERY.json').write_text(json.dumps(gate,indent=2)+'\n',encoding='utf-8')
    return {'passed':True,'candidateAPK_SHA256':candidate,'rawReports':len(sources),'acceptedScreenshots':len(screens),'supportingDiagnostics':len(diagnostics)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,required=True)
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--accepted',type=Path,required=True)
    parser.add_argument('--design-qa',type=Path,default=ROOT/'design-qa.md')
    for key,default in RAW.items():parser.add_argument('--'+key,default=default)
    args=parser.parse_args();print(json.dumps(assemble(args),indent=2))


if __name__=='__main__':main()
