import json
import control as c,qa092 as q,final_offline092 as f,playersqa_current as p,run_final_ffa_mouse as mouse
q.PREFER_NATIVE=True;q.tap=mouse.tap
result={'status':'incomplete','sameAlreadyLoadedCheckpoint':True,'priorStandardNavigationAndBothLayouts':'final-ffa-loaded-result.json','steps':{}}
try:
 assert not p.read()['report']['open'];assert c.evaluate(f.W+'.__warzoneCommands.report().page')==''
 result['steps']['ordinaryONBirth']=f.f.birth('final-ffa-production-on',True,80);result['steps']['off']=f.set_combat(False,'#wt-all-combat');p.save('final-ffa-production-off',nativeCommands=True)
 result['steps']['normalReturn']=f.normal_return('final-ffa-production');result['archivesAfter']=q.fingerprint_prepared();result['status']='observed'
except Exception as e:
 result.update(errorType=type(e).__name__,error=str(e));q.screen('final-ffa-production-stopped')
finally:
 result['sourceMouseReceipts']=mouse.receipts;q.write('final-ffa-production-result',result)
print(json.dumps({'status':result['status'],'error':result.get('error'),'steps':list(result['steps'])}))
