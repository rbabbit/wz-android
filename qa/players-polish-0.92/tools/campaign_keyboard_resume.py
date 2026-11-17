import json,time,hashlib
import control as c
import device as d
import qa092 as g
import journey_steps as j
import final_offline092 as f
import playersqa_current as p
g.PREFER_NATIVE=True
result={'status':'incomplete','inputMethod':'Normal Android hardware keyboard Enter/Tab with actual focused target checked before every key; no DOM click or focus mutation','originalResult':'final-campaign-result.json','steps':{}}
try:
 active=c.evaluate('document.activeElement?.id');assert active=='wt-design-name-button',active
 before=c.evaluate(g.VIEW);d.adb('shell','input','keyevent','66')
 c.wait('!!document.querySelector("#wt-design-rename-input")?.getBoundingClientRect().width',timeout=6)
 original=c.evaluate('document.querySelector("#wt-design-rename-input").value');on=j.ime_state(True);g.screen('final-campaign-ime2-keyboard-open')
 d.back();off=j.ime_state(False);c.wait(g.VIEW,lambda x:x==before,timeout=8);g.screen('final-campaign-ime2-keyboard-back')
 focus=[]
 for key in ('61','61'):
  d.adb('shell','input','keyevent',key);focus.append(c.evaluate('({id:document.activeElement?.id,action:document.activeElement?.dataset.action,tag:document.activeElement?.tagName})'))
 assert focus[-1]['action']=='cancel-design-rename',focus
 d.adb('shell','input','keyevent','66');c.wait('!document.querySelector("#wt-design-rename-input")?.getBoundingClientRect().width',timeout=6)
 result['steps']['ime2']={'on':on,'off':off,'restoredViewport':before,'originalName':original,'focus':focus,'cancelWithoutSave':True}
 # The same known target is now focused; a second normal Enter/Back/Tab/Enter cycle.
 assert c.evaluate('document.activeElement?.id')=='wt-design-name-button'
 d.adb('shell','input','keyevent','66');c.wait('!!document.querySelector("#wt-design-rename-input")?.getBoundingClientRect().width',timeout=6)
 on=j.ime_state(True);d.back();off=j.ime_state(False);c.wait(g.VIEW,lambda x:x==before,timeout=8)
 for i in range(2):d.adb('shell','input','keyevent','61')
 assert c.evaluate('document.activeElement?.dataset.action')=='cancel-design-rename'
 d.adb('shell','input','keyevent','66');c.wait('!document.querySelector("#wt-design-rename-input")?.getBoundingClientRect().width',timeout=6)
 result['steps']['ime3']={'on':on,'off':off,'cancelWithoutSave':True}
 g.tap('[aria-label="Back to manufacturing"]');c.wait(f.W+'.__warzoneCommands.report().page',lambda x:x=='factory',timeout=8)
 g.tap('#wt-open-factory');c.wait(f.W+'.__warzoneCommands.report().page',lambda x:x=='',timeout=8)
 c.wait(f.f.LOCK,lambda x:x and x['enabled']and not x['suspended']and sorted(x['selectedIds'])==f.CAMPAIGN,timeout=10)
 start=g.native_owned();units=start['result']['selectedUnits'];assert sorted(x['id']for x in units)==f.CAMPAIGN
 assert all(11<=u['x']<=17 and 47<=u['y']<=54 for u in units)
 projection=j.project_visible_tile(14,53);assert projection['hitFrame']and projection['z']==0
 geometry=g.measure();l,t,r,b=geometry['bounds'];v=geometry['css'];frame=projection['frame'];x=l+(frame['left']+projection['p']['x'])*(r-l)/v['width'];y=t+(frame['top']+projection['p']['y'])*(b-t)/v['height']
 d.adb('shell','input','tap',str(round(x)),str(round(y)));events=[];seen=False;changed=False;until=time.monotonic()+18
 result['steps']['movement']={'start':start,'target':[14,53],'projection':projection,'physicalTap':[x,y],'events':events}
 while time.monotonic()<until:
  n=g.native_owned();events.append(n);now=n['result']['selectedUnits'];seen=seen or any(u['order']==2 for u in now);changed=any(any(a['id']==u['id']and abs(a['x']-u['x'])+abs(a['y']-u['y'])>=1 for a in units)for u in now)
  if seen and changed:break
  time.sleep(.25)
 result['steps']['movement'].update(nativeMoveACK=seen,positionsChanged=changed);assert seen and changed
 p.save('final-campaign-keyboard-post-ime-move',nativeCommands=True);result['steps']['off']=f.set_combat(False,'#wt-campaign-all-combat')
 result['steps']['normalReturn']=f.normal_return('final-campaign-keyboard');result['archivesAfter']=g.fingerprint_prepared();result['status']='observed'
except Exception as e:
 result.update(errorType=type(e).__name__,error=str(e));g.screen('final-campaign-keyboard-stopped')
finally:g.write('final-campaign-keyboard-completion',result)
print(json.dumps({'status':result['status'],'error':result.get('error'),'steps':list(result['steps'])}))
