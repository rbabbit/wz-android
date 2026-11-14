"""Record checked offline evidence; no device or emulator operations."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,runpy
ROOT=Path(__file__).resolve().parents[1]
P=runpy.run_path(str(ROOT/'tools/package-multiplayer-072.py'))
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def pin(p):return dict(path=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=digest(p))
names=['oil-spacing-checks.json','music-compose.json','music-host.json','music-java.json','session-checks.json','music-browser.json','back-host.json']
evidence=[]
for name in names:
 p=ROOT/'qa/multiplayer-072'/name;v=json.loads(p.read_text());assert v.get('passed') is True,name;evidence.append(pin(p))
log=ROOT/'qa/multiplayer-072/build.log';assert 'BUILD SUCCESSFUL' in log.read_text(encoding='utf-8-sig')
apk=ROOT/'app/build/outputs/apk/debug/app-debug.apk'
sources={p for p in (ROOT/'app/src').rglob('*') if p.is_file()}|{ROOT/'app/build.gradle.kts'}|{ROOT/p for p in P['FOCUSED_CHECKS']}
proof=dict(version='0.72',candidateAPK_SHA256=digest(apk),passed=True,emulatorUsed=False,
 emulatorOmittedAtUserRequest=True,androidGameplayVerified=False,androidMusicPlaybackVerified=False,
 offlineHostChecksPassed=True,buildChecksPassed=True,checks={k:True for k in P['REQUIRED_CHECKS']},
 verificationScope='Confirmed prior generated Multiplayer queue rejects adjacent oil reservations before native validation. Tested actual queue functions with dense oil FIFO, overlap/duplicates, native placement and reachability stand-ins; only requested oil spacing exemption differs. Tested actual MP music player/settings/routes, all39 original track hashes, local range requests, unique session tokens, menu/lifecycle, background and exit cleanup, plus original Opus decoding and media clock in desktop Chromium. Session, lobby, persistent combat, input and Back code regressions pass. Clean Android Gradle build succeeded. No emulator, Android device, public room or VPS operations.',
 limitations=['Multiplayer oil construction was not exercised in the Android engine for this version.','Music playback, Android audio focus and menu/input behavior were not tested on an Android device or emulator.','Desktop browser decoder checks used muted output; physical speaker output was not checked.'],
 buildLog=pin(log),sources=[pin(p) for p in sorted(sources)],evidence=evidence,
 recordedUTC=datetime.now(timezone.utc).isoformat())
(ROOT/'qa/multiplayer-072/offline-verification.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(dict(passed=True,version=proof['version'],candidateAPK_SHA256=proof['candidateAPK_SHA256'],pinnedFiles=len(sources),emulatorUsed=False)))
