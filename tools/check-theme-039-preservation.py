"""Check v0.39 presentation scope against frozen v0.38; no runtime claims."""
from pathlib import Path
from datetime import datetime, timezone
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/package-39-theme.py'), run_name='check_039_helpers')
baseline, source = helpers['baseline_paths']()
record = helpers['validate_source'](source)
checks = [
    'Frozen v0.38 APK, complete source ZIP and checksum fallback retain pinned hashes',
    'Baseline manifest covers every original source ZIP entry except itself',
    'Changed/new app files are limited to the inspected presentation, Production and monochrome-theme allowlist',
    'Only TowersTheme.java and towers-monochrome.css are added; no original app files are removed',
    'Touch controls differ only by the exact new stylesheet insertion inside the existing non-Duel dual-document loop',
    'Resource XML changes only the brand background and colorAccent; original icon background and v31 style remain frozen',
    'Gradle differs solely by versionCode 38→39 and versionName 0.38→0.39; SDKs/build/signing settings are unchanged',
    'Every other original code/asset/provenance path is byte-identical, including native engine/data/maps/music/world renderer and save/wallet/ads services',
]
record.update({'version': '0.39', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'actualNativeEngineExecuted': False, 'gameplayVerified': False,
    'checksPassed': len(checks), 'checks': checks,
    'reviewScope': 'Presentation-only source preservation; no Android-native screen, gameplay or audio verification.',
    'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
helpers['write_json'](ROOT / helpers['SOURCE_REPORT'], record)
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False,
    'changedAppSources': [v['path'] for v in record['changedAppSources']],
    'addedAppSources': record['addedAppSources'],
    'preservedOriginalSourceFiles': record['preservedOriginalSourceFiles']}))
