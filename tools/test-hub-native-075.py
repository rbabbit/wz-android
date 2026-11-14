"""Host-only checks of production Hub policies/lifecycle and six-action Home layout.

Executes verbatim Java policy/Back/lifecycle methods with inert platform boundaries;
executes production geometry using retained font metrics. No Android runtime claim.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone'
JDK = Path('C:/Program Files/Android/Android Studio/jbr/bin')
HUB = JAVA / 'HubView.java'
HOME = JAVA / 'HomeModesView.java'
LAYOUT = JAVA / 'HomeMenuLayout.java'
MAIN = JAVA / 'MainActivity.java'
GRAPHICS = JAVA / 'GraphicsSetupView.java'
checks = []


def check(name, value):
    assert value, name
    checks.append({'name': name, 'passed': True})


def method(source, signature):
    start = source.index(signature)
    brace = source.index('{', start)
    depth = 1
    # These methods have no Java strings with literal braces except Back's JS
    # strings, which balance; counting the actual method's braces is sufficient.
    pos = brace + 1
    while depth:
        if source[pos] == '{':
            depth += 1
        elif source[pos] == '}':
            depth -= 1
        pos += 1
    return source[start:pos]


hub = HUB.read_text(encoding='utf-8')
home = HOME.read_text(encoding='utf-8')
main = MAIN.read_text(encoding='utf-8')
graphics = GRAPHICS.read_text(encoding='utf-8')
check('Hub has no native/game JavaScript interface', 'addJavascriptInterface' not in hub)
check('Only local Hub document starts the reader', 'browser.loadUrl(START_URL)' in hub and '/assets/hub/index.html' in hub)
check('File/content access denied; mixed content denied', all(s in hub for s in (
    'setAllowFileAccess(false)', 'setAllowContentAccess(false)', 'MIXED_CONTENT_NEVER_ALLOW')))
check('Local CSP denies remote code and frames', all(s in hub for s in (
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "worker-src 'self'", "frame-src 'none'", 'nosniff')))
check('Only public subresource GETs can pass interception while active', all(s in hub for s in (
    '!disposed && !paused && !request.isForMainFrame()', 'publicData(uri, request.getMethod())', 'dataDestination(request.getRequestHeaders())')))
check('Lifecycle visibility reaches background request interception', 'volatile boolean disposed, paused' in hub)
check('External source requires a user gesture and stays in external browser', all(s in hub for s in (
    'request.hasGesture() && sourceLink(uri)', 'new Intent(Intent.ACTION_VIEW, uri)')))
check('Native Back shares reserved HTML header slot with full48dp hit/compact inset face', 'new LayoutParams(dp(84), dp(48), Gravity.TOP | Gravity.RIGHT)' in hub and '0, dp(8), 0, dp(8)' in hub and 'addView(browser, new LayoutParams(-1, -1))' in hub)
check('IME and cutout/system insets handled locally', all(s in hub for s in (
    'WindowInsets.Type.ime()', 'WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()', 'getDisplayCutout()', 'requestApplyInsets()')))
check('Lifecycle custom events, hard WebView cleanup, no global timer pause', all(s in hub for s in (
    "new Event('warzone-hub-pause')", "new Event('warzone-hub-resume')", 'browser.stopLoading()', 'browser.destroy()')) and 'pauseTimers' not in hub)
for action in ('actions.campaign()', 'chooseMap.run()', 'actions.ffa()', 'actions.multiplayer()', 'actions.guide()', 'actions.hub()'):
    check('Home action retained once: ' + action, home.count(action) == 1)
check('Home uses measured native scaled text without shrinking', all(s in home for s in (
    'getPaint().measureText', 'getFontMetricsInt', 'COMPLEX_UNIT_SP', 'index >= 4 ? 14 : 16')) and 'fitButtonText' not in home)

# Prove MainActivity's pre-existing game flows and Graphics implementation are
# byte-for-text unchanged after removing only the narrowly added Hub wiring.
fallback = json.loads((ROOT / 'qa/hub-075/fallback-0.75.json').read_text())
source_zip = next(Path(v['path']) for v in fallback['immutableFallbacks'] if v['path'].endswith('.zip'))
with zipfile.ZipFile(source_zip) as archive:
    def old_source(name):
        names = [n for n in archive.namelist() if n == 'app/src/main/java/com/rbabbit/blocknight/warzone/' + name]
        assert len(names) == 1, (name, names)
        return archive.read(names[0]).decode('utf-8').replace('\r\n', '\n')
    normalized = main.replace('  private HubView hubView;\n', '')
    normalized = normalized.replace('              @Override\n              public void hub() { showHub(); }\n', '')
    normalized = normalized.replace('guideView != null || hubView != null || graphicsSetup', 'guideView != null || graphicsSetup')
    for signature in ('  private void showHub()', '  private void closeHub()'):
        normalized = normalized.replace(method(normalized, signature) + '\n\n', '')
    for added in ('    if (hubView != null) hubView.pause();\n', '    if (hubView != null) hubView.resume();\n', '    closeHub();\n',
                  '    if (hubView != null) {\n      hubView.back();\n      return;\n    }\n'):
        normalized = normalized.replace(added, '')
    check('MainActivity original game/navigation/music/save flows unchanged from preserved074 source', normalized == old_source('MainActivity.java'))
    check('GraphicsSetupView unchanged except new Hub callback', graphics.replace('        void hub();\n', '') == old_source('GraphicsSetupView.java'))

policy = '\n'.join(method(hub, signature) for signature in (
    'private static boolean trusted(', 'private static boolean allowedAssetPath(', 'private static boolean localAsset(',
    'private static boolean localDocument(', 'private static boolean publicData(', 'private static boolean dataDestination(',
    'private static boolean sourceLink('))
lifecycle = '\n'.join(method(hub, signature) for signature in (
    'void back()', 'private void clearBack()', 'void pause()', 'void resume()', 'void dispose()'))
template = Path(__file__).with_suffix('.java').read_text(encoding='utf-8')
template = template.replace('/*PRODUCTION_POLICY*/', policy).replace('/*PRODUCTION_LIFECYCLE*/', lifecycle)
geometry = Path(__file__).with_name('test-hub-native-home-075.java').read_text(encoding='utf-8')
with tempfile.TemporaryDirectory(prefix='hub-native-075-') as directory:
    work = Path(directory).resolve()
    assert work.parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('hub-native-075-')
    package = work / 'com/rbabbit/blocknight/warzone'; package.mkdir(parents=True)
    (package / 'HubNativeCheck075.java').write_text(template, encoding='utf-8')
    (package / 'HomeMenuLayout.java').write_bytes(LAYOUT.read_bytes())
    (package / 'HubHomeCheck075.java').write_text(geometry, encoding='utf-8')
    build = subprocess.run([str(JDK / 'javac.exe'), '-encoding', 'UTF-8', '-d', str(work), *map(str, package.glob('*.java'))], capture_output=True, text=True)
    assert build.returncode == 0, build.stderr
    results = {}
    for cls, extra in [('HubNativeCheck075', []), ('HubHomeCheck075', [str(ROOT / 'app/src/main/assets/warzone/ui/Oswald.ttf')])]:
        ran = subprocess.run([str(JDK / 'java.exe'), '-Djava.awt.headless=true', '-cp', str(work), 'com.rbabbit.blocknight.warzone.' + cls, *extra], capture_output=True, text=True)
        assert ran.returncode == 0, ran.stderr + ran.stdout
        results[cls] = json.loads(ran.stdout)
check('Production Hub URL policies passed hostile URL/method/destination matrix', results['HubNativeCheck075']['policiesPassed'])
check('Production Back/lifecycle methods passed inert-platform callback/cancellation cases', results['HubNativeCheck075']['lifecyclePassed'])
check('Production six-action geometry passed retained-font measured labels/insets/nonoverlap', results['HubHomeCheck075']['passed'])

paths = [HUB, HOME, LAYOUT, MAIN, GRAPHICS, Path(__file__), Path(__file__).with_suffix('.java'), Path(__file__).with_name('test-hub-native-home-075.java'), ROOT / 'app/src/main/assets/warzone/ui/Oswald.ttf']
report = {'passed': True, 'version': '0.75', 'emulatorUsed': False, 'actualAndroidViewsExecuted': False,
          'scope': 'Production pure-Java Home layout with host AWT retained font, verbatim Hub policy and Back/lifecycle methods with inert platform boundaries, source-level native wiring and074 preservation. Android rendering/IME/network dispatch not executed.',
          'checks': checks, 'checksPassed': len(checks), 'results': results,
          'sources': [{'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths]}
output = ROOT / 'qa/hub-075/native.json'; output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'passed': True, 'checksPassed': len(checks), 'results': results, 'proof': str(output), 'emulatorUsed': False}))
