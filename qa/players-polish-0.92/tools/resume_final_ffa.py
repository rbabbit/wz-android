import json,time,xml.etree.ElementTree as ET
import control as c,device as d,qa092 as q,final_offline092 as f,playersqa_current as p,journey_steps as j,run_final_ffa_mouse as mouse
q.PREFER_NATIVE=True;q.tap=mouse.tap
result={'status':'incomplete','resumeWithoutRestartingChooser':True,'steps':{}}
try:
 rows=d.nodes(d.xml());ss=[n for n in rows if n.get('class')=='android.widget.ScrollView'and n.get('scrollable')=='true'];assert len(ss)==1
 l,t,r,b=f.f.bounds(ss[0]);d.adb('shell','input','swipe',str((l+r)//2),str(round(t+(b-t)*.8)),str((l+r)//2),str(round(t+(b-t)*.2)),'350')
 tree=ET.fromstring(d.xml());parents={child:parent for parent in tree.iter()for child in parent}
 hits=[n for n in tree.iter('node')if n.get('text')=='12 Nov, 15:15'and n.get('visible-to-user')=='true'];assert len(hits)==1
 row=hits[0];loads=[]
 while row in parents:
  loads=[n for n in row.iter('node')if n.get('text')=='LOAD'and n.get('visible-to-user')=='true']
  if len(loads)==1:break
  row=parents[row]
 assert len(loads)==1;l,t,r,b=f.f.bounds(loads[0]);assert 0<=l<r<=2400 and 0<=t<b<=1080
 result['steps']['actualVisibleSaveRow']=[n.get('text')for n in row.iter('node')if n.get('text')];q.screen('final-ffa-resume-visible-chooser');f.native_node_tap(loads[0]);result['steps']['loaded']=f.f.ready_loaded(90)
 q.measure(force=True);p.openpage();out=p.save('final-ffa-resume-players');p.assert_clean_panel(out);p.assert_privacy(out);assert out['native']['mode']=='offline-skirmish'and len(out['native']['players'])==4
 p.closepage();result['steps']['standard']=j.players_cycle('final-ffa-resume-standard','offline-skirmish')
 p.openpage();result['steps']['compact']=f.f.compact_players('final-ffa-resume');p.closepage()
 result['steps']['ordinaryONBirth']=f.f.birth('final-ffa-resume-on',True,80);result['steps']['off']=f.set_combat(False,'#wt-all-combat');p.save('final-ffa-resume-off',nativeCommands=True)
 result['steps']['normalReturn']=f.normal_return('final-ffa-resume');result['archivesAfter']=q.fingerprint_prepared();result['status']='observed'
except Exception as e:
 result.update(errorType=type(e).__name__,error=str(e));q.screen('final-ffa-resume-stopped')
finally:
 result['sourceMouseReceipts']=mouse.receipts;q.write('final-ffa-resume-result',result)
print(json.dumps({'status':result['status'],'error':result.get('error'),'steps':list(result['steps'])}))
