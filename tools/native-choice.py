"""Choose an actual Android picker row by its trimmed visible label."""
from pathlib import Path
import os,subprocess,sys,time,re,xml.etree.ElementTree as ET
sdk=Path(os.environ.get('ANDROID_HOME') or Path.home()/'AppData/Local/Android/Sdk')
adb=str(sdk/'platform-tools/adb.exe');device=os.environ.get('WZ_QA_DEVICE','emulator-5554')
label=sys.argv[1];temporary='/sdcard/warzone-choice-'+str(os.getpid())+'.xml'
def run(*args):return subprocess.check_output([adb,'-s',device,*args],timeout=15)
try:
 for _ in range(8):
  result=run('shell','uiautomator','dump',temporary)
  if b'dumped to' not in result and b'UI hier' not in result:time.sleep(.2);continue
  tree=ET.fromstring(run('shell','cat',temporary))
  nodes=[n for n in tree.iter('node') if n.get('text','').strip()==label]
  if nodes:
   n=next((n for n in nodes if n.get('clickable')=='true'),nodes[0]);x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
   run('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));print('Native picker:',label);break
  time.sleep(.2)
 else:raise SystemExit('Picker row not found: '+label)
finally:run('shell','rm','-f',temporary)
