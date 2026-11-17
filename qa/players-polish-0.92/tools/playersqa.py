import control as c,probe as p,json,time,device as d
READ="""(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow;let native=null,error=null;try{native=JSON.parse(w.LaunchedModule.FS.readFile('/tmp/warzone-players-v91.json',{encoding:'utf8'}))}catch(e){error=String(e)}const page=document.querySelector('#wt-command-pages'),content=document.querySelector('#wt-page-content');const rect=e=>{let r=e.getBoundingClientRect(),s=getComputedStyle(e);return {id:e.id,text:e.innerText,rect:r.toJSON(),display:s.display,visibility:s.visibility,opacity:s.opacity,color:s.color,background:s.backgroundColor,hidden:e.hidden,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}};return {url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollX,scrollY,visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop}:null},report:w?.__warzoneCommands?.playersReport?.(),native,error,page:page?{...rect(page),dataset:{...page.dataset},scrollWidth:page.scrollWidth,clientWidth:page.clientWidth}:null,content:content?{text:content.innerText,rect:content.getBoundingClientRect().toJSON(),scrollHeight:content.scrollHeight,clientHeight:content.clientHeight,scrollTop:content.scrollTop,scrollWidth:content.scrollWidth,clientWidth:content.clientWidth}:null,rows:[...document.querySelectorAll('.wt-players-row')].map(e=>({...rect(e),playerId:e.dataset.playerId})),buttons:[...document.querySelectorAll('#wt-open-players,#blocknight-players,#wt-players-close,#wt-players-native-back,[data-players-native]')].map(rect),icons:[...document.querySelectorAll('#wt-open-players img,#blocknight-players img')].map(e=>({src:e.src,complete:e.complete,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight})),bodyNative:document.body.dataset.playersNative,commands:w?.__warzoneCommands?.report?.(),touch:w?.__kalaWarzoneTouch?.report?.(),mp:w?.PcMultiplayerNative?.state,mpControls:w?.PcMultiplayerControls?.report?.()}})()"""
def read():return c.evaluate(READ)
def save(name,nativeCommands=True):
 out=read()
 if nativeCommands:out['qaNative']=p.native()
 (c.ROOT/(name+'.json')).write_text(json.dumps(out,indent=2)+'\n')
 (c.ROOT/(name+'.png')).write_bytes(d.adb('exec-out','screencap','-p',binary=True))
 print(json.dumps({'name':name,'ready':out.get('report',{}).get('ready'),'role':out.get('native',{}).get('viewer'),'rows':[(r['id'],r['name']) for r in (out.get('native',{})or{}).get('players',[])],'viewport':out['viewport'],'page':out.get('page',{}).get('dataset')},indent=2),flush=True);return out
def opened(timeout=12):
 return c.wait(READ,lambda o:o.get('report',{}).get('open') and o.get('report',{}).get('ready') and o.get('native',{}).get('ready'),timeout=timeout)
def openpage(mp=False,bounds=(0,0,2400,1080)):
 p.tapFast('#wt-open-players',bounds);return opened()
def closepage(bounds=(0,0,2400,1080)):
 p.tapFast('#wt-players-close',bounds);return c.wait(READ,lambda o:not o.get('report',{}).get('open'),timeout=5)

# The old091 implementation above is retained as provenance only.
# These inert092 definitions replace its obsolete Close/fixedbounds methods.
from playersqa_current import *
