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
 import control  # Lazy: control imports device; no RPC or circular import during module initialization.
 tree=control.rpc('ui-tree').get('tree')
 if not isinstance(tree,dict)or tree.get('truncated')is not False:
  raise RuntimeError('Native active-window snapshot missing or truncated; no idle dump fallback')
 raw=tree.get('xml')
 if not isinstance(raw,str)or not raw:raise RuntimeError('Native active-window XML is unavailable')
 root=ET.fromstring(raw)
 count=sum(1 for _ in root.iter('node'))
 if root.tag!='hierarchy'or not 0<count<=5000 or count!=tree.get('nodeCount'):
  raise RuntimeError('Invalid/incomplete native active-window hierarchy')
 return raw
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
def _native_targets(rows,label):
 return [n for n in rows if label.casefold() in (n.get('text','').casefold(),n.get('content-desc','').casefold()) and n.get('enabled')=='true'and n.get('clickable')=='true'and n.get('visible-to-user')=='true']
def wait_nodes(predicate,timeout=3):
 end=time.monotonic()+min(timeout,3)
 while True:
  try:rows=nodes(xml())
  except RuntimeError as error:
   if 'Active accessibility window is unavailable'not in str(error):raise
   rows=[]
  if predicate(rows):return rows
  if time.monotonic()>=end:raise RuntimeError('Native transition not observed within3seconds; no input retried')
  time.sleep(.1)
def tap(label):
 rows=wait_nodes(lambda rows:len(_native_targets(rows,label))==1);n=_native_targets(rows,label)[0]
 a,b,c,e=map(int,re.findall(r'-?\d+',n['bounds']))
 png=adb('exec-out','screencap','-p',binary=True);assert png.startswith(b'\x89PNG');width,height=struct.unpack('>II',png[16:24])
 assert 0<=a<c<=width and 0<=b<e<=height,'Native button outside actual physical PNG'
 adb('shell','input','tap',str((a+c)//2),str((b+e)//2))
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
