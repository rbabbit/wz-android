"""Reuse the frozen Back assertions with the new MP music-session fields only."""
from pathlib import Path
import json
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
retained = ROOT / 'tools/check-multiplayer-back-070.py'
script = retained.read_text(encoding='utf-8').split("with tempfile.TemporaryDirectory(prefix='warzone-mp070-back-')")[0]
namespace = {'__file__': str(retained)}
exec(compile(script, str(retained), 'exec'), namespace)
source = namespace['test']
seam = '  private volatile boolean sessionActive;'
assert source.count(seam) == 1
source = source.replace(seam, seam + '\n  private final Object musicPreferenceLock=new Object();\n  private String musicSession="";')
jdk = Path('C:/Program Files/Android/Android Studio/jbr/bin')
with tempfile.TemporaryDirectory(prefix='mp-back-072-') as folder:
    work = Path(folder).resolve()
    assert work.parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('mp-back-072-')
    target = work / 'MultiplayerActivity.java'; target.write_text(source, encoding='utf-8')
    built = subprocess.run([str(jdk / 'javac.exe'), '-encoding', 'UTF-8', str(target)], capture_output=True, text=True)
    assert built.returncode == 0, built.stderr
    ran = subprocess.run([str(jdk / 'java.exe'), '-cp', str(work), 'MultiplayerActivity'], capture_output=True, text=True)
    assert ran.returncode == 0, ran.stderr
    checks = int(re.search(r'(\d+) checks', ran.stdout).group(1))
report = {'passed': True, 'checks': checks, 'emulatorUsed': False, 'scope': 'Actual current Activity Back methods under the unchanged frozen070 behavioral assertions; added music-session fields are inert stubs. JavaScript intentionally never yields.'}
output = ROOT / 'qa/multiplayer-072/back-host.json'; output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
