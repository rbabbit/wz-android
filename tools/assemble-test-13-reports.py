"""Assemble actual Towers 0.13 Factory/guide evidence after manual review.

No emulator input, screenshot acceptance, source packaging or publication occurs
here. Exact-APK raw reports and current source/package proof must already pass.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import json
import os
import re
import runpy

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/test-13'
h=runpy.run_path(str(ROOT/'tools/verify-test-13-package.py'),run_name='release13_assembly')
digest,read,require,local=(h[n] for n in ('digest','read','require','local'))
RAW={'factory':'final-factory/factory.json','max':'final-max/max.json',
     'navigation':'final-navigation/navigation.json','duel':'final-duel/smoke.json'}
OUTPUTS={'emulator-verification.json','visual-review.json','DELIVERY.json','REPORT.md'}


def record(path):return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def identity(value):return value.get('candidateAPK_SHA256') or value.get('identity',{}).get('candidateAPK_SHA256')


def passing(path,candidate):
    require(path.is_file(),'Required evidence missing: '+str(path));value=read(path)
    require(value.get('passed') is True and identity(value)==candidate,'Failed/wrong-APK evidence: '+str(path))
    require(not any(value.get(k) for k in ('failure','cleanupFailure','recoveryFailure')),'Unresolved raw failure: '+str(path))
    after=value.get('afterIdentity',{})
    require(not after or after.get('candidateAPK_SHA256')==candidate,'Installed APK changed during check')
    if value.get('seeded') is True:require(value.get('fixtureDisclosure'),'Seeded fixture disclosure missing')
    return value


def checked(value,keys,label):
    require(all(value.get('checks',{}).get(k) is True for k in keys),'Missing '+label+' checks: '+str(sorted(keys)))


def navigation_evidence(value,candidate):
    controls={item.get('id') for item in value.get('navigation',[])}
    require('blocknight-base' in controls and not controls&{'blocknight-zoom-close','blocknight-zoom-battle','blocknight-zoom-map'},'Actual Towers header does not retain BASE alone from camera controls')
    base=value.get('base',{});before=base.get('before',{}).get('touch',{});after=base.get('after',{})
    require(after.get('ack',{}).get('distance')==0 and after.get('touch',{}).get('zoomCommandWrites')==before.get('zoomCommandWrites',-2)+1,'Actual native BASE acknowledgement/one position command missing')
    for key in ('zoomWheelEvents','zoomPresetSelections','lastZoomDistance'):
        require(after['touch'].get(key)==before.get(key),'BASE changed a retained camera zoom value: '+key)
    cycles=value.get('helpCycles',[])
    require(len(cycles)>=3 and {c.get('viaBack') for c in cycles}=={False,True},'Normal/compact/restored Help and both Back routes missing')
    for cycle in cycles:
        first=cycle.get('before',{});last=cycle.get('after',{});returned=cycle.get('returned',{})
        require(first.get('title')=='HOW TO PLAY' and first.get('closeHit') is True and first.get('backHit') is True,'Guide title/accessible fixed actions missing')
        scroll=last.get('scroll',{});require(scroll.get('top',-1)>0 and scroll.get('top',-1)+scroll.get('client',0)>=scroll.get('height',float('inf'))-3,'Actual guide body was not scrolled to its final section')
        section=last.get('lastSection',{});body=last.get('content',{})
        require(section.get('height',0)>0 and section.get('bottom',float('inf'))<=body.get('bottom',0)+2 and section.get('bottom',0)>body.get('top',float('inf')) and section.get('top',float('inf'))<body.get('bottom',0),'Actual final guide section remains outside the scroll body')
        require(returned.get('inert')==[False,False] and returned.get('scroll')==[0,0,0,0] and returned.get('touch',{}).get('heldKeys')==[] and returned.get('session',{}).get('menuRequested') is False,'Guide return did not restore host/native input')
    compact=value.get('compact',{})
    require(compact.get('actual',{}).get('device')==[854,480] and compact.get('profile',{}).get('fontScale')==1.3 and compact.get('profile',{}).get('commandScale')==1.4 and compact.get('restored',{}).get('device')==[1080,600],'Actual enlarged compact guide profile/restoration missing')
    require(len(value.get('pans',[]))>=3 and all(p.get('advanced',-1)>p.get('before',{}).get('clock',float('inf')) and p.get('before',{}).get('view',{}).get('matrix')!=p.get('after',{}).get('view',{}).get('matrix') for p in value['pans']),'Real native camera input after every Help return missing')
    footer=value.get('footer',[])
    require({f.get('status',{}).get('kind') for f in footer}=={'research','production'} and all(f.get('status',{}).get('open') is True and f.get('page')=='' and f.get('researchOpen') is False and f.get('native')=='' for f in footer),'Current-work footers no longer stay informational')
    cases=value.get('worldCases',[])
    require({case.get('kind') for case in cases}=={'research','factory'},'Retained actual lab/factory world taps missing')
    for case in cases:
        require(case.get('passed') is True and identity(case)==candidate and case.get('nativeLeftDown')==[] and case.get('point'),'World facility tap failed/wrong APK/forwarded native press')
        native_id=case.get('nativeId');selected=case.get('after',{})
        if case['kind']=='research':
            research=selected.get('research',{});labs=research.get('labs',[]);index=research.get('activeLab')
            require(type(index) is int and 0<=index<len(labs) and labs[index].get('id')==native_id and research.get('open') is True,'World tap selected another native lab')
        else:require(selected.get('factoryId')==native_id and selected.get('commands',{}).get('page')=='factory','World tap selected another native factory')
    require({'queue','menu','factory','battle'}<=value.get('factoryBack',{}).keys(),'Nested queue/menu/Factory/battle Back evidence missing')
    confirm=value.get('returnConfirm',{})
    require(value.get('checks',{}).get('returnConfirmationCancelled') is True and confirm.get('title',{}).get('text')=='Return to main menu?' and type(confirm.get('restoredClock')) is int,'Actual native confirmation/Cancel/input check missing')
    require(value.get('libraryUnchanged') is True,'Navigation/guide changed the private phone library')


def maximum_evidence(value):
    ids=value.get('nativeIds',{})
    require(set(ids)=={'labs','vehicle','cyborg'} and all(len(v)==5 and len(set(v))==5 for v in ids.values()) and len(set(ids['vehicle']+ids['cyborg']))==10,'Unique actual native 5+5 factory IDs missing')
    orders=value.get('productionOrders',[])
    require({o.get('kind') for o in orders}=={'vehicle','cyborg'},'Actual fifth-family production actions missing')
    for order in orders:
        require(order.get('factoryId')==ids[order['kind']][4] and order.get('quantity')==1 and order.get('recipeKey'),'Fifth factory/current recipe identity mismatch')
        native=order.get('nativeFactory',{});row=order.get('rowBefore',{})
        require(type(order.get('cost')) in (int,float) and order['cost']>0 and native.get('id')==order['factoryId'] and native.get('active',{}).get('design',{}).get('cost')==order['cost'] and row.get('key')==order['recipeKey'] and row.get('disabled') is False and row.get('produceLabel')=='PRODUCE 1','Native accepted current cost/recipe action missing')
    profiles=value.get('profiles',[])
    require({'normal','compact'}<={p.get('name') for p in profiles},'Actual normal and enlarged compact Factory profiles missing')
    for profile in profiles:
        require(profile.get('actual',{}).get('device')==profile.get('device'),'Screenshot/WebView Factory profile differs from requested size')
        native_fixture=profile.get('nativeFixture')
        if native_fixture:
            require(native_fixture.get('counts')==value['nativeFacilityCounts'] and native_fixture.get('ids')==ids and native_fixture.get('fileSHA256')==value.get('fixture',{}).get('sha256') and native_fixture.get('clock',float('inf'))<270000,'Per-profile native fixture restore lost facility identity/readiness')
            native_save=local(native_fixture.get('nativeSave',''))
            require(native_save.is_relative_to(QA),'Native profile-ready save outside scoped QA')
        if profile['name']=='compact':require(profile.get('device')==[854,480] and profile.get('font')=='1.3' and profile.get('scale')==1.4,'Actual enlarged compact Factory size missing')
        families=profile.get('families',[]);require({f.get('kind') for f in families}=={'vehicle','cyborg'},'Both actual factory families missing from a profile')
        for family in families:
            kind=family['kind'];selected=family.get('selections',[]);proof=family.get('proof',{})
            require([s.get('id') for s in selected]==ids[kind] and all(s.get('family')==kind and s.get('hit') is True and s.get('selected') is True and s.get('hiddenNativeId')==s['id'] for s in selected),'Every real native factory selector must be reached/selected')
            require([f.get('id') for f in proof.get('facilities',[])]==ids[kind] and proof.get('selected')==ids[kind][4] and proof.get('nativeMenu')=='' and proof.get('stockControl') is False,'Full page selected wrong native family/stock control')
            recipes=proof.get('recipes',[]);keys=[r.get('key') for r in recipes]
            require(recipes and all(keys) and len(set(keys))==len(keys),'Duplicate or missing actual hardware recipe rows')
            require(all(t.get('hit') is True for t in proof.get('tabs',[])) and all(q.get('hit') is True for q in proof.get('quantityButtons',[])),'Family/quantity controls clipped or covered')
            quantity=family.get('quantity',[])
            require([q.get('count') for q in quantity]==[1,5,10,20] and all(q.get('selected')==ids[kind][4] and q.get('active')==[q['count']] and q.get('rowLabels') and all(row.get('label')=='PRODUCE '+str(q['count']) for row in q['rowLabels']) for q in quantity),'Actual Produce 1/5/10/20 labels/selection mismatch')
            require(family.get('beforePoll',{}).get('selected')==ids[kind][4] and family.get('afterPoll',{}).get('selected')==ids[kind][4],'Native polls lost current factory identity')
            frame=proof.get('frame',{});before=profile.get('beforeFrame',{})
            require(all(frame.get(k)==before.get(k) for k in ('x','y','width','height')),'Factory resized the engine viewport')
            for key in ('rosterSwipe','rowSwipe'):
                swipe=family.get(key,{})
                require(swipe.get('needed') is False or (swipe.get('needed') is True and swipe.get('after',{}).get('top',0)>1),'Required actual Factory scrolling did not move')
        back=profile.get('back',{})
        require(all(back.get(k) is True for k in ('nestedQueueBack','nestedMenuBack','fullBackToBattle','topBackClosesExpandedQueue')) and back.get('reopened',{}).get('selected')==back.get('selected'),'Nested/full Factory Back or reopened native identity missing')
    require(value.get('phoneBefore')==value.get('phoneAfter') and isinstance(value.get('phoneBefore'),str),'Factory operations changed private phone library bytes')
    completed=value.get('completed',[]);native=value.get('nativeUnitRecords',[])
    require(all(any(d.get('id')==unit.get('id') for d in native) for unit in completed),'Sampled maximum-factory completions lack actual native records')
    require(value.get('restoredViewport',{}).get('device'),'Original device profile not restored after max Factory checks')


def prior_diagnostic(value,candidate):
    reference=value.get('priorDiagnostic')
    if not reference:return []
    path=local(reference.get('path',''))
    require(path.is_relative_to(QA) and digest(path)==reference.get('sha256'),'Earlier maximum-fixture diagnostic missing/changed')
    previous=read(path)
    require(previous.get('passed') is False and identity(previous)==candidate and reference.get('disclosure'),'Earlier failed fixture must remain a disclosed diagnostic for the same candidate')
    return [str(reference['disclosure'])]


def navigation_continuation(value,candidate):
    continuation=value.get('continuation')
    if not continuation:return []
    require(isinstance(continuation,dict) and continuation.get('disclosure'),'Navigation continuation disclosure missing')
    reference=value.get('priorDiagnostic',{});path=local(reference.get('path',''))
    require(path.is_relative_to(QA) and digest(path)==reference.get('sha256'),'Navigation continuation diagnostic missing/changed')
    previous=read(path)
    require(identity(previous)==candidate and previous.get('passed') is False and previous.get('failure') and reference.get('failure')==previous['failure'],'Navigation continuation did not retain its actual failed same-APK report')
    required={'navigation','base','helpCycles','helpSwipeAttempts','pans','compact','footer','library'}
    require(required<=set(continuation.get('retained',[])) and all(value.get(key)==previous.get(key) for key in required),'Earlier passing navigation/Help evidence changed during continuation')
    require(all(value.get('checks',{}).get(key) is True for key,passed in previous.get('checks',{}).items() if passed is True),'Earlier passing navigation checks were lost')
    epoch=continuation.get('resumedEpoch',{})
    require(epoch.get('session') and type(epoch.get('gameTime')) is int and epoch['gameTime']>0 and epoch.get('seeded') is False and identity(epoch.get('identity',{}))==candidate,'Resumed unmodified native epoch/installed identity missing')
    initial=previous.get('initial',{}).get('state',{})
    require(epoch.get('mapWidth')==initial.get('mapWidth') and epoch.get('mapHeight')==initial.get('mapHeight') and epoch.get('mapWidth',0)>0 and epoch.get('mapHeight',0)>0,'Resumed native map differs from retained guide/navigation evidence')
    return [str(continuation['disclosure'])]


def recipe_key(design):
    equipment=design.get('turrets') or design.get('weapons') or [design[k] for k in ('construct','repair','brain','ecm','sensor') if design.get(k) and 'null' not in str(design[k]).lower()][:1]
    return json.dumps([design.get('body'),design.get('propulsion'),equipment],separators=(',',':'),ensure_ascii=False)


def ordinary_evidence(value):
    ids=value.get('nativeFactoryIds',[]);selected=value.get('factorySelections',[])
    require(len(ids)==2 and len(set(ids))==2 and [s.get('id') for s in selected]==ids and all(s.get('hit') is True and s.get('selected') is True and s.get('hiddenNativeId')==s['id'] for s in selected),'Two genuine ordinary factory selections missing')
    catalogues=value.get('catalogues',[])
    require(len(catalogues)==2 and all(p.get('recipes') and len({r.get('key') for r in p['recipes']})==len(p['recipes']) and p.get('stockControl') is False for p in catalogues),'Actual ordinary canonical hardware catalogue proof missing')
    quantities=value.get('quantities',[])
    require([q.get('count') for q in quantities]==[1,5,10,20] and all(q.get('selected')==ids[1] and q.get('active')==[q['count']] and q.get('rows') and all(row.get('label')=='PRODUCE '+str(q['count']) for row in q['rows']) for q in quantities),'Actual ordinary quantity labels/selected native factory mismatch')
    require(isinstance(value.get('phoneBefore'),str) and value.get('phoneAfter')==value['phoneBefore'] and value.get('library',{}).get('phone')==value['phoneBefore'] and value.get('libraryUnchanged') is True,'Factory actions changed private phone library bytes')
    phone=json.loads(value['phoneBefore'] or '{"designs":[]}');designs=phone.get('designs',[])
    require(value['library'].get('domCount')==len(designs),'Actual Blueprint Library does not contain the saved phone designs')
    save=value.get('saveToPhone',{})
    if save.get('newSaveTested') is True:
        added=save.get('added',{});persisted=save.get('persisted',{}).get('designs',[])
        require(added.get('id') and save.get('removedOnlyNewId')==added['id'] and save.get('restoredOriginalPhoneBytes') is True and len(persisted)==len(designs)+1 and {d.get('id') for d in persisted}=={d.get('id') for d in designs}|{added['id']} and recipe_key(added)==save.get('selectedKey'),'New actual phone-save/library roundtrip missing or altered an existing design')
    else:
        require(save.get('newSaveTested') is False and save.get('reason') and save.get('menu',{}).get('saves')==[] and save.get('selectedKey') in {recipe_key(d) for d in designs},'Unexercised phone-save path must identify its already-saved native recipe')
    orders=value.get('orders',[]);require(len(orders)>=6,'Ordinary UI production/FIFO/clear orders missing')
    for order in orders:
        reply=order.get('reply',{});accepted=order.get('accepted',[])
        require(order.get('factoryId') in ids and order.get('count') in {1,5} and type(order.get('cost')) in (int,float) and order['cost']>0 and reply.get('ok') is True and reply.get('result',{}).get('factoryId')==order['factoryId'] and reply['result'].get('count')==order['count'],'Ordinary Produce action lacks native accepted factory/count/cost')
        require(len(order.get('jobIds',[]))==order['count'] and accepted and all(job.get('id') in order['jobIds'] and job.get('design',{}).get('cost')==order['cost'] and recipe_key(job['design'])==order.get('recipeKey') for job in accepted),'Accepted native jobs do not match the touched recipe/quantity')
    fifo=value.get('fifo',{});expected=fifo.get('expectedKeys',[])
    require(len(expected)==3 and expected[0]==expected[2] and expected[0]!=expected[1] and fifo.get('actualKeys')==expected and len(fifo.get('ordered',[]))==3,'Actual native A→B→A completion FIFO missing')
    records=fifo.get('recipes',[]);native_ids={d.get('id') for d in fifo.get('nativeUnits',[])}
    require(all(unit.get('id') in native_ids and any(d.get('id')==unit['id'] and d.get('key')==key for d in records) for unit,key in zip(fifo['ordered'],expected)),'FIFO completions lack matching native droid recipe records')
    require(fifo.get('parallel',{}).get('factoryId')==ids[1] and any(u.get('factoryId')==ids[1] and u.get('id') in native_ids for u in fifo.get('finished',[])),'Independent second native factory completion missing')
    clear=value.get('clear',{});active=clear.get('activeOrder',{});waiting=clear.get('waitingOrder',{})
    require(active.get('count')==1 and waiting.get('count')==5 and clear.get('activeBefore',{}).get('id') in active.get('jobIds',[]) and clear.get('queueAfter')==[],'Clear waiting lacks a genuine active item/five waiting jobs/empty resulting queue')
    before=[f for f in clear.get('before',{}).get('factories',[]) if f.get('id')==clear.get('factoryId')]
    require(len(before)==1 and {job.get('id') for job in before[0].get('queue',[])}==set(waiting.get('jobIds',[])),'Actual five waiting native IDs missing before Clear')
    completions=clear.get('finished',[]);recipes=clear.get('recipes',[]);native_ids={d.get('id') for d in clear.get('nativeUnits',[])}
    require(any(u.get('factoryId')==clear.get('factoryId') and u.get('id') in native_ids and any(d.get('id')==u['id'] and d.get('key')==active.get('recipeKey') for d in recipes) for u in completions),'Protected active item did not complete as a genuine native unit')
    after=clear.get('activeAfter')
    require((isinstance(after,dict) and after.get('id')==clear['activeBefore']['id']) or any(u.get('factoryId')==clear.get('factoryId') and u.get('id') in native_ids for u in completions),'Clear replaced/cancelled the observed active item without native completion')
    back=value.get('back',{})
    require(all(back.get(k) is True for k in ('nestedQueueBack','nestedMenuBack','fullBackToBattle','topBackClosesExpandedQueue')) and back.get('reopened',{}).get('selected')==back.get('selected'),'Ordinary nested/full Factory Back or native-ID reopen missing')


def resolve_raw(value):
    p=Path(value);p=p.resolve() if p.is_absolute() else (QA/p).resolve()
    require(p.is_relative_to(QA.resolve()),'Raw report outside scoped QA: '+str(p));return p


def accepted_screens(path):
    value=read(path);require(value.get('reviewed') is True,'Explicit manual review required')
    entries=value.get('screenshots',[]);require(isinstance(entries,list) and entries,'Accepted screenshots missing')
    result=[];names=set()
    for entry in entries:
        require(isinstance(entry,dict) and entry.get('accepted') is True,'Screenshot not explicitly accepted')
        p=local(entry['path'])
        require(p.is_relative_to(QA) and p.suffix.lower()=='.png' and p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'),'Invalid/out-of-scope accepted PNG')
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
    require(h['REQUIRED_SOURCE_TESTS']<={t['name'] for t in tests},'Required Factory/guide/status/world/mode source checks missing')
    require(next(t for t in tests if t['name']=='test-12-world-taps.cjs').get('args')==['--source'],'World geometry source check must use input-free --source mode')
    require(package.get('version')=='0.13' and package.get('baselineAPK_SHA256')==h['FROZEN']['Warzone-Towers-0.12.apk'],'Wrong package/fallback identity')
    require(all(package.get(k) is True for k in ('compiledEngineUnchanged','towersAndDuelPayloadsUnchanged','mapsAndScenariosUnchanged','nativeAndroidSourceUnchanged','researchAndStatusAssetsUnchanged')),'Frozen runtime/preservation proof missing')
    for entry in package['sourceFiles']+package['nativeSourceFiles']+package['duelSourceFiles']+code.get('sourceFiles',[]):
        require(digest(local(entry['path']))==entry['sha256'],'Source changed since verification: '+entry['path'])
    factory=raw['factory'];require(factory.get('seeded') is False,'Independent production must use an unmodified native setup')
    checked(factory,{'factoryOptionThree','nativeFactoryIdentity','catalogueDeduplicated','quantityAndSavedLibrary',
                     'nativeProductionFIFO','clearWaitingKeepsActive','fullQueueAndBack'},'ordinary Factory/native production')
    ordinary_evidence(factory)
    maximum=raw['max'];require(maximum.get('seeded') is True and maximum.get('fixtureDisclosure'),'Maximum-facility native-save disclosure missing')
    require(maximum.get('nativeFacilityCounts')=={'labs':5,'vehicleFactories':5,'cyborgFactories':5},'Actual native5/5/5 counts missing')
    checked(maximum,{'tenFactories','nativeFactoryIdentity','compactFactoryLayout','catalogueDeduplicated','quantityAndSavedLibrary','fullQueueAndBack'},'normal/compact maximum Factory')
    maximum_evidence(maximum)
    fixture_limits=prior_diagnostic(maximum,candidate)
    checked(raw['navigation'],{'towersNavigationBaseOnly','personalHowTo','statusAndWorldRetained','fullQueueAndBack'},'navigation/guide/retained status and world taps')
    navigation_evidence(raw['navigation'],candidate)
    navigation_limits=navigation_continuation(raw['navigation'],candidate)
    checked(raw['duel'],{'duelPreserved'},'retained Duel smoke')
    design=args.design_qa.resolve();accepted=args.accepted.resolve()
    require(design.is_relative_to(ROOT) and design.is_file() and accepted.is_relative_to(QA),'Current manual review outside project/scoped QA')
    text=design.read_text(encoding='utf-8');heading=next((line for line in text.splitlines() if line.startswith('# ')),'');result=re.search(r'final result:\s*(passed|blocked|failed)',text,re.I)
    require('0.13' in heading and candidate in text.lower() and result and result.group(1).lower()=='passed','Visual comparison historical/blocked/failed/wrong APK')
    screens,observations,extra_limits=accepted_screens(accepted)
    now=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    library_limits=[]
    if factory.get('saveToPhone',{}).get('newSaveTested') is False:
        library_limits.append('Every available ordinary native recipe already had a saved phone alias. The actual saved-state menu, library, hardware deduplication and unchanged phone bytes were checked; adding a new phone alias from this Factory menu was not newly exercised.')
    guide_limits=[]
    if any(c.get('after',{}).get('lastText',{}).get('bottom')!=c.get('after',{}).get('lastSection',{}).get('bottom') for c in raw['navigation'].get('helpCycles',[])):
        guide_limits.append('The QA paragraph selector could match an earlier Help paragraph. Final guide evidence uses the recorded actual final-section bounds at maximum body scroll and manually reviewed bottom screenshots; this is an evidence-selector correction, not a game change.')
    limitations=[
        'Checks ran on the exact delivery APK in the owned Android emulator. Physical-handset GPU/FPS and audio were not newly verified.',
        'The maximum-facility case reuses a disclosed complete native save with added completed facilities. Actual native selection/layout is checked; this does not claim ordinary construction of all added facilities.',
        'Normal-cost production, waiting FIFO and clearing waiting work are checked separately on an unmodified native setup. Source tests and screenshots alone are not production proof.',
        'The existing software-emulator black-terrain limitation remains. All Towers/Duel program, WASM, data, maps, scenarios and Android source bytes are frozen to 0.12.',
        'No full 30-wave victory, new Duel balancing campaign or unrelated automatic truck-picker repair was performed for this Factory/navigation/guide update.',
    ]+fixture_limits+navigation_limits+library_limits+guide_limits+extra_limits
    fixture={'path':paths['max'].relative_to(ROOT).as_posix(),'seeded':True,'disclosure':maximum['fixtureDisclosure']}
    sources=[record(p) for p in paths.values()]
    emulator={'passed':True,'candidateAPK_SHA256':candidate,'installedAPK_SHA256':candidate,'version':'0.13','package':'com.rbabbit.warzonetowers.lab','emulatorTesting':True,'gameplayTesting':True,'recordedUTC':now,'checks':{k:True for k in h['EMULATOR_CHECKS']},'sourceReports':sources,'fixtureDisclosures':[fixture],'limitations':limitations,
              'method':'Passed exact-installed-APK ordinary Factory/native production, disclosed maximum-facility profiles, guide/navigation/retained status and world tap checks, and retained Duel smoke. Source checks alone are not gameplay evidence.'}
    visual={'passed':True,'candidateAPK_SHA256':candidate,'reviewed':True,'recordedUTC':now,'reviewInput':record(accepted),'designQA':record(design),'screenshots':screens,'observations':observations,'limitations':limitations}
    excluded={str((QA/name).resolve()) for name in OUTPUTS|{'code-checks.json','package-verification.json'}}|{str(p.resolve()) for p in paths.values()}|{str(accepted)}
    diagnostics=[record(p) for p in sorted(QA.rglob('*.json')) if str(p.resolve()) not in excluded]
    links={key:path.relative_to(QA).as_posix() for key,path in paths.items()}
    report=f'''# Warzone Towers 0.13 — Factory and personal how-to guide

Exact installed APK: `{candidate}`. The full Towers Factory page uses the selected Option 3 layout, actual native factory IDs, the real design catalogue, quantity controls, current production and waiting queues. The phone blueprint library and normal game production operations remain in use. The Towers header retains BASE and removes NEAR, BATTLE and MAP. HELP explains this app's controls and game flow using the local game/code.

The [ordinary Factory journey]({links['factory']}) records actual normal-cost production, waiting FIFO, clear-waiting behaviour, quantity/design-library actions and full-queue/Back transitions. The [maximum-facility journey]({links['max']}) uses the disclosed native save for five vehicle and five cyborg factories at normal and compact/enlarged profiles. The [navigation/guide journey]({links['navigation']}) records BASE-only navigation, personal how-to content/returns, nested Factory Back handling and retained current-work status/world facility opening. The [Duel smoke]({links['duel']}) checks its preserved legacy interface. The [manual visual review]({os.path.relpath(design,QA).replace(chr(92),'/')}) and accepted screenshots are separate from source checks.

Package verification permits only four existing UI assets and the version change. All nine Towers/Duel program/WASM/data/entry files, maps/scenarios/vendor contents, Android source/icon and Research/status assets remain exact to 0.12. The accepted 0.12 APK/source, older fallbacks, immutable 0.9 GitHub benchmark and separate v6.4 remain preserved. Complete-source delivery requires streaming archive CRC/SHA readback.

Earlier failed/preparation reports are retained as diagnostics and excluded from passing claims.

Limitations:

'''+''.join('- '+str(item)+'\n' for item in limitations)+'\nSeeded facility disclosure:\n\n- '+maximum['fixtureDisclosure']+'\n'
    (QA/'emulator-verification.json').write_text(json.dumps(emulator,indent=2)+'\n',encoding='utf-8')
    (QA/'visual-review.json').write_text(json.dumps(visual,indent=2)+'\n',encoding='utf-8')
    (QA/'REPORT.md').write_text(report,encoding='utf-8')
    reports=[record(QA/name) for name in ('package-verification.json','code-checks.json','emulator-verification.json','visual-review.json')]
    gate={'passed':True,'candidateAPK_SHA256':candidate,'version':'0.13','package':'com.rbabbit.warzonetowers.lab','emulatorTesting':True,'gameplayTesting':True,'visualReview':True,'recordedUTC':now,'reports':reports,'supportingReports':diagnostics,'reportMarkdown':record(QA/'REPORT.md'),'limitations':limitations,'fixtureDisclosures':[fixture]}
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
