"""Record focused v0.85 source/build evidence; never operates a device."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json, runpy

ROOT=Path(__file__).resolve().parents[2]
Q='qa/menu-polish-085/'
P=runpy.run_path(str(ROOT/'tools/package-menu-polish-085.py'),run_name='verification085')
def digest(path):
    h=sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
def pin(name):
    p=ROOT/name
    return dict(path=name,bytes=p.stat().st_size,sha256=digest(p))
hosts=['campaign.json','guide-source-checks.json','mp.json']
for name in hosts:
    data=json.loads((ROOT/Q/name).read_text(encoding='utf-8-sig'))
    assert data['version']=='0.85' and data['passed'] and data['emulatorUsed'] is False,name
    for item in data['sources']:
        assert digest(ROOT/item['path'])==item['sha256'],'Stale '+item['path']
home=(ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone/HomeModesView.java').read_text()
assert 'tagline = text("Research Tech - Build & Deploy Units - Upgrade Structures",' in home
assert 'Advance Research Tech' not in home
assert 'BUILD SUCCESSFUL' in (ROOT/Q/'build.log').read_text(encoding='utf-8-sig')
names=sorted(P['PRODUCT']|{P['GRADLE'],P['TOOL']})
evidence=[Q+n for n in hosts]+[Q+'audit.txt',Q+'fallback.json',Q+'make-verification.py',Q+'check-guide-source.cjs',
    'tools/test-campaign-heading-085.py','tools/test-menu-polish-085-mp.cjs']
result=dict(version='0.85',passed=True,emulatorUsed=False,actualAndroidViewsExecuted=False,
    candidateAPK_SHA256=digest(ROOT/'app/build/outputs/apk/debug/app-debug.apk'),
    checks=dict(homeTagline=True,guideModeRemoval=True,campaignHeadingRemoval=True,lobbyHeader=True,fullscreenMap=True,androidBuild=True),
    buildLog=pin(Q+'build.log'),sources=[pin(n) for n in names],evidence=[pin(n) for n in evidence],
    limitations=['No emulator, device, browser or gameplay run at user request.',
        'Host geometry/source checks do not verify actual Android rendering, touch, keyboard or fullscreen behavior.',
        'Existing Guide content checker contains two stale assertions against unchanged historical datasets; focused current-script checks passed.'],
    recordedUTC=datetime.now(timezone.utc).isoformat())
(ROOT/Q/'verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(passed=True,emulatorUsed=False,candidateAPK_SHA256=result['candidateAPK_SHA256'])))
