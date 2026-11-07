"""Verify scoped source-built native preview inputs; this does not certify gameplay."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import argparse, json, tarfile

ROOT = Path(__file__).resolve().parents[1]
digest = lambda data: sha256(data).hexdigest()
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apk', type=Path, required=True)
args = parser.parse_args()
manifest = read(ROOT/'archive/native-blueprint-build.json')
integration = read(ROOT/'qa/test-05/native/native-runtime-integration.json')
probe = read(ROOT/'qa/test-05/native/native-preview-probe.json')
def require(condition, message):
    if not condition:
        raise AssertionError(message)
require(manifest['build']['passed'] and manifest['sourceVersion'] == '4.7.0', 'Exact native source build absent')
require(probe['passed'] and probe['ordinaryCases'] == 1932 and probe['afterMismatch'] == 0, 'Native parity probe failed')
require(probe['orderMutations'] == probe['heightChanges'] == 0 and probe['moduleParentUnchanged'] and probe['lineBuildUnchanged'], 'Native visual fix changes gameplay/other build paths')
require(integration['passed'] and integration['generatedCodeUnchangedOutsideIndexAndExistingWorkerHook'], 'Generated native runtime integration changed')
require(integration['frozenVirtualFiles'] == 3849 and integration['frozenGeneratedDirectoriesAvailable'], 'Frozen package mapping incomplete')
contract = integration['runtimeContract']
require(contract['missing'] == [] and contract['earlyFSExport'] and contract['fsExportOffset'] < contract['finalRunOffset'], 'Existing early runtime API contract broken')
require(set(contract['baselineExports']) <= set(contract['generatedExports']), 'Existing runtime export missing')
for key in ('sourceBundle', 'patch', 'recipe', 'integrationScript'):
    entry = manifest[key]
    require(digest((ROOT/entry['path']).read_bytes()) == entry['sha256'], 'Native source/provenance differs: '+key)
with tarfile.open(ROOT/manifest['sourceBundle']['path'], 'r:gz') as archive:
    renderer = archive.extractfile('source/src/display3d.cpp').read()
source_patch = read(ROOT/'qa/test-05/native/native-source-patch.json')
require(digest(renderer) == source_patch['patchedSourceSHA256'], 'Bundled native renderer file differs from the built source')
text = renderer.decode('utf-8')
first = text.index('static void renderBuildOrder(')
last = text.index('\nstd::unique_ptr<Blueprint> playerBlueprint', first)
require(digest(text[first:last].strip().encode('utf-8')) == probe['rendererAfterSHA256'], 'Bundled native renderer function differs from the compiled probe')
require(digest((ROOT/'tools/native-preview-probe.cpp').read_bytes()) == probe['probeSHA256'], 'Compiled native probe scaffold differs')
patch = (ROOT/manifest['patch']['path']).read_text(encoding='utf-8')
require(patch.count('diff --git ') == 1 and 'diff --git a/src/display3d.cpp b/src/display3d.cpp' in patch, 'Unexpected native game source changes')
added = [line for line in patch.splitlines() if line.startswith('+') and not line.startswith('+++')]
require(len(added) == 9 and not [line for line in patch.splitlines() if line.startswith('-') and not line.startswith('---')], 'Native game delta differs from reviewed visual-only addition')
with ZipFile(args.apk) as apk:
    for entry in manifest['runtimeArtifacts']:
        require(digest(apk.read(entry['path'].removeprefix('app/src/main/'))) == entry['sha256'], 'Candidate native runtime differs from source-built pair')
    require(digest(apk.read('assets/warzone/warzone2100.data')) == manifest['frozenData']['sha256'], 'Candidate native data differs')
report = {'passed': True, 'candidateAPK_SHA256': digest(args.apk.read_bytes()), 'sourceBuild': True, 'scopeVerified': True,
          'sourceVersion': manifest['sourceVersion'], 'sourceCommit': manifest['sourceCommit'],
          'nativeGameSourceChanges': ['src/display3d.cpp: nine visual-position lines in renderBuildOrder'],
          'startupCompatibility': 'Explicit early FS export restores the existing mobile loader contract',
          'baselineExports': len(contract['baselineExports']), 'nativeGeometryProbe': probe,
          'frozenVirtualFiles': 3849, 'dataAndActualOrdersAndFoundationRulesPreserved': True,
          'verification': 'Source/build/provenance/API contract checks; exact-APK gameplay and reviewed screenshots are separate'}
(ROOT/'qa/test-05/native-build-verification.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, indent=2))
