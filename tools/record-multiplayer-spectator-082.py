"""Record only observed exact-APK082 state; never fabricate gameplay outcomes."""
from pathlib import Path
from zipfile import ZipFile
import hashlib,json

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/multiplayer-spectator-082'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(name):return json.loads((QA/(name+'.json')).read_text(encoding='utf-8-sig'))
def pin(p):return dict(path=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=digest(p))
installed=read('installed-apk');candidate=ROOT/'app/build/outputs/apk/debug/app-debug.apk'
assert installed['installedAPK_SHA256']==installed['candidateAPK_SHA256']==digest(candidate)
room=read('delivery-observer-selected-retry');world=read('delivery-observer-world-retry')
before=read('delivery-observer-before');pan=read('delivery-observer-pan');rotate=read('delivery-observer-rotate');zoom=read('delivery-observer-zoom');tilt=read('delivery-observer-tilt')
assert room['room']['local']['spectator'] and room['native']['realPlayer']==14
assert world['session']['phase']=='game' and world['native']['spectator'] and world['native']['worldReady'] and not world['native']['canIssueOrders']
assert before['native']['gameTime']<tilt['native']['gameTime'] and before['native']['view']['frame']<tilt['native']['view']['frame']
camera=lambda s:s['native']['view']['camera']
assert (camera(before)['x'],camera(before)['y'])!=(camera(pan)['x'],camera(pan)['y'])
assert camera(pan)['yaw']!=camera(rotate)['yaw'] and camera(rotate)['distance']!=camera(zoom)['distance'] and camera(zoom)['pitch']!=camera(tilt)['pitch']
assert pan['denied']==dict(research=False,trucks=False,combat=False,native=dict(ok=False,reason='spectator-read-only'))
assert pan['response']['ok'] is False and pan['response']['selectedIds']==[]
for name in ['delivery-observer-before','delivery-observer-pan','delivery-observer-rotate','delivery-observer-zoom','delivery-observer-tilt','delivery-observer-music','delivery-observer-after-music','delivery-observer-return-cancel']:
 s=read(name);assert s['session']['phase']=='game' and sorted(s['visible'])==['blocknight-music','leave']
 assert not any('Invalid player index' in x for x in s['session']['errors'])
assert read('delivery-observer-returned')['session']['phase']=='lobby'
owner=read('delivery-player-before');trucks=read('delivery-player-trucks');moved=read('delivery-player-pan-adb')
assert owner['native']['canIssueOrders'] and not owner['native']['spectator'] and owner['native']['realPlayer']==owner['native']['player']==0
assert set(['blocknight-tech','wt-open-factory','wt-open-queue','lab-ops','mp-power-hud'])<=set(owner['visible'])
assert trucks['result']['ok'] and len(trucks['result']['selectedIds'])==2
assert (camera(owner)['x'],camera(owner)['y'])!=(camera(moved)['x'],camera(moved)['y'])
assert read('delivery-player-returned-real')['session']['phase']=='lobby'
for name in ['delivery-home','delivery-home-compact','delivery-home-restored']:
 s=read(name);assert s['tagline']['text']=='Advance Research Tech · Build &amp; Deploy Units · Upgrade Structures'
 assert len(s['buttons'])==6 and s['versionLabel']['text']=='rbabbit v0.82'
assert 'BUILD SUCCESSFUL' in (QA/'build.log').read_text(encoding='utf-8-sig')

MP='app/src/main/assets/multiplayer/'
product=[MP+n for n in ['index.html','multiplayer.css','session.js','native-ui-adapter.js','mobile-controls.js','warzone2100.js','warzone2100.wasm']]+['app/src/main/java/com/rbabbit/blocknight/warzone/HomeModesView.java']
index=ROOT/(MP+'index.html')
with ZipFile(ROOT.parent/'warzone-towers-0.81-source.zip') as old:assert index.read_bytes()==old.read(MP+'index.html')
text=index.read_text();assert text.index('id="blocknight-music"')<text.index('id="leave"')
coverage=dict(version='0.82',passed=True,emulatorUsed=False,engineExecuted=False,
 checks=['Actual MP header markup is byte-identical to delivered081; Music and Lobby ordering retained'],checksPassed=1,
 sources=[pin(index),pin(Path(__file__).resolve())])
(QA/'markup-host.json').write_text(json.dumps(coverage,indent=2)+'\n')
names=['installed-apk','delivery-observer-selected-retry','delivery-observer-world-retry','delivery-observer-before','delivery-observer-pan','delivery-observer-rotate','delivery-observer-zoom','delivery-observer-tilt','delivery-observer-minimap','delivery-observer-music','delivery-observer-after-music','delivery-observer-return-cancel','delivery-observer-returned','delivery-observer-renderer','delivery-player-before','delivery-player-research','delivery-player-manufacturing','delivery-player-queue','delivery-player-trucks','delivery-player-pan-adb','delivery-player-returned-real','delivery-home','delivery-home-compact','delivery-home-restored']
evidence=[]
for name in names:
 for suffix in ['.json','.png']:
  p=QA/(name+suffix)
  if p.exists():evidence.append(pin(p))
proof=dict(version='0.82',passed=True,emulatorUsed=True,device='emulator-5558',
 candidateAPK_SHA256=digest(candidate),installedAPK_SHA256=installed['installedAPK_SHA256'],
 checks={name:True for name in ['exactDeliveryAPK','homeTagline','spectatorPrestartAndMatch','spectatorFramesAdvance','spectatorCamera','spectatorReadOnly','spectatorMenusAndReturn','ordinaryPlayerPermissions']},
 verificationScope='Exact installed APK on existing emulator: actual Home normal/compact/restored, official headless private pre-start Spectate and match, advancing frames/time, touch pan/rotate/zoom/tilt/minimap, JS and native order refusal, Music and repeated leave/cancel/return; normal player owned menus, actual truck selection and Android-generated quick pan. Screenshots inspected. No desktop input after headless request.',
 limitations=['Black ground terrain remains in this emulator for both normal and spectator matches, also present in081; underlying graphics cause and physical-phone rendering unverified.','No physical phone, full public multiplayer match, speaker audition or joining already-running stock matches tested.','Private observer fixture uses two Cobra bots and official admin /team command after pre-start Spectate; generated profile flushed using existing IDBFS API. No fake Ready, gameplay orders, native player indices or simulation states injected.','Slow CDP normal-player drags became intentional box-selection; focused Android-generated quick swipe verified actual normal camera movement. Initial parallel600MB APK pull interfered with one fixture connection; exact installed hash was instead read in Android before the successful serial run.','No broad Towers, Campaign, FFA or full production/build/save regression run; their sources and assets remain frozen.'],
 fixture=dict(publicMessagesSent=False,headlessHost=True,desktopInputUsedAfterHeadlessRequest=False,seededGameplay=False),
 buildLog=pin(QA/'build.log'),sources=[pin(ROOT/p) for p in product+['app/build.gradle.kts','tools/package-multiplayer-spectator-082.py']],evidence=evidence)
(QA/'verification.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(dict(passed=True,observations=len(evidence),candidateAPK_SHA256=digest(candidate))))
