"""Real Android startup/map/playlist/download checks on the owned QA emulator."""
from pathlib import Path
import argparse, hashlib, json, os, re, subprocess, time, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'qa/v5.11/startup';OUT.mkdir(parents=True,exist_ok=True)
ADB=str(Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))/'platform-tools/adb.exe')
DEVICE='emulator-5556';PACKAGE='com.rbabbit.warzonetowers';ACTIVITY=PACKAGE+'/com.rbabbit.blocknight.warzone.MainActivity'
def adb(*v):return subprocess.check_output([ADB,'-s',DEVICE,*v],timeout=25,stderr=subprocess.STDOUT)
def app(*v):return adb('shell','run-as',PACKAGE,*v)
def tree():
    path='/sdcard/wz-startup-v511.xml'
    for _ in range(4):
        try:
            adb('shell','uiautomator','dump',path)
            return ET.fromstring(adb('shell','cat',path))
        except (ET.ParseError,subprocess.CalledProcessError):time.sleep(.2)
    raise AssertionError('No fresh native hierarchy')
def find(label,nodes=None):
    return next((n for n in (nodes if nodes is not None else tree()).iter('node') if n.get('text')==label or n.get('content-desc','').startswith(label)),None)
def wait(label,seconds=20,enabled=False):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        n=find(label)
        if n is not None and (not enabled or n.get('enabled')=='true'):return n
    raise AssertionError('Not ready: '+label)
