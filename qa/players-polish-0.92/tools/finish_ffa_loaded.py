import json
import control as c,device as d,qa092 as q,final_offline092 as f,playersqa_current as p,journey_steps as j,run_final_ffa_mouse as mouse
q.PREFER_NATIVE=True;q.tap=mouse.tap
result={'status':'incomplete','sameAlreadyLoadedCheckpoint':True,'steps':{}}
try:
 q.measure(force=True);out=p.save('final-ffa-loaded-players');p.assert_clean_panel(out);p.assert_privacy(out);assert out['native']['mode']=='offline-skirmish'and len(out['native']['players'])==4
 p.closepage();result['steps']['standard']=j.players_cycle('final-ffa-loaded-standard','offline-skirmish')
 p.openpage();result['steps']['compact']=f.f.compact_players('final-ffa-loaded');p.closepage()
 result['steps']['ordinaryONBirth']=f.f.birth('final-ffa-loaded-on',True,80);result['steps']['off']=f.set_combat(False,'#wt-all-combat');p.save('final-ffa-loaded-off',nativeCommands=True)
 result['steps']['normalReturn']=f.normal_return('final-ffa-loaded');result['archivesAfter']=q.fingerprint_prepared();result['status']='observed'
except Exception as e:
 result.update(errorType=type(e).__name__,error=str(e));q.screen('final-ffa-loaded-stopped')
finally:
 result['sourceMouseReceipts']=mouse.receipts;q.write('final-ffa-loaded-result',result)
print(json.dumps({'status':result['status'],'error':result.get('error'),'steps':list(result['steps'])}))
