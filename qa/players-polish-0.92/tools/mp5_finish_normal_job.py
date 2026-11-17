import json,time
import control as c,qa092 as q,qa_async_tap as a,playersqa_current as p,mp092_operator as m,mp092_receipted_run5_async as r
q.PREFER_NATIVE=True;q.tap=a.tap
H="document.querySelector('#warzone-game-frame').contentWindow.__warzoneCommands.report().history"
result={'status':'incomplete','firstJobAlreadyCompleted':'run5-existing-production-after-bound.json','independentSecondOrdinaryProduction':True,'steps':{}}
try:
 before=c.evaluate(r.BRIEF,activity='mp');assert before['commands']['page']=='factory'and before['commands']['factory']==160411
 old=set(before['native']['combatLock']['combatIds']);assert 160691 in old
 prior=c.evaluate(H,activity='mp');nonces={v['nonce']for v in prior};n=q.native_owned();factory=next(v for v in n['result']['factories']if v['id']==160411);assert factory['idle']and not factory['queue']
 result['steps']['preflight']={'brief':before,'native':n,'priorHistory':prior}
 q.tap('[aria-label="Manufacture Design 1"]',activity='mp')
 ack=c.wait(H,lambda rows:any(v.get('action')=='queue-production'and v.get('ok')and v.get('nonce')not in nonces and(v.get('result')or{}).get('factoryId')==160411 for v in rows),timeout=40,activity='mp')
 n=q.native_owned();factory=next(v for v in n['result']['factories']if v['id']==160411);assert not factory['idle']or factory['active']or factory['queue'],'No active second job; do not retry'
 result['steps']['ACKandJob']={'history':ack,'native':n};q.write('run5-final-second-job-ACK',result['steps']['ACKandJob'])
 p.openpage();p.save('run5-final-job-players-open',nativeCommands=False)
 events=[];birth=None;until=time.monotonic()+120;lastclock=None;advanced=time.monotonic()
 while time.monotonic()<until:
  state=c.evaluate(r.BRIEF,activity='mp');native=state['native'];assert native['canIssueOrders']and native['player']==native['realPlayer']==1 and native['phase']=='game';assert state['players']['open']
  clock=native['gameTime'];ids=set(native['combatLock']['combatIds']);events.append({'native':native,'players':state['players']})
  if clock!=lastclock:lastclock=clock;advanced=time.monotonic()
  if time.monotonic()-advanced>12:raise RuntimeError('Native clock stalled; no retry')
  new=ids-old
  if new:assert len(new)==1;birth=next(iter(new));break
  time.sleep(.35)
 result['steps']['birth']={'newNativeCombatID':birth,'events':events};assert birth
 p.save('run5-final-born-panel',nativeCommands=False);p.closepage()
 result['steps']['selected']=c.wait(r.BRIEF,lambda v:v['native']['combatLock']['enabled']and not v['native']['combatLock']['suspended']and birth in v['native']['combatLock']['selectedIds'],timeout=10,activity='mp')
 selected=q.native_owned();unit=next(v for v in selected['result']['selectedUnits']if v['id']==birth);assert unit.get('name')=='Design 1',unit
 result['steps']['attributedNativeUnit']={'newUnit':unit,'native':selected,'factoryACK':160411};q.write('run5-final-native-birth-selection',result['steps']['attributedNativeUnit'])
 q.tap('#blocknight-combat',activity='mp');result['steps']['off']=c.wait(r.BRIEF,lambda v:not v['native']['combatLock']['enabled']and not v['native']['combatLock']['selectedIds']and not v['native']['combatLock']['pendingDeselect'],timeout=10,activity='mp')
 p.save('run5-final-off-world',nativeCommands=False);result['steps']['dataChecks']=m.host_data_check('player',1,run5=True)
 q.tap('#leave',activity='mp');q.screen('run5-final-native-leave-prompt');result['status']='observed-native-flow-awaiting-normal-Return'
except Exception as e:
 result.update(errorType=type(e).__name__,error=str(e));q.screen('run5-final-flow-stopped')
finally:
 result['asyncRealFingerClickReceipts']=a.receipts;q.write('run5-final-flow-result',result)
print(json.dumps({'status':result['status'],'error':result.get('error'),'steps':list(result['steps'])}))
