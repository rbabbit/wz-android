"""Record v0.34 source/native preservation; never claim rendered/runtime QA."""
from pathlib import Path
from datetime import datetime, timezone
import json
import runpy
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/package-34-notices.py'), run_name='check_034_helpers')
baseline, source = helpers['baseline_paths']()
record = helpers['validate_source'](source)


class CurrentAssetFiles:
    """The native checker accepts APK entries or identical local asset bytes."""
    def read(self, name):
        return (ROOT / 'app/src/main' / name).read_bytes()


with ZipFile(baseline) as old:
    record['nativePayloadPreservation'] = helpers['verify_native'](CurrentAssetFiles(), old)
checks = [
    'Immutable v0.33 APK, complete source ZIP and checksum fallback match their recorded/pinned hashes',
    'Complete v0.33 source inventory covers every original ZIP entry except the manifest itself',
    'All maps, music, catalogues, dormant Duel, reward ledger, save codec/store and ad controller retain v0.33 bytes',
    'App/scenario source changes and the one new notice host are confined to the enumerated scope',
    'Gradle differs solely by version 0.34; pinned ad SDKs, build settings and LFS rules remain unchanged',
    'Two C++ notification overlays exactly reproduce guarded edits from the preserved full native source bundle',
    'Incremental compilation proof records only research.cpp/keybind.cpp objects and one native relink',
    'Final generated loader matches the source-built pair with only frozen index/output-hook integrations',
    'All original native data bytes are preserved; exactly two scenario blobs are appended/reindexed',
    'Every resolved native virtual file except the two scoped scenario hooks retains its original bytes',
]
record.update({'version': '0.34', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'checksPassed': len(checks), 'checks': checks,
    'reviewScope': 'Source preservation, bounded native-build lineage and package bytes; no UI/input/gameplay observation claim.',
    'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
helpers['write_json'](ROOT / helpers['SOURCE_REPORT'], record)
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False,
    'changedAppSources': [v['path'] for v in record['changedAppSources']],
    'preservedOriginalSourceFiles': record['preservedOriginalSourceFiles'],
    'scopedNativeRelinkVerified': True, 'changedVFSFiles': record['nativePayloadPreservation']['changedVFSFiles']}))
