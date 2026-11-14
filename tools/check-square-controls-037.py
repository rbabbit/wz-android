"""Check v0.37 CSS-only preservation; never claim rendered UI acceptance."""
from pathlib import Path
from datetime import datetime, timezone
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/package-37-square-controls.py'), run_name='check_037_helpers')
baseline, source = helpers['baseline_paths']()
record = helpers['validate_source'](source)
checks = [
    'Frozen v0.36 APK, complete source ZIP and checksum fallback retain their pinned hashes',
    'Baseline manifest covers every source ZIP entry except itself',
    'The only changed original app source/asset is towers-shell.css; app inventory adds or removes no files',
    'All other original source outside documentation/QA remains byte-identical, including native overlays, tools and provenance',
    'Gradle changes only versionCode 36→37 and versionName 0.36→0.37, retaining SDKs and build settings',
    'Native runtime/data, all models/maps/music, code for six actions and footer, wallet/saves and ad controller remain frozen',
]
record.update({'version': '0.37', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'checksPassed': len(checks), 'checks': checks,
    'reviewScope': 'Byte preservation and CSS-only source scope; no screenshots, touch or layout acceptance claim.',
    'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
helpers['write_json'](ROOT / helpers['SOURCE_REPORT'], record)
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False,
    'changedAppSources': [v['path'] for v in record['changedAppSources']],
    'preservedOriginalSourceFiles': record['preservedOriginalSourceFiles']}))
