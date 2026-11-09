"""Run the actual v0.30 controller against deterministic Android/Google fakes.

Host JVM state-machine evidence only; this does not execute Google's SDK/network.
The frozen 029 fixture is read only to reuse its basic Android SDK stand-ins.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CONTROLLER = 'app/src/main/java/com/rbabbit/blocknight/warzone/RewardedAdsController.java'
CHECK = 'tools/check-rewarded-ads-030.java'
STUBS = dict(runpy.run_path(str(ROOT / 'tools/check-rewarded-ads-029.py'), run_name='fixture029')['STUBS'])
STUBS['android/app/Activity.java'] = '''package android.app;
public class Activity { public static final int MODE_PRIVATE=0;
public Activity getApplicationContext(){return this;}public boolean isFinishing(){return false;}public boolean isDestroyed(){return false;}
public android.content.SharedPreferences getSharedPreferences(String name,int mode){return android.content.SharedPreferences.open(name);} }'''
STUBS['android/content/SharedPreferences.java'] = '''package android.content;
import java.util.*;public class SharedPreferences {
public static final Map<String,SharedPreferences> stores=new HashMap<>();public static final Set<String> accessed=new HashSet<>();
public static boolean failCommit; public static int commits;
public final Map<String,String> values=new HashMap<>();
public static SharedPreferences open(String name){accessed.add(name);return stores.computeIfAbsent(name,k->new SharedPreferences());}
public static void clear(){stores.clear();accessed.clear();failCommit=false;commits=0;}
public String getString(String k,String fallback){return values.getOrDefault(k,fallback);}
public Editor edit(){return new Editor();}public class Editor {
String key,value;public Editor putString(String k,String v){key=k;value=v;return this;}
public boolean commit(){commits++;values.put(key,value);return !failCommit;}}
}'''
STUBS['com/google/android/ump/ConsentInformation.java'] = STUBS['com/google/android/ump/ConsentInformation.java'].replace(
    'public boolean allowed=true,',
    'public int resets; public void reset(){resets++;requested=false;privacyRequired=false;} public boolean allowed=true,')
STUBS['com/google/android/gms/ads/MobileAds.java'] = '''package com.google.android.gms.ads;
import java.util.function.Consumer; public class MobileAds {
public static volatile int requests; public static boolean autoInitialize=true;public static Consumer<Object> pending;
public static void reset(){requests=0;autoInitialize=true;pending=null;}
public static void initialize(Object c,Consumer<Object> callback){requests++;pending=callback;if(autoInitialize)callback.accept(new Object());}
}'''
STUBS['com/google/android/ump/UserMessagingPlatform.java'] = '''package com.google.android.ump;
import android.app.Activity;import java.util.function.Consumer;
public class UserMessagingPlatform {public static ConsentInformation info;public static boolean autoLoad;public static ConsentForm form;
public static int formLoads,privacyShows;public static Consumer<ConsentForm> loadSuccess;
public static Consumer<FormError> loadFailure,privacyDismiss;
public static void reset(){info=new ConsentInformation();autoLoad=true;form=new ConsentForm();loadSuccess=null;loadFailure=null;privacyDismiss=null;formLoads=privacyShows=0;}
public static ConsentInformation getConsentInformation(Object c){return info;}
public static void loadConsentForm(Object c,Consumer<ConsentForm> good,Consumer<FormError> bad){formLoads++;loadSuccess=good;loadFailure=bad;if(autoLoad)good.accept(form);}
public static void showPrivacyOptionsForm(Activity a,Consumer<FormError> callback){privacyShows++;privacyDismiss=callback;}
}'''


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jdk', type=Path)
    args = parser.parse_args()
    jdk = args.jdk or Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr'))
    suffix = '.exe' if os.name == 'nt' else ''
    javac, java = jdk / ('bin/javac' + suffix), jdk / ('bin/java' + suffix)
    javac_command = str(javac) if javac.exists() else shutil.which('javac')
    java_command = str(java) if java.exists() else shutil.which('java')
    if not javac_command or not java_command:
        raise SystemExit('Supply --jdk or JAVA_HOME for a local JDK.')
    output = ROOT / 'build/rewarded-ads-030'
    source, classes = output / 'stubs', output / 'classes'
    classes.mkdir(parents=True, exist_ok=True)
    files = []
    for name, value in STUBS.items():
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')
        files.append(str(path))
    subprocess.run([javac_command, '-encoding', 'UTF-8', '-d', str(classes), str(ROOT / CONTROLLER), str(ROOT / CHECK)] + files, check=True)
    result = subprocess.run([java_command, '-cp', str(classes), 'com.rbabbit.blocknight.warzone.RewardedAdsCheck030'],
                            capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)
    checks = [line[5:] for line in result.stdout.splitlines() if line.startswith('PASS ')]
    record = {
        'version': '0.30', 'emulatorUsed': False, 'actualAdsExecuted': False,
        'googleSDKExecuted': False, 'actualControllerExecutedOnJVM': True,
        'checksPassed': len(checks), 'checks': checks,
        'scope': 'Actual RewardedAdsController with deterministic fake Google/Android callbacks and fake durable Host wallet. '
                 'Checks quiet startup, deliberate consent/ad chain, asynchronous host restoration, cancellation, '
                 'background, stale callbacks, network/initialization timeouts, once-only credit and recovery. '
                 'Does not establish device/network/SDK consent or gameplay behavior.',
        'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in
                    [CONTROLLER, CHECK, 'tools/check-rewarded-ads-030.py', 'tools/check-rewarded-ads-029.py']],
    }
    report = ROOT / 'archive/rewarded-ads-0.30-controller-checks.json'
    report.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(result.stdout.strip())
    print('Controller fixture checks: ' + str(len(checks)))


if __name__ == '__main__':
    main()
