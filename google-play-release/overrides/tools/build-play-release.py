"""Build the signed Play APK and AAB without storing signing credentials."""
from pathlib import Path
import argparse, getpass, os, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keystore', default=os.environ.get('WZ_RELEASE_KEYSTORE'))
    parser.add_argument('--alias', default=os.environ.get('WZ_RELEASE_KEY_ALIAS', 'key0'))
    parser.add_argument('--java-home', default=os.environ.get('JAVA_HOME'))
    parser.add_argument('--android-sdk', default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT'))
    parser.add_argument('--test-ads', action='store_true', help='Use Google sample rewarded-ad IDs instead of publisher IDs.')
    parser.add_argument('--online', action='store_true', help='Allow Gradle to fetch missing dependencies.')
    parser.add_argument('--bundle-only', action='store_true', help='Retry bundle packaging without rebuilding a previously validated APK.')
    args = parser.parse_args()
    if not args.keystore or not Path(args.keystore).is_file():
        parser.error('Provide an existing private keystore through --keystore or WZ_RELEASE_KEYSTORE.')
    if not args.java_home or not (Path(args.java_home)/'bin/java.exe').is_file():
        parser.error('Set JAVA_HOME or provide --java-home for the installed JDK.')
    if not args.android_sdk or not Path(args.android_sdk).is_dir():
        parser.error('Set ANDROID_HOME or provide --android-sdk for the installed Android SDK.')
    env = os.environ.copy()
    env['JAVA_HOME'] = str(Path(args.java_home).resolve())
    env['ANDROID_HOME'] = str(Path(args.android_sdk).resolve())
    env['WZ_RELEASE_KEYSTORE'] = str(Path(args.keystore).resolve())
    env['WZ_RELEASE_KEY_ALIAS'] = args.alias
    env['WZ_RELEASE_STORE_PASSWORD'] = env.get('WZ_RELEASE_STORE_PASSWORD') or getpass.getpass('Keystore password: ')
    env['WZ_RELEASE_KEY_PASSWORD'] = env.get('WZ_RELEASE_KEY_PASSWORD') or env['WZ_RELEASE_STORE_PASSWORD']
    env['PATH'] = str(Path(args.java_home)/'bin') + os.pathsep + env.get('PATH', '')
    tasks = [':app:bundleRelease'] if args.bundle_only else [':app:clean', ':app:assembleRelease', ':app:bundleRelease']
    command = [str(ROOT/'gradlew.bat'), *tasks,
               '-PplayStoreBuild=true', '-PadmobLiveAds='+str(not args.test_ads).lower(),
               '--no-daemon', '--console=plain',
               '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -XX:-HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8']
    if not args.online:
        command.append('--offline')
    result = subprocess.run(command, cwd=ROOT, env=env)
    raise SystemExit(result.returncode)

if __name__ == '__main__':
    main()
