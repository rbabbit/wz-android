"""Run actual save-store code on a JVM; fixtures are synthetic, not gameplay."""
from pathlib import Path
from hashlib import file_digest
import json, os, subprocess, uuid

ROOT=Path(__file__).resolve().parents[1]
JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin')
OUT=ROOT/'build/campaign-save-051'
SOURCES=['app/src/main/java/com/rbabbit/blocknight/warzone/SaveGameStore.java',
    'tools/save-store-fixture/android/content/Context.java', 'tools/check-save-store-027.java',
    'tools/check-campaign-save-051.java', 'tools/check-campaign-save-051.py']
def digest(p):
    with p.open('rb') as f: return file_digest(f,'sha256').hexdigest()
jar,=list((Path.home()/'.gradle/caches/modules-2/files-2.1/org.json/json/20240303').glob('*/json-20240303.jar'))
assert digest(jar)=='3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed'
OUT.mkdir(parents=True,exist_ok=True)
subprocess.run([str(JDK/'javac.exe'),'-encoding','UTF-8','-cp',str(jar),'-d',str(OUT)]
    +[str(ROOT/n) for n in SOURCES if n.endswith('.java')],check=True,timeout=60)
checks=[]
for main in ('CheckCampaignSave051','SaveStoreCheck027'):
    args=[str(JDK/'java.exe'),'-Xmx768m','-cp',os.pathsep.join((str(OUT),str(jar))),
        'com.rbabbit.blocknight.warzone.'+main,str(OUT/('data-'+uuid.uuid4().hex)),
        str(ROOT/'app/src/main/assets/warzone/levels/catalog.json')]
    r=subprocess.run(args,check=True,capture_output=True,text=True,timeout=60)
    print(r.stdout)
    checks.append(dict(main=main,output=r.stdout))
(ROOT/'archive/campaign-save-0.51-checks.json').write_text(json.dumps(dict(version='0.51',passed=True,
    emulatorUsed=False,syntheticNativeBytes=True,checks=checks,
    sources=[dict(path=n,sha256=digest(ROOT/n)) for n in SOURCES]),indent=2)+'\n')
