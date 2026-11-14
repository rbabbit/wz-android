"""Record source preservation for v0.33; never claim emulator or UI verification."""
from pathlib import Path
from datetime import datetime, timezone
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/package-33-rewards-save.py'), run_name='check_033_helpers')
baseline, source = helpers['baseline_paths']()
record = helpers['validate_source'](source)
checks = [
    'Original v0.32 APK, complete source ZIP and checksum fallback retain their pinned hashes',
    'Pinned complete source ZIP inventory covers every entry except the inventory itself',
    'Every native engine, overlay, map, scenario and non-scoped app source retains its v0.32 bytes',
    'App source has no added or removed files and changes are limited to Rewards/Save/privacy scope',
    'Gradle differs solely by the v0.33 version bump, retaining existing SDK versions and build settings',
    'Bundled soundtrack, all music serving code, storage rules and music notices remain unchanged',
    'Reward ledger, catalogue, save codec/store and native ad controller remain unchanged',
]
record.update({'version': '0.33', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'checksPassed': len(checks), 'checks': checks,
    'reviewScope': 'Source preservation and approved file scope; no UI, touch, native save or purchase behavior claim.',
    'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
helpers['write_json'](ROOT / helpers['SOURCE_REPORT'], record)
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False,
    'changedAppSources': [v['path'] for v in record['changedAppSources']],
    'preservedOriginalSourceFiles': record['preservedOriginalSourceFiles']}))
