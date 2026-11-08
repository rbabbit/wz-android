"""Assemble exact-APK compact Towers evidence and the reviewed page ledger.

No emulator input, screenshot acceptance or packaging occurs here. Planned
ledger rows are not passes: every required page/profile needs an actual passed
raw report, observations and manually accepted screenshots on this candidate.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import copy
import json
import re
import runpy
import struct

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/test-14'
h=runpy.run_path(str(ROOT/'tools/verify-test-14-package.py'),run_name='release14_assembly')
digest,read,require,local=(h[n] for n in ('digest','read','require','local'))
OUTPUTS={'emulator-verification.json','visual-review.json','DELIVERY.json','REPORT.md'}


def record(path):return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def identity(value):return value.get('candidateAPK_SHA256') or value.get('identity',{}).get('candidateAPK_SHA256')


def native_recipe(unit):
    parts=unit.get('parts',{});equipment=[parts[k] for k in sorted((k for k in parts if k.startswith('weapon/')),key=lambda k:int(k.split('/')[1])) if parts[k] and 'null' not in str(parts[k]).lower()]
    if not equipment:equipment=[parts[k] for k in ('construct','repair','brain','ecm','sensor') if parts.get(k) and 'null' not in str(parts[k]).lower()][:1]
    return json.dumps([parts.get('body'),parts.get('propulsion'),equipment],separators=(',',':'))


def passing(path,candidate):
    require(path.is_file(),'Required report missing: '+str(path));value=read(path)
    require(value.get('passed') is True and identity(value)==candidate,'Failed/wrong-APK report: '+str(path))
    require(not any(value.get(k) for k in ('failure','cleanupFailure','recoveryFailure')),'Unresolved report failure: '+str(path))
    after=value.get('afterIdentity',{})
    require(not after or after.get('candidateAPK_SHA256')==candidate,'Installed APK changed during report')
    if value.get('seeded') is True:require(value.get('fixtureDisclosure'),'Seeded native setup must be disclosed')
    return value


def asset_parity_record(ref,candidate):
    path=local(ref.get('path',''));require(path.is_relative_to(QA) and path.is_file() and digest(path)==ref.get('sha256'),'Native Music asset parity missing/changed')
    report=read(path);require({k:v for k,v in ref.items() if k not in {'path','sha256'}}==report and report.get('candidateAPK_SHA256')==candidate,'Asset parity content/identity changed')
    parity=runpy.run_path(str(ROOT/'tools/verify-test-14-runtime-parity.py'),run_name='release14_music_asset_parity')
    require(report==parity['verify_music'](Path(report['baselineAPK']['path']),Path(report['candidateAPK']['path']),candidate),'Independent Music-only APK/source asset parity differs')
    return report


def scroll_parity_record(ref,candidate,candidate_override=None):
    path=local(ref.get('path',''));require(path.is_relative_to(QA) and path.is_file() and digest(path)==ref.get('sha256'),'Reviewed scroll parity missing/changed')
    report=read(path);require(report.get('passed') is True and report.get('candidateAPK_SHA256')==candidate,'Wrong scroll candidate identity')
    if 'baselineAPK_SHA256' in ref:require({k:v for k,v in ref.items() if k not in {'path','sha256'}}==report,'Retained scroll parity report altered')
    parity=runpy.run_path(str(ROOT/'tools/verify-test-14-runtime-parity.py'),run_name='release14_reviewed_scroll_parity')
    if not candidate_override and digest(Path(report['candidateAPK']['path']))!=candidate:
        require(candidate==parity['R4'],'Unsupported historical scroll candidate')
        candidate_override=ROOT.parent/'fallbacks/towers-0.14-r4-diagnostic-before-music-20261108/Warzone-Towers-0.14-R4.apk'
    computed=parity['verify_scroll'](Path(report['baselineAPK']['path']),Path(candidate_override or report['candidateAPK']['path']),candidate)
    if candidate_override:computed['candidateAPK']['path']=report['candidateAPK']['path']
    require(report==computed,'Independent scroll-only APK/native contract parity differs')
    return report


def input_method_evidence(candidate):
    path=QA/'input-methods.json';value=passing(path,candidate)
    require(value.get('declaredRootInvocation',{}).get('environment')=={'WZ_QA_UI_INPUT':'trusted-cdp'} and value['declaredRootInvocation'].get('declaredBy') and value['declaredRootInvocation'].get('scope'),'Actual root input-method invocation disclosure missing')
    html=value.get('htmlControls',{})
    require(html.get('method')=='Input.dispatchTouchEvent' and html.get('durationMs')==60 and html.get('gestureSourceType')=='touch' and html.get('isTrustedObserved') is True and html.get('programmaticDOMClick') is False and html.get('experimentalCompositorGesture') is False and value.get('osInputRetained'),'Current standard HTML/OS input methods conflated or incomplete')
    ref=value.get('trustedTouchProof',{});proof_path=local(ref.get('path',''))
    require(proof_path.is_relative_to(QA) and digest(proof_path)==ref.get('sha256'),'Actual trusted touch diagnosis changed')
    proof_candidate=value.get('trustedTouchProof',{}).get('candidateAPK_SHA256',candidate)
    if proof_candidate!=candidate:require(scroll_parity_record(value.get('unchangedInputRuntimeParity',{}),candidate)['baselineAPK_SHA256']==proof_candidate,'Historical input diagnosis lacks unchanged native/WebView runtime proof')
    proof=passing(proof_path,proof_candidate);events=proof.get('events',[]);durations=[];start=end=None;clicks=0
    for event in events:
        require(event.get('trusted') is True,'Input diagnosis contains an untrusted event')
        if event.get('type')=='pointerdown':start=event['stamp']
        elif event.get('type')=='pointerup':require(start is not None,'Pointer up lacks start');end=event['stamp'];durations.append(end-start)
        elif event.get('type')=='click':require(end is not None and abs(event['stamp']-end)<=1,'Click does not match the observed pointer release');clicks+=1
    require(durations and clicks==len(durations) and all(abs(t-60)<=1 for t in durations),'Trusted actual emulator pointer/click/~60 ms proof missing')
    if html['method']=='Input.dispatchTouchEvent':require('Input.dispatchTouchEvent' in proof.get('identity',{}).get('htmlControlInput',{}).get('method',''),'Standard-touch diagnosis lacks its actual API identity')
    helper=value.get('nativeLiveHelper',{});helper_path=local(helper.get('path',''))
    require(helper.get('path')=='tools/native-live.cjs' and digest(helper_path)==helper.get('sha256'),'Executed optional-input QA helper changed')
    source=helper_path.read_text(encoding='utf-8')
    api_tokens=('Input.dispatchTouchEvent',"type:'touchStart'","type:'touchEnd'",'timestamp:startAt+.06','delay(60).then','await Promise.all')
    require(all(token in source for token in ("process.env.WZ_QA_UI_INPUT==='trusted-cdp'",'assertLabForeground();','scrollIntoView','elementFromPoint',"adb('shell','input','tap'",*api_tokens)),'Actual optional trusted/default-ADB input guards missing')
    for entry in value.get('historicalDiagnostics',[]):
        p=local(entry.get('path',''));require(p.is_relative_to(QA) and p.is_file() and digest(p)==entry.get('sha256'),'Historical QA/platform diagnosis changed')
    return record(path)


def commands_runtime_parity(value,candidate):
    """Retain R2 native evidence through the two specific reviewed UI deltas."""
    asset=asset_parity_record(value['assetParity'],candidate) if value.get('assetParity') else None
    html_candidate=asset['baselineAPK_SHA256'] if asset else candidate
    scroll=scroll_parity_record(value['uiScrollParity'],html_candidate,asset['baselineAPK']['path'] if asset else None) if value.get('uiScrollParity') else None
    intermediate=scroll['baselineAPK_SHA256'] if scroll else candidate
    proof=value.get('runtimeParity',{});declared=proof.get('declaredEvidence',{})
    path=local(declared.get('path',''))
    require(path.is_relative_to(QA) and path.is_file() and digest(path)==declared.get('sha256'),'Cross-APK parity report missing/changed')
    report=read(path)
    require(report==declared.get('report') and report.get('passed') is True and report.get('candidateAPK_SHA256')==intermediate,'Cross-APK parity report identity/content mismatch')
    parity=runpy.run_path(str(ROOT/'tools/verify-test-14-runtime-parity.py'),run_name='release14_authorized_css_parity')
    baseline=Path(report.get('baselineAPK',{}).get('path',''));current=Path(scroll['baselineAPK']['path'] if scroll else report.get('candidateAPK',{}).get('path',''))
    computed=parity['verify'](baseline,current,intermediate)
    if scroll:computed['candidateAPK']['path']=report['candidateAPK']['path']  # Historical path retained; exact R3 bytes resolved from its hash-verified copy.
    require(report==computed,'Independent full APK-member parity verification differs')
    require(proof.get('passed') is True and proof.get('previousAPK',{}).get('sha256')==report['baselineAPK_SHA256'] and proof.get('currentAPK',{}).get('sha256')==intermediate and proof.get('changedMembers')==report['changedAssets'] and proof.get('disclosure'),'Helper parity/retained identity missing')
    if scroll:
        ref=value.get('retainedNativeBaseline',{});path=local(ref.get('path',''))
        require(path.is_relative_to(QA) and digest(path)==ref.get('sha256') and ref.get('disclosure'),'Retained native-only baseline missing/changed')
        before=passing(path,intermediate)
        require(identity(ref.get('identity',{}))==intermediate and all(value.get(key)==before.get(key) for key in ('nativeProduction','nativeProductionRaw','runtimeParity')),'Native-only predecessor evidence altered or relabeled')
        current_commands_production(before,intermediate)
    return report['baselineAPK_SHA256']


def current_commands_production(value,candidate):
    proof=value.get('currentCandidateProduction',{});flags=value.get('checks',{})
    require(flags.get('currentCandidateNativeProduction') is True and proof.get('passed') is True and identity(proof)==candidate and proof.get('seeded') is False,'Current-APK short genuine production proof missing')
    factory=proof.get('factoryId');orders=proof.get('orders',[])
    require(factory and [o.get('label') for o in orders]==['active-Truck','one-waiting-MG'],'Current-APK active/waiting UI orders missing')
    prior=runpy.run_path(str(ROOT/'tools/assemble-test-13-reports.py'),run_name='release14_short_native_recipe')
    for order in orders:
        reply=order.get('reply',{});job=order.get('job',{});design=job.get('design',{})
        require(reply.get('ok') is True and reply.get('result',{}).get('factoryId')==factory and reply['result'].get('count')==1 and job.get('id')==str(reply.get('nonce'))+'-0' and order.get('cost',0)>0 and design.get('cost')==order['cost'] and prior['recipe_key'](design)==order.get('recipeKey'),'Current-APK accepted native production ID/recipe/cost mismatch')
    active,waiting=(order['job']['id'] for order in orders)
    before=next((f for f in proof.get('beforeClear',{}).get('factories',[]) if f.get('id')==factory),{})
    after=next((f for f in proof.get('afterClear',{}).get('factories',[]) if f.get('id')==factory),{})
    require(before.get('active',{}).get('id')==active and [j.get('id') for j in before.get('queue',[])]==[waiting] and after.get('queue')==[],'Current-APK Clear did not remove exactly the observed waiting job')
    finished=proof.get('finished',[]);native=proof.get('nativeUnits',[])
    require(len(finished)==len(native)==1 and finished[0].get('factoryId')==factory and finished[0].get('id')==native[0].get('id'),'Current-APK protected active item lacks one genuine native completion')
    require((after.get('active') or {}).get('id')==active or any(u.get('id')==finished[0]['id'] for u in proof.get('afterClear',{}).get('finishedUnits',[])),'Current-APK Clear replaced the protected active item')
    parts=native[0].get('parts',{});equipment=[parts[k] for k in sorted(parts,key=lambda k:int(k.split('/')[1]) if k.startswith('weapon/') else -1) if k.startswith('weapon/') and parts[k] and 'null' not in str(parts[k]).lower()]
    if not equipment:equipment=[parts[k] for k in ('construct','repair','brain','ecm','sensor') if parts.get(k) and 'null' not in str(parts[k]).lower()][:1]
    require(json.dumps([parts.get('body'),parts.get('propulsion'),equipment],separators=(',',':'))==orders[0]['recipeKey'],'Current-APK native droid recipe differs from protected active Truck')
    path=local(proof.get('nativeSave',''));require(path.is_relative_to(QA) and path.is_file(),'Current-APK F7 native completion save missing')
    save=read(path);require(native[0] in list(save.get('droid.json',{}).values()) and finished[0] in save.get('commands',{}).get('snapshot',{}).get('finishedUnits',[]),'Current-APK completion differs from its actual F7 save')


def journey_checks(values,candidate):
    """Translate the helpers' actual scoped checks, keeping native evidence."""
    result={key for value in values for key,passed in value.get('checks',{}).items() if passed is True}
    prior=runpy.run_path(str(ROOT/'tools/assemble-test-13-reports.py'),run_name='release14_native_fifo_helpers')
    commands_ok=navigation_ok=native_ok=build_ok=False
    for value in values:
        flags=value.get('checks',{})
        if flags.get('normalNativeProduction') is True:
            ref=value.get('nativeProductionRaw',{});path=local(ref.get('path',''))
            require(path.is_relative_to(QA) and digest(path)==ref.get('sha256'),'Ordinary production raw proof missing/changed')
            production_candidate=commands_runtime_parity(value,candidate) if value.get('runtimeParity') else candidate
            production=passing(path,production_candidate)
            require(value.get('nativeProduction')==production,'Ordinary production proof was altered by its UI wrapper')
            prior['ordinary_evidence'](production)
            if production_candidate!=candidate:
                if value.get('assetParity'):
                    cursor=value;seen=set()
                    while identity(cursor)==candidate:
                        ref=cursor.get('priorDiagnostic',{});source=local(ref.get('path',''));require(source.is_relative_to(QA) and source not in seen and digest(source)==ref.get('sha256'),'Retained R4 production source missing/changed/cyclic');seen.add(source);before=read(source)
                        require(value.get('currentCandidateProduction')==before.get('currentCandidateProduction'),'Retained R4 native production data changed');cursor=before
                    require(identity(before)==value['assetParity']['baselineAPK_SHA256'] and flags.get('retainedAssetsEquivalentNativeProduction') is True and flags.get('currentCandidateNativeProduction') is False,'Retained R4 native production was relabeled as current')
                    current_commands_production(before,value['assetParity']['baselineAPK_SHA256'])
                else:current_commands_production(value,candidate)
            require(all(flags.get(k) is True for k in ('compactCommandWindows','realDesignKeyboardSave','inlineLibrary','phoneLibraryPreserved','designEditDiscardDelete','ordersCurrentAndNativeIdentity')),'Compact command/keyboard/library journey incomplete')
            require(value.get('phoneBefore')==value.get('phoneAfter') and value.get('keyboard',{}).get('imeDismissed') is True,'Keyboard/phone library not restored')
            design=value.get('design',{});qa=design.get('qa',{})
            require(qa.get('id') and qa.get('cost',0)>0 and design.get('readFromAndroid') is True and design.get('reopenedLibrary') is True and design.get('removedOnlyNewId')==qa['id'] and design.get('editKeepDiscard') is True and design.get('deleteCancelConfirm') is True,'Real native-validated phone design save/edit/delete proof missing')
            require(any(d.get('id')==qa['id'] for d in design.get('phoneSaved',{}).get('designs',[])),'QA design absent from actual Android library')
            require({'normal','compact'}<={p.get('name') for p in value.get('profiles',[])} and all(p.get('androidBackRestoredBattlefield') is True for p in value['profiles']),'Actual normal/compact command returns missing')
            if value.get('assetParity'):
                require(flags.get('currentCandidateAssetEquivalentSmoke') is True and {'normal','compact'}=={p.get('name') for p in value.get('assetEquivalentSmoke',[])},'Fresh current-APK normal/compact command smoke missing')
                for profile in value['assetEquivalentSmoke']:
                    require(identity(profile)==candidate and profile.get('afterClock',0)>profile.get('beforeClock',float('inf')) and profile.get('nativeClockAfterBack',0)>0 and {p.get('id') for p in profile.get('pages',[])}=={'current-assets-smoke-factory','current-assets-smoke-design','current-assets-smoke-saved','current-assets-smoke-queue'},'Current-APK four-page smoke/Back/clock proof incomplete')
                    require(all(p.get('passed') is True and identity(p.get('observations',{}))==candidate and p.get('screenshots') for p in profile['pages']),'Current-APK smoke screenshots relabeled/missing')
            if value.get('uiScrollParity'):
                ready=value.get('currentCandidateProduction',{}).get('nativeReadiness',{})
                require(ready.get('seeded') is False and len(ready.get('authoredIds',[]))==6 and ready.get('currentIds')==ready['authoredIds'] and ready.get('extraIds')==[] and {d.get('id') for d in ready.get('nativeTrucks',[])}==set(ready['authoredIds']),'Fresh R4 production lacks its six actual authored native constructor identities')
                ready_path=local(ready.get('nativeSave',''));require(ready_path.is_relative_to(QA) and ready_path.is_file(),'Fresh R4 authored native F7 readiness save missing')
                ready_save=read(ready_path);require(all(d in list(ready_save.get('droid.json',{}).values()) for d in ready['nativeTrucks']),'Fresh R4 constructor readiness differs from actual F7 records')
                def visible_row(proof,item,confirm=False):
                    row=proof.get('row',{});clip=proof.get('owner',{}).get('clip',{});box=row.get('box',{})
                    require(row.get('id')==item and row.get('whole') is True and box.get('top',float('-inf'))>=clip.get('top',float('inf'))-1 and box.get('bottom',float('inf'))<=clip.get('bottom',float('-inf'))+1,'Affected actual Library row is outside its real scroll owner')
                    for key in (('confirmDelete','cancelDelete') if confirm else ('edit','produceDesign','delete')):require(any(b.get(key)==item and b.get('whole') is True and b.get('hit') is True for b in row.get('actions',[])),'Library action is not fully visible before automatic QA tap scrolling')
                visible_row(design.get('initialSavedRow',{}),qa['id'])
                for profile in value['profiles']:
                    picker=profile.get('pickerScroll',{});actions=profile.get('libraryActions',{});added=actions.get('added',{})
                    require(added.get('id') and added['id']!=qa['id'] and actions.get('removedOnlyNewId')==added['id'] and actions.get('originalPhoneBytesRestored') is True,'Per-profile Save As New/remove-only-new-ID proof missing')
                    for key,confirm in (('savedVisible',False),('confirm',True),('cancelled',False),('confirmed',True)):visible_row(actions.get(key,{}),added['id'],confirm)
                    visible_row(actions.get('survivor',{}),qa['id']);visible_row(profile.get('libraryUse',{}).get('returnedRow',{}),qa['id'])
                    require(profile.get('libraryUse',{}).get('recipeKey')==prior['recipe_key'](qa),'Actual Library Use selected a different hardware recipe')
                    for key in ('selected','kept'):require(any(t.get('part')=='Spade1Mk1' and t.get('active') is True and t.get('whole') is True and t.get('hit') is True for t in picker.get(key,{}).get('parts',{}).get('tiles',[])),'Lower actual component selection/Keep Editing jumps outside its picker')
                    if picker.get('swipes'):require(picker.get('selected',{}).get('parts',{}).get('scroll',[0])[0]>0,'Real lower-picker swipe was reset after selection')
                    confirm=picker.get('confirmation',{}).get('confirm',{})
                    require(confirm.get('whole') is True and len(confirm.get('buttons',[]))==2 and all(b.get('whole') is True and b.get('hit') is True for b in confirm['buttons']),'Actual New/Keep confirmation is clipped or unreachable')
                final=next((c for c in value.get('cases',[]) if c.get('id')=='blueprint-final-delete-confirm' and c.get('profile')=='compact'),{})
                visible_row(final.get('observations',{}).get('owner',{}),qa['id'],True)
            commands_ok=True;result|={'nativeProductionAndQueues','phoneSaveAndKeyboard'}
        if flags.get('nativeManualExecution') is True:
            require(all(flags.get(k) is True for k in ('compactResearchLayout','manualAddRemoveQueues','reopenAndAndroidBack','originalViewportAndLibrary')),'Manual Research journey incomplete')
            order=value.get('order',{});lab=order.get('labId');first=order.get('first',{});second=order.get('second',{})
            require(lab and first.get('id') and second.get('id') and first['id']!=second['id'],'Actual selected lab/manual topic identities missing')
            require(any(event.get('id')==first['id'] or event.get('name')==first.get('name') for event in value.get('completed',{}).get('events',[])),'Native Research completion event missing')
            labs=value.get('completed',{}).get('research',{}).get('labs',[])
            require(any(item.get('id')==lab and item.get('topicId')==second['id'] for item in labs),'Player-queued next topic did not start on the same native lab')
            require(all(not q.get('topicIds') for q in value.get('nativeExecution',{}).get('researchQueues',[]) if q.get('labId')!=lab),'Manual Research affected another laboratory queue')
            result.add('manualResearchAndQueues')
        if value.get('layoutOnly') is True:
            require(all(flags.get(k) is True for k in ('layoutOnlyNoOrderChanges','compactResearchLayout','fiveLabsReachable','currentQueueObserved','realTopicGridScroll','reopenAndAndroidBack','originalViewportAndLibrary')),'Compact layout-only native Research proof incomplete')
            before=value.get('before',{}).get('research',{});after=value.get('after',{}).get('research',{});reopened=value.get('reopened',{});ids=before.get('labIds',[])
            require(len(ids)==5 and reopened.get('research',{}).get('labIds')==ids and len(reopened.get('labs',[]))==5 and all(l.get('hit') is True for l in reopened['labs']) and any(l.get('id')==ids[-1] and l.get('selected')=='true' for l in reopened['labs']),'Compact fifth-lab native-ID/hit/reopen proof missing')
            require(all(before.get(k)==after.get(k) for k in ('queueAdds','queueRemovals','directAssignments','queueCommandWrites')) and after.get('dirtyLabIds')==[] and not after.get('runner'),'Layout-only Research changed actual manual orders')
            scroll=value.get('topicGridScroll',{})
            if scroll.get('needed'):require(any(a.get('owned') is True and a.get('duration',0)>=600 and a.get('after',{}).get('scroll',[0])[0]>a.get('before',{}).get('scroll',[float('inf')])[0] for a in scroll.get('attempts',[])),'Actual compact Research grid swipe did not scroll its real owner')
            require(value.get('profile',{}).get('fontScale')=='1.3' and value['profile'].get('commandScale')==1.4 and value.get('after',{}).get('touch',{}).get('heldKeys')==[],'Compact Research profile/input restoration missing')
            result.add('fiveLabs')
        if flags.get('tenFactories') is True and value.get('nativeFacilityCounts')=={'labs':5,'vehicleFactories':5,'cyborgFactories':5}:
            ids=value.get('nativeIds',{});require(all(len(ids.get(kind,[]))==5 for kind in ('labs','vehicle','cyborg')),'Actual 5/5/5 facility IDs missing')
            require({'normal','compact'}<={p.get('name') for p in value.get('profiles',[])},'Maximum native facilities not checked at both profiles')
            for profile in value['profiles']:
                require(profile.get('nativeFixture',{}).get('ids')==ids,'Per-profile complete native restore changed facility IDs')
                require({f.get('kind') for f in profile.get('families',[])}=={'vehicle','cyborg'},'Both maximum native factory families missing')
                for family in profile['families']:
                    require([s.get('id') for s in family.get('selections',[])]==ids[family['kind']] and all(s.get('hit') is True and s.get('selected') is True and s.get('hiddenNativeId')==s['id'] for s in family['selections']),'Not every actual native factory was selected')
                    require(len({row.get('key') for row in family.get('proof',{}).get('recipes',[])})==len(family.get('proof',{}).get('recipes',[])),'Actual maximum catalogue contains duplicate recipes')
                require(all(profile.get('back',{}).get(k) is True for k in ('nestedQueueBack','nestedMenuBack','fullBackToBattle')),'Maximum-facility Back/input restoration missing')
            require(value.get('phoneBefore')==value.get('phoneAfter'),'Maximum-facility layout changed phone library bytes')
            orders=value.get('productionOrders',[]);guard=value.get('completionGuard',{});units=value.get('nativeUnitRecords',[]);done=value.get('completed',[])
            require({o.get('kind') for o in orders}=={'vehicle','cyborg'} and len(orders)==2 and guard.get('passed') is True and set(guard.get('factoryIds',[]))=={o['factoryId'] for o in orders},'Current-APK native completion guard for both fifth factories missing')
            for order in orders:
                require(order.get('factoryId')==ids[order['kind']][4] and order.get('quantity')==1 and order.get('cost',0)>0 and order.get('nativeFactory',{}).get('active',{}).get('design',{}).get('cost')==order['cost'] and prior['recipe_key'](order['nativeFactory']['active']['design'])==order.get('recipeKey'),'Actual fifth-factory native ID/cost/recipe does not match submitted UI order')
                completion=next((u for u in done if u.get('factoryId')==order['factoryId']),{});unit=next((u for u in units if u.get('id')==completion.get('id')), {})
                require(unit and native_recipe(unit)==order['recipeKey'],'Actual fifth factory lacks a new genuine native unit with the submitted recipe')
                samples=[s for s in value.get('completionSamples',[]) if unit['id'] in s.get('completedIds',[])];require(samples,'Native completion sample ID missing')
                folder=local(value['profiles'][0]['nativeFixture']['nativeSave']).parent;sample=read(folder/samples[0]['save'])
                require(unit in list(sample.get('droid.json',{}).values()) and completion in sample.get('commands',{}).get('snapshot',{}).get('finishedUnits',[]),'Fifth-factory completion differs from its actual F7 save')
            result|={'fiveLabs','tenFactories','currentCandidateNativeProduction'}
        if flags.get('headerProductionNoDesign') is True:
            require(all(flags.get(k) is True for k in ('basePositionOnly','helpRealScrollNormalCompact','helpReturnNativePan','footerStatusRetained','worldNativeIdsAndZeroSDL','productionQueueMenuBack','nativeReturnCancel','libraryAndInputPreserved')),'Compact navigation/Help/Back journey incomplete')
            require(len(value.get('helpCycles',[]))>=2 and all(c.get('after',{}).get('scroll',{}).get('top',-1)+c.get('after',{}).get('scroll',{}).get('client',0)>=c.get('after',{}).get('scroll',{}).get('height',float('inf'))-3 for c in value['helpCycles']),'Actual normal/compact Help did not reach maximum body scroll')
            require(all(c.get('after',{}).get('lastSection',{}).get('bottom',float('inf'))<=c.get('after',{}).get('content',{}).get('bottom',float('-inf'))+2 for c in value['helpCycles']),'Actual final Help section remains clipped at maximum scroll')
            for profile in ('normal','compact'):
                footer=value.get('footerByProfile',{}).get(profile,[]);confirm=value.get('returnConfirmByProfile',{}).get(profile,{});field=value.get('fieldControlsByProfile',{}).get(profile,{})
                require(len(footer)==2 and confirm.get('restoredClock',0)>confirm.get('clock',float('inf')) and field.get('expanded')=='true' and field.get('toggleHit') is True and len(field.get('controls',[]))>=5 and all(b.get('hit') is True for b in field['controls']) and field.get('input',{}).get('heldKeys')==[],'Normal/compact footer, confirmation/input or field controls not actually verified')
            require({c.get('kind') for c in value.get('worldCases',[])}=={'research','factory'} and all(c.get('passed') is True and identity(c)==candidate and c.get('nativeLeftDown')==[] for c in value['worldCases']),'Actual native lab/factory world opening failed or forwarded a stock click')
            navigation_ok=True;result.add('footerAndStatusPreserved')
        if flags.get('nativeLauncherNormalCompact') is True:
            require(all(flags.get(k) is True for k in ('nativeMapsTowers','graphicsBackHQNormalNoDownload','musicActualPageAlbumScrollCheckboxReturn','libraryMusicPreferencesPreserved')),'Native style/navigation journey incomplete')
            before=value.get('preferencesBefore',{});after=value.get('preferencesAfter',{})
            require(all(before.get(k)==after.get(k) for k in ('tracks','musicEnabled','librarySHA256')),'Native settings altered music/library preferences')
            require({'normal','compact'}<={c.get('profile') for c in value.get('cases',[])},'Native normal/compact style profiles missing')
            for profile in ('normal','compact'):
                tracks=next((c for c in value.get('cases',[]) if c.get('id')=='music-track-visibility' and c.get('profile')==profile),{});view=tracks.get('scrollView',[]);rows=tracks.get('fullyVisibleTrackRows',[])
                require(len(view)==4 and len(rows)>=2 and all(len(row.get('bounds',[]))==4 and row['bounds'][3]-row['bounds'][1]>=50 and row['bounds'][0]>=view[0] and row['bounds'][1]>=view[1] and row['bounds'][2]<=view[2] and row['bounds'][3]<=view[3] for row in rows),'Initial native Music lacks two fully visible real track rows')
            native_ok=True
        if flags.get('twoOrdinaryNativeStructures') is True:
            require(all(flags.get(k) is True for k in ('selectedTrucksAndKeepOrders','ordersCompletedToggle','normalCompactCatalogueModules','twoVisibleConstructionRowsNormalCompact','ordersCompletedNormalCompact','ordinaryNativeModuleCompletion','libraryAndInputPreserved')),'Ordinary Build/module/input journey incomplete')
            selection=value.get('selection',{});workers=selection.get('workers',[])
            require(workers and set(workers)=={u.get('id') for u in selection.get('native',[])} and all(u.get('constructor') is True for u in selection['native']) and all(t.get('selected') is True for t in selection.get('trucks',[])),'Actual construction worker IDs/highlights missing')
            construction=value.get('construction',{});sites=construction.get('sites',[])
            require(len(sites)==2 and len(construction.get('native',[]))==2 and all(s.get('currentBuildPts')==300 for s in construction['native']),'Two ordinary native tower completions missing')
            require([s.get('reply',{}).get('result',{}).get('id') for s in sites]==[s.get('id') for s in construction.get('finished',[])] and all(set(s['reply']['result'].get('workers',[]))==set(workers) for s in sites),'Actual construction FIFO/worker groups changed')
            module=value.get('module',{});accepted=module.get('accepted',{}).get('reply',{}).get('result',{})
            require(accepted.get('targetModules') and module.get('native',{}).get('modules')==accepted['targetModules'] and module.get('finished',{}).get('id')==accepted.get('id'),'Ordinary parent module did not complete natively')
            require(value.get('orders',{}).get('pollPreserved') is True and {str(s['reply']['result']['id']) for s in sites}<=set(value['orders'].get('ids',[])),'Actual completed-build details did not remain open through polling')
            require({'normal','compact'}<={p.get('name') for p in value.get('profiles',[])},'Actual normal/compact Build/module catalogue missing')
            for profile in value['profiles']:
                g=profile.get('catalogue',{});queue=g.get('queue',{});rows=queue.get('rows',[]);exit=g.get('exit',{})
                require(len(rows)==2 and all(r.get('hit') is True and r.get('status')=='done' and r.get('box',{}).get('top',float('-inf'))>=queue.get('heading',{}).get('bottom',float('inf'))-1 and r.get('box',{}).get('bottom',float('inf'))<=queue.get('box',{}).get('bottom',float('-inf'))+1 and r['box']['bottom']<=exit.get('box',{}).get('top',float('-inf'))+1 for r in rows) and exit.get('hit') is True,'Actual two construction rows are clipped/covered by Exit')
                require(profile.get('completedOrders',{}).get('pollPreserved') is True,'Completed Orders details not retained in both actual profiles')
            build_ok=True
    if commands_ok and navigation_ok and native_ok:result.add('menuAndInputReturns')
    if build_ok and navigation_ok:result.add('buildMovementAndGestures')
    return result


