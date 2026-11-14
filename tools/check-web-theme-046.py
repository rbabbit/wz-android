"""Focused static palette/state/preservation checks; never launches a runtime."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from datetime import datetime, timezone
import json
import re

ROOT = Path(__file__).resolve().parents[1]
ASSETS = 'app/src/main/assets/'
CSS_NAMES = ('towers-shell.css', 'towers-monochrome.css', 'towers-commands.css',
             'towers-research.css', 'towers-status.css', 'towers-intelligence.css', 'towers-game-controls.css')
SOURCES = [ASSETS + 'warzone/ui/' + n for n in CSS_NAMES] + [ASSETS + 'warzone/index.html']
read = lambda n: (ROOT / n).read_text(encoding='utf-8')
css = {n: read(ASSETS + 'warzone/ui/' + n) for n in CSS_NAMES}
skin, theme = css['towers-game-controls.css'], css['towers-monochrome.css']
checks = []

def check(condition, message):
    if not condition: raise AssertionError(message)
    checks.append(message)

# Contrast is computed from the actual shared source palette, rather than a
# screenshot or assumed screen result. It does not establish rendered contrast.
palette = dict(re.findall(r'--(towers-[a-z-]+):(#\w+);', theme))
def luminance(h):
    a = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]
    a = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in a]
    return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]
def contrast(a, b):
    a, b = sorted((luminance(a), luminance(b)))
    return (b + .05) / (a + .05)
ratios = {}
for state, foreground, background in (
        ('normal', palette['towers-text'], palette['towers-control']),
        ('selected', palette['towers-ink'], palette['towers-selected']),
        ('pressed', palette['towers-text'], palette['towers-pressed']),
        ('secondary', palette['towers-muted'], palette['towers-panel']),
        ('disabled', palette['towers-disabled'], '#1c1c1c')):
    ratios[state] = round(contrast(foreground, background), 2)
check(all(v >= 4.5 for v in ratios.values()), 'Shared normal/selected/pressed/secondary/disabled colour pairs exceed 4.5:1 by source calculation')
check('--wt-button-radius:5px' in skin and not any(t in skin for t in ('border-image', 'button-plate.png', 'button-selected.png', 'clip-path')),
      'Final button skin uses the selected modest rounded rectangle and no clipped raster face')
check(all(t in skin for t in ('--wt-button-ink:var(--towers-ink,#101010)', '--wt-button-ink:var(--towers-text,#f4f4f4)!important',
      '--wt-button-muted:#454545', ':is(:disabled,[aria-disabled=true])', '[aria-busy=true]', ':focus-visible', 'transform:none!important')),
      'Selected and pressed surfaces pair their state ink; disabled/busy/focus preserve actual hit rectangles')
check('img[src*="/ui/icons/"]:not([src$="/crystal.svg"])' in skin and '#blocknight-rewards img' in skin and 'filter:none!important' in skin,
      'Icon inversion is limited to original monochrome UI icons; crystal and item art retain colour')
check('#blocknight-music[aria-expanded=false]' in skin and '#blocknight-tech' in skin,
      'Research emphasis and the closed Music normal state remain explicit')
check(all(t in skin for t in ('#warzone-command-strip', '#lab-ops', '#wt-field-centre', 'background:transparent!important',
      '[data-build-sidebar=true] #lab-ops:not([hidden]) {display:flex!important}', '--wt-dock-clearance:64px')),
      'Header/footer wrappers are transparent and the existing reachable Build dock/clearance rules remain')
old_colours = ('#dce8cf', '#cbdcba', '#b6c99e', '#a8bf8e', '#10170c', '#34412e', '#58634f')
check(all(not any(t in source.lower() for t in old_colours) for source in css.values()),
      'All seven active Towers sheets contain no old sage palette literals')
html = read(ASSETS + 'warzone/index.html')
check(skin.count('  #wt-native-back,') >= 10,
      'Standalone native-menu recovery button receives the same normal/selected/pressed/disabled/focus shape family')
check(all(t in skin for t in ('#wt-sidebar-catalogue>button,', '#blocknight-research-shell.wt-towers-research .bn-tech-card,',
      '#wt-intelligence-list>button', '):is(.wt-pressing,:active):not(:disabled):not([aria-disabled=true]) :is(strong,b,span,small,em)',
      'background:var(--towers-pressed,#151515)!important;')),
      'Flat Build, research-topic and Intelligence rows pair dark pressed fill with white nested labels without frames')
check('data-bs-theme="dark"' in html and '<meta name="theme-color" content="#0c0c0c">' in html,
      'Loader and Bootstrap theme use the same dark startup surface')

# These are source preservation checks only, not tests of gameplay, Android,
# rendering, events or any external service.
fallback = json.loads((ROOT / 'archive/fallback-0.46.json').read_text())
source = next(Path(f['path']) for f in fallback['files'] if f['path'].endswith('-source.zip'))
with ZipFile(source) as prior:
    index = {r['path']: r for r in json.loads(prior.read('archive/repository-files.json'))['files']}
    preserved = []
    for name, row in index.items():
        if name.startswith(ASSETS) and (name.endswith('.js') or name.endswith('.wasm') or name.endswith('.data')):
            actual = sha256((ROOT / name).read_bytes()).hexdigest()
            check_value = actual == row['sha256']
            # A separate worker may update the scoped native theme engine. The
            # web worker still freezes every handwritten JS action/controller.
            if name.endswith(('warzone2100.js', 'warzone2100.wasm', 'warzone2100.data')): continue
            if not check_value: raise AssertionError('Handwritten action JS changed: ' + name)
            preserved.append(name)
    before_html = prior.read(ASSETS + 'warzone/index.html').decode('utf-8')
    scripts = lambda text: re.findall(r'<script\b[^>]*>(.*?)</script>', text, re.S | re.I)
    check(scripts(before_html) == scripts(html), 'Every inline game loader/action script is byte-identical to the complete fallback')
check(bool(preserved), 'All handwritten asset JavaScript controllers retain their fallback SHA256')
report = dict(version='0.46', passed=True, emulatorUsed=False, browserUsed=False, androidRuntimeExecuted=False,
              actualNativeEngineExecuted=False, gameplayVerified=False, screensVerified=False,
              scope='Static source palette contrast, state coverage and preservation checks only; no CSS engine or screen capture.',
              checks=checks, checksPassed=len(checks), sourceContrastRatios=ratios,
              preservedHandwrittenJavaScriptFiles=len(preserved),
              sources=[dict(path=n, sha256=sha256((ROOT / n).read_bytes()).hexdigest()) for n in SOURCES],
              recordedUTC=datetime.now(timezone.utc).isoformat())
(ROOT / 'archive/web-theme-0.46-checks.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(passed=True, checksPassed=len(checks), sourceContrastRatios=ratios,
                     handwrittenJavaScriptPreserved=len(preserved), emulatorUsed=False, screensVerified=False)))
