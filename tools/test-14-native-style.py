"""Source-only audit of the exact reviewed native Towers style additions."""
from pathlib import Path
from zipfile import ZipFile
import runpy

h=runpy.run_path(str(Path(__file__).with_name('verify-test-14-package.py')),run_name='native14_source_check')
with ZipFile(h['BASE']/'warzone-towers-0.13-source.zip') as baseline:
    proof=h['native_style_only'](baseline)
assert proof['passed'] is True
print('PASS: only the four reviewed visual helpers (including short-height Music), mode-guarded style calls and Towers-only Return border differ; all remaining Java actions/input/Back/preferences/download code match 0.13 and Duel defaults remain preserved. No emulator input.')
