from pathlib import Path
import getpass, os, subprocess, zipfile

HERE=Path(__file__).resolve().parent
SDK=Path('C:/Users/punke/AppData/Local/Android/Sdk')
TOOLS=SDK/'build-tools/36.1.0'
JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin')
ANDROID=SDK/'platforms/android-36/android.jar'
KEY=Path('C:/Users/punke/.android/debug.keystore')
classes=HERE/'classes'; dex=HERE/'dex'
classes.mkdir(exist_ok=True); dex.mkdir(exist_ok=True)
commands=[
 [str(JDK/'javac.exe'),'-encoding','UTF-8','-source','17','-target','17','-classpath',str(ANDROID),'-d',str(classes),str(HERE/'src/SelectionFixture.java')],
 [str(JDK/'java.exe'),'-cp',str(TOOLS/'lib/d8.jar'),'com.android.tools.r8.D8','--lib',str(ANDROID),'--min-api','26','--output',str(dex),*[str(p) for p in classes.rglob('*.class')]],
]
# javac must finish before discovering its generated class files.
p=subprocess.run(commands[0],capture_output=True,text=True); (HERE/'javac.log').write_text(p.stdout+p.stderr); assert p.returncode==0,p.stderr
commands[1]=commands[1][:commands[1].index(str(dex))+1]+[str(p) for p in classes.rglob('*.class')]
p=subprocess.run(commands[1],capture_output=True,text=True); (HERE/'d8.log').write_text(p.stdout+p.stderr); assert p.returncode==0,p.stderr
unsigned=HERE/'selection-fixture-unsigned.apk'; aligned=HERE/'selection-fixture-aligned.apk'; signed=HERE/'selection-fixture-signed.apk'
subprocess.run([str(TOOLS/'aapt2.exe'),'link','--manifest',str(HERE/'AndroidManifest.xml'),'-I',str(ANDROID),'-o',str(unsigned)],check=True)
with zipfile.ZipFile(unsigned,'a',compression=zipfile.ZIP_DEFLATED) as out: out.write(dex/'classes.dex','classes.dex')
subprocess.run([str(TOOLS/'zipalign.exe'),'-f','-p','4',str(unsigned),str(aligned)],check=True)
password=os.environ.pop('QA_NORMAL_KEYSTORE_PASSWORD','android')
p=subprocess.run([str(JDK/'java.exe'),'-jar',str(TOOLS/'lib/apksigner.jar'),'sign','--ks',str(KEY),'--ks-key-alias','AndroidDebugKey','--ks-pass','stdin','--key-pass','stdin','--out',str(signed),str(aligned)],input=password+'\n'+password+'\n',capture_output=True,text=True)
password=None; assert p.returncode==0,p.stderr
p=subprocess.run([str(JDK/'java.exe'),'-jar',str(TOOLS/'lib/apksigner.jar'),'verify','--print-certs',str(signed)],capture_output=True,text=True)
assert p.returncode==0 and '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15' in p.stdout.lower()
(HERE/'signature.log').write_text(p.stdout+p.stderr)
print('Built and verified external normal-signer helper:',signed)
