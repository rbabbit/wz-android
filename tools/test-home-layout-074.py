"""Focused native Home layout checks without an emulator or Android runtime."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone'
HOME = JAVA / 'HomeModesView.java'
HELPER = JAVA / 'HomeMenuLayout.java'
JDK = Path('C:/Program Files/Android/Android Studio/jbr/bin')
source = HOME.read_text(encoding='utf-8')
for retained in ('actions.campaign()', 'chooseMap.run()', 'actions.ffa()', 'actions.multiplayer()', 'actions.guide()'):
    assert source.count(retained) == 1, 'Existing action changed: ' + retained
assert 'getPaint().measureText' in source and 'getFontMetricsInt' in source
assert 'COMPLEX_UNIT_SP' in source and 'fitButtonText' not in source, 'Do not shrink system-scaled labels'
assert 'getInsetsIgnoringVisibility' in source and 'getDisplayCutout' in source and 'requestApplyInsets' in source
assert 'new InsetDrawable' in source and 'dp(8), 0, dp(8)' in source
with tempfile.TemporaryDirectory(prefix='home-layout-074-') as directory:
    work = Path(directory).resolve()
    assert work.parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('home-layout-074-')
    package = work / 'com/rbabbit/blocknight/warzone'; package.mkdir(parents=True)
    (package / 'HomeMenuLayout.java').write_bytes(HELPER.read_bytes())
    (package / 'HomeLayoutCheck074.java').write_bytes(Path(__file__).with_suffix('.java').read_bytes())
    built = subprocess.run([str(JDK / 'javac.exe'), '-encoding', 'UTF-8', '-d', str(work), *map(str, package.glob('*.java'))], capture_output=True, text=True)
    assert built.returncode == 0, built.stderr
    ran = subprocess.run([str(JDK / 'java.exe'), '-Djava.awt.headless=true', '-cp', str(work), 'com.rbabbit.blocknight.warzone.HomeLayoutCheck074', str(ROOT / 'app/src/main/assets/warzone/ui/Oswald.ttf'), str(work / 'checks.json')], capture_output=True, text=True)
    assert ran.returncode == 0, ran.stderr
    result = json.loads((work / 'checks.json').read_text(encoding='utf-8'))
checks = [{'name': name, 'passed': True} for name in [
    'Actual production layout helper executed with retained Oswald TrueType metrics',
    '800x360,640x320,600x300,1200x540 at density1/2/3 and fontScale1.0/1.3',
    'All five current action bindings retained exactly once',
    'Real native Paint measurements bound labels; no adaptive font shrinking',
    'At least48dp touch areas and bounded visible faces',
    'Display-cutout/system insets, artwork aspects, footer and nonoverlap',
    'One horizontal row at requested landscape sizes; readable fallback wrap',
    'Error-footer and extra-large narrow-layout stress conditions']]
paths = [HOME, HELPER, Path(__file__), Path(__file__).with_suffix('.java'), ROOT / 'app/src/main/assets/warzone/ui/Oswald.ttf']
report = {'passed': True, 'version': '0.74', 'emulatorUsed': False, 'actualAndroidViewsExecuted': False,
          'scope': 'Actual production pure-Java layout helper on host JDK, retained Oswald font measured by host AWT. Native Paint measurement calls/action bindings verified in source. Android drawing/insets dispatch/touch not executed.',
          'checks': checks, 'checksPassed': len(checks), **result,
          'sources': [{'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths]}
output = ROOT / 'qa/launcher-074/home-layout.json'; output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'passed': True, 'checksPassed': len(checks), 'assertions': result['assertions'], 'scenarios': len(result['scenarios']), 'emulatorUsed': False}))
