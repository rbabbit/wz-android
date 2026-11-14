"""Execute actual completion/wallet policy on the host JVM, with simulated Android I/O."""
from pathlib import Path
from hashlib import file_digest, sha256
import argparse
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    'app/src/main/java/com/rbabbit/blocknight/warzone/RewardCatalog.java',
    'app/src/main/java/com/rbabbit/blocknight/warzone/RewardLedger.java',
    'app/src/main/java/com/rbabbit/blocknight/warzone/RewardStore.java',
    'tools/check-reward-ledger-028.java',
    'tools/check-reward-ledger-029.java',
    'tools/check-completion-058.java',
    'tools/reward-ledger-fixture/android/content/Context.java',
    'tools/reward-ledger-fixture/android/content/SharedPreferences.java',
]
CATALOG = 'app/src/main/assets/warzone/levels/catalog.json'


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json-jar', type=Path)
    parser.add_argument('--jdk', type=Path)
    args = parser.parse_args()
    jar = args.json_jar
    if jar is None:
        cached = Path.home() / '.gradle/caches/modules-2/files-2.1/org.json/json/20240303'
        jar = next(cached.rglob('json-20240303.jar'), None) if cached.exists() else None
    if jar is None or not jar.is_file():
        raise SystemExit('Supply --json-jar for the host-only org.json:json:20240303 fixture dependency.')
    jdk = args.jdk or Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr'))
    suffix = '.exe' if os.name == 'nt' else ''
    javac = jdk / ('bin/javac' + suffix); java = jdk / ('bin/java' + suffix)
    javac_command = str(javac) if javac.exists() else shutil.which('javac')
    java_command = str(java) if java.exists() else shutil.which('java')
    if not javac_command or not java_command:
        raise SystemExit('Supply --jdk or JAVA_HOME for a local JDK.')
    output = ROOT / 'build/completion-058'; output.mkdir(parents=True, exist_ok=True)
    # Preserve the historical fixture. Only its expected output-schema literal
    # changes in a generated build-directory copy; all economic checks stay intact.
    old = (ROOT / 'tools/check-reward-ledger-028.java').read_text(encoding='utf-8')
    expected = 'getInt("version")==3'
    if old.count(expected) != 1:
        raise SystemExit('Historical schema assertion changed; inspect before adapting it.')
    adapted = old.replace(expected, 'getInt("version")==4').replace(
        'migration persists version3 and valid next-match quantities',
        'migration persists current version4 and valid next-match quantities')
    adapted_path = output / 'check-reward-ledger-028.java'
    adapted_path.write_text(adapted, encoding='utf-8', newline='\n')
    compile_sources = [adapted_path if name == 'tools/check-reward-ledger-028.java' else ROOT / name for name in SOURCES]
    subprocess.run([javac_command, '-cp', str(jar), '-d', str(output)] + [str(p) for p in compile_sources], check=True)
    result = subprocess.run([java_command, '-cp', str(output) + os.pathsep + str(jar),
                             'com.rbabbit.blocknight.warzone.CompletionCheck058', str(ROOT / CATALOG)],
                            check=True, capture_output=True, text=True)
    checks = [line[5:] for line in result.stdout.splitlines() if line.startswith('PASS ')]
    report = {
        'version': '0.58', 'emulatorUsed': False, 'androidPersistenceExecuted': False,
        'actualLedgerAndStoreExecutedOnJVM': True, 'checksPassed': len(checks),
        'baselineWalletAndAdChecks': 241, 'completionChecks': len(checks) - 241, 'checks': checks,
        'scope': 'Actual RewardCatalog, RewardLedger and RewardStore execute on the host JVM with real JSON parsing. '
                 'Only Android Context/SharedPreferences I/O is simulated, including failed writes and process-like restarts. '
                 'This does not establish native victory callbacks, Android persistence, UI badges or gameplay.',
        'schemaFixtureAdaptation': {
            'historicalFixtureUnmodified': True,
            'generatedCopyChanges': 'One expected schema3 literal becomes4, and its descriptive check label follows4; no economic assertions changed.',
            'generatedCopySHA256': sha256(adapted_path.read_bytes()).hexdigest(),
        },
        'policy': {
            'difficultyBonus': 1000, 'categories': {'easy': 16, 'medium': 15, 'hard': 15},
            'completionIDs': 'Read from the real bundled catalog, supplied by Main to the wallet; no map prefix or display-name inference.',
            'nativeWin': 'Map Complete, ordinary win credits, category claim, run difficulty credits and receipt save atomically.',
            'legacyHistory': 'Old completed-map history is retained. Home reconciliation backfills every fully complete unclaimed group once.',
            'replayAndSaves': 'Persistent category flags prevent Home, replayed maps and older paid saved runs from duplicating the bonus.',
            'rollback': 'Failed commits roll back balance, map completion, category flags, run credits and settlement together.',
        },
        'hostJSONDependency': {'maven': 'org.json:json:20240303', 'sha256': digest(jar)},
        'sources': [{'path': name, 'sha256': digest(ROOT / name)}
                    for name in SOURCES + ['tools/check-completion-058.py', CATALOG]],
    }
    target = ROOT / 'archive/completion-0.58-checks.json'
    target.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(result.stdout.splitlines()[-1])
    print('Combined checks passed: ' + str(len(checks)))
    print('Report SHA256 ' + digest(target))


if __name__ == '__main__':
    main()
