import json,time,subprocess
import control as c,device as d,qa092 as q,final_offline092 as f,mp092_operator as m
f.home_actual();m.launch_from_home();m.wait_real_http_settled()
root=c.ROOT/'private-host-player-run5';assert not(root/'run-claim.json').exists()
out=(root/'wrapper.stdout.log').open('xb');err=(root/'wrapper.stderr.log').open('xb')
process=subprocess.Popen(['python',str(root/'host.py'),'--start','--max-seconds','600'],stdin=subprocess.DEVNULL,stdout=out,stderr=err,creationflags=subprocess.CREATE_NO_WINDOW)
out.close();err.close();until=time.monotonic()+40
while time.monotonic()<until:
 path=root/'run-status.json'
 if path.exists():
  status=json.loads(path.read_text())
  if status.get('initialListeningConfirmed'):break
  assert status['state']!='stopped',status
 time.sleep(.25)
else:raise RuntimeError('Host readiness deadline; no join sent')
q.write('run5-owned-wrapper-start',{'wrapperPID':process.pid,'status':status,'onlyOwnedPrivateHost':True})
m.install_directory('player',run5=True);m.refresh_owned_directory();room=m.normal_join();q.write('run5-owned-normal-join',room)
print('Owned run5 room ready for bounded receipted flow',flush=True)
import mp092_receipted_run5_async as r
result=r.run(max_seconds=450)
print(json.dumps({'status':result['status'],'error':result.get('error'),'steps':list(result['steps'])}),flush=True)
