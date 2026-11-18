"""Focused actual wallet Java checks; simulated Android preference I/O, no app/device build."""
from pathlib import Path
import hashlib,json,os,subprocess
ROOT=Path(__file__).resolve().parents[1]
def main():
    jar=next((Path.home()/'.gradle/caches/modules-2/files-2.1/org.json/json/20240303').rglob('json-20240303.jar'))
    jdk=Path('C:/Program Files/Android/Android Studio/jbr/bin')
    sources=[ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone'/name for name in ('RewardCatalog.java','RewardLedger.java','RewardStore.java')]
    sources += [ROOT/'tools/MoreFortressLedgerCheck094.java',ROOT/'tools/reward-ledger-fixture/android/content/Context.java',ROOT/'tools/reward-ledger-fixture/android/content/SharedPreferences.java']
    out=ROOT/'build/morefortress-ledger-094';out.mkdir(parents=True,exist_ok=True)
    subprocess.run([str(jdk/'javac.exe'),'-cp',str(jar),'-d',str(out),*map(str,sources)],check=True)
    result=subprocess.run([str(jdk/'java.exe'),'-cp',str(out)+os.pathsep+str(jar),'com.rbabbit.blocknight.warzone.MoreFortressLedgerCheck094'],check=True,capture_output=True,text=True)
    checks=[line[5:]for line in result.stdout.splitlines()if line.startswith('PASS ')]
    report={'scope':'Actual RewardCatalog/Ledger/Store on JVM; Android preferences simulated, no emulator/gameplay proof','checksPassed':len(checks),'checks':checks,'sources':[{'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sources]}
    dest=ROOT/'qa/survival-094/morefortress-ledger-checks.json';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(report,indent=2)+'\n')
    print(result.stdout);print(str(dest))
if __name__=='__main__':main()
