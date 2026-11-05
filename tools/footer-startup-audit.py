"""Native footer checks, using the existing owned-emulator startup helpers."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,time

spec=importlib.util.spec_from_file_location('startup',Path(__file__).with_name('startup-maps-audit.py'))
ui=importlib.util.module_from_spec(spec);spec.loader.exec_module(ui)
ui.OUT=ui.ROOT/'qa/v5.12/startup';ui.OUT.mkdir(parents=True,exist_ok=True)
NAMES={'td1':'Dustfall','td2':'Iron Valley'}

def graphics(mode):
    ui.tap('Graphics options');ui.tap('High Quality' if mode=='high' else 'Normal')

def frame(name):
    nodes=ui.shot(name);root=ui.bounds(next(nodes.iter('node')))
    labels=['Dustfall map','Iron Valley map','Start game','Graphics options','Music settings']
    labels.append('HQ pack ready offline' if ui.find('HQ pack ready offline',nodes) is not None else 'Download High Quality graphics')
    boxes=[]
    density=int(ui.adb('shell','wm','density').decode().strip().split()[-1])/160
    for label in labels:
        n=ui.find(label,nodes);assert n is not None,label
        x,y,r,b=ui.bounds(n);assert root[0]<=x<r<=root[2] and root[1]<=y<b<=root[3],(label,(x,y,r,b),root)
        assert b-y>=48*density-1,(label,'touch height',(x,y,r,b),density)
        assert not any(max(x,a)<min(r,c) and max(y,k)<min(b,d) for a,k,c,d in boxes),(label,'overlap')
        boxes.append((x,y,r,b))
    assert not any('TOWER DEFENSE' in n.get('text','') for n in nodes.iter('node'))
    return {'name':name,'bounds':root,'controls':dict(zip(labels,boxes)),'density':density}

def apk_proof(report):
    report['apkSHA256']=hashlib.sha256((ui.ROOT/'app/build/outputs/apk/debug/app-debug.apk').read_bytes()).hexdigest()
    installed=ui.adb('shell','pm','path',ui.PACKAGE).decode().strip().removeprefix('package:')
    report['installedSHA256']=ui.adb('shell','sha256sum',installed).decode().split()[0]
    assert report['installedSHA256']==report['apkSHA256']

def layouts():
    report={'layouts':[],'cases':[]};ui.boot()
    for name in ['Dustfall','Iron Valley','Dustfall']:
        ui.tap(name+' map');assert ui.find(name+' map').get('selected')=='true';assert ui.find('Start game').get('text')=='PLAY '+name.upper()
    ui.tap('Iron Valley map');graphics('high');assert 'High Quality' in ui.find('Graphics options').get('content-desc')
    ui.tap('Graphics options');ui.adb('shell','input','keyevent','4');assert 'High Quality' in ui.find('Graphics options').get('content-desc')
    graphics('normal')
    for name,size,density,font in [('compact','900x1620','240','1.0'),('standard','1080x2400','300','1.0'),('large','1080x2400','240','1.0'),('phone','720x1440','320','1.0'),('narrow','720x1280','320','1.0'),('large-text','900x1620','240','1.3')]:
        ui.adb('shell','wm','size',size);ui.adb('shell','wm','density',density);ui.adb('shell','settings','put','system','font_scale',font);ui.boot()
        report['layouts'].append(frame(name))
    ui.adb('shell','settings','put','system','font_scale','1.0');ui.adb('shell','wm','size','900x1620');ui.adb('shell','wm','density','240');ui.boot()
    ui.tap('Music settings');ui.tap('Clear music track selection');assert ui.find('0 / 39 selected') is not None
    if ui.find('Music on').get('checked')=='false':ui.tap('Music on')
    assert ui.find('Start game').get('enabled')=='false';ui.shot('music-empty')
    ui.adb('shell','input','keyevent','4');ui.tap('Start game');assert ui.find('MUSIC') is not None
    catalog=json.loads((ui.ROOT/'app/src/main/assets/warzone/music-tracks.json').read_text());album=catalog['albums'][0];track=album['tracks'][0]
    label='Music track: '+album['title']+' / '+track['title'];ui.tap(label);assert ui.find('1 / 39 selected') is not None
    ui.tap('Music on');ui.tap('SAVE & BACK')
    for _ in range(2):
        ui.tap('Music settings');assert ui.find('1 / 39 selected') is not None;assert ui.find('Iron Valley map') is None
        ui.adb('shell','input','keyevent','4');ui.wait('Music settings',enabled=True)
    ui.boot();assert ui.find('Iron Valley map').get('selected')=='true';ui.tap('Music settings');assert ui.find('1 / 39 selected') is not None
    ui.adb('shell','input','keyevent','4');frame('compact-final')
    report['cases']=['display names and selected state, dynamic Play label, graphics choice and popup Back','six native viewport/text layouts, nonoverlapping 48dp hit targets','explicit empty playlist blocks Play, one explicit choice, repeated Music/Back and restart retain map/playlist']
    apk_proof(report);report['passed']=True;(ui.OUT/'layouts.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS:',report['cases'],flush=True)

def downloads():
    hq='files/graphics/hq-v3/high.wz';backup=hq+'.v512-backup';report={}
    try:
        ui.adb('shell','am','force-stop',ui.PACKAGE)
        assert ui.file_size(hq)==99639408 and not ui.file_size(backup)
        ui.app('dd','if='+hq,'of='+hq+'.part','bs=1048576','count=1');ui.app('mv',hq,backup);ui.boot()
        graphics('high');assert ui.find('Start game').get('enabled')=='false';ui.shot('hq-required');graphics('normal')
        ui.adb('shell','svc','wifi','disable');ui.adb('shell','svc','data','disable');ui.tap('Download High Quality graphics');ui.wait('Download High Quality graphics',seconds=30,enabled=True)
        assert ui.find('Start game').get('enabled')=='true';ui.shot('hq-error')
        ui.adb('shell','svc','wifi','enable');ui.adb('shell','svc','data','enable')
        deadline=time.monotonic()+15
        while b'Active default network: none' in ui.adb('shell','dumpsys','connectivity'):
            assert time.monotonic()<deadline;time.sleep(.2)
        nodes=ui.tree();assert ui.bounds(next(nodes.iter('node')))==[0,0,1620,900],'Validate prepared Cancel viewport before native input'
        box=ui.bounds(ui.wait('Download High Quality graphics',enabled=True))
        ui.adb('shell','input','tap',str((box[0]+box[2])//2),str((box[1]+box[3])//2));time.sleep(.05)
        ui.adb('shell','input','tap','1484','732') # Prepared Cancel centre at 1080x600 / 1.5 density.
        ui.wait('Download paused. Your progress is saved.');retained=ui.file_size(hq+'.part');assert retained>=1048576;ui.shot('hq-cancelled')
        ui.tap('Download High Quality graphics');ui.wait('HQ pack ready offline',seconds=90);ui.shot('hq-ready')
        assert ui.find('Iron Valley map') is not None;graphics('high');assert ui.find('Start game').get('enabled')=='true';graphics('normal')
        assert ui.app('sha256sum',hq).decode().split()[0]=='a16a06c2a6b68e86a03934240880ec0b0fd72666606af3bf12ed5ffda7734f0e'
        report.update(seededVerifiedPrefixBytes=1048576,retainedOnCancelBytes=retained,networkResumeVerified=True,cases=['uncached HQ blocks Play; Normal stays available','native network error and footer feedback','native Cancel retains prefix; actual network resume verifies; completion stays on splash'])
        apk_proof(report);report['passed']=True;(ui.OUT/'downloads.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS:',report,flush=True)
    finally:
        ui.adb('shell','svc','wifi','enable');ui.adb('shell','svc','data','enable')
        if ui.file_size(backup):ui.app('mv',backup,hq)

def start(map_id,mode,music):
    ui.boot();ui.tap(NAMES[map_id]+' map');graphics(mode);ui.tap('Music settings')
    on=ui.find('Music on');desired=music=='on'
    if (on.get('checked')=='true')!=desired:ui.tap('Music on')
    ui.adb('shell','input','keyevent','4');ui.tap('Start game')
    (ui.OUT/(map_id+'-loading.png')).write_bytes(ui.adb('exec-out','screencap','-p'))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['layouts','downloads','start']);parser.add_argument('--map',default='td1',choices=list(NAMES));parser.add_argument('--graphics',default='normal',choices=['normal','high']);parser.add_argument('--music',default='off',choices=['on','off']);a=parser.parse_args()
    try:
        if a.mode=='layouts':layouts()
        elif a.mode=='downloads':downloads()
        else:start(a.map,a.graphics,a.music)
    except BaseException:
        ui.shot('failure');raise
