"""Exercise the actual ad controller with deterministic fake Android/Google callbacks.

This is a host JVM state-machine fixture, not an SDK/device/ad-network test.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CONTROLLER = 'app/src/main/java/com/rbabbit/blocknight/warzone/RewardedAdsController.java'
CHECK = 'tools/check-rewarded-ads-029.java'
STUBS = {
    'android/app/Activity.java': '''package android.app;
public class Activity { public Activity getApplicationContext(){return this;} public boolean isFinishing(){return false;} public boolean isDestroyed(){return false;} }''',
    'android/os/Build.java': '''package android.os; public class Build { public static String FINGERPRINT="physical",MODEL="phone",HARDWARE="physical"; }''',
    'android/os/Looper.java': '''package android.os; public class Looper {
private static final Thread owner=Thread.currentThread(); private static final Looper MAIN=new Looper();
public static Looper getMainLooper(){return MAIN;} public static Looper myLooper(){return Thread.currentThread()==owner?MAIN:null;} }''',
    'android/os/Handler.java': '''package android.os; import java.util.*; public class Handler {
public static long now; private record Task(long due,long seq,Runnable run){} private static long seq;
private static final PriorityQueue<Task> queue=new PriorityQueue<>(Comparator.comparingLong(Task::due).thenComparingLong(Task::seq));
public Handler(Looper ignored){} public boolean post(Runnable r){return postDelayed(r,0);}
public boolean postDelayed(Runnable r,long ms){synchronized(queue){queue.add(new Task(now+ms,seq++,r));} return true;}
public void removeCallbacksAndMessages(Object ignored){synchronized(queue){queue.clear();}}
public static void clear(){synchronized(queue){queue.clear();now=0;seq=0;}}
public static void ready(){for(int i=0;i<1000;i++){Task t; synchronized(queue){t=queue.peek();if(t==null||t.due>now)return;queue.remove();}t.run.run();}throw new AssertionError("timer loop");}
public static void advance(long ms){now+=ms;ready();} }''',
    'android/os/SystemClock.java': '''package android.os; public class SystemClock {public static long elapsedRealtime(){return Handler.now;}}''',
    'android/util/Log.java': '''package android.util; public class Log {public static int i(String t,String m){return 0;}public static int w(String t,String m){return 0;}}''',
    'com/rbabbit/blocknight/warzone/BuildConfig.java': '''package com.rbabbit.blocknight.warzone; public class BuildConfig {public static boolean ADMOB_TEST_ADS=true; public static final String ADMOB_REWARDED_AD_UNIT_ID="configured-publisher-unit";}''',
    'com/google/android/gms/ads/AdError.java': '''package com.google.android.gms.ads; public class AdError {}''',
    'com/google/android/gms/ads/LoadAdError.java': '''package com.google.android.gms.ads; public class LoadAdError {public int getCode(){return 3;}}''',
    'com/google/android/gms/ads/AdRequest.java': '''package com.google.android.gms.ads; public class AdRequest {public static class Builder {public AdRequest build(){return new AdRequest();}}}''',
    'com/google/android/gms/ads/FullScreenContentCallback.java': '''package com.google.android.gms.ads; public class FullScreenContentCallback {public void onAdDismissedFullScreenContent(){} public void onAdFailedToShowFullScreenContent(AdError e){}}''',
    'com/google/android/gms/ads/MobileAds.java': '''package com.google.android.gms.ads; import java.util.function.Consumer; public class MobileAds {public static int requests;public static void initialize(Object c,Consumer<Object> callback){requests++;callback.accept(new Object());}}''',
    'com/google/android/gms/ads/rewarded/RewardedAdLoadCallback.java': '''package com.google.android.gms.ads.rewarded; import com.google.android.gms.ads.LoadAdError; public class RewardedAdLoadCallback {public void onAdLoaded(RewardedAd a){} public void onAdFailedToLoad(LoadAdError e){}}''',
    'com/google/android/gms/ads/rewarded/RewardedAd.java': '''package com.google.android.gms.ads.rewarded;
import java.util.function.Consumer;import com.google.android.gms.ads.*;import android.app.Activity;
public class RewardedAd {public static boolean autoLoad=true;public static int requests,shows;public static String lastUnit;public static RewardedAd last;
public static RewardedAdLoadCallback loadCallback;public FullScreenContentCallback screen;public Consumer<Object> earned;
public static void reset(){autoLoad=true;requests=shows=0;last=null;lastUnit=null;loadCallback=null;MobileAds.requests=0;}
public static void load(Object context,String id,AdRequest request,RewardedAdLoadCallback callback){requests++;lastUnit=id;loadCallback=callback;if(autoLoad){last=new RewardedAd();callback.onAdLoaded(last);}}
public void setFullScreenContentCallback(FullScreenContentCallback callback){screen=callback;}
public void show(Activity activity,Consumer<Object> listener){shows++;earned=listener;}
public void earn(){earned.accept(new Object());}public void dismiss(){screen.onAdDismissedFullScreenContent();}
public void fail(){screen.onAdFailedToShowFullScreenContent(new AdError());} }''',
    'com/google/android/ump/FormError.java': '''package com.google.android.ump;public class FormError {}''',
    'com/google/android/ump/ConsentRequestParameters.java': '''package com.google.android.ump;public class ConsentRequestParameters {public static class Builder {public ConsentRequestParameters build(){return new ConsentRequestParameters();}}}''',
    'com/google/android/ump/ConsentInformation.java': '''package com.google.android.ump;
import android.app.Activity;import java.util.function.Consumer;
public class ConsentInformation {public static class ConsentStatus {public static final int UNKNOWN=0,NOT_REQUIRED=1,REQUIRED=2,OBTAINED=3;}
public enum PrivacyOptionsRequirementStatus {UNKNOWN,NOT_REQUIRED,REQUIRED}
public boolean allowed=true,requested,autoUpdate=true,required,available=true,privacyRequired;public int requests;
public Runnable updateSuccess;public Consumer<FormError> updateFailure;
public boolean canRequestAds(){return requested&&allowed&&!required;}public int getConsentStatus(){return required?ConsentStatus.REQUIRED:ConsentStatus.NOT_REQUIRED;}
public boolean isConsentFormAvailable(){return available;}
public PrivacyOptionsRequirementStatus getPrivacyOptionsRequirementStatus(){return privacyRequired?PrivacyOptionsRequirementStatus.REQUIRED:PrivacyOptionsRequirementStatus.NOT_REQUIRED;}
public void requestConsentInfoUpdate(Activity a,ConsentRequestParameters p,Runnable good,Consumer<FormError> bad){requests++;requested=true;updateSuccess=good;updateFailure=bad;if(autoUpdate)good.run();} }''',
    'com/google/android/ump/ConsentForm.java': '''package com.google.android.ump;import android.app.Activity;import java.util.function.Consumer;
public class ConsentForm {public int shows;public Consumer<FormError> dismissed;public void show(Activity a,Consumer<FormError> callback){shows++;dismissed=callback;}public void accept(){UserMessagingPlatform.info.required=false;dismissed.accept(null);}}''',
    'com/google/android/ump/UserMessagingPlatform.java': '''package com.google.android.ump;import android.app.Activity;import java.util.function.Consumer;
public class UserMessagingPlatform {public static ConsentInformation info;public static boolean autoLoad;public static ConsentForm form;
public static Consumer<ConsentForm> loadSuccess;public static Consumer<FormError> privacyDismiss;
public static void reset(){info=new ConsentInformation();autoLoad=true;form=new ConsentForm();loadSuccess=null;privacyDismiss=null;}
public static ConsentInformation getConsentInformation(Object c){return info;}
public static void loadConsentForm(Object c,Consumer<ConsentForm> good,Consumer<FormError> bad){loadSuccess=good;if(autoLoad)good.accept(form);}
public static void showPrivacyOptionsForm(Activity a,Consumer<FormError> callback){privacyDismiss=callback;} }''',
}


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
    output = ROOT / 'build/rewarded-ads-029'
    source = output / 'stubs'
    classes = output / 'classes'
    classes.mkdir(parents=True, exist_ok=True)
    files = []
    for name, value in STUBS.items():
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')
        files.append(str(path))
    subprocess.run([javac_command, '-encoding', 'UTF-8', '-d', str(classes), str(ROOT / CONTROLLER), str(ROOT / CHECK)] + files, check=True)
    result = subprocess.run([java_command, '-cp', str(classes), 'com.rbabbit.blocknight.warzone.RewardedAdsCheck029'],
                            capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)
    checks = [line[5:] for line in result.stdout.splitlines() if line.startswith('PASS ')]
    record = {
        'version': '0.29', 'emulatorUsed': False, 'actualAdsExecuted': False,
        'googleSDKExecuted': False, 'actualControllerExecutedOnJVM': True,
        'checksPassed': len(checks), 'checks': checks,
        'scope': 'Actual RewardedAdsController executes with deterministic fake Google/Android callbacks and a fake Host wallet. '
                 'Covers duplicates, cancellation, consent, timeouts, late callbacks, background, retry and disposal. '
                 'This is not device/network/SDK consent or gameplay evidence.',
        'sources': [{'path': name, 'sha256': digest(ROOT / name)}
                    for name in [CONTROLLER, CHECK, 'tools/check-rewarded-ads-029.py']],
    }
    report = ROOT / 'archive/rewarded-ads-0.29-controller-checks.json'
    report.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(result.stdout.strip())
    print('Controller fixture checks: ' + str(len(checks)))


if __name__ == '__main__':
    main()