def bounds(n):return list(map(int,re.findall(r'\d+',n.get('bounds'))))
def tap(label):
    n=wait(label,enabled=True);x,y,r,b=bounds(n);assert r>x and b>y,label
    adb('shell','input','tap',str((x+r)//2),str((y+b)//2));time.sleep(.15)
def shot(name):
    r=tree();(OUT/(name+'.xml')).write_text(ET.tostring(r,encoding='unicode'))
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'));return r
def boot():
    adb('shell','am','force-stop',PACKAGE);adb('shell','am','start','-W','-n',ACTIVITY);wait('Music settings',enabled=True)
def splash():
    if find('MUSIC') is not None:adb('shell','input','keyevent','4')
    wait('Music settings',enabled=True)
def file_size(path):
    try:return int(app('stat','-c','%s',path).strip())
    except (subprocess.CalledProcessError,ValueError):return 0
def partial(path):
    end=time.monotonic()+20
    while time.monotonic()<end:
        n=file_size(path)
        if n>65536:return n
        time.sleep(.2)
    raise AssertionError('No partial download bytes: '+path)
def layout(name):
    r=shot(name);root=bounds(next(r.iter('node')))
    for label in ['Tower Defense 1 map','Tower Defense 2 map','Start game','Normal graphics','High Quality graphics','Music settings']:
        n=find(label,r);assert n is not None,label
        x,y,a,b=bounds(n);assert root[0]<=x<a<=root[2] and root[1]<=y<b<=root[3],(label,bounds(n),root)
    return {'screen':name,'bounds':root,'play':bounds(find('Start game',r))}
def start(map_id,graphics,music,offline=False):
    splash();tap('Tower Defense '+('1' if map_id=='td1' else '2')+' map')
    tap('Normal graphics' if graphics=='normal' else 'High Quality graphics')
    tap('Music settings');on=find('Music on');desired=music=='on'
    if (on.get('checked')=='true')!=desired:tap('Music on')
    adb('shell','input','keyevent','4')
    if offline:adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
    tap('Start game')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['verify','graphics','start','layout']);parser.add_argument('--map',default='td1',choices=['td1','td2']);parser.add_argument('--graphics',default='normal',choices=['normal','high']);parser.add_argument('--music',default='off',choices=['on','off']);parser.add_argument('--resume',action='store_true');parser.add_argument('--offline',action='store_true');args=parser.parse_args()
    if args.mode=='start':start(args.map,args.graphics,args.music,args.offline);print('Started native selection:',args.map,args.graphics,args.music,'offline' if args.offline else 'online');raise SystemExit()
    if args.mode=='layout':splash();print(layout('layout'));raise SystemExit()

    report={'device':DEVICE,'cases':[],'layouts':[]};hq='files/graphics/hq-v3/high.wz';backup=hq+'.v511-qa-backup'
    if args.mode=='graphics':
        report=json.loads((OUT/'failure.json').read_text());report.pop('failure',None);report['graphicsFixtureRetried']=True
    catalog=json.loads((ROOT/'app/src/main/assets/warzone/music-tracks.json').read_text());album=catalog['albums'][0];track=album['tracks'][0];label='Music track: '+album['title']+' / '+track['title']
    try:
        if args.mode!='graphics':
            if args.resume:
                report=json.loads((OUT/'failure.json').read_text());report.pop('failure',None);report['resumedAfterFixtureCorrection']=True
                if find('MUSIC') is None:tap('Music settings')
                wait('SAVE & BACK',seconds=30,enabled=True)
            else:
                verify_initial=True
            if not args.resume:
                splash();tap('Tower Defense 2 map');tap('Normal graphics');report['layouts'].append(layout('large'))
                tap('Music settings');assert find('0 / 39 selected') is not None,'missing preference must default to no tracks'
                assert all(n.get('checked')=='false' for n in tree().iter('node') if n.get('content-desc','').startswith('Music track:'))
                shot('music-empty');tap('Select all music tracks');assert find('39 / 39 selected') is not None
                tap('Clear music track selection');assert find('0 / 39 selected') is not None
                tap(label);assert find('1 / 39 selected') is not None;assert find(label).get('checked')=='true'
                adb('shell','input','keyevent','4');assert find('Tower Defense 2 map').get('selected')=='true';boot();assert find('Tower Defense 2 map').get('selected')=='true'
                tap('Music settings');assert find('1 / 39 selected') is not None;assert find(label).get('checked')=='true';tap('Clear music track selection')
                report['cases'].append('zero default tracks, explicit All/Clear, track choice before download, map/playlist retained through Back and process restart')
            if find('DOWNLOAD MUSIC') is not None:
                adb('emu','network','speed','4000000:4000000');tap('DOWNLOAD MUSIC');report['musicPartialBytes']=partial('files/music/official-v1/music.data.part');tap('CANCEL DOWNLOAD');assert find('RESUME DOWNLOAD') is not None;shot('music-paused')
                adb('emu','network','speed','full');tap('RESUME DOWNLOAD');wait('SAVE & BACK',seconds=120,enabled=True)
                report['cases'].append('real music download cancellation, partial-byte preservation, resumed completion and native verification')
            assert find('Music on').get('checked')=='false','downloading must not enable music automatically'
            tap('Music on');assert find('Start game').get('enabled')=='false','enabled empty playlist must ask for a track'
            shot('music-empty-enabled');adb('shell','input','keyevent','4');tap('Start game');assert find('MUSIC') is not None,'startup must return to explicit choice instead of starting all music'
            tap(label);assert find('1 / 39 selected') is not None;assert find('Start game').get('enabled')=='true';tap('SAVE & BACK')
            report['cases'].append('download does not enable playback; empty enabled playlist blocks Start and asks for selection; one explicit track allows Start')
            for name,size,density in [('standard','1080x2400','300'),('compact','900x1620','240'),('large-final','1080x2400','240')]:
                adb('shell','wm','size',size);adb('shell','wm','density',density);wait('Music settings',enabled=True);report['layouts'].append(layout(name))
        adb('shell','am','force-stop',PACKAGE)
        if file_size(hq):app('mv',hq,backup)
        boot();tap('High Quality graphics');assert find('Start game').get('enabled')=='false','uncached High requires its explicit download'
        adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');tap('Download High Quality graphics');wait('Download High Quality graphics',seconds=35,enabled=True);shot('hq-network-error')
        tap('Normal graphics');assert find('Start game').get('enabled')=='true','Normal remains available after failed optional download'
        adb('shell','svc','wifi','enable');adb('shell','svc','data','enable')
        deadline=time.monotonic()+15
        while not re.search(r'Active default network:\s*\d+',adb('shell','dumpsys','connectivity').decode()):
            assert time.monotonic()<deadline,'network fixture did not reconnect'
            time.sleep(.3)
        adb('emu','network','speed','4000000:4000000')
        tap('Download High Quality graphics');report['hqPartialBytes']=partial('files/graphics/hq-v3/high.wz.part');tap('CANCEL DOWNLOAD');shot('hq-paused');assert find('Start game').get('enabled')=='true'
        adb('emu','network','speed','full');tap('Download High Quality graphics');wait('HQ pack ready offline',seconds=120)
        assert find('Tower Defense 2 map') is not None,'completed HQ download must stay on splash, without auto-launch'
        tap('High Quality graphics');assert find('Start game').get('enabled')=='true';shot('hq-ready')
        report['cases'].append('uncached HQ disables Play, real network error leaves offline Normal available, HQ cancel/resume verifies and stays on splash, cached High allows Play')
        report['musicSHA256']=app('sha256sum','files/music/official-v1/music.data').decode().split()[0];report['hqSHA256']=app('sha256sum',hq).decode().split()[0]
        for store,key in [('MusicPackStore','musicSHA256'),('GraphicsPackStore','hqSHA256')]:assert report[key]==re.search(r'SHA256 = "([0-9a-f]+)"',(ROOT/('app/src/main/java/com/rbabbit/blocknight/warzone/'+store+'.java')).read_text())[1]
        report['apkSHA256']=hashlib.sha256((ROOT/'app/build/outputs/apk/debug/app-debug.apk').read_bytes()).hexdigest();report['passed']=True
        (OUT/'results.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS:', '; '.join(report['cases']),flush=True)
    except BaseException as error:
        report['failure']=repr(error);(OUT/'failure.json').write_text(json.dumps(report,indent=2)+'\n');shot('failure');raise
    finally:
        adb('emu','network','speed','full');adb('shell','svc','wifi','enable');adb('shell','svc','data','enable')
        if file_size(backup):app('mv',backup,hq)

if __name__=="__main__":main()
