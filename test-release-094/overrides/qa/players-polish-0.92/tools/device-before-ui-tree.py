from pathlib import Path
from datetime import datetime,timezone
import json,re,struct,subprocess,time,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent
ADB=r'C:/Users/punke/AppData/Local/Android/Sdk/platform-tools/adb.exe'
def adb(*args,binary=False,timeout=20):
 p=subprocess.run([ADB,'-s','emulator-5562',*args],capture_output=True,text=not binary,timeout=timeout)
 if p.returncode: raise RuntimeError(str(args)+': '+str(p.stderr))
 return p.stdout
def xml():
 result=adb('shell','uiautomator','dump','/data/local/tmp/players-polish-092-ui.xml')
 if 'dumped to:' not in result:raise RuntimeError('UIAutomator did not refresh hierarchy: '+result)
 return adb('exec-out','cat','/data/local/tmp/players-polish-092-ui.xml')
def nodes(raw):
 return [dict(n.attrib) for n in ET.fromstring(raw).iter('node')]
def capture(name):
 raw=xml(); (ROOT/(name+'.xml')).write_text(raw)
 png=adb('exec-out','screencap','-p',binary=True); assert png.startswith(b'\x89PNG'); (ROOT/(name+'.png')).write_bytes(png)
 width,height=struct.unpack('>II',png[16:24])
 rows=[n for n in nodes(raw) if n.get('text') or n.get('content-desc') or n.get('clickable')=='true']
 data=dict(name=name,recordedUTC=datetime.now(timezone.utc).isoformat(),width=width,height=height,nodes=rows)
 (ROOT/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n')
 print(json.dumps({'name':name,'viewport':[width,height],'text':[n.get('text') or n.get('content-desc') for n in rows if n.get('text') or n.get('content-desc')]},indent=2),flush=True)
 return data
def tap(label):
 raw=xml(); found=[n for n in nodes(raw) if label.casefold() in (n.get('text','').casefold(),n.get('content-desc','').casefold()) and n.get('enabled')=='true']
 assert found, 'No enabled exact target: '+label
 n=next((n for n in found if n.get('clickable')=='true'),found[0]); a,b,c,d=map(int,re.findall(r'-?\d+',n['bounds']))
 assert c>a and d>b
 adb('shell','input','tap',str((a+c)//2),str((b+d)//2))
def back(): adb('shell','input','keyevent','4')
def home_ready(data):
 values=[n.get('text','').casefold() for n in data['nodes']]
 assert all(label in values for label in ('campaign','towers','ffa','multiplayer','guide','hub')), 'Six Home buttons missing'
 assert any('v0.86' in value for value in values), 'Home version missing'
 assert not any('update' in value for value in values), 'Play Home updater visible'

_original_home_ready=home_ready
def home_ready(data):
 _original_home_ready(data)
 assert not any(n.get('text','').casefold()=='back' for n in data['nodes']), 'Destination overlay still present on Home'

# Normal092 includes the updater; no obsolete Play/0.86 assumption.
def home_ready(data):
 values=[n.get('text','').casefold()for n in data['nodes']]
 assert all(label in values for label in ('campaign','towers','ffa','multiplayer','guide','hub'))
 assert not any(n.get('text','').casefold()=='back'for n in data['nodes'])
