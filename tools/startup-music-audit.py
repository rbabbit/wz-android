"""Audit native startup playlist controls with real Android taps and restarts."""
from pathlib import Path
import json, os, re, subprocess, sys, time, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/os.environ.get('WZ_QA_OUTPUT','qa/v4.7')
OUT.mkdir(parents=True,exist_ok=True)
SDK=Path(os.environ.get('ANDROID_HOME') or Path.home()/'AppData/Local/Android/Sdk')
ADB=str(SDK/'platform-tools/adb.exe') if os.name=='nt' else 'adb'
DEVICE=os.environ.get('WZ_QA_DEVICE','emulator-5554')
PACKAGE='com.rbabbit.warzonetowers'
def adb(*args):return subprocess.check_output([ADB,'-s',DEVICE,*args],timeout=20)
def tree():
    p='/sdcard/startup-music-'+str(os.getpid())+'.xml'
    for _ in range(8):
        text=adb('shell','uiautomator','dump',p)
        if b'dumped to' in text or b'UI hier' in text:return ET.fromstring(adb('shell','cat',p))
        time.sleep(.3)
    raise AssertionError('No fresh Android UI hierarchy')
def bounds(node):return list(map(int,re.findall(r'\d+',node.get('bounds'))))
def find(nodes,label):
    return next((n for n in nodes.iter('node') if n.get('text')==label or n.get('content-desc','').startswith(label)),None)
def tap(label):
    n=find(tree(),label);assert n is not None,label+' missing';assert n.get('enabled')=='true',label+' disabled'
    x1,y1,x2,y2=bounds(n);assert x2>x1 and y2>y1
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.2)
def screenshot(name):
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
    nodes=tree();(OUT/(name+'.json')).write_text(json.dumps([dict(n.attrib) for n in nodes.iter('node')],indent=2)+'\n')
    return nodes
def ready():
    for _ in range(20):
        n=find(tree(),'MUSIC ·')
        if n is not None and n.get('enabled')=='true':return
        time.sleep(.3)
    raise AssertionError('Startup Music inspection did not finish')
def top_right(nodes):
    n=find(nodes,'Start game');assert n is not None and n.get('enabled')=='true'
    x1,y1,x2,y2=bounds(n);l,t,r,b=bounds(next(nodes.iter('node')))
    assert x2>=r-65 and y1<t+70,'START GAME must remain at the top right'
    return [x1,y1,x2,y2]
if sys.argv[1]=='start':
    tap('Start game');print('PASS: native top-right START GAME tapped from Music');sys.exit()
ready();top_right(screenshot('graphics-startup'))
tap('MUSIC ·');nodes=screenshot('music-startup-all')
assert find(nodes,'SAVE & BACK') is not None,'Verified cached Music should be available'
on=find(nodes,'Music on')
if on.get('checked')!='true':tap('Music on')
tap('Clear music track selection');nodes=tree()
assert find(nodes,'0 / 39 selected') is not None
assert find(nodes,'Start game').get('enabled')=='false','empty enabled playlist must block Start'
tap('Music on');assert find(tree(),'Start game').get('enabled')=='true','Music off must allow Start'
tap('Music on');assert find(tree(),'Start game').get('enabled')=='false'
catalog=json.loads((ROOT/'app/src/main/assets/warzone/music-tracks.json').read_text())
first=catalog['albums'][0];first_track=first['tracks'][0]
label='Music track: '+first['title']+' / '+first_track['title']
tap(label);assert find(tree(),'1 / 39 selected') is not None
tap('SAVE & BACK');ready();tap('MUSIC ·')
assert find(tree(),label).get('checked')=='true','playlist must survive returning to startup'
adb('shell','input','keyevent','4');ready()
adb('shell','am','force-stop',PACKAGE)
adb('shell','am','start','-n',PACKAGE+'/com.rbabbit.blocknight.warzone.MainActivity')
ready();tap('MUSIC ·')
assert find(tree(),label).get('checked')=='true','playlist must survive a process restart'
tap('Select all music tracks');assert find(tree(),'39 / 39 selected') is not None
tap('Clear music track selection');tap(label)
last=catalog['albums'][-1];last_track=last['tracks'][-1]
last_label='Music track: '+last['title']+' / '+last_track['title']
for _ in range(16):
    nodes=tree();n=find(nodes,last_label)
    if n is not None and bounds(n)[3]>bounds(n)[1]:break
    l,t,r,b=bounds(next(nodes.iter('node')))
    adb('shell','input','swipe',str((l+r)//2),str(b-180),str((l+r)//2),str(t+210),'280')
else:raise AssertionError('Last original track is inaccessible')
top_right(screenshot('music-startup-last-album'))
tap(last_label);assert find(tree(),last_label).get('checked')=='true'
tap(last_label);assert find(tree(),last_label).get('checked')=='false'
tap('SAVE & BACK');ready();tap('MUSIC ·')
nodes=screenshot('music-startup-selected');position=top_right(nodes)
assert find(nodes,'1 / 39 selected') is not None
assert find(nodes,label).get('checked')=='true'
(OUT/'startup-music-results.json').write_text(json.dumps({'selectedTrack':first_track['id'],'startBounds':position,'cachedMusic':True,'emptyPlaylistBlocked':True,'musicOffAllowsStart':True,'allAndClear':True,'selectionSurvivesRestart':True,'lastAlbumReachable':True,'startRemainsVisibleAfterScroll':True},indent=2)+'\n')
print('PASS: native track selection, ALL/CLEAR, empty-playlist guard, Music off, restart persistence, last album and fixed START GAME')
