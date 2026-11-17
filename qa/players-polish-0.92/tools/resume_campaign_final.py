import json,time,hashlib
import control as c
import device as d
import qa092 as g
import playersqa_current as p
import journey_steps as j
import final_offline092 as f
g.PREFER_NATIVE=True
result={'status':'incomplete','originalResultSHA256':hashlib.sha256((c.ROOT/'final-campaign-result.json').read_bytes()).hexdigest(),'resumeWithoutReloadOrRepeatingPassedGroups':True,'steps':{}}
try:
 receipt=json.loads((c.ROOT/'final-campaign-cancel-full-events-adb.json').read_text())
 assert receipt['state']['visible']is False and any(e['type']=='click'and e['trusted']for e in receipt['events'])
 result['steps']['ime1']={'actualIMEOpenPNG':'final-campaign-ime1-open.png','actualBackHidIMEPNG':'final-campaign-ime1-back.png','cancelTrustedClickAndHiddenProof':'final-campaign-cancel-full-events-adb.json','cancelWithoutSave':True}
 result['steps']['ime2']=j.campaign_ime_cycle('final-campaign-ime2-resume')
 g.tap('[aria-label="Back to manufacturing"]');g.tap('#wt-open-factory');c.wait(f.W+'.__warzoneCommands.report().page',lambda x:x=='',timeout=10)
 c.wait(f.f.LOCK,lambda x:x and x['enabled']and not x['suspended']and sorted(x['selectedIds'])==f.CAMPAIGN,timeout=10)
 start=g.native_owned();units=start['result']['selectedUnits'];assert sorted(x['id']for x in units)==f.CAMPAIGN
 assert all(11<=u['x']<=17 and 47<=u['y']<=54 for u in units)
 projection=j.project_visible_tile(14,53);assert projection['hitFrame']and projection['z']==0
 geometry=g.measure();l,t,r,b=geometry['bounds'];v=geometry['css'];frame=projection['frame']
 x=l+(frame['left']+projection['p']['x'])*(r-l)/v['width'];y=t+(frame['top']+projection['p']['y'])*(b-t)/v['height'];assert l<=x<r and t<=y<b
 d.adb('shell','input','tap',str(round(x)),str(round(y)))
 events=[];seen=False;changed=False;until=time.monotonic()+18
 result['steps']['movement']={'start':start,'target':[14,53],'projection':projection,'physicalTap':[x,y],'events':events}
 while time.monotonic()<until:
  n=g.native_owned();events.append(n);now=n['result']['selectedUnits'];seen=seen or any(u['order']==2 for u in now)
  changed=any(any(a['id']==u['id']and abs(a['x']-u['x'])+abs(a['y']-u['y'])>=1 for a in units)for u in now)
  if seen and changed:break
  time.sleep(.25)
 result['steps']['movement'].update(nativeMoveACK=seen,positionsChanged=changed);assert seen and changed
 p.save('final-campaign-resume-post-ime-move',nativeCommands=True);result['steps']['off']=f.set_combat(False,'#wt-campaign-all-combat')
 result['steps']['normalReturn']=f.normal_return('final-campaign-resume');result['archivesAfter']=g.fingerprint_prepared();result['status']='observed'
except Exception as e:
 result.update(errorType=type(e).__name__,error=str(e));g.screen('final-campaign-resume-stopped')
finally:
 g.write('final-campaign-resume-completion',result)
print(json.dumps({'status':result['status'],'error':result.get('error'),'steps':list(result['steps'])}))
