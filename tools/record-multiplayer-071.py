"""Record the externally observed exact-APK checks after their evidence passes."""
from pathlib import Path
import hashlib,json,runpy
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read(name):return json.loads((ROOT/'qa/multiplayer-071'/name).read_text())
def pin(p):return dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p),bytes=p.stat().st_size)
P=runpy.run_path(str(ROOT/'tools/package-multiplayer-071.py'))
installed=read('exact-installed-apk.json');combat=read('combat-live-proof.json');small=read('small-layout-back-proof.json');back=read('final-return-proof.json');lobby=read('lobby-live-proof.json')
assert all(p['passed'] for p in [combat,small,back,lobby])
assert combat['before']['combatIds']==[] and len(combat['after']['combatIds'])>=2
assert combat['after']['enabled'] and combat['after']['selectedIds']==combat['after']['combatIds']
assert combat['build']['commands']['nativeBuildGroup'] and combat['build']['native']['state']['combatLock']['suspended']
initial=combat['newborns']['commands']['snapshot']['selectedUnits'];later=combat['allUnits']['commands']['snapshot']['selectedUnits']
same=[(a,b) for a in initial for b in later if a['id']==b['id'] and not a['constructor']]
assert same and all(a['order']==b['order'] for a,b in same)
apk=ROOT/'app/build/outputs/apk/debug/app-debug.apk';assert digest(apk)==installed['apkSHA256']==installed['installedAPK_SHA256']
assert len(back['stayCycles'])==2 and all(x['game'] for x in back['stayCycles'])
log=ROOT/'qa/multiplayer-071/build.log';assert 'BUILD SUCCESSFUL' in log.read_text(encoding='utf-8-sig')
sources={p for p in (ROOT/'app/src').rglob('*') if p.is_file()}|{ROOT/'app/build.gradle.kts'}|{ROOT/p for p in P['FOCUSED_CHECKS']}
proof=dict(version='0.71',candidateAPK_SHA256=installed['apkSHA256'],emulatorUsed=True,passed=True,
 verificationScope='Exact installed APK: real public bot-room join/transfer/Ready on normal and small emulator displays; actual production of two cyborgs and native selected IDs while All Combat remains ON; Research/Queue/Build suspension and resume; All Units, Deselect and Trucks override; existing native orders retained; large live lobby columns/counts/filter/scroll; small lobby layout and filter; repeated native Back Stay/Return and lobby Back Home; existing Towers entry/Back navigation. No debug units or altered game rules.',
 limitations=['Physical phone rendering and a full multiplayer match were not tested.','Emulator terrain textures are dark as in the preserved build; models, HUD and native state were inspected.','Current-player counts are shown only when the lobby supplies them. Unknown counts remain Up to N.','Early fixture retries included host connection loss, an undersized production wait and checks before asynchronous UI commits; these were not counted as passing checks.'],
 checks={name:True for name in P['REQUIRED_CHECKS']},buildLog=pin(log),sources=[pin(p) for p in sorted(sources)],
 evidence=[pin(ROOT/'qa/multiplayer-071'/n) for n in ['exact-installed-apk.json','combat-live-proof.json','small-layout-back-proof.json','final-return-proof.json','lobby-live-proof.json','device-restoration.json']],
 observedOrderPreservation=[dict(id=a['id'],before=a['order'],after=b['order']) for a,b in same],
 fixture='Real bot-room native production and commands; no unit/save seeding. Scripted touch uses actual DOM geometry and native snapshots. Back waits for screenshot evidence of the native prompt.',recordedUTC=datetime.now(timezone.utc).isoformat())
(ROOT/'qa/multiplayer-071/emulator-verification.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(dict(passed=True,version='0.71',candidateAPK_SHA256=proof['candidateAPK_SHA256'],pinnedFiles=len(sources),checks=proof['checks'])))
