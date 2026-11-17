import control as c,json,time,re

READ="""(()=>{const f=document.querySelector('#warzone-game-frame'),w=f?.contentWindow;let publication=null,pubError=null;try{publication=w?.eval("JSON.parse(LaunchedModule.FS.readFile('/tmp/warzone-combat-selection-v89.json',{encoding:'utf8'}))")}catch(e){pubError=String(e)}const b=[...document.querySelectorAll('#wt-all-combat,#wt-campaign-all-combat,#blocknight-combat')].map(e=>({id:e.id,text:e.textContent,rect:e.getBoundingClientRect().toJSON(),color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,pressed:e.getAttribute('aria-pressed'),combatSelected:e.dataset.combatSelected,combatEnabled:e.dataset.combatEnabled,disabled:e.disabled,labelRect:e.querySelector('span')?.getBoundingClientRect().toJSON(),hidden:e.hidden}));const canvas=w?.document.querySelector('canvas');return {parent:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},iframe:f?.getBoundingClientRect().toJSON(),child:w?{width:w.innerWidth,height:w.innerHeight,dpr:w.devicePixelRatio}:null,canvas:canvas?{width:canvas.width,height:canvas.height,rect:canvas.getBoundingClientRect().toJSON()}:null,buttons:b,publication,pubError,touch:w?.__kalaWarzoneTouch?.report?.(),native:w?.PcMultiplayerNative?.state,mpControls:w?.PcMultiplayerControls?.report?.(),commands:w?.__warzoneCommands?.report?.(),qaNative:w?.__qaNativeState,campaign:w?.__warzoneCampaign?.report?.()}})()"""
def native():
 c.evaluate("(()=>{const w=document.querySelector('#warzone-game-frame').contentWindow;w.__qaNativeState=null;w.__warzoneCommands.send('state',{}, {fresh:true}).then(r=>w.__qaNativeState=r);return true})()")
 return c.wait("document.querySelector('#warzone-game-frame').contentWindow.__qaNativeState",timeout=10)
def snapshot(name,withNative=True):
 n=native()if withNative else None;out=c.evaluate(READ);out['qaNative']=n
 (c.ROOT/(name+'-metrics.json')).write_text(json.dumps(out,indent=2)+'\n');c.capture(name);return out
def tap(selector):
 p=c.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)return null;const r=e.getBoundingClientRect();return {rect:r.toJSON(),width:innerWidth,height:innerHeight,visible:r.width>0&&r.height>0&&!e.hidden,enabled:!e.disabled,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()")
 assert p and p['visible'] and p.get('enabled',True) and p['hit'],p
 rows=c.d.nodes(c.d.xml());wv=next(n for n in rows if n.get('class')=='android.webkit.WebView');l,t,r,b=map(int,re.findall(r'-?\d+',wv['bounds']));q=p['rect'];x=l+(q['x']+q['width']/2)*(r-l)/p['width'];y=t+(q['y']+q['height']/2)*(b-t)/p['height'];c.adb('shell','input','tap',str(round(x)),str(round(y)));return {'selector':selector,'physical':[x,y],'javaWebViewBounds':[l,t,r,b]}
def waitWorld(timeout=45):return c.wait("(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow;return Boolean(w?.__warzoneCommands?.report?.().snapshot?.gameTime>0)})()",timeout=timeout)

def tapFast(selector,bounds=(131,0,2400,1080)):
 p=c.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)return null;const r=e.getBoundingClientRect();return {rect:r.toJSON(),width:innerWidth,height:innerHeight,visible:r.width>0&&r.height>0&&!e.hidden,enabled:!e.disabled,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()")
 assert p and p['visible'] and p.get('enabled',True) and p['hit'],p
 l,t,r,b=bounds;q=p['rect'];x=l+(q['x']+q['width']/2)*(r-l)/p['width'];y=t+(q['y']+q['height']/2)*(b-t)/p['height'];c.adb('shell','input','tap',str(round(x)),str(round(y)));return {'selector':selector,'physical':[x,y],'javaWebViewBounds':list(bounds),'validatedBoundsSource':'Validated retained5562 JavaWebView bounds; recheck for each viewport'}

def snapshotFast(name,withNative=True):
 n=native()if withNative else None;out=c.evaluate(READ);out['qaNative']=n
 (c.ROOT/(name+'-metrics.json')).write_text(json.dumps(out,indent=2)+'\n')
 png=c.adb('exec-out','screencap','-p',binary=True);assert png.startswith(b'\x89PNG');(c.ROOT/(name+'.png')).write_bytes(png)
 return out

# Current092 actions always measure actual activity/viewport bounds.
import qa092 as _current092
native=_current092.native_owned
tap=_current092.tap
def tapFast(selector,bounds=None):
 if bounds is not None:raise RuntimeError('Legacy fixedbounds input refused; use qa092.measure() and tap()')
 return _current092.tap(selector)
