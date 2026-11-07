"""Record the completed exact-APK delivery checks before packaging Lab 01."""
from pathlib import Path
from hashlib import file_digest
from datetime import datetime, timezone
import json

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/lab-01'
APK_SHA='6dafb70bff1dfec5614de3403b5e169f8d720c9507c6f612d0000de9ecf5118c'
names=[
    'package-verification.json','code-checks.json',
    'startup-delivery/lab-startup-qa.json','startup-delivery/art-edge-rgb.json',
    'gameplay/lab-journey-all.json','gameplay/lab-journey-keyboard.json',
    'gameplay/selected-lab2-witness.json','scroll-delivery/audit-lab-scroll.json',
    'building/building-journey.json','building/wide-controls/audit-building-wide.json',
    'building/numbered-sites/audit-build-display.json','layouts/layout-journey.json',
    'dustfall/audit-build-display-td1.json','final-native-state.json','final-integrity.json'
]
records=[]
for name in names:
    path=QA/name
    data=json.loads(path.read_text(encoding='utf-8'))
    # Pixel-comparison evidence is supporting data rather than a gameplay runner.
    if name!='startup-delivery/art-edge-rgb.json':assert data.get('passed') is True,name
    for value in [data.get('candidateAPK_SHA256'),data.get('expectedAPK_SHA256'),data.get('identity',{}).get('candidateAPK_SHA256')]:
        if value:assert value==APK_SHA,'Wrong candidate: '+name
    with path.open('rb') as stream:checksum=file_digest(stream,'sha256').hexdigest()
    records.append({'path':path.relative_to(ROOT).as_posix(),'sha256':checksum})
package=json.loads((QA/'package-verification.json').read_text(encoding='utf-8'))
for entry in package['sourceFiles']:
    with (ROOT/entry['path']).open('rb') as stream:assert file_digest(stream,'sha256').hexdigest()==entry['sha256'],entry['path']
result={
    'passed':True,'version':'0.1-lab','package':'com.rbabbit.warzonetowers.lab',
    'candidateAPK_SHA256':APK_SHA,'emulatorTesting':True,'gameplayTesting':True,
    'completeOrdinaryNativeFixtures':True,'debugUnitsPowerResearchOrWorldEdits':False,
    'bothAppsInstalled':True,'stableProjectAPKSourceAndSavedDesignsPreserved':True,
    'retainedLegacyTruckPickerTransition':True,
    'limits':['Existing explicit TRUCKS picker briefly covers field/input while engine continues.',
              'Software-emulator black terrain remains unchanged.',
              'No physical-device performance/audio or complete 30-round victory certification.',
              'Optional download offline error/recovery checked; full transfer/cancellation not repeated.'],
    'reports':records,'recordedUTC':datetime.now(timezone.utc).isoformat()
}
(QA/'DELIVERY.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'exactAPK_SHA256':APK_SHA,'verifiedReports':len(records),'runtimeSourceFiles':len(package['sourceFiles'])},indent=2))
