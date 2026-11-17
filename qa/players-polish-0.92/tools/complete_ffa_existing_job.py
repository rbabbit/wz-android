import json,time
import control as c,qa092 as q,final_offline092 as f,qa_async_tap as a,playersqa_current as p
q.PREFER_NATIVE=True;q.tap=a.tap
r={'status':'incomplete','sameAcceptedJobNoRequeue':True,'priorProof':'final-ffa-async-resume-on-production-incomplete.json','steps':{}}
try:
 old=json.loads((c.ROOT/r['priorProof']).read_text());factory=old['ordinaryFactory']['id'];known={u['id']for u in old['before']['result'].get('finishedUnits',[])};events=[];until=time.monotonic()+45;birth=None
 assert p.read()['report']['open']
 while time.monotonic()<until:
  n=q.native_owned();events.append({'gameTime':n['gameTime'],'finishedUnits':n['result'].get('finishedUnits',[])})
  new=[u for u in n['result'].get('finishedUnits',[])if u['id']not in known and u.get('factoryId')==factory and u.get('name')=='Design 1']
  if new:birth=new[0];break
  time.sleep(.35)
 r['steps']['birth']={'unit':birth,'events':events,'nativeProductionPreviouslyAdvancedTo80Percent':True};assert birth
 p.save('final-ffa-async-born-panel',nativeCommands=True);p.closepage()
 r['steps']['restored']=c.wait(f.f.LOCK,lambda x:x and x['enabled']and not x['suspended']and birth['id']in x['selectedIds'],timeout=9)
 r['steps']['off']=f.set_combat(False,'#wt-all-combat');p.save('final-ffa-async-off-restored',nativeCommands=True)
 p.openpage();r['steps']['compact']=f.f.compact_players('final-ffa-async-compact-final');p.closepage()
 r['steps']['normalReturn']=f.normal_return('final-ffa-async-completed');r['archivesAfter']=q.fingerprint_prepared();r['status']='observed'
except Exception as e:
 r.update(errorType=type(e).__name__,error=str(e));q.screen('final-ffa-async-completion-stopped')
finally:
 r['asyncRealFingerClickReceipts']=a.receipts;q.write('final-ffa-async-completion',r)
print(json.dumps({'status':r['status'],'error':r.get('error')}))