def retained_commands_provenance(values,candidate):
    notes=[]
    for value in values:
        current=value;seen=set()
        while isinstance(current.get('continuation'),dict) and current['continuation'].get('resumed') is True:
            continuation=current['continuation'];ref=current.get('priorDiagnostic',{});path=local(ref.get('path',''))
            require(path.is_relative_to(QA) and path not in seen and path.is_file() and digest(path)==ref.get('sha256'),'Commands continuation diagnostic missing/changed/cyclic')
            seen.add(path);before=read(path)
            current_candidate=identity(current);html_candidate=current.get('assetParity',{}).get('baselineAPK_SHA256',current_candidate)
            retained_candidate=commands_runtime_parity(current,current_candidate) if current.get('runtimeParity') else current_candidate
            require(identity(before) in {current_candidate,html_candidate,retained_candidate} and before.get('passed') is False and before.get('failure')==ref.get('failure') and ref.get('disclosure'),'Commands continuation must retain actual failed evidence with its original APK identity')
            fields={'nativeProduction','nativeProductionRaw','ordersDuringProduction','keyboard','design.qa','design.phoneSaved','phoneBefore'}
            if identity(before) in {current_candidate,html_candidate} and before.get('runtimeParity'):
                fields|={'runtimeParity','currentCandidateProduction'}
                if before.get('uiScrollParity'):fields|={'uiScrollParity','retainedNativeBaseline'}
                if before.get('assetParity'):fields.add('assetParity')
                require((current.get('checks',{}).get('currentCandidateNativeProduction') is True or current.get('checks',{}).get('retainedAssetsEquivalentNativeProduction') is True) and (before.get('checks',{}).get('currentCandidateNativeProduction') is True or before.get('checks',{}).get('retainedAssetsEquivalentNativeProduction') is True),'Previously passed native production check was not retained with its original scope')
            require(fields<=set(continuation.get('retained',[])),'Retained commands proof fields not declared')
            def nested(item,key):
                for part in key.split('.'):item=item.get(part,{}) if isinstance(item,dict) else None
                return item
            require(all(nested(current,key)==nested(before,key) for key in fields),'Earlier passed native/IME/phone-save records changed during continuation')
            remaining=continuation.get('remainingOnly')
            if remaining:
                require(identity(before) in {current_candidate,html_candidate} and remaining.get('passedCaseScreensVerified') is True,'Remaining-only continuation requires identical APK or reviewed identical UI assets')
                evidence=current.get('retainedCaseEvidence',[])
                require(evidence and len({(e.get('id'),e.get('profile')) for e in evidence})==len(evidence),'Retained actual case records missing/duplicated')
                for item in evidence:
                    source=item.get('source',{});key=(item.get('id'),item.get('profile'))
                    require(source.get('path')==ref.get('path') and source.get('sha256')==ref.get('sha256'),'Retained case source does not match the hashed diagnostic')
                    old=next((c for c in before.get('cases',[]) if (c.get('id'),c.get('profile'))==key),None)
                    now=next((c for c in current.get('cases',[]) if (c.get('id'),c.get('profile'))==key),None)
                    require(old and old.get('passed') is True and now==old,'Retained passed screen case was changed or omitted')
                    old_identity=next((e.get('identity',{}) for e in before.get('retainedCaseEvidence',[]) if (e.get('id'),e.get('profile'))==key),None)
                    expected=identity(old_identity) if old_identity else identity(before.get('nativeProduction',{})) if not before.get('uiScrollParity') and re.match(r'^(orders-|design-keyboard-return)',str(item.get('id'))) else identity(before)
                    require(identity(item.get('identity',{}))==expected and expected in {current_candidate,html_candidate,retained_candidate},'Retained case original APK identity changed')
                    shots=item.get('screenshots',[])
                    require([s.get('path') for s in shots]==old.get('screenshots',[]) and all(local(s['path']).is_relative_to(QA) and digest(local(s['path']))==s.get('sha256') for s in shots),'Retained actual screenshot bytes changed')
                for profile in before.get('profiles',[]):
                    current_profile=next((p for p in current.get('profiles',[]) if p.get('name')==profile.get('name')), {})
                    require(all(c in current_profile.get('cases',[]) for c in profile.get('cases',[]) if c.get('passed') is True),'Passed normal/compact profile observations were not retained verbatim')
            epoch=continuation.get('resumedNativeEpoch',{})
            require(identity(continuation.get('identity',{}))==current_candidate and continuation.get('phoneVerified') is True and type(epoch.get('clock')) is int and epoch['clock']>0 and epoch.get('session'),'Resumed native epoch/actual phone verification missing')
            note=str(continuation.get('disclosure') or ref['disclosure'])+' The retained and resumed native epochs are distinguished; this is not claimed as an uninterrupted journey.'
            if note not in notes:notes.append(note)
            current=before
    return notes


