"""Build only the signed normal/updater APK using private existing-key inputs."""
from pathlib import Path
import argparse, getpass, os, subprocess

ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keystore',required=True)
    parser.add_argument('--alias',default='AndroidDebugKey')
    parser.add_argument('--java-home',required=True)
    parser.add_argument('--android-sdk',required=True)
    parser.add_argument('--online',action='store_true')
    parser.add_argument('--test-ads',action='store_true')
    args=parser.parse_args()
    assert Path(args.keystore).is_file()
    assert (Path(args.java_home)/'bin/java.exe').is_file()
    assert Path(args.android_sdk).is_dir()
    env=os.environ.copy()
    env.update(JAVA_HOME=str(Path(args.java_home).resolve()),ANDROID_HOME=str(Path(args.android_sdk).resolve()),
               WZ_RELEASE_KEYSTORE=str(Path(args.keystore).resolve()),WZ_RELEASE_KEY_ALIAS=args.alias)
    env['WZ_RELEASE_STORE_PASSWORD']=env.get('WZ_RELEASE_STORE_PASSWORD') or getpass.getpass('Keystore password: ')
    env['WZ_RELEASE_KEY_PASSWORD']=env.get('WZ_RELEASE_KEY_PASSWORD') or env['WZ_RELEASE_STORE_PASSWORD']
    env['PATH']=str(Path(args.java_home)/'bin')+os.pathsep+env.get('PATH','')
    command=[str(ROOT/'gradlew.bat'),':app:clean',':app:assembleRelease','-PplayStoreBuild=false',
             '-PadmobLiveAds='+str(not args.test_ads).lower(),'--no-daemon','--console=plain',
             '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -XX:-HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8']
    if not args.online: command.append('--offline')
    raise SystemExit(subprocess.run(command,cwd=ROOT,env=env).returncode)
if __name__=='__main__': main()
