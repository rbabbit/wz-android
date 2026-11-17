"""One-off inert QA preparation; never launches a host or contacts a device."""
from pathlib import Path
import hashlib, json, shutil

ROOT = Path(__file__).resolve().parent
OLD = Path('C:/timerApp/players-091-20261116')
WRITER = Path('C:/timerApp/mobile-network-test-20261117/official-owned-host-22200/status_writer.py')
EXE = Path('C:/Program Files/Warzone 2100/bin/warzone2100.exe')

HOST = '''"""Private stock native QA host. Default invocation is inert; --start is explicit."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json, socket, subprocess, time
from status_writer import save_json

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / 'private' / 'configdir'
EXE = Path('C:/Program Files/Warzone 2100/bin/warzone2100.exe')
PLAN = json.loads((ROOT / 'fixture-plan.json').read_text())
PORT = PLAN['port']

def require(value, message):
    if not value: raise RuntimeError(message)

def prepared():
    require(ROOT.resolve() == Path(PLAN['fixtureRoot']).resolve(), 'Unexpected fixture root')
    require(CONFIG.resolve().is_relative_to(ROOT.resolve()) and not CONFIG.is_symlink(), 'Unsafe private configdir')
    require(hashlib.sha256(EXE.read_bytes()).hexdigest() == PLAN['stockExeSHA256'], 'Stock executable changed')
    text = (CONFIG / 'config').read_text()
    required = ['lobbyserver=https://127.0.0.1:9/lobby', 'gameserver_port='+str(PORT), 'portMapping=0',
                'inactivityMinutesMP=0', 'gameTimeLimitMinutesMP=0', 'hostAutoLagKickSeconds=0', 'hostAutoNotReadyKickSeconds=0']
    require(all(line in text.splitlines() for line in required), 'Unexpected host network/timer settings')
    settings = json.loads((CONFIG / 'autohost' / 'mobile-room').read_text())
    require(settings == PLAN['autohostSettings'], 'Prepared autohost scenario changed')
    require(not settings['challenge']['spectatorHost'] and 'gamePassword' not in settings['challenge'], 'Unexpected host role/password')
    return True

def unused():
    with socket.socket() as s:
        s.settimeout(.25)
        return s.connect_ex(('127.0.0.1', PORT)) != 0

def owned(pid):
    script = "$p=Get-CimInstance Win32_Process -Filter 'ProcessId = %d'; if($p){$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress}" % pid
    out = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], capture_output=True, text=True, timeout=10)
    require(out.returncode == 0 and out.stdout.strip(), 'Cannot verify owned PID')
    info = json.loads(out.stdout)
    require(info['ProcessId'] == pid and Path(info['ExecutablePath']).resolve() == EXE.resolve(), 'Owned PID executable mismatch')
    require('--configdir='+str(CONFIG) in info['CommandLine'] and '--gameport='+str(PORT) in info['CommandLine'], 'Owned PID config/port mismatch')
    return {'pid':pid, 'executable':str(EXE), 'configdir':str(CONFIG), 'port':PORT, 'verified':True}

def run(args):
    prepared()
    if args.request_stop:
        (ROOT / 'stop.request').write_text('Operator requested own client normal leave, then host cleanup.\\n')
        print(json.dumps({'stopRequested':True, 'hostStarted':False, 'port':PORT})); return
    if not args.start:
        print(json.dumps({'prepared':True, 'hostStarted':False, 'role':PLAN['role'], 'port':PORT, 'maxSeconds':600, 'publicRegistration':False, 'mapping':False})); return
    require(60 <= args.max_seconds <= 600, 'Owned fixture lifetime must be60-600seconds')
    require(not (ROOT / 'stop.request').exists(), 'Completed fixture stop sentinel preserved; do not restart blindly')
    require(unused(), 'Owned fixture port in use; no process disturbed')
    claim = ROOT / 'run-claim.json'
    with claim.open('x') as f:
        json.dump({'startedUTC':datetime.now(timezone.utc).isoformat(), 'role':PLAN['role'], 'port':PORT},f)
    # The exclusive claim is lifecycle control, not replaceable telemetry.
    startup = subprocess.STARTUPINFO(); startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW; startup.wShowWindow=0
    command=[str(EXE), '--configdir='+str(CONFIG), '--autohost=mobile-room', '--gameport='+str(PORT), '--portmapping=0',
             '--startplayers='+str(PLAN['startplayers']), '--headless', '--nosound', '--enablelobbyslashcmd', '--debug=net', '--debug=warning', '--flush-debug-stderr']
    status={'startedUTC':datetime.now(timezone.utc).isoformat(), 'state':'starting', 'role':PLAN['role'], 'port':PORT,
            'publicRegistration':False, 'routerOrUPnPChanges':False, 'syntheticDirectoryOnly':True, 'nativeGameplayMocked':False,
            'maxSeconds':args.max_seconds, 'telemetryWriteFailures':0, 'rawLogsPrivate':True}
    def save():
        if not save_json(ROOT/'run-status.json',status): status['telemetryWriteFailures']+=1
    process=None; began=time.monotonic()
    try:
        with (ROOT/'private'/'stdout.log').open('xb') as out, (ROOT/'private'/'stderr.log').open('xb') as err:
            process=subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=out, stderr=err, startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW)
            status['ownedProcess']=owned(process.pid); save()
            while process.poll() is None and time.monotonic()-began < args.max_seconds:
                if (ROOT/'stop.request').exists(): status['stopReason']='operator-stop'; break
                try:
                    listening=not unused(); log=(ROOT/'private'/'stderr.log').read_text(errors='replace')
                    status.update(state='listening' if listening else 'starting', listening=listening,
                                  nativeWorldStarted='startMultiplayerGame' in log,
                                  nativeDataCheckVerified='DataCheck message received and verified' in log)
                except OSError as error:
                    status['observationErrorType']=type(error).__name__
                save()
                if not status.get('listening') and time.monotonic()-began > 35:
                    status['stopReason']='listen-deadline'; break
                time.sleep(1)
            status.setdefault('stopReason','host-exited' if process.poll() is not None else 'bounded-lifetime')
    finally:
        if process is not None and process.poll() is None:
            try:
                # Stock Windows headless has no stdin reader. Never send unsupported readiness/shutdown commands.
                status['cleanupIdentity']=owned(process.pid)
                process.terminate(); process.wait(timeout=10)
                status['cleanup']='verified-owned-PID-terminate'
            except Exception as error:
                status['cleanup']='refused-or-failed-no-other-PID-touched'; status['cleanupErrorType']=type(error).__name__
        elif process is not None: status['cleanup']='host-exited-normally'
        status.update(state='stopped' if process is None or process.poll() is not None else 'cleanup-unverified',
                      finishedUTC=datetime.now(timezone.utc).isoformat(), exitCode=process.poll() if process else None)
        save()
    print(json.dumps(status))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--start',action='store_true'); p.add_argument('--request-stop',action='store_true')
    p.add_argument('--max-seconds',type=int,default=600); a=p.parse_args()
    require(not(a.start and a.request_stop),'Start and stop are separate actions'); run(a)
'''

