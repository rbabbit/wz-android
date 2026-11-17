import json
import control as c,qa092 as q,final_offline092 as f,qa_async_tap as a,playersqa_current as p
q.PREFER_NATIVE=True;q.tap=a.tap
r={'status':'incomplete','resumedAlreadyOpenNativeChooser':True,'steps':{}}
try:
 r['steps']['save']=f.choose_timestamp('final-ffa-async-resume','ffa','12 Nov, 15:15',already_open=True);r['steps']['loaded']=f.f.ready_loaded(90)
 r['steps']['ordinaryONBirth']=f.f.birth('final-ffa-async-resume-on',True,80)
 r['steps']['off']=f.set_combat(False,'#wt-all-combat');p.save('final-ffa-async-resume-off',nativeCommands=True)
 r['steps']['normalReturn']=f.normal_return('final-ffa-async-resume');r['archivesAfter']=q.fingerprint_prepared();r['status']='observed'
except Exception as e:
 r.update(errorType=type(e).__name__,error=str(e));q.screen('final-ffa-async-resume-stopped')
finally:
 r['asyncRealFingerClickReceipts']=a.receipts;q.write('final-ffa-async-resume-result',r)
print(json.dumps({'status':r['status'],'error':r.get('error')}))
