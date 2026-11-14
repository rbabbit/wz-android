"""Exercise the actual three-mode save store on the JVM with synthetic native bytes."""
from pathlib import Path
from hashlib import file_digest
import json
import os
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
JDK = Path('C:/Program Files/Android/Android Studio/jbr/bin')
OUT = ROOT / 'build/ffa-save-060'
SOURCES = ['app/src/main/java/com/rbabbit/blocknight/warzone/SaveGameStore.java',
    'tools/save-store-fixture/android/content/Context.java', 'tools/check-save-store-027.java',
    'tools/check-campaign-save-051.java', 'tools/check-ffa-save-060.java', 'tools/check-ffa-save-060.py']


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def main():
    jar, = list((Path.home() / '.gradle/caches/modules-2/files-2.1/org.json/json/20240303').glob('*/json-20240303.jar'))
    assert digest(jar) == '3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed'
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(JDK / 'javac.exe'), '-encoding', 'UTF-8', '-cp', str(jar), '-d', str(OUT)]
        + [str(ROOT / name) for name in SOURCES if name.endswith('.java')], check=True, timeout=60)
    checks = []
    for entry in ('CheckFfaSave060', 'CheckCampaignSave051', 'SaveStoreCheck027'):
        result = subprocess.run([str(JDK / 'java.exe'), '-Xmx768m', '-cp', os.pathsep.join((str(OUT), str(jar))),
            'com.rbabbit.blocknight.warzone.' + entry, str(OUT / ('data-' + uuid.uuid4().hex)),
            str(ROOT / 'app/src/main/assets/warzone/levels/catalog.json')], check=True, capture_output=True, text=True, timeout=60)
        print(result.stdout)
        checks.append(dict(main=entry, output=result.stdout))
    record = dict(version='0.60', passed=True, emulatorUsed=False, syntheticNativeBytes=True,
        checks=checks, sources=[dict(path=name, sha256=digest(ROOT / name)) for name in SOURCES])
    (ROOT / 'archive/ffa-save-0.60-checks.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
