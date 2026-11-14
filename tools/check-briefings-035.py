"""Record v0.35 preservation/native lineage, without a gameplay/UI claim."""
from pathlib import Path
from datetime import datetime, timezone
from zipfile import ZipFile
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/package-35-briefings.py'), run_name='check_035_helpers')
baseline, source = helpers['baseline_paths']()
record = helpers['validate_source'](source)


class CurrentAssetFiles:
    def read(self, name):
        return (ROOT / 'app/src/main' / name).read_bytes()


with ZipFile(baseline) as old:
    record['nativePayloadPreservation'] = helpers['verify_native'](CurrentAssetFiles(), old)
checks = [
    'Immutable v0.34 APK, complete source ZIP and checksum fallback retain their pinned hashes',
    'Complete baseline manifest covers every source ZIP member except the inventory itself',
    'App additions/changes are limited to native briefings, two images and scoped notice routing',
    'Maps, original music, catalogues, dormant Duel, rewards, wallet, save codec/store and ad controller retain baseline bytes',
    'Gradle differs only by version 0.35; existing pinned SDKs, build settings and LFS rules are retained',
    'Complete original native source plus earlier v0.31/v0.34 overlays are preserved',
    'Cumulative keybind overlay changes only the four camera-alignment notice callsites',
    'Matched runtime/generated loader and any explicit worker-hook integration follow the guarded native build provenance',
    'Frozen native data remains an unchanged prefix; only two banner-text scripts are appended/reindexed',
    'Every other resolved virtual file and original map retains its baseline bytes',
]
record.update({'version': '0.35', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'checksPassed': len(checks), 'checks': checks,
    'reviewScope': 'Source preservation and native lineage only; no runtime, visual or gameplay acceptance claim.',
    'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
helpers['write_json'](ROOT / helpers['SOURCE_REPORT'], record)
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False,
    'changedAppSources': [v['path'] for v in record['changedAppSources']],
    'preservedOriginalSourceFiles': record['preservedOriginalSourceFiles'],
    'changedVFSFiles': record['nativePayloadPreservation']['changedVFSFiles']}))
