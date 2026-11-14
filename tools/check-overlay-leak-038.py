"""Record v0.38 preservation; no emulator or historical gameplay suites."""
from pathlib import Path
from datetime import datetime, timezone
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/package-38-overlay-leak.py'), run_name='check_038_helpers')
baseline, source = helpers['baseline_paths']()
record = helpers['validate_source'](source)
checks = [
    'Frozen v0.37 APK, complete source ZIP and checksum fallback retain pinned hashes',
    'Complete baseline manifest covers every source ZIP entry except itself',
    'Only the agreed Intelligence and build-display JavaScript sources differ; no app files are added/removed',
    'Every other original source outside documentation/QA remains byte-identical, including native source/runtime/provenance',
    'Gradle changes only versionCode 37→38 and versionName 0.37→0.38, retaining SDKs and build settings',
    'All maps/models/music, Java, rules, saves/wallet, advertising, icons/fonts and existing square-control CSS remain frozen',
]
record.update({'version': '0.38', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'gameplayVerified': False, 'checksPassed': len(checks), 'checks': checks,
    'reviewScope': 'Source preservation only; regression fixtures/build do not establish Android GPU or gameplay behavior.',
    'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
helpers['write_json'](ROOT / helpers['SOURCE_REPORT'], record)
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False,
    'changedAppSources': [v['path'] for v in record['changedAppSources']],
    'preservedOriginalSourceFiles': record['preservedOriginalSourceFiles']}))
