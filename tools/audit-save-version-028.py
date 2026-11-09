"""Read-only APK capability comparison and native map-name save validation."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = {
    '0.26': 'ab464a5e280e0936b4d486c5a20219bc20e0a9860dab9c014c2ab2dd8f1e0cac',
    '0.27': '5014b70184f120f0f237f33aef730981793b4dc982f255658290e4505370ad51',
}
paths = [
    'app/src/main/assets/warzone/levels/catalog.json',
    'app/src/main/assets/warzone/saved-games.js',
    'app/src/main/assets/warzone/rewards.js',
    'app/src/main/assets/warzone-touch-controls.js',
    'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
    'tools/audit-save-version-028.py',
]

def digest(path):
    return sha256(path.read_bytes()).hexdigest()

def main():
    native = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='save_version_audit')
    artifacts = []
    for version, expected in REFERENCE.items():
        path = ROOT.parent / ('Warzone-Towers-' + version + '.apk')
        actual = digest(path)
        assert actual == expected, 'Preserved APK changed: ' + str(path)
        with ZipFile(path) as apk:
            touch = apk.read('assets/warzone-touch-controls.js').decode('utf-8')
            rewards = apk.read('assets/warzone/rewards.js').decode('utf-8')
            script = apk.read('assets/warzone/warzone2100.js').decode('utf-8')
            data = apk.read('assets/warzone/warzone2100.data')
            _, _, _, index = native['package_call'](script)
            files = {row['filename']: row for row in index['files']}
            aliases = []
            for name in ['/data/mp/addon.lev', '/data/mp/tests/warzonetowers-beginner.json',
                         '/data/mp/tests/towers-config-router-018.js']:
                row = files[name]
                text = data[int(row['start']):int(row['end'])].decode('utf-8')
                aliases.append({'path': name, 'oldOverlongAlias': 'Greenhaven-Beginner-T1' in text,
                                'shortAlias': 'Greenhaven-T1' in text})
            record = {
                'version': version, 'apkSHA256': actual,
                'saveHeader': "makeButton('blocknight-save'" in touch,
                'savedGameHelper': 'assets/warzone/saved-games.js' in apk.namelist(),
                'livePurchaseCommand': "send('add-rewards'" in rewards,
                'resolvedGreenhavenMetadata': aliases,
            }
            expected_new = version == '0.27'
            assert all(record[key] is expected_new for key in ['saveHeader', 'savedGameHelper', 'livePurchaseCommand'])
            assert all(row['shortAlias'] is expected_new and row['oldOverlongAlias'] is not expected_new for row in aliases)
            artifacts.append(record)
    levels = json.loads((ROOT / paths[0]).read_text(encoding='utf-8'))['levels']
    names = [{'id': level['id'], 'nativeName': level['mapName'],
              'utf8Bytes': len(level['mapName'].encode('utf-8'))} for level in levels]
    assert len(names) == 46 and all(0 < row['utf8Bytes'] < 20 for row in names)
    assert next(row for row in names if row['id'] == 'beginner')['nativeName'] == 'Greenhaven-T1'
    report = {
        'version': '0.28', 'emulatorUsed': False, 'gameplayVerified': False,
        'scope': 'Static preserved-APK capability comparison and all native map-name byte lengths. No user-phone access or inferred installed version is claimed.',
        'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in paths],
        'preservedArtifacts': artifacts, 'nativeMapNames': names,
        'screenshotInference': 'The supplied screenshot lacks SAVE and shows a native writeGameFile autosave failure. The absent SAVE capability matches the 0.26 UI; neither the visible autosave filename nor this image alone confirms the installed phone package/version.',
        'sharedNativeWriter': 'Both native autoSave and F7 QuickSave call saveGame -> writeGameFile; the native writer requires aLevelName UTF-8 strlen below MAX_LEVEL_SIZE=20.',
        'automaticSaveInterval': 'The original multiplayer rules schedule autoSave every 10*60*1000 native game milliseconds. Ordinary offline speed-up is limited to 2x; faster debug modes suppress autosaving.',
        'saveListBoundary': 'Home Saved Games lists verified phone ZIP slots created by SAVE. Native engine auto/<folder> files are not automatically imported into that list in 0.27.',
    }
    destination = ROOT / 'archive/save-version-0.28-audit.json'
    destination.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'staticAuditPassed': True, 'preservedAPKs': 2, 'nativeNamesPassed': len(names),
                      'phoneVersionConfirmed': False, 'emulatorUsed': False,
                      'report': str(destination), 'sha256': digest(destination)}))

if __name__ == '__main__':
    main()
