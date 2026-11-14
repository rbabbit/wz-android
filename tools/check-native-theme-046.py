"""Source/build/payload checks only; never runs the engine or Android."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'archive/native-theme-0.46'
recipe = runpy.run_path(str(ROOT / 'tools/build-native-theme-046.py'), run_name='theme_046_source_check')


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def main():
    checks = []
    for name, source in recipe['ORIGINAL_PATHS'].items():
        before = (ROOT / source).read_bytes()
        after = (OUT / name).read_bytes()
        assert digest(OUT / ('original-' + name)) == recipe['ORIGINAL'][name]
        assert after == recipe['reconstruct'](name, before)
        # A neutral replacement token proves the patch cannot alter geometry,
        # formulas, conditions, message handling or non-Towers branches.
        normalize = lambda text: re.sub(r'towersSageColour\(\d+,\d+,\d+\)', 'TOWERS_COLOUR_LITERAL', text)
        assert normalize(before.decode()) == normalize(after.decode())
        for old in recipe['COLOURS']:
            assert old not in after.decode()
    checks.append('Exactly two renderer overlays differ only in whitelisted Towers RGB colour literals')
    console = (OUT / 'console.cpp').read_text()
    meter = (OUT / 'intdisplay.cpp').read_text()
    assert 'towersSageColour(17,17,17)' in console and 'towersSageColour(244,244,244)' in console
    assert 'towersSageColour(37,37,37)' in meter and 'towersSageColour(244,244,244)' in meter
    assert 'towersSageColour(188,188,188)' in meter and 'towersSageColour(112,112,112)' in meter
    assert '#ifdef __EMSCRIPTEN__' in console and '"/tmp/warzone-towers-ui-v34"' in console
    checks.append('Native console pairs near-black panels with white text; power uses white fill and distinct neutral preview/track colours')
    for exact in ['double displayRange = 5000.;',
                  'while (std::max(displayPower, static_cast<double>(previewPower)) > displayRange)',
                  'double desiredPower = getPowerMinusQueued(selectedPlayer);',
                  'realPower = static_cast<SDWORD>((displayPower + 1e-8) - ManuPower);',
                  'cache.wzText.setText(WzString::number(realPower), font_regular);']:
        assert meter.count(exact) == 1
    checks.append('Current live resource accounting, actual power text and v0.44 headroom scaling remain intact')
    build = json.loads((OUT / 'native-build.json').read_text())
    prior = json.loads((ROOT / build['previousNativeBuild']).read_text())
    assert build['previousNativeBuildSHA256'] == digest(ROOT / build['previousNativeBuild'])
    assert build['passed'] and build['colourLiteralsOnly'] and build['nativeFullFreshBuildPerformed'] is False
    assert all(build[k] is False for k in ['emulatorUsed', 'androidRuntimeExecuted', 'gameplayVerified'])
    assert build['preservedSourceOverlays'] == prior['sourceOverlays']
    for name, expected in prior['sourceOverlays'].items():
        assert build['sourceOverlays'][name] == (digest(OUT / name) if name in recipe['ORIGINAL'] else expected)
    assert build['sourceOverlays']['loadsave.cpp'] == 'b58f01a03b551cbc589ef468f6a0572bd49978f9ba88db503eb761a3518b3341'
    checks.append('Autosave opt-out, cancellation, production observer and all earlier native gameplay overlays stay frozen')
    log = (ROOT / build['log']).read_text()
    assert digest(ROOT / build['log']) == build['logSHA256']
    assert sorted(re.findall(r'Building CXX object (\S+)', log)) == recipe['EXPECTED_OBJECTS']
    assert sorted(build['compiledObjects']) == recipe['EXPECTED_OBJECTS']
    assert len(re.findall(r'Linking CXX executable[^\n]*warzone2100', log)) == 1
    checks.append('The matching prepared cache compiled exactly console.cpp/intdisplay.cpp and linked once')
    payload = json.loads((OUT / 'native-payload.json').read_text())
    runtime = json.loads((OUT / 'native-runtime-integration.json').read_text())
    assert payload['changedVFSFiles'] == payload['addedVFSFiles'] == payload['removedVFSFiles'] == []
    assert payload['unchangedVirtualFiles'] == 4292
    assert payload['frozenDataSHA256'] == 'f22e7956aa68102affe615e8a8794d9ea16ed4ba49d2e18ad380955967c9f599'
    assert runtime['generatedCodeUnchangedOutsideIndexAndExistingWorkerHook']
    for row in payload['outputs']:
        path = ROOT / 'app/src/main/assets/warzone' / row['file']
        assert path.stat().st_size == row['bytes'] and digest(path) == row['sha256']
    checks.append('Installed JS/WASM matches the colour build; all 4292 authored VFS entries, complete data, exports and worker hook retained')
    sources = ['tools/build-native-theme-046.py', 'tools/integrate-native-theme-046.py',
               'archive/native-theme-0.46/console.cpp', 'archive/native-theme-0.46/intdisplay.cpp',
               'archive/native-theme-0.46/native-build.json', 'archive/native-theme-0.46/native-payload.json']
    report = {'version': '0.46', 'passed': True, 'colourLiteralsOnly': True,
              'emulatorUsed': False, 'browserUsed': False, 'androidRuntimeExecuted': False,
              'actualNativeEngineExecuted': False, 'gameplayVerified': False, 'screensVerified': False,
              'scope': 'Native source/build/payload integrity only; no gameplay or device verification',
              'checks': checks, 'checksPassed': len(checks),
              'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in sources],
              'recordedUTC': datetime.now(timezone.utc).isoformat()}
    (ROOT / 'archive/native-theme-0.46-checks.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
