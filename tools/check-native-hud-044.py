"""Source/build integrity checks only; never executes the native game or Android."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json
import re
import runpy

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'archive/native-hud-0.44'
recipe=runpy.run_path(str(ROOT/'tools/build-native-hud-044.py'),run_name='hud_044_source_check')


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def main():
    checks=[]
    for name in recipe['ORIGINAL']:
        before=(OUT/('original-'+name)).read_bytes()
        assert (OUT/name).read_bytes()==recipe['reconstruct'](name,before)
    checks.append('Exactly two guarded native source deltas reconstruct from the frozen original files')
    meter=(OUT/'intdisplay.cpp').read_text()
    before=(OUT/'original-intdisplay.cpp').read_text()
    meter=meter[meter.index('void PowerBar::display('):meter.index('IntFancyButton::IntFancyButton()')]
    before=before[before.index('void PowerBar::display('):before.index('IntFancyButton::IntFancyButton()')]
    for line in ['double desiredPower = getPowerMinusQueued(selectedPlayer);',
                 'realPower = static_cast<SDWORD>((displayPower + 1e-8) - ManuPower);',
                 'ManuPower = 0;', 'cache.wzText.setText(WzString::number(realPower), font_regular);']:
        assert meter.count(line)==before.count(line)==1
    assert meter.count('double displayRange = 5000.;')==1
    assert 'if (sage)\n\t{\n\t\t// This is a display scale, not a power-storage limit.' in meter
    checks.append('Towers gauge scale changes pixels only; live native power/text/preview accounting remains exact')
    saves=(OUT/'loadsave.cpp').read_text()
    trigger=saves[saves.index('bool autoSave(bool force)'):]
    write=saves[saves.index('static bool doAutoSave()'):saves.index('bool autoSave(bool force)')]
    assert trigger.index('if (towersDisablesAutoSave()) return false;')<trigger.index('console(_("AutoSaving..."))')
    assert trigger.index('if (towersDisablesAutoSave()) return false;')<trigger.index('wzAsyncExecOnMainThread')
    assert write.index('if (towersDisablesAutoSave()) return false;')<write.index('freeAutoSaveSlot_old')
    assert '#ifdef __EMSCRIPTEN__' in saves and '"/tmp/warzone-towers-ui-v34"' in saves
    assert 'saveGame(savefile, GTYPE_SAVE_MIDMISSION, true)' in write
    checks.append('Towers guard blocks automatic messages, scheduling and queued writes; manual save functions are outside the delta')
    build=json.loads((OUT/'native-build.json').read_text())
    assert build['passed'] and build['emulatorUsed'] is False and build['gameplayVerified'] is False
    log=(ROOT/build['log']).read_text()
    assert sorted(re.findall(r'Building CXX object (\S+)',log))==recipe['EXPECTED_OBJECTS']
    assert len(re.findall(r'Linking CXX executable[^\n]*warzone2100',log))==1
    for name,expected in build['preservedSourceOverlays'].items():
        if name!='intdisplay.cpp':assert build['sourceOverlays'][name]==expected
    checks.append('Exactly two source objects compiled and one matching link retained every previous native overlay')
    payload=json.loads((OUT/'native-payload.json').read_text())
    assert payload['changedVFSFiles']==payload['addedVFSFiles']==payload['removedVFSFiles']==[]
    assert payload['unchangedVirtualFiles']==4292
    for entry in payload['outputs']:
        path=ROOT/'app/src/main/assets/warzone'/entry['file']
        assert path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256']
    checks.append('Final matched JS/WASM installed with all 4292 authored virtual files and data unchanged')
    sources=['tools/build-native-hud-044.py','tools/integrate-native-hud-044.py',
             'archive/native-hud-0.44/intdisplay.cpp','archive/native-hud-0.44/loadsave.cpp',
             'archive/native-hud-0.44/native-build.json','archive/native-hud-0.44/native-payload.json']
    report={'version':'0.44','passed':True,'emulatorUsed':False,'browserUsed':False,
        'androidRuntimeExecuted':False,'actualNativeEngineExecuted':False,'gameplayVerified':False,
        'scope':'Source/build/payload integrity only; no native game, Android runtime or emulator execution',
        'checks':checks,'checksPassed':len(checks),'sources':[{'path':name,'sha256':digest(ROOT/name)} for name in sources],
        'recordedUTC':datetime.now(timezone.utc).isoformat()}
    (ROOT/'archive/native-hud-0.44-checks.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))


if __name__=='__main__':main()
