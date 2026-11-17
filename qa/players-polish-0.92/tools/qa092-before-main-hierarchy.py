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

def native_hierarchy_bounds(raw,activity,css,physical):
    """Pure parser: actual current MP hierarchy only; never supplies fixed coordinates."""
    blocks=list(re.finditer(r'^\s*ACTIVITY\s+(\S+)[^\n]*',raw,re.M));matches=[]
    short=activity.rsplit('.',1)[-1]
    for i,m in enumerate(blocks):
        component=m.group(1);name=component.split('/',1)[-1]
        if name==activity or name=='.'+short or name.endswith('.'+short):
            matches.append(raw[m.end():blocks[i+1].start()if i+1<len(blocks)else len(raw)])
    if len(matches)!=1:raise RuntimeError({'matchingNativeActivitySections':len(matches),'expected':activity})
    section=matches[0]
    if 'View Hierarchy:'not in section:raise RuntimeError('No actual native View Hierarchy in current Activity')
    hierarchy=section.split('View Hierarchy:',1)[1];stack=[];views=[]
    pattern=re.compile(r'^(\s*)([\w.$]+)\{[^\n}]*?\s(-?\d+),(-?\d+)-(-?\d+),(-?\d+)[^\n}]*\}')
    for line in hierarchy.splitlines():
        m=pattern.match(line)
        if not m:continue
        indent=len(m.group(1));name=m.group(2);rectangle=list(map(int,m.group(3,4,5,6)))
        while stack and stack[-1]['indent']>=indent:stack.pop()
        inside=line.split('{',1)[1].split('}',1)[0].split();flags=inside[1]if len(inside)>1 else''
        node={'name':name,'rect':rectangle,'indent':indent,'parent':stack[-1]if stack else None,'flags':flags}
        views.append(node);stack.append(node)
    webs=[v for v in views if v['name'].endswith('MultiplayerWebView')]
    pairs=[(w,n)for w in webs for n in views if n['name'].endswith('MultiplayerLobbyView')and n['parent']is w['parent']and w['parent']is not None]
    if len(pairs)!=1:raise RuntimeError({'matchingActualMPWebViewLobbySiblingPairs':len(pairs)})
    web,lobby=pairs[0];parent=web['parent'];pw,ph=physical
    if parent['rect']!=[0,0,pw,ph]:raise RuntimeError({'nativeParentDoesNotMatchPhysicalPNG':parent['rect'],'physical':list(physical)})
    # Ancestors must introduce no unmeasured translation.
    ancestor=parent['parent']
    while ancestor:
        if ancestor['rect'][0:2]!=[0,0]:raise RuntimeError({'unmeasuredNativeAncestorOffset':ancestor['rect']})
        ancestor=ancestor['parent']
    l,t,r,b=lobby['rect'];wl,wt,wr,wb=web['rect'];vw,vh=wr-wl,wb-wt
    if not(0<=l<r<=pw and 0<=t<b<=ph and wl==l and wt==t and vw>0 and vh>0):raise RuntimeError({'nativeSiblingGeometryMismatch':{'web':web['rect'],'lobby':lobby['rect']}})
    dpr=float(css['dpr']);tolerance=max(2,dpr+1)
    if abs(vw-css['width']*dpr)>tolerance or abs(vh-css['height']*dpr)>tolerance:raise RuntimeError({'nativeVirtualCSSDprMismatch':{'native':[vw,vh],'css':css}})
    sx=(r-l)/vw;sy=(b-t)/vh
    if not(0<sx<=1.01 and 0<sy<=1.01 and abs(sx-sy)<=2/min(vw,vh)):raise RuntimeError({'nonuniformNativeScale':{'x':sx,'y':sy}})
    return [l,t,r,b],{'source':'Actual dumpsys activity top current Activity WebView/nativeLobbyView sibling hierarchy; uniform fitViewport scale verified',
                     'nativeVirtualRect':web['rect'],'nativeAvailableRect':lobby['rect'],'nativeParentRect':parent['rect'],
                     'derivedScaleX':sx,'derivedScaleY':sy,'derivedUniformScale':(sx+sy)/2,'virtualCSSDprTolerancePixels':tolerance,
                     'webViewFlags':web['flags'],'nativeLobbyFlags':lobby['flags'],'webViewVisible':web['flags'].startswith('V')}

def measure(activity='auto',force=False,prefer_native=False):
    """One actual UIA measurement per activity/viewport, no blind retries."""
    before=c.evaluate(VIEW,activity=activity);state=c.rpc('state',activity=activity)['state']
    png=d.adb('exec-out','screencap','-p',binary=True);assert png.startswith(b'\x89PNG')
    physical=struct.unpack('>II',png[16:24]);key=(state['activity'],before['url'],before['width'],before['height'],before['dpr'],physical)
    if force or key not in _geometry:
        observation={};rectangles=set();uia_error=None
        if not prefer_native:
            try:
                raw=d.xml()
                for n in d.nodes(raw):
                    if n.get('class')=='android.webkit.WebView':
                        xy=tuple(map(int,re.findall(r'-?\d+',n.get('bounds',''))))
                        if len(xy)==4 and xy[2]>xy[0]and xy[3]>xy[1]:rectangles.add(xy)
                if len(rectangles)!=1:raise RuntimeError({'ambiguousWebViewBounds':sorted(rectangles)})
            except Exception as error:uia_error=type(error).__name__;rectangles.clear()
        if prefer_native or uia_error:
            raw=d.adb('shell','dumpsys','activity','top',timeout=15)
            bounds,observation=native_hierarchy_bounds(raw,state['activity'],before,physical)
            rectangles={tuple(bounds)};observation['uiaFailureType']=uia_error;observation['nativeMethodExplicitlyRequested']=prefer_native
        after=c.evaluate(VIEW,activity=activity)
        if after!=before:raise RuntimeError({'viewportChangedDuringMeasurement':{'before':before,'after':after}})
        bounds=next(iter(rectangles));l,t,r,b=bounds;assert 0<=l<r<=physical[0]and 0<=t<b<=physical[1]
        _geometry[key]={'activity':state['activity'],'css':before,'physical':list(physical),'bounds':list(bounds),'source':'Actual fresh UIAutomator WebView bounds matched CSS/physical dimensions','measuredUTC':datetime.now(timezone.utc).isoformat(),**observation}
    return _geometry[key]

def targets(selector,activity='auto'):
    return c.evaluate("(()=>{return {viewport:"+VIEW+",targets:[...document.querySelectorAll("+json.dumps(selector)+")].map(e=>{let r=e.getBoundingClientRect(),s=getComputedStyle(e),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{id:e.id,text:e.textContent.trim(),rect:r.toJSON(),visible:!e.hidden&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible',enabled:!e.disabled,hit:!!h&&e.contains(h)}})}})()",activity=activity)

def point(selector,xfrac=.5,yfrac=.5,activity='auto'):
    g=measure(activity);out=targets(selector,activity)
    if g.get('webViewVisible')is False:raise RuntimeError('Native WebView is not visible; use native UI controls, not HTML touch mapping')
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
