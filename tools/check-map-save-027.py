"""Source-only native save-name contract for all 46 Towers levels."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
OLD, NEW = 'Greenhaven-Beginner-T1', 'Greenhaven-T1'
BASE = ROOT.parent / 'Warzone-Towers-0.26.apk'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def check():
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='map_save_audit')
    with ZipFile(BASE) as archive:
        _, _, _, metadata = runtime['package_call'](archive.read('assets/warzone/warzone2100.js').decode())
        data = archive.read('assets/warzone/warzone2100.data')
        old_catalog = json.loads(archive.read('assets/warzone/levels/catalog.json'))
    rows = {value['filename']: value for value in metadata['files']}

    def old(name):
        row = rows[name]
        return data[row['start']:row['end']]

    catalog_path = 'app/src/main/assets/warzone/levels/catalog.json'
    catalog = json.loads((ROOT / catalog_path).read_text(encoding='utf-8'))
    require(len(catalog['levels']) == 46, 'Incomplete Towers map catalog')
    expected = json.loads(json.dumps(old_catalog))
    changed = [level for level in expected['levels'] if level['id'] == 'beginner']
    require(len(changed) == 1 and changed[0]['mapName'] == OLD, 'Frozen beginner identity differs')
    changed[0]['mapName'] = NEW
    require(catalog == expected, 'Map catalog changed beyond the one internal native save identifier')
    registration = (ROOT / 'map/greenhaven-beginner/level.lev').read_bytes()
    old_registration = registration.replace(NEW.encode(), OLD.encode())
    addon = old('/data/mp/addon.lev')
    require(addon.count(old_registration) == 1, 'Frozen native registration differs from reviewed source')
    addon = addon.replace(old_registration, registration)
    router = (ROOT / 'scenario/beginner/config-router.js').read_bytes()
    require(router == old('/data/mp/tests/towers-config-router-018.js').replace(OLD.encode(), NEW.encode()),
            'Existing map router changed beyond its Greenhaven name match')
    require(b'LEVEL = \'Greenhaven-T1\'' in (ROOT / 'tools/build-greenhaven.py').read_bytes(),
            'Future Greenhaven generator would restore an unsafe level name')
    require(b"mapName='Greenhaven-T1'" in (ROOT / 'tools/build-levels-019.py').read_bytes(),
            'Future level catalog generator would restore an unsafe level name')
    records = []
    for level in catalog['levels']:
        identity = level['mapName']
        count = len(identity.encode('utf-8'))
        require(0 < count < 20, 'Native MAX_LEVEL_SIZE save limit violated: ' + identity)
        source = 'scenario/warzonetowers' + ('-beginner' if level['id'] == 'beginner' else '-td1' if level['id'] == 'td1' else '') + '.json'
        if not level['legacy']:
            source = 'scenario/levels/' + level['id'] + '.json'
        challenge = json.loads((ROOT / source).read_text(encoding='utf-8'))
        require(challenge['challenge']['map'] == identity, 'Challenge/native catalog identity differs: ' + level['id'])
        require(len(re.findall(rb'^level\s+' + re.escape(identity.encode()) + rb'\s*$', addon, re.M)) == 1,
                'Native registration is missing or ambiguous: ' + identity)
        records.append({'id': level['id'], 'nativeLevel': identity, 'utf8Bytes': count, 'saveNameFits': True,
                        'challenge': source, 'challengeSHA256': sha256((ROOT / source).read_bytes()).hexdigest()})
    old_challenge = json.loads(old('/data/mp/tests/warzonetowers-beginner.json'))
    old_challenge['challenge']['map'] = NEW
    require(json.loads((ROOT / 'scenario/warzonetowers-beginner.json').read_text()) == old_challenge,
            'Beginner challenge changed beyond the internal native identifier')
    return {'passed': True, 'emulatorUsed': False, 'gameplayVerified': False,
            'scope': 'Source names and native 20-byte save buffer contract; no real native save/load execution.',
            'nativeMaxLevelSize': 20, 'maximumAllowedUtf8Bytes': 19, 'levelCount': len(records),
            'changedInternalLevelNames': {OLD: NEW}, 'uiCatalogOtherwiseUnchanged': True,
            'challengeOtherwiseUnchanged': True, 'routerOnlyNameMatchChanged': True,
            'addonRegistrationOnlyNameChanged': True, 'allLevels': records}


if __name__ == '__main__':
    print(json.dumps(check(), indent=2))
