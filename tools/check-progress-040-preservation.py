"""Check v0.40's bounded progress/contrast source scope; no runtime claims."""
from pathlib import Path
from datetime import datetime, timezone
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/package-40-progress.py'), run_name='check_040_helpers')
baseline, source = helpers['baseline_paths']()
record = helpers['validate_source'](source)
native = helpers['verify_native_sources']()
record['nativeSourceProvenance'] = native
record['sources'] += native['proofInputs']
checks = [
    'Frozen v0.39 APK, complete source ZIP and checksum fallback retain pinned sizes and hashes',
    'Baseline manifest covers every original source ZIP entry except itself',
    'Only status UI, main Production, focused monochrome overrides, the commands adapter and matched native assets may change',
    'No app source or asset is added or removed; all Java and Android resource source bytes remain frozen',
    'Gradle differs solely by versionCode 39→40 and versionName 0.39→0.40; SDK/build/signing settings remain frozen',
    'Every other original source, artwork, prior native overlay, tool, report, map/music asset and save/wallet/ad service remains byte-identical',
    'The complete original native source plus only the additive Towers factory observer reconstructs the archived quickjs_backend.cpp exactly',
    'Native provenance records one quickjs_backend.cpp object compile and one matched link, preserving all four earlier native fixes',
]
record.update({'version': '0.40', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'actualNativeEngineExecuted': False, 'gameplayVerified': False,
    'checksPassed': len(checks), 'checks': checks,
    'reviewScope': 'Bounded source preservation only. Native build/integration provenance is verified separately during APK packaging; no gameplay or rendered Android acceptance claim.',
    'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
helpers['write_json'](ROOT / helpers['SOURCE_REPORT'], record)
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False,
    'changedAppSources': [v['path'] for v in record['changedAppSources']],
    'addedAppSources': record['addedAppSources'],
    'preservedOriginalSourceFiles': record['preservedOriginalSourceFiles']}))
