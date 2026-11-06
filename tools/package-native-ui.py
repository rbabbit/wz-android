"""Package the exact verified v6 Android UI APK and complete editable source."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED
import argparse, json, shutil, subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--candidate', type=Path, required=True)
parser.add_argument('--output', type=Path, default=root.parent)
parser.add_argument('--release', choices=('6.0','6.1','6.2','6.3','6.4'), default='6.0')
args = parser.parse_args()
digest = lambda p: sha256(p.read_bytes()).hexdigest()
candidate_hash = digest(args.candidate)
qa = root/{'6.0':'qa/native-ui/final','6.1':'qa/v6.1-compact/final','6.2':'qa/v6.2-html','6.3':'qa/v6.3-building','6.4':'qa/v6.4-build-display'}[args.release]
summary = json.loads((qa/'summary.json').read_text(encoding='utf8'))
assert summary['passed'] and summary['candidateAPK_SHA256'] == candidate_hash
required = {
    'audit-phone-layout.json', 'audit-remove-research.json', 'audit-editor.json',
    'audit-production.json', 'audit-native-lifecycle.json', 'audit-research.json',
    'audit-native-research-completion.json', 'audit-native-menus-pause-load.json',
    'audit-native-returns.json', 'audit-native-field-toggles.json',
    'audit-native-field.json', 'audit-native-gestures.json',
    'audit-native-build-returns.json', 'audit-native-td1.json', 'audit-screens.json',
    'audit-native-narrow-build.json', 'native-package.json', 'engine-preservation.json',
    'active-module-checks.json', 'source-build-match.json', 'signature-and-fallback.json',
    'checkpoint-restores.json', 'native-transport-files.json',
}
if args.release=='6.2':
    required={'code-checks.json','package-checks.json','signature-and-fallback.json','source-build-match.json'}
    assert summary['emulatorTesting'] is False and summary['gameplayTesting'] is False
if args.release=='6.3':
    required={'code-checks.json','package-checks.json','signature-and-fallback.json','source-build-match.json',
              'audit-smooth-fifo.json','audit-building-returns.json','audit-building-wide.json','audit-building-td1.json',
              'audit-building-visual-return.json'}
    assert summary['emulatorTesting'] is True and summary['gameplayTesting'] is True
if args.release=='6.4':
    required={'code-checks.json','package-checks.json','signature-and-fallback.json','source-build-match.json',
              'audit-build-display.json','audit-build-display-td1.json','audit-display-menu.json'}
    assert summary['emulatorTesting'] is True and summary['gameplayTesting'] is True
if args.release=='6.1':
    required.update({'audit-compact-layout.json','audit-compact-production-removal.json',
                     'audit-compact-enlarged.json','audit-native-cold-start.json',
                     'audit-native-combat.json','design-qa.json'})
    assert set(summary['reportSHA256']) == required, 'Incomplete report digest set'
if args.release in {'6.2','6.3','6.4'}:
    assert set(summary['reportSHA256']) == required, 'Incomplete report digest set'
assert set(summary['requiredReports']) == required, 'Incomplete delivery verification scope'
for name in summary['requiredReports']:
    result = json.loads((qa/name).read_text(encoding='utf8'))
    assert result.get('passed') is True, name
    assert result.get('installedAPK_SHA256', result.get('candidateAPK_SHA256')) == candidate_hash, name
    if args.release in {'6.1','6.2','6.3','6.4'}:
        assert digest(qa/name) == summary['reportSHA256'][name], 'Report changed after delivery summary: '+name
if args.release in {'6.1','6.2','6.3','6.4'}:
    build_record = json.loads((qa/'source-build-match.json').read_text(encoding='utf8'))
    assert build_record.get('buildAPK_SHA256',build_record['candidateAPK_SHA256']) == candidate_hash, 'Clean build differs from candidate'
    for entry in build_record['sourceFiles']:
        assert digest(root/entry['path']) == entry['sha256'], 'Runtime source changed after clean build: '+entry['path']
manifest = json.loads((root/'archive/repository-files.json').read_text(encoding='utf8'))['files']
for entry in manifest:
    file = root/entry['path']
    assert file.is_file() and file.stat().st_size == entry['bytes'] and digest(file) == entry['sha256'], entry['path']
artifact = {'6.0':'Warzone-Towers-v6.0-Android-UI','6.1':'Warzone-Towers-v6.1-Compact-Native','6.2':'Warzone-Towers-v6.2-HTML-Templates','6.3':'Warzone-Towers-v6.3-Smooth-Building','6.4':'Warzone-Towers-v6.4-Build-Blueprints'}[args.release]
apk = args.output/(artifact+'.apk')
source = args.output/{'6.0':'warzone-towers-v6.0-android-ui-source.zip','6.1':'warzone-towers-v6.1-compact-native-source.zip','6.2':'warzone-towers-v6.2-html-templates-source.zip','6.3':'warzone-towers-v6.3-smooth-building-source.zip','6.4':'warzone-towers-v6.4-build-blueprints-source.zip'}[args.release]
assert not source.exists(), 'Preserve existing delivery archives; choose another output directory'
if apk.exists():
    assert digest(apk) == candidate_hash, 'Refusing to overwrite an existing APK'
else:
    shutil.copy2(args.candidate, apk)
names = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode('utf8').split('\0')
excluded = {'.git','.gradle','.kotlin','.idea','build','node_modules','__pycache__'}
files = []
for name in sorted(set(names)):
    file = root/name
    if not name or not file.is_file():
        continue
    relative = Path(name)
    if any(part in excluded for part in relative.parts):
        continue
    if file.suffix in {'.jks','.keystore','.pyc'} or file.name == '.env' or file.name.startswith('.env.'):
        continue
    if name in {'local.properties','tools/live-cdp-url.txt'}:
        continue
    files.append((name,file))
temporary = source.with_suffix('.zip.partial')
with ZipFile(temporary,'w',compression=ZIP_DEFLATED,compresslevel=5) as zipped:
    for name,file in files:
        zipped.write(file,name)
with ZipFile(temporary) as zipped:
    assert zipped.testzip() is None
    for entry in manifest:
        assert sha256(zipped.read(entry['path'])).hexdigest() == entry['sha256'], entry['path']
    ui_source='app/src/main/java/com/rbabbit/blocknight/warzone/'+('MainActivity.java' if args.release in {'6.2','6.3','6.4'} else 'TowersNativeUi.java')
    assert zipped.read(ui_source) == (root/ui_source).read_bytes()
    assert json.loads(zipped.read((qa/'summary.json').relative_to(root).as_posix()))['candidateAPK_SHA256'] == candidate_hash
    assert not any(n.endswith(('.jks','.keystore')) or n in {'local.properties','tools/live-cdp-url.txt'} for n in zipped.namelist())
temporary.replace(source)
checksums = args.output/(artifact+'-SHA256.txt')
checksums.write_text(''.join(f'{digest(file)}  {file.name}\n' for file in (apk,source)),encoding='utf8')
print(json.dumps({'apk':str(apk),'source':str(source),'checksums':str(checksums),'sourceFiles':len(files),'candidateAPK_SHA256':candidate_hash,'sourceZIP_SHA256':digest(source)},indent=2))
