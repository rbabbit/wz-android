"""Record v0.36 preservation/native lineage; never claim emulator/gameplay QA."""
from pathlib import Path
from datetime import datetime, timezone
from zipfile import ZipFile
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/package-36-intelligence.py'), run_name='check_036_helpers')
baseline, source = helpers['baseline_paths']()
record = helpers['validate_source'](source)


class CurrentAssetFiles:
    def read(self, name):
        return (ROOT / 'app/src/main' / name).read_bytes()


with ZipFile(baseline) as old:
    record['nativePayloadPreservation'] = helpers['verify_native'](CurrentAssetFiles(), old)
checks = [
    'Immutable v0.35 APK, complete source ZIP and checksum fallback retain pinned hashes',
    'Complete baseline manifest accounts for every source ZIP member except the manifest itself',
    'App changes/additions are confined to the enumerated Demolish and Intelligence source paths',
    'All maps/music/catalogues, dormant Duel, wallet/reward policy, save codec/store and ad controller retain baseline bytes',
    'Gradle differs only by version 0.36; existing SDKs, build settings and LFS rules are retained',
    'Complete native source and prior v0.31/v0.34/v0.35 overlays remain unchanged',
    'The hci.cpp overlay exactly reconstructs the helper and its three lifecycle hooks from original source',
    'Successful native build compiles only hci.cpp and links once; the prior failed compile remains disclosed',
    'Matched generated runtime retains the exact original worker hook, authored index and data before Demolish integration',
    'Only the existing command adapter is appended/reindexed; all other 4,291 resolved VFS files retain baseline bytes',
]
record.update({'version': '0.36', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'checksPassed': len(checks), 'checks': checks,
    'reviewScope': 'Source preservation and native package lineage; no visual/input/audio/gameplay acceptance claim.',
    'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
helpers['write_json'](ROOT / helpers['SOURCE_REPORT'], record)
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False,
    'changedAppSources': [v['path'] for v in record['changedAppSources']],
    'addedAppSources': record['addedAppSources'],
    'preservedOriginalSourceFiles': record['preservedOriginalSourceFiles'],
    'changedVFSFiles': record['nativePayloadPreservation']['changedVFSFiles']}))
