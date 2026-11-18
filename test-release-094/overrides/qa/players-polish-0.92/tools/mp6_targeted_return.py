import json,time,subprocess
import control as c,device as d,qa092 as q,qa_async_tap as a,final_offline092 as f,mp092_operator as m,playersqa_current as p,mp092_receipted_run5_async as r
q.PREFER_NATIVE=True;q.tap=a.tap
root=c.ROOT/'private-host-player-run6';result={'status':'incomplete','scope':'Only ON/OFF native deselect, Players toggle and actual user Return. No manufacture or prior journey repeated.','steps':{}}
def native_wait(test,seconds=12):
 until=time.monotonic()+seconds
 while time.monotonic()<until:
  try:
   rows=d.nodes(d.xml())
   if test(rows):return rows
  except RuntimeError as e:
   if 'Active accessibility window is unavailable'not in str(e):raise
  time.sleep(.15)
 raise RuntimeError('Observed native transition deadline; no repeated input')
try:
 f.home_actual();m.launch_from_home();m.wait_real_http_settled()
 assert not(root/'run-claim.json').exists();out=(root/'wrapper.stdout.log').open('xb');err=(root/'wrapper.stderr.log').open('xb')
 proc=subprocess.Popen(['python',str(root/'host.py'),'--start','--max-seconds','240'],stdin=subprocess.DEVNULL,stdout=out,stderr=err,creationflags=subprocess.CREATE_NO_WINDOW);out.close();err.close()
 until=time.monotonic()+40
 while time.monotonic()<until:
  path=root/'run-status.json'
  if path.exists():
   status=json.loads(path.read_text())
   if status.get('initialListeningConfirmed'):break
   assert status['state']!='stopped'
  time.sleep(.25)
 else:raise RuntimeError('Owned host not ready')
 installed=c.evaluate((c.ROOT/'private-directory-player-run6.js').read_text(),activity='mp');assert installed['installed']and installed['port']==22210 and not installed['nativeGameplayMocked']
 m.refresh_owned_directory();result['steps']['room']=m.normal_join();q.measure(activity='mp',force=True,prefer_native=True);q.tap('#mp-room-ready',activity='mp');result['steps']['live']=m.wait_live('player',60)
 q.measure(activity='mp',force=True,prefer_native=True);q.tap('#blocknight-combat',activity='mp');result['steps']['on']=c.wait(r.BRIEF,lambda v:v['native']['combatLock']['enabled']and not v['native']['combatLock']['suspended'],timeout=12,activity='mp')
 q.tap('#blocknight-combat',activity='mp');result['steps']['off']=c.wait(r.BRIEF,lambda v:not v['native']['combatLock']['enabled']and not v['native']['combatLock']['selectedIds']and not v['native']['combatLock']['pendingDeselect'],timeout=12,activity='mp')
 q.write('run6-targeted-native-ON-OFF',{'on':result['steps']['on'],'off':result['steps']['off'],'initialCombatUnitCount':len(result['steps']['on']['native']['combatLock']['combatIds']),'noProductionOrSeed':True})
 p.openpage();p.save('run6-targeted-players',nativeCommands=False);p.closepage();q.tap('#leave',activity='mp');native_wait(lambda rows:bool(d._native_targets(rows,'Return')));q.screen('run6-targeted-native-Return-dialog');d.tap('Return')
 result['steps']['actualUserReturn']=c.wait(m.STATE,lambda s:not s['session']['active']and s['session']['phase']=='lobby',timeout=20,activity='mp');result['steps']['activityAfterReturn']=c.rpc('state',activity='mp');assert not result['steps']['activityAfterReturn']['state']['sessionServiceStarted'];q.screen('run6-targeted-return-lobby')
 result['steps']['directoryRemoved']=m.uninstall_directory();d.back();native_wait(lambda rows:len(d._native_targets(rows,'MULTIPLAYER'))==1);result['steps']['Home']=f.home_actual();q.screen('run6-targeted-Main-Home');result['archivesAfter']=q.fingerprint_prepared();result['status']='observed'
except Exception as e:
 result.update(errorType=type(e).__name__,error=str(e));q.screen('run6-targeted-stopped')
finally:
 if(root/'run-claim.json').exists():
  subprocess.run(['python',str(root/'host.py'),'--request-stop'],capture_output=True,text=True,timeout=15)
 result['asyncRealFingerClickReceipts']=a.receipts;q.write('run6-targeted-result',result)
print(json.dumps({'status':result['status'],'error':result.get('error'),'steps':list(result['steps'])}))