def scoped(value):
    p=Path(value);p=p.resolve() if p.is_absolute() else (QA/p).resolve()
    require(p.is_relative_to(QA.resolve()),'Evidence outside current scoped QA: '+str(p));return p


def accepted_screens(path):
    value=read(path);require(value.get('reviewed') is True,'Explicit manual screenshot review required')
    entries=value.get('screenshots',[]);require(isinstance(entries,list) and entries,'Reviewed screenshots missing')
    result=[];names=set()
    for entry in entries:
        require(isinstance(entry,dict) and entry.get('accepted') is True,'Screenshot not explicitly accepted')
        p=local(entry['path'])
        require(p.is_relative_to(QA) and p.suffix.lower()=='.png' and p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'),'Invalid/out-of-scope reviewed PNG')
        rec=record(p);require(rec['path'] not in names and (not entry.get('sha256') or entry['sha256']==rec['sha256']),'Duplicate/changed accepted screenshot')
        names.add(rec['path']);rec['accepted']=True
        if entry.get('notes'):rec['notes']=str(entry['notes'])
        result.append(rec)
    observations=value.get('observations',[]);limits=value.get('limitations',[])
    require(isinstance(observations,list) and isinstance(limits,list),'Review observations/limits must be lists')
    return result,observations,limits


def wide_phone_evidence(values,candidate,accepted):
    matches=[v for v in values if v.get('checks',{}).get('widePhoneViewport') is True]
    require(len(matches)==1,'One actual current-APK wide-phone smoke report required')
    value=matches[0];flags=value.get('checks',{})
    require(identity(value)==candidate and value.get('seeded') is False and all(flags.get(k) is True for k in ('allEightSurfacesReachable','naturalPanelsAndNativeArt','backExitAndFramePreserved','noOrdersOrLibraryWrites')),'Wide-phone UI/return/nonmutation proof incomplete')
    profile=value.get('profile',{})
    require(profile.get('device')==[1200,540] and profile.get('actual',{}).get('device')==[1200,540] and profile.get('fontScale')==1 and profile.get('commandScale')==1 and value.get('restoredViewport',{}).get('device')==[1080,600] and value.get('restoredLiveClock',0)>0,'Actual wide-phone viewport or restored normal profile missing')
    require(value.get('libraryBefore')==value.get('libraryAfter') and value.get('before',{}).get('research')==value.get('after',{}).get('research') and value.get('after',{}).get('touch',{}).get('heldKeys')==[],'Wide-phone inspection changed library/research or left input held')
    old={item.get('nonce') for item in value.get('before',{}).get('history',[])}
    require(not any(item.get('nonce') not in old and item.get('action') in {'queue-build','queue-production','save-design','cancel-job','retry-job','clear-production','retry-production'} for item in value.get('after',{}).get('history',[])),'Wide-phone layout smoke issued native gameplay mutations')
    cases=value.get('cases',[]);require(len(cases)==8 and {c.get('id') for c in cases}=={'factory','design','saved','queue','research','build','modules','help'},'Eight actual wide-phone surfaces missing/duplicated')
    names={s['path'] for s in accepted}
    for case in cases:
        require(case.get('passed') is True and identity(case)==candidate and case.get('profile')=='wide-phone' and case.get('screenshots'),'Wide-phone case failed/relabeled')
        for name in case['screenshots']:
            p=local(name);require(name in names and p.is_relative_to(QA) and list(struct.unpack('>II',p.read_bytes()[16:24]))==[1200,540],'Wide-phone PNG not actually reviewed at its claimed device size')
    return value


def page_coverage(path,candidate,accepted,tests):
    value=copy.deepcopy(read(path));require(value.get('version')=='0.14','Wrong page ledger version')
    require(value.get('baselineAPK_SHA256')==h['FROZEN']['Warzone-Towers-0.13.apk'],'Wrong page ledger baseline')
    references=value.get('approvedReferences',[]);require(len(references)==3,'Three approved local references required')
    for entry in references:require(digest(local(entry['path']))==entry['sha256'],'Approved reference changed: '+entry['path'])
    accepted_by_path={entry['path']:entry for entry in accepted};profile_values={p['id']:p for p in value.get('profiles',[])};profiles=set(profile_values)
    require({'normal','compact'}<=profiles,'Normal/compact ledger profiles missing')
    pages=value.get('pages',[]);require(pages and len({p.get('id') for p in pages})==len(pages),'Duplicate/missing page inventory')
    reports={};pairs=[]
    for page in pages:
        require(set(page.get('sourceTests',[]))<=tests,'Required page source check missing: '+page.get('id',''))
        required=set(page.get('requiredProfiles',[]));require(required and required<=profiles,'Invalid page profile matrix')
        entries=page.get('coverage',[])
        require(len(entries)==len(required) and {e.get('profile') for e in entries}==required,'Actual page/profile coverage missing: '+page['id'])
        for entry in entries:
            require(entry.get('passed') is True and isinstance(entry.get('observations'),(list,dict)) and entry['observations'],'Observed page/profile requirements missing: '+page['id'])
            ref=entry.get('report',{});raw=local(ref.get('path',''))
            require(raw.is_relative_to(QA) and digest(raw)==ref.get('sha256'),'Page raw evidence missing/changed')
            passing(raw,candidate);reports[str(raw.resolve())]=record(raw)
            screens=entry.get('screenshots',[]);require(screens,'Page/profile screenshot evidence missing')
            for screen in screens:
                name=screen.get('path') if isinstance(screen,dict) else screen
                require(name in accepted_by_path,'Page/profile screenshot not manually accepted: '+str(name))
                if isinstance(screen,dict) and screen.get('sha256'):require(screen['sha256']==accepted_by_path[name]['sha256'],'Page/profile screenshot hash changed')
                png=local(name).read_bytes()
                require(list(struct.unpack('>II',png[16:24]))==profile_values[entry['profile']]['device'],'Actual screenshot size differs from page/profile label: '+name)
            pairs.append({'page':page['id'],'profile':entry['profile'],'report':ref['path']})
    for entry in value.get('sourceOnly',[]):
        require(set(entry.get('sourceTests',[]))<=tests,'Explicit source-only case check missing: '+entry.get('id',''))
    value.update({'candidateAPK_SHA256':candidate,'passed':True,'coverageComplete':True,
                  'status':'Verified only for the linked exact-APK raw observations and accepted normal/compact screens.',
                  'verifiedUTC':datetime.now(timezone.utc).isoformat().replace('+00:00','Z')})
    return value,list(reports.values()),pairs


def assemble(args):
    candidate=digest(args.apk)
    require(re.fullmatch('[a-f0-9]{64}',args.expected_sha256) and candidate==args.expected_sha256,'APK differs from expected candidate')
    paths=[scoped(p) for p in args.report]
    require(len(paths)>=3 and len(set(paths))==len(paths),'At least three distinct scoped raw report paths required')
    raw=[passing(p,candidate) for p in paths]
    code=passing(QA/'code-checks.json',candidate);package=passing(QA/'package-verification.json',candidate)
    tests=code.get('tests',[]);test_names={t.get('name') for t in tests}
    require(tests and len(test_names)==len(tests) and all(t.get('passed') is True and t.get('exitCode')==0 for t in tests),'Source checks incomplete/failed')
    require(h['REQUIRED_SOURCE_TESTS']<=test_names,'Compact page/native/mode source check missing')
    require(next(t for t in tests if t['name']=='test-12-world-taps.cjs').get('args')==['--source'],'World geometry check must use input-free --source mode')
    require(package.get('version')=='0.14' and package.get('baselineAPK_SHA256')==h['FROZEN']['Warzone-Towers-0.13.apk'],'Wrong package/fallback identity')
    require(all(package.get(k) is True for k in ('compiledEngineUnchanged','towersAndDuelPayloadsUnchanged','mapsAndScenariosUnchanged','nativeAndroidLogicPreserved','duelNativeDefaultsPreserved','footerAndStatusAssetsUnchanged','footerShellRulesUnchanged')),'Required source/payload/footer preservation proof missing')
    require(package.get('nativeStyleVerification',{}).get('passed') is True,'Native style-only residual proof missing')
    input_methods=input_method_evidence(candidate)
    identity_path=QA/'final-apk-identity.json';identity_proof=passing(identity_path,candidate)
    require(identity_proof.get('installedAPK_SHA256')==candidate and identity_proof.get('signatureVerified') is True and identity_proof.get('sameSigningCertificateSHA256')==package.get('sameSigningCertificateSHA256') and identity_proof.get('versionCode')==14 and identity_proof.get('label')=='Warzone Towers','Final installed/local APK signature or identity differs')
    final_identity=record(identity_path)
    for entry in package['sourceFiles']+package['nativeSourceFiles']+package['duelSourceFiles']+code.get('sourceFiles',[]):
        require(digest(local(entry['path']))==entry['sha256'],'Source changed since verification: '+entry['path'])
    combined=journey_checks(raw,candidate)
    native_checks=h['EMULATOR_CHECKS']-{'pageInventoryCovered','compactNormalLayouts'}
    require(native_checks<=combined,'Required actual compact-page/gameplay checks missing: '+str(sorted(native_checks-combined)))
    require(any(v.get('nativeFacilityCounts')=={'labs':5,'vehicleFactories':5,'cyborgFactories':5} for v in raw),'Actual native five-lab/five-vehicle/five-cyborg count proof missing')
    require(any(v.get('seeded') is False and v.get('checks',{}).get('normalNativeProduction') is True and v.get('nativeProduction',{}).get('passed') is True for v in raw),'Independent ordinary native production/queue proof missing')
    design=args.design_qa.resolve();accepted=args.accepted.resolve();inventory=args.inventory.resolve()
    require(design.is_relative_to(ROOT) and design.is_file() and accepted.is_relative_to(QA) and inventory==QA/'page-inventory.json','Current review/inventory outside project QA')
    text=design.read_text(encoding='utf-8');heading=next((line for line in text.splitlines() if line.startswith('# ')),'');result=re.search(r'^Final result:\s*(\w+)',text,re.I|re.M)
    require('0.14' in heading and candidate in text.lower() and result and result.group(1).lower()=='passed','Current design comparison historical/failed/wrong APK')
    screens,observations,extra_limits=accepted_screens(accepted)
    require(read(accepted).get('candidateAPK_SHA256')==candidate,'Manual acceptance input has a different APK identity')
    wide=wide_phone_evidence(raw,candidate,screens)
    ledger,ledger_reports,pairs=page_coverage(inventory,candidate,screens,test_names)
    source_records={str(p.resolve()):record(p) for p in paths}
    for rec in ledger_reports:source_records[str(local(rec['path']).resolve())]=rec
    now=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    fixtures=[{'path':p.relative_to(ROOT).as_posix(),'seeded':True,'disclosure':v['fixtureDisclosure']} for p,v in zip(paths,raw) if v.get('seeded') is True]
    raw_limits=[]
    for value in raw:
        for item in value.get('limits',[])+value.get('limitations',[]):
            if str(item) not in raw_limits:raw_limits.append(str(item))
        design_state=value.get('design',{})
        if value.get('retainedNativeBaseline',{}).get('disclosure'):raw_limits.append(str(value['retainedNativeBaseline']['disclosure']))
        if design_state.get('coldStartPerformed') is False and design_state.get('coldStartScope'):
            note=('The initial predecessor phone-save record retains its original cold-start scope; subsequent launcher/continuation stages are separately identified. ' if value.get('assetParity') else 'The temporary QA design was saved/read/reopened and removed without a cold restart within that recorded initial phase. ')+str(design_state['coldStartScope'])
            if note not in raw_limits:raw_limits.append(note)
    raw_limits+=retained_commands_provenance(raw,candidate)
    limits=[
        'Fresh delivery-APK page smoke, remaining UI actions, keyboard returns and native gameplay are distinguished from retained ordinary FIFO/production and initial phone-save records. Retained records keep their original identities and require the specific reviewed APK-member parity links. Physical-handset GPU/FPS and audio are not newly certified.',
        'The native maximum 5/5/5 case reuses a disclosed complete save with added completed facilities; it does not certify ordinary construction of every added facility or an uninterrupted campaign.',
        'Ordinary production/research, phone saving/keyboard and building/movement cases are separately identified. Rare exceptional UI states classified as source-only in the ledger are not claimed as native emulator fixtures.',
        'The existing software-emulator black-terrain limitation remains. No full 30-wave victory, Duel balancing campaign or unrelated automatic truck-picker repair is newly certified.',
        'Footer/current-work source and original hide/restore behaviour remain protected; no native factory ETA or percentage is invented.',
        'Current HTML controls use standard trusted CDP Input.dispatchTouchEvent touchStart/touchEnd with explicit 60 ms timestamps in the actual emulator WebView, without an experimental compositor API. Retained earlier cases keep their original methods. World/gameplay input, native Android controls, system Back, IME typing and real scrolling use OS/ADB input. No DOM button click or physical-handset latency certification is claimed.',
        'A pre-R5 emulator WebView native SIGTRAP is retained with its exit/stack diagnostics. Later QA uses the separately proven standard touch API; no application crash repair or definitive causal claim is made from that diagnostic.',
    ]+raw_limits+extra_limits
    emulator={'passed':True,'candidateAPK_SHA256':candidate,'installedAPK_SHA256':candidate,'version':'0.14','package':'com.rbabbit.warzonetowers.lab','emulatorTesting':True,'gameplayTesting':True,'recordedUTC':now,'checks':{k:True for k in h['EMULATOR_CHECKS']},'sourceReports':list(source_records.values()),'inputMethods':input_methods,'finalAPKIdentity':final_identity,'pageProfileCoverage':pairs,'fixtureDisclosures':fixtures,'limitations':limits}
    visual={'passed':True,'candidateAPK_SHA256':candidate,'reviewed':True,'recordedUTC':now,'reviewInput':record(accepted),'designQA':record(design),'screenshots':screens,'observations':observations,'limitations':limits}
    excluded={str((QA/n).resolve()) for n in OUTPUTS|{'code-checks.json','package-verification.json','page-inventory.json','input-methods.json','final-apk-identity.json'}}|set(source_records)|{str(accepted)}
    diagnostics=[record(p) for p in sorted(QA.rglob('*.json')) if str(p.resolve()) not in excluded]
    report=f'''# Warzone Towers 0.14 — compact active pages

Exact installed APK: `{candidate}`. The approved local Production, Design and Research references guide the compact border-free Towers pages. Native IDs, actual game artwork/costs and manual orders remain in use. The activity footer/current-work sidebars retain their source and original behaviour; native input feedback and focus cues remain.

The [page inventory](page-inventory.json) records {len(ledger['pages'])} active/protected page groups and {len(pairs)} actual normal/compact coverage pairs, with linked raw observations and manually accepted screenshots. Its source-only rare states and legacy unexposed More route are distinguished from actual emulator cases. Native production/research, phone save/keyboard, building/movement, menu/gesture returns, maximum facilities and retained Duel checks are separately identified. Ordinary FIFO/production and initial phone-save records retain their original APK identities. The specific Build CSS, scroll-owner UI and native Music-only parity links are byte/source verified; current page smoke, remaining UI/keyboard actions, native Music and gameplay/completion records are identified separately.

The manual design comparison and accepted PNG list are separate from source checks. The accepted 0.13 APK and complete source were fully verified before edits. Package verification checks unchanged complete Towers/Duel programs/data/maps/scenarios and protected footer assets, the scoped UI/native-style changes, signing identity, v6.4 and older fallbacks. Complete-source packaging still requires streaming every archive entry for CRC/SHA readback.

The [input-method record](input-methods.json) binds standard trusted CDP Input.dispatchTouchEvent touchStart/touchEnd with explicit 60 ms timestamps (observed event stamps 60/60.025 ms) and the opt-in QA helper. World/gameplay, native Android controls, system Back, typing and scrolling retain OS/ADB input. Earlier experiments/platform diagnostics remain historical records. No experimental compositor API or programmatic DOM button click is used for current HTML controls.

Preparation/failed reports are retained as supporting diagnostics, never promoted to passing claims. Only the recorded verification scope is established.

Limitations:

'''+''.join('- '+str(item)+'\n' for item in limits)
    # All prerequisites pass before any output. The ledger and gate are frozen
    # by hashes; DELIVERY is written last, after current human review exists.
    inventory.write_text(json.dumps(ledger,indent=2)+'\n',encoding='utf-8')
    (QA/'emulator-verification.json').write_text(json.dumps(emulator,indent=2)+'\n',encoding='utf-8')
    (QA/'visual-review.json').write_text(json.dumps(visual,indent=2)+'\n',encoding='utf-8')
    (QA/'REPORT.md').write_text(report,encoding='utf-8')
    reports=[record(QA/n) for n in ('package-verification.json','code-checks.json','emulator-verification.json','visual-review.json')]
    gate={'passed':True,'candidateAPK_SHA256':candidate,'version':'0.14','package':'com.rbabbit.warzonetowers.lab','emulatorTesting':True,'gameplayTesting':True,'visualReview':True,'recordedUTC':now,'reports':reports,'supportingReports':diagnostics,'inputMethods':input_methods,'finalAPKIdentity':final_identity,'widePhoneAspect':record(paths[raw.index(wide)]),'pageInventory':record(inventory),'reportMarkdown':record(QA/'REPORT.md'),'limitations':limits,'fixtureDisclosures':fixtures}
    (QA/'DELIVERY.json').write_text(json.dumps(gate,indent=2)+'\n',encoding='utf-8')
    return {'passed':True,'candidateAPK_SHA256':candidate,'rawReports':len(source_records),'pageProfilePairs':len(pairs),'acceptedScreenshots':len(screens)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,required=True)
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--accepted',type=Path,required=True)
    parser.add_argument('--design-qa',type=Path,default=ROOT/'design-qa.md')
    parser.add_argument('--inventory',type=Path,default=QA/'page-inventory.json')
    parser.add_argument('--report',action='append',required=True,help='Actual passed raw report, relative to qa/test-14 or absolute; repeat for scoped journeys')
    args=parser.parse_args();print(json.dumps(assemble(args),indent=2))


if __name__=='__main__':main()
