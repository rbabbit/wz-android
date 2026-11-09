"""Execute actual SaveGameStore on the host JVM with synthetic native-save bytes."""
from pathlib import Path
from hashlib import file_digest
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
JDK = Path('C:/Program Files/Android/Android Studio/jbr/bin')
OUT = ROOT / 'build/save-store-027'
SOURCES = ['app/src/main/java/com/rbabbit/blocknight/warzone/SaveGameStore.java',
           'app/src/main/assets/warzone/levels/catalog.json',
           'tools/save-store-fixture/android/content/Context.java',
           'tools/check-save-store-027.java', 'tools/check-save-store-027.py']


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def main():
    jars = list((Path.home() / '.gradle/caches/modules-2/files-2.1/org.json/json/20240303').glob('*/json-20240303.jar'))
    assert len(jars) == 1, 'Expected one cached org.json:json:20240303 dependency'
    jar = jars[0]
    assert digest(jar) == '3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed', 'Cached JSON dependency differs'
    sources = [{'path': name, 'sha256': digest(ROOT / name)} for name in SOURCES]
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(JDK / 'javac.exe'), '-encoding', 'UTF-8', '-cp', str(jar), '-d', str(OUT)] +
                   [str(ROOT / name) for name in SOURCES if name.endswith('.java')], cwd=ROOT, check=True, timeout=60)
    result = subprocess.run([str(JDK / 'java.exe'), '-Xmx768m', '-cp', os.pathsep.join((str(OUT), str(jar))),
                             'com.rbabbit.blocknight.warzone.SaveStoreCheck027', str(OUT / 'data'),
                             str(ROOT / 'app/src/main/assets/warzone/levels/catalog.json')],
                            cwd=ROOT, text=True, encoding='utf-8', capture_output=True, timeout=60)
    print(result.stdout, end='')
    if result.returncode:
        print(result.stderr, end='')
        raise SystemExit(result.returncode)
    summary = re.search(r'SUMMARY checks=(\d+) groups=(\d+) failures=0', result.stdout)
    assert summary is not None, 'Actual JVM fixture summary missing'
    assert all(digest(ROOT / entry['path']) == entry['sha256'] for entry in sources), 'Checked source changed during fixtures'
    report = {'version': '0.27', 'emulatorUsed': False, 'androidPersistenceExecuted': False,
              'actualSaveGameStoreExecutedOnJVM': True, 'checksPassed': int(summary[1]), 'groupsPassed': int(summary[2]),
              'scope': 'Actual SaveGameStore runs on host Java with real java.nio/ZIP/SHA and cached org.json. Only Context.getFilesDir is replaced by an isolated ignored directory. Synthetic native JSON/map bytes are fixtures, not an engine QuickSave or Android/device persistence observation.',
              'sources': sources, 'checks': [line[5:] for line in result.stdout.splitlines() if line.startswith('PASS ')],
              'fixtureExecution': {'jdk': 'Android Studio bundled JBR javac/java', 'outputDirectory': 'build/save-store-027',
                                   'mainClass': 'com.rbabbit.blocknight.warzone.SaveStoreCheck027', 'timeoutSeconds': 60,
                                   'syntheticNativeSaveBytes': True, 'androidContext': 'Only getFilesDir is simulated'},
              'hostJSONDependency': {'maven': 'org.json:json:20240303', 'sha256': digest(jar)}}
    (ROOT / 'archive/save-store-0.27-checks.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
