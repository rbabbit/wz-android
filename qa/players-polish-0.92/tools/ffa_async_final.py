import json
import control as c,qa092 as q,final_offline092 as f,qa_async_tap as a,playersqa_current as p
q.PREFER_NATIVE=True;q.tap=a.tap
def body(name,steps):
 steps['save']=f.choose_timestamp(name,'ffa','12 Nov, 15:15');steps['loaded']=f.f.ready_loaded(90)
 steps['ordinaryONBirth']=f.f.birth(name+'-on',True,80)
 steps['offDeselect']=f.set_combat(False,'#wt-all-combat');p.save(name+'-off',nativeCommands=True)
result=f.guarded('ffa','final-ffa-async',body)
q.write('final-ffa-async-input-receipts',{'input':'Real SOURCE_TOUCHSCREEN asynchronous native InputEvent injection from external helper; app unchanged','receipts':a.receipts})
print(json.dumps({'status':result['status'],'error':result.get('error')}))
