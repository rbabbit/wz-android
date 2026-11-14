"""Read-only Home removal/preservation contracts; no Android/emulator execution.

Actual text clipping, scrolling and touch usability require the root-run exact
APK checks. These guards protect existing map selection and Play behavior while
the download controls and visible swipe instruction are removed.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json
import re

ROOT = Path(__file__).resolve().parents[1]
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
FILES = [JAVA + 'GraphicsSetupView.java', JAVA + 'MapPreviewPager.java']


def normalized(value):
    return value.replace('\r\n', '\n')


def method(source, signature):
    start = source.index(signature)
    begin = source.index('{', start)
    depth = 1
    cursor = begin + 1
    while depth:
        if source[cursor] == '{':
            depth += 1
        elif source[cursor] == '}':
            depth -= 1
        cursor += 1
    return source[start:cursor]


def check(name, passed):
    assert passed, name
    checks.append(name)


current = {name: normalized((ROOT / name).read_text(encoding='utf-8')) for name in FILES}
fallback = json.loads((ROOT / 'archive/fallback-0.32.json').read_text(encoding='utf-8'))
source_zip = next(Path(entry['path']) for entry in fallback['files'] if entry['path'].endswith('-source.zip'))
with ZipFile(source_zip) as archive:
    baseline = {name: normalized(archive.read(name).decode('utf-8')) for name in FILES}

home, pager = (current[name] for name in FILES)
old_home, old_pager = (baseline[name] for name in FILES)
checks = []
check('Home has no music/download/cancel controls or download progress state',
      not re.search(r'\b(?:music|musicChecked|musicCached|downloading|cancel|progress)\b', home))
check('Home actions retain Play, Rewards, Saved Games and map updates',
      all(name in method(home, 'interface Actions') for name in ('void start(', 'void rewards(', 'void savedGames(', 'void map(')))
check('Play still settles the actual carousel and launches the selected map/mode/weapon',
      'maps.settleSelection();\n                actions.start("normal", map, matchMode, duelWeapon);' in home)
check('Home keeps an actual vertical ScrollView with a wrap-content panel',
      'scroll.setFillViewport(true);' in home and 'scroll.addView(panel, new ScrollView.LayoutParams(-1, -2));' in home)
check('Home advertises vertical overflow through a fading scroll indicator',
      'scroll.setVerticalScrollBarEnabled(true);' in home and 'scroll.setScrollbarFadingEnabled(true);' in home)
check('Panel reports its full minimum content height instead of clipping it to the viewport',
      'Math.max(h, contentHeight + outer * 2 + messageHeight)' in home)
check('Normal Play control keeps its existing bounded width and 48dp row',
      'Math.min(panelWidth / 2, Math.round(dp(112) * Math.min(1.4f, fontScale)))' in home
      and 'exact(launchActions, panelWidth, dp(48));' in home)
check('Visible swipe instruction is removed while counters remain',
      'Swipe maps' not in pager and 'normalPosition = number + " / " + total;' in pager)

signatures = [
    'void showLevels(', 'void setInteractionEnabled(', 'void settleSelection(',
    'private void decorate()', 'private void snapToPage(',
    '@Override public void fling(', '@Override protected void onLayout(',
    '@Override protected void onScrollChanged(', '@Override public boolean onInterceptTouchEvent(',
    '@Override public boolean onTouchEvent(', '@Override public void onInitializeAccessibilityNodeInfo(',
    '@Override public boolean performAccessibilityAction(', '@Override protected void onDetachedFromWindow()',
]
for signature in signatures:
    check('Map behavior preserved: ' + signature, method(pager, signature) == method(old_pager, signature))
check('Accessible next/previous map arrows remain available',
      'Next map, or swipe left' in pager and 'Previous map, or swipe right' in pager
      and "snapToPage(selectedIndex + (forward ? 1 : -1));" in pager)
for signature in ['String selectedMap()', 'String selectedMatchMode()', 'String selectedDuelWeapon()', 'private void rememberMap()']:
    check('Launcher selection contract preserved: ' + signature,
          method(home, signature) == method(old_home, signature))
check('Map previews still load the authored preview asset with no substituted image',
      method(pager, 'private final class MapImage') == method(old_pager, 'private final class MapImage'))
check('Launch/wallet errors retain their visible message path',
      'void showError(String value) { showStatus(value, true); }' in home
      and method(home, 'void showStatus(') == method(old_home, 'void showStatus('))

report = {
    'version': '0.32', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
    'checksPassed': len(checks), 'checks': checks,
    'scope': 'Home source removal and unchanged map/Play behavior contracts only.',
    'limitation': 'This does not establish rendered layout, real small-phone scrolling or touch acceptance.',
    'baselineSourceZIP': str(source_zip),
    'sources': [{'path': name, 'sha256': sha256((ROOT / name).read_bytes()).hexdigest()} for name in FILES]
}
(ROOT / 'archive/home-0.32-source-checks.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'checksPassed': len(checks), 'emulatorUsed': False, 'androidRuntimeExecuted': False}))