def main():
    assert ROOT == Path('C:/timerApp/players-polish-092-20261117')
    exe_hash = hashlib.sha256(EXE.read_bytes()).hexdigest()
    for role, port, count in [('player',22203,2),('spectator',22204,1)]:
        target=ROOT/('private-host-'+role)
        assert not target.exists(), 'Preserve existing recipes: '+str(target)
        config=target/'private'/'configdir'; (config/'autohost').mkdir(parents=True)
        old=OLD/('private-host-'+role+'-final')
        old_plan=json.loads((old/'configdir'/'autohost'/'mobile-room').read_text())
        old_plan['challenge']['name']='Private Players092 '+role
        # Keep the proven map/players/AI/normal-ready algorithm exactly; no autogame peer.
        (config/'autohost'/'mobile-room').write_text(json.dumps(old_plan,indent=2)+'\n')
        text='[General]\nplayerName=Room Host\nlobbyserver=https://127.0.0.1:9/lobby\ngameserver_port='+str(port)+'\nportMapping=0\ninactivityMinutesMP=0\ngameTimeLimitMinutesMP=0\nhostingChatDefault=true\nhostAutoLagKickSeconds=0\nhostAutoNotReadyKickSeconds=0\nprefer_ipv6=false\n'
        (config/'config').write_text(text)
        (target/'host.py').write_text(HOST)
        shutil.copyfile(WRITER,target/'status_writer.py')
        plan={'role':role,'port':port,'fixtureRoot':str(target),'stockExeSHA256':exe_hash,'startplayers':count,
              'sourceRecipe':str(old/'host.py'),'autohostSettings':old_plan,'maxLifetimeSeconds':600,
              'noRouterUPnPMapping':True,'publicRegistration':False,'localLobby':'https://127.0.0.1:9/lobby',
              'nativeDataCheckEnabled':True,'noAutogamePeer':True,'directoryMetadataSynthetic':True,'rawLogsConfigPrivate':True}
        (target/'fixture-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
    print('Prepared inert private host templates; nothing launched.')

if __name__=='__main__':main()
