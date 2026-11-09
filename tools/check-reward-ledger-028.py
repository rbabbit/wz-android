"""Run the actual reward wallet on the host JVM; no Android/emulator is launched."""
from pathlib import Path
from hashlib import file_digest
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
    'tools/reward-ledger-fixture/android/content/Context.java',
    'tools/reward-ledger-fixture/android/content/SharedPreferences.java',
]


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
    javac, java = jdk / ('bin/javac' + suffix), jdk / ('bin/java' + suffix)
    javac_command = str(javac) if javac.exists() else shutil.which('javac')
    java_command = str(java) if java.exists() else shutil.which('java')
    if not javac_command or not java_command:
        raise SystemExit('Supply --jdk or JAVA_HOME for a local JDK.')
    output = ROOT / 'build/reward-ledger-028'
    output.mkdir(parents=True, exist_ok=True)
    subprocess.run([javac_command, '-cp', str(jar), '-d', str(output)]
                   + [str(ROOT / name) for name in SOURCES], check=True)
    result = subprocess.run([java_command, '-cp', str(output) + os.pathsep + str(jar),
                             'com.rbabbit.blocknight.warzone.RewardLedgerCheck028'],
                            check=True, capture_output=True, text=True)
    checks = [line[5:] for line in result.stdout.splitlines() if line.startswith('PASS ')]
    record = {
        'version': '0.28', 'emulatorUsed': False, 'androidPersistenceExecuted': False,
        'actualLedgerAndStoreExecutedOnJVM': True, 'checksPassed': len(checks), 'checks': checks,
        'scope': 'Actual RewardCatalog, RewardLedger and RewardStore execute with real host JSON parsing. '
                 'Only Android Context/SharedPreferences I/O is simulated, including failed writes. '
                 'This does not establish Android gameplay, native bonus application or device persistence.',
        'walletPolicy': {
            'savedRuns': 'Pinned runs hold unused reservations; suspended runs permit other Home purchases.',
            'livePurchases': 'Reserve money first; stable pending UUID; commit only native applied journal proof; '
                             'refund only explicit clean rejection, never unknown timeout or partial effects.',
            'savedResume': 'Wave IDs, completion-paid history and consumed quotas remain monotonic across reload. '
                           'Initial old-world packets are gated until full resumed inventory proof; a latest-live-transaction '
                           'journal floor rejects delayed pre-purchase inventory. Partial pending proofs during load settle '
                           'purchase identity without clamping incomplete old-world counts.',
        },
        'hostJSONDependency': {'maven': 'org.json:json:20240303', 'path': str(jar), 'sha256': digest(jar)},
        'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in SOURCES + ['tools/check-reward-ledger-028.py']],
    }
    report = ROOT / 'archive/reward-ledger-0.28-checks.json'
    report.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(result.stdout.splitlines()[-1])
    print('Report SHA256 ' + digest(report))


if __name__ == '__main__':
    main()
