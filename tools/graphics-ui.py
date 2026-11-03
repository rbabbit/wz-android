"""Small native Android UI driver for the startup choices; no app bypasses."""
from pathlib import Path
import os,sys,re,json,shutil,subprocess,time,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
SDK=Path(os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME') or
         (Path.home()/'AppData/Local/Android/Sdk' if os.name=='nt' else
          Path.home()/('Library/Android/sdk' if sys.platform=='darwin' else 'Android/Sdk')))
ADB=os.environ.get('ADB') or shutil.which('adb') or str(SDK/'platform-tools'/('adb.exe' if os.name=='nt' else 'adb'))
DEVICE=os.environ.get('WZ_QA_DEVICE','emulator-5556')
def adb(*args):return subprocess.check_output([ADB,'-s',DEVICE,*args])
def tree():
    # A failed dump can exit successfully while leaving an old XML behind.
    # Use a process-specific path and require a fresh hierarchy before tapping.
    temporary='/sdcard/graphics-ui-'+str(os.getpid())+'.xml'
    try:
        for _ in range(12):
            dumped=adb('shell','uiautomator','dump',temporary)
            if b'UI hier' in dumped or b'dumped to' in dumped:
                return ET.fromstring(adb('shell','cat',temporary))
            time.sleep(.4)
        raise RuntimeError('Android did not return a fresh UI hierarchy')
    finally:
        adb('shell','rm','-f',temporary)
action=sys.argv[1]
if action=='tap':
    wanted=sys.argv[2];nodes=list(tree().iter('node'))
    matches=[n for n in nodes if n.get('text')==wanted or n.get('content-desc','').startswith(wanted)]
    if not matches:raise SystemExit('Native control not found: '+wanted)
    node=next((n for n in matches if n.get('clickable')=='true'),matches[0])
    x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    print(json.dumps({'tapped':wanted,'bounds':[x1,y1,x2,y2]}))
elif action=='shot':
    output=ROOT/'qa/v4.5'/sys.argv[2];output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(adb('exec-out','screencap','-p'));print(str(output))
elif action=='tree':
    print(json.dumps([{k:n.get(k) for k in ['text','content-desc','bounds','enabled','selected']}
        for n in tree().iter('node') if n.get('text') or n.get('content-desc')],indent=2))
