"""Bind observed v0.50 emulator evidence to the exact source and delivery APK."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa/touch-pan-050'
OUT = ROOT / 'archive/touch-camera-0.50'
APK_SHA = 'b0e75ce1cbd960594da99531862b65873c3a8a3f27f5daede89d3de2800119c7'

def digest(path):
    h = sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def read(name):
    return json.loads((QA / name).read_text())

def release_step(trace):
    up = next(e['at'] for e in trace['trace']['events']
              if e['kind'] == 'mouse' and e['type'] == 'pointerup' and e['button'] == 1)
    frames = [f for f in trace['trace']['frames'] if f['point']]
    i = next(i for i, f in enumerate(frames) if f['at'] > up)
    before, after = frames[i-1]['point'], frames[i]['point']
    dx, dy = after['x'] - before['x'], after['y'] - before['y']
    return {'dx': dx, 'dy': dy, 'pixels': (dx*dx + dy*dy)**.5}

def main():
    assert digest(ROOT / 'app/build/outputs/apk/debug/app-debug.apk') == APK_SHA
    before, after = read('pan-v049-host-before.json'), read('pan-v050-host-after.json')
    assert before['installedAPK_SHA256'] == '9c51733883b05a2e16adba26e9c2b9cf085b9e85488f932c567d072dfe946282'
    assert after['installedAPK_SHA256'] == APK_SHA
    old_step, new_step = release_step(before), release_step(after)
    assert old_step['dx'] > 90 and new_step['dx'] < 0 and new_step['pixels'] < 10
    journey = read('camera-journey-050.json')
    assert journey['passed'] and journey['installedAPK_SHA256'] == APK_SHA and len(journey['cases']) == 5
    for case in journey['cases']:
        assert case['passed'] and not case['after']['touch']['gestureActive']
        assert case['after']['touch']['panPhase'] == 'idle'
        assert not case['after']['touch']['panHeldTimeouts'] and not case['after']['touch']['panUnobservedRearms']
    rapid = journey['cases'][1]
    start_count = rapid['before']['touch']['pans']
    starts = [next(s['at'] for s in rapid['result']['trace'] if s['pans'] == start_count+n) for n in range(1, 4)]
    intervals = [b-a for a, b in zip(starts, starts[1:])]
    assert all(0 < value < 250 for value in intervals)
    construction = read('construction-complete.json')
    assert construction['sites'] == [] and all(not t['building'] and t['queued'] == 0 for t in construction['trucks'])
    towers = [s for s in construction['towers'] if s['position'][:2] in [[3776, 8000], [4032, 8000]]]
    assert len(towers) == 2 and all(s['build'] == 300 for s in towers)
    menus = read('menu-queue-checks.json')
    assert len(menus['menus']) == 8 and len(menus['production']['trucks']) == 6
    assert all(f['idle'] for f in menus['production']['factories'])
    loaded = read('load-return-final.json')
    assert loaded['save']['ready'] and loaded['save']['hydrated'] and loaded['hasHQ']
    assert loaded['save']['slotId'] == construction['save']['savedId']
    assert loaded['compression'] == '1' and loaded['marker'] == '1'
    assert loaded['touch']['panPhase'] == 'idle' and not loaded['touch']['gestureActive']
    for name in ['pan-v050-after-back-cancel.json', 'pan-v050-after-saved-load.json']:
        trace = read(name)
        assert trace['installedAPK_SHA256'] == APK_SHA
        assert trace['trace']['touch']['pans'] > trace['start']['touch']['pans']
        assert trace['trace']['touch']['panPhase'] == 'idle'
    OUT.mkdir(parents=True, exist_ok=True)
    names = ['pan-v049-host-before.json', 'pan-v050-host-after.json', 'camera-journey-050.json',
             'construction-mid.json', 'construction-complete.json', 'production-mid.json',
             'menu-queue-checks.json', 'back-interrupt-before.json', 'after-saved-load.json',
             'load-return-final.json', 'pan-v050-after-back-cancel.json', 'pan-v050-after-saved-load.json',
             'camera50-final-home.png', 'camera50-real-back-dialog.png']
    for name in names:
        shutil.copyfile(QA / name, OUT / name)
    sources = ['app/src/main/assets/warzone-touch-controls.js', 'app/src/main/assets/warzone/warzone2100.wasm',
               'app/src/main/assets/warzone/warzone2100.js', 'app/build.gradle.kts',
               'tools/audit-touch-pan-050.cjs', 'tools/verify-touch-camera-050.cjs',
               'tools/record-touch-camera-050.py', 'archive/native-touch-0.50/native-build.json']
    record = {'version': '0.50', 'passed': True, 'emulatorUsed': True, 'browserUsed': False,
        'androidWebViewUsed': True, 'androidRuntimeExecuted': True, 'actualNativeEngineExecuted': True,
        'candidateAPK_SHA256': APK_SHA, 'seeded': False, 'device': 'emulator-5558',
        'avd': 'Pixel_10_Pro', 'viewport': journey['viewport'],
        'input': 'Real Android input touchscreen swipes/taps, trusted WebView CDP multi-touch/rapid input, real native Views for Back/Home/Saved Games',
        'releaseComparison': {'v049': old_step, 'v050': new_step}, 'rapidSwipeIntervalsMs': intervals,
        'checks': [c['name'] for c in journey['cases']] + [
            'Existing truck selected by real world tap; Build selected four visible native constructors',
            'Two normal queued GuardTower1 sites completed, with native structure IDs/build points and idle workers',
            'Two normal factory productions completed; authoritative snapshot contains six trucks and idle factories',
            'Eight Research/Manufacturing/Queue/Help toggle returns restored input',
            'Android Back during held drag, Cancel, fresh native pan, Return Home to Greenhaven',
            'Actual phone Save archive loaded via native Saved Games; native world and fresh camera input restored'],
        'nativeBuiltTowers': towers, 'producedTruckIDs': [t['id'] for t in menus['production']['trucks']],
        'gameplayVerifiedScope': 'Camera/input and related selection, construction, production, navigation and save/load journey',
        'terrainVisualCorrectnessVerified': False, 'physicalPhoneFramePacingVerified': False,
        'limitation': 'Terrain textures were black in both baseline and candidate under both emulator graphics backends. Visible models/minimap, actual geometry and native projection were inspected. No terrain rendering or graphics code changed.',
        'testPreferenceRestored': 'Original native textureCompression=1; test-only uncompressed attempt did not resolve the existing emulator terrain appearance',
        'rewardedAdsWatched': False, 'adRequestsMadeThroughRewardControls': False,
        'fixtureCorrections': ['Initial sequential per-event CDP latency triggered long press; ordinary panning uses Android swipe',
            'Completed construction sites are removed, so verify native structures instead of waiting for retained done rows',
            'Direct saved loads need not install the touch GL observer until first input; pre-input readiness uses observed terrain draws'],
        'sources': [{'path': p, 'sha256': digest(ROOT / p)} for p in sources],
        'evidence': [{'path': (OUT / n).relative_to(ROOT).as_posix(), 'sha256': digest(OUT / n)} for n in names],
        'recordedUTC': datetime.now(timezone.utc).isoformat()}
    target = ROOT / 'archive/touch-pan-0.50-emulator-checks.json'
    target.write_text(json.dumps(record, indent=2)+'\n')
    print(json.dumps({'passed': True, 'checks': len(record['checks']), 'releaseComparison': record['releaseComparison'],
                      'rapidSwipeIntervalsMs': intervals, 'proof': str(target)}, indent=2))

if __name__ == '__main__':
    main()
