"""Focused092 QA observations/touches. Importing performs no I/O or actions."""
from datetime import datetime, timezone
import json, re, struct
import control as c
import device as d

_geometry={}
VIEW="({url:location.pathname,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop}:null})"

def write(name,value):
    path=c.ROOT/(name+'.json')
    if path.exists():raise RuntimeError('Preserve prior proof: '+str(path))
    path.write_text(json.dumps(value,indent=2)+'\n');return value

def screen(name):
    path=c.ROOT/(name+'.png')
    if path.exists():raise RuntimeError('Preserve prior screenshot: '+str(path))
    data=d.adb('exec-out','screencap','-p',binary=True);assert data.startswith(b'\x89PNG')
    path.write_bytes(data);return list(struct.unpack('>II',data[16:24]))

def measure(activity='auto',force=False):
    """One actual UIA measurement per activity/viewport, no blind retries."""
    before=c.evaluate(VIEW,activity=activity);state=c.rpc('state',activity=activity)['state']
    png=d.adb('exec-out','screencap','-p',binary=True);assert png.startswith(b'\x89PNG')
    physical=struct.unpack('>II',png[16:24]);key=(state['activity'],before['url'],before['width'],before['height'],before['dpr'],physical)
    if force or key not in _geometry:
        raw=d.xml();rectangles=set()
        for n in d.nodes(raw):
            if n.get('class')=='android.webkit.WebView':
                xy=tuple(map(int,re.findall(r'-?\d+',n.get('bounds',''))))
                if len(xy)==4 and xy[2]>xy[0]and xy[3]>xy[1]:rectangles.add(xy)
        if len(rectangles)!=1:raise RuntimeError({'ambiguousWebViewBounds':sorted(rectangles),'activity':state})
        after=c.evaluate(VIEW,activity=activity)
        if after!=before:raise RuntimeError({'viewportChangedDuringMeasurement':{'before':before,'after':after}})
        bounds=next(iter(rectangles));l,t,r,b=bounds;assert 0<=l<r<=physical[0]and 0<=t<b<=physical[1]
        _geometry[key]={'activity':state['activity'],'css':before,'physical':list(physical),'bounds':list(bounds),'source':'Actual fresh UIAutomator WebView bounds matched CSS/physical dimensions','measuredUTC':datetime.now(timezone.utc).isoformat()}
    return _geometry[key]

def targets(selector,activity='auto'):
    return c.evaluate("(()=>{return {viewport:"+VIEW+",targets:[...document.querySelectorAll("+json.dumps(selector)+")].map(e=>{let r=e.getBoundingClientRect(),s=getComputedStyle(e),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{id:e.id,text:e.textContent.trim(),rect:r.toJSON(),visible:!e.hidden&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible',enabled:!e.disabled,hit:!!h&&e.contains(h)}})}})()",activity=activity)

def point(selector,xfrac=.5,yfrac=.5,activity='auto'):
    g=measure(activity);out=targets(selector,activity)
    if out['viewport']!=g['css']:raise RuntimeError('Viewport changed before input; stop and remeasure after settling')
    rows=[x for x in out['targets']if x['visible']and x['enabled']and x['hit']]
    if len(rows)!=1:raise RuntimeError({'expectedSingleVisibleHitTarget':selector,'actual':out['targets']})
    target=rows[0];r=target['rect'];l,t,right,bottom=g['bounds'];v=g['css']
    x=l+(r['x']+r['width']*xfrac)*(right-l)/v['width'];y=t+(r['y']+r['height']*yfrac)*(bottom-t)/v['height']
    assert l<=x<right and t<=y<bottom
    return {'selector':selector,'target':target,'physical':[round(x),round(y)],'geometry':g}

def tap(selector,activity='auto'):
    value=point(selector,activity=activity);d.adb('shell','input','tap',*map(str,value['physical']));return value

def swipe(selector,activity='auto'):
    a=point(selector,.8,.5,activity);b=point(selector,.2,.5,activity)
    assert a['geometry']==b['geometry'],'Viewport changed during swipe preflight'
    d.adb('shell','input','swipe',*map(str,a['physical']),*map(str,b['physical']),'350');return {'from':a,'to':b}

def global_players(activity='auto'):
    rows=[x for x in targets('button',activity)['targets']if x['visible']and x['enabled']and x['hit']and x['text'].upper()=='PLAYERS']
    if len(rows)!=1 or not rows[0]['id']:raise RuntimeError({'globalPlayersNotUnique':rows})
    return '#'+rows[0]['id']

def native_owned():
    gate=c.evaluate("(()=>{let w=document.querySelector('#warzone-game-frame')?.contentWindow,n=w?.PcMultiplayerNative?.state;return {exists:!!w,allowed:!w?.__warzoneMultiplayerMode||!!n&&n.canIssueOrders&&!n.spectator&&n.realPlayer===n.player}})()")
    if not gate['exists']or not gate['allowed']:raise RuntimeError({'ownedNativeStateForbidden':gate})
    c.evaluate("(()=>{const w=document.querySelector('#warzone-game-frame').contentWindow;w.__qaNativeState=null;w.__warzoneCommands.send('state',{}, {fresh:true}).then(r=>w.__qaNativeState=r);return true})()")
    return c.wait("document.querySelector('#warzone-game-frame').contentWindow.__qaNativeState",timeout=10)

def fingerprint_prepared():
    baseline=json.loads((c.ROOT/'baseline-identity-and-saves.json').read_text())['saves']
    actual=c.rpc('fingerprint',paths=[x['path']for x in baseline])['fingerprints']['files']
    expected={x['path']:(x['bytes'],x['sha256'])for x in baseline}
    assert {x['path']:(x.get('bytes'),x.get('sha256'))for x in actual}==expected,actual
    return {'samePreparedArchives':True,'files':actual}
