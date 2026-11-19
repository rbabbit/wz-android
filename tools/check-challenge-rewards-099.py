"""Focused actual Challenge wallet/store execution; host preferences and map lookup are explicit fixtures."""
from pathlib import Path
import json,os,subprocess,hashlib
R=Path(__file__).resolve().parents[1]
O=R/'build/challenge-rewards-099';O.mkdir(parents=True,exist_ok=True)
jar=next((Path.home()/'.gradle/caches/modules-2/files-2.1/org.json/json/20240303').rglob('json-20240303.jar'))
jdk=Path('C:/Program Files/Android/Android Studio/jbr/bin')
stub=O/'ChallengeMapCatalog.java'
ids=['firefight','towers2','hells-pass','fort-scav','dramatic-scavs','earthsea','cross-flair','no-hill','face-to-face','startup2']
stub.write_text('package com.rbabbit.blocknight.warzone; final class ChallengeMapCatalog { static boolean isKnownId(String id) { return java.util.Set.of('+','.join(json.dumps(i)for i in ids)+').contains(id); }}\n')
names=['app/src/main/java/com/rbabbit/blocknight/warzone/'+n+'.java'for n in ['RewardCatalog','RewardLedger','RewardStore']]+['tools/check-challenge-rewards-099.java','tools/reward-ledger-fixture/android/content/Context.java','tools/reward-ledger-fixture/android/content/SharedPreferences.java']
subprocess.run([str(jdk/'javac.exe'),'-cp',str(jar),'-d',str(O),*[str(R/n)for n in names],str(stub)],check=True)
run=subprocess.run([str(jdk/'java.exe'),'-cp',str(O)+os.pathsep+str(jar),'com.rbabbit.blocknight.warzone.ChallengeRewardsCheck099'],check=True,text=True,capture_output=True)
checks=[l[5:]for l in run.stdout.splitlines()if l.startswith('PASS ')]
record={'passed':True,'checksPassed':len(checks),'checks':checks,'scope':'Actual RewardCatalog/Ledger/Store with real JSON, simulated Android SharedPreferences including failed commit/restart. Map-ID lookup is an explicit host fixture for the ten audited map IDs; actual app catalog and native gameplay are tested separately.','emulatorUsed':False,'sources':{n:hashlib.sha256((R/n).read_bytes()).hexdigest()for n in names}}
out=R/'qa/challenge-099';out.mkdir(parents=True,exist_ok=True);(out/'reward-ledger-host.json').write_text(json.dumps(record,indent=2)+'\n')
print(run.stdout.strip().splitlines()[-1])
