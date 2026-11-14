"""Compile actual store/catalogue/spec and extracted Activity bodies on host JVM."""
from pathlib import Path
from hashlib import file_digest,sha256
import importlib.util
import json
import os
import re
import subprocess
import uuid
import argparse

ROOT=Path(__file__).resolve().parents[1]
JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin')
OUT=ROOT/'build/ffa-save-067'
APP='app/src/main/java/com/rbabbit/blocknight/warzone/'
ACTUAL=['SaveGameStore.java','BattleLaunchSpec.java','FfaMapCatalog.java','MapLevelCatalog.java']
FIXTURES=['archive/cobra-0.64/original-easy-nullbot.zip','archive/cobra-0.64/cobra-easy-phone-save.zip','archive/cobra-0.64/legacy-nullbot-resave.zip']


def digest(path):
    with path.open('rb') as stream:return file_digest(stream,'sha256').hexdigest()


def write(relative,content):
    path=OUT/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content,encoding='utf-8');return path


def main(focused=False):
    fixture_hashes={name:digest(ROOT/name) for name in FIXTURES}
    jar,=list((Path.home()/'.gradle/caches/modules-2/files-2.1/org.json/json/20240303').glob('*/json-20240303.jar'))
    assert digest(jar)=='3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed'
    OUT.mkdir(parents=True,exist_ok=True)
    context=write('android/content/Context.java','''package android.content;
public abstract class Context {
 public abstract java.io.File getFilesDir();
 public Context getApplicationContext(){return this;}
 public android.content.res.AssetManager getAssets(){return new android.content.res.AssetManager(java.nio.file.Path.of(System.getProperty("host.assets")));}
}
''')
    assets=write('android/content/res/AssetManager.java','''package android.content.res;
public class AssetManager {private final java.nio.file.Path root;public AssetManager(java.nio.file.Path root){this.root=root;}public java.io.InputStream open(String name)throws java.io.IOException{return java.nio.file.Files.newInputStream(root.resolve(name));}}
''')
    android=write('android/content/pm/ApplicationInfo.java','package android.content.pm; public class ApplicationInfo {public static final int FLAG_DEBUGGABLE=2; public int flags=0;}\n')
    spec=importlib.util.spec_from_file_location('actual_activity_method_helpers',ROOT/'tools/check-home-routes-056.py');helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
    activity=(ROOT/APP/'MainActivity.java').read_text(encoding='utf-8')
    extracted=re.sub(r'^    (?=(?:public|private|protected)\b)','  ',activity,flags=re.M)
    methods={name:helpers.method(extracted,name)[3] for name in ['ffaSave','ffaRestored','gameUrl','isFfaBattle','loadFfaSave']}
    actual='\n'.join(methods.values()).replace('MainActivity.this','this')
    template=(ROOT/'tools/ffa-bridge-probe-067.java.in').read_text(encoding='utf-8');assert template.count('/* ACTUAL_METHODS */')==1
    bridge=write('FfaBridgeProbe067.java',template.replace('/* ACTUAL_METHODS */',actual))
    java_sources=[ROOT/(APP+name) for name in ACTUAL]+[ROOT/'tools/check-ffa-store-067.java',ROOT/'tools/check-campaign-save-051.java',ROOT/'tools/check-save-store-027.java',context,assets,android,bridge]
    subprocess.run([str(JDK/'javac.exe'),'-encoding','UTF-8','-cp',str(jar),'-d',str(OUT)]+list(map(str,java_sources)),check=True,timeout=60)
    records=[]
    runs=[('CheckFfaStore067',FIXTURES),('FfaBridgeProbe067',[FIXTURES[1],FIXTURES[0]])]
    if not focused:runs += [('CheckCampaignSave051',[]),('SaveStoreCheck027',['app/src/main/assets/warzone/levels/catalog.json'])]
    for entry,args in runs:
        result=subprocess.run([str(JDK/'java.exe'),'-Xmx768m','-Dhost.assets='+str(ROOT/'app/src/main/assets'),'-cp',os.pathsep.join((str(OUT),str(jar))),
            'com.rbabbit.blocknight.warzone.'+entry,str(OUT/('data-'+uuid.uuid4().hex))]+[str(ROOT/name) for name in args],capture_output=True,text=True,timeout=60)
        print(entry,result.stdout.strip() if entry!='SaveStoreCheck027' else result.stdout.strip().splitlines()[-1],result.stderr.strip(),flush=True)
        if result.returncode:raise RuntimeError(entry+' failed with exit '+str(result.returncode))
        record={'main':entry,'output':result.stdout.strip()}
        last=result.stdout.strip().splitlines()[-1]
        if last.startswith('{'):record['result']=json.loads(last)
        records.append(record)
    passed=all(record.get('result',{}).get('passed',True) for record in records)
    assert fixture_hashes=={name:digest(ROOT/name) for name in FIXTURES},'Genuine native archive inputs changed'
    source_paths=[APP+name for name in ACTUAL]+[APP+'MainActivity.java',APP+'SavedGamesView.java','tools/check-ffa-store-067.java','tools/ffa-bridge-probe-067.java.in','tools/check-ffa-save-067.py','app/src/main/assets/ffa-maps.json']+FIXTURES
    report={'version':'0.67','passed':passed,'checksPassed':sum(record.get('result',{}).get('checksPassed',0) for record in records),'actualJavaClasses':ACTUAL,'actualActivityMethods':{name:sha256(body.encode()).hexdigest() for name,body in methods.items()},
        'platformOnlyContextAssetStubs':True,'mapIdentityStubUsed':False,'genuineNativeArchives':FIXTURES,'genuineArchiveHashesBeforeAndAfter':fixture_hashes,
        'sourceOnlyDisplayCopyReviewed':[APP+'SavedGamesView.java'],'androidWidgetsRendered':False,
        'syntheticTwoThreeFourSixPlayerIdentityFixtures':True,'syntheticFixturesAreMinimalProtocolRecordsNotNativeWorlds':True,'nativeEngineExecuted':False,'actualNativeEngineExecuted':False,'emulatorUsed':False,'focusedFfaOnly':focused,
        'checks':records,'sources':[{'path':name,'sha256':digest(ROOT/name),'bytes':(ROOT/name).stat().st_size} for name in source_paths]}
    (ROOT/'archive/ffa-maps-0.67-java-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    if not passed:raise SystemExit('Observed semantic identity gaps; see archive/ffa-maps-0.67-java-checks.json')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--focused-ffa',action='store_true',help='Rerun changed FFA validation/routes without repeating passed unrelated long save suites')
    main(parser.parse_args().focused_ffa)
